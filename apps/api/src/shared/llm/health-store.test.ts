import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import type { LlmHealth } from "./health-object.ts";
import type { Health, Verdict } from "./health.ts";

import { HEALTH_CACHE_MS, inBackground, objectHealth } from "./health-store.ts";

/**
The isolate's side of the health memory, against the deployment's real `LlmHealth` object in
workerd (each test names its own providers: the object is one for the whole file).
*/

const NOW = "2026-11-02T10:00:00.000Z";

const unwell = (provider: string): Verdict => ({
  outcome: "unwell",
  provider,
  why: "server-error",
});
const answered = (provider: string): Verdict => ({ outcome: "ok", provider });

/** A namespace whose object answers with `stub`, counting the calls. */
const fakeNamespace = (stub: {
  readonly read: () => Promise<Health>;
  readonly record: (verdicts: readonly Verdict[], now: string) => Promise<Health>;
}) => {
  const calls = { read: 0, record: 0 };
  const counted = {
    read: async () => {
      calls.read += 1;
      return await stub.read();
    },
    record: async (verdicts: readonly Verdict[], now: string) => {
      calls.record += 1;
      return await stub.record(verdicts, now);
    },
  };
  const namespace = {
    get: () => counted,
    idFromName: (name: string) => name,
  } as unknown as DurableObjectNamespace<LlmHealth>;
  return { calls, namespace };
};

const broken = async (): Promise<never> => {
  await Promise.resolve();
  throw new Error("object unavailable");
};

describe("objectHealth", () => {
  it("keeps both penalties when two isolates record at once", async () => {
    const first = objectHealth(env.LLM_HEALTH, { cache: {} });
    const second = objectHealth(env.LLM_HEALTH, { cache: {} });
    await Promise.all([
      first.record([unwell("both-one")], NOW),
      second.record([unwell("both-two")], NOW),
    ]);
    const health = await objectHealth(env.LLM_HEALTH, { cache: {} }).read();
    expect(health).toHaveProperty("both-one");
    expect(health).toHaveProperty("both-two");
  });

  it("asks the object at most once per cache window, and sees its own records at once", async () => {
    const { calls, namespace } = fakeNamespace({
      read: async () => await env.LLM_HEALTH.get(env.LLM_HEALTH.idFromName("global")).read(),
      record: async (verdicts, now) =>
        await env.LLM_HEALTH.get(env.LLM_HEALTH.idFromName("global")).record(verdicts, now),
    });
    let clock = 0;
    const health = objectHealth(namespace, { cache: {}, clock: () => clock });
    await health.read();
    clock = HEALTH_CACHE_MS - 1;
    await health.read();
    expect(calls.read).toBe(1);
    await health.record([unwell("cached-down")], NOW);
    expect(await health.read()).toHaveProperty("cached-down");
    expect(calls.read).toBe(1);
    clock += HEALTH_CACHE_MS;
    await health.read();
    expect(calls.read).toBe(2);
  });

  it("calls the object only for a read that changes a record", async () => {
    const { calls, namespace } = fakeNamespace({
      read: async () => {
        await Promise.resolve();
        return {};
      },
      record: async () => {
        await Promise.resolve();
        return {};
      },
    });
    const health = objectHealth(namespace, { cache: {} });
    await health.record([answered("quiet-good")], NOW);
    await health.record([answered("quiet-good"), answered("quiet-other")], NOW);
    expect(calls.record).toBe(0);
  });

  it("logs an error and asks in the configured order when the object cannot be reached", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { namespace } = fakeNamespace({ read: broken, record: broken });
      const health = objectHealth(namespace, { cache: {} });
      expect(await health.read()).toEqual({});
      await expect(health.record([unwell("lost")], NOW)).resolves.toBeUndefined();
      const lines = errors.mock.calls.map(
        ([line]) => JSON.parse(String(line)) as { level: string; message: string },
      );
      const notRead = "llm: provider health not read; asking in the configured order";
      expect(lines.map(({ level, message }) => [level, message])).toEqual([
        ["error", notRead],
        ["error", notRead],
        ["error", "llm: provider health not saved"],
      ]);
    } finally {
      errors.mockRestore();
    }
  });

  it("records after the response when asked to, off the path a person waits on", async () => {
    const saved: string[] = [];
    const held = Promise.withResolvers<undefined>();
    const slowMemory = {
      read: async () => ({}),
      record: async () => {
        await held.promise;
        saved.push("saved");
      },
    };
    const later: Promise<unknown>[] = [];
    const health = inBackground(slowMemory, (promise) => {
      later.push(promise);
    });
    await health.record([unwell("background")], NOW);
    expect(saved).toEqual([]);
    expect(later).toHaveLength(1);
    held.resolve(undefined);
    await Promise.all(later);
    expect(saved).toEqual(["saved"]);
  });

  it("never caches a record the object did not save", async () => {
    const cache = {};
    const { namespace } = fakeNamespace({
      read: async () => {
        await Promise.resolve();
        return {};
      },
      record: broken,
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const health = objectHealth(namespace, { cache });
      await health.record([unwell("unsaved")], NOW);
      expect(await health.read()).toEqual({});
    } finally {
      errors.mockRestore();
    }
  });
});
