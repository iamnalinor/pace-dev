import { describe, expect, it } from "vitest";

import {
  appSessions,
  appUsage,
  detectSleep,
  type PhoneEvent,
  phonePickupAt,
  screenOnIntervals,
} from "./phone.ts";

const MOSCOW = "Europe/Moscow";
/** Moscow wall clock on Oct 7–8 2026 (UTC+3) as an ISO instant. */
const msk = (day: 7 | 8, hhmm: string): string => {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, day, hours - 3, minutes)).toISOString();
};
const on = (at: string): PhoneEvent => ({ at, kind: "screen-on" });
const off = (at: string): PhoneEvent => ({ at, kind: "screen-off" });
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

describe("sleep detection", () => {
  const night = [
    on(msk(7, "22:00")),
    off(msk(7, "23:50")),
    // A glance at 03:10 for four minutes is a wake-up; ten minutes at 07:40 is the morning.
    on(msk(8, "03:10")),
    off(msk(8, "03:14")),
    on(msk(8, "07:40")),
    off(msk(8, "07:50")),
    on(msk(8, "09:00")),
  ];

  it("finds the longest screen-off stretch of the night, merging short glances", () => {
    expect(detectSleep(night, { now: msk(8, "09:05"), zone: MOSCOW })).toEqual({
      endAt: msk(8, "07:40"),
      minutes: 470,
      startAt: msk(7, "23:50"),
      wakeUps: 1,
    });
  });

  it("splits the night at a long wake-up and keeps the longer part", () => {
    const restless = [
      on(msk(7, "23:00")),
      off(msk(7, "23:30")),
      on(msk(8, "02:00")),
      off(msk(8, "02:40")),
      on(msk(8, "08:00")),
    ];
    expect(detectSleep(restless, { now: msk(8, "08:10"), zone: MOSCOW })).toMatchObject({
      endAt: msk(8, "08:00"),
      startAt: msk(8, "02:40"),
      wakeUps: 0,
    });
  });

  it("ignores a daytime break and anything shorter than three hours", () => {
    const day = [on(msk(8, "12:30")), off(msk(8, "13:00")), on(msk(8, "17:30"))];
    expect(detectSleep(day, { now: msk(8, "18:00"), zone: MOSCOW })).toBeNull();
    const short = [on(msk(8, "01:00")), off(msk(8, "01:10")), on(msk(8, "03:00"))];
    expect(detectSleep(short, { now: msk(8, "03:10"), zone: MOSCOW })).toBeNull();
  });

  it("needs the phone to be back on: a stretch still running is not judged yet", () => {
    const unfinished = [on(msk(7, "23:00")), off(msk(7, "23:30"))];
    expect(detectSleep(unfinished, { now: msk(8, "07:00"), zone: MOSCOW })).toBeNull();
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
      off(msk(8, "13:05")),
      on(msk(8, "14:32")),
      off(msk(8, "14:40")),
      // Off for a minute only: the same session.
      on(msk(8, "14:41")),
    ];
    expect(phonePickupAt(events, msk(8, "14:50"))).toBe(msk(8, "14:32"));
  });

  it("is unknown while the screen is off", () => {
    const events = [on(msk(8, "13:00")), off(msk(8, "13:05"))];
    expect(phonePickupAt(events, msk(8, "14:00"))).toBeNull();
    expect(phonePickupAt([], msk(8, "14:00"))).toBeNull();
  });
});
