import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createReleaseStore } from "../src/r2-store.ts";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("R2 release storage", () => {
  it("preserves immutable objects and reads their exact bytes", async () => {
    const store = createReleaseStore(env.UPDATES);
    expect(await store.read("assets/missing")).toEqual({ ok: true, value: null });
    expect(await store.putIfAbsent({ key: "assets/one", bytes: bytes("first") })).toEqual({
      ok: true,
      value: "created",
    });
    expect(await store.putIfAbsent({ key: "assets/one", bytes: bytes("second") })).toEqual({
      ok: true,
      value: "exists",
    });
    const read = await store.read("assets/one");
    expect(read.ok && read.value !== null && new TextDecoder().decode(read.value.bytes)).toBe(
      "first",
    );
  });

  it("updates only the expected channel revision", async () => {
    const store = createReleaseStore(env.UPDATES);
    const key = "channels/runtime/stable.json";
    const first = await store.compareAndSwap({ key, expectedEtag: null, bytes: bytes("one") });
    expect(first.ok && first.value !== null).toBe(true);
    if (!first.ok || first.value === null) {
      throw new Error("expected initial pointer");
    }
    expect(
      await store.compareAndSwap({ key, expectedEtag: null, bytes: bytes("duplicate") }),
    ).toEqual({ ok: true, value: null });
    const second = await store.compareAndSwap({
      key,
      expectedEtag: first.value.etag,
      bytes: bytes("two"),
    });
    expect(second.ok && second.value !== null).toBe(true);
    expect(
      await store.compareAndSwap({ key, expectedEtag: first.value.etag, bytes: bytes("stale") }),
    ).toEqual({ ok: true, value: null });
    const read = await store.read(key);
    expect(read.ok && read.value !== null && new TextDecoder().decode(read.value.bytes)).toBe(
      "two",
    );
  });
});
