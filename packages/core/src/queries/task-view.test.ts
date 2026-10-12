import { describe, expect, it } from "vitest";

import { at, HW_ID, TRK_ID, TRK_NOW } from "../materialize/task-fixture.fake.ts";
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

describe("taskView", () => {
  it("shows TRK-231 on Thursday: progress 40 % of an 8 h estimate", () => {
    const trk = view(TRK_ID, TRK_NOW, "UTC");
    expect(trk.project?.id).toBe(WORK_ID);
    expect(trk.importance).toBe("prioritized");
    expect(trk.status).toBe("in_progress");
    // 8 h estimate at 40 %: 4 h 48 min left.
    expect(trk.workLeftMinutes).toBe(288);
    expect(trk.trackedMinutes).toBe(0);
    expect(trk.submitPreview).toEqual({ kind: "whole", canClose: true });
  });

  it("tells when the due date was set in another zone than the device's", () => {
    expect(view(TRK_ID, TRK_NOW, "UTC").dueZoneDiffers).toBe(false);
    expect(view(TRK_ID, TRK_NOW).dueZoneDiffers).toBe(true);
    expect(view(HW_ID, HW_VIEW_NOW).dueZoneDiffers).toBe(false);
    expect(view(BOOKS_ID, NOW, "UTC").dueZoneDiffers).toBe(false);
  });

  it("shows Algebra HW 6 on Wednesday: ~1 h 40 m left, submit 3 and 4", () => {
    const hw = view(HW_ID, HW_VIEW_NOW);
    expect(hw.preset.submission).toBe("per_subtask");
    expect(hw.status).toBe("in_progress");
    // 4 h estimate, 4 of 7 solved: 240 × 3/7 = 102.86 → 103 min, shown as "~1h 40m".
    expect(hw.workLeftMinutes).toBe(103);
    expect(hw.submitPreview).toEqual({ kind: "per_subtask", subtaskIds: ["s3", "s4"] });
  });

  it("falls back to the preset's estimate and reads an old waiting status as in progress", () => {
    expect(view(BOOKS_ID, NOW).workLeftMinutes).toBe(30);
    expect(view(DEMO_ID, NOW).status).toBe("in_progress");
  });

  it("has nothing to close for a closed task", () => {
    const sheet = view(sheetId(1), NOW);
    // The closed sheet has no subtasks, so it is tracked and closed as a whole.
    expect(sheet.submitPreview).toEqual({ canClose: false, kind: "whole" });
    const state = artboardState(NOW, [
      at(84, "2026-10-06T10:00:00.000Z", {
        type: "task.closed",
        payload: { taskId: BOOKS_ID, outcome: "done" },
      }),
    ]);
    const books = taskView(state, BOOKS_ID, ctx());
    expect(books.ok && books.value.submitPreview).toEqual({ kind: "whole", canClose: false });
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
