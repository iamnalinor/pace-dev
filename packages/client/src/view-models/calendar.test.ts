import { describe, expect, it } from "vitest";

import { monthGrid, monthOf, shiftMonth } from "./calendar.ts";

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
