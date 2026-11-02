import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addMinutesIso, newId, wallClockInstant } from "@pace/core";

import type { UsageUpload } from "../src/user-store/cloud-data.ts";

import { POOL_LEASE_KEY, POOL_NEXT_AT_KEY } from "../src/user-store/pool-retry-alarm.ts";
import { UserStore } from "../src/user-store/user-store.ts";
import { meterSql } from "./helpers.ts";

const MOSCOW = "Europe/Moscow";
/** Moscow wall clock: the evening of 2099-10-07 (from noon on) and the morning after. */
const msk = (hhmm: string): string =>
  wallClockInstant(Number(hhmm.slice(0, 2)) >= 12 ? "2099-10-07" : "2099-10-08", hhmm, MOSCOW);

/**
The store's clock: only `Date` is faked, far ahead of the real one, so nothing the store arms is
ever due for workerd's own scheduler (bug-lessons class 54).
*/
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(msk("20:00")));
});

afterEach(() => {
  vi.useRealTimers();
});

/**
A deployed build (`PACE_VERSION` set), whose projection rows a cold start keeps when they mirror
the log; one without a version rewrites them on every cold start.
*/
const deployed = { ...env, PACE_VERSION: "v-test" };

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

type Raw = Record<string, unknown>;

const envelope = (type: string, payload: Raw, occurredAt: string): Raw => ({
  deviceId: "dev-1",
  id: newId(),
  occurredAt,
  payload,
  precision: "exact",
  recordedAt: occurredAt,
  source: "app",
  type,
});

/** Months of tasks, each with two problems: projection rows a rebuild rewrites. */
const history = (count: number): readonly Raw[] => [
  envelope("settings.updated", { timezone: MOSCOW }, msk("12:00")),
  ...Array.from({ length: count }, (_, index) =>
    envelope(
      "task.created",
      {
        presetId: "hw",
        subtasks: [
          { id: "s1", label: "1", number: 1 },
          { id: "s2", label: "2", number: 2 },
        ],
        taskId: newId(),
        title: `Sheet ${String(index)}`,
      },
      addMinutesIso(msk("12:00"), index),
    ),
  ),
];

/** The phone's upload at `now`: what it used, read up to five minutes before. */
const phoneUpload = (now: string, uses: UsageUpload["uses"]): UsageUpload => ({
  deviceId: "phone-1",
  deviceName: "Pixel 8",
  isPhone: true,
  sessions: [],
  until: addMinutesIso(now, -5),
  uses,
});

/** A task due at noon tomorrow, which the 09:00 digest lists; the digest's only window. */
const dueTomorrow = (): readonly Raw[] => [
  envelope("settings.updated", { digestWindows: ["09:00"], timezone: MOSCOW }, msk("12:00")),
  envelope(
    "task.created",
    {
      dueAt: msk("12:00").replace("2099-10-07", "2099-10-08"),
      dueTz: MOSCOW,
      importance: "normal",
      presetId: "personal",
      subtasks: [],
      taskId: "t-report",
      title: "Write the report",
    },
    msk("12:00"),
  ),
];

/**
Fires every alarm due by `until` as the runtime does (taken off, then run), each on a new instance:
production evicts one idle for a minute or two.
*/
const fireDue = async (state: DurableObjectState, until: string): Promise<void> => {
  for (;;) {
    const at = await state.storage.getAlarm();
    if (at === null || at > Date.parse(until)) {
      return;
    }
    vi.setSystemTime(new Date(at));
    await state.storage.deleteAlarm();
    await new UserStore(state, deployed).alarm();
  }
};

/** Fires the store's alarm at `at` as the runtime does (taken off, then run), on a new instance. */
const fireAt = async (state: DurableObjectState, at: string): Promise<void> => {
  vi.setSystemTime(new Date(at));
  await state.storage.deleteAlarm();
  await new UserStore(state, deployed).alarm();
};

const digests = (state: DurableObjectState) =>
  state.storage.sql.exec("SELECT kind FROM notifications WHERE kind = 'deadline_digest'").toArray();

const event = (index: number, title = `Seminar ${String(index)}`) => ({
  endAt: addMinutesIso(msk("10:00"), index * 1440 + 90),
  id: `ev-${String(index)}`,
  series: null,
  startAt: addMinutesIso(msk("10:00"), index * 1440),
  title,
});

