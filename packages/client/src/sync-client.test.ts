import { afterEach, describe, expect, it, vi } from "vitest";

import { type Event, newId } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createApiClient } from "./api-client.ts";
import { at, createFakeFetch, type FakeRoute, problem, settingsEvent } from "./fake-fetch.fake.ts";
import { type AppStateHandle, createAppState } from "./state.ts";
import { createSyncClient, type SyncClient } from "./sync-client.ts";

const NOW = "2026-10-06T12:00:00.000Z";
const STORE_ID = "store-a";
const EMPTY_PAGE = { events: [], more: false, seq: 0, storeId: STORE_ID };
const noPull: FakeRoute = () => EMPTY_PAGE;
const acceptAll: FakeRoute = ({ body }) => {
  const { events } = body as { events: readonly Event[] };
  return { accepted: events.map((event) => event.id), rejected: [], seq: events.length };
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
  const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
  await state.ready;
  const fake = createFakeFetch(routes);
  const api = createApiClient({ baseUrl: "https://api.test", fetch: fake.fetch, token: () => "t" });
  const sync = createSyncClient({ api, now: () => NOW, state, store });
  return { calls: fake.calls, state, store, sync };
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

  it("treats a push the server refuses as store/changed like a reset: drops, pulls, never re-pushes", async () => {
    let storeId = STORE_ID;
    const { calls, state, store, sync } = await setup(
      {
        "GET /api/sync/pull": ({ url }) =>
          storeId === "store-b" && url.searchParams.get("since") === "0"
            ? { events: [remote], more: false, seq: 1, storeId }
            : { ...EMPTY_PAGE, storeId },
        "POST /api/sync/push": () => {
          // Wiped between this run's pull and its push.
          storeId = "store-b";
          return problem(409, "store/changed");
        },
      },
      localEvents(2),
    );
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 1, pushed: 0 } });
    expect(calls.filter((call) => call.path === "/api/sync/push")).toHaveLength(1);
    await expect(store.listAll()).resolves.toEqual([remote]);
    await expect(store.listPending()).resolves.toEqual([]);
    await expect(store.getStoreId()).resolves.toBe("store-b");
    expect(state.store.getState().events).toEqual([remote]);
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
