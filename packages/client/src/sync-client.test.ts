import { afterEach, describe, expect, it, vi } from "vitest";

import { type Event, LIVE_REQUEST_TIMEOUT_MS, newId } from "@pace/core";

import type { EventStore } from "./event-store.ts";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createApiClient } from "./api-client.ts";
import { createPaceClient } from "./create-client.ts";
import {
  at,
  createFakeFetch,
  FAKE_STORE_ID,
  fakeMe,
  type FakeRoute,
  problem,
  settingsEvent,
} from "./fake-fetch.fake.ts";
import { say } from "./fake-socket.fake.ts";
import { createFakeSyncServer, type FakeRequest } from "./fake-sync-server.fake.ts";
import { createMemorySessionStore } from "./session.ts";
import { type AppStateHandle, createAppState } from "./state.ts";
import { createSyncClient, SOON_MS, type SyncClient } from "./sync-client.ts";
import { httpTransport } from "./sync-transport.ts";
import { SYNC_SCHEMA_VERSION } from "./sync-version.ts";

const NOW = "2026-10-06T12:00:00.000Z";
const STORE_ID = "store-a";
const EMPTY_PAGE = { events: [], more: false, seq: 0, storeId: STORE_ID };
const noPull: FakeRoute = () => EMPTY_PAGE;
const acceptAll: FakeRoute = ({ body }) => {
  const { events } = body as { events: readonly Event[] };
  return { accepted: events.map((event) => event.id), rejected: [], seq: events.length };
};

/** A sync over `store` as the app starts it: a fresh state read from the store. */
const started = async (store: EventStore, routes: Readonly<Record<string, FakeRoute>>) => {
  const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
  await state.ready;
  const fake = createFakeFetch(routes);
  const api = createApiClient({
    baseUrl: "https://api.test",
    fetch: fake.fetch,
    token: () => "t",
  });
  const sync = createSyncClient({ now: () => NOW, state, store, transport: httpTransport(api) });
  return { calls: fake.calls, state, sync };
};

const setup = async (
  routes: Readonly<Record<string, FakeRoute>>,
  pending: readonly Event[] = [],
): Promise<{
  readonly calls: ReturnType<typeof createFakeFetch>["calls"];
  readonly state: AppStateHandle;
  readonly store: ReturnType<typeof createMemoryEventStore>;
  readonly sync: SyncClient;
}> => {
  const store = createMemoryEventStore();
  await store.append(pending);
  return { ...(await started(store, routes)), store };
};

const localEvents = (count: number): readonly Event[] =>
  Array.from({ length: count }, (_, index) => ({
    ...settingsEvent(newId(), at(9, index % 60), { language: "ru" }),
    deviceId: "dev-1",
  }));

describe("createSyncClient push", () => {
  it("pushes pending events in batches of 200, marks accepted and keeps rejected", async () => {
    const pending = localEvents(250);
    const rejectedId = pending[0]?.id ?? "";
    const { calls, store, sync } = await setup(
      {
        "GET /api/sync/pull": noPull,
        "POST /api/sync/push": ({ body }) => {
          const { events } = body as { events: readonly Event[] };
          const accepted = events.map((event) => event.id).filter((id) => id !== rejectedId);
          const rejected = events
            .filter((event) => event.id === rejectedId)
            .map((event) => ({ id: event.id, reason: "invalid" }));
          return { accepted, rejected, seq: 1 };
        },
      },
      pending,
    );
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 0, pushed: 249 } });
    const pushes = calls.filter((call) => call.path === "/api/sync/push");
    expect(pushes.map((call) => (call.body as { events: unknown[] }).events.length)).toEqual([
      200, 50,
    ]);
    await expect(store.listPending()).resolves.toEqual([pending[0]]);
    expect(sync.status.getState()).toMatchObject({
      lastError: expect.stringContaining(rejectedId) as string,
      lastSyncAt: NOW,
      online: true,
      syncing: false,
    });
  });
});

