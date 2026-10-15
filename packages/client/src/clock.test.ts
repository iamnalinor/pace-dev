import { describe, expect, it } from "vitest";

import { isValidTimeZone } from "@pace/core";
import { MOSCOW, NOW, taskFixture } from "@pace/core/testing";

import { type Clock, queryContext, quickTimes, systemClock } from "./clock.ts";

const fakeClock: Clock = { deviceTz: MOSCOW, now: () => NOW };

describe("systemClock", () => {
  it("reads the wall clock and the device zone", () => {
    const clock = systemClock();
    const skew = Date.parse(clock.now()) - Date.now();
    expect(Math.abs(skew)).toBeLessThan(5000);
    expect(isValidTimeZone(clock.deviceTz)).toBe(true);
  });
});

describe("queryContext", () => {
  it("snapshots the clock for the queries", () => {
    expect(queryContext(fakeClock)).toEqual({ deviceTz: MOSCOW, now: NOW });
  });
});

describe("quickTimes", () => {
  it("offers now, an hour ago and yesterday 21:00 in the device zone", () => {
    expect(quickTimes(fakeClock, null)).toEqual([
      { at: NOW, key: "now" },
      { at: "2026-10-06T11:00:00.000Z", key: "hour-ago" },
      { at: "2026-10-05T18:00:00.000Z", key: "yesterday-evening" },
    ]);
  });

  it("adds the deadline once it has passed, never one still ahead", () => {
    const passed = "2026-10-06T09:00:00.000Z";
    expect(quickTimes(fakeClock, taskFixture({ dueAt: passed })).at(-1)).toEqual({
      at: passed,
      key: "at-deadline",
    });
    // The fixture is due tomorrow night: closing then would be refused as the future.
    expect(quickTimes(fakeClock, taskFixture()).map((pill) => pill.key)).not.toContain(
      "at-deadline",
    );
    expect(quickTimes(fakeClock, taskFixture({ dueAt: null, dueTz: null }))).toHaveLength(3);
  });

  it("reads yesterday evening on the device's calendar, not UTC's", () => {
    const tokyo: Clock = { deviceTz: "Asia/Tokyo", now: () => "2026-10-06T16:30:00.000Z" };
    // 01:30 Wednesday in Tokyo: "yesterday" is Tuesday, 21:00 JST = 12:00 UTC.
    expect(quickTimes(tokyo, null)[2]?.at).toBe("2026-10-06T12:00:00.000Z");
  });
});
