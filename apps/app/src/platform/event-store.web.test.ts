import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";

import type { PaceDb } from "#app/platform/idb-event-database.ts";
import type { EventStore, Sha256Text } from "@pace/client";
import type { Event } from "@pace/core";

import { checkpointIntegrityContract } from "#app/platform/checkpoint-integrity-contract.fake.ts";
import { seedCopy, storedEvents } from "@pace/client/testing";

import {
  baseEvent,
  checkpointStoreContract,
  checkpointTestHash,
  pendingEvent,
} from "./checkpoint-store-contract.fake.ts";
import { createEventStore } from "./event-store.web.ts";
import { storeCostContract } from "./store-cost-contract.fake.ts";

/**
The web copy, the one a browser's tabs share: the store N3's compare-and-clear exists for
(fix round 2 review M2). Run on `fake-indexeddb`, an in-memory IndexedDB with real transactions.
*/

const at = (hour: number): string => `2026-10-06T${String(hour).padStart(2, "0")}:00:00.000Z`;

const settingsEvent = (id: string, occurredAt: string): Event => ({
  deviceId: "remote",
  id,
  occurredAt,
  payload: { language: "ru" },
  precision: "exact",
  recordedAt: occurredAt,
  source: "web",
  type: "settings.updated",
});

const a = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9));

/** A tab's copy, checked to be in IndexedDB: the memory fallback would make every case vacuous. */
const openTab = async (hash: Sha256Text = checkpointTestHash): Promise<EventStore> => {
  const local = createEventStore(hash);
  await expect(local.isShared()).resolves.toBe(true);
  return local.store;
};

describe("IndexedDB checkpoint transactions", () => {
  checkpointStoreContract(openTab);
});

describe("what the IndexedDB store reads for the default path", () => {
  const logReads = { count: 0 };
  beforeAll(() => {
    for (const source of [IDBObjectStore.prototype, IDBIndex.prototype]) {
      const getAll = Reflect.get(source, "getAll") as IDBObjectStore["getAll"];
      jest.spyOn(source, "getAll").mockImplementation(function (
        this: IDBIndex | IDBObjectStore,
        ...query
      ) {
        const name = "objectStore" in this ? this.objectStore.name : this.name;
        logReads.count += name === "events" ? 1 : 0;
        return getAll.apply(this, query);
      });
    }
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });
  storeCostContract(openTab, () => logReads.count);
});

describe("IndexedDB persisted checkpoint integrity", () => {
  checkpointIntegrityContract({
    open: openTab,
    readMeta: async () => {
      const db = await openDB<PaceDb>("pace", 2);
      return Object.fromEntries(
        (await db.getAll("meta")).map((row) => [row.key, String(row.value)]),
      );
    },
    writeMeta: async (meta) => {
      const db = await openDB<PaceDb>("pace", 2);
      const tx = db.transaction("meta", "readwrite");
      for (const [key, value] of Object.entries(meta)) {
        await tx.store.put({ key, value });
      }
      await tx.done;
    },
  });

  it("upgrades the existing version-one database without recreating or dropping its log", async () => {
    const legacy = await openDB<PaceDb>("pace", 1, {
      upgrade(db) {
        const events = db.createObjectStore("events", { keyPath: "id" });
        events.createIndex("byOccurredAt", "occurredAt");
        db.createObjectStore("pending", { keyPath: "id" });
        db.createObjectStore("meta", { keyPath: "key" });
      },
    });
    await legacy.put("events", pendingEvent);
    await legacy.put("pending", { id: pendingEvent.id });
    await legacy.put("meta", { key: "owner", value: "legacy-owner" });
    await legacy.put("meta", { key: "cursor", value: 7 });
    legacy.close();
    const store = await openTab();
    expect(await store.readSnapshot()).toMatchObject({
      owner: "legacy-owner",
      cursor: 7,
      coverage: "full",
      checkpoint: null,
      records: [{ seq: null, event: pendingEvent }],
      pendingIds: [pendingEvent.id],
    });
  });

  it("rolls back event, outbox and cursor mutations when a write transaction fails", async () => {
    const store = await openTab();
    await store.append([pendingEvent], await store.readMeta());
    const before = await store.readSnapshot();
    const failure = jest.spyOn(IDBObjectStore.prototype, "put");
    const original = failure.getMockImplementation();
    if (original === undefined) {
      throw new Error("missing IndexedDB implementation");
    }
    failure.mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === "meta") {
        throw new Error("injected metadata write failure");
      }
      return original.call(this, value, key);
    });
    await expect(
      store.applyRemotePage({
        guard: before,
        storeId: "store-a",
        since: 0,
        seq: 1,
        records: [{ seq: 1, event: baseEvent }],
      }),
    ).rejects.toThrow("injected metadata write failure");
    failure.mockRestore();
    expect(await (await openTab()).readSnapshot()).toEqual(before);
  });
});

/** A browser profile per test: the stores of two tests never share a copy. */
beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
});

describe("the IndexedDB event store's clear", () => {
  it("clears events, the outbox, the cursor, the store id and the sync version", async () => {
    const store = await openTab();
    await store.append([a], await store.readMeta());
    await seedCopy(store, { storeId: "store-a", cursor: 7, syncVersion: 1 });
    await store.clear();
    await expect(storedEvents(store)).resolves.toEqual([]);
    await expect(store.listPending()).resolves.toEqual([]);
    expect((await store.readMeta()).cursor).toBe(0);
    expect((await store.readMeta()).storeId).toBeNull();
    expect((await store.readMeta()).syncVersion).toBe(0);
  });

  it("keeps a copy another session claimed when asked to clear only its own (re-review N3)", async () => {
    const store = await openTab();
    await store.setOwner("ended:new");
    await store.append([a], await store.readMeta());
    await seedCopy(store, { storeId: "store-a" });
    await store.clear("ended:old");
    await expect(storedEvents(store)).resolves.toHaveLength(1);
    await expect(store.listPending()).resolves.toHaveLength(1);
    expect((await store.readMeta()).storeId).toBe("store-a");
    await store.clear("ended:new");
    await expect(storedEvents(store)).resolves.toEqual([]);
    // Unclaimed (cleared, or from before owners): any session's clear drops it.
    await store.append([a], await store.readMeta());
    await store.clear("ended:old");
    await expect(storedEvents(store)).resolves.toEqual([]);
  });

  it("is shared by two tabs: a claim one tab made is seen by the other's clear", async () => {
    const staleTab = await openTab();
    const newTab = await openTab();
    await staleTab.append([a], await staleTab.readMeta());
    await newTab.setOwner("ended:new");
    await staleTab.clear("ended:old");
    await expect(storedEvents(newTab)).resolves.toHaveLength(1);
    // The claim is sent before the stale clear: IndexedDB runs the two in that order.
    await Promise.all([newTab.setOwner("ended:newer"), staleTab.clear("ended:new")]);
    await expect(storedEvents(newTab)).resolves.toHaveLength(1);
    // Unconditional (this tab's own sign-out, review M1): always empties it.
    await staleTab.clear();
    await expect(storedEvents(newTab)).resolves.toEqual([]);
  });
});
