import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { Event, EventInput } from "@pace/core";

import type { UserStore } from "./user-store.ts";

import { DECIDED_UNTIL_KEY, runSleepPass, type SleepHost } from "./sleep-pass.ts";

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

const NOW = "2026-10-07T22:30:00.000Z";
/** A Moscow evening: used 23:10–23:40, quiet since, known until 01:00. */
const USES = [
  { deviceId: "phone", endAt: "2026-10-07T20:40:00.000Z", startAt: "2026-10-07T20:10:00.000Z" },
];

/** A store's side of the pass, recording what it was asked for. */
const hostOf = (storage: DurableObjectStorage, knownUntil = "2026-10-07T22:00:00.000Z") => {
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
      await runSleepPass(host, "2026-10-07T22:45:00.000Z");
      expect(calls.logs).toBe(1);
      // The phone told more: decided again.
      await runSleepPass(hostOf(state.storage, "2026-10-07T22:20:00.000Z").host, NOW);
      expect(await state.storage.get(DECIDED_UNTIL_KEY)).toBe("2026-10-07T22:20:00.000Z");
    });
  });

  it("never lowers what an overlapping pass decided with", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const { host } = hostOf(state.storage);
      // Another pass, while this one writes, decided on more (an upload's pass awaiting a send).
      const overlapped: SleepHost = {
        ...host,
        insert: async (inputs) => {
          await state.storage.put(DECIDED_UNTIL_KEY, "2026-10-08T03:00:00.000Z");
          return await host.insert(inputs, NOW);
        },
      };
      await runSleepPass(overlapped, NOW);
      expect(await state.storage.get(DECIDED_UNTIL_KEY)).toBe("2026-10-08T03:00:00.000Z");
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
        until: "2026-10-07T22:00:00.000Z",
        uses: [{ endAt: "2026-10-07T20:40:00.000Z", startAt: "2026-10-07T20:10:00.000Z" }],
      };
      await expect(instance.addUsage(upload, NOW)).resolves.toBe(1);
      expect((await instance.usageForSleep("2026-10-07T12:00:00.000Z", NOW)).uses).toHaveLength(1);
    });
  });
});