describe("createSyncClient on Hermes", () => {
  it("syncs where the platform has no Promise.withResolvers", async () => {
    const withResolvers = Object.getOwnPropertyDescriptor(Promise, "withResolvers");

    delete (Promise as { withResolvers?: unknown }).withResolvers;
    try {
      const { sync } = await setup(
        { "GET /api/sync/pull": noPull, "POST /api/sync/push": acceptAll },
        localEvents(2),
      );
      await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 0, pushed: 2 } });
    } finally {
      if (withResolvers !== undefined) {
        Object.defineProperty(Promise, "withResolvers", withResolvers);
      }
    }
  });
});

describe("createSyncClient pull", () => {
  it("pulls pages until more is false, ingests them and advances the cursor", async () => {
    const pages: Record<string, unknown> = {
      "0": {
        events: [settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" })],
        more: true,
        seq: 1,
        storeId: STORE_ID,
      },
      "1": {
        events: [settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(10), { timezone: "UTC" })],
        more: false,
        seq: 2,
        storeId: STORE_ID,
      },
    };
    const { calls, state, store, sync } = await setup({
      "GET /api/sync/pull": ({ url }) => pages[url.searchParams.get("since") ?? ""],
    });
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 2, pushed: 0 } });
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(0);
    expect(state.store.getState().settings).toMatchObject({ language: "ru", timezone: "UTC" });
    await expect(store.getCursor()).resolves.toBe(2);
    await expect(store.listPending()).resolves.toEqual([]);
  });

  it("keeps a pulled event whose server-made id is longer than 64 characters", async () => {
    // An edited series's instance is `rep:<series>:<revision>:<n>`; its missed outcome nests it.
    const id = `auto:rep:01ARZ3NDEKTSV4RRFFQ69G5FAA:01ARZ3NDEKTSV4RRFFQ69G5FAB:12:missed`;
    expect(id.length).toBeGreaterThan(64);
    const { state, sync } = await setup({
      "GET /api/sync/pull": () => ({
        events: [{ ...settingsEvent(id, at(9), { language: "ru" }), source: "system" }],
        more: false,
        seq: 1,
        storeId: STORE_ID,
      }),
    });
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 1, pushed: 0 } });
    expect(state.store.getState().settings.language).toBe("ru");
  });

  it("skips pulled events that fail validation and still advances", async () => {
    const { state, store, sync } = await setup({
      "GET /api/sync/pull": () => ({
        events: [{ ...settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), {}), payload: 1 }],
        more: false,
        seq: 5,
        storeId: STORE_ID,
      }),
    });
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 0, pushed: 0 } });
    expect(state.store.getState().events).toEqual([]);
    await expect(store.getCursor()).resolves.toBe(5);
  });
});

