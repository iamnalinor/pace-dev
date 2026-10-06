import { describe, expect, it } from "vitest";

import { at, settingsEvent } from "../fake-fetch.fake.ts";
import { createMemoryEventStore } from "./memory-event-store.ts";

const a = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" });
const b = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(10), { language: "en" });

describe("createMemoryEventStore", () => {
  it("appends idempotently by id and lists everything", async () => {
    const store = createMemoryEventStore();
    await store.append([a, b]);
    await store.append([{ ...a, payload: { language: "en" } }]);
    await expect(store.listAll()).resolves.toEqual([a, b]);
  });

  it("keeps appended events pending until they are marked synced", async () => {
    const store = createMemoryEventStore();
    await store.append([a, b]);
    await expect(store.listPending()).resolves.toEqual([a, b]);
    await store.markSynced([a.id, "unknown"]);
    await expect(store.listPending()).resolves.toEqual([b]);
  });

  it("starts the cursor at 0 and remembers it", async () => {
    const store = createMemoryEventStore();
    await expect(store.getCursor()).resolves.toBe(0);
    await store.setCursor(42);
    await expect(store.getCursor()).resolves.toBe(42);
  });

  it("clears events, the outbox and the cursor", async () => {
    const store = createMemoryEventStore();
    await store.append([a]);
    await store.setCursor(7);
    await store.clear();
    await expect(store.listAll()).resolves.toEqual([]);
    await expect(store.listPending()).resolves.toEqual([]);
    await expect(store.getCursor()).resolves.toBe(0);
  });
});
