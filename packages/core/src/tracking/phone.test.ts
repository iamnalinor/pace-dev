import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type PhoneEvent, SLEEP_MIN_MINUTES, WAKE_UP_MAX_MINUTES } from "./phone-use.ts";
import { appSessions, appUsage, detectSleep, phonePickupAt, screenOnIntervals } from "./phone.ts";

const MOSCOW = "Europe/Moscow";
/** Moscow wall clock on Oct 7–8 2026 (UTC+3) as an ISO instant. */
const msk = (day: 7 | 8, hhmm: string): string => {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, day, hours - 3, minutes)).toISOString();
};
const on = (at: string): PhoneEvent => ({ at, kind: "screen-on" });
const off = (at: string): PhoneEvent => ({ at, kind: "screen-off" });
const unlock = (at: string): PhoneEvent => ({ at, kind: "unlock" });
const lock = (at: string): PhoneEvent => ({ at, kind: "lock" });
const app = (kind: "app-start" | "app-stop", at: string, name: string): PhoneEvent => ({
  app: name,
  at,
  kind,
});

/** Someone used the phone (unlocked it) from `from` to `to`. */
const used = (from: string, to: string): readonly PhoneEvent[] => [on(from), unlock(from), off(to)];
/** A notification lit the screen; nobody unlocked it. */
const lit = (at: string): readonly PhoneEvent[] => [on(at), off(at)];
const sleepOf = (events: readonly PhoneEvent[], now: string) =>
  detectSleep(events, { now, zone: MOSCOW });
const iso = (ms: number): string => new Date(ms).toISOString();
const MINUTE = 60_000;
const minutesOf = (spells: readonly { readonly gap: number; readonly use: number }[]): number =>
  spells.reduce((sum, spell) => sum + spell.gap + spell.use, 0);
/** Uses laid end to end from `start`: each waits `gap` minutes, then lasts `use` minutes. */
const layOut = (
  start: number,
  spells: readonly { readonly gap: number; readonly use: number }[],
): readonly { readonly from: number; readonly to: number }[] =>
  spells.map((spell, index) => {
    const before = minutesOf(spells.slice(0, index));
    const from = start + (before + spell.gap) * MINUTE;
    return { from, to: from + spell.use * MINUTE };
  });
const usesOf = (intervals: readonly { readonly from: number; readonly to: number }[]) =>
  intervals.flatMap((interval) => used(iso(interval.from), iso(interval.to)));