describe("createSyncClient store id", () => {
  const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });

  it("remembers the store id of the first pull", async () => {
    const { store, sync } = await setup({ "GET /api/sync/pull": noPull });
    await expect(store.getStoreId()).resolves.toBeNull();
    await sync.syncNow();
    await expect(store.getStoreId()).resolves.toBe(STORE_ID);
  });

  it("pulls before it pushes, so the store id is confirmed first", async () => {
    const { calls, sync } = await setup(
      { "GET /api/sync/pull": noPull, "POST /api/sync/push": acceptAll },
      localEvents(1),
    );
    await sync.syncNow();
    // The pull after the push brings what the server derived from it.
    expect(calls.map((call) => call.path)).toEqual([
      "/api/sync/pull",
      "/api/sync/push",
      "/api/sync/pull",
    ]);
  });

  it("pushes nothing while the store id cannot be confirmed", async () => {
    const { calls, store, sync } = await setup(
      { "GET /api/sync/pull": () => problem(500, "boom"), "POST /api/sync/push": acceptAll },
      localEvents(1),
    );
    await expect(sync.syncNow()).resolves.toMatchObject({ ok: false });
    expect(calls.map((call) => call.path)).toEqual(["/api/sync/pull"]);
    await expect(store.listPending()).resolves.toHaveLength(1);
  });

  it("drops the local log, outbox and cursor when the store was reset, then pulls from 0", async () => {
    const sinces: (null | string)[] = [];
    const { calls, state, store, sync } = await setup(
      {
        "GET /api/sync/pull": ({ url }) => {
          const since = url.searchParams.get("since");
          sinces.push(since);
          return since === "0"
            ? { events: [remote], more: false, seq: 1, storeId: "store-b" }
            : { events: [], more: false, seq: 9, storeId: "store-b" };
        },
        "POST /api/sync/push": acceptAll,
      },
      localEvents(2),
    );
    await store.setStoreId(STORE_ID);
    await store.setCursor(9);
    await store.setSyncVersion(SYNC_SCHEMA_VERSION);
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 1, pushed: 0 } });
    // The old outbox never reaches the fresh store.
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(0);
    expect(sinces).toEqual(["9", "0"]);
    await expect(store.listAll()).resolves.toEqual([remote]);
    await expect(store.listPending()).resolves.toEqual([]);
    await expect(store.getCursor()).resolves.toBe(1);
    await expect(store.getStoreId()).resolves.toBe("store-b");
    expect(state.store.getState().events).toEqual([remote]);
    expect(state.store.getState().settings.language).toBe("ru");
  });

  it("drops a log pulled before store ids existed (a cursor and no id)", async () => {
    const { calls, store, sync } = await setup(
      { "GET /api/sync/pull": noPull, "POST /api/sync/push": acceptAll },
      localEvents(1),
    );
    await store.setCursor(4);
    await sync.syncNow();
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(0);
    await expect(store.listAll()).resolves.toEqual([]);
    await expect(store.getStoreId()).resolves.toBe(STORE_ID);
  });

  it("keeps what was written before the very first pull and sends it", async () => {
    const { calls, store, sync } = await setup(
      { "GET /api/sync/pull": noPull, "POST /api/sync/push": acceptAll },
      localEvents(1),
    );
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 0, pushed: 1 } });
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(1);
    await expect(store.listPending()).resolves.toEqual([]);
  });

  it("names the confirmed store in every push", async () => {
    const { calls, sync } = await setup(
      { "GET /api/sync/pull": noPull, "POST /api/sync/push": acceptAll },
      localEvents(1),
    );
    await sync.syncNow();
    const pushed = calls.find((call) => call.path === "/api/sync/push");
    expect(pushed?.body).toMatchObject({ storeId: STORE_ID });
  });

  it("resets at most once a run: a second change stops it, to retry later", async () => {
    let next = 0;
    const ids = ["store-b", "store-c", "store-d"];
    const { calls, store, sync } = await setup(
      {
        "GET /api/sync/pull": () => ({ ...EMPTY_PAGE, storeId: ids[next++] ?? "store-z" }),
        "POST /api/sync/push": acceptAll,
      },
      localEvents(1),
    );
    await store.setStoreId(STORE_ID);
    await expect(sync.syncNow()).resolves.toEqual({ error: "store/changed", ok: false });
    expect(calls.map((call) => call.path)).toEqual(["/api/sync/pull", "/api/sync/pull"]);
    expect(sync.status.getState()).toMatchObject({ lastError: "store/changed", syncing: false });
  });

  it("drops what was written while the reset was under way, on screen too", async () => {
    const answered = Promise.withResolvers<boolean>();
    const { calls, state, store, sync } = await setup({
      "GET /api/sync/pull": async ({ url }) => {
        if (url.searchParams.get("since") === "0") {
          return { events: [remote], more: false, seq: 1, storeId: "store-b" };
        }
        await answered.promise;
        return { ...EMPTY_PAGE, seq: 9, storeId: "store-b" };
      },
      "POST /api/sync/push": acceptAll,
    });
    await store.setStoreId(STORE_ID);
    await store.setCursor(9);
    await store.setSyncVersion(SYNC_SCHEMA_VERSION);
    const run = sync.syncNow();
    // Written on the old copy while the server's answer (a new store) is on its way.
    await state.dispatch({
      occurredAt: at(11),
      payload: { language: "en" },
      type: "settings.updated",
    });
    expect(state.store.getState().settings.language).toBe("en");
    answered.resolve(true);
    await expect(run).resolves.toEqual({ ok: true, value: { pulled: 1, pushed: 0 } });
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(0);
    await expect(store.listPending()).resolves.toEqual([]);
    expect(state.store.getState().events).toEqual([remote]);
    expect(state.store.getState().settings.language).toBe("ru");
  });
});

