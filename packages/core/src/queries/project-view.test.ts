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
  it("lists the Algebra project: HW 6 and the deferred grade check open, eleven sheets done", () => {
    const algebra = view(ALGEBRA_ID);
    expect(algebra.project.name).toBe("Algebra");
    expect(algebra.open.map((item) => item.task.id)).toEqual([HW_ID, GRADE_ID]);
    expect(algebra.open[1]?.score.hidden).toBe(true);
    expect(algebra.awaiting).toEqual([]);
    expect(algebra.done.map((entry) => entry.task.id)).toEqual(
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

  it("shows an empty instance as awaiting assignment instead of open", () => {
    const calculus = view(CALCULUS_ID);
    expect(calculus.open.map((item) => item.task.id)).toEqual([CALC_HW5_ID]);
    expect(calculus.awaiting.map((task) => task.id)).toEqual([CALC_W41_ID]);
    expect(calculus.done).toEqual([]);
    expect(calculus.stats).toMatchObject({ open: 1, onTime: { done: 0, total: 0 }, late: 0 });
  });

  it("keeps waiting tasks in the open list, in score order", () => {
    expect(view(WORK_ID).open.map((item) => item.task.id)).toEqual([TRK_ID, DEMO_ID, RFC_ID]);
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
    expect(algebra.done.slice(0, 3).map((entry) => [entry.task.id, entry.outcome])).toEqual([
      ["t-missed", "cancelled_missed"],
      ["t-dropped", "cancelled"],
      [sheetId(DONE_SHEETS), "done"],
    ]);
  });

  it("rejects an unknown project", () => {
    expect(projectView(artboardState(), "p-nope", ctx())).toEqual({
      ok: false,
      error: "project/unknown",
    });
  });
});
