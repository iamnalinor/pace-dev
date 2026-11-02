import { describe, expect, it } from "vitest";

import type { Verdict } from "./health.ts";

import { HEALTH_CACHE_MS, HEALTH_KEY, kvHealth } from "./health-store.ts";

const NOW = "2026-11-02T10:00:00.000Z";

/** A KV namespace in memory that counts what it is asked, and can be made to fail. */
const countingKv = (options: { readonly isBroken?: boolean } = {}) => {
  const values = new Map<string, string>();
  const counts = { deletes: 0, gets: 0, puts: 0 };
  const fail = (): void => {
    if (options.isBroken === true) {
      throw new Error("KV unavailable");
    }
  };
  const kv = {
    delete: async (key: string) => {
      fail();
      counts.deletes += 1;
      values.delete(key);
      await Promise.resolve();
    },
    get: async (key: string) => {
      fail();
      counts.gets += 1;
      const value = values.get(key);
      await Promise.resolve();
      return value === undefined ? null : (JSON.parse(value) as unknown);
    },
    put: async (key: string, value: string) => {
      fail();
      counts.puts += 1;
      values.set(key, value);
      await Promise.resolve();
    },
  };
  return { counts, kv: kv as unknown as KVNamespace, values };
};

const unwell = (provider: string): Verdict => ({
  outcome: "unwell",
  provider,
  why: "server-error",
});
const answered = (provider: string): Verdict => ({ outcome: "ok", provider });

describe("kvHealth", () => {
  it("writes only when a record changes: a new penalty, the first success after it", async () => {
    const { counts, kv, values } = countingKv();
    const health = kvHealth(kv, { cache: {} });
    await health.record([answered("good")], NOW);
    expect(counts.puts + counts.deletes).toBe(0);
    await health.record([unwell("down"), answered("good")], NOW);
    expect(counts.puts).toBe(1);
    expect(JSON.parse(values.get(HEALTH_KEY) ?? "{}")).toMatchObject({ down: { strikes: 1 } });
    await health.record([unwell("down"), answered("good")], NOW);
    await health.record([answered("good")], NOW);
    expect(counts.puts).toBe(1);
    await health.record([answered("down")], NOW);
    expect(counts.deletes).toBe(1);
    expect(values.has(HEALTH_KEY)).toBe(false);
  });

  it("reads KV at most once per cache window, and sees its own writes at once", async () => {
    const { counts, kv } = countingKv();
    let clock = 0;
    const health = kvHealth(kv, { cache: {}, clock: () => clock });
    await health.read();
    clock = HEALTH_CACHE_MS - 1;
    await health.read();
    expect(counts.gets).toBe(1);
    await health.record([unwell("down")], NOW);
    const gets = counts.gets;
    expect(Object.keys(await health.read())).toEqual(["down"]);
    expect(counts.gets).toBe(gets);
    clock += HEALTH_CACHE_MS;
    await health.read();
    expect(counts.gets).toBe(gets + 1);
  });

  it("reads afresh before it writes, so another isolate's change is kept", async () => {
    const { kv, values } = countingKv();
    const first = kvHealth(kv, { cache: {} });
    const second = kvHealth(kv, { cache: {} });
    await second.read();
    await first.record([unwell("one")], NOW);
    await second.record([unwell("two")], NOW);
    const stored = JSON.parse(values.get(HEALTH_KEY) ?? "{}") as object;
    expect(stored).toHaveProperty("one");
    expect(stored).toHaveProperty("two");
  });

  it("never fails a read when KV does: the order stays as configured", async () => {
    const { kv } = countingKv({ isBroken: true });
    const health = kvHealth(kv, { cache: {} });
    expect(await health.read()).toEqual({});
    await expect(health.record([unwell("down")], NOW)).resolves.toBeUndefined();
  });

  it("ignores a stored value it cannot read", async () => {
    const { kv, values } = countingKv();
    values.set(HEALTH_KEY, JSON.stringify({ down: { strikes: "many" } }));
    expect(await kvHealth(kv, { cache: {} }).read()).toEqual({});
  });
});