describe("createSyncClient after an update that reads more of the log", () => {
  const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });
  // Older clients refused ids past 64 characters and moved their cursor past such events.
  const longId = `auto:rep:01ARZ3NDEKTSV4RRFFQ69G5FAA:01ARZ3NDEKTSV4RRFFQ69G5FAB:12:missed`;
  const skipped = { ...settingsEvent(longId, at(10), { timezone: "UTC" }), source: "system" };

  /** A store as an installed client left it: pulled up to 500, one change not yet sent. */
  const upgradedStore = async () => {
    const store = createMemoryEventStore();
    await store.append([remote]);
    await store.markSynced([remote.id]);
    const [outbox] = localEvents(1);
    await store.append(outbox === undefined ? [] : [outbox]);
    await store.setStoreId(STORE_ID);
    await store.setCursor(500);
    return { outbox, store };
  };

  it("re-pulls from 0 once, keeps and sends its outbox, and pulls from its cursor after that", async () => {
    const { outbox, store } = await upgradedStore();
    const sinces: (null | string)[] = [];
    const pushed: string[] = [];
    const routes: Readonly<Record<string, FakeRoute>> = {
      "GET /api/sync/pull": ({ url }) => {
        const since = url.searchParams.get("since");
        sinces.push(since);
        return since === "0"
          ? { events: [remote, skipped], more: false, seq: 501, storeId: STORE_ID }
          : { ...EMPTY_PAGE, seq: Number(since) };
      },
      "POST /api/sync/push": (request) => {
        const { events } = request.body as { events: readonly Event[] };
        pushed.push(...events.map((event) => event.id));
        return acceptAll(request);
      },
    };
    const first = await started(store, routes);
    await expect(first.sync.syncNow()).resolves.toMatchObject({ ok: true, value: { pushed: 1 } });
    expect(sinces).toEqual(["0", "501"]);
    expect(pushed).toEqual([outbox?.id]);
    await expect(store.listPending()).resolves.toEqual([]);
    expect(first.state.store.getState().settings).toMatchObject({
      language: "ru",
      timezone: "UTC",
    });
    await expect(store.getCursor()).resolves.toBe(501);
    // The next start pulls from where it stopped.
    const next = await started(store, routes);
    await next.sync.syncNow();
    expect(sinces).toEqual(["0", "501", "501"]);
    expect(next.state.store.getState().settings.timezone).toBe("UTC");
  });

  it("does not re-pull again after its store was reset and pulled from 0", async () => {
    const { store } = await upgradedStore();
    await store.setSyncVersion(SYNC_SCHEMA_VERSION);
    const sinces: (null | string)[] = [];
    const routes: Readonly<Record<string, FakeRoute>> = {
      "GET /api/sync/pull": ({ url }) => {
        const since = url.searchParams.get("since");
        sinces.push(since);
        return since === "0"
          ? { events: [remote], more: false, seq: 3, storeId: "store-b" }
          : { ...EMPTY_PAGE, seq: Number(since), storeId: "store-b" };
      },
      "POST /api/sync/push": acceptAll,
    };
    await (await started(store, routes)).sync.syncNow();
    expect(sinces).toEqual(["500", "0"]);
    await (await started(store, routes)).sync.syncNow();
    expect(sinces).toEqual(["500", "0", "3"]);
  });
});

