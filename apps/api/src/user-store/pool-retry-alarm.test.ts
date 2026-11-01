import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  armAfterWrite,
  armIfPoolUnplanned,
  POOL_LEASE_KEY,
  POOL_NEXT_AT_KEY,
  poolAtAlarm,
  scheduleNextPass,
  takingPoolTime,
} from "./pool-retry-alarm.ts";

/**
Far ahead of the real clock: nothing armed here is ever due for workerd's own scheduler (bug-lessons
class 54), and no test reads the real clock (class 9).
*/
const NOW = "2099-10-07T09:00:00.000Z";
const MINUTE = 60_000;
/** `minutes` after `NOW`, as epoch ms and as an instant. */
const ms = (minutes: number): number => Date.parse(NOW) + minutes * MINUTE;
const at = (minutes: number): string => new Date(ms(minutes)).toISOString();

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

/** A pass as the pool's own: it takes the pool's time, and records the next one it wants. */
const pass = async (
  storage: DurableObjectStorage,
  {
    now,
    nextAt,
    during,
  }: {
    readonly now: string;
    readonly nextAt: null | string;
    readonly during?: () => Promise<void>;
  },
): Promise<void> => {
  await takingPoolTime(storage, {
    now,
    pass: async () => {
      await during?.();
      await scheduleNextPass(storage, { isRetry: false, nextAt, now });
    },
  });
};

/**
A pass that dies once it has taken the pool's time, as one does when its isolate is reset while it
waits on a delivery (a deploy, the CPU limit): it never settles, so nothing after it runs.
*/
const cutShort = async (storage: DurableObjectStorage, now = NOW): Promise<void> => {
  await new Promise<void>((resolve) => {
    void takingPoolTime(storage, {
      now,
      pass: async () => {
        resolve();
        await new Promise<never>(() => undefined);
      },
    });
  });
};

/**
Runs the pool's part of an alarm at `now`, the alarm taken off first as the runtime does; answers
whether it passed.
*/
const hasPassedAt = async (storage: DurableObjectStorage, now: string): Promise<boolean> => {
  await storage.deleteAlarm();
  let hasPassed = false;
  await poolAtAlarm(storage, {
    now,
    pass: async () => {
      hasPassed = true;
      await pass(storage, { nextAt: at(24 * 60), now });
    },
  });
  return hasPassed;
};

/** A pass that fails at `now`. */
const failingAt = async (storage: DurableObjectStorage, now: string): Promise<void> => {
  await takingPoolTime(storage, {
    now,
    pass: async () => {
      await Promise.reject(new Error("the pass broke"));
    },
  });
};

/** Whether the pool's part of an alarm at `now` would pass; nothing runs. */
const isDueAt = async (storage: DurableObjectStorage, now: string): Promise<boolean> => {
  let isDue = false;
  await poolAtAlarm(storage, {
    now,
    pass: async () => {
      isDue = true;
      await Promise.resolve();
    },
  });
  return isDue;
};

