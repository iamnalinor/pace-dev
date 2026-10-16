import { describe, expect, it } from "vitest";

import type { ActionBody } from "./schema.ts";

import { at, HW_ID } from "../materialize/task-fixture.fake.ts";
import { artboardState, BOOKS_ID, MOSCOW, NOW } from "../queries/fixture.fake.ts";
import { summarize, withSummary } from "./summary.ts";

const state = artboardState(NOW, [
  at(900, "2026-10-06T06:00:00.000Z", {
    payload: { activityId: "a-1", category: "work", label: "Work" },
    type: "activity.started",
  }),
  at(901, "2026-10-06T07:00:00.000Z", { payload: { activityId: "a-1" }, type: "activity.stopped" }),
]);

const en = (body: ActionBody) => summarize(body, { language: "en", now: NOW, state, zone: MOSCOW });
const ru = (body: ActionBody) => summarize(body, { language: "ru", now: NOW, state, zone: MOSCOW });

describe("summarize", () => {
  it("says what each task action does, by the task's title", () => {
    expect(en({ kind: "task.delete", taskId: BOOKS_ID })).toBe("Delete “Return library books”");
    expect(ru({ kind: "task.delete", taskId: BOOKS_ID })).toBe("Удалить «Return library books»");
    expect(en({ kind: "task.close", outcome: "done", taskId: BOOKS_ID })).toBe(
      "Close “Return library books” as Done",
    );
    expect(
      en({
        kind: "task.update",
        patch: { due: null, projectName: "X", title: "Y" },
        taskId: BOOKS_ID,
      }),
    ).toBe("Change “Return library books”: title, due date, project");
    expect(en({ kind: "task.markSubtasks", subtaskIds: ["s5", "s6"], taskId: HW_ID })).toBe(
      "Mark solved in “Algebra HW 6”: Kronecker–Capelli, Block matrices",
    );
    expect(
      en({ kind: "task.addSubtasks", subtasks: [{ label: "8", number: 8 }], taskId: HW_ID }),
    ).toBe("Add to “Algebra HW 6”: 8");
  });

  it("says what each activity action does, with times on the account's clock", () => {
    expect(
      ru({
        category: "other",
        end: "2026-10-06T05:30:00.000Z",
        kind: "activity.log",
        label: "Военкомат",
        start: "2026-10-06T04:30:00.000Z",
      }),
    ).toBe("Записать: Военкомат, 07:30–08:30");
    expect(
      en({
        category: "other",
        end: "2026-10-05T19:00:00.000Z",
        kind: "activity.log",
        label: "Gym",
        start: "2026-10-05T18:00:00.000Z",
      }),
    ).toBe("Log: Gym, 05.10 21:00–05.10 22:00");
    expect(en({ category: "rest", kind: "activity.start", label: "Nap" })).toBe("Start: Nap");
    expect(
      en({
        category: "rest",
        kind: "activity.start",
        label: "Nap",
        startAt: "2026-10-06T08:30:00.000Z",
      }),
    ).toBe("Start: Nap, since 11:30");
    expect(
      en({ activityId: "a-1", kind: "activity.update", patch: { end: NOW, label: "Deep work" } }),
    ).toBe("Change “Work”: end, name");
    expect(en({ activityId: "a-1", kind: "activity.delete" })).toBe("Delete “Work”, 09:00–10:00");
  });

  it("names a new task by its title, and marks doubtful fields on the answer", () => {
    const body: ActionBody = {
      kind: "task.create",
      task: {
        description: null,
        dueAt: null,
        dueTz: null,
        estimateMinutes: 90,
        importance: null,
        link: null,
        presetId: "personal",
        projectId: null,
        projectName: null,
        sourceText: "x",
        subtasks: [],
        title: "Разобрать почту",
      },
    };
    expect(
      withSummary(body, ["estimateMinutes"], { language: "ru", now: NOW, state, zone: MOSCOW }),
    ).toEqual({ ...body, doubtful: ["estimateMinutes"], summary: "Новая задача: Разобрать почту" });
    expect(
      withSummary(body, [], { language: "en", now: NOW, state, zone: MOSCOW }),
    ).not.toHaveProperty("doubtful");
  });
});
