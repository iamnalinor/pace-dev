import { describe, expect, it } from "vitest";

import type { Event } from "@pace/core";

import { yearOfUse } from "@pace/core/testing";

import type { CopyGuard } from "./checkpoint-store-types.ts";
import type { EventStore } from "./event-store.ts";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createApiClient } from "./api-client.ts";
import { createFakeFetch, type FakeRoute } from "./fake-fetch.fake.ts";
import { storedEvents } from "./local-store.fake.ts";
import { createAppState } from "./state.ts";
import { createSyncClient } from "./sync-client.ts";
import { httpTransport } from "./sync-transport.ts";

const STORE_ID = "store-a";
const SIZE = 2000;
const PAGE = 10;

/** The reads a store was asked for: `full` reads every event from the disk, `narrow` does not. */
type Reads = { full: number; narrow: number };

/** A store that counts its reads the way a disk adapter pays for them (bug-lessons class 259). */
const counted = (inner: EventStore): { readonly reads: Reads; readonly store: EventStore } => {
  const reads: Reads = { full: 0, narrow: 0 };
  const full =
    <T>(read: () => Promise<T>) =>
    async (): Promise<T> => {
      reads.full += 1;
      return await read();
    };
  const narrow =
    <T>(read: () => Promise<T>) =>
    async (): Promise<T> => {
      reads.narrow += 1;
      return await read();
    };
  return {
    reads,
    store: {
      ...inner,
      listPending: narrow(inner.listPending),
      readMeta: narrow(inner.readMeta),
      readSnapshot: full(inner.readSnapshot),
    },
  };
};

const seed = yearOfUse(SIZE, 7);
const lastMs = Date.parse(seed.at(-1)?.occurredAt ?? "");
const later = (minutes: number): string => new Date(lastMs + minutes * 60_000).toISOString();
const activity = (activityId: string) =>
  ({ payload: { activityId, category: "work", label: "Work" }, type: "activity.started" }) as const;
/** A start after everything in the seed: in order for the fold. */
const started = (index: number, deviceId: string) =>
  ({
    ...activity(`cost-${String(index)}`),
    deviceId,
    id: `01ARZ3NDEKTSV4RRFFQ69G5${String(index).padStart(3, "0")}`,
    occurredAt: later(index + 1),
    precision: "exact",
    recordedAt: later(index + 1),
    source: "app",
  }) satisfies Event;
const identityOf = (copy: CopyGuard | undefined) => ({
  copyToken: copy?.copyToken,
  owner: copy?.owner,
  storeId: copy?.storeId,
});

/** A year of synced use on the disk, loaded, with the server's pages served from `pages`. */
const setup = async (pages: readonly (readonly Event[])[] = []) => {
  const inner = createMemoryEventStore();
  await inner.append(seed, await inner.readMeta());
  await inner.applyLegacyPage({
    guard: await inner.readMeta(),
    storeId: STORE_ID,
    since: 0,
    seq: SIZE,
    events: [],
    syncVersion: 1,
  });
  await inner.markSynced(
    seed.map((event) => event.id),
    await inner.readMeta(),
  );
  const { reads, store } = counted(inner);
  const hints: unknown[] = [];
  const state = createAppState({
    deviceId: "phone",
    now: () => later(24 * 60),
    onStored: (change) => {
      hints.push(change);
    },
    source: "app",
    store,
  });
  await state.ready;
  const pull: FakeRoute = ({ url }) => {
    const since = Number(url.searchParams.get("since"));
    const index = (since - SIZE) / PAGE;
    const events = pages[index] ?? [];
    return {
      events,
      more: index + 1 < pages.length,
      seq: since + events.length,
      since,
      storeId: STORE_ID,
    };
  };
  const push: FakeRoute = ({ body }) => {
    const { events } = body as { readonly events: readonly Event[] };
    return { accepted: events.map((event) => event.id), rejected: [], seq: SIZE };
  };
  const fake = createFakeFetch({ "GET /api/sync/pull": pull, "POST /api/sync/push": push });
  const api = createApiClient({ baseUrl: "https://api.test", fetch: fake.fetch, token: () => "t" });
  const sync = createSyncClient({
    now: () => later(24 * 60),
    state,
    store,
    transport: httpTransport(api),
  });
  expect(reads.full).toBe(1);
  reads.full = 0;
  reads.narrow = 0;
  return { hints, reads, state, store, sync };
};

