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
import { createHeldEventStore } from "./held-event-store.fake.ts";
import { STABLE_MS } from "./live-timers.ts";
import { seedCopy, storedEvents } from "./local-store.fake.ts";
import { createMemorySessionStore } from "./session.ts";
import { type AppStateHandle, createAppState } from "./state.ts";
import {
  createSyncClient,
  HOLD_MAX_MS,
  HOLD_WAIT_MS,
  SOON_MS,
  type SyncClient,
} from "./sync-client.ts";
import { HTTP_SYNC_TIMEOUT_MS, httpTransport } from "./sync-transport.ts";
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
  await store.append(pending, await store.readMeta());
  return { ...(await started(store, routes)), store };
};

const localEvents = (count: number): readonly Event[] =>
  Array.from({ length: count }, (_, index) => ({
    ...settingsEvent(newId(), at(9, index % 60), { language: "ru" }),
    deviceId: "dev-1",
  }));

/** The ids and store of every push the server got. */
const pushesOf = (calls: ReturnType<typeof createFakeFetch>["calls"]) =>
  calls
    .filter((call) => call.path === "/api/sync/push")
    .map((call) => call.body as { events: readonly Event[]; storeId: string })
    .map(({ events, storeId }) => ({ ids: events.map((event) => event.id), storeId }));

describe("createSyncClient catching up to a connect's hello (QA PR55-1-12)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A loop started on a copy that pulled the server's log up to seq 2; every pull answered. */
  const caughtUp = async () => {
    const { calls, state, store, sync } = await setup({
      "GET /api/sync/pull": ({ url }) =>
        url.searchParams.get("since") === "0"
          ? { events: localEvents(2), more: false, seq: 2, storeId: STORE_ID }
          : { events: [], more: false, seq: 2, storeId: STORE_ID },
      "POST /api/sync/push": acceptAll,
    });
    await sync.syncNow();
    vi.useFakeTimers();
    sync.start({ intervalMs: 60_000 });
    await vi.advanceTimersByTimeAsync(0);
    const before = calls.length;
    return { calls: () => calls.slice(before), state, store, sync };
  };

  it("asks nothing when the copy already stands where the server's log stood", async () => {
    const { calls, sync } = await caughtUp();
    await sync.catchUpTo({ seq: 2, storeId: STORE_ID });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls()).toEqual([]);
    sync.stop();
  });

  it.each([
    ["behind the log", { seq: 3, storeId: STORE_ID }],
    ["on another store", { seq: 2, storeId: "store-b" }],
  ])("pulls once when the copy is %s", async (_name, head) => {
    const { calls, sync } = await caughtUp();
    await sync.catchUpTo(head);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls().map((call) => call.path)).toContain("/api/sync/pull");
    sync.stop();
  });

  it("runs when the last run could not reach the server: its success clears the offline line", async () => {
    const { calls, sync } = await caughtUp();
    sync.status.setState({ lastError: "network", online: false });
    await sync.catchUpTo({ seq: 2, storeId: STORE_ID });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls().map((call) => call.path)).toContain("/api/sync/pull");
    expect(sync.status.getState().online).toBe(true);
    sync.stop();
  });

  it("runs when the copy holds writes the server has not got", async () => {
    const { calls, state, sync } = await caughtUp();
    await state.dispatch({
      occurredAt: at(10),
      payload: { language: "en" },
      type: "settings.updated",
    });
    await sync.catchUpTo({ seq: 2, storeId: STORE_ID });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls().map((call) => call.path)).toContain("/api/sync/push");
    sync.stop();
  });
});

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
    expect((await store.readMeta()).cursor).toBe(2);
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
    expect((await store.readMeta()).cursor).toBe(5);
  });
});

