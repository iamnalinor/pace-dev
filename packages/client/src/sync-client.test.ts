import { afterEach, describe, expect, it, vi } from "vitest";

import { type Event, newId } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createApiClient } from "./api-client.ts";
import { at, createFakeFetch, type FakeRoute, settingsEvent } from "./fake-fetch.fake.ts";
import { type AppStateHandle, createAppState } from "./state.ts";
import { createSyncClient, type SyncClient } from "./sync-client.ts";

const NOW = "2026-10-06T12:00:00.000Z";
const EMPTY_PAGE = { events: [], more: false, seq: 0 };
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
      },
      "1": {
        events: [settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(10), { timezone: "UTC" })],
        more: false,
        seq: 2,
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
      }),
    });
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 0, pushed: 0 } });
    expect(state.store.getState().events).toEqual([]);
    await expect(store.getCursor()).resolves.toBe(5);
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
