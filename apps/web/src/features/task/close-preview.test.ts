import { describe, expect, it } from "vitest";

import type { ProblemRow } from "@pace/client";

import { HW_DUE } from "@pace/core/testing";

import { closePreview, problemName, recentReasons } from "./close-preview.ts";

const problem = (
  id: string,
  number: null | number,
  label: string,
  state: ProblemRow["state"],
): ProblemRow => ({
  id,
  label,
  number,
  solvedAt: null,
  state,
  submittedAt: null,
});

const problems = [
  problem("s1", 1, "Matrix rank", "submitted"),
  problem("s3", 3, "Inverse", "solved"),
  problem("s4", 4, "Determinant", "solved"),
  problem("s5", 5, "Kronecker–Capelli", "pending"),
  problem("s7", null, "7a Bonus", "pending"),
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
    expect(problems.map(problemName)).toEqual(["1", "3", "4", "5", "7a Bonus"]);
  });
});

describe("recentReasons", () => {
  const closed = (id: string, at: string, reason: null | string, source = "web" as const) =>
    [
      id,
      {
        closed: { at, confirmed: false, eventId: `e-${id}`, outcome: "cancelled", reason, source },
      },
    ] as const;

  it("offers the people's own reasons, newest first, once each", () => {
    const tasks = Object.fromEntries([
      closed("a", "2026-10-01T10:00:00.000Z", "course dropped"),
      closed("b", "2026-10-03T10:00:00.000Z", "duplicate"),
      closed("c", "2026-10-02T10:00:00.000Z", "course dropped"),
      closed("d", "2026-10-04T10:00:00.000Z", null),
      ["e", { closed: null }],
      [
        "f",
        {
          closed: {
            at: "2026-10-05T10:00:00.000Z",
            confirmed: false,
            eventId: "e-f",
            outcome: "skipped",
            reason: "not-assigned",
            source: "system",
          },
        },
      ],
    ]);
    expect(recentReasons(tasks)).toEqual(["duplicate", "course dropped"]);
  });
});
