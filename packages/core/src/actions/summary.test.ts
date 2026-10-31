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
    expect(en({ kind: "task.delete", taskId: BOOKS_ID })).toBe(
      "The assistant will delete “Return library books”",
    );
    expect(ru({ kind: "task.delete", taskId: BOOKS_ID })).toBe(
      "Ассистент удалит «Return library books»",
    );
    expect(en({ kind: "task.close", outcome: "done", taskId: BOOKS_ID })).toBe(
      "The assistant will close “Return library books” as Done",
    );
    expect(
      en({
        kind: "task.update",
        patch: { due: null, projectName: "X", title: "Y" },
        taskId: BOOKS_ID,
      }),
    ).toBe("The assistant will change “Return library books”: title, due date, project");
    expect(en({ kind: "task.markSubtasks", subtaskIds: ["s5", "s6"], taskId: HW_ID })).toBe(
      "The assistant will mark solved in “Algebra HW 6”: Kronecker–Capelli, Block matrices",
    );
    expect(
      en({ kind: "task.addSubtasks", subtasks: [{ label: "8", number: 8 }], taskId: HW_ID }),
    ).toBe("The assistant will add to “Algebra HW 6”: 8");
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
    ).toBe("Ассистент запишет «Военкомат», 07:30–08:30");
    expect(
      en({
        category: "other",
        end: "2026-10-05T19:00:00.000Z",
        kind: "activity.log",
        label: "Gym",
        start: "2026-10-05T18:00:00.000Z",
      }),
    ).toBe("The assistant will log “Gym”, 05.10 21:00–05.10 22:00");
    expect(en({ category: "rest", kind: "activity.start", label: "Nap" })).toBe(
      "The assistant will start “Nap”",
    );
    expect(
      en({
        category: "rest",
        kind: "activity.start",
        label: "Nap",
        startAt: "2026-10-06T08:30:00.000Z",
      }),
    ).toBe("The assistant will start “Nap” from 11:30");
    expect(
      en({ activityId: "a-1", kind: "activity.update", patch: { end: NOW, label: "Deep work" } }),
    ).toBe("The assistant will change “Work”: end, name");
    expect(en({ activityId: "a-1", kind: "activity.delete" })).toBe(
      "The assistant will delete “Work”, 09:00–10:00",
    );
  });

  it("says what a rename makes of the name, as the log does (QA round 14 M1)", () => {
    expect(en({ kind: "task.update", patch: { title: "Return them" }, taskId: BOOKS_ID })).toBe(
      "The assistant will rename “Return library books” to “Return them”",
    );
    expect(ru({ kind: "task.update", patch: { title: "Вернуть" }, taskId: BOOKS_ID })).toBe(
      "Ассистент переименует «Return library books» в «Вернуть»",
    );
    expect(en({ activityId: "a-1", kind: "activity.update", patch: { label: "Deep work" } })).toBe(
      "The assistant will rename “Work” to “Deep work”",
    );
    expect(ru({ activityId: "a-1", kind: "activity.update", patch: { label: "Учёба" } })).toBe(
      "Ассистент переименует «Work» в «Учёба»",
    );
  });

  it("deletes a running activity as running since its start, not a half-open range", () => {
    const running = artboardState(NOW, [
      at(900, "2026-10-06T06:00:00.000Z", {
        payload: { activityId: "a-run", category: "rest", label: "Walk" },
        type: "activity.started",
      }),
    ]);
    const world = { now: NOW, state: running, zone: MOSCOW };
    expect(
      summarize({ activityId: "a-run", kind: "activity.delete" }, { ...world, language: "en" }),
    ).toBe("The assistant will delete “Walk”, running since 09:00");
    expect(
      summarize({ activityId: "a-run", kind: "activity.delete" }, { ...world, language: "ru" }),
    ).toBe("Ассистент удалит «Walk», идёт с 09:00");
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
    ).toEqual({
      ...body,
      doubtful: ["estimateMinutes"],
      summary: "Ассистент создаст «Разобрать почту»",
    });
    expect(
      withSummary(body, [], { language: "en", now: NOW, state, zone: MOSCOW }),
    ).not.toHaveProperty("doubtful");
  });
});
