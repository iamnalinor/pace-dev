import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addMinutesIso,
  type DeviceUse,
  type Event,
  type EventInput,
  EventSchema,
  wallClockInstant,
} from "@pace/core";

import type { UserStore } from "./user-store.ts";

import { HELD_KEY, heldOf } from "./sleep-hold.ts";
import {
  DECIDED_UNTIL_KEY,
  runSleepPass,
  SLEEP_NEXT_AT_KEY,
  type SleepHost,
} from "./sleep-pass.ts";

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

/**
Far ahead of the real clock: the alarms a pass arms are never due for workerd's own scheduler, so
none fires alongside a test (bug-lessons class 54).
*/
const NOW = "2099-10-07T22:30:00.000Z";
/** A Moscow evening: used 23:10–23:40, quiet since, known until 01:00. */
const USES = [
  { deviceId: "phone", endAt: "2099-10-07T20:40:00.000Z", startAt: "2099-10-07T20:10:00.000Z" },
];

/** A store's side of the pass, recording what it was asked for. */
const hostOf = (storage: DurableObjectStorage, knownUntil = "2099-10-07T22:00:00.000Z") => {
  const calls = { froms: [] as string[], inserted: [] as EventInput[], logs: 0 };
  const host: SleepHost = {
    insert: async (inputs) => {
      calls.inserted.push(...inputs);
      return inputs as unknown as readonly Event[];
    },
    log: async () => {
      calls.logs += 1;
      return [];
    },
    logDecisions: async () => {
      await Promise.resolve();
    },
    seq: async () => 7,
    storage,
    // As the store reads them: only the uses that end after `from` (class 55).
    usageForSleep: async (from) => {
      calls.froms.push(from);
      return { knownUntil, uses: USES.filter((use) => use.endAt > from) };
    },
    zone: async () => "Europe/Moscow",
  };
  return { calls, host };
};

describe("one pass of automatic sleep", () => {
  it("reads the log only when something it decides on changed since the last pass", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const { calls, host } = hostOf(state.storage);
      expect(await runSleepPass(host, NOW)).toHaveLength(1);
      expect(calls.logs).toBe(1);
      // The same uses, knowledge and log: nothing to decide, nothing loaded.
      await runSleepPass(host, "2099-10-07T22:45:00.000Z");
      expect(calls.logs).toBe(1);
      // The phone told more: decided again.
      await runSleepPass(hostOf(state.storage, "2099-10-07T22:20:00.000Z").host, NOW);
      expect(await state.storage.get(DECIDED_UNTIL_KEY)).toBe("2099-10-07T22:20:00.000Z");
    });
  });

  it("reads from the hold's front while it lasts, and lets it go a day past the window's own", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const { calls, host } = hostOf(state.storage);
      const hoursOn = (hours: number) => addMinutesIso(NOW, hours * 60);
      await runSleepPass(host, NOW);
      await runSleepPass(host, hoursOn(5));
      await runSleepPass(host, hoursOn(24));
      // A day past the window's front: read from the front again, and decided again.
      await runSleepPass(host, hoursOn(24.25));
      expect(calls.froms).toEqual([hoursOn(-36), hoursOn(-36), hoursOn(-36), hoursOn(24.25 - 36)]);
      expect(calls.logs).toBe(2);
      // From there on, that pass's front is the anchor.
      await runSleepPass(host, hoursOn(30));
      expect(calls.froms.at(-1)).toBe(hoursOn(24.25 - 36));
      expect(calls.logs).toBe(2);
    });
  });

  it("drops a hold the build before the anchor saved: one log read, then held as usual", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const { calls, host } = hostOf(state.storage);
      await runSleepPass(host, NOW);
      expect(calls.logs).toBe(1);
      // The same hold as the previous build stored it: no anchor.
      const { anchor: _dropped, ...withoutAnchor } = (await heldOf(state.storage)) ?? {};
      await state.storage.put(HELD_KEY, withoutAnchor);
      await runSleepPass(host, "2099-10-07T22:45:00.000Z");
      expect(calls.logs).toBe(2);
      expect((await heldOf(state.storage))?.anchor).toBe(
        addMinutesIso("2099-10-07T22:45:00.000Z", -36 * 60),
      );
      await runSleepPass(host, "2099-10-07T23:00:00.000Z");
      expect(calls.logs).toBe(2);
    });
  });

  it("never lowers what an overlapping pass decided with", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const { host } = hostOf(state.storage);
      // Another pass, while this one writes, decided on more (an upload's pass awaiting a send).
      const overlapped: SleepHost = {
        ...host,
        insert: async (inputs) => {
          await state.storage.put(DECIDED_UNTIL_KEY, "2099-10-08T03:00:00.000Z");
          return await host.insert(inputs, NOW);
        },
      };
      await runSleepPass(overlapped, NOW);
      expect(await state.storage.get(DECIDED_UNTIL_KEY)).toBe("2099-10-08T03:00:00.000Z");
    });
  });
});

