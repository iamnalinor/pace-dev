import "fake-indexeddb/auto";

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

/** One database per test: the stores of two tests never share a copy. */
afterEach(async () => {
  const request = indexedDB.deleteDatabase("pace");
  await new Promise((resolve) => {
    request.addEventListener("success", resolve);
    request.addEventListener("blocked", resolve);
  });
});

describe("the IndexedDB event store's clear", () => {
  it("clears events, the outbox, the cursor, the store id and the sync version", async () => {
    const store = createEventStore();
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
    const store = createEventStore();
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
    const staleTab = createEventStore();
    const newTab = createEventStore();
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
