import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import type { EventStore } from "@pace/client";
import type { Event } from "@pace/core";

import { createEventStore } from "./event-store.web.ts";

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
const openTab = async (): Promise<EventStore> => {
  const local = createEventStore();
  await expect(local.isShared()).resolves.toBe(true);
  return local.store;
};

/** A browser profile per test: the stores of two tests never share a copy. */
beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
});

describe("the IndexedDB event store's clear", () => {
  it("clears events, the outbox, the cursor, the store id and the sync version", async () => {
    const store = await openTab();
    await store.append([a]);
    await store.setCursor(7);
    await store.setStoreId("store-a");
    await store.setSyncVersion(1);
    await store.clear();
    await expect(store.listAll()).resolves.toEqual([]);
    await expect(store.listPending()).resolves.toEqual([]);
    await expect(store.getCursor()).resolves.toBe(0);
    await expect(store.getStoreId()).resolves.toBeNull();
    await expect(store.getSyncVersion()).resolves.toBe(0);
  });

  it("keeps a copy another session claimed when asked to clear only its own (re-review N3)", async () => {
    const store = await openTab();
    await store.setOwner("ended:new");
    await store.append([a]);
    await store.setStoreId("store-a");
    await store.clear("ended:old");
    await expect(store.listAll()).resolves.toHaveLength(1);
    await expect(store.listPending()).resolves.toHaveLength(1);
    await expect(store.getStoreId()).resolves.toBe("store-a");
    await store.clear("ended:new");
    await expect(store.listAll()).resolves.toEqual([]);
    // Unclaimed (cleared, or from before owners): any session's clear drops it.
    await store.append([a]);
    await store.clear("ended:old");
    await expect(store.listAll()).resolves.toEqual([]);
  });

  it("is shared by two tabs: a claim one tab made is seen by the other's clear", async () => {
    const staleTab = await openTab();
    const newTab = await openTab();
    await staleTab.append([a]);
    await newTab.setOwner("ended:new");
    await staleTab.clear("ended:old");
    await expect(newTab.listAll()).resolves.toHaveLength(1);
    // The claim is sent before the stale clear: IndexedDB runs the two in that order.
    await Promise.all([newTab.setOwner("ended:newer"), staleTab.clear("ended:new")]);
    await expect(newTab.listAll()).resolves.toHaveLength(1);
    // Unconditional (this tab's own sign-out, review M1): always empties it.
    await staleTab.clear();
    await expect(newTab.listAll()).resolves.toEqual([]);
  });
});
