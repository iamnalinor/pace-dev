import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";
import type { ParseDomain } from "./kinds.ts";

import { at, HW_ID } from "../materialize/task-fixture.fake.ts";
import { blankModelAction, type ModelAction, type ModelOutput } from "../parse/schema.ts";
import {
  artboardState,
  BOOKS_ID,
  ctx,
  MOSCOW,
  NOW,
  REPLY_ID,
  WORK_ID,
} from "../queries/fixture.fake.ts";
import { addMinutesIso } from "../time.ts";
import { actionContext, MAX_CONTEXT_TASKS } from "./context.ts";
import { actionsFromModel } from "./from-model.ts";

const minutes = (count: number): string => addMinutesIso(NOW, count);

const timeEvents: readonly Event[] = [
  // The day before yesterday: too old for the list.
  at(900, "2026-10-04T08:00:00.000Z", {
    payload: {
      activityId: "a-old",
      category: "work",
      endAt: "2026-10-04T09:00:00.000Z",
      label: "Old",
      startAt: "2026-10-04T08:00:00.000Z",
    },
    type: "activity.logged",
  }),
  // Yesterday, then today.
  at(901, "2026-10-05T10:00:00.000Z", {
    payload: { activityId: "a-yday", category: "sport", label: "Gym" },
    type: "activity.started",
  }),
  at(902, minutes(-60), {
    payload: { activityId: "a-now", category: "other", label: "Военкомат" },
    type: "activity.started",
  }),
];

const state = artboardState(NOW, timeEvents);
const context = actionContext(state, ctx());

const aliasOf = (id: string): string =>
  context.tasks.find((task) => task.id === id)?.alias ?? "missing";

const read = (
  text: string,
  actions: readonly Partial<ModelAction>[],
  domain: ParseDomain = "task",
) => {
  const output: ModelOutput = {
    actions: actions.map((action) => blankModelAction(action)),
    confidence: 0.9,
    domain,
    questions: [],
  };
  return actionsFromModel(output, { context, ctx: ctx(), domain, state, text });
};

const activity = (text: string, actions: readonly Partial<ModelAction>[]) =>
  read(text, actions, "activity");

describe("actionContext", () => {
  it("names open tasks by index aliases, the latest touched first, and no ids", () => {
    expect(context.tasks.length).toBeLessThanOrEqual(MAX_CONTEXT_TASKS);
    expect(context.tasks.map((task) => task.alias).slice(0, 3)).toEqual(["t1", "t2", "t3"]);
    expect(context.tasks.some((task) => task.id === BOOKS_ID)).toBe(true);
  });

  it("lists yesterday's and today's activities in order, nothing older", () => {
    expect(context.activities.map(({ alias, id }) => [alias, id])).toEqual([
      ["a1", "a-yday"],
      ["a2", "a-now"],
    ]);
  });
});

