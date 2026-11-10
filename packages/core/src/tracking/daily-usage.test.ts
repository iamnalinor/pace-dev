import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { splitDailyUsage } from "./daily-usage.ts";

describe("splitDailyUsage", () => {
  it("splits a long valid interval without a call stack proportional to its days", () => {
    const result = splitDailyUsage(
      { startAt: "1900-01-01T00:00:00.000Z", endAt: "2026-01-01T00:00:00.000Z" },
      "UTC",
    );
    expect(result.ok).toBe(true);
    const pieces = result.ok ? result.value : [];
    expect(pieces).toHaveLength(46_021);
    expect(pieces[0]?.day).toBe("1900-01-01");
    expect(pieces.at(-1)?.day).toBe("2025-12-31");
    expect(pieces.every((piece) => piece.milliseconds === 86_400_000)).toBe(true);
  }, 20_000);

  it("does not invent a day that the zone skipped entirely", () => {
    const result = splitDailyUsage(
      { startAt: "2011-12-29T10:00:00.000Z", endAt: "2011-12-31T10:00:00.000Z" },
      "Pacific/Apia",
    );
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.map((piece) => [piece.day, piece.milliseconds]) : []).toEqual([
      ["2011-12-29", 86_400_000],
      ["2011-12-31", 86_400_000],
    ]);
  });

  it("ends a midnight-DST day before the next day's first hour", () => {
    expect(
      splitDailyUsage(
        { startAt: "2018-11-04T03:00:00.000Z", endAt: "2018-11-05T03:00:00.000Z" },
        "America/Sao_Paulo",
      ),
    ).toEqual({
      ok: true,
      value: [
        {
          day: "2018-11-04",
          from: "2018-11-04T03:00:00.000Z",
          to: "2018-11-05T02:00:00.000Z",
          milliseconds: 23 * 3_600_000,
        },
        {
          day: "2018-11-05",
          from: "2018-11-05T02:00:00.000Z",
          to: "2018-11-05T03:00:00.000Z",
          milliseconds: 3_600_000,
        },
      ],
    });
  });
  it.each([
    {
      startAt: "2026-03-08T05:00:00.000Z",
      endAt: "2026-03-09T04:00:00.000Z",
      day: "2026-03-08",
      hours: 23,
    },
    {
      startAt: "2026-11-01T04:00:00.000Z",
      endAt: "2026-11-02T05:00:00.000Z",
      day: "2026-11-01",
      hours: 25,
    },
  ])("keeps the actual DST day length from $startAt", ({ startAt, endAt, day, hours }) => {
    expect(splitDailyUsage({ startAt, endAt }, "America/New_York")).toEqual({
      ok: true,
      value: [{ day, from: startAt, to: endAt, milliseconds: hours * 3_600_000 }],
    });
  });

  it("splits at local midnight with a non-hour offset across a month", () => {
    expect(
      splitDailyUsage(
        { startAt: "2026-10-31T18:00:00.000Z", endAt: "2026-10-31T18:30:00.000Z" },
        "Asia/Kathmandu",
      ),
    ).toEqual({
      ok: true,
      value: [
        {
          day: "2026-10-31",
          from: "2026-10-31T18:00:00.000Z",
          to: "2026-10-31T18:15:00.000Z",
          milliseconds: 900_000,
        },
        {
          day: "2026-11-01",
          from: "2026-10-31T18:15:00.000Z",
          to: "2026-10-31T18:30:00.000Z",
          milliseconds: 900_000,
        },
      ],
    });
  });

  it("keeps an empty interval empty", () => {
    expect(
      splitDailyUsage(
        { startAt: "2026-11-01T00:00:00.000Z", endAt: "2026-11-01T00:00:00.000Z" },
        "UTC",
      ),
    ).toEqual({ ok: true, value: [] });
  });

  it.each([
    { startAt: "invalid", endAt: "2026-11-01T00:00:00.000Z" },
    { startAt: "2026-11-02T00:00:00.000Z", endAt: "2026-11-01T00:00:00.000Z" },
    { startAt: "2026-11-01T00:00:00.000Z", endAt: "invalid" },
  ])("refuses an invalid source interval: %j", (interval) => {
    expect(splitDailyUsage(interval, "UTC")).toEqual({
      ok: false,
      error: "usage/invalid-interval",
    });
  });

  it("refuses an unknown zone", () => {
    expect(
      splitDailyUsage(
        { startAt: "2026-11-01T00:00:00.000Z", endAt: "2026-11-02T00:00:00.000Z" },
        "Nowhere/Land",
      ),
    ).toEqual({ ok: false, error: "usage/invalid-zone" });
  });

  it("partitions the interval without gaps, duplicates or lost milliseconds", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 * 86_400 }),
        fc.integer({ min: 1, max: 7 * 86_400 }),
        fc.constantFrom("UTC", "America/New_York", "Europe/Berlin", "Asia/Kathmandu"),
        (offset, seconds, zone) => {
          const start = Date.parse("2026-01-01T00:00:00.000Z") + offset * 1000;
          const interval = {
            startAt: new Date(start).toISOString(),
            endAt: new Date(start + seconds * 1000).toISOString(),
          };
          const result = splitDailyUsage(interval, zone);
          const pieces = result.ok ? result.value : [];
          expect(result.ok).toBe(true);
          expect(pieces[0]?.from).toBe(interval.startAt);
          expect(pieces.at(-1)?.to).toBe(interval.endAt);
          expect(pieces.reduce((sum, piece) => sum + piece.milliseconds, 0)).toBe(seconds * 1000);
          expect(
            pieces.every(
              (piece, index) =>
                piece.milliseconds > 0 && (index === 0 || pieces[index - 1]?.to === piece.from),
            ),
          ).toBe(true);
          expect(new Set(pieces.map((piece) => piece.day)).size).toBe(pieces.length);
        },
      ),
    );
  });
});
