import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Recurrence, Weekday } from "../model/preset.ts";

import { dueWeekOffset } from "./recurrence.ts";

const weekly = (
  issued: readonly [Weekday, string],
  due: readonly [Weekday, string],
): Recurrence => ({
  due: { time: due[1], weekday: due[0] },
  issued: { time: issued[1], weekday: issued[0] },
  tz: "Europe/Moscow",
});

describe("dueWeekOffset", () => {
  it("is 0 when the due weekday is later in the same week", () => {
    expect(dueWeekOffset(weekly([1, "10:00"], [3, "23:59"]))).toBe(0);
    expect(dueWeekOffset(weekly([1, "23:00"], [2, "00:00"]))).toBe(0);
  });

  it("is 0 on the same weekday when the due time is later", () => {
    expect(dueWeekOffset(weekly([4, "09:00"], [4, "09:01"]))).toBe(0);
    expect(dueWeekOffset(weekly([4, "09:00"], [4, "18:00"]))).toBe(0);
  });

  it("is 1 when the due slot is earlier in the week or the same instant", () => {
    expect(dueWeekOffset(weekly([2, "12:00"], [1, "23:59"]))).toBe(1);
    expect(dueWeekOffset(weekly([4, "09:00"], [4, "09:00"]))).toBe(1);
    expect(dueWeekOffset(weekly([4, "09:00"], [4, "08:59"]))).toBe(1);
    expect(dueWeekOffset(weekly([7, "00:00"], [1, "23:59"]))).toBe(1);
  });

  it("depends only on the slot order (property)", () => {
    const weekdayArb = fc.constantFrom<Weekday>(1, 2, 3, 4, 5, 6, 7);
    const timeArb = fc
      .tuple(fc.nat({ max: 23 }), fc.nat({ max: 59 }))
      .map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    const slotArb = fc.tuple(weekdayArb, timeArb);
    fc.assert(
      fc.property(slotArb, slotArb, (issued, due) => {
        const isLater = due[0] > issued[0] || (due[0] === issued[0] && due[1] > issued[1]);
        expect(dueWeekOffset(weekly(issued, due))).toBe(isLater ? 0 : 1);
      }),
    );
  });
});
