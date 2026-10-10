import { describe, expect, it } from "vitest";

import {
  artboardState,
  BOOKS_ID,
  ctx,
  HW_DUE,
  HW_ID,
  HW_VIEW_NOW,
  sheetId,
  TRK_DUE,
  TRK_ID,
  TRK_NOW,
  WORK_ID,
} from "@pace/core/testing";

import { type TaskViewModel, taskViewModel } from "./task.ts";

const view = (taskId: string, now: string, deviceTz?: string): TaskViewModel => {
  const result = taskViewModel(artboardState(now), taskId, ctx(now, deviceTz));
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

describe("taskViewModel", () => {
  it("takes the link from the description when none was set", () => {
    const at = TRK_NOW;
    const state = artboardState(at);
    const task = state.tasks.byId[BOOKS_ID];
    if (task === undefined) {
      throw new Error("fixture lost the books task");
    }
    const withDescription = {
      ...state,
      tasks: {
        byId: {
          ...state.tasks.byId,
          [BOOKS_ID]: { ...task, description: "renew at https://library.example.org/renew." },
        },
      },
    };
    const result = taskViewModel(withDescription, BOOKS_ID, ctx(at));
    expect(result.ok && result.value.link).toEqual({
      host: "library.example.org",
      url: "https://library.example.org/renew",
    });
  });

  it("shows TRK-231 on Thursday: tags, stats, the why rows and Done as the primary action", () => {
    const trk = view(TRK_ID, TRK_NOW, "UTC");
    expect(trk).toMatchObject({
      description: "p99 check fails ~1 in 5 runs on the shared runner.",
      id: TRK_ID,
      project: { id: WORK_ID, name: "Work" },
      link: { host: "tracker.example.com", url: "https://tracker.example.com/browse/TRK-231" },
      title: "Flaky latency test in nightly",
    });
    expect(trk.tags).toEqual([
      { importance: "prioritized", kind: "importance" },
      { kind: "status", status: "in_progress" },
    ]);
    expect(trk.stats).toMatchObject({
      dueAt: TRK_DUE,
      dueTz: "UTC",
      dueZoneDiffers: false,
      estimateMinutes: 480,
      trackedMinutes: 0,
      workLeftMinutes: 288,
    });
    expect(trk.progress).toMatchObject({ mode: "slider", slider: 4 });
    expect(trk.progress.value).toBeCloseTo(0.4, 10);
    expect(trk.primaryAction).toEqual({ kind: "done" });
    expect(trk.problems).toEqual([]);
    expect(trk.outcome).toBeNull();
  });

  it("shows Algebra HW 6 on Wednesday: the problems, Submit 3 and 4, and the quick times", () => {
    const hw = view(HW_ID, HW_VIEW_NOW);
    expect(hw.problems.map((problem) => [problem.number, problem.state])).toEqual([
      [1, "submitted"],
      [2, "submitted"],
      [3, "solved"],
      [4, "solved"],
      [5, "pending"],
      [6, "pending"],
      [null, "pending"],
    ]);
    expect(hw.problems[0]).toMatchObject({
      label: "Matrix rank",
      solvedAt: "2026-10-05T12:00:00.000Z",
      submittedAt: "2026-10-05T13:00:00.000Z",
    });
    expect(hw.primaryAction).toEqual({ kind: "submit", subtaskIds: ["s3", "s4"] });
    expect(hw.quickTimes.map((entry) => entry.key)).toEqual([
      "now",
      "hour-ago",
      "yesterday-evening",
      "at-deadline",
    ]);
    expect(hw.quickTimes.at(-1)?.at).toBe(HW_DUE);
    expect(hw.stats.workLeftMinutes).toBe(103);
    expect(hw.progress).toMatchObject({ mode: "subtasks", slider: null });
    expect(hw.tags).toEqual([
      { importance: "normal", kind: "importance" },
      { kind: "status", status: "in_progress" },
      { kind: "submission", submission: "per_subtask" },
    ]);
  });

  it("prepares the override sheet with the effective values and what the task set itself", () => {
    const hw = view(HW_ID, HW_VIEW_NOW);
    expect(hw.overrideSheet).toMatchObject({
      dueAt: HW_DUE,
      estimateMinutes: 240,
      importance: "normal",
      isEstimateOwn: true,
      isImportanceOwn: false,
      overrides: null,
      presetId: "hw.algebra",
      presetName: "Algebra HW",
    });
    expect(hw.overrideSheet.presets.map((preset) => preset.id)).toEqual([
      "hw",
      "work",
      "personal",
      "deferred",
      "inbox",
      "hw.algebra",
      "hw.calculus",
      "hw.history",
    ]);
    const books = view(BOOKS_ID, HW_VIEW_NOW);
    expect(books.overrideSheet).toMatchObject({
      dueAt: null,
      estimateMinutes: 30,
      isEstimateOwn: false,
      isImportanceOwn: true,
    });
    expect(books.quickTimes).toHaveLength(3);
  });

  it("has no action and an outcome for a closed task, and reports unknown ids", () => {
    const sheet = view(sheetId(3), HW_VIEW_NOW);
    expect(sheet.primaryAction).toEqual({ kind: "none" });
    expect(sheet.outcome).toBe("done_late");
    // Closed: its outcome instead of a status, and no work left.
    expect(sheet.tags).toContainEqual({ kind: "outcome", outcome: "done_late" });
    expect(sheet.tags.some((tag) => tag.kind === "status")).toBe(false);
    expect(sheet.stats.workLeftMinutes).toBe(0);
    expect(taskViewModel(artboardState(), "t-nope", ctx())).toEqual({
      error: "task/unknown",
      ok: false,
    });
  });
});
