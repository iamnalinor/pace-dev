import { describe, expect, it } from "vitest";

import type { CoreState } from "../materialize/core-state.ts";

import {
  at,
  HW_CREATED,
  HW_DUE,
  HW_ID,
  solved,
  submitted,
  TRK_ID,
} from "../materialize/task-fixture.fake.ts";
import { type Task, taskById } from "../model/task.ts";
import {
  artboardState,
  BOOKS_ID,
  CALC_HW5_ID,
  CALC_W41_ID,
  ctx,
  DEFERRED_IDS,
  DEMO_ID,
  INBOX_CABLE_ID,
  MOSCOW,
  NOW,
  RFC_ID,
  sheetId,
} from "./fixture.fake.ts";
import { rankWithinCategory, urgencyInputFor } from "./urgency-input.ts";

const task = (state: CoreState, id: string): Task => {
  const found = taskById(state.tasks, id);
  if (found === undefined) {
    throw new Error(`fixture task ${id} missing`);
  }
  return found;
};

const inputOf = (state: CoreState, id: string) => {
  const result = urgencyInputFor(state, task(state, id), ctx(), null);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

describe("urgencyInputFor", () => {
  it("maps Algebra HW 6 with its resolved course preset", () => {
    const state = artboardState();
    expect(inputOf(state, HW_ID)).toEqual({
      importance: "normal",
      importanceSetAt: null,
      policy: "resubmission",
      createdAt: HW_CREATED,
      startAt: null,
      dueAt: HW_DUE,
      deadline: { kind: "resubmission", softDays: 7, finalAt: null, finalTz: null },
      progress: 4 / 7,
      // After the due date only the five unsubmitted problems count: two of them are solved.
      remaining: { progress: 2 / 5, estimateHours: (5 / 7) * 4 },
      estimateHours: 4,
      calibration: 1,
      waitingSince: null,
      rank: null,
      accountTz: MOSCOW,
    });
  });

  it("uses the whole-task values as the remainder when progress is not per subtask", () => {
    const input = inputOf(artboardState(), TRK_ID);
    expect(input.policy).toBe("lag");
    expect(input.importance).toBe("prioritized");
    expect(input.importanceSetAt).toBe("2026-10-05T09:00:00.000Z");
    expect(input.progress).toBeCloseTo(0.4, 10);
    expect(input.remaining).toEqual({ progress: 0.4, estimateHours: 8 });
  });

  it("has nothing remaining once every problem is sent", () => {
    const state = artboardState(NOW, [
      solved(60, "2026-10-06T09:00:00.000Z", "s5"),
      solved(61, "2026-10-06T09:00:00.000Z", "s6"),
      solved(62, "2026-10-06T09:00:00.000Z", "s7"),
      submitted(63, "2026-10-06T09:30:00.000Z", { subtaskIds: ["s3", "s4", "s5", "s6", "s7"] }),
    ]);
    expect(inputOf(state, HW_ID).remaining).toEqual({ progress: 1, estimateHours: 0 });
  });

  it("freezes the clock at the start of a waiting spell", () => {
    expect(inputOf(artboardState(), DEMO_ID).waitingSince).toBe("2026-10-06T09:00:00.000Z");
  });

  it("falls back to the preset's default estimate and importance", () => {
    const input = inputOf(artboardState(), CALC_HW5_ID);
    expect(input.estimateHours).toBe(1);
    expect(input.importance).toBe("normal");
    expect(input.policy).toBe("pace");
    expect(input.deadline).toEqual({ kind: "hard" });
  });

  it("applies the task's overrides on top of the preset", () => {
    const state = artboardState(NOW, [
      at(64, "2026-10-06T10:00:00.000Z", {
        type: "task.overrides.set",
        payload: {
          taskId: CALC_HW5_ID,
          overrides: { urgencyPolicy: "age", defaultEstimateMinutes: 90 },
        },
      }),
    ]);
    const input = inputOf(state, CALC_HW5_ID);
    expect(input.policy).toBe("age");
    // The instance carries its own estimate (60 min), which wins over the overridden default.
    expect(input.estimateHours).toBe(1);
  });

  it("passes the rank through and the account zone from the settings", () => {
    const state = artboardState();
    const result = urgencyInputFor(state, task(state, TRK_ID), ctx(NOW, "UTC"), {
      position: 2,
      size: 3,
    });
    expect(result.ok && result.value.rank).toEqual({ position: 2, size: 3 });
    expect(result.ok && result.value.accountTz).toBe(MOSCOW);
  });

  it("reports an unknown preset and invalid overrides", () => {
    const state = artboardState(NOW, [
      at(65, "2026-10-06T10:00:00.000Z", {
        type: "task.created",
        payload: {
          taskId: "t-broken",
          title: "Broken",
          presetId: "nope",
          subtasks: [],
          fields: {},
        },
      }),
      at(66, "2026-10-06T10:00:00.000Z", {
        type: "task.overrides.set",
        payload: { taskId: CALC_HW5_ID, overrides: { urgencyPolicy: "fast" } },
      }),
    ]);
    expect(urgencyInputFor(state, task(state, "t-broken"), ctx(), null)).toEqual({
      ok: false,
      error: "preset/unknown",
    });
    expect(urgencyInputFor(state, task(state, CALC_HW5_ID), ctx(), null)).toEqual({
      ok: false,
      error: "preset/invalid-overrides",
    });
  });
});

const rankOf = (state: CoreState, id: string) => rankWithinCategory(state, task(state, id));

describe("rankWithinCategory", () => {
  it("orders the Prioritized tasks by their manual rank: TRK-231 is 2 of 3", () => {
    const state = artboardState();
    expect(rankOf(state, TRK_ID)).toEqual({ position: 2, size: 3 });
    expect(rankOf(state, DEMO_ID)).toEqual({ position: 1, size: 3 });
    expect(rankOf(state, RFC_ID)).toEqual({ position: 3, size: 3 });
  });

  it("puts unranked tasks after the ranked ones, oldest first", () => {
    const state = artboardState();
    expect(rankOf(state, CALC_HW5_ID)).toEqual({ position: 1, size: 2 });
    expect(rankOf(state, HW_ID)).toEqual({ position: 2, size: 2 });
    const [passport, dentist, trip] = DEFERRED_IDS;
    expect(rankOf(state, BOOKS_ID)).toEqual({ position: 1, size: 5 });
    expect(rankOf(state, trip)).toEqual({ position: 5, size: 5 });
    const ranked = artboardState(NOW, [
      at(67, "2026-10-06T10:00:00.000Z", {
        type: "task.rank.set",
        payload: { taskId: trip, rank: 1 },
      }),
    ]);
    expect(rankOf(ranked, trip)).toEqual({ position: 1, size: 5 });
    expect(rankOf(ranked, BOOKS_ID)).toEqual({ position: 2, size: 5 });
    expect(rankOf(ranked, passport)).toEqual({ position: 4, size: 5 });
    expect(rankOf(ranked, dentist)).toEqual({ position: 5, size: 5 });
  });

  it("has no rank for closed tasks, inbox items and empty instances", () => {
    const state = artboardState();
    expect(rankOf(state, sheetId(1))).toBeNull();
    expect(rankOf(state, INBOX_CABLE_ID)).toBeNull();
    expect(rankOf(state, CALC_W41_ID)).toBeNull();
  });
});
