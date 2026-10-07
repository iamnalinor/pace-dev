import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  addMinutesIso,
  endOfDayIn,
  formatInZone,
  isoWeekKey,
  isValidTimeZone,
  minutesBetween,
  startOfDayIn,
  startOfWeekIn,
  zonesDiffer,
} from "./time.ts";

const BERLIN = "Europe/Berlin";
const NEW_YORK = "America/New_York";
const MOSCOW = "Europe/Moscow";
const ZONES = [BERLIN, NEW_YORK, MOSCOW, "UTC", "Asia/Tokyo", "Pacific/Auckland"];

const msArb = fc.integer({ max: Date.UTC(2030, 0, 1), min: Date.UTC(2020, 0, 1) });
const instantArb = msArb.map((ms) => new Date(ms).toISOString());
const zoneArb = fc.constantFrom(...ZONES);
const minutesArb = fc.integer({ max: 100_000, min: -100_000 });

describe("startOfDayIn / endOfDayIn", () => {
  it("spans 23 hours on the Berlin spring-forward day", () => {
    const at = "2026-03-29T10:00:00.000Z";
    expect(startOfDayIn(at, BERLIN)).toBe("2026-03-28T23:00:00.000Z");
    expect(endOfDayIn(at, BERLIN)).toBe("2026-03-29T21:59:59.999Z");
  });

  it("spans 25 hours on the New York fall-back day", () => {
    const at = "2026-11-01T12:00:00.000Z";
    expect(startOfDayIn(at, NEW_YORK)).toBe("2026-11-01T04:00:00.000Z");
    expect(endOfDayIn(at, NEW_YORK)).toBe("2026-11-02T04:59:59.999Z");
  });

  it("uses the zone's calendar day, not UTC's", () => {
    // 23:30 UTC is already the next day in Moscow (02:30).
    expect(startOfDayIn("2026-10-06T23:30:00.000Z", MOSCOW)).toBe("2026-10-06T21:00:00.000Z");
    expect(endOfDayIn("2026-10-06T23:30:00.000Z", MOSCOW)).toBe("2026-10-07T20:59:59.999Z");
  });

  it("brackets the instant and is idempotent", () => {
    fc.assert(
      fc.property(instantArb, zoneArb, (at, zone) => {
        const start = startOfDayIn(at, zone);
        const end = endOfDayIn(at, zone);
        expect(start <= at).toBe(true);
        expect(at <= end).toBe(true);
        expect(startOfDayIn(start, zone)).toBe(start);
        expect(endOfDayIn(end, zone)).toBe(end);
        expect(formatInZone(start, zone, "HH:mm:ss.SSS")).toBe("00:00:00.000");
        expect(formatInZone(end, zone, "HH:mm:ss.SSS")).toBe("23:59:59.999");
      }),
    );
  });
});

describe("startOfWeekIn", () => {
  it("starts the week on Monday in the zone", () => {
    // Tuesday 2026-10-06 in Berlin (CEST, +02:00).
    expect(startOfWeekIn("2026-10-06T12:00:00.000Z", BERLIN)).toBe("2026-10-04T22:00:00.000Z");
    // Sunday 23:00 CEST is still the same week in Berlin, but Monday in UTC would differ.
    expect(startOfWeekIn("2026-10-11T21:00:00.000Z", BERLIN)).toBe("2026-10-04T22:00:00.000Z");
    expect(startOfWeekIn("2026-10-11T21:00:00.000Z", "UTC")).toBe("2026-10-05T00:00:00.000Z");
  });

  it("is a Monday midnight at most 7 days before the instant", () => {
    fc.assert(
      fc.property(instantArb, zoneArb, (at, zone) => {
        const start = startOfWeekIn(at, zone);
        expect(formatInZone(start, zone, "i HH:mm")).toBe("1 00:00");
        expect(minutesBetween(start, at)).toBeGreaterThanOrEqual(0);
        expect(minutesBetween(start, at)).toBeLessThan(7 * 24 * 60 + 60);
      }),
    );
  });
});

