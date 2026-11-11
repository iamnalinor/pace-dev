import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { ApiError, createApiClient } from "./api-client.ts";
import { at, createFakeFetch, type FakeRoute, problem, settingsEvent } from "./fake-fetch.fake.ts";
import { seedCopy, seedPending } from "./local-store.fake.ts";
import { createAppState } from "./state.ts";
import { createSyncClient } from "./sync-client.ts";
import { httpTransport, isStoreBusy } from "./sync-transport.ts";

/*
A store the server has fenced (an account cleanup is running in it) answers `503 cleanup/busy`
to its sync routes. That is "not now", not a fault: the run fails so the loop backs off and tries
again, and the status keeps what the last run said. No error is put up, and the device does not
read as offline.
*/

const NOW = at(12);
const pending = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(10), { language: "ru" });

const setup = async (routes: Readonly<Record<string, FakeRoute>>) => {
  const store = createMemoryEventStore();
  const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
  await state.ready;
  const fake = createFakeFetch(routes);
  const api = createApiClient({ baseUrl: "https://api.test", fetch: fake.fetch, token: () => "t" });
  const sync = createSyncClient({ now: () => NOW, state, store, transport: httpTransport(api) });
  return { calls: fake.calls, state, store, sync };
};

const page = { events: [], more: false, seq: 0, storeId: "store-test" };
const busy = (): Response => problem(503, "cleanup/busy");

afterEach(() => {
  vi.useRealTimers();
});

describe("a store busy with an account cleanup", () => {
  it("is told from every other refusal by its status and code together", () => {
    expect(isStoreBusy(new ApiError(503, "cleanup/busy", "busy"))).toBe(true);
    expect(isStoreBusy(new ApiError(503, "unavailable", "down"))).toBe(false);
    expect(isStoreBusy(new ApiError(409, "cleanup/busy", "busy"))).toBe(false);
    expect(isStoreBusy(new Error("cleanup/busy"))).toBe(false);
  });

  it("fails the run without an error on the status, online and with the outbox kept", async () => {
    const { calls, store, sync } = await setup({ "GET /api/sync/pull": busy });
    await seedPending(store, [pending]);
    expect(await sync.syncNow()).toEqual({ ok: false, error: "cleanup/busy" });
    expect(sync.status.getState()).toEqual({
      lastError: null,
      lastSyncAt: null,
      online: true,
      syncing: false,
    });
    expect(calls.map((call) => call.path)).toEqual(["/api/sync/pull"]);
    expect(await store.listPending()).toEqual([pending]);
  });

  it("keeps what the last run said: its time, and an error it had", async () => {
    const server = { isBusy: false };
    const { store, sync } = await setup({
      "GET /api/sync/pull": () => (server.isBusy ? busy() : page),
      "POST /api/sync/push": ({ body }) => ({
        accepted: [],
        rejected: (body as { readonly events: readonly { readonly id: string }[] }).events.map(
          (event) => ({ id: event.id, reason: "invalid" }),
        ),
        seq: 0,
      }),
    });
    await seedPending(store, [pending]);
    await sync.syncNow();
    const said = sync.status.getState();
    expect(said).toMatchObject({
      lastError: `push rejected: ${pending.id} (invalid)`,
      lastSyncAt: NOW,
    });
    server.isBusy = true;
    expect(await sync.syncNow()).toMatchObject({ ok: false });
    expect(sync.status.getState()).toEqual(said);
  });

  it("is asked again with backoff, and syncs once the cleanup is over", async () => {
    vi.useFakeTimers();
    let isBusy = true;
    const { calls, store, sync } = await setup({
      "GET /api/sync/pull": () => (isBusy ? busy() : page),
      "POST /api/sync/push": () =>
        isBusy ? busy() : { accepted: [pending.id], rejected: [], seq: 1 },
    });
    await seedCopy(store, { storeId: "store-test" });
    await seedPending(store, [pending]);
    sync.start({ intervalMs: 10_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(sync.status.getState()).toMatchObject({ lastError: null, online: true });
    isBusy = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(sync.status.getState()).toMatchObject({
      lastError: null,
      lastSyncAt: NOW,
      online: true,
    });
    expect(await store.listPending()).toEqual([]);
    sync.stop();
  });
});
