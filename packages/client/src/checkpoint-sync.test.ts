import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createCheckpoint } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createPaceClient } from "./create-client.ts";
import { at, createFakeFetch, fakeInstance, fakeMe, settingsEvent } from "./fake-fetch.fake.ts";
import { seedCopy, storedEvents } from "./local-store.fake.ts";
import { createMemorySessionStore } from "./session.ts";

const old = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(8), { language: "ru" });
const digest = async (text: string) => createHash("sha256").update(text).digest("hex");
const setup = async (isCorrupt = false) => {
  const cp = createCheckpoint({
    storeId: "one",
    build: "server-release-different-from-client",
    coveredSeq: 3,
    cutoff: at(9),
    cutoffTimezone: "UTC",
    records: [{ seq: 3, event: old }],
  });
  if (!cp.ok) {
    throw new Error(cp.error);
  }
  const json = JSON.stringify(cp.value);
  const hash = await digest(json);
  const fake = createFakeFetch({
    "GET /api/me": () => fakeMe,
    "GET /api/instance": () => ({ ...fakeInstance, features: { historyCheckpoint: 1 } }),
    "GET /api/sync/bootstrap": () => ({
      kind: "checkpoint",
      storeId: "one",
      checkpointJson: json,
      checkpointSha256: isCorrupt ? "b".repeat(64) : hash,
      throughSeq: 3,
      records: [],
      seq: 3,
      more: false,
    }),
    "GET /api/sync/pull": ({ url }) => ({
      events: [],
      records: [],
      more: false,
      seq: Number(url.searchParams.get("since")),
      storeId: "one",
    }),
  });
  const session = createMemorySessionStore();
  await session.set("token");
  const disk = createMemoryEventStore();
  const client = createPaceClient({
    baseUrl: "https://api.test",
    deviceId: "device",
    now: () => at(12),
    source: "web",
    session,
    store: disk,
    fetch: fake.fetch,
    sha256Text: digest,
  });
  await client.auth.ready;
  await client.state.ready;
  return { client, disk, fake };
};
describe("enhanced checkpoint sync", () => {
  it("bootstraps current projections once, caches negotiation and settles with no history download", async () => {
    const { client, disk, fake } = await setup();
    expect(await client.sync.syncNow()).toMatchObject({ ok: true });
    expect(client.state.store.getState()).toMatchObject({
      settings: { language: "ru" },
      historyCoverage: "checkpoint",
      log: [],
    });
    expect((await disk.readMeta()).cursor).toBe(3);
    await client.sync.syncNow();
    expect(fake.pathsCalled("/api/instance")).toHaveLength(1);
    expect(fake.pathsCalled("/api/sync/bootstrap")).toHaveLength(1);
    expect(client.sync.status.getState()).toMatchObject({ syncing: false, lastError: null });
    client.close();
  });
  it("keeps old state and pending on a corrupt bootstrap with an online error", async () => {
    const { client, disk } = await setup(true);
    await client.state.dispatch({
      type: "settings.updated",
      occurredAt: at(10),
      payload: { language: "en" },
    });
    expect(await client.sync.syncNow()).toEqual({
      ok: false,
      error: "checkpoint/invalid-snapshot",
    });
    expect(await disk.listPending()).toHaveLength(1);
    expect(client.sync.status.getState()).toMatchObject({
      syncing: false,
      online: true,
      lastError: "checkpoint/invalid-snapshot",
    });
    client.close();
  });
});

