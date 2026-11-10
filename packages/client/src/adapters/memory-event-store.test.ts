import { describe, expect, it } from "vitest";

import { at, settingsEvent } from "../fake-fetch.fake.ts";
import { seedCopy, storedEvents } from "../local-store.fake.ts";
import { createMemoryEventStore } from "./memory-event-store.ts";

const a = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });
const b = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(10), { language: "en" });

describe("createMemoryEventStore", () => {
  it("appends idempotently by id and lists everything", async () => {
    const store = createMemoryEventStore();
    await store.append([a, b], await store.readMeta());
    await store.append([settingsEvent(a.id, at(9), { language: "en" })], await store.readMeta());
    await expect(storedEvents(store)).resolves.toEqual([a, b]);
  });

  it("keeps appended events pending until they are marked synced", async () => {
    const store = createMemoryEventStore();
    await store.append([a, b], await store.readMeta());
    await expect(store.listPending()).resolves.toEqual([a, b]);
    await store.markSynced([a.id, "unknown"], await store.readMeta());
    await expect(store.listPending()).resolves.toEqual([b]);
  });

  it("starts the cursor at 0 and remembers it", async () => {
    const store = createMemoryEventStore();
    expect((await store.readMeta()).cursor).toBe(0);
    await seedCopy(store, { cursor: 42 });
    expect((await store.readMeta()).cursor).toBe(42);
  });

  it("knows no store id at first and remembers the one it is given", async () => {
    const store = createMemoryEventStore();
    expect((await store.readMeta()).storeId).toBeNull();
    await seedCopy(store, { storeId: "store-a" });
    expect((await store.readMeta()).storeId).toBe("store-a");
  });

  it("starts the sync version at 0 (a log from before versions) and remembers it", async () => {
    const store = createMemoryEventStore();
    expect((await store.readMeta()).syncVersion).toBe(0);
    await seedCopy(store, { syncVersion: 1 });
    expect((await store.readMeta()).syncVersion).toBe(1);
  });

  it("clears events, the outbox, the cursor, the store id and the sync version", async () => {
    const store = createMemoryEventStore();
    await store.append([a], await store.readMeta());
    await seedCopy(store, { storeId: "store-a", cursor: 7, syncVersion: 1 });
    await store.clear();
    expect((await store.readMeta()).syncVersion).toBe(0);
    await expect(storedEvents(store)).resolves.toEqual([]);
    await expect(store.listPending()).resolves.toEqual([]);
    expect((await store.readMeta()).cursor).toBe(0);
    expect((await store.readMeta()).storeId).toBeNull();
  });
});
