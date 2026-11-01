import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  type DeviceUse,
  type Event,
  type EventInput,
  EventSchema,
  wallClockInstant,
} from "@pace/core";

import type { UserStore } from "./user-store.ts";

import { DECIDED_UNTIL_KEY, runSleepPass, type SleepHost } from "./sleep-pass.ts";

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
  const calls = { inserted: [] as EventInput[], logs: 0 };
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
    usageForSleep: async () => ({ knownUntil, uses: USES }),
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
  usage: { knownUntil: string; uses: DeviceUse[] },
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
    usageForSleep: async () => ({ ...usage, uses: [...usage.uses] }),
    zone: async () => "Europe/Moscow",
  };
  return { calls, host, log };
};

/** Moscow wall clock on the night of 2099-10-07 (evening) and the day after. */
const msk = (hhmm: string, day: "07" | "08" = Number(hhmm.slice(0, 2)) >= 12 ? "07" : "08") =>
  wallClockInstant(`2099-10-${day}`, hhmm, "Europe/Moscow");
const phoneUse = (from: string, to: string, day?: "07" | "08"): DeviceUse => ({
  deviceId: "phone",
  endAt: msk(to, day),
  startAt: msk(from, day),
});

describe("a pass that loads nothing it can decide nothing on", () => {
  it("reads the log at night only when knowing more can change a decision", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const usage = { knownUntil: msk("23:50"), uses: [phoneUse("23:10", "23:40")] };
      const { calls, host, log } = keepingHost(state.storage, usage);
      await runSleepPass(host, msk("23:55"));
      expect(calls.logs).toBe(1);
      // The phone tells 00:10: still short of the 45 minutes that open the night.
      usage.knownUntil = msk("00:10");
      await runSleepPass(host, msk("00:15"));
      expect(calls.logs).toBe(1);
      // 00:25 is the horizon: the night opens at 23:40.
      usage.knownUntil = msk("00:30");
      expect(await runSleepPass(host, msk("00:35"))).toHaveLength(1);
      expect(calls.logs).toBe(2);
      expect(log.map((event) => event.occurredAt)).toEqual([msk("23:40")]);
      // Quiet on: every upload moves `knownUntil`, and nothing is read until a use comes.
      for (const hhmm of ["00:45", "01:00", "02:00", "05:00"]) {
        usage.knownUntil = msk(hhmm);
        await runSleepPass(host, msk(hhmm));
      }
      expect(calls.logs).toBe(2);
      usage.uses = [...usage.uses, phoneUse("07:10", "07:25")];
      usage.knownUntil = msk("07:30");
      expect(await runSleepPass(host, msk("07:35"))).toHaveLength(1);
      expect(calls.logs).toBe(3);
    });
  });

  it("reads no log by day for the phone's use once the night is decided, but does for late use in it", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const night = [phoneUse("23:10", "23:40"), phoneUse("07:10", "07:25")];
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