describe("enhanced recovery", () => {
  it("hydrates once for an unsafe remote correction, applies its page and then settles", async () => {
    const { client, disk, fake } = await setup();
    await client.sync.syncNow();
    const correction = {
      ...old,
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAC",
      occurredAt: at(10),
      recordedAt: at(10),
      type: "event.revoked",
      payload: { targetId: old.id },
    } as const;
    const fetched = createFakeFetch({
      "GET /api/sync/pull": ({ url }) =>
        url.searchParams.has("through")
          ? {
              events: [old],
              records: [{ seq: 3, event: old }],
              seq: 3,
              more: false,
              storeId: "one",
            }
          : {
              events: [correction],
              records: [{ seq: 7, event: correction }],
              seq: 7,
              more: false,
              storeId: "one",
            },
    });
    // A separate transport models the next server page while sharing the real coordinator/store.
    const { createCheckpointSync } = await import("./checkpoint-sync.ts");
    const { createApiClient } = await import("./api-client.ts");
    const { httpTransport } = await import("./sync-transport.ts");
    const { createHistoryCoordinator } = await import("./history.ts");
    const api = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetched.fetch,
      token: () => "token",
    });
    const history = createHistoryCoordinator({
      store: disk,
      state: client.state,
      pull: httpTransport(api).pull,
    });
    const enhanced = createCheckpointSync({
      api,
      store: disk,
      state: client.state,
      transport: httpTransport(api),
      history,
      hash: digest,
    });
    expect(await enhanced.run()).toMatchObject({ summary: { pulled: 1 } });
    expect(client.state.store.getState()).toMatchObject({
      settings: { language: "en" },
      historyCoverage: "full",
    });
    expect((await disk.readMeta()).cursor).toBe(7);
    expect(fetched.calls.filter((call) => call.path === "/api/sync/pull")).toHaveLength(2);
    expect(fake.pathsCalled("/api/sync/bootstrap")).toHaveLength(1);
    history.close();
    enhanced.close();
    client.close();
  });
});

describe("in-flight ownership", () => {
  it("refuses an old pull response after another owner claims the shared copy", async () => {
    const { client, disk } = await setup();
    await client.sync.syncNow();
    await client.state.claim("owner-a");
    const { promise: held, resolve: release } = Promise.withResolvers<null>();
    const { promise: started, resolve: requested } = Promise.withResolvers<null>();
    const { createCheckpointSync } = await import("./checkpoint-sync.ts");
    const { createApiClient } = await import("./api-client.ts");
    const fresh = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAD", at(10), { language: "en" });
    const enhanced = createCheckpointSync({
      api: createApiClient({ baseUrl: "https://api.test", token: () => "token" }),
      store: disk,
      state: client.state,
      history: client.history,
      transport: {
        pull: async (since) => {
          requested(null);
          await held;
          return {
            since,
            seq: 7,
            storeId: "one",
            events: [fresh],
            records: [{ seq: 7, event: fresh }],
            more: false,
          };
        },
        push: async () => ({ accepted: [], rejected: [], seq: 7 }),
      },
    });
    const completion = enhanced.run();
    await started;
    await disk.setOwner("owner-b");
    release(null);
    await expect(completion).rejects.toThrow("sync/copy-changed");
    expect((await disk.readMeta()).cursor).toBe(3);
    expect(await storedEvents(disk)).toEqual([]);
    enhanced.close();
    client.close();
  });
});

/**
A run that refuses a copy no longer its own sends nothing of the sync, but asks whether the
session still stands (`GET /api/me`): the copy changes hands when a session ends in another tab
(bug-lessons class 123).
*/
const otherThanSessionCheck = (calls: readonly { readonly path: string }[]): readonly string[] =>
  calls.map((call) => call.path).filter((path) => path !== "/api/me");

describe("held session identity", () => {
  it("does not bless another owner's disk guard before requesting a page", async () => {
    const { client, disk, fake } = await setup();
    await client.sync.syncNow();
    await client.state.claim("owner-a");
    await disk.setOwner("owner-b");
    const calls = fake.calls.length;
    expect(await client.sync.syncNow()).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(otherThanSessionCheck(fake.calls.slice(calls))).toEqual([]);
    expect((await disk.readMeta()).cursor).toBe(3);
    client.close();
  });
  it("confirms an empty source generation before pushing a pending offline action", async () => {
    const session = createMemorySessionStore();
    await session.set("token");
    const disk = createMemoryEventStore();
    await disk.setOwner("owner");
    const pending = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAE", at(10), { language: "ru" });
    await disk.append([pending], await disk.readMeta());
    let isAccepted = false;
    const fake = createFakeFetch({
      "GET /api/me": () => fakeMe,
      "GET /api/instance": () => ({ ...fakeInstance, features: { historyCheckpoint: 1 } }),
      "GET /api/sync/bootstrap": () => ({ kind: "source", storeId: "one" }),
      "GET /api/sync/pull": () => ({
        events: isAccepted ? [pending] : [],
        records: isAccepted ? [{ seq: 7, event: pending }] : [],
        seq: isAccepted ? 7 : 0,
        more: false,
        storeId: "one",
      }),
      "POST /api/sync/push": () => {
        isAccepted = true;
        return { accepted: [pending.id], rejected: [], seq: 7 };
      },
    });
    const client = createPaceClient({
      baseUrl: "https://api.test",
      session,
      source: "web",
      deviceId: "device",
      now: () => at(12),
      store: disk,
      fetch: fake.fetch,
      sha256Text: digest,
    });
    await client.auth.ready;
    expect(await client.sync.syncNow()).toEqual({ ok: true, value: { pulled: 1, pushed: 1 } });
    expect(await disk.listPending()).toEqual([]);
    expect((await disk.readSnapshot()).owner).toBe("owner");
    expect(client.state.store.getState().settings.language).toBe("ru");
    const before = fake.pathsCalled("/api/sync/bootstrap").length;
    await client.sync.syncNow();
    expect(fake.pathsCalled("/api/sync/bootstrap")).toHaveLength(before);
    client.close();
  });
});

