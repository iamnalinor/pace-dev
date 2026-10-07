import { describe, expect, it } from "vitest";

import { HW_DUE, MOSCOW } from "@pace/core/testing";

import { isoToWallClock, wallClockToIso } from "./wall-clock.ts";

describe("isoToWallClock", () => {
  it("renders the zone's wall clock for a datetime-local input", () => {
    expect(isoToWallClock(HW_DUE, MOSCOW)).toBe("2026-10-07T23:59");
    expect(isoToWallClock(HW_DUE, "UTC")).toBe("2026-10-07T20:59");
    expect(isoToWallClock("2026-01-05T03:04:00.000Z", "UTC")).toBe("2026-01-05T03:04");
  });
});

describe("wallClockToIso", () => {
  it("reads a datetime-local value in the zone and answers the UTC instant", () => {
    expect(wallClockToIso("2026-10-07T23:59", MOSCOW)).toBe(HW_DUE);
    expect(wallClockToIso("2026-10-07T09:00", "America/New_York")).toBe("2026-10-07T13:00:00.000Z");
    expect(wallClockToIso("2026-12-07T09:00", "America/New_York")).toBe("2026-12-07T14:00:00.000Z");
    expect(wallClockToIso("2026-10-07T20:59", "UTC")).toBe(HW_DUE);
  });

  it("round-trips through the wall clock", () => {
    const iso = "2026-03-29T00:30:00.000Z";
    expect(wallClockToIso(isoToWallClock(iso, "Europe/London"), "Europe/London")).toBe(iso);
  });

  it("rejects what is not a wall clock", () => {
    expect(wallClockToIso("", MOSCOW)).toBeNull();
    expect(wallClockToIso("yesterday", MOSCOW)).toBeNull();
    expect(wallClockToIso("2026-10-07T23:59", "Nowhere/Nope")).toBeNull();
  });

  it("rejects a date or time that does not exist on any calendar", () => {
    expect(wallClockToIso("2026-13-40T25:61", "UTC")).toBeNull();
    expect(wallClockToIso("2026-02-30T10:00", "UTC")).toBeNull();
  });

  it("resolves a time inside the spring-forward gap to a real instant", () => {
    const instant = wallClockToIso("2026-03-29T02:30", "Europe/Berlin");
    expect(instant).not.toBeNull();
    expect(Number.isNaN(Date.parse(instant ?? ""))).toBe(false);
  });

  it("round-trips through the autumn overlap", () => {
    const zone = "America/New_York";
    const local = "2026-11-01T01:30";
    expect(isoToWallClock(wallClockToIso(local, zone) ?? "", zone)).toBe(local);
  });
});