describe("createSyncClient scheduling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not overlap runs", async () => {
    const gate = Promise.withResolvers<boolean>();
    const { calls, sync } = await setup(
      {
        "GET /api/sync/pull": noPull,
        "POST /api/sync/push": async ({ body }) => {
          await gate.promise;
          return acceptAll({ body, url: new URL("https://api.test") });
        },
      },
      localEvents(1),
    );
    const first = sync.syncNow();
    const second = sync.syncNow();
    expect(sync.status.getState().syncing).toBe(true);
    gate.resolve(true);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, value: { pulled: 0, pushed: 1 } },
      { ok: true, value: { pulled: 0, pushed: 1 } },
    ]);
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(1);
  });

  it("backs off exponentially on failure and returns to the interval on success", async () => {
    vi.useFakeTimers();
    let isFailing = true;
    const { calls, sync } = await setup({
      "GET /api/sync/pull": () => {
        if (isFailing) {
          throw new TypeError("fetch failed");
        }
        return EMPTY_PAGE;
      },
    });
    sync.start({ intervalMs: 10_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(sync.status.getState()).toMatchObject({ lastError: "fetch failed", online: false });
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toHaveLength(3);
    isFailing = false;
    await vi.advanceTimersByTimeAsync(4000);
    expect(calls).toHaveLength(4);
    expect(sync.status.getState()).toMatchObject({ lastError: null, online: true });
    await vi.advanceTimersByTimeAsync(9999);
    expect(calls).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(5);
    sync.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(5);
  });

  it("caps the backoff at 60 seconds and reports api errors as online", async () => {
    vi.useFakeTimers();
    const { calls, sync } = await setup({
      "GET /api/sync/pull": () => Response.json({ code: "boom", message: "Boom" }, { status: 500 }),
    });
    sync.start({ intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.status.getState()).toMatchObject({ lastError: "Boom", online: true });
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16_000 + 32_000);
    expect(calls).toHaveLength(7);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(8);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(9);
    sync.stop();
  });
});

describe("createSyncClient soon", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a local change within a second, one run for a burst of changes", async () => {
    vi.useFakeTimers();
    const { calls, sync } = await setup({
      "GET /api/sync/pull": noPull,
      "POST /api/sync/push": acceptAll,
    });
    sync.start({ intervalMs: 300_000 });
    await vi.advanceTimersByTimeAsync(0);
    const before = calls.length;
    sync.soon();
    sync.soon();
    await vi.advanceTimersByTimeAsync(400);
    // A later change does not push the first one back: it goes at most 0.8 s after it.
    sync.soon();
    await vi.advanceTimersByTimeAsync(399);
    expect(calls).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.length).toBeGreaterThan(before);
    const after = calls.length;
    // Then back to the slow interval, not every second.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(after);
    sync.stop();
  });

  it("takes a new interval at once (live channel up: rarely; down: often)", async () => {
    vi.useFakeTimers();
    const { calls, sync } = await setup({ "GET /api/sync/pull": noPull });
    sync.start({ intervalMs: 300_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    sync.setInterval(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toHaveLength(2);
    sync.stop();
    sync.soon();
    await vi.advanceTimersByTimeAsync(5000);
    // Stopped (signed out): nothing runs.
    expect(calls).toHaveLength(2);
  });
});

/**
A client wired as the app wires it (`createPaceClient`), on one fake server reachable both ways:
the live socket (`speaksV2: false` plays an older server that only says `changed`) and HTTP.
*/
const setupLive = async (
  options: { readonly speaksV2?: boolean; readonly seed?: readonly Event[] } = {},
) => {
  const server = createFakeSyncServer(FAKE_STORE_ID);
  server.options.speaksV2 = options.speaksV2 ?? true;
  server.append(options.seed ?? []);
  const fake = createFakeFetch({ ...server.routes, "GET /api/me": () => fakeMe });
  const session = createMemorySessionStore();
  await session.set("tok");
  const store = createMemoryEventStore();
  const client = createPaceClient({
    baseUrl: "https://api.test",
    createSocket: server.createSocket,
    deviceId: "dev-1",
    fetch: fake.fetch,
    now: () => NOW,
    session,
    source: "web",
    store,
  });
  await client.auth.ready;
  await client.state.ready;
  client.live.start();
  const socket = server.connect();
  const write = async (count: number): Promise<readonly Event[]> => {
    for (let index = 0; index < count; index += 1) {
      await client.state.dispatch({
        occurredAt: at(10, index),
        payload: { language: index % 2 === 0 ? "ru" : "en" },
        type: "settings.updated",
      });
    }
    return await store.listPending();
  };
  return { client, fake, server, socket, store, write };
};

const via = (transport: FakeRequest["transport"], ...types: FakeRequest["type"][]): FakeRequest[] =>
  types.map((type) => ({ transport, type }));

/** How many copies of each id a log holds. */
const copies = (events: readonly Event[]): readonly number[] => {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.id, (counts.get(event.id) ?? 0) + 1);
  }
  return counts.values().toArray();
};

