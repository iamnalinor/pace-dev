import { describe, expect, it } from "vitest";

import type { ExplainKey } from "../urgency/trace.ts";

import { at, HW_ID, TRK_ID } from "../materialize/task-fixture.fake.ts";
import { TRK_NOW } from "../urgency/fixture.fake.ts";
import {
  artboardState,
  BOOKS_ID,
  ctx,
  DEMO_ID,
  HW_VIEW_NOW,
  NOW,
  sheetId,
  WORK_ID,
} from "./fixture.fake.ts";
import { type TaskView, taskView } from "./task-view.ts";

const view = (taskId: string, now: string, deviceTz?: string): TaskView => {
  const result = taskView(artboardState(now), taskId, ctx(now, deviceTz));
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const inputValue = (why: TaskView["explanation"], key: ExplainKey) =>
  why.inputs.find((row) => row.key === key)?.value;
const stepValue = (why: TaskView["explanation"], key: ExplainKey) =>
  why.steps.find((row) => row.key === key)?.value;

describe("taskView", () => {
  it("shows TRK-231 on Thursday: window 65 %, progress 40 %, rank 2 of 3 and the why rows", () => {
    const trk = view(TRK_ID, TRK_NOW, "UTC");
    expect(trk.project?.id).toBe(WORK_ID);
    expect(trk.importance).toBe("prioritized");
    expect(trk.status).toBe("in_progress");
    expect(trk.windowElapsed).toBeCloseTo(0.65, 10);
    expect(trk.rank).toEqual({ position: 2, size: 3 });
    // 8 h estimate at 40 %: 4 h 48 min left.
    expect(trk.workLeftMinutes).toBe(288);
    expect(trk.trackedMinutes).toBe(0);
    expect(trk.explanation.policy).toBe("lag");
    expect(inputValue(trk.explanation, "windowElapsed")).toBeCloseTo(65, 10);
    expect(inputValue(trk.explanation, "progress")).toBeCloseTo(40, 10);
    expect(inputValue(trk.explanation, "multiplier")).toBe(5);
    expect(inputValue(trk.explanation, "rank")).toBe(2);
    expect(inputValue(trk.explanation, "rankSize")).toBe(3);
    expect(stepValue(trk.explanation, "behindPace")).toBeCloseTo(0.25, 10);
    expect(stepValue(trk.explanation, "score")).toBeCloseTo(3.158, 3);
    expect(trk.submitPreview).toEqual({ kind: "whole", canClose: true });
  });

  it("tells when the due date was set in another zone than the device's", () => {
    expect(view(TRK_ID, TRK_NOW, "UTC").dueZoneDiffers).toBe(false);
    expect(view(TRK_ID, TRK_NOW).dueZoneDiffers).toBe(true);
    expect(view(HW_ID, HW_VIEW_NOW).dueZoneDiffers).toBe(false);
    expect(view(BOOKS_ID, NOW, "UTC").dueZoneDiffers).toBe(false);
  });

  it("shows Algebra HW 6 on Wednesday: 82 % of the window gone, ~1 h 40 m left, submit 3 and 4", () => {
    const hw = view(HW_ID, HW_VIEW_NOW);
    expect(hw.preset.submission).toBe("per_subtask");
    expect(hw.status).toBe("in_progress");
    expect(hw.windowElapsed).toBeCloseTo(0.82, 2);
    // 4 h estimate, 4 of 7 solved: 240 × 3/7 = 102.86 → 103 min, shown as "~1h 40m".
    expect(hw.workLeftMinutes).toBe(103);
    expect(hw.submitPreview).toEqual({ kind: "per_subtask", subtaskIds: ["s3", "s4"] });
    expect(hw.explanation.policy).toBe("resubmission");
    expect(hw.rank).toEqual({ position: 2, size: 2 });
  });

  it("has no window without a due and freezes a waiting task's clock", () => {
    const books = view(BOOKS_ID, NOW);
    expect(books.windowElapsed).toBeNull();
    expect(books.rank).toEqual({ position: 1, size: 5 });
    expect(books.workLeftMinutes).toBe(30);
    const demo = view(DEMO_ID, NOW);
    expect(demo.status).toBe("waiting");
    expect(inputValue(demo.explanation, "waitingSince")).toBe("2026-10-06T09:00:00.000Z");
    expect(demo.explanation.score.frozenAt).toBe("2026-10-06T09:00:00.000Z");
  });

  it("has no rank and nothing to close for a closed task", () => {
    const sheet = view(sheetId(1), NOW);
    expect(sheet.rank).toBeNull();
    expect(sheet.submitPreview).toEqual({ kind: "per_subtask", subtaskIds: [] });
    const state = artboardState(NOW, [
      at(84, "2026-10-06T10:00:00.000Z", {
        type: "task.closed",
        payload: { taskId: BOOKS_ID, outcome: "done" },
      }),
    ]);
    const books = taskView(state, BOOKS_ID, ctx());
    expect(books.ok && books.value.submitPreview).toEqual({ kind: "whole", canClose: false });
    expect(books.ok && books.value.rank).toBeNull();
  });

  it("rejects an unknown task and a broken preset", () => {
    expect(taskView(artboardState(), "t-nope", ctx())).toEqual({
      ok: false,
      error: "task/unknown",
    });
    const state = artboardState(NOW, [
      at(83, "2026-10-06T10:00:00.000Z", {
        type: "task.created",
        payload: {
          taskId: "t-broken",
          title: "Broken",
          presetId: "nope",
          subtasks: [],
          fields: {},
        },
      }),
    ]);
    expect(taskView(state, "t-broken", ctx())).toEqual({ ok: false, error: "preset/unknown" });
  });
});