const copy = (now: string, events: readonly ReturnType<typeof event>[]) => ({
  deviceId: "phone-1",
  events,
  from: addMinutesIso(now, -7 * 1440),
  ruledSeries: ["weekly-standup"],
  to: addMinutesIso(now, 14 * 1440),
});

describe("a night of automatic sleep on a cold store", () => {
  it("loads the log and writes projection rows only for what changes, whatever instance runs it", async () => {
    await runInDurableObject(freshStore(), async (warm: UserStore, state) => {
      await warm.append(history(60), { now: new Date().toISOString() });
      /**
      A store as production runs it between alarms and uploads minutes apart: a new instance each time,
      nothing in memory, the same storage.
      */
      const cold = (): UserStore => new UserStore(state, deployed);
      /** The phone's use over the night, which it tells as it ends. */
      const uses = [
        { endAt: msk("20:40"), startAt: msk("20:10") },
        { endAt: msk("23:40"), startAt: msk("23:10") },
        { endAt: msk("07:25"), startAt: msk("07:10") },
      ];
      const upload = async (now: string): Promise<void> => {
        vi.setSystemTime(new Date(now));
        const told = phoneUpload(now, []);
        const known = uses.filter((use) => use.endAt <= (told.until ?? now));
        await cold().addUsage({ ...told, uses: known }, now);
      };
      // The phone tells at 20:55 (sleep then looks every hour until noon).
      await upload(msk("20:55"));
      const { cost } = meterSql(state.storage);
      // An upload every 15 minutes from 21:10 until 09:40, alarms firing in between.
      for (let quarter = 0; quarter <= 50; quarter += 1) {
        const now = addMinutesIso(msk("21:10"), quarter * 15);
        await fireDue(state, now);
        await upload(now);
      }
      const night = cost();
      // The pool's passes at the 21:00 and 09:00 digests, and sleep's six passes where knowing
      // more could change a decision (the evening, the night's opening, the morning): one load
      // each, a pass that writes included. Before: 111 loads and 77,175 projection rows.
      expect(night.loads).toBeLessThanOrEqual(8);
      // Sleep's writes touch no task, project or preset.
      expect(night.projectionRows).toBe(0);
      const { state: after } = await cold().read(new Date().toISOString());
      expect(
        Object.values(after.time.activities)
          .filter((activity) => activity.category === "sleep")
          .map(({ endAt, startAt }) => ({ endAt, startAt })),
      ).toEqual([{ endAt: msk("07:10"), startAt: msk("23:40") }]);
    });
  });
});

describe("the notification pool at the store's alarm", () => {
  it("passes only at its own time: another wait's alarm loads no log and keeps the pool's time", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      vi.setSystemTime(new Date(msk("08:00")));
      await instance.append(dueTomorrow(), { now: msk("08:00") });
      const pass = await instance.runNotifications(msk("08:00"));
      expect(pass.nextAt).toBe(msk("09:00"));
      // Sleep's look at 08:15 (or the assistant's queue) fires the alarm first.
      await state.storage.setAlarm(Date.parse(msk("08:15")));
      const { cost } = meterSql(state.storage);
      await fireAt(state, msk("08:15"));
      expect(cost().loads).toBe(0);
      expect(digests(state)).toEqual([]);
      expect(await state.storage.getAlarm()).toBe(Date.parse(msk("09:00")));
      // At its own time the pool passes and delivers the digest.
      await fireAt(state, msk("09:00"));
      expect(digests(state)).toHaveLength(1);
    });
  });

  it("passes again at the alarm's retry when its pass failed", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      vi.setSystemTime(new Date(msk("08:00")));
      await instance.append(dueTomorrow(), { now: msk("08:00") });
      await instance.runNotifications(msk("08:00"));
      vi.setSystemTime(new Date(msk("09:00")));
      const failing = new UserStore(state, deployed);
      Object.defineProperty(failing, "derive", {
        value: async () => {
          throw new Error("the pass broke");
        },
      });
      await state.storage.deleteAlarm();
      await expect(failing.alarm()).rejects.toThrow("the pass broke");
      // The runtime runs the failed alarm again.
      await fireAt(state, msk("09:01"));
      expect(digests(state)).toHaveLength(1);
    });
  });
});