describe("createSyncClient over the live socket", () => {
  const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes and pulls over an open v2 socket, and calls no sync route", async () => {
    const { client, fake, server, store, write } = await setupLive({ seed: [remote] });
    const pending = await write(2);
    await expect(client.sync.syncNow()).resolves.toMatchObject({ ok: true, value: { pushed: 2 } });
    expect(fake.pathsCalled("/api/sync")).toEqual([]);
    expect(server.requests).toEqual(via("socket", "pull", "push", "pull"));
    expect(server.log().map((event) => event.id)).toEqual([remote.id, ...pending.map((e) => e.id)]);
    await expect(store.listPending()).resolves.toEqual([]);
    await expect(store.getCursor()).resolves.toBe(3);
    expect(client.state.store.getState().events.map((event) => event.id)).toContain(remote.id);
    client.live.stop();
  });

  it.each([
    ["goes silent (the timeout)", LIVE_REQUEST_TIMEOUT_MS, false],
    ["drops", 0, true],
  ] as const)(
    "re-pushes over HTTP a socket push the server applied when the socket %s: one copy, outbox empty",
    async (_, waitMs, isDropped) => {
      vi.useFakeTimers();
      const { client, server, socket, store, write } = await setupLive();
      const markSynced = vi.spyOn(store, "markSynced");
      // The server applies the push, but its answer never arrives.
      server.options.silent = new Set<FakeRequest["type"]>(["push"]);
      const pending = await write(3);
      const run = client.sync.syncNow();
      await vi.waitFor(() => {
        expect(server.log()).toHaveLength(3);
      });
      if (isDropped) {
        socket.drop();
      }
      await vi.advanceTimersByTimeAsync(waitMs);
      await expect(run).resolves.toMatchObject({ ok: true, value: { pushed: 3 } });
      expect(server.requests).toEqual([
        ...via("socket", "pull", "push"),
        ...via("http", "push", "pull"),
      ]);
      expect(server.log()).toHaveLength(3);
      expect(copies(server.log())).toEqual([1, 1, 1]);
      const local = await store.listAll();
      expect(local).toHaveLength(3);
      expect(copies(local)).toEqual([1, 1, 1]);
      await expect(store.listPending()).resolves.toEqual([]);
      expect(markSynced.mock.calls.flatMap(([ids]) => ids)).toEqual(
        expect.arrayContaining(pending.map((event) => event.id)),
      );
      client.live.stop();
    },
  );

  it("applies a page the server sends unasked when it continues the cursor, without a pull", async () => {
    vi.useFakeTimers();
    const { client, server, store } = await setupLive();
    client.sync.start({ intervalMs: 300_000 });
    await vi.advanceTimersByTimeAsync(SOON_MS);
    const before = server.requests.length;
    server.append([remote]);
    await vi.advanceTimersByTimeAsync(SOON_MS * 2);
    expect(client.state.store.getState().events).toEqual([remote]);
    await expect(store.getCursor()).resolves.toBe(1);
    expect(server.requests).toHaveLength(before);
    client.sync.stop();
    client.live.stop();
  });

  it.each([
    ["a gap", { more: false, since: 5, storeId: FAKE_STORE_ID }],
    ["more to pull", { more: true, since: 1, storeId: FAKE_STORE_ID }],
    ["another store", { more: false, since: 1, storeId: "store-other" }],
  ] as const)("pulls within SOON_MS after a page with %s, applying none of it", async (_, page) => {
    vi.useFakeTimers();
    const { client, server, socket } = await setupLive({ seed: [remote] });
    client.sync.start({ intervalMs: 300_000 });
    await vi.advanceTimersByTimeAsync(SOON_MS);
    const before = server.requests.length;
    const stray = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(11), { timezone: "UTC" });
    say(socket, { ...page, events: page.more ? [] : [stray], seq: 9, type: "events" });
    await vi.advanceTimersByTimeAsync(SOON_MS);
    expect(server.requests.slice(before)).toEqual(via("socket", "pull"));
    expect(client.state.store.getState().events.map((event) => event.id)).not.toContain(stray.id);
    client.sync.stop();
    client.live.stop();
  });

  it("stays right when the server's derived events reach the writer before its pushed", async () => {
    const { client, server, store, write } = await setupLive();
    const derived = {
      ...settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAC", at(10, 30), {}),
      deviceId: "server",
      source: "system",
    } as const;
    const other = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAD", at(10, 40), { timezone: "UTC" });
    // While the push is in flight another device writes (a page that continues the cursor),
    // and the store derives a system event from the push (a page past the writer's cursor):
    // both arrive before the writer's `pushed`.
    server.options.beforePush = () => {
      server.append([other]);
    };
    server.options.derive = () => [derived];
    const pending = await write(1);
    await expect(client.sync.syncNow()).resolves.toMatchObject({ ok: true, value: { pushed: 1 } });
    // The two pages wait for the run; let them be read before looking.
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    await expect(store.getCursor()).resolves.toBe(3);
    const local = await store.listAll();
    expect(new Set(local.map((event) => event.id))).toEqual(
      new Set([other.id, derived.id, ...pending.map((event) => event.id)]),
    );
    expect(copies(local)).toEqual([1, 1, 1]);
    await expect(store.listPending()).resolves.toEqual([]);
    expect(client.state.store.getState().events).toHaveLength(3);
    client.live.stop();
  });

  it("goes over HTTP against a server that only speaks v1, and still pulls on its changed", async () => {
    vi.useFakeTimers();
    const { client, server, write } = await setupLive({ speaksV2: false });
    await write(1);
    await expect(client.sync.syncNow()).resolves.toMatchObject({ ok: true, value: { pushed: 1 } });
    expect(server.requests).toEqual(via("http", "pull", "push", "pull"));
    client.sync.start({ intervalMs: 300_000 });
    await vi.advanceTimersByTimeAsync(SOON_MS);
    const before = server.requests.length;
    server.append([remote]);
    await vi.advanceTimersByTimeAsync(SOON_MS);
    expect(server.requests.slice(before)).toEqual(via("http", "pull"));
    expect(client.state.store.getState().events.map((event) => event.id)).toContain(remote.id);
    client.sync.stop();
    client.live.stop();
  });
});

