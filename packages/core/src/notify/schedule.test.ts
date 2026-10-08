import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../model/settings.ts";
import { isQuietAt, lastDigestWindow, nextDigestAt } from "./schedule.ts";

const MOSCOW = "Europe/Moscow";

describe("digest windows", () => {
  it("finds the next window today, then tomorrow morning", () => {
    expect(nextDigestAt("2026-10-07T07:30:00.000Z", MOSCOW, DEFAULT_SETTINGS)).toBe(
      "2026-10-07T11:00:00.000Z",
    );
    expect(nextDigestAt("2026-10-07T18:00:00.000Z", MOSCOW, DEFAULT_SETTINGS)).toBe(
      "2026-10-08T06:00:00.000Z",
    );
  });

  it("finds the window that just passed, yesterday's evening before the first one", () => {
    expect(lastDigestWindow("2026-10-07T11:05:00.000Z", MOSCOW, DEFAULT_SETTINGS)).toBe(
      "2026-10-07T11:00:00.000Z",
    );
    expect(lastDigestWindow("2026-10-07T04:00:00.000Z", MOSCOW, DEFAULT_SETTINGS)).toBe(
      "2026-10-06T18:00:00.000Z",
    );
  });

  it("has no windows when the account turned them all off", () => {
    const none = { ...DEFAULT_SETTINGS, digestWindows: [] };
    expect(nextDigestAt("2026-10-07T07:30:00.000Z", MOSCOW, none)).toBeNull();
  });
});

describe("quiet hours", () => {
  it("wraps past midnight", () => {
    expect(isQuietAt("2026-10-07T20:30:00.000Z", MOSCOW, DEFAULT_SETTINGS)).toBe(true);
    expect(isQuietAt("2026-10-07T04:59:00.000Z", MOSCOW, DEFAULT_SETTINGS)).toBe(true);
    expect(isQuietAt("2026-10-07T05:00:00.000Z", MOSCOW, DEFAULT_SETTINGS)).toBe(false);
  });

  it("handles a range inside one day and an empty range", () => {
    const nap = { ...DEFAULT_SETTINGS, quietHours: { from: "13:00", to: "15:00" } };
    expect(isQuietAt("2026-10-07T10:30:00.000Z", MOSCOW, nap)).toBe(true);
    expect(isQuietAt("2026-10-07T12:30:00.000Z", MOSCOW, nap)).toBe(false);
    const off = { ...DEFAULT_SETTINGS, quietHours: { from: "00:00", to: "00:00" } };
    expect(isQuietAt("2026-10-07T21:00:00.000Z", MOSCOW, off)).toBe(false);
  });
});
