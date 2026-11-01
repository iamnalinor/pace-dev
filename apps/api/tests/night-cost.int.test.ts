import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addMinutesIso, newId, wallClockInstant } from "@pace/core";

import type { UsageUpload } from "../src/user-store/cloud-data.ts";

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

/** Fires the store's alarm at `at` as the runtime does (taken off, then run), on a new instance. */
const fireAt = async (state: DurableObjectState, at: string): Promise<void> => {
  vi.setSystemTime(new Date(at));
  await state.storage.deleteAlarm();
  await new UserStore(state, env).alarm();
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
      A store as production runs it between alarms 15 minutes apart: a new instance each time,
      nothing in memory, the same storage.
      */
      const cold = (): UserStore => new UserStore(state, env);
      /** Fires every alarm due by `until`, as the runtime does: taken off, then run. */
      const fireDue = async (until: string): Promise<void> => {
        for (;;) {
          const at = await state.storage.getAlarm();
          if (at === null || at > Date.parse(until)) {
            return;
          }
          vi.setSystemTime(new Date(at));
          await state.storage.deleteAlarm();
          await cold().alarm();
        }
      };
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
      // The phone tells at 20:55 (sleep then looks every 15 minutes until noon).
      await upload(msk("20:55"));
      const { cost } = meterSql(state.storage);
      // An upload every 15 minutes from 21:10 until 09:40, alarms firing in between.
      for (let quarter = 0; quarter <= 50; quarter += 1) {
        const now = addMinutesIso(msk("21:10"), quarter * 15);
        await fireDue(now);
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
      const failing = new UserStore(state, env);
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
      await new UserStore(state, env).alarm();
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
      await instance.syncCalendar(copy(now, events), now);
      // Fifteen minutes on, the phone sends the same calendar over a range moved with its clock.
      const later = addMinutesIso(now, 15);
      vi.setSystemTime(new Date(later));
      const same = meterSql(state.storage);
      await new UserStore(state, env).syncCalendar(copy(later, events), later);
      expect(same.cost()).toMatchObject({ loads: 0, rowsWritten: 0 });
      // One event renamed: its row alone is written again, and the pool looks at it.
      const renamed = meterSql(state.storage);
      const changed = events.with(3, event(3, "Seminar moved"));
      await new UserStore(state, env).syncCalendar(copy(later, changed), later);
      expect(renamed.cost().loads).toBe(1);
      expect(renamed.cost().rowsWritten).toBeLessThanOrEqual(6);
      const titles = (
        await instance.calendar({ from: now, to: addMinutesIso(now, 20 * 1440) })
      ).map((each) => each.title);
      expect(titles).toEqual(changed.map((each) => each.title));
    });
  });
});
