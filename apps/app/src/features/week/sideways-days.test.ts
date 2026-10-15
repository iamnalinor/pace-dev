import type { WeekModel } from "@pace/client";

import { sidewaysStart } from "./sideways-days.tsx";

/** A week of seven days, today the `today`-th of them (-1 for none). */
const weekOf = (weekStart: string, today: number): Pick<WeekModel, "days" | "weekStart"> => ({
  days: Array.from({ length: 7 }, (_, index) => ({
    blocks: [],
    date: `${weekStart}+${String(index)}`,
    isToday: index === today,
  })),
  weekStart,
});

describe("sidewaysStart", () => {
  it("brings today and the day before into sight when a week first shows", () => {
    expect(sidewaysStart({ minColumnPx: 72, scrolledWeek: null, week: weekOf("w2", 2) })).toBe(72);
    // Monday is today: nothing before it.
    expect(sidewaysStart({ minColumnPx: 72, scrolledWeek: null, week: weekOf("w2", 0) })).toBe(0);
  });

  it("leaves the week where the person scrolled it while it stays the same week", () => {
    expect(
      sidewaysStart({ minColumnPx: 72, scrolledWeek: "w2", week: weekOf("w2", 2) }),
    ).toBeNull();
  });

  it("opens another week at its Monday, wherever the last one was left", () => {
    expect(sidewaysStart({ minColumnPx: 72, scrolledWeek: "w2", week: weekOf("w1", -1) })).toBe(0);
    // And back to this week: today again.
    expect(sidewaysStart({ minColumnPx: 72, scrolledWeek: "w1", week: weekOf("w2", 3) })).toBe(144);
  });
});
