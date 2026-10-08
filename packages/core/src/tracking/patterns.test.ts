import { describe, expect, it } from "vitest";

import { focusVsSleep, fragmentation, productiveHours } from "./patterns.ts";
import { act, start, T, timeOf } from "./tracking.fake.ts";

const MOSCOW = "Europe/Moscow";
const DAY = {
  from: "2026-10-06T21:00:00.000Z",
  now: "2026-10-08T00:00:00.000Z",
  to: "2026-10-07T21:00:00.000Z",
  zone: MOSCOW,
};

/** A block logged from `from` to `to` (UTC wall clock on Oct 7), labelled by its id. */
const logged = (
  activityId: string,
  [from, to]: readonly [string, string],
  category: "study" | "work",
) =>
  act(from, {
    payload: { activityId, category, endAt: T(to), label: activityId, startAt: T(from) },
    type: "activity.logged",
  });

describe("productive hours", () => {
  it("splits focus time at local hour boundaries and leaves the rest out", () => {
    const time = timeOf([
      // 09:30–11:15 UTC = 12:30–14:15 in Moscow.
      logged("w", ["09:30", "11:15"], "work"),
      start("11:15", { activityId: "lunch", category: "food", label: "Lunch" }),
      act("12:00", { payload: { activityId: "lunch" }, type: "activity.stopped" }),
    ]);
    const hours = productiveHours(time, DAY);
    expect(hours).toHaveLength(24);
    expect(hours.slice(12, 15)).toEqual([30, 60, 15]);
    expect(hours.reduce((sum, minutes) => sum + minutes, 0)).toBe(105);
  });
});

describe("fragmentation", () => {
  it("measures focus blocks, fragments and switches", () => {
    const time = timeOf([
      logged("a", ["06:00", "07:00"], "work"),
      logged("b", ["07:00", "07:10"], "study"),
      logged("c", ["08:00", "08:40"], "work"),
    ]);
    expect(fragmentation(time, DAY)).toEqual({
      focusBlocks: 3,
      medianFocusMinutes: 40,
      shortFocusShare: 1 / 3,
      switchesPerDay: 2,
    });
  });

  it("knows nothing about an empty week", () => {
    expect(fragmentation(timeOf([]), DAY)).toEqual({
      focusBlocks: 0,
      medianFocusMinutes: null,
      shortFocusShare: null,
      switchesPerDay: null,
    });
  });
});

describe("focus against sleep", () => {
  it("pairs each day's focus with the night before", () => {
    const time = timeOf([
      // The night of Oct 6 → 7 in Moscow: 23:00–07:00 local.
      act("00:00", {
        payload: {
          activityId: "night",
          category: "sleep",
          endAt: "2026-10-07T04:00:00.000Z",
          label: "Sleep",
          startAt: "2026-10-06T20:00:00.000Z",
        },
        type: "activity.logged",
      }),
      logged("w", ["06:00", "08:30"], "work"),
    ]);
    expect(focusVsSleep(time, { ...DAY, to: "2026-10-08T21:00:00.000Z" })).toEqual([
      { date: "2026-10-06T21:00:00.000Z", focusMinutes: 150, sleepMinutes: 480 },
      { date: "2026-10-07T21:00:00.000Z", focusMinutes: 0, sleepMinutes: null },
    ]);
  });
});
