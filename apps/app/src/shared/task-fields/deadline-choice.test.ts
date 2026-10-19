import { isDeadlineChoiceValid } from "./deadline-choice.ts";

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
