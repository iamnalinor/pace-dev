import { describe, expect, it } from "vitest";

import type { PhoneEvent } from "./phone-use.ts";

import { appSessions, appUsage, phonePickupAt, screenOnIntervals } from "./phone.ts";

/** Moscow wall clock on Oct 7–8 2026 (UTC+3) as an ISO instant. */
const msk = (day: 7 | 8, hhmm: string): string => {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, day, hours - 3, minutes)).toISOString();
};
const on = (at: string): PhoneEvent => ({ at, kind: "screen-on" });
const off = (at: string): PhoneEvent => ({ at, kind: "screen-off" });
const unlock = (at: string): PhoneEvent => ({ at, kind: "unlock" });
const app = (kind: "app-start" | "app-stop", at: string, name: string): PhoneEvent => ({
  app: name,
  at,
  kind,
});

describe("screen-on intervals", () => {
  it("pairs each screen-on with the next screen-off and closes an open one at now", () => {
    const events = [on(msk(7, "10:00")), off(msk(7, "10:20")), on(msk(7, "11:00"))];
    expect(screenOnIntervals(events, msk(7, "11:30"))).toEqual([
      { endAt: msk(7, "10:20"), startAt: msk(7, "10:00") },
      { endAt: msk(7, "11:30"), startAt: msk(7, "11:00") },
    ]);
  });
});

describe("app usage", () => {
  it("sums foreground minutes per app inside a window, largest first", () => {
    const events = [
      on(msk(8, "10:00")),
      app("app-start", msk(8, "10:00"), "org.telegram.messenger"),
      app("app-start", msk(8, "10:12"), "com.google.android.youtube"),
      app("app-stop", msk(8, "10:20"), "com.google.android.youtube"),
      app("app-start", msk(8, "10:25"), "org.telegram.messenger"),
      off(msk(8, "10:30")),
      on(msk(8, "11:00")),
      app("app-start", msk(8, "11:00"), "com.google.android.youtube"),
    ];
    expect(
      appUsage(events, { from: msk(8, "10:05"), now: msk(8, "11:10"), to: msk(8, "11:05") }),
    ).toEqual([
      { app: "com.google.android.youtube", minutes: 13 },
      { app: "org.telegram.messenger", minutes: 12 },
    ]);
  });
});

describe("app sessions", () => {
  it("lists each app's spells in front, a minute or longer, the one still open ending now", () => {
    const events = [
      on(msk(8, "10:00")),
      app("app-start", msk(8, "10:00"), "org.telegram.messenger"),
      app("app-start", msk(8, "10:12"), "com.android.chrome"),
      app("app-start", msk(8, "10:12"), "org.telegram.messenger"),
      off(msk(8, "10:30")),
      on(msk(8, "11:00")),
      app("app-start", msk(8, "11:00"), "com.google.android.youtube"),
    ];
    expect(appSessions(events, msk(8, "11:10"))).toEqual([
      { app: "org.telegram.messenger", endAt: msk(8, "10:12"), startAt: msk(8, "10:00") },
      { app: "org.telegram.messenger", endAt: msk(8, "10:30"), startAt: msk(8, "10:12") },
      { app: "com.google.android.youtube", endAt: msk(8, "11:10"), startAt: msk(8, "11:00") },
    ]);
  });
});

describe("phone pickup", () => {
  it("is the start of the phone session still going on now, short screen-offs included", () => {
    const events = [
      on(msk(8, "13:00")),
      unlock(msk(8, "13:00")),
      off(msk(8, "13:05")),
      on(msk(8, "14:32")),
      unlock(msk(8, "14:32")),
      off(msk(8, "14:40")),
      // Off for a minute only: the same session.
      on(msk(8, "14:41")),
      unlock(msk(8, "14:41")),
    ];
    expect(phonePickupAt(events, msk(8, "14:50"))).toBe(msk(8, "14:32"));
  });

  it("does not take a screen lit by a notification for the pickup", () => {
    const events = [
      { at: msk(8, "14:30"), kind: "screen-on" as const },
      { at: msk(8, "14:31"), kind: "screen-off" as const },
      on(msk(8, "14:32")),
      unlock(msk(8, "14:32")),
    ];
    expect(phonePickupAt(events, msk(8, "14:50"))).toBe(msk(8, "14:32"));
  });

  it("is unknown while nobody is using the phone", () => {
    const events = [on(msk(8, "13:00")), unlock(msk(8, "13:00")), off(msk(8, "13:05"))];
    expect(phonePickupAt(events, msk(8, "14:00"))).toBeNull();
    const lit = [on(msk(8, "13:58"))];
    expect(phonePickupAt(lit, msk(8, "14:00"))).toBeNull();
    expect(phonePickupAt([], msk(8, "14:00"))).toBeNull();
  });
});
