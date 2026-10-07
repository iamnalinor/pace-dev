import { describe, expect, it } from "vitest";

import {
  ALGEBRA_ID,
  artboardState,
  CALC_HW5_ID,
  CALC_W41_ID,
  CALCULUS_ID,
  ctx,
  DONE_SHEETS,
  GRADE_ID,
  HW_ID,
  MOSCOW,
  sheetId,
} from "@pace/core/testing";

import { type ProjectViewModel, projectViewModel } from "./project.ts";

const view = (projectId: string): ProjectViewModel => {
  const result = projectViewModel(artboardState(), projectId, ctx());
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

describe("projectViewModel", () => {
  it("shows the Algebra page: header stats, open rows, done list newest first", () => {
    const algebra = view(ALGEBRA_ID);
    expect(algebra).toMatchObject({
      color: "blue",
      id: ALGEBRA_ID,
      name: "Algebra",
      stats: { late: 2, onTime: { done: 9, total: 11 }, open: 2 },
    });
    expect(algebra.open.map((entry) => entry.id)).toEqual([HW_ID, GRADE_ID]);
    expect(algebra.open[0]?.meta[0]).toMatchObject({ kind: "due", relative: "tomorrow" });
    expect(algebra.awaiting).toEqual([]);
    expect(algebra.done).toHaveLength(DONE_SHEETS);
    expect(algebra.done[0]).toMatchObject({
      id: sheetId(DONE_SHEETS),
      outcome: "done",
      title: "Algebra sheet 11",
    });
    expect(algebra.done.find((entry) => entry.id === sheetId(3))?.outcome).toBe("done_late");
  });

  it("lists an empty instance as awaiting assignment with its due", () => {
    const calculus = view(CALCULUS_ID);
    expect(calculus.open.map((entry) => entry.id)).toEqual([CALC_HW5_ID]);
    expect(calculus.awaiting).toEqual([
      {
        dueAt: "2026-10-12T20:59:00.000Z",
        dueTz: MOSCOW,
        id: CALC_W41_ID,
        relative: "later",
        title: "Calculus HW 6",
      },
    ]);
  });

  it("reports an unknown project", () => {
    expect(projectViewModel(artboardState(), "p-nope", ctx())).toEqual({
      error: "project/unknown",
      ok: false,
    });
  });
});
