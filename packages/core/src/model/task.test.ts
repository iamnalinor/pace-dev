import { describe, expect, it } from "vitest";

import { subtask, taskFixture } from "../materialize/task-fixture.fake.ts";
import {
  INITIAL_TASKS_STATE,
  isOpen,
  progressOf,
  solvedCount,
  submittedCount,
  taskById,
  unsubmittedSubtasks,
} from "./task.ts";

const T1 = "2026-10-05T12:00:00.000Z";
const T2 = "2026-10-05T13:00:00.000Z";

/** 7 problems, 4 solved, 2 of them sent: the Algebra HW 6 card. */
const hw6 = () =>
  taskFixture({
    subtasks: [
      { ...subtask("s1", "Matrix rank", 1), solvedAt: T1, submittedAt: T2 },
      { ...subtask("s2", "Gauss elimination", 2), solvedAt: T1, submittedAt: T2 },
      { ...subtask("s3", "Inverse via adjugate", 3), solvedAt: T2 },
      { ...subtask("s4", "Determinant 4×4", 4), solvedAt: T2 },
      subtask("s5", "Kronecker–Capelli", 5),
      subtask("s6", "Block matrices", 6),
      subtask("s7", "7a Bonus"),
    ],
  });

describe("INITIAL_TASKS_STATE", () => {
  it("has no tasks", () => {
    expect(INITIAL_TASKS_STATE).toEqual({ byId: {} });
  });
});

describe("taskById", () => {
  it("finds own entries only", () => {
    const task = taskFixture();
    const state = { byId: { [task.id]: task } };
    expect(taskById(state, task.id)).toBe(task);
    expect(taskById(state, "missing")).toBeUndefined();
    expect(taskById(state, "__proto__")).toBeUndefined();
  });
});

describe("isOpen", () => {
  it("is true until the task carries a closure", () => {
    expect(isOpen(taskFixture())).toBe(true);
    const closed = {
      outcome: "done" as const,
      at: T2,
      reason: null,
      source: "app" as const,
      eventId: "e",
    };
    expect(isOpen(taskFixture({ closed }))).toBe(false);
  });
});

describe("subtask counts", () => {
  it("counts solved and submitted problems of the artboard card", () => {
    expect(solvedCount(hw6())).toBe(4);
    expect(submittedCount(hw6())).toBe(2);
  });

  it("lists the unsubmitted problems in order", () => {
    expect(unsubmittedSubtasks(hw6()).map((item) => item.id)).toEqual([
      "s3",
      "s4",
      "s5",
      "s6",
      "s7",
    ]);
  });
});

describe("progressOf", () => {
  it("is the solved share in subtasks mode", () => {
    expect(progressOf(hw6(), "subtasks")).toBeCloseTo(4 / 7, 10);
  });

  it("is 0 in subtasks mode without subtasks or slider", () => {
    expect(progressOf(taskFixture(), "subtasks")).toBe(0);
  });

  it("is the slider tenth in slider mode, 0 when unset", () => {
    expect(progressOf(taskFixture({ slider: 4 }), "slider")).toBeCloseTo(0.4, 10);
    expect(progressOf(taskFixture(), "slider")).toBe(0);
  });

  it("prefers the slider over subtasks only when there are no subtasks", () => {
    expect(progressOf(taskFixture({ slider: 3 }), "subtasks")).toBeCloseTo(0.3, 10);
    expect(progressOf(taskFixture({ slider: 6 }), "none")).toBeCloseTo(0.6, 10);
    expect(progressOf(hw6(), "none")).toBe(0);
    expect(progressOf({ ...hw6(), slider: 5 }, "slider")).toBeCloseTo(0.5, 10);
    expect(progressOf({ ...hw6(), slider: 5 }, "subtasks")).toBeCloseTo(4 / 7, 10);
  });
});
