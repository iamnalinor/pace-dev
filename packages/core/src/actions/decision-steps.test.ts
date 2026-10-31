import { describe, expect, it } from "vitest";

import { decisionStepOf, readDecisionInputs, resolutionsOf } from "./decision-steps.ts";

const draft = {
  description: null,
  dueAt: null,
  dueTz: null,
  estimateMinutes: null,
  importance: null,
  link: null,
  presetId: "personal",
  projectId: null,
  projectName: null,
  sourceText: "buy cable",
  subtasks: [],
  title: "Buy cable",
};

const step = {
  activityId: null,
  closeOutcome: null,
  fields: [],
  startAt: null,
  subject: null,
  taskId: null,
};

describe("decisionStepOf", () => {
  it("keeps what a later reader needs to say an action in words", () => {
    expect(decisionStepOf({ kind: "task.create", task: draft })).toEqual({
      ...step,
      kind: "task.create",
      subject: "Buy cable",
    });
    expect(
      decisionStepOf({
        kind: "task.update",
        patch: { due: { at: "2026-10-31T20:59:00.000Z", tz: "Europe/Moscow" }, title: "X" },
        taskId: "t1",
      }),
    ).toEqual({ ...step, fields: ["title", "dueDate"], kind: "task.update", taskId: "t1" });
    expect(decisionStepOf({ kind: "task.close", outcome: "cancelled", taskId: "t1" })).toEqual({
      ...step,
      closeOutcome: "cancelled",
      kind: "task.close",
      taskId: "t1",
    });
    expect(
      decisionStepOf({
        category: "sport",
        kind: "activity.start",
        label: "Gym",
        startAt: "2026-10-31T07:30:00.000Z",
      }),
    ).toEqual({
      ...step,
      kind: "activity.start",
      startAt: "2026-10-31T07:30:00.000Z",
      subject: "Gym",
    });
    expect(
      decisionStepOf({
        category: "other",
        end: "2026-10-31T08:30:00.000Z",
        kind: "activity.log",
        label: "Walk",
        start: "2026-10-31T07:30:00.000Z",
      }),
    ).toMatchObject({ startAt: "2026-10-31T07:30:00.000Z", subject: "Walk" });
    expect(
      decisionStepOf({ activityId: "a1", kind: "activity.update", patch: { label: "Run" } }),
    ).toEqual({ ...step, activityId: "a1", fields: ["label"], kind: "activity.update" });
    expect(decisionStepOf({ activityId: "a1", kind: "activity.delete" })).toEqual({
      ...step,
      activityId: "a1",
      kind: "activity.delete",
    });
  });
});

describe("readDecisionInputs", () => {
  it("reads what a parse decision recorded", () => {
    expect(
      readDecisionInputs({
        actions: ["The assistant will create “Buy cable”"],
        doubtful: ["project", "subtasks"],
        provider: "gpt-5.6-luna",
        steps: [{ ...step, kind: "task.create", subject: "Buy cable" }],
        text: "buy cable",
      }),
    ).toEqual({
      doubtful: ["project", "subtasks"],
      provider: "gpt-5.6-luna",
      steps: [{ ...step, kind: "task.create", subject: "Buy cable" }],
      summaries: ["The assistant will create “Buy cable”"],
      text: "buy cable",
    });
  });

  it("reads anything else as empty, dropping what this client has no word for", () => {
    const empty = { doubtful: [], provider: null, steps: [], summaries: [], text: null };
    expect(readDecisionInputs(null)).toEqual(empty);
    expect(readDecisionInputs("text")).toEqual(empty);
    expect(readDecisionInputs({})).toEqual(empty);
    expect(
      readDecisionInputs({
        actions: [1, "Kept"],
        doubtful: ["project", "mood"],
        provider: 3,
        steps: [{ ...step, kind: "task.teleport" }, { kind: "task.delete" }],
        text: "x",
      }),
    ).toEqual({
      ...empty,
      doubtful: ["project"],
      // An unreadable step keeps its place, so the next one still pairs with its summary.
      steps: [null, { ...step, kind: "task.delete" }],
      summaries: ["Kept"],
      text: "x",
    });
  });
});

describe("resolutionsOf", () => {
  it("answers the last reading of a conversation; the earlier ones were corrected", () => {
    expect(resolutionsOf(["d1", "d2", "d3"], "approved", "t1")).toEqual([
      { id: "d1", resolution: "corrected" },
      { id: "d2", resolution: "corrected" },
      { id: "d3", resolution: "approved", taskId: "t1" },
    ]);
    expect(resolutionsOf(["d1"], "cancelled", null)).toEqual([
      { id: "d1", resolution: "cancelled" },
    ]);
    expect(resolutionsOf([], "inbox", null)).toEqual([]);
  });

  it("names at most the ten readings a request may carry, the last always", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `d${String(index)}`);
    const answered = resolutionsOf(ids, "approved", null);
    expect(answered).toHaveLength(10);
    expect(answered.at(-1)).toEqual({ id: "d11", resolution: "approved" });
  });
});