describe("isoWeekKey", () => {
  it("formats the ISO week-numbering year and week", () => {
    expect(isoWeekKey("2026-10-06T12:00:00.000Z", BERLIN)).toBe("2026-W41");
    expect(isoWeekKey("2026-01-05T12:00:00.000Z", BERLIN)).toBe("2026-W02");
  });

  it("handles the year boundary (2026 has 53 ISO weeks)", () => {
    expect(isoWeekKey("2026-12-31T12:00:00.000Z", BERLIN)).toBe("2026-W53");
    expect(isoWeekKey("2027-01-01T12:00:00.000Z", BERLIN)).toBe("2026-W53");
    expect(isoWeekKey("2027-01-04T12:00:00.000Z", BERLIN)).toBe("2027-W01");
    expect(isoWeekKey("2025-12-29T12:00:00.000Z", BERLIN)).toBe("2026-W01");
  });

  it("depends on the zone's local date", () => {
    // Sunday 23:30 UTC → still 2026-W01 in UTC, already Monday (W02) in Tokyo.
    expect(isoWeekKey("2026-01-04T23:30:00.000Z", "UTC")).toBe("2026-W01");
    expect(isoWeekKey("2026-01-04T23:30:00.000Z", "Asia/Tokyo")).toBe("2026-W02");
  });

  it("is constant across the week starting at startOfWeekIn", () => {
    fc.assert(
      fc.property(instantArb, zoneArb, (at, zone) => {
        expect(isoWeekKey(startOfWeekIn(at, zone), zone)).toBe(isoWeekKey(at, zone));
      }),
    );
  });
});

describe("addMinutesIso / minutesBetween", () => {
  it("adds wall-clock-independent minutes", () => {
    expect(addMinutesIso("2026-03-29T00:30:00.000Z", 60)).toBe("2026-03-29T01:30:00.000Z");
    expect(addMinutesIso("2026-03-29T00:30:00.000Z", -30)).toBe("2026-03-29T00:00:00.000Z");
  });

  it("measures signed minutes from a to b", () => {
    expect(minutesBetween("2026-01-01T00:00:00.000Z", "2026-01-01T01:30:00.000Z")).toBe(90);
    expect(minutesBetween("2026-01-01T01:30:00.000Z", "2026-01-01T00:00:00.000Z")).toBe(-90);
  });

  it("round-trips", () => {
    fc.assert(
      fc.property(instantArb, minutesArb, (at, minutes) => {
        expect(minutesBetween(at, addMinutesIso(at, minutes))).toBe(minutes);
      }),
    );
  });
});

describe("formatInZone", () => {
  it("formats the wall clock of the zone", () => {
    expect(formatInZone("2026-07-01T12:00:00.000Z", NEW_YORK, "yyyy-MM-dd HH:mm")).toBe(
      "2026-07-01 08:00",
    );
    expect(formatInZone("2026-07-01T12:00:00.000Z", MOSCOW, "HH:mm")).toBe("15:00");
  });
});

describe("zonesDiffer", () => {
  it("compares UTC offsets at the instant", () => {
    const summer = "2026-07-01T12:00:00.000Z";
    const winter = "2026-01-15T12:00:00.000Z";
    expect(zonesDiffer({ at: summer, tz: MOSCOW }, { at: summer, tz: BERLIN })).toBe(true);
    expect(zonesDiffer({ at: summer, tz: BERLIN }, { at: summer, tz: "Europe/Paris" })).toBe(false);
    expect(zonesDiffer({ at: winter, tz: "Europe/London" }, { at: winter, tz: "UTC" })).toBe(false);
    expect(zonesDiffer({ at: summer, tz: "Europe/London" }, { at: summer, tz: "UTC" })).toBe(true);
  });

  it("is false for the same zone and symmetric", () => {
    fc.assert(
      fc.property(instantArb, zoneArb, zoneArb, (at, a, b) => {
        expect(zonesDiffer({ at, tz: a }, { at, tz: a })).toBe(false);
        expect(zonesDiffer({ at, tz: a }, { at, tz: b })).toBe(
          zonesDiffer({ at, tz: b }, { at, tz: a }),
        );
      }),
    );
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and UTC", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects unknown names", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
