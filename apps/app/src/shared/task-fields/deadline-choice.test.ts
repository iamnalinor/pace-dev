import {
  deadlineChoiceProblem,
  isDeadlineChoiceValid,
  isDeadlineTypeShown,
} from "./deadline-choice.ts";

describe("task deadline choice", () => {
  const due = { at: "2026-10-16T12:00:00.000Z", tz: "Europe/Moscow" };

  it("requires a main date and a valid final stage", () => {
    expect(isDeadlineChoiceValid({ kind: "hard" }, null)).toBe(true);
    expect(
      isDeadlineChoiceValid(
        { kind: "resubmission", finalAt: null, finalTz: null, finalMode: "offset", softDays: 3 },
        null,
      ),
    ).toBe(false);
    expect(
      isDeadlineChoiceValid(
        { kind: "resubmission", finalAt: null, finalTz: null, finalMode: "offset", softDays: 0 },
        due,
      ),
    ).toBe(false);
    expect(
      isDeadlineChoiceValid(
        { kind: "resubmission", finalAt: null, finalTz: null, finalMode: "fixed", softDays: 3 },
        due,
      ),
    ).toBe(false);
    expect(
      isDeadlineChoiceValid(
        {
          kind: "resubmission",
          finalAt: "2026-10-15T12:00:00.000Z",
          finalTz: "Europe/Moscow",
          finalMode: "fixed",
          softDays: 3,
        },
        due,
      ),
    ).toBe(false);
    expect(
      isDeadlineChoiceValid(
        {
          kind: "resubmission",
          finalAt: "2026-10-17T12:00:00.000Z",
          finalTz: "Europe/Moscow",
          finalMode: "fixed",
          softDays: 3,
        },
        due,
      ),
    ).toBe(true);
  });
});

const fixed = (finalAt: null | string) =>
  ({
    finalAt,
    finalMode: "fixed",
    finalTz: finalAt === null ? null : "Europe/Moscow",
    kind: "resubmission",
    softDays: 3,
  }) as const;

describe("deadlineChoiceProblem", () => {
  const due = { at: "2026-10-16T12:00:00.000Z", tz: "Europe/Moscow" };
  it("names what is missing: the main due date, a later final date or a day count (QA 14 L4)", () => {
    expect(deadlineChoiceProblem({ kind: "hard" }, null)).toBeNull();
    expect(deadlineChoiceProblem(fixed(null), null)).toBe("deadline/no-due");
    expect(deadlineChoiceProblem(fixed(null), due)).toBe("deadline/final-after-due");
    expect(deadlineChoiceProblem(fixed("2026-10-15T12:00:00.000Z"), due)).toBe(
      "deadline/final-after-due",
    );
    expect(deadlineChoiceProblem(fixed("2026-10-17T12:00:00.000Z"), due)).toBeNull();
    expect(
      deadlineChoiceProblem(
        { finalAt: null, finalMode: "offset", finalTz: null, kind: "resubmission", softDays: 0 },
        due,
      ),
    ).toBe("deadline/days");
  });

  it("offers the deadline type only once there is a deadline, or a two-stage one to finish", () => {
    expect(isDeadlineTypeShown({ kind: "hard" }, null)).toBe(false);
    expect(isDeadlineTypeShown({ kind: "hard" }, due)).toBe(true);
    expect(
      isDeadlineTypeShown(
        { kind: "resubmission", finalAt: null, finalTz: null, finalMode: "offset", softDays: 3 },
        null,
      ),
    ).toBe(true);
  });
});