/** Notification wakes every 13 minutes from 18:00 on the 7th. */
const EVENING = Date.parse(msk(7, "18:00"));
const NOTIFICATIONS = Array.from({ length: 40 }, (_, index) =>
  lit(iso(EVENING + index * 13 * MINUTE)),
).flat();
type Bounds = { readonly maxGap: number; readonly maxUse: number; readonly maxLength: number };
const spellsOf = ({ maxGap, maxLength, maxUse }: Bounds) => {
  const spell = fc.record({
    gap: fc.integer({ max: maxGap, min: 1 }),
    use: fc.integer({ max: maxUse, min: 1 }),
  });
  return fc.array(spell, { maxLength, minLength: 2 });
};

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
  it("is the night between the last use and the first, short wake-ups inside it", () => {
    const night = [
      ...used(msk(7, "22:00"), msk(7, "23:50")),
      ...used(msk(8, "03:10"), msk(8, "03:14")),
      ...used(msk(8, "07:40"), msk(8, "07:50")),
    ];
    expect(sleepOf(night, msk(8, "09:05"))).toEqual({
      endAt: msk(8, "07:40"),
      minutes: 466,
      startAt: msk(7, "23:50"),
      wakeUps: 1,
    });
  });

  // The owner's night of Oct 25–26: the evening's phone use was rare, they woke at 02:27 and
  // used the phone for a few minutes, again at 05:55, and got up at 08:37.
  const owners = [
    ...used(msk(7, "18:09"), msk(7, "18:10")),
    ...used(msk(7, "18:15"), msk(7, "18:19")),
    ...used(msk(7, "19:18"), msk(7, "19:20")),
    ...used(msk(7, "19:34"), msk(7, "19:39")),
    ...used(msk(7, "20:06"), msk(7, "20:07")),
    ...used(msk(7, "20:30"), msk(7, "20:36")),
    ...used(msk(7, "20:40"), msk(7, "20:47")),
    ...used(msk(7, "20:57"), msk(7, "20:58")),
    ...used(msk(7, "22:40"), msk(7, "22:43")),
    // Notifications light the screen all evening and night.
    ...NOTIFICATIONS,
    ...used(msk(8, "02:27"), msk(8, "02:33")),
    ...used(msk(8, "05:55"), msk(8, "06:06")),
    ...used(msk(8, "08:37"), msk(8, "08:56")),
  ];

  it("does not count a quiet evening as sleep", () => {
    expect(sleepOf(owners, msk(8, "09:00"))?.startAt).toBe(msk(7, "22:43"));
  });

  it("keeps a night wake-up of several minutes inside the night", () => {
    expect(sleepOf(owners, msk(8, "09:00"))).toMatchObject({
      endAt: msk(8, "08:37"),
      wakeUps: 2,
    });
  });

  it("leaves the time awake out of the minutes slept", () => {
    // 22:43 → 08:37 is 594 minutes; awake 02:27–02:33 and 05:55–06:06.
    expect(sleepOf(owners, msk(8, "09:00"))?.minutes).toBe(594 - 6 - 11);
  });

  it("does not start before 21:00 when the phone was put away earlier", () => {
    const early = [
      ...used(msk(7, "19:40"), msk(7, "19:52")),
      ...used(msk(8, "06:29"), msk(8, "06:31")),
    ];
    expect(sleepOf(early, msk(8, "07:00"))).toMatchObject({
      endAt: msk(8, "06:29"),
      startAt: msk(7, "21:00"),
    });
  });

  it("ends at the morning's first use when short checks follow with little rest between", () => {
    const morning = [
      ...used(msk(7, "23:58"), msk(8, "01:07")),
      ...used(msk(8, "08:28"), msk(8, "08:31")),
      ...used(msk(8, "09:23"), msk(8, "09:25")),
      ...used(msk(8, "10:14"), msk(8, "10:17")),
    ];
    expect(sleepOf(morning, msk(8, "10:30"))).toMatchObject({
      endAt: msk(8, "08:28"),
      startAt: msk(8, "01:07"),
      wakeUps: 0,
    });
  });

  it("splits the night at a long wake-up and keeps the longer part", () => {
    const restless = [
      ...used(msk(7, "23:00"), msk(7, "23:30")),
      ...used(msk(8, "02:00"), msk(8, "02:40")),
      ...used(msk(8, "08:00"), msk(8, "08:05")),
    ];
    expect(sleepOf(restless, msk(8, "08:10"))).toMatchObject({
      endAt: msk(8, "08:00"),
      startAt: msk(8, "02:40"),
      wakeUps: 0,
    });
  });

  it("does not stretch the night back over the evening for a use before midnight", () => {
    const late = [
      ...used(msk(7, "19:20"), msk(7, "19:24")),
      ...used(msk(7, "23:56"), msk(7, "23:58")),
      ...used(msk(8, "07:33"), msk(8, "07:36")),
    ];
    expect(sleepOf(late, msk(8, "08:00"))).toMatchObject({
      startAt: msk(7, "23:58"),
      wakeUps: 0,
    });
  });

  it("counts an app in front as use, and a screen lit by a notification as none", () => {
    const apps = [
      { app: "org.telegram", at: msk(7, "23:00"), kind: "app-start" as const },
      off(msk(7, "23:20")),
      ...lit(msk(8, "02:00")),
      ...lit(msk(8, "04:00")),
      { app: "org.telegram", at: msk(8, "07:30"), kind: "app-start" as const },
      off(msk(8, "07:40")),
    ];
    expect(sleepOf(apps, msk(8, "08:00"))).toEqual({
      endAt: msk(8, "07:30"),
      minutes: 490,
      startAt: msk(7, "23:20"),
      wakeUps: 0,
    });
  });

  it("does not stretch a use over the night when its screen-off was never written", () => {
    // Unlocked at 23:30; the screen-off was lost (the phone died); back on at 07:40.
    const lost = [
      on(msk(7, "23:30")),
      unlock(msk(7, "23:30")),
      ...used(msk(8, "07:40"), msk(8, "07:45")),
    ];
    expect(sleepOf(lost, msk(8, "08:00"))).toMatchObject({
      endAt: msk(8, "07:40"),
      startAt: msk(7, "23:30"),
    });
  });

  it("does not take an alarm or a call over the lock screen for use", () => {
    const alarm = [
      ...used(msk(7, "23:00"), msk(7, "23:30")),
      lock(msk(7, "23:30")),
      { app: "com.google.android.deskclock", at: msk(8, "07:00"), kind: "app-start" as const },
      off(msk(8, "07:02")),
      ...used(msk(8, "08:30"), msk(8, "08:40")),
    ];
    expect(sleepOf(alarm, msk(8, "09:00"))).toMatchObject({
      endAt: msk(8, "08:30"),
      wakeUps: 0,
    });
  });

  it("prefers the night to a morning with the phone left in a bag", () => {
    const morning = [
      ...used(msk(7, "23:00"), msk(7, "23:30")),
      // A long wake-up splits the night in two.
      ...used(msk(8, "03:00"), msk(8, "03:40")),
      ...used(msk(8, "06:30"), msk(8, "08:00")),
      ...used(msk(8, "11:45"), msk(8, "11:50")),
    ];
    expect(sleepOf(morning, msk(8, "12:00"))).toMatchObject({
      endAt: msk(8, "03:00"),
      startAt: msk(7, "23:30"),
    });
  });

  it("ignores a daytime break and anything shorter than three hours", () => {
    const day = [
      ...used(msk(8, "12:30"), msk(8, "13:00")),
      ...used(msk(8, "17:30"), msk(8, "17:40")),
    ];
    expect(sleepOf(day, msk(8, "18:00"))).toBeNull();
    const short = [
      ...used(msk(8, "01:00"), msk(8, "01:10")),
      ...used(msk(8, "03:00"), msk(8, "03:05")),
    ];
    expect(sleepOf(short, msk(8, "03:10"))).toBeNull();
  });

  it("needs the phone to be used again: a rest still running is not judged yet", () => {
    const unfinished = [...used(msk(7, "23:00"), msk(7, "23:30")), ...lit(msk(8, "06:00"))];
    expect(sleepOf(unfinished, msk(8, "07:00"))).toBeNull();
  });

  it("never finds sleep in a day where the phone is used at least every 40 minutes", () => {
    fc.assert(
      fc.property(spellsOf({ maxGap: 40, maxLength: 80, maxUse: 60 }), (spells) => {
        const start = Date.parse(msk(7, "18:00"));
        const events = usesOf(layOut(start, spells));
        expect(sleepOf(events, iso(start + 3 * 86_400_000))).toBeNull();
      }),
    );
  });

  it("finds a sleep that is long enough, inside its own bounds, with no use longer than a wake-up", () => {
    fc.assert(
      fc.property(spellsOf({ maxGap: 400, maxLength: 30, maxUse: 90 }), (spells) => {
        const intervals = layOut(Date.parse(msk(7, "12:00")), spells);
        const sleep = sleepOf(usesOf(intervals), iso((intervals.at(-1)?.to ?? 0) + MINUTE));
        if (sleep === null) {
          return;
        }
        const from = Date.parse(sleep.startAt);
        const to = Date.parse(sleep.endAt);
        expect(sleep.minutes).toBeGreaterThanOrEqual(SLEEP_MIN_MINUTES);
        expect(sleep.minutes).toBeLessThanOrEqual((to - from) / MINUTE);
        const inside = intervals.filter((interval) => interval.from < to && interval.to > from);
        const isShort = (interval: { readonly from: number; readonly to: number }): boolean =>
          interval.to - interval.from <= WAKE_UP_MAX_MINUTES * MINUTE;
        expect(inside.every((interval) => isShort(interval))).toBe(true);
        expect(inside.length === 0).toBe(sleep.wakeUps === 0);
      }),
    );
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
