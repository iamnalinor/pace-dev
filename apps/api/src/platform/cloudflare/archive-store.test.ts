import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { archiveStore } from "./archive-store.ts";

describe("R2 archive storage", () => {
  it("atomically creates immutable bytes and cannot overwrite an existing key", async () => {
    const store = archiveStore(env.TEST_HISTORY_ARCHIVE);
    const key = `${crypto.randomUUID()}/copy`;
    const first = new Uint8Array([0, 128, 255]);
    const results = await Promise.all([
      store.putIfAbsent(key, first),
      store.putIfAbsent(key, new Uint8Array([9])),
    ]);
    expect(results.filter((result) => result.ok && result.value === "created")).toHaveLength(1);
    expect(results.filter((result) => result.ok && result.value === "exists")).toHaveLength(1);
    const read = await store.get(key);
    expect(read.ok).toBe(true);
    expect(await store.putIfAbsent(key, new Uint8Array([8]))).toEqual({
      ok: true,
      value: "exists",
    });
    expect(await store.get(key)).toEqual(read);
  });

  it("roundtrips bytes and treats missing reads and deletes idempotently", async () => {
    const store = archiveStore(env.TEST_HISTORY_ARCHIVE);
    const key = crypto.randomUUID();
    expect(await store.get(key)).toEqual({ ok: true, value: null });
    const bytes = new TextEncoder().encode("Привет 🌙");
    expect(await store.putIfAbsent(key, bytes)).toEqual({ ok: true, value: "created" });
    expect(await store.get(key)).toEqual({ ok: true, value: bytes });
    expect(await store.delete(key)).toEqual({ ok: true, value: undefined });
    expect(await store.delete(key)).toEqual({ ok: true, value: undefined });
    expect(await store.get(key)).toEqual({ ok: true, value: null });
  });

  it("exposes every listing page without leaking other prefixes", async () => {
    const store = archiveStore(env.TEST_HISTORY_ARCHIVE);
    const prefix = `${crypto.randomUUID()}/`;
    for (const key of [`${prefix}a`, `${prefix}b`, `${prefix}c`, crypto.randomUUID()]) {
      await store.putIfAbsent(key, new Uint8Array([1]));
    }
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await store.list({
        prefix,
        limit: 1,
        ...(cursor !== undefined && { cursor }),
      });
      if (!page.ok) {
        throw new Error(page.error);
      }
      keys.push(...page.value.keys);
      cursor = page.value.cursor;
    } while (cursor !== undefined);
    expect(keys).toEqual([`${prefix}a`, `${prefix}b`, `${prefix}c`]);
  });
});
