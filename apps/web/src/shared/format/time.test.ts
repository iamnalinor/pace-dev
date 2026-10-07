import { describe, expect, it } from "vitest";

import { HW_DUE, MOSCOW, NOW, TRK_DUE } from "@pace/core/testing";

import {
  formatDateTime,
  formatDayTime,
  formatDue,
  formatTime,
  formatZoned,
  zoneLabel,
} from "./time.ts";

describe("formatTime", () => {
  it("reads the wall clock of the zone on a 24h dial", () => {
    expect(formatTime(HW_DUE, MOSCOW, "en")).toBe("23:59");
    expect(formatTime(HW_DUE, "UTC", "en")).toBe("20:59");
    expect(formatTime("2026-10-07T00:05:00.000Z", "UTC", "en")).toBe("00:05");
  });
});

describe("zoneLabel", () => {
  it("names the zone briefly", () => {
    expect(zoneLabel(HW_DUE, MOSCOW, "en")).toMatch(/^(?:GMT\+3|MSK)$/);
    expect(zoneLabel(HW_DUE, "UTC", "en")).toMatch(/^(?:UTC|GMT)$/);
  });
});

describe("formatDayTime", () => {
  it("uses the relative day word, the weekday within the week, else the date", () => {
    expect(formatDayTime(HW_DUE, NOW, MOSCOW, "en")).toBe("tomorrow 23:59");
    expect(formatDayTime(TRK_DUE, NOW, "UTC", "en")).toBe("Friday 18:00");
    expect(formatDayTime("2026-10-20T06:00:00.000Z", NOW, MOSCOW, "en")).toBe("Oct 20 09:00");
    expect(formatDayTime(HW_DUE, NOW, MOSCOW, "ru")).toBe("завтра 23:59");
  });
});

describe("formatDateTime", () => {
  it("shows the short date with the time", () => {
    expect(formatDateTime(HW_DUE, MOSCOW, "en")).toBe("Oct 7, 23:59");
  });
});

describe("formatZoned", () => {
  const base = { at: HW_DUE, language: "en" as const, now: NOW, tz: MOSCOW };

  it("shows only the own-zone time when the device is in the same zone", () => {
    expect(formatZoned({ ...base, deviceTz: MOSCOW, mode: "due" })).toBe("tomorrow 23:59");
    expect(formatZoned({ ...base, deviceTz: MOSCOW, mode: "datetime" })).toBe("Oct 7, 23:59");
  });

  it("adds the zone and the viewer's time when the zones differ", () => {
    const due = formatZoned({ ...base, deviceTz: "UTC", mode: "due" });
    expect(due).toMatch(/^tomorrow 23:59 (?:GMT\+3|MSK) \(your time 20:59\)$/);
    const datetime = formatZoned({ ...base, deviceTz: "UTC", mode: "datetime" });
    expect(datetime).toMatch(/^Oct 7, 23:59 (?:GMT\+3|MSK) \(your time 20:59\)$/);
  });

  it("treats zones with the same offset as the same zone", () => {
    expect(formatZoned({ ...base, deviceTz: "Europe/Minsk", mode: "due" })).toBe("tomorrow 23:59");
  });
});

describe("formatDue", () => {
  it("prefixes the meta line with Due", () => {
    expect(
      formatDue({ at: HW_DUE, tz: MOSCOW }, { deviceTz: MOSCOW, language: "en", now: NOW }),
    ).toBe("Due tomorrow 23:59");
    expect(
      formatDue({ at: HW_DUE, tz: MOSCOW }, { deviceTz: MOSCOW, language: "ru", now: NOW }),
    ).toBe("Срок завтра 23:59");
  });
});