describe("createSyncClient across a wipe", () => {
  it("drops a page pulled for the copy a sign-out wiped meanwhile (fix round 1 of QA 22)", async () => {
    const held: { release?: () => void } = {};
    const { state, store, sync } = await setup({
      "GET /api/sync/pull": async () => {
        await new Promise<void>((resolve) => {
          held.release = resolve;
        });
        return {
          events: [settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" })],
          more: false,
          seq: 7,
          storeId: STORE_ID,
        };
      },
    });
    const syncing = sync.syncNow();
    await vi.waitFor(() => {
      expect(held.release).toBeDefined();
    });
    // The person logs out while the first page is on its way: the local copy is wiped.
    await state.clear();
    held.release?.();
    const result = await syncing;
    expect(result.ok).toBe(false);
    // The old account's page never lands in the fresh copy: no events, no cursor, no store id.
    expect(state.store.getState().events).toEqual([]);
    await expect(storedEvents(store)).resolves.toEqual([]);
    expect((await store.readMeta()).cursor).toBe(0);
    expect((await store.readMeta()).storeId).toBeNull();
  });
});

describe("createSyncClient store id", () => {
  const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });

  it("remembers the store id of the first pull", async () => {
    const { store, sync } = await setup({ "GET /api/sync/pull": noPull });
    expect((await store.readMeta()).storeId).toBeNull();
    await sync.syncNow();
    expect((await store.readMeta()).storeId).toBe(STORE_ID);
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
    await seedCopy(store, { storeId: STORE_ID, cursor: 9, syncVersion: SYNC_SCHEMA_VERSION });
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 1, pushed: 0 } });
    // The old outbox never reaches the fresh store.
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(0);
    expect(sinces).toEqual(["9", "0"]);
    await expect(storedEvents(store)).resolves.toEqual([remote]);
    await expect(store.listPending()).resolves.toEqual([]);
    expect((await store.readMeta()).cursor).toBe(1);
    expect((await store.readMeta()).storeId).toBe("store-b");
    expect(state.store.getState().events).toEqual([remote]);
    expect(state.store.getState().settings.language).toBe("ru");
  });

  it("drops a log pulled before store ids existed (a cursor and no id)", async () => {
    const { calls, store, sync } = await setup(
      { "GET /api/sync/pull": noPull, "POST /api/sync/push": acceptAll },
      localEvents(1),
    );
    await seedCopy(store, { cursor: 4 });
    await sync.syncNow();
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(0);
    await expect(storedEvents(store)).resolves.toEqual([]);
    expect((await store.readMeta()).storeId).toBe(STORE_ID);
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
    await seedCopy(store, { storeId: STORE_ID });
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
    await seedCopy(store, { storeId: STORE_ID, cursor: 9, syncVersion: SYNC_SCHEMA_VERSION });
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

describe("createSyncClient: a write while the first pull is under way (QA round 17 decision 3)", () => {
  const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });
  const later = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(9, 1), { language: "ru" });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The app's change written while a pull is held: a time-zone pick, on the empty copy. */
  const writeDuring = async (state: AppStateHandle): Promise<string> => {
    await state.dispatch({
      occurredAt: at(10),
      payload: { timezone: "Europe/Berlin" },
      type: "settings.updated",
    });
    return state.store.getState().events.at(-1)?.id ?? "";
  };

  it("keeps a write made while the first pull is held and pushes it after, naming the confirmed store", async () => {
    const held = Promise.withResolvers<null>();
    const { calls, state, store, sync } = await setup({
      "GET /api/sync/pull": async ({ url }) => {
        if (url.searchParams.get("since") === "0") {
          await held.promise;
          return { events: [remote], more: false, seq: 1, storeId: STORE_ID };
        }
        return { ...EMPTY_PAGE, seq: 2 };
      },
      "POST /api/sync/push": acceptAll,
    });
    expect((await store.readMeta()).storeId).toBeNull();
    const run = sync.syncNow();
    const written = await writeDuring(state);
    held.resolve(null);

    await expect(run).resolves.toEqual({ ok: true, value: { pulled: 1, pushed: 1 } });
    expect(pushesOf(calls)).toEqual([{ ids: [written], storeId: STORE_ID }]);
    await expect(store.listPending()).resolves.toEqual([]);
    expect(state.store.getState().events.map((event) => event.id)).toEqual(
      expect.arrayContaining([remote.id, written]),
    );
  });

  it("keeps it too when the sync timeout cuts the first pull midway, and the next run carries on", async () => {
    vi.useFakeTimers();
    let isCut = true;
    const sinces: (null | string)[] = [];
    const fake = createFakeFetch({
      "GET /api/sync/pull": async ({ url }) => {
        const since = url.searchParams.get("since");
        sinces.push(since);
        if (since === "0") {
          return { events: [remote], more: true, seq: 1, storeId: STORE_ID };
        }
        if (since === "1" && isCut) {
          // The second page never comes: the connection stalls until the run gives up.
          await new Promise(() => undefined);
        }
        return since === "1"
          ? { events: [later], more: false, seq: 2, storeId: STORE_ID }
          : { ...EMPTY_PAGE, seq: 3 };
      },
      "POST /api/sync/push": acceptAll,
    });
    const store = createMemoryEventStore();
    const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
    await state.ready;
    const api = createApiClient({
      baseUrl: "https://api.test",
      // As a platform fetch does, an abort rejects the request however far it got.
      fetch: async (input, init) =>
        await Promise.race([
          fake.fetch(input, init),
          new Promise<never>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
        ]),
      token: () => "t",
    });
    const sync = createSyncClient({ now: () => NOW, state, store, transport: httpTransport(api) });

    const first = sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    const written = await writeDuring(state);
    await vi.advanceTimersByTimeAsync(HTTP_SYNC_TIMEOUT_MS);
    await expect(first).resolves.toEqual({ error: "sync request timed out", ok: false });
    expect(pushesOf(fake.calls)).toEqual([]);
    // The first page was kept: its store is confirmed and the cursor stands after it.
    expect((await store.readMeta()).storeId).toBe(STORE_ID);
    expect((await store.readMeta()).cursor).toBe(1);
    await expect(store.listPending()).resolves.toHaveLength(1);

    isCut = false;
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 1, pushed: 1 } });
    // Carried on from the first page's cursor: nothing pulled twice, nothing dropped.
    expect(sinces).toEqual(["0", "1", "1", "2"]);
    expect(pushesOf(fake.calls)).toEqual([{ ids: [written], storeId: STORE_ID }]);
    await expect(store.listPending()).resolves.toEqual([]);
    expect(state.store.getState().events.map((event) => event.id)).toEqual(
      expect.arrayContaining([remote.id, later.id, written]),
    );
  });
});