describe("outbox inventory ownership", () => {
  it("never pushes a captured old outbox under a newly claimed generation", async () => {
    const { client, disk } = await setup();
    await client.sync.syncNow();
    await client.state.claim("owner-a");
    await client.state.dispatch({
      type: "settings.updated",
      occurredAt: at(10),
      payload: { language: "en" },
    });
    let pushes = 0;
    const wrapped = {
      ...disk,
      // The copy changes hands right after the run read its outbox.
      listPending: async () => {
        const captured = await disk.listPending();
        await disk.clear();
        await disk.setOwner("owner-b");
        await disk.applyLegacyPage({
          guard: await disk.readMeta(),
          storeId: "two",
          since: 0,
          seq: 0,
          events: [],
        });
        await client.state.claim("owner-b");
        return captured;
      },
    };
    const { createCheckpointSync } = await import("./checkpoint-sync.ts");
    const { createApiClient } = await import("./api-client.ts");
    const enhanced = createCheckpointSync({
      api: createApiClient({ baseUrl: "https://api.test", token: () => "token" }),
      state: client.state,
      store: wrapped,
      history: client.history,
      transport: {
        pull: async (since) => ({
          since,
          seq: since,
          storeId: "one",
          events: [],
          records: [],
          more: false,
        }),
        push: async () => {
          pushes++;
          return { accepted: [], rejected: [], seq: 0 };
        },
      },
    });
    await expect(enhanced.run()).rejects.toThrow("sync/copy-changed");
    expect(pushes).toBe(0);
    expect((await disk.readSnapshot()).owner).toBe("owner-b");
    enhanced.close();
    client.close();
  });
});

describe("closed sync lifetime", () => {
  it("does not renegotiate or make a request after runtime disposal", async () => {
    const { client, fake } = await setup();
    await client.sync.syncNow();
    client.close();
    const calls = fake.calls.length;
    expect(await client.sync.syncNow()).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(fake.calls).toHaveLength(calls);
  });
});

describe("refused conditional clear ownership", () => {
  it("keeps the held owner when another account's copy refuses clear and makes no foreign request or write", async () => {
    const { client, disk, fake } = await setup();
    await client.sync.syncNow();
    await client.state.claim("owner-a");
    await disk.clear();
    await disk.setOwner("owner-b");
    await seedCopy(disk, { storeId: "two" });
    const foreign = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAZ", at(11), { language: "ru" });
    await disk.append([foreign], await disk.readMeta());
    await client.state.clear("owner-a");
    const calls = fake.calls.length;
    expect(await client.sync.syncNow()).toEqual({ ok: false, error: "sync/copy-changed" });
    expect(otherThanSessionCheck(fake.calls.slice(calls))).toEqual([]);
    expect(
      await client.state.dispatch({
        type: "settings.updated",
        occurredAt: at(12),
        payload: { language: "en" },
      }),
    ).toEqual({ ok: false, error: "persist_failed" });
    expect(await storedEvents(disk)).toEqual([foreign]);
    expect((await disk.readSnapshot()).owner).toBe("owner-b");
    client.close();
  });
});
