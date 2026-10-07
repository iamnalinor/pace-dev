import { HW_DUE, MOSCOW, NOW } from "@pace/core/testing";

import { clockTime, fromWallClock, wallClock, zonedText } from "./time.ts";

describe("wallClock / fromWallClock", () => {
  it("reads an instant on the wall clock of a zone and back", () => {
    expect(wallClock(HW_DUE, MOSCOW)).toEqual({ date: "2026-10-07", time: "23:59" });
    expect(fromWallClock({ date: "2026-10-07", time: "23:59", tz: MOSCOW })).toBe(HW_DUE);
    expect(fromWallClock({ date: "2026-10-07", time: "9:05", tz: "UTC" })).toBe(
      "2026-10-07T09:05:00.000Z",
    );
  });

  it("finds the right offset on both sides of a summer-time change", () => {
    expect(fromWallClock({ date: "2026-03-28", time: "12:00", tz: "Europe/Berlin" })).toBe(
      "2026-03-28T11:00:00.000Z",
    );
    expect(fromWallClock({ date: "2026-03-30", time: "12:00", tz: "Europe/Berlin" })).toBe(
      "2026-03-30T10:00:00.000Z",
    );
  });

  it("rejects malformed dates, times and zones", () => {
    expect(fromWallClock({ date: "2026-13-01", time: "10:00", tz: MOSCOW })).toBeNull();
    expect(fromWallClock({ date: "2026-02-30", time: "10:00", tz: MOSCOW })).toBeNull();
    expect(fromWallClock({ date: "2026-10-07", time: "24:00", tz: MOSCOW })).toBeNull();
    expect(fromWallClock({ date: "07.10.2026", time: "10:00", tz: MOSCOW })).toBeNull();
    expect(fromWallClock({ date: "2026-10-07", time: "10:00", tz: "Mars/Olympus" })).toBeNull();
  });
});

describe("zonedText", () => {
  const viewer = { deviceTz: MOSCOW, language: "en", now: NOW } as const;

  it("reads a due relative to today in its own zone", () => {
    expect(zonedText({ at: HW_DUE, mode: "due", tz: MOSCOW }, viewer)).toBe("tomorrow 23:59");
    expect(clockTime(HW_DUE, "UTC")).toBe("20:59");
  });

  it("adds the zone and the viewer's time when the offsets differ", () => {
    expect(zonedText({ at: HW_DUE, mode: "due", tz: MOSCOW }, { ...viewer, deviceTz: "UTC" })).toBe(
      "tomorrow 23:59 GMT+3 (your time 20:59)",
    );
  });

  it("prints a plain date for the datetime mode", () => {
    expect(zonedText({ at: HW_DUE, mode: "datetime", tz: MOSCOW }, viewer)).toBe("Oct 7, 23:59");
    expect(
      zonedText({ at: HW_DUE, mode: "datetime", tz: MOSCOW }, { ...viewer, language: "ru" }),
    ).toBe("7 окт., 23:59");
  });
});