describe("the notification pool with nothing coming", () => {
  it("looks again within a day, so an event that comes into its calendar window is announced", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      const start = msk("08:00");
      vi.setSystemTime(new Date(start));
      // No digest at all, and nothing within the three days of calendar a pass reads.
      await instance.append(
        [envelope("settings.updated", { digestWindows: [], timezone: MOSCOW }, start)],
        { now: start },
      );
      await instance.runNotifications(start);
      // The return flight, four days on at 10:00, on a copy the phone sends again unchanged.
      const flight = {
        endAt: addMinutesIso(start, 4 * 1440 + 240),
        id: "ev-flight",
        series: null,
        startAt: addMinutesIso(start, 4 * 1440 + 120),
        title: "Return flight",
      };
      for (let day = 0; day <= 4; day += 1) {
        const now = addMinutesIso(start, day * 1440);
        await fireDue(state, now);
        vi.setSystemTime(new Date(now));
        await new UserStore(state, deployed).syncCalendar(copy(now, [flight]), now);
      }
      await fireDue(state, addMinutesIso(flight.startAt, 1));
      const announced = state.storage.sql
        .exec("SELECT created_at FROM notifications WHERE kind = 'event_start'")
        .toArray();
      expect(announced).toEqual([{ created_at: flight.startAt }]);
    });
  });

  it("starts its own times on a store main left with no pool time and no alarm", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      const start = msk("08:00");
      vi.setSystemTime(new Date(start));
      const flight = {
        endAt: addMinutesIso(start, 4 * 1440 + 240),
        id: "ev-flight",
        series: null,
        startAt: addMinutesIso(start, 4 * 1440 + 120),
        title: "Return flight",
      };
      await instance.append(
        [envelope("settings.updated", { digestWindows: [], timezone: MOSCOW }, start)],
        { now: start },
      );
      await instance.syncCalendar(copy(start, [flight]), start);
      // main's last pass found nothing coming and deleted the alarm; main never wrote the key.
      for (const key of [POOL_NEXT_AT_KEY, POOL_LEASE_KEY, "pool:failures"]) {
        await state.storage.delete(key);
      }
      await state.storage.deleteAlarm();
      // The new build: the phone sends the same copy every day, and nothing else happens.
      for (let day = 1; day <= 4; day += 1) {
        const now = addMinutesIso(start, day * 1440);
        await fireDue(state, now);
        vi.setSystemTime(new Date(now));
        await new UserStore(state, deployed).syncCalendar(copy(now, [flight]), now);
      }
      await fireDue(state, addMinutesIso(flight.startAt, 1));
      const announced = state.storage.sql
        .exec("SELECT created_at FROM notifications WHERE kind = 'event_start'")
        .toArray();
      expect(announced).toEqual([{ created_at: flight.startAt }]);
    });
  });
});

describe("a write on a store main left with no pool time and no alarm", () => {
  it("arms a pass at once, even when the pool finds nothing coming", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      const start = msk("08:00");
      vi.setSystemTime(new Date(start));
      await instance.append(
        [envelope("settings.updated", { digestWindows: [], timezone: MOSCOW }, start)],
        { now: start },
      );
      await state.storage.delete(POOL_NEXT_AT_KEY);
      await state.storage.deleteAlarm();
      const now = msk("09:00");
      vi.setSystemTime(new Date(now));
      await new UserStore(state, deployed).append(
        [envelope("settings.updated", { language: "ru" }, now)],
        { now },
      );
      expect(await state.storage.getAlarm()).toBe(Date.parse(now));
      await fireDue(state, now);
      expect(await state.storage.get(POOL_NEXT_AT_KEY)).toBe(Date.parse(addMinutesIso(now, 1440)));
    });
  });
});

describe("a pool pass cut short", () => {
  it("passes again once its lease runs out: the digest it was making is still delivered", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      vi.setSystemTime(new Date(msk("08:00")));
      await instance.append(dueTomorrow(), { now: msk("08:00") });
      await instance.runNotifications(msk("08:00"));
      vi.setSystemTime(new Date(msk("09:00")));
      // The isolate is reset while the 09:00 pass works (a deploy, the CPU limit): it never ends.
      const cut = new UserStore(state, deployed);
      await state.storage.deleteAlarm();
      await new Promise<void>((resolve) => {
        Object.defineProperty(cut, "derive", {
          value: async () => {
            resolve();
            await new Promise<never>(() => undefined);
          },
        });
        void cut.alarm();
      });
      // The runtime runs the alarm again within seconds, then the lease's alarm fires.
      await fireAt(state, addMinutesIso(msk("09:00"), 0.05));
      await fireDue(state, msk("09:10"));
      expect(digests(state)).toHaveLength(1);
    });
  });
});