describe("createSyncClient reset with local writes in flight", () => {
  const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });

  it("drops a write queued behind one in flight: nothing of the old copy is pushed afterwards", async () => {
    const held = createHeldEventStore();
    await seedCopy(held.store, { storeId: STORE_ID, cursor: 9, syncVersion: SYNC_SCHEMA_VERSION });
    const { calls, state, sync } = await started(held.store, {
      "GET /api/sync/pull": ({ url }) =>
        url.searchParams.get("since") === "0"
          ? { events: [remote], more: false, seq: 1, storeId: "store-b" }
          : { ...EMPTY_PAGE, seq: 9, storeId: "store-b" },
      "POST /api/sync/push": acceptAll,
    });
    held.hold();
    const first = state.dispatch({
      occurredAt: at(11),
      payload: { language: "en" },
      type: "settings.updated",
    });
    const second = state.dispatch({
      occurredAt: at(12),
      payload: { timezone: "UTC" },
      type: "settings.updated",
    });
    const run = sync.syncNow();
    await vi.waitFor(() => {
      expect(held.writes).toHaveLength(1);
    });
    await held.writes[0]?.resolve();
    // The reset's own pull (the remote event) is written once the old copy is gone.
    await vi.waitFor(() => {
      expect(held.writes).toHaveLength(2);
    });
    expect(held.writes[1]?.events).toEqual([remote]);
    await held.writes[1]?.resolve();
    await expect(run).resolves.toMatchObject({ ok: true });
    await expect(second).resolves.toEqual({ error: "persist_failed", ok: false });
    await first;
    held.release();
    await expect(sync.syncNow()).resolves.toMatchObject({ ok: true, value: { pushed: 0 } });
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(0);
    await expect(storedEvents(held.store)).resolves.toEqual([remote]);
    await expect(held.store.listPending()).resolves.toEqual([]);
  });
});

/** The ids of every event pushed so far, in order. */
const pushedIds = (calls: ReturnType<typeof createFakeFetch>["calls"]): readonly string[] =>
  calls
    .filter((call) => call.path === "/api/sync/push")
    .flatMap((call) => (call.body as { events: readonly Event[] }).events.map(({ id }) => id));

/** The pull route `answer`, keeping the cursor of every pull it was asked for. */
const recordedPull = (answer: FakeRoute) => {
  const sinces: string[] = [];
  const route: FakeRoute = (request) => {
    sinces.push(request.url.searchParams.get("since") ?? "");
    return answer(request);
  };
  return { route, sinces };
};

/** A held store already paired with the server's store `STORE_ID` up to `cursor`. */
const paired = async (cursor: number) => {
  const held = createHeldEventStore();
  await seedCopy(held.store, {
    storeId: STORE_ID,
    cursor,
    syncVersion: SYNC_SCHEMA_VERSION,
  });
  return held;
};