describe("actionsFromModel: tasks", () => {
  it("fills a create from the model, the rules filling the rest, the message as its source", () => {
    const text = "созвониться с Петей про дашборд в пятницу вечером #Work";
    const { readings } = read(text, [
      {
        category: "work",
        dueDate: "2026-10-09",
        dueTime: "19:00",
        evidence: [{ field: "dueTime", quote: "вечером" }],
        title: "созвониться с Петей про дашборд",
      },
    ]);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      body: {
        kind: "task.create",
        task: {
          dueAt: "2026-10-09T16:00:00.000Z",
          dueTz: MOSCOW,
          importance: null,
          presetId: "work",
          projectId: WORK_ID,
          sourceText: text,
          title: "созвониться с Петей про дашборд",
        },
      },
      // "в пятницу" was not quoted for the date: it is shown to check.
      doubtful: ["dueDate"],
    });
  });

  it("builds a revised create from the request, not from the correction lines", () => {
    const output: ModelOutput = {
      actions: [blankModelAction({ kind: "task.create", title: "Купить молоко" })],
      confidence: 0.9,
      domain: "task",
      questions: [],
    };
    const { readings } = actionsFromModel(output, {
      context,
      ctx: ctx(),
      domain: "task",
      evidence: "Купить молоко\nнет, на пятницу",
      state,
      text: "Купить молоко",
    });
    expect(readings[0]?.body).toMatchObject({
      kind: "task.create",
      task: { description: null, sourceText: "Купить молоко", title: "Купить молоко" },
    });
  });

  it("does not create a project named by the model when it does not exist", () => {
    const { readings } = read("plan the Japan trip", [
      { project: "Japan", title: "plan the Japan trip" },
    ]);
    expect(readings[0]?.body).toMatchObject({
      task: { projectId: null, projectName: null },
    });
  });

  it("keeps a short typed task title even when the model drops its first word", () => {
    for (const [text, shortened] of [
      ["Написать челику", "челику"],
      ["ДЗ по алгебре", "по алгебре"],
    ] as const) {
      const { readings } = read(text, [
        { title: shortened, description: text.split(" ", 1)[0] ?? "" },
      ]);
      expect(readings[0]?.body).toMatchObject({
        task: { title: text, description: null },
      });
    }
  });

  it("keeps the current project when an edit names an unknown one", () => {
    const { readings, rejected } = read("move the books to Japan", [
      { kind: "task.update", project: "Japan", task: aliasOf(BOOKS_ID) },
    ]);
    expect(readings).toEqual([]);
    expect(rejected).toMatchObject([{ reason: "action/incomplete" }]);
  });

  it("maps an edit's alias to the task and its fields to a patch", () => {
    const text = "перенеси книги на пятницу и сделай важным, убери оценку";
    const { readings } = read(text, [
      {
        clear: ["estimateMinutes"],
        dueDate: "2026-10-09",
        importance: "prioritized",
        kind: "task.update",
        task: aliasOf(BOOKS_ID),
      },
    ]);
    expect(readings[0]?.body).toEqual({
      kind: "task.update",
      patch: {
        due: { at: "2026-10-09T20:59:00.000Z", tz: MOSCOW },
        estimateMinutes: null,
        importance: "prioritized",
      },
      taskId: BOOKS_ID,
    });
  });

  it("sets a link the message gives, and clears one it asks to drop", () => {
    const link = "https://tracker.example.com/T-1";
    const set = read(`к книгам ссылка ${link}`, [
      { evidence: [], kind: "task.update", link, task: aliasOf(BOOKS_ID) },
    ]);
    expect(set.readings[0]).toEqual({
      body: { kind: "task.update", patch: { link }, taskId: BOOKS_ID },
      doubtful: [],
    });
    const cleared = read("у книг убери ссылку", [
      { clear: ["link"], kind: "task.update", task: aliasOf(BOOKS_ID) },
    ]);
    expect(cleared.readings[0]?.body).toMatchObject({ patch: { link: null } });
    const invented = read("книги", [{ kind: "task.update", link, task: aliasOf(BOOKS_ID) }]);
    expect(invented.readings[0]?.doubtful).toEqual(["link"]);
    const created = read(`отчёт ${link}`, [{ kind: "task.create", link, title: "отчёт" }]);
    expect(created.readings[0]?.body).toMatchObject({ task: { link } });
  });

  it("reads subtasks by label or number for marking, removing and renaming", () => {
    const hw = aliasOf(HW_ID);
    const { readings } = read("в алгебре решил 5 и 6, убери 7a Bonus, 4 переименуй в Det", [
      { kind: "task.markSubtasks", subtaskRefs: ["5", "Block matrices", "99"], task: hw },
      {
        kind: "task.update",
        renames: [{ label: "Det", subtask: "4" }],
        subtaskRefs: ["7a bonus"],
        task: hw,
      },
    ]);
    expect(readings.map((reading) => reading.body)).toEqual([
      { kind: "task.markSubtasks", subtaskIds: ["s5", "s6"], taskId: HW_ID },
      {
        kind: "task.update",
        patch: { subtasks: { remove: ["s7"], rename: [{ label: "Det", subtaskId: "s4" }] } },
        taskId: HW_ID,
      },
    ]);
  });

  it("closes, deletes and adds to a task by its alias", () => {
    const { readings } = read("ответил куратору; книги удали; в алгебру добавь 8", [
      { kind: "task.close", outcome: null, task: aliasOf(REPLY_ID) },
      { kind: "task.delete", quote: "Return library books", task: aliasOf(BOOKS_ID) },
      { kind: "task.addSubtasks", subtasks: [{ label: "8", number: 8 }], task: aliasOf(HW_ID) },
    ]);
    expect(readings.map((reading) => reading.body)).toEqual([
      { kind: "task.close", outcome: "done", taskId: REPLY_ID },
      { kind: "task.delete", taskId: BOOKS_ID },
      { kind: "task.addSubtasks", subtasks: [{ label: "8", number: 8 }], taskId: HW_ID },
    ]);
  });

  it("leaves out unknown aliases, unquoted deletes, empty edits and the other domain", () => {
    const { readings, rejected } = read("всякое", [
      { kind: "task.close", task: "t999" },
      { kind: "task.delete", quote: "something else", task: aliasOf(BOOKS_ID) },
      { kind: "task.update", task: aliasOf(BOOKS_ID) },
      { kind: "task.markSubtasks", subtaskRefs: ["99"], task: aliasOf(HW_ID) },
      { kind: "activity.start", label: "Чтение" },
    ]);
    expect(readings).toEqual([]);
    expect(rejected.map(({ index, reason }) => [index, reason])).toEqual([
      [0, "action/unknown-task"],
      [1, "action/unquoted-delete"],
      [2, "action/incomplete"],
      [3, "action/incomplete"],
      [4, "action/other-domain"],
    ]);
  });
});

