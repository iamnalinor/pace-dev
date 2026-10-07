import { describe, expect, it } from "vitest";

import type { ProblemRow } from "@pace/client";

import { HW_DUE } from "@pace/core/testing";

import { closePreview, problemName } from "./close-preview.ts";

const problem = (
  id: string,
  { label, number, state }: Pick<ProblemRow, "label" | "number" | "state">,
): ProblemRow => ({
  id,
  label,
  number,
  solvedAt: null,
  state,
  submittedAt: null,
});

const problems = [
  problem("s1", { label: "Matrix rank", number: 1, state: "submitted" }),
  problem("s3", { label: "Inverse", number: 3, state: "solved" }),
  problem("s4", { label: "Determinant", number: 4, state: "solved" }),
  problem("s5", { label: "Kronecker–Capelli", number: 5, state: "pending" }),
  problem("s7", { label: "7a Bonus", number: null, state: "pending" }),
];

describe("closePreview", () => {
  it("is on time up to the deadline and late after it", () => {
    expect(closePreview({ at: HW_DUE, dueAt: HW_DUE, problems, sending: [] }).outcome).toBe(
      "before-deadline",
    );
    expect(
      closePreview({ at: "2026-10-07T21:00:00.000Z", dueAt: HW_DUE, problems, sending: [] })
        .outcome,
    ).toBe("late");
    expect(closePreview({ at: HW_DUE, dueAt: null, problems, sending: [] }).outcome).toBe("done");
  });

  it("lists what stays open after sending some problems", () => {
    expect(
      closePreview({ at: HW_DUE, dueAt: HW_DUE, problems, sending: ["s3", "s4"] }).stillOpen,
    ).toEqual(["5", "7a Bonus"]);
  });
});

describe("problemName", () => {
  it("prefers the number and falls back to the label", () => {
    expect(problems.map((problem) => problemName(problem))).toEqual([
      "1",
      "3",
      "4",
      "5",
      "7a Bonus",
    ]);
  });
});