describe("the pool's own time at the store's alarm", () => {
  it("passes at the first alarm of a store from before the key, then keeps the time it asked for", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBeUndefined();
      expect(await hasPassedAt(storage, NOW)).toBe(true);
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBe(ms(24 * 60));
      expect(await storage.get(POOL_LEASE_KEY)).toBeUndefined();
    });
  });

  it("before its time passes nothing and arms its time again; at its time it passes", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await pass(storage, { nextAt: at(60), now: NOW });
      await storage.deleteAlarm();
      expect(await hasPassedAt(storage, at(15))).toBe(false);
      expect(await storage.getAlarm()).toBe(ms(60));
      expect(await hasPassedAt(storage, at(60))).toBe(true);
    });
  });

  it("never leaves the pool without a time: with nothing coming it looks again within a day", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await pass(storage, { nextAt: null, now: NOW });
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBe(ms(24 * 60));
      // The lease's wake comes first, passes nothing and arms the day on.
      expect(await hasPassedAt(storage, at(5))).toBe(false);
      expect(await storage.getAlarm()).toBe(ms(24 * 60));
    });
  });

  it("arms the alarm at the lease's end as a pass takes the pool, and that wake reads only the gate", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await storage.deleteAlarm();
      await pass(storage, { nextAt: at(60), now: NOW });
      expect(await storage.getAlarm()).toBe(ms(5));
      // The pass completed: the wake passes nothing and arms the pass's own time.
      expect(await hasPassedAt(storage, at(5))).toBe(false);
      expect(await storage.getAlarm()).toBe(ms(60));
    });
  });

  it("runs a pass cut short at its lease's end even when the runtime never runs the alarm again", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await pass(storage, { nextAt: at(60), now: at(-60) });
      await storage.deleteAlarm();
      await cutShort(storage);
      // The runtime took the alarm off as it fired and never retries: the lease's wake is set.
      expect(await storage.getAlarm()).toBe(ms(5));
      expect(await hasPassedAt(storage, at(5))).toBe(true);
    });
  });

  it("keeps the earlier time a write asks for during a pass, even past the pass's lease", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await pass(storage, {
        during: async () => {
          await armAfterWrite(storage, { at: at(30), now: NOW });
        },
        nextAt: at(600),
        now: NOW,
      });
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBe(ms(30));
      expect(await hasPassedAt(storage, at(5))).toBe(false);
      expect(await storage.getAlarm()).toBe(ms(30));
    });
  });

  it("passes again once the lease of a pass cut short runs out, not before", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await pass(storage, { nextAt: at(60), now: at(-60) });
      await cutShort(storage);
      const lease = await storage.get<number>(POOL_LEASE_KEY);
      expect(lease).toBe(ms(5));
      // The runtime runs the alarm again within seconds: the pass may still be going.
      await storage.deleteAlarm();
      expect(await hasPassedAt(storage, at(0.05))).toBe(false);
      expect(await storage.getAlarm()).toBe(lease);
      expect(await hasPassedAt(storage, at(5))).toBe(true);
      expect(await storage.get(POOL_LEASE_KEY)).toBeUndefined();
    });
  });

  it("re-arms on a person's write while a pass is cut short, and still passes at the lease's end", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await cutShort(storage);
      await armAfterWrite(storage, { at: at(30), now: NOW });
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBe(ms(30));
      // The write's later time does not hide the pass that died.
      expect(await hasPassedAt(storage, at(6))).toBe(true);
    });
  });

  it("leaves the pool due when a pass fails, keeping an earlier time a write asked for during it", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      const failing = pass(storage, {
        during: async () => {
          await armAfterWrite(storage, { at: at(-1), now: NOW });
          throw new Error("the pass broke");
        },
        nextAt: at(60),
        now: NOW,
      });
      await expect(failing).rejects.toThrow("the pass broke");
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBe(ms(-1));
      expect(await storage.get(POOL_LEASE_KEY)).toBeUndefined();
      // The runtime's retry of the failed alarm passes.
      expect(await hasPassedAt(storage, at(0.05))).toBe(true);
    });
  });

  it("looks again a minute on when a pass fails with nothing earlier asked for", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await pass(storage, { nextAt: at(60), now: at(-60) });
      await storage.deleteAlarm();
      await expect(failingAt(storage, NOW)).rejects.toThrow("the pass broke");
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBe(ms(1));
      expect(await storage.getAlarm()).toBe(ms(1));
      expect(await hasPassedAt(storage, at(0.05))).toBe(false);
      expect(await hasPassedAt(storage, at(1))).toBe(true);
    });
  });

  it("looks again later and later while passes keep failing, never at every lease's end", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      const waits: number[] = [];
      let now = NOW;
      for (let failure = 0; failure < 10; failure += 1) {
        await expect(failingAt(storage, now)).rejects.toThrow("the pass broke");
        const next = (await storage.get<number>(POOL_NEXT_AT_KEY)) ?? NaN;
        waits.push((next - Date.parse(now)) / MINUTE);
        // The lease's wake five minutes on passes only when the pool is due by then.
        const wake = new Date(Date.parse(now) + 5 * MINUTE).toISOString();
        expect(await isDueAt(storage, wake)).toBe(next <= Date.parse(wake));
        now = new Date(next).toISOString();
      }
      // A minute, doubling, never more than four hours.
      expect(waits).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 240, 240]);
      // A pass that completes starts the count again.
      await pass(storage, { nextAt: null, now });
      await expect(failingAt(storage, now)).rejects.toThrow("the pass broke");
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBe(Date.parse(now) + MINUTE);
    });
  });

  it("arms at once a store with neither the pool's time nor any alarm, as main left one", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await storage.deleteAlarm();
      await armIfPoolUnplanned(storage, NOW);
      expect(await storage.getAlarm()).toBe(ms(0));
      expect(await hasPassedAt(storage, NOW)).toBe(true);
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBe(ms(24 * 60));
      // The key is there now: an upload or a write arms nothing more.
      await storage.deleteAlarm();
      await armIfPoolUnplanned(storage, at(60));
      expect(await storage.getAlarm()).toBeNull();
    });
  });

  it("leaves a store with an alarm to that alarm, which passes the pool with no key", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await storage.setAlarm(ms(30));
      await armIfPoolUnplanned(storage, NOW);
      expect(await storage.getAlarm()).toBe(ms(30));
      expect(await hasPassedAt(storage, at(30))).toBe(true);
    });
  });

  it("leaves a pass that holds the pool's time alone", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await cutShort(storage);
      await storage.deleteAlarm();
      await armIfPoolUnplanned(storage, NOW);
      expect(await storage.getAlarm()).toBeNull();
    });
  });

  it("waits longer after each pass cut short in a row (5, 10, 20 minutes), and 5 after one completes", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      const waits: number[] = [];
      let now = NOW;
      for (let cut = 0; cut < 3; cut += 1) {
        await storage.deleteAlarm();
        await cutShort(storage, now);
        const lease = (await storage.get<number>(POOL_LEASE_KEY)) ?? NaN;
        waits.push((lease - Date.parse(now)) / MINUTE);
        // Its wake is armed, and the gate passes at the lease's end, not before.
        expect(await storage.getAlarm()).toBe(lease);
        expect(await isDueAt(storage, new Date(lease - 1).toISOString())).toBe(false);
        expect(await isDueAt(storage, new Date(lease).toISOString())).toBe(true);
        now = new Date(lease).toISOString();
      }
      expect(waits).toEqual([5, 10, 20]);
      await pass(storage, { nextAt: null, now });
      await cutShort(storage, now);
      expect(await storage.get(POOL_LEASE_KEY)).toBe(Date.parse(now) + 5 * MINUTE);
    });
  });

  it("counts a pass cut short and one that fails alike: each waits longer than the one before", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await cutShort(storage, NOW);
      // The lease's end (5 minutes): the pass fails this time, its second in a row.
      await expect(failingAt(storage, at(5))).rejects.toThrow("the pass broke");
      expect(await storage.get(POOL_NEXT_AT_KEY)).toBe(ms(5 + 2));
      await cutShort(storage, at(7));
      expect(await storage.get(POOL_LEASE_KEY)).toBe(ms(7 + 20));
    });
  });

  it("reads a time taken and never released (no lease) as due", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      await storage.put(POOL_NEXT_AT_KEY, null);
      expect(await hasPassedAt(storage, NOW)).toBe(true);
    });
  });
});
