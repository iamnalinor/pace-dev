import { describe, expect, it } from "vitest";

import { artboardState, ctx, MOSCOW } from "@pace/core/testing";

import { lanesOf, placeIn, weekModel } from "./week.ts";

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

const at = (hhmm: string): string => `2026-10-06T${hhmm}:00.000Z`;
const stretch = (from: string, to: string) => ({ endAt: at(to), startAt: at(from) });

describe("lanesOf", () => {
  it("puts overlapping stretches side by side and leaves a lone one the whole width", () => {
    expect(
      lanesOf([
        stretch("09:00", "10:30"),
        stretch("10:00", "11:00"),
        stretch("10:15", "10:45"),
        stretch("12:00", "13:00"),
      ]),
    ).toEqual([
      { lane: 0, lanes: 3 },
      { lane: 1, lanes: 3 },
      { lane: 2, lanes: 3 },
      { lane: 0, lanes: 1 },
    ]);
  });

  it("reuses a lane once it is free, and keeps the input order", () => {
    expect(
      lanesOf([stretch("10:00", "12:00"), stretch("09:00", "10:00"), stretch("09:30", "11:00")]),
    ).toEqual([
      { lane: 0, lanes: 2 },
      { lane: 0, lanes: 2 },
      { lane: 1, lanes: 2 },
    ]);
  });
});