/** What a refused push leaves, whichever way it was refused: only the fresh store's log. */
const expectOnlyTheFreshStore = async (
  context: Awaited<ReturnType<typeof setupLive>>,
  fresh: { readonly events: readonly Event[]; readonly storeId: string },
): Promise<void> => {
  await expect(context.store.listAll()).resolves.toEqual(fresh.events);
  await expect(context.store.listPending()).resolves.toEqual([]);
  await expect(context.store.getStoreId()).resolves.toBe(fresh.storeId);
  await expect(context.store.getCursor()).resolves.toBe(fresh.events.length);
  expect(context.client.state.store.getState().events).toEqual(fresh.events);
};

describe.each([
  ["http", false],
  ["socket", true],
] as const)("createSyncClient store/changed on a push over %s", (transport, speaksV2) => {
  const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });

  it("drops the local copy like a reset, pulls the fresh store and never re-pushes", async () => {
    const context = await setupLive({ speaksV2 });
    const { client, server, write } = context;
    await write(2);
    // Wiped between this run's pull and its push.
    server.options.beforePush = () => {
      server.wipe("store-b", [remote]);
    };
    await expect(client.sync.syncNow()).resolves.toEqual({
      ok: true,
      value: { pulled: 1, pushed: 0 },
    });
    expect(server.requests.filter((request) => request.type === "push")).toEqual(
      via(transport, "push"),
    );
    await expectOnlyTheFreshStore(context, { events: [remote], storeId: "store-b" });
    client.live.stop();
  });
});