/**
The steady state after a write the local store refused (Task 2.5, bug-lessons 108; CLAUDE.md's
contract rule): the network goes quiet, no request is repeated for the same id.
*/
describe("createSyncClient after the local store refused a write", () => {
  const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });

  it("never pushes a refused local action and answers it persist_failed", async () => {
    const held = await paired(0);
    const pull = recordedPull(noPull);
    const { calls, state, sync } = await started(held.store, {
      "GET /api/sync/pull": pull.route,
      "POST /api/sync/push": acceptAll,
    });
    held.hold();
    const action = state.dispatch({
      occurredAt: at(11),
      payload: { language: "en" },
      type: "settings.updated",
    });
    await vi.waitFor(() => {
      expect(held.writes).toHaveLength(1);
    });
    held.writes[0]?.reject();
    await expect(action).resolves.toEqual({ error: "persist_failed", ok: false });
    held.release();
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 0, pushed: 0 } });
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 0, pushed: 0 } });
    expect(pushedIds(calls)).toEqual([]);
    expect(pull.sinces).toEqual(["0", "0"]);
    expect(state.store.getState().events).toEqual([]);
  });

  it("pulls a refused page again once from the same cursor, then moves on and goes quiet", async () => {
    const held = await paired(4);
    const pull = recordedPull(({ url }) =>
      url.searchParams.get("since") === "4"
        ? { events: [remote], more: false, seq: 5, storeId: STORE_ID }
        : { ...EMPTY_PAGE, seq: 5 },
    );
    const { calls, state, sync } = await started(held.store, {
      "GET /api/sync/pull": pull.route,
      "POST /api/sync/push": acceptAll,
    });
    held.hold();
    const refused = sync.syncNow();
    await vi.waitFor(() => {
      expect(held.writes).toHaveLength(1);
    });
    held.writes[0]?.reject();
    await expect(refused).resolves.toMatchObject({ ok: false });
    expect((await held.store.readMeta()).cursor).toBe(4);
    expect(state.store.getState().events).toEqual([]);
    held.release();
    expect(pull.sinces).toEqual(["4"]);

    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 1, pushed: 0 } });
    expect(pull.sinces).toEqual(["4", "4"]);
    expect((await held.store.readMeta()).cursor).toBe(5);
    expect(state.store.getState().events).toEqual([remote]);

    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 0, pushed: 0 } });
    expect(pull.sinces).toEqual(["4", "4", "5"]);
    expect(pushedIds(calls)).toEqual([]);
    await expect(held.store.listPending()).resolves.toEqual([]);
  });

  it("pushes a dependent action after a refused one exactly once, then the network is quiet", async () => {
    const held = await paired(0);
    const { calls, state, sync } = await started(held.store, {
      "GET /api/sync/pull": noPull,
      "POST /api/sync/push": acceptAll,
    });
    held.hold();
    const created = state.dispatch({
      occurredAt: at(10),
      payload: { fields: {}, presetId: "personal", subtasks: [], taskId: "t1", title: "Essay" },
      type: "task.created",
    });
    const closed = state.dispatch({
      occurredAt: at(11),
      payload: { outcome: "done", taskId: "t1" },
      type: "task.closed",
    });
    await vi.waitFor(() => {
      expect(held.writes).toHaveLength(1);
    });
    held.writes[0]?.reject();
    await expect(created).resolves.toEqual({ error: "persist_failed", ok: false });
    await vi.waitFor(() => {
      expect(held.writes).toHaveLength(2);
    });
    await held.writes[1]?.resolve();
    const written = await closed;
    if (!written.ok) {
      throw new Error(written.error);
    }
    held.release();
    // By decision (bug-lessons 108, Task 2.5 fix round 1 b) the orphan stays and is sent once.
    await expect(sync.syncNow()).resolves.toMatchObject({ ok: true, value: { pushed: 1 } });
    await expect(sync.syncNow()).resolves.toMatchObject({ ok: true, value: { pushed: 0 } });
    expect(pushedIds(calls)).toEqual([written.value.id]);
    await expect(held.store.listPending()).resolves.toEqual([]);
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
    await store.append([remote], await store.readMeta());
    await store.markSynced([remote.id], await store.readMeta());
    const [outbox] = localEvents(1);
    await store.append(outbox === undefined ? [] : [outbox], await store.readMeta());
    await seedCopy(store, { storeId: STORE_ID, cursor: 500 });
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
    expect((await store.readMeta()).cursor).toBe(501);
    // The next start pulls from where it stopped.
    const next = await started(store, routes);
    await next.sync.syncNow();
    expect(sinces).toEqual(["0", "501", "501"]);
    expect(next.state.store.getState().settings.timezone).toBe("UTC");
  });

  it("does not re-pull again after its store was reset and pulled from 0", async () => {
    const { store } = await upgradedStore();
    await seedCopy(store, { syncVersion: SYNC_SCHEMA_VERSION });
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

  it("starts its loop without a second run right after one that just synced everything (QA 20 L9)", async () => {
    vi.useFakeTimers();
    const { calls, sync } = await setup({ "GET /api/sync/pull": noPull });
    await sync.syncNow();
    const pulls = () => calls.filter((call) => call.path === "/api/sync/pull").length;
    const before = pulls();
    sync.start({ intervalMs: 30_000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(pulls()).toBe(before);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pulls()).toBe(before + 1);
    sync.stop();
  });

  it("keeps a soon() asked right after start, before the first tick was placed (round 7 review 6)", async () => {
    vi.useFakeTimers();
    const { calls, sync } = await setup({ "GET /api/sync/pull": noPull });
    await sync.syncNow();
    const pulls = () => calls.filter((call) => call.path === "/api/sync/pull").length;
    const before = pulls();
    sync.start({ intervalMs: 30_000 });
    sync.soon();
    await vi.advanceTimersByTimeAsync(1500);
    expect(pulls()).toBe(before + 1);
    sync.stop();
  });

  it("starts at once when something was written since that run, or when it failed", async () => {
    vi.useFakeTimers();
    const network = { isDown: true };
    const { calls, state, sync } = await setup({
      "GET /api/sync/pull": () => {
        if (network.isDown) {
          throw new TypeError("Failed to fetch");
        }
        return EMPTY_PAGE;
      },
      "POST /api/sync/push": acceptAll,
    });
    const pulls = () => calls.filter((call) => call.path === "/api/sync/pull").length;
    await sync.syncNow();
    network.isDown = false;
    sync.start({ intervalMs: 30_000 });
    await vi.advanceTimersByTimeAsync(100);
    expect(pulls()).toBe(2);
    sync.stop();
    await sync.syncNow();
    // A write after the last run (the bootstrap's time zone): the loop's first tick sends it.
    await state.dispatch({
      occurredAt: NOW,
      payload: { language: "ru" },
      type: "settings.updated",
    });
    sync.start({ intervalMs: 30_000 });
    await vi.advanceTimersByTimeAsync(100);
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(1);
    sync.stop();
  });

  it("does not overlap runs; calls made during one share the run after it (E1)", async () => {
    const gate = Promise.withResolvers<boolean>();
    let open = 0;
    let most = 0;
    const { calls, sync } = await setup(
      {
        "GET /api/sync/pull": noPull,
        "POST /api/sync/push": async ({ body }) => {
          open += 1;
          most = Math.max(most, open);
          await gate.promise;
          open -= 1;
          return acceptAll({ body, headers: {}, url: new URL("https://api.test") });
        },
      },
      localEvents(1),
    );
    const first = sync.syncNow();
    const second = sync.syncNow();
    const third = sync.syncNow();
    expect(sync.status.getState().syncing).toBe(true);
    gate.resolve(true);
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      { ok: true, value: { pulled: 0, pushed: 1 } },
      // The run after it, shared: the outbox read afresh holds nothing more.
      { ok: true, value: { pulled: 0, pushed: 0 } },
      { ok: true, value: { pulled: 0, pushed: 0 } },
    ]);
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(1);
    // The first run's pull, its pull after the push, and the shared run's one pull.
    expect(calls.filter((call) => call.path === "/api/sync/pull")).toHaveLength(3);
    expect(most).toBe(1);
  });

  it("drops the run a call made during a run was waiting for, once the sync is stopped (fix round 5 V3)", async () => {
    // Signed out while a run was under way: the run after it would go out with no token (a 401).
    const gate = Promise.withResolvers<null>();
    const { calls, sync } = await setup(
      {
        "GET /api/sync/pull": async () => {
          await gate.promise;
          return { events: [], more: false, seq: 0, storeId: FAKE_STORE_ID };
        },
      },
      [],
    );
    sync.start({ intervalMs: 30_000 });
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    const waiting = sync.syncNow();
    sync.stop();
    gate.resolve(null);
    await expect(waiting).resolves.toEqual({ error: "stopped", ok: false });
    expect(calls).toHaveLength(1);
    // A call made after the stop runs as ever (a sign-in's first sync comes before the loop).
    await expect(sync.syncNow()).resolves.toMatchObject({ ok: true });
  });

  it("sends a write made while a run pushes when a call made after it settles (E1)", async () => {
    const gate = Promise.withResolvers<null>();
    let isFirst = true;
    const { calls, state, sync } = await setup(
      {
        "GET /api/sync/pull": noPull,
        "POST /api/sync/push": async ({ body, url }) => {
          if (isFirst) {
            isFirst = false;
            await gate.promise;
          }
          return acceptAll({ body, headers: {}, url });
        },
      },
      localEvents(1),
    );
    const first = sync.syncNow();
    await vi.waitFor(() => {
      expect(pushesOf(calls)).toHaveLength(1);
    });
    await state.dispatch({
      occurredAt: at(10),
      payload: { timezone: "Europe/Berlin" },
      type: "settings.updated",
    });
    const written = state.store.getState().events.at(-1)?.id ?? "";
    // The app leaving (a hidden tab): what is unsent goes now.
    const leaving = sync.syncNow();
    gate.resolve(null);
    await first;
    await expect(leaving).resolves.toMatchObject({ ok: true, value: { pushed: 1 } });
    expect(pushesOf(calls).at(-1)?.ids).toEqual([written]);
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

  it("sends a change made while a run is pushing right after that run, not at the next interval (E1)", async () => {
    // CI run 41380865441: a task written while a push hung on a socket gone quiet joined that
    // run, whose outbox was already listed, and waited for the next interval.
    vi.useFakeTimers();
    const gate = Promise.withResolvers<null>();
    let isFirst = true;
    const { calls, state, sync } = await setup(
      {
        "GET /api/sync/pull": noPull,
        "POST /api/sync/push": async ({ body, url }) => {
          if (isFirst) {
            isFirst = false;
            await gate.promise;
          }
          return acceptAll({ body, headers: {}, url });
        },
      },
      localEvents(1),
    );
    sync.start({ intervalMs: 300_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(pushesOf(calls)).toHaveLength(1);
    await state.dispatch({
      occurredAt: at(10),
      payload: { timezone: "Europe/Berlin" },
      type: "settings.updated",
    });
    const written = state.store.getState().events.at(-1)?.id ?? "";
    sync.soon();
    await vi.advanceTimersByTimeAsync(SOON_MS);
    gate.resolve(null);
    await vi.advanceTimersByTimeAsync(SOON_MS);
    expect(pushesOf(calls).map((push) => push.ids)).toEqual([
      [expect.any(String) as string],
      [written],
    ]);
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
  /** `isDown`: the server is gone (stopped, or the network to it): every HTTP call fails to connect. */
  const network = { isDown: false };
  const session = createMemorySessionStore();
  await session.set("tok");
  const store = createMemoryEventStore();
  const client = createPaceClient({
    baseUrl: "https://api.test",
    createSocket: server.createSocket,
    deviceId: "dev-1",
    fetch: async (input, init) => {
      if (network.isDown) {
        throw new TypeError("Failed to fetch");
      }
      return await fake.fetch(input, init);
    },
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
  return { client, fake, network, server, socket, store, write };
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
    expect((await store.readMeta()).cursor).toBe(3);
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
      const local = await storedEvents(store);
      expect(local).toHaveLength(3);
      expect(copies(local)).toEqual([1, 1, 1]);
      await expect(store.listPending()).resolves.toEqual([]);
      expect(markSynced.mock.calls.flatMap(([ids]) => ids)).toEqual(
        expect.arrayContaining(pending.map((event) => event.id)),
      );
      client.live.stop();
    },
  );

  it("says offline soon after the socket drops while the server is gone, without a storm (QA 18 M4)", async () => {
    vi.useFakeTimers();
    const { client, fake, network, server, socket } = await setupLive();
    // The safety poll while the socket is down; an idle tab writes nothing to send.
    client.sync.start({ intervalMs: 30_000 });
    // A tab left open: its socket has been up a while (a socket cut at once is a flapping link).
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    expect(client.sync.status.getState().online).toBe(true);

    network.isDown = true;
    socket.drop();
    await vi.advanceTimersByTimeAsync(2 * SOON_MS);
    expect(client.sync.status.getState().online).toBe(false);

    // The retries keep their backoff (1 s doubling): no run for every failed reconnect.
    const before = fake.pathsCalled("/api/sync").length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.pathsCalled("/api/sync").length - before).toBeLessThanOrEqual(6);

    // Back: the socket opens again, its catch-up run succeeds and the line can clear.
    network.isDown = false;
    server.connect();
    await vi.advanceTimersByTimeAsync(2 * SOON_MS);
    expect(client.sync.status.getState().online).toBe(true);
    client.sync.stop();
    client.live.stop();
  });

  it("backs off a socket that opens and is cut at once, without a pull for every cut (fix round 5 V2)", async () => {
    vi.useFakeTimers();
    const { client, fake, server } = await setupLive();
    // Wired as the app wires it: the safety poll follows the socket (rare while up, 30 s while down).
    client.sync.start({ intervalMs: 30_000 });
    const stopFollowing = client.live.status.subscribe(({ isConnected }) => {
      client.sync.setInterval(isConnected ? 300_000 : 30_000);
    });
    await vi.advanceTimersByTimeAsync(SOON_MS);
    const pullsBefore = fake.pathsCalled("/api/sync").length;
    const opensBefore = server.sockets.length;
    // A flapping link for a minute: every socket the client opens gets in, and is cut 100 ms on.
    let seen = server.sockets.at(-1);
    for (let step = 0; step < 600; step += 1) {
      const latest = server.sockets.at(-1);
      if (latest !== seen) {
        seen = latest;
        server.connect();
        await vi.advanceTimersByTimeAsync(100);
        latest?.drop();
      } else if (step === 0) {
        latest?.drop();
      }
      await vi.advanceTimersByTimeAsync(100);
    }
    const opens = server.sockets.length - opensBefore;
    const pulls = fake.pathsCalled("/api/sync").length - pullsBefore;
    // Reconnects after 1, 2, 4, 8, 16, 32 s (not every second), and no run for each short life.
    expect(opens).toBeLessThanOrEqual(7);
    expect(pulls).toBeLessThanOrEqual(8);
    stopFollowing();
    client.sync.stop();
    client.live.stop();
  });

  it("applies a page the server sends unasked when it continues the cursor, without a pull", async () => {
    vi.useFakeTimers();
    const { client, server, store } = await setupLive();
    client.sync.start({ intervalMs: 300_000 });
    await vi.advanceTimersByTimeAsync(SOON_MS);
    const before = server.requests.length;
    server.append([remote]);
    await vi.advanceTimersByTimeAsync(SOON_MS * 2);
    expect(client.state.store.getState().events).toEqual([remote]);
    expect((await store.readMeta()).cursor).toBe(1);
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
    expect((await store.readMeta()).cursor).toBe(3);
    const local = await storedEvents(store);
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
  await expect(storedEvents(context.store)).resolves.toEqual(fresh.events);
  await expect(context.store.listPending()).resolves.toEqual([]);
  expect((await context.store.readMeta()).storeId).toBe(fresh.storeId);
  expect((await context.store.readMeta()).cursor).toBe(fresh.events.length);
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

describe("createSyncClient's offline flag (QA round 17 review m3, I2)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls a run offline only when the server could not be reached", async () => {
    const drift = await setup({ "GET /api/sync/pull": () => ({ events: "not a page" }) });
    await drift.sync.syncNow();
    expect(drift.sync.status.getState()).toMatchObject({ online: true, syncing: false });
    expect(drift.sync.status.getState().lastError).not.toBeNull();

    const store = createMemoryEventStore();
    const full: EventStore = {
      ...store,
      applyLegacyPage: async () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
      append: async () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
    };
    const quota = await started(full, {
      "GET /api/sync/pull": () => ({
        events: [settingsEvent(newId(), at(9), { language: "ru" })],
        more: false,
        seq: 1,
        storeId: STORE_ID,
      }),
    });
    await quota.sync.syncNow();
    expect(quota.sync.status.getState()).toMatchObject({
      lastError: "The quota has been exceeded.",
      online: true,
    });

    const unreachable = await setup({
      "GET /api/sync/pull": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await unreachable.sync.syncNow();
    expect(unreachable.sync.status.getState()).toMatchObject({
      lastError: "Failed to fetch",
      online: false,
    });
  });

  it("calls a connection cut while a pull's body is read offline (round-3 review m-b)", async () => {
    const store = createMemoryEventStore();
    const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
    await state.ready;
    const api = createApiClient({
      baseUrl: "https://api.test",
      fetch: async () =>
        ({
          json: async () => {
            throw new TypeError("network error");
          },
          ok: true,
          status: 200,
        }) as unknown as Response,
      token: () => "t",
    });
    const sync = createSyncClient({ now: () => NOW, state, store, transport: httpTransport(api) });
    await expect(sync.syncNow()).resolves.toMatchObject({ ok: false });
    expect(sync.status.getState()).toMatchObject({
      lastError: "network error",
      online: false,
      syncing: false,
    });
  });

  it("gives up on a pull whose body stalls midway, at the sync timeout", async () => {
    vi.useFakeTimers();
    const store = createMemoryEventStore();
    const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
    await state.ready;
    const api = createApiClient({
      baseUrl: "https://api.test",
      // The headers came; the body never ends until the caller aborts.
      fetch: async (_input, init) =>
        ({
          json: async () =>
            await new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => {
                reject(new DOMException("The operation was aborted.", "AbortError"));
              });
            }),
          ok: true,
          status: 200,
        }) as unknown as Response,
      token: () => "t",
    });
    const sync = createSyncClient({ now: () => NOW, state, store, transport: httpTransport(api) });
    const run = sync.syncNow();
    await vi.advanceTimersByTimeAsync(HTTP_SYNC_TIMEOUT_MS);
    await expect(run).resolves.toMatchObject({ ok: false });
    expect(sync.status.getState()).toMatchObject({
      lastError: "sync request timed out",
      online: false,
      syncing: false,
    });
  });

  it("gives up on an HTTP call that never answers, so a run cannot hold `syncing` for good", async () => {
    vi.useFakeTimers();
    const store = createMemoryEventStore();
    const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
    await state.ready;
    const signals: AbortSignal[] = [];
    const api = createApiClient({
      baseUrl: "https://api.test",
      // A connection that stalls: no answer until the caller aborts.
      fetch: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          const { signal } = init;
          if (signal === null || signal === undefined) {
            return;
          }

          signals.push(signal);
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
      token: () => "t",
    });
    const sync = createSyncClient({ now: () => NOW, state, store, transport: httpTransport(api) });
    const run = sync.syncNow();
    await vi.advanceTimersByTimeAsync(HTTP_SYNC_TIMEOUT_MS - 1);
    expect(sync.status.getState().syncing).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await expect(run).resolves.toMatchObject({ ok: false });
    expect(signals).toHaveLength(1);
    expect(sync.status.getState()).toMatchObject({ online: false, syncing: false });
  });
});

describe("createSyncClient hold (round 6: ending this device's own session)", () => {
  it("waits for the run in flight, then sends nothing until it is released", async () => {
    const gate: { open?: () => void } = {};
    const held = new Promise<void>((resolve) => {
      gate.open = resolve;
    });
    const { calls, sync } = await setup(
      {
        "GET /api/sync/pull": async () => {
          await held;
          return EMPTY_PAGE;
        },
        "POST /api/sync/push": acceptAll,
      },
      localEvents(1),
    );
    const inFlight = sync.syncNow();
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    const holding = sync.hold();
    const hold = { isInPlace: false };
    void (async () => {
      await holding;
      hold.isInPlace = true;
    })();
    await Promise.resolve();
    // The run in flight goes on (its pull, then its push) before the hold is in place.
    expect(hold.isInPlace).toBe(false);
    gate.open?.();
    await inFlight;
    const release = await holding;
    const sent = calls.length;
    sync.start({ intervalMs: 1000 });
    sync.soon();
    await expect(sync.syncNow()).resolves.toEqual({ error: "stopped", ok: false });
    expect(calls).toHaveLength(sent);
    expect(sync.status.getState().lastError).toBeNull();
    sync.stop();
    release();
    await expect(sync.syncNow()).resolves.toMatchObject({ ok: true });
  });
  it("keeps its loop waiting while held, without ticking, and runs it at once on release (round 7 review 8)", async () => {
    vi.useFakeTimers();
    try {
      const { calls, sync } = await setup({ "GET /api/sync/pull": noPull });
      const pulls = () => calls.filter((call) => call.path === "/api/sync/pull").length;
      sync.start({ intervalMs: 30_000 });
      await vi.advanceTimersByTimeAsync(100);
      const release = await sync.hold();
      const before = pulls();
      const timeouts = vi.spyOn(globalThis, "setTimeout");
      // Held past the loop's tick: it waits, no timer re-armed every half second, nothing sent.
      await vi.advanceTimersByTimeAsync(40_000);
      expect(pulls()).toBe(before);
      expect(timeouts).not.toHaveBeenCalled();
      timeouts.mockRestore();
      release();
      await vi.advanceTimersByTimeAsync(100);
      expect(pulls()).toBe(before + 1);
      sync.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets go of a hold nobody released after a while: sync cannot stay held for good (round 7 review 2)", async () => {
    vi.useFakeTimers();
    try {
      const { calls, sync } = await setup({ "GET /api/sync/pull": noPull });
      const pulls = () => calls.filter((call) => call.path === "/api/sync/pull").length;
      sync.start({ intervalMs: 30_000 });
      await vi.advanceTimersByTimeAsync(100);
      await sync.hold();
      const before = pulls();
      await vi.advanceTimersByTimeAsync(HOLD_MAX_MS + 100);
      expect(pulls()).toBe(before + 1);
      await expect(sync.syncNow()).resolves.toMatchObject({ ok: true });
      sync.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not wait for good for a run in flight that never ends", async () => {
    vi.useFakeTimers();
    try {
      const transport = {
        pull: async () => await new Promise<never>(() => undefined),
        push: async () => await new Promise<never>(() => undefined),
      };
      const store = createMemoryEventStore();
      const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
      await state.ready;
      const sync = createSyncClient({ now: () => NOW, state, store, transport });
      void sync.syncNow();
      const holding = sync.hold();
      const hold = { isInPlace: false };
      void (async () => {
        await holding;
        hold.isInPlace = true;
      })();
      await vi.advanceTimersByTimeAsync(HOLD_WAIT_MS);
      expect(hold.isInPlace).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