describe("what the default (legacy) path reads from the disk (bug-lessons class 259)", () => {
  it("writes a local action, and tells the other tabs, without reading the log", async () => {
    const { hints, reads, state } = await setup();
    const result = await state.dispatch({ occurredAt: later(1), ...activity("cost") });
    expect(result.ok).toBe(true);
    expect(hints).toHaveLength(1);
    expect(reads).toEqual({ full: 0, narrow: 0 });
  });

  it("pulls in-order pages without reading the log or folding it again", async () => {
    const pages = [0, 1, 2].map((page) =>
      Array.from({ length: PAGE }, (_, index) => started(page * PAGE + index, "other")),
    );
    const { hints, reads, state, store, sync } = await setup(pages);
    const before = state.store.getState();
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 30, pushed: 0 } });
    const after = state.store.getState();
    // Meta only: the version check, one per page asked for, the outbox's copy and its pending list.
    expect(reads).toEqual({ full: 0, narrow: 6 });
    // A rebuild makes every slice anew; the fold in order leaves the ones no event touched.
    expect(after.tasks).toBe(before.tasks);
    expect(after.events).toHaveLength(before.events.length + 30);
    expect(after.version).toBe(before.version + 3);
    await expect(store.readMeta()).resolves.toMatchObject({ cursor: SIZE + 30 });
    expect(state.localCopy()).toMatchObject({ cursor: SIZE + 30, storeId: STORE_ID });
    // The other tabs get each page's events to take in the same way, not a word to read the disk.
    expect(hints).toEqual(
      pages.map((events) => ({ events, kind: "events", ...identityOf(state.localCopy()) })),
    );
  });

  it("shows the server's copy of an event the outbox held, as the store keeps it", async () => {
    const local = started(0, "phone");
    const canonical = { ...local, payload: { ...local.payload, label: "Deep work" } };
    const { reads, state, store, sync } = await setup([[canonical]]);
    await state.dispatch({ id: local.id, occurredAt: local.occurredAt, ...activity("cost") });
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 1, pushed: 0 } });
    expect(state.store.getState().events.at(-1)).toEqual(canonical);
    expect(reads.full).toBe(0);
    await expect(storedEvents(store)).resolves.toContainEqual(canonical);
    await expect(store.listPending()).resolves.toEqual([]);
  });

  it("tells the other tabs to read the disk when a page gives the copy its first store id", async () => {
    const hints: unknown[] = [];
    const store = createMemoryEventStore();
    const state = createAppState({
      deviceId: "phone",
      now: () => later(0),
      onStored: (change) => {
        hints.push(change);
      },
      source: "app",
      store,
    });
    await state.ready;
    const guard = await store.readMeta();
    const page = { guard, storeId: STORE_ID, since: 0, seq: 1, events: [started(0, "other")] };
    await state.commitLegacyPage(async () => await store.applyLegacyPage(page));
    expect(hints).toEqual([{ kind: "reload", ...identityOf(state.localCopy()) }]);
    expect(state.localCopy()).toMatchObject({ storeId: STORE_ID });
    expect(state.store.getState().events).toHaveLength(1);
  });

  it("pushes the outbox without reading the log", async () => {
    const { reads, state, sync } = await setup();
    await state.dispatch({ occurredAt: later(1), ...activity("cost") });
    await expect(sync.syncNow()).resolves.toEqual({ ok: true, value: { pulled: 0, pushed: 1 } });
    // Meta only: the version check, a pull before and after, the outbox's copy (twice: when listed
    // and before the batch goes) and its pending list.
    expect(reads).toEqual({ full: 0, narrow: 6 });
  });

  it("takes in another tab's events of the same copy without reading the log", async () => {
    const { reads, state } = await setup();
    const before = state.store.getState();
    await state.adoptPeerChange({
      events: [started(0, "phone")],
      kind: "events",
      ...state.localCopy(),
    });
    const after = state.store.getState();
    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.tasks).toBe(before.tasks);
    expect(reads).toEqual({ full: 0, narrow: 0 });
  });
});
