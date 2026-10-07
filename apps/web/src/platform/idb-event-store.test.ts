import { describe, expect, it } from "vitest";

import { createIdbEventStore } from "./idb-event-store.ts";

const event = {
  deviceId: "d",
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  occurredAt: "2026-10-06T10:00:00.000Z",
  payload: { language: "ru" },
  precision: "exact",
  recordedAt: "2026-10-06T10:00:00.000Z",
  source: "web",
  type: "settings.updated",
} as const;

describe("createIdbEventStore", () => {
  it("falls back to memory when IndexedDB is unavailable (jsdom has none)", async () => {
    expect(globalThis.indexedDB).toBeUndefined();
    const store = createIdbEventStore();
    await store.append([event]);
    expect(await store.listAll()).toEqual([event]);
    expect(await store.listPending()).toEqual([event]);
    await store.markSynced([event.id]);
    expect(await store.listPending()).toEqual([]);
    await store.setCursor(7);
    expect(await store.getCursor()).toBe(7);
    await store.clear();
    expect(await store.listAll()).toEqual([]);
  });
});