describe("actionsFromModel: activities", () => {
  it("reads a past block on the account's clock", () => {
    const { readings } = activity("7:30 - 8:30 - ходил в военкомат.", [
      {
        category: "other",
        end: "2026-10-06 08:30",
        evidence: [
          { field: "start", quote: "7:30" },
          { field: "end", quote: "8:30" },
        ],
        kind: "activity.log",
        label: "Военкомат",
        start: "2026-10-06 07:30",
      },
    ]);
    expect(readings).toEqual([
      {
        body: {
          category: "other",
          end: "2026-10-06T05:30:00.000Z",
          kind: "activity.log",
          label: "Военкомат",
          start: "2026-10-06T04:30:00.000Z",
        },
        doubtful: [],
      },
    ]);
  });

  it("starts with the typed words and the label's own category when the model gave none", () => {
    const { readings } = activity("военкомат", [{ kind: "activity.start" }]);
    expect(readings[0]?.body).toEqual({
      category: "other",
      expectMinutes: null,
      kind: "activity.start",
      label: "военкомат",
    });
  });

  it("edits and deletes an activity by its alias", () => {
    const { readings } = activity("военкомат был до 12, а спортзал вчера удали", [
      {
        activity: "a2",
        end: "2026-10-06 12:00",
        evidence: [{ field: "end", quote: "до 12" }],
        kind: "activity.update",
      },
      { activity: "a1", kind: "activity.delete", quote: "Gym" },
    ]);
    expect(readings.map((reading) => reading.body)).toEqual([
      { activityId: "a-now", kind: "activity.update", patch: { end: "2026-10-06T09:00:00.000Z" } },
      { activityId: "a-yday", kind: "activity.delete" },
    ]);
  });

  it("leaves out a log without both ends, a bad time and an unknown alias", () => {
    const { rejected } = activity("x", [
      { kind: "activity.log", start: "2026-10-06 07:30" },
      { kind: "activity.log", end: "2026-10-06 25:00", start: "2026-10-06 07:30" },
      { activity: "a7", kind: "activity.update", label: "y" },
      { kind: "task.create", title: "x" },
    ]);
    expect(rejected.map(({ reason }) => reason)).toEqual([
      "action/incomplete",
      "action/bad-time",
      "action/unknown-activity",
      "action/other-domain",
    ]);
  });
});