describe("a pool pass cut short and never run again by the runtime", () => {
  it("runs at its lease's end: the digest it was making is still delivered", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      vi.setSystemTime(new Date(msk("08:00")));
      await instance.append(dueTomorrow(), { now: msk("08:00") });
      await instance.runNotifications(msk("08:00"));
      vi.setSystemTime(new Date(msk("09:00")));
      const cut = new UserStore(state, deployed);
      await state.storage.deleteAlarm();
      await new Promise<void>((resolve) => {
        Object.defineProperty(cut, "derive", {
          value: async () => {
            resolve();
            await new Promise<never>(() => undefined);
          },
        });
        void cut.alarm();
      });
      // No retry from the runtime: only the alarm the pass set at its lease's end.
      await fireDue(state, msk("09:10"));
      expect(digests(state)).toHaveLength(1);
    });
  });
});

describe("the wake at a pool lease's end", () => {
  it("loads no log after a pass that completed, and arms the pool's own time", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      vi.setSystemTime(new Date(msk("08:00")));
      await instance.append(dueTomorrow(), { now: msk("08:00") });
      await instance.runNotifications(msk("08:00"));
      expect(await state.storage.getAlarm()).toBe(Date.parse(msk("08:05")));
      const { cost } = meterSql(state.storage);
      await fireAt(state, msk("08:05"));
      expect(cost().loads).toBe(0);
      expect(await state.storage.getAlarm()).toBe(Date.parse(msk("09:00")));
    });
  });
});

describe("a pool pass that keeps failing", () => {
  it("runs again later and later, not at every lease's end", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      vi.setSystemTime(new Date(msk("08:00")));
      await instance.append(dueTomorrow(), { now: msk("08:00") });
      await instance.runNotifications(msk("08:00"));
      // Every pass from 09:00 on breaks before it loads anything; each would load the log.
      const passes: string[] = [];
      const failing = new UserStore(state, deployed);
      Object.defineProperty(failing, "derive", {
        value: async () => {
          passes.push(new Date().toISOString());
          await Promise.reject(new Error("the pass broke"));
        },
      });
      for (;;) {
        const at = await state.storage.getAlarm();
        if (at === null || at > Date.parse(addMinutesIso(msk("09:00"), 4 * 60))) {
          break;
        }
        vi.setSystemTime(new Date(at));
        await state.storage.deleteAlarm();
        // A failed pass fails the alarm; the runtime would run it again (not simulated).
        await Promise.allSettled([failing.alarm()]);
      }
      expect(passes).toEqual(
        ["09:00", "09:01", "09:03", "09:07", "09:15", "09:31", "10:03", "11:07"].map((hhmm) =>
          msk(hhmm),
        ),
      );
    });
  });
});

describe("a pool pass whose delivery fails and which then breaks", () => {
  it("backs off as any failing pass does, not at the minute its own failed delivery asked for", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      vi.setSystemTime(new Date(msk("08:00")));
      await instance.append(dueTomorrow(), { now: msk("08:00") });
      // A seminar at 09:00 beside the digest: the 09:00 pass adds and delivers two notifications.
      const seminar = { ...event(0), endAt: msk("10:30"), startAt: msk("09:00") };
      await instance.syncCalendar(copy(msk("08:00"), [seminar]), msk("08:00"));
      await instance.runNotifications(msk("08:00"));
      // Telegram is down, and the delivery of a pass's second notification breaks (a bug in its
      // message): the first one's failed copy has asked for a retry a minute on by then.
      const down = {
        apiRoot: "https://telegram.test",
        fetch: async () => Response.json({ ok: false }, { status: 500 }),
        token: "123456:TEST-TOKEN",
      };
      /** Whether this pass has already tried a notification's Telegram copy (its instant is now). */
      const hasDeliveredNow = (): boolean =>
        state.storage.sql
          .exec(
            "SELECT 1 FROM notification_deliveries WHERE method = 'telegram' AND attempted_at = ?",
            new Date().toISOString(),
          )
          .toArray().length > 0;
      const passes: string[] = [];
      for (;;) {
        const at = await state.storage.getAlarm();
        if (at === null || at > Date.parse(addMinutesIso(msk("09:00"), 20))) {
          break;
        }
        vi.setSystemTime(new Date(at));
        await state.storage.deleteAlarm();
        const failing = new UserStore(state, deployed);
        Object.defineProperties(failing, {
          chatId: {
            value: async () =>
              await (hasDeliveredNow()
                ? Promise.reject(new Error("the message broke"))
                : Promise.resolve("1002")),
          },
          derive: {
            value: async (now: string) => {
              passes.push(now);
              return await UserStore.prototype.derive.call(failing, now);
            },
          },
          runNotifications: {
            value: async (now: string) =>
              await UserStore.prototype.runNotifications.call(failing, now, {
                push: { fcm: null },
                telegram: down,
              }),
          },
        });
        // A failed pass fails the alarm; the runtime would run it again (not simulated).
        await Promise.allSettled([failing.alarm()]);
      }
      expect(passes).toEqual(
        ["09:00", "09:01", "09:03", "09:07", "09:15"].map((hhmm) => msk(hhmm)),
      );
    });
  });
});

