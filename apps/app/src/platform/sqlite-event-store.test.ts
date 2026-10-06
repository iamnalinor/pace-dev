import type { Event } from "@pace/core";

import { createFakeSqlite } from "./sqlite.fake.ts";

import { createSqliteEventStore, SCHEMA_VERSION } from "./sqlite-event-store.ts";

const fake = createFakeSqlite();

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => fake.database,
}));

const at = (hour: number): string => `2026-10-06T${String(hour).padStart(2, "0")}:00:00.000Z`;

const settingsEvent = (id: string, occurredAt: string, language: "en" | "ru"): Event => ({
  deviceId: "remote",
  id,
  occurredAt,
  payload: { language },
  precision: "exact",
  recordedAt: occurredAt,
  source: "web",
  type: "settings.updated",
});

const a = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), "ru");
const b = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(10), "en");

beforeEach(() => {
  fake.reset();
});

describe("createSqliteEventStore", () => {
  it("migrates the schema once and records the version", async () => {
    const store = createSqliteEventStore();
    await store.listAll();
    expect(fake.userVersion()).toBe(SCHEMA_VERSION);
    expect(fake.tables()).toEqual(["events", "meta", "pending"]);
    expect(fake.executed.filter((sql) => sql.includes("journal_mode"))).toHaveLength(1);
  });

  it("appends idempotently by id and lists everything ordered by occurredAt", async () => {
    const store = createSqliteEventStore();
    await store.append([b, a]);
    await store.append([settingsEvent(a.id, at(9), "en")]);
    await expect(store.listAll()).resolves.toEqual([a, b]);
  });

  it("writes a batch inside one exclusive transaction with a prepared statement", async () => {
    const store = createSqliteEventStore();
    await store.append([a, b]);
    expect(fake.transactions).toBe(1);
    expect(fake.prepared.filter((sql) => sql.includes("INTO events"))).toHaveLength(1);
  });

  it("keeps appended events pending until they are marked synced", async () => {
    const store = createSqliteEventStore();
    await store.append([a, b]);
    await expect(store.listPending()).resolves.toEqual([a, b]);
    await store.markSynced([a.id, "unknown"]);
    await expect(store.listPending()).resolves.toEqual([b]);
  });

  it("starts the cursor at 0 and remembers it", async () => {
    const store = createSqliteEventStore();
    await expect(store.getCursor()).resolves.toBe(0);
    await store.setCursor(42);
    await expect(store.getCursor()).resolves.toBe(42);
  });

  it("clears events, the outbox and the cursor", async () => {
    const store = createSqliteEventStore();
    await store.append([a]);
    await store.setCursor(7);
    await store.clear();
    await expect(store.listAll()).resolves.toEqual([]);
    await expect(store.listPending()).resolves.toEqual([]);
    await expect(store.getCursor()).resolves.toBe(0);
  });

  it("opens the database once for every operation", async () => {
    const store = createSqliteEventStore();
    await Promise.all([store.getCursor(), store.listAll(), store.listPending()]);
    expect(fake.opens).toBe(1);
  });
});
