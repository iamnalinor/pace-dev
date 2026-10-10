import { describe, expect, it } from "vitest";

import { at, HW_ID, TRK_ID } from "../materialize/task-fixture.fake.ts";
import {
  ALGEBRA_ID,
  artboardState,
  CALC_HW5_ID,
  CALC_W41_ID,
  CALCULUS_ID,
  ctx,
  DEMO_ID,
  DONE_SHEETS,
  GRADE_ID,
  LATE_SHEETS,
  NOW,
  RFC_ID,
  sheetId,
  WORK_ID,
} from "./fixture.fake.ts";
import { type ProjectView, projectView } from "./project-view.ts";

const view = (projectId: string, extra: Parameters<typeof artboardState>[1] = []): ProjectView => {
  const result = projectView(artboardState(NOW, extra), projectId, ctx());
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

describe("projectView", () => {
  it("lists the Algebra project: HW 6 open, the grade check in future, eleven sheets done", () => {
    const algebra = view(ALGEBRA_ID);
    expect(algebra.project.name).toBe("Algebra");
    expect(algebra.open.map((item) => item.task.id)).toEqual([HW_ID]);
    expect(algebra.future.map((item) => item.task.id)).toEqual([GRADE_ID]);
    expect(algebra.done.map((entry) => entry.item.task.id)).toEqual(
      Array.from({ length: DONE_SHEETS }, (_, index) => sheetId(DONE_SHEETS - index)),
    );
    expect(algebra.done.map((entry) => entry.outcome)).toEqual(
      Array.from({ length: DONE_SHEETS }, (_, index) =>
        LATE_SHEETS.includes(DONE_SHEETS - index) ? "done_late" : "done",
      ),
    );
  });

  it("counts open, on time 9/11 and late 2; hours stay at zero until stage 3", () => {
    expect(view(ALGEBRA_ID).stats).toEqual({
      open: 2,
      onTime: { done: 9, total: 11 },
      late: 2,
      hoursThisWeek: 0,
      weeklyHours: [0, 0, 0, 0, 0, 0],
    });
  });

  it("lists an empty instance among the open tasks, by its deadline", () => {
    const calculus = view(CALCULUS_ID);
    expect(calculus.open.map((item) => item.task.id)).toEqual([CALC_HW5_ID, CALC_W41_ID]);
    expect(calculus.done).toEqual([]);
    expect(calculus.stats).toMatchObject({ open: 2, onTime: { done: 0, total: 0 }, late: 0 });
  });

  it("orders the open list like Now: the nearest deadline first", () => {
    expect(view(WORK_ID).open.map((item) => item.task.id)).toEqual([DEMO_ID, TRK_ID, RFC_ID]);
  });

  it("counts a missed deadline as late but a cancellation in neither column", () => {
    const algebra = view(ALGEBRA_ID, [
      at(72, "2026-10-01T12:00:00.000Z", {
        type: "task.created",
        payload: {
          taskId: "t-dropped",
          title: "Optional reading",
          presetId: "hw.algebra",
          projectId: ALGEBRA_ID,
          subtasks: [],
          fields: {},
        },
      }),
      at(73, "2026-10-02T12:00:00.000Z", {
        type: "task.closed",
        payload: { taskId: "t-dropped", outcome: "cancelled", reason: "not needed" },
      }),
      at(74, "2026-10-01T12:00:00.000Z", {
        type: "task.created",
        payload: {
          taskId: "t-missed",
          title: "Quiz prep",
          presetId: "hw.algebra",
          projectId: ALGEBRA_ID,
          dueAt: "2026-10-02T20:59:00.000Z",
          dueTz: "Europe/Moscow",
          subtasks: [],
          fields: {},
        },
      }),
      at(75, "2026-10-02T20:59:00.000Z", {
        type: "task.closed",
        payload: { taskId: "t-missed", outcome: "cancelled_missed" },
        source: "system",
      }),
    ]);
    expect(algebra.stats).toMatchObject({ onTime: { done: 9, total: 12 }, late: 3 });
    // The latest deadline first; the undated cancellation after every dated task.
    const done = algebra.done.map((entry) => [entry.item.task.id, entry.outcome]);
    expect(done.at(-1)).toEqual(["t-dropped", "cancelled"]);
    expect(done).toContainEqual(["t-missed", "cancelled_missed"]);
  });

  it("rejects an unknown project", () => {
    expect(projectView(artboardState(), "p-nope", ctx())).toEqual({
      ok: false,
      error: "project/unknown",
    });
  });
});
