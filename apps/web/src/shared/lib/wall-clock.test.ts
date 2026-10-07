import { describe, expect, it } from "vitest";

import { instantToWallClock, wallClockToInstant } from "./wall-clock.ts";

describe("wallClockToInstant", () => {
  it("reads a datetime-local value on the zone's clock", () => {
    expect(wallClockToInstant("2026-10-14T23:59", "Europe/Moscow")).toBe(
      "2026-10-14T20:59:00.000Z",
    );
    expect(wallClockToInstant("2026-07-01T09:00", "America/New_York")).toBe(
      "2026-07-01T13:00:00.000Z",
    );
  });

  it("rejects anything that is not a date-time", () => {
    expect(wallClockToInstant("", "UTC")).toBeNull();
    expect(wallClockToInstant("tomorrow", "UTC")).toBeNull();
    expect(wallClockToInstant("2026-13-40T25:61", "UTC")).toBeNull();
  });

  it("resolves a time inside the spring-forward gap to a real instant", () => {
    const instant = wallClockToInstant("2026-03-29T02:30", "Europe/Berlin");
    expect(instant).not.toBeNull();
    expect(Number.isNaN(Date.parse(instant ?? ""))).toBe(false);
  });
});

describe("instantToWallClock", () => {
  it("formats the zone's wall clock as a datetime-local value", () => {
    expect(instantToWallClock("2026-10-14T20:59:00.000Z", "Europe/Moscow")).toBe(
      "2026-10-14T23:59",
    );
    expect(instantToWallClock("2026-01-05T00:05:00.000Z", "UTC")).toBe("2026-01-05T00:05");
  });

  it("round-trips through the zone, autumn overlap included", () => {
    const zone = "America/New_York";
    const local = "2026-11-01T01:30";
    expect(instantToWallClock(wallClockToInstant(local, zone) ?? "", zone)).toBe(local);
  });
});
