import { describe, expect, it } from "vitest";

import { calendarKeyMove, monthGrid, monthOf, rovingDay, shiftMonth } from "./calendar.ts";

describe("monthGrid", () => {
  it("lays October 2026 out in weeks from Monday, padded with the neighbouring days", () => {
    const weeks = monthGrid("2026-10");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.map((day) => day.date)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(weeks[0]?.[0]).toEqual({ date: "2026-09-28", day: 28, isInMonth: false });
    expect(weeks[4]?.at(-1)).toEqual({ date: "2026-11-01", day: 1, isInMonth: false });
  });

  it("gives six weeks when the month needs them, and handles February of a leap year", () => {
    expect(monthGrid("2026-08")).toHaveLength(6);
    const february = monthGrid("2028-02")
      .flat()
      .filter((day) => day.isInMonth);
    expect(february.at(-1)?.date).toBe("2028-02-29");
  });
});

describe("shiftMonth and monthOf", () => {
  it("steps across years and reads the month of a date", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthOf("2026-10-08")).toBe("2026-10");
  });
});

describe("the keyboard in a month view (QA round 19 L5)", () => {
  it("moves a day sideways, a week up and down, across months", () => {
    expect(calendarKeyMove("2026-10-08", "ArrowRight")).toBe("2026-10-09");
    expect(calendarKeyMove("2026-10-01", "ArrowLeft")).toBe("2026-09-30");
    expect(calendarKeyMove("2026-10-29", "ArrowDown")).toBe("2026-11-05");
    expect(calendarKeyMove("2026-10-03", "ArrowUp")).toBe("2026-09-26");
  });

  it("goes to the week's Monday and Sunday, and a month on to the same day or the month's last", () => {
    // 8 October 2026 is a Thursday.
    expect(calendarKeyMove("2026-10-08", "Home")).toBe("2026-10-05");
    expect(calendarKeyMove("2026-10-08", "End")).toBe("2026-10-11");
    expect(calendarKeyMove("2026-10-31", "PageDown")).toBe("2026-11-30");
    expect(calendarKeyMove("2026-03-31", "PageUp")).toBe("2026-02-28");
  });

  it("stops at the last day that can be picked, and leaves other keys alone", () => {
    expect(calendarKeyMove("2026-10-08", "ArrowDown", "2026-10-10")).toBe("2026-10-10");
    expect(calendarKeyMove("2026-10-10", "ArrowRight", "2026-10-10")).toBe("2026-10-10");
    expect(calendarKeyMove("2026-10-08", "Enter")).toBeNull();
    expect(calendarKeyMove("2026-10-08", "a")).toBeNull();
  });

  it("keeps the one tab stop on the day wanted while it is in the month shown", () => {
    expect(rovingDay("2026-10", "2026-10-08")).toBe("2026-10-08");
    expect(rovingDay("2026-09", "2026-10-08")).toBe("2026-09-01");
    // A month whose first day is past the last one that can be picked (never shown) keeps it.
    expect(rovingDay("2026-10", "2026-11-02", "2026-10-20")).toBe("2026-10-01");
  });
});