/** A store's side of the pass with a log that keeps what the pass writes (`seq` moves with it). */
const keepingHost = (
  storage: DurableObjectStorage,
  usage: { knownUntil: null | string; uses: DeviceUse[] },
) => {
  const calls = { logs: 0 };
  const log: Event[] = [];
  const host: SleepHost = {
    insert: async (inputs, now) => {
      const known = new Set(log.map((event) => event.id));
      const fresh = inputs
        .filter((input) => !known.has(input.id ?? ""))
        .map((input) => EventSchema.parse({ ...input, deviceId: "server", recordedAt: now }));
      log.push(...fresh);
      return fresh;
    },
    log: async () => {
      calls.logs += 1;
      return [...log];
    },
    logDecisions: async () => {
      await Promise.resolve();
    },
    seq: async () => log.length,
    storage,
    // As the store reads them: only the uses that end after `from`, the window's front moving
    // with every pass (class 55).
    usageForSleep: async (from) => ({
      ...usage,
      uses: usage.uses.filter((use) => use.endAt > from),
    }),
    zone: async () => "Europe/Moscow",
  };
  return { calls, host, log };
};

type Day = "06" | "07" | "08";
/** Moscow wall clock on the night of 2099-10-07 (evening) and the day after. */
const msk = (hhmm: string, day: Day = Number(hhmm.slice(0, 2)) >= 12 ? "07" : "08") =>
  wallClockInstant(`2099-10-${day}`, hhmm, "Europe/Moscow");
const phoneUse = (from: string, to: string, day?: Day): DeviceUse => ({
  deviceId: "phone",
  endAt: msk(to, day),
  startAt: msk(from, day),
});
/** A day on the phone: ten minutes every 40 from `from`, `count` times. */
const dayOfUse = (from: string, count: number): readonly DeviceUse[] =>
  Array.from({ length: count }, (_, index) => {
    const startAt = addMinutesIso(from, index * 40);
    return { deviceId: "phone", endAt: addMinutesIso(startAt, 10), startAt };
  });
/** The day before the night: on the phone from 08:00 until 20:50, then 23:10–23:40. */
const DAY_07 = [...dayOfUse(msk("08:00", "07"), 20), phoneUse("23:10", "23:40")];

describe("a pass that loads nothing it can decide nothing on", () => {
  it("reads the log at night only when knowing more can change a decision", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      // A full day before it too (09:00–22:30 on the 6th, asleep until 08:00), which the window's
      // front, 36 hours behind each pass, leaves use by use all night.
      const before = dayOfUse(msk("09:00", "06"), 21);
      const usage = { knownUntil: msk("23:50"), uses: [...before, ...DAY_07] };
      const { calls, host, log } = keepingHost(state.storage, usage);
      // The night before is decided at once: from 22:30 to 08:00.
      expect(await runSleepPass(host, msk("23:55"))).toHaveLength(2);
      expect(calls.logs).toBe(1);
      // An upload or an alarm every 15 minutes until morning, the phone telling as it goes.
      const passes = Array.from({ length: 31 }, (_, index) =>
        addMinutesIso(msk("00:10"), index * 15),
      );
      for (const now of passes) {
        usage.knownUntil = addMinutesIso(now, -5);
        if (usage.knownUntil >= msk("07:30")) {
          usage.uses = [...before, ...DAY_07, phoneUse("07:10", "07:25")];
        }
        await runSleepPass(host, now);
      }
      // Read when 00:25 opened the night at 23:40, and when 07:10 ended it: nowhere else.
      expect(calls.logs).toBe(3);
      expect(log.map((event) => [event.type, event.occurredAt]).slice(2)).toEqual([
        ["activity.started", msk("23:40")],
        ["activity.stopped", msk("07:10")],
      ]);
    });
  });

  it("reads no log by day for the phone's use once the night is decided, but does for late use in it", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const night = [...DAY_07, phoneUse("07:10", "07:25")];
      const usage = { knownUntil: msk("12:30", "08"), uses: [...night] };
      const { calls, host } = keepingHost(state.storage, usage);
      await runSleepPass(host, msk("12:35", "08"));
      expect(calls.logs).toBe(1);
      // Used all afternoon: each upload brings new use and moves `knownUntil`.
      for (const hhmm of ["13:00", "15:00", "18:00", "20:50"]) {
        usage.uses = [...usage.uses, phoneUse(hhmm, `${hhmm.slice(0, 3)}05`, "08")];
        usage.knownUntil = msk(`${hhmm.slice(0, 3)}10`, "08");
        await runSleepPass(host, msk(`${hhmm.slice(0, 3)}10`, "08"));
      }
      expect(calls.logs).toBe(1);
      // The laptop's late upload: used 03:00–03:40 in the night already decided.
      usage.uses = [...usage.uses, { ...phoneUse("03:00", "03:40"), deviceId: "laptop" }];
      expect(await runSleepPass(host, msk("20:55", "08"))).toHaveLength(2);
      expect(calls.logs).toBe(2);
      // Evening: knowing more can open the next night, so the log is read again.
      usage.knownUntil = msk("21:30", "08");
      await runSleepPass(host, msk("21:35", "08"));
      expect(calls.logs).toBe(3);
    });
  });
});

