import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { formatInZone, wallClockInstant } from "@pace/core";

import { armEarliest, nextSleepCheckAt } from "./alarm.ts";

const MOSCOW = "Europe/Moscow";
const NEW_YORK = "America/New_York";
const MINUTE = 60_000;

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

describe("the store's one alarm", () => {
  it("moves only earlier: a later time never replaces one set before it", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const base = Date.now() + 3_600_000;
      await armEarliest(state.storage, base);
      expect(await state.storage.getAlarm()).toBe(base);
      await armEarliest(state.storage, base + MINUTE);
      expect(await state.storage.getAlarm()).toBe(base);
      await armEarliest(state.storage, base - MINUTE);
      expect(await state.storage.getAlarm()).toBe(base - MINUTE);
    });
  });
});

/** Every minute of two days from noon on `day` in `zone`. */
const minutesFrom = (day: string, zone: string): readonly string[] => {
  const start = Date.parse(wallClockInstant(day, "12:00", zone));
  return Array.from({ length: 2 * 24 * 60 }, (_, index) =>
    new Date(start + index * MINUTE).toISOString(),
  );
};

describe("when automatic sleep looks again", () => {
  it("looks every hour from 21:00 to noon, and waits for 21:00 by day (class 9)", () => {
    expect(nextSleepCheckAt("2026-10-07T17:59:00.000Z", MOSCOW)).toBe(
      Date.parse("2026-10-07T18:00:00.000Z"),
    );
    expect(nextSleepCheckAt("2026-10-07T18:00:00.000Z", MOSCOW)).toBe(
      Date.parse("2026-10-07T19:00:00.000Z"),
    );
    expect(nextSleepCheckAt("2026-10-08T08:59:00.000Z", MOSCOW)).toBe(
      Date.parse("2026-10-08T09:59:00.000Z"),
    );
    expect(nextSleepCheckAt("2026-10-08T09:00:00.000Z", MOSCOW)).toBe(
      Date.parse("2026-10-08T18:00:00.000Z"),
    );
  });

  it("is always ahead: an hour in the night, a 21:00 the same day otherwise, across DST", () => {
    for (const [day, zone] of [
      ["2026-10-07", MOSCOW],
      ["2026-10-31", NEW_YORK],
      ["2026-03-07", NEW_YORK],
    ] as const) {
      for (const now of minutesFrom(day, zone)) {
        const hour = Number(formatInZone(now, zone, "H"));
        const today = formatInZone(now, zone, "yyyy-MM-dd");
        const expected =
          hour >= 21 || hour < 12
            ? Date.parse(now) + 60 * MINUTE
            : Date.parse(wallClockInstant(today, "21:00", zone));
        expect(nextSleepCheckAt(now, zone)).toBe(expected);
        expect(expected).toBeGreaterThan(Date.parse(now));
      }
    }
  });
});