describe("a phone's calendar copy cut short", () => {
  it("is looked at by the pool with the next upload when the pool's look after its rows died", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      const now = msk("22:00");
      vi.setSystemTime(new Date(now));
      await instance.append(history(3), { now });
      const events = Array.from({ length: 4 }, (_, index) => event(index));
      await new UserStore(state, deployed).syncCalendar(copy(now, events), now);
      // One event moved; the rows go in, then the isolate is reset as the pool looks at them.
      const moved = events.with(1, event(1, "Seminar moved"));
      const cut = new UserStore(state, deployed);
      Object.defineProperty(cut, "pool", {
        get: () => ({
          afterWrite: async () => {
            throw new Error("cut short");
          },
        }),
      });
      await expect(cut.syncCalendar(copy(now, moved), now)).rejects.toThrow("cut short");
      // The same copy fifteen minutes on: the pool looks now (one load), and not again after.
      const later = addMinutesIso(now, 15);
      vi.setSystemTime(new Date(later));
      const next = meterSql(state.storage);
      await new UserStore(state, deployed).syncCalendar(copy(later, moved), later);
      expect(next.cost().loads).toBe(1);
      const again = meterSql(state.storage);
      await new UserStore(state, deployed).syncCalendar(copy(later, moved), later);
      expect(again.cost().loads).toBe(0);
    });
  });
});

describe("the assistant's queue at the store's alarm", () => {
  it("loads no log for a text that is not due yet", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      vi.setSystemTime(new Date(msk("22:00")));
      const now = msk("22:00");
      await instance.append(history(3), { now });
      await instance.runNotifications(now);
      const retryAt = addMinutesIso(now, 120);
      await instance.enqueueParse({ channel: "api", retryAt, text: "купить хлеб" }, now);
      // Sleep's look at 22:15 fires the alarm first.
      const { cost } = meterSql(state.storage);
      vi.setSystemTime(new Date(msk("22:15")));
      await state.storage.deleteAlarm();
      await new UserStore(state, deployed).alarm();
      expect(cost().loads).toBe(0);
      expect(await state.storage.getAlarm()).toBeLessThanOrEqual(Date.parse(retryAt));
    });
  });
});

describe("a phone's calendar copy on a cold store", () => {
  it("writes only what changed, and loads no log when nothing did", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      const now = msk("22:00");
      vi.setSystemTime(new Date(now));
      await instance.append(history(3), { now });
      const events = Array.from({ length: 12 }, (_, index) => event(index));
      await new UserStore(state, deployed).syncCalendar(copy(now, events), now);
      // Fifteen minutes on, the phone sends the same calendar over a range moved with its clock.
      const later = addMinutesIso(now, 15);
      vi.setSystemTime(new Date(later));
      const same = meterSql(state.storage);
      await new UserStore(state, deployed).syncCalendar(copy(later, events), later);
      expect(same.cost()).toMatchObject({ loads: 0, rowsWritten: 0 });
      // One event renamed: its row alone is written again, and the pool looks at it.
      const renamed = meterSql(state.storage);
      const changed = events.with(3, event(3, "Seminar moved"));
      await new UserStore(state, deployed).syncCalendar(copy(later, changed), later);
      expect(renamed.cost().loads).toBe(1);
      expect(renamed.cost().rowsWritten).toBeLessThanOrEqual(6);
      const titles = (
        await instance.calendar({ from: now, to: addMinutesIso(now, 20 * 1440) })
      ).map((each) => each.title);
      expect(titles).toEqual(changed.map((each) => each.title));
    });
  });
});