describe("a pass once the phones have told nothing for a day", () => {
  it("ends the running sleep where knowledge ended, once, and arms nothing", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const usage: { knownUntil: null | string; uses: DeviceUse[] } = {
        knownUntil: msk("05:00"),
        uses: [phoneUse("23:10", "23:40")],
      };
      const { calls, host, log } = keepingHost(state.storage, usage);
      await runSleepPass(host, msk("05:05"));
      expect(log.map((event) => event.type)).toEqual(["activity.started"]);
      // The phone died: a day on, no phone is fresh.
      usage.knownUntil = null;
      const dayLater = new Date(Date.parse(msk("05:05")) + 24 * 3_600_000).toISOString();
      expect(await runSleepPass(host, dayLater)).toHaveLength(1);
      expect(log.at(-1)).toMatchObject({ occurredAt: msk("05:00"), type: "activity.stopped" });
      expect(await state.storage.get(SLEEP_NEXT_AT_KEY)).toBeUndefined();
      // An older app's uploads keep nothing fresh: the log is not read again for them.
      const reads = calls.logs;
      await runSleepPass(host, dayLater);
      expect(calls.logs).toBe(reads);
    });
  });
});

describe("a usage upload", () => {
  it("stays stored and answers when the sleep pass after it fails", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      Object.defineProperty(instance, "sleepPass", {
        value: async () => {
          await Promise.reject(new Error("the pass broke"));
        },
      });
      const upload = {
        deviceId: "phone-1",
        deviceName: "Pixel 8",
        isPhone: true,
        sessions: [],
        until: "2099-10-07T22:00:00.000Z",
        uses: [{ endAt: "2099-10-07T20:40:00.000Z", startAt: "2099-10-07T20:10:00.000Z" }],
      };
      await expect(instance.addUsage(upload, NOW)).resolves.toBe(1);
      expect((await instance.usageForSleep("2099-10-07T12:00:00.000Z", NOW)).uses).toHaveLength(1);
    });
  });
});

describe("the store's alarm", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps its other work and sleep's next look when the sleep pass fails", async () => {
    // Far ahead of the real clock: nothing armed here is due for the runtime (class 54).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2099-10-07T22:30:00.000Z"));
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      Object.defineProperty(instance, "sleepPass", {
        value: async () => {
          await Promise.reject(new Error("the pass broke"));
        },
      });
      const now = new Date().toISOString();
      // The assistant's queue has a retry due now, and sleep's look is due too.
      await instance.enqueueParse({ channel: "api", retryAt: now, text: "купить хлеб" }, now);
      await state.storage.put(SLEEP_NEXT_AT_KEY, Date.now());
      await expect(instance.alarm()).resolves.toBeUndefined();
      // Sleep looks again in 15 minutes, as after any pass at night.
      const again = Date.now() + 15 * 60_000;
      expect(await state.storage.get(SLEEP_NEXT_AT_KEY)).toBe(again);
      expect(await state.storage.getAlarm()).toBeLessThanOrEqual(again);
      expect(await state.storage.getAlarm()).not.toBeNull();
    });
  });

  it("looks again later and later while the pass keeps failing, and as usual once one completes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2099-10-07T22:30:00.000Z"));
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      const failing = { is: true };
      // The store's own pass, for when it stops failing (the method is protected).
      const real = Reflect.get(Object.getPrototypeOf(instance) as object, "sleepPass") as (
        this: UserStore,
        now: string,
      ) => Promise<readonly string[]>;
      Object.defineProperty(instance, "sleepPass", {
        value: async (now: string) =>
          failing.is
            ? await Promise.reject(new Error("the pass broke"))
            : await real.call(instance, now),
      });
      await state.storage.put(SLEEP_NEXT_AT_KEY, Date.now());
      /** Fires the alarm at sleep's next look; answers how many minutes on it then looks. */
      const failAgain = async (): Promise<number> => {
        const at = (await state.storage.get<number>(SLEEP_NEXT_AT_KEY)) ?? NaN;
        vi.setSystemTime(new Date(at));
        await instance.alarm();
        return ((await state.storage.get<number>(SLEEP_NEXT_AT_KEY)) ?? NaN) - at;
      };
      const waits = [];
      for (let index = 0; index < 6; index += 1) {
        waits.push((await failAgain()) / 60_000);
      }
      // 15 minutes, doubling, never more than four hours.
      expect(waits).toEqual([15, 30, 60, 120, 240, 240]);
      // A pass that completes (no phone told anything: nothing to arm) starts the count again.
      failing.is = false;
      await failAgain();
      failing.is = true;
      await state.storage.put(SLEEP_NEXT_AT_KEY, Date.now());
      expect((await failAgain()) / 60_000).toBe(15);
    });
  });
});
