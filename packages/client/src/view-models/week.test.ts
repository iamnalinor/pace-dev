import { describe, expect, it } from "vitest";

import type { CalendarEvent, CoreState } from "@pace/core";

import { artboardState, ctx, MOSCOW } from "@pace/core/testing";

import { fitHourPx, gridFromHour, lanesOf, placeIn, weekModel } from "./week.ts";

/** The artboard world with Week's night hours on or off, and these tracked stretches. */
const world = ({
  nightHours = false,
  tracked = [],
}: {
  readonly nightHours?: boolean;
  readonly tracked?: readonly { readonly startAt: string; readonly endAt: string }[];
}): CoreState => {
  const base = artboardState();
  return {
    ...base,
    settings: { ...base.settings, nightHours },
    time: {
      ...base.time,
      activities: Object.fromEntries(
        tracked.map((stretch, index) => [
          `a${String(index)}`,
          {
            buttonId: null,
            category: "study",
            endAt: stretch.endAt,
            expectMinutes: null,
            id: `a${String(index)}`,
            isAlongside: false,
            isLogged: true,
            label: "Reading",
            startAt: stretch.startAt,
            stillAt: null,
            taskId: null,
          },
        ]),
      ),
    },
  };
};

const event = (startAt: string, endAt: string): CalendarEvent => ({
  endAt,
  id: `ev-${startAt}`,
  series: null,
  startAt,
  title: "Seminar",
});

describe("Week's hour range", () => {
  it("is 07–24 by default, and 00–24 with night hours on", () => {
    expect(weekModel(world({}), null, ctx()).fromHour).toBe(7);
    expect(weekModel(world({ nightHours: true }), null, ctx()).fromHour).toBe(0);
  });

  it("starts earlier for tracked time or a calendar event before seven, never later than 00", () => {
    // 05:10–06:00 in Moscow on Tuesday.
    const early = world({
      tracked: [{ endAt: "2026-10-06T03:00:00.000Z", startAt: "2026-10-06T02:10:00.000Z" }],
    });
    const week = weekModel(early, null, ctx());
    expect(week.fromHour).toBe(5);
    // A 04:30 event that week widens it again; one in another week does not.
    const at0430 = event("2026-10-07T01:30:00.000Z", "2026-10-07T02:00:00.000Z");
    const nextWeek = event("2026-10-13T00:00:00.000Z", "2026-10-13T01:00:00.000Z");
    expect(gridFromHour(week, [at0430, nextWeek])).toBe(4);
    expect(gridFromHour(week, [nextWeek])).toBe(5);
    // With night hours the day is whole whatever it held.
    const night = weekModel(world({ nightHours: true }), null, ctx());
    expect(gridFromHour(night, [at0430])).toBe(0);
  });
});

describe("fitHourPx", () => {
  it("shares the measured height between the hours, so the grid fits without scrolling", () => {
    expect(fitHourPx({ available: 680, floorPx: 18, hours: 17 })).toEqual({
      hourPx: 40,
      scrolls: false,
    });
    expect(fitHourPx({ available: 480, floorPx: 18, hours: 24 })).toEqual({
      hourPx: 20,
      scrolls: false,
    });
  });

  it("keeps an hour at least the floor tall and only then lets the grid scroll", () => {
    expect(fitHourPx({ available: 300, floorPx: 18, hours: 24 })).toEqual({
      hourPx: 18,
      scrolls: true,
    });
    // Not measured yet: the floor, without scrolling.
    expect(fitHourPx({ available: 0, floorPx: 18, hours: 17 })).toEqual({
      hourPx: 18,
      scrolls: false,
    });
  });
});

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
