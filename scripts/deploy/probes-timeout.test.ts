import { describe, expect, test } from "bun:test";

import { fixture, preview, production } from "./probes.fixtures.ts";
import { createHttpProbes } from "./probes.ts";

describe("probes-timeout", () => {
  test("bounds a fetch that ignores abort and signals cancellation", async () => {
    let signal: AbortSignal | null | undefined;
    const f = fixture(async (_url, init) => {
      signal = init.signal;
      return await new Promise<Response>(() => undefined);
    }, 10);
    expect(await f.probes.probe(preview)).toEqual({ ok: false, error: "transport" });
    expect(signal?.aborted).toBe(true);
  });
  test("bounds never-ending response body consumption", async () => {
    let isCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"identity":'));
      },
      cancel() {
        isCancelled = true;
      },
    });
    const f = fixture(async () => new Response(body), 10);
    expect(await f.probes.probe(preview)).toEqual({ ok: false, error: "transport" });
    expect(isCancelled).toBe(true);
  });
  test("cancels an unread anonymous response body", async () => {
    let isCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        isCancelled = true;
      },
    });
    const f = fixture(async () => new Response(body, { status: 401 }));
    expect(await f.probes.anonymousStatus(preview)).toEqual({ ok: true, value: 401 });
    expect(isCancelled).toBe(true);
  });
  test("bounds resolver hangs and rejects invalid adapter configuration", async () => {
    const f = fixture(undefined, 10);
    const hanging = createHttpProbes({
      ...f.config,
      resolveVersionOrigin: async () => await new Promise(() => undefined),
    });
    expect(await hanging.probe(preview)).toEqual({ ok: false, error: "transport" });
    for (const timeoutMs of [0, -1, Infinity]) {
      expect((await createHttpProbes({ ...f.config, timeoutMs }).probe(preview)).ok).toBe(false);
    }
    expect(
      (
        await createHttpProbes({
          ...f.config,
          productionOrigin: "https://production.example?x=1",
        }).probe(production)
      ).ok,
    ).toBe(false);
    expect(f.calls).toEqual([]);
  });
});
