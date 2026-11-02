import { describe, expect, it } from "vitest";

import type { LlmHealth } from "./health-object.ts";

import { createHealthKeeper, type KeeperStorage } from "./health-keeper.ts";
import { HEALTH_CACHE_MS, objectHealth } from "./health-store.ts";
import { type Health, type HealthChange, orderByHealth, type Verdict } from "./health.ts";

/**
The health memory's own Durable Object (bug class 97): one writer, its storage written only when
who is asked first changes, never once per read.
*/

const NOW = "2026-11-02T10:00:00.000Z";
const MINUTE = 60_000;

/** A Durable Object's storage in memory that counts its writes, and can be made to fail. */
const countingStorage = () => {
  const values = new Map<string, unknown>();
  const counts = { reads: 0, writes: 0 };
  const state = { isBroken: false };
  const fail = (): void => {
    if (state.isBroken) {
      throw new Error("storage unavailable");
    }
  };
  const storage = {
    delete: async (key: string) => {
      fail();
      counts.writes += 1;
      await Promise.resolve();
      return values.delete(key);
    },
    get: async (key: string) => {
      counts.reads += 1;
      await Promise.resolve();
      return values.get(key);
    },
    put: async (key: string, value: unknown) => {
      fail();
      counts.writes += 1;
      await Promise.resolve();
      values.set(key, structuredClone(value));
    },
  } as unknown as KeeperStorage;
  return { counts, state, storage, values };
};

const unwell = (provider: string): Verdict => ({
  outcome: "unwell",
  provider,
  why: "server-error",
});
const slow = (provider: string): Verdict => ({ outcome: "slow", provider, why: "slow" });
const answered = (provider: string): Verdict => ({ outcome: "ok", provider });

/** The object as an isolate reaches it: every call goes to `keeper`, its changes counted. */
const namespaceOf = (keeper: ReturnType<typeof createHealthKeeper>, changes: HealthChange[]) => {
  const stub = {
    read: async () => await keeper.read(),
    record: async (verdicts: readonly Verdict[], now: string) => {
      const next = await keeper.record(verdicts, now);
      changes.push(...next.changes);
      return next.health;
    },
  };
  return {
    get: () => stub,
    idFromName: (name: string) => name,
  } as unknown as DurableObjectNamespace<LlmHealth>;
};

describe("createHealthKeeper", () => {
  it("writes a penalty once, keeps a first slow answer in memory only, and clears with one write", async () => {
    const { counts, storage } = countingStorage();
    const keeper = createHealthKeeper(storage);
    await keeper.record([slow("sleepy"), answered("good")], NOW);
    expect(counts.writes).toBe(0);
    expect(await keeper.read()).toEqual({ sleepy: { reason: "slow", strikes: 1, until: null } });
    await keeper.record([unwell("down"), answered("good")], NOW);
    expect(counts.writes).toBe(1);
    await keeper.record([unwell("down"), answered("good")], NOW);
    expect(counts.writes).toBe(1);
    await keeper.record([answered("down"), answered("sleepy")], NOW);
    expect(counts.writes).toBe(2);
    expect(await keeper.read()).toEqual({});
  });

  it("reads what it kept after a restart, without the notes it held in memory", async () => {
    const { storage } = countingStorage();
    const before = createHealthKeeper(storage);
    await before.record([unwell("down"), slow("sleepy")], NOW);
    const after = createHealthKeeper(storage);
    expect(Object.keys(await after.read())).toEqual(["down"]);
  });

  it("keeps both of two records sent at once", async () => {
    const { storage, values } = countingStorage();
    const keeper = createHealthKeeper(storage);
    await Promise.all([keeper.record([unwell("one")], NOW), keeper.record([unwell("two")], NOW)]);
    expect(Object.keys(await keeper.read())).toEqual(["one", "two"]);
    expect(Object.keys(values.get("health") as object)).toEqual(["one", "two"]);
  });

  it("fails loudly when its storage does, and keeps no state it could not save", async () => {
    const { state, storage } = countingStorage();
    const keeper = createHealthKeeper(storage);
    state.isBroken = true;
    await expect(keeper.record([unwell("down")], NOW)).rejects.toThrow("storage unavailable");
    expect(await keeper.read()).toEqual({});
    state.isBroken = false;
    await keeper.record([unwell("down")], NOW);
    expect(Object.keys(await keeper.read())).toEqual(["down"]);
  });
});

/** Order of the fake day's providers, as configured. */
const PROVIDERS = ["flaky", "sleepy", "steady"].map((name) => ({ name }));

/** "flaky" is down 10 minutes of every 50; "sleepy" is slow past the hedge on 3 reads in 10, 08–12. */
const isDown = (name: string, at: number, read: number): boolean => {
  if (name === "flaky") {
    return (at / MINUTE) % 50 < 10;
  }
  const hour = new Date(at).getUTCHours();
  return name === "sleepy" && hour >= 8 && hour < 12 && read % 10 < 3;
};

/**
What one read shows of the providers in `health`'s order, as the race would: one that is down
fails (flaky) or stays silent past the hedge (sleepy) and the next is asked; the first one up
answers (a probe that is up answers or starts to).
*/
const readVerdicts = (health: Health, at: number, read: number): readonly Verdict[] => {
  const { ordered } = orderByHealth(PROVIDERS, health, new Date(at).toISOString());
  const verdicts: Verdict[] = [];
  for (const { name } of ordered) {
    if (!isDown(name, at, read)) {
      verdicts.push(answered(name));
      return verdicts;
    }
    verdicts.push(name === "flaky" ? unwell(name) : slow(name));
  }
  return verdicts;
};

describe("a long fake day through the isolate's memory", () => {
  it("writes storage only when who is asked first changes, never once per read", async () => {
    const { counts, storage } = countingStorage();
    const changes: HealthChange[] = [];
    const namespace = namespaceOf(createHealthKeeper(storage), changes);
    let clock = Date.parse("2026-11-02T00:00:00.000Z");
    const memory = objectHealth(namespace, { cache: {}, clock: () => clock });
    const reads = 24 * 30;
    for (let read = 0; read < reads; read += 1) {
      clock += 2 * MINUTE;
      const health = await memory.read();
      await memory.record(readVerdicts(health, clock, read), new Date(clock).toISOString());
    }
    const moves = changes.filter((change) => change.kind !== "noted").length;
    expect(moves).toBeGreaterThan(20);
    expect(counts.writes).toBeLessThanOrEqual(moves);
    expect(counts.writes).toBeLessThan(reads / 4);
    expect(counts.reads).toBe(1);
    expect(HEALTH_CACHE_MS).toBe(15_000);
  });
});
