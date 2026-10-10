import { describe, expect, it } from "vitest";

import { artboardState, ctx, MOSCOW } from "@pace/core/testing";

import { placeIn, weekModel } from "./week.ts";

describe("weekModel", () => {
  it("is Monday to Sunday in the account zone, today marked, the next week only for a past one", () => {
    const week = weekModel(artboardState(), null, ctx());
    expect(week.days).toHaveLength(7);
    expect(week.days.filter((day) => day.isToday)).toHaveLength(1);
    expect(week.next).toBeNull();
    const before = weekModel(artboardState(), week.previous, ctx());
    expect(before.next).toBe(week.weekStart);
    expect(before.weekEnd).toBe(week.weekStart);
  });

  it("places a stretch on the day's grid from its first hour, clipped to the day", () => {
    const day = "2026-10-05T21:00:00.000Z"; // Tuesday 00:00 in Moscow
    const zone = MOSCOW;
    expect(
      placeIn(
        day,
        { endAt: "2026-10-06T07:30:00.000Z", startAt: "2026-10-06T06:00:00.000Z" },
        { fromHour: 7, zone },
      ),
    ).toEqual({ height: 90, top: 120 });
    expect(
      placeIn(
        day,
        { endAt: "2026-10-05T23:00:00.000Z", startAt: "2026-10-05T22:00:00.000Z" },
        { fromHour: 7, zone },
      ),
    ).toBeNull();
  });
});
