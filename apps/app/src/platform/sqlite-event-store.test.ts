import type { Event } from "@pace/core";

import { checkpointIntegrityContract } from "#app/platform/checkpoint-integrity-contract.fake.ts";

import {
  checkpointStoreContract,
  checkpointTestHash,
  pendingEvent,
} from "./checkpoint-store-contract.fake.ts";
import { createSqliteEventStore, SCHEMA_VERSION } from "./sqlite-event-store.ts";
import { createFakeSqlite } from "./sqlite.fake.ts";

const mockSqlite = createFakeSqlite();

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => mockSqlite.open(),
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
  mockSqlite.reset();
});

describe("SQLite checkpoint transactions", () => {
  checkpointStoreContract(async (hash = checkpointTestHash) => createSqliteEventStore(hash));
});

describe("SQLite persisted checkpoint integrity", () => {
  checkpointIntegrityContract({
    open: async (hash = checkpointTestHash) => createSqliteEventStore(hash),
    readMeta: async () =>
      Object.fromEntries(
        (
          await mockSqlite
            .open()
            .getAllAsync<{ key: string; value: string }>("SELECT key,value FROM meta")
        ).map((row) => [row.key, row.value]),
      ),
    writeMeta: async (meta) => {
      for (const [key, value] of Object.entries(meta)) {
        await mockSqlite
          .open()
          .runAsync(
            "INSERT INTO meta (key,value) VALUES ($key,$value) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            { $key: key, $value: value },
          );
      }
    },
  });

  it("upgrades a version-one copy without dropping its existing source or pending ownership", async () => {
    const raw = mockSqlite.open();
    await raw.execAsync(
      "CREATE TABLE events (id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, json TEXT NOT NULL); CREATE INDEX events_occurred_at ON events(occurred_at,id); CREATE TABLE pending (id TEXT PRIMARY KEY); CREATE TABLE meta (key TEXT PRIMARY KEY,value TEXT NOT NULL); PRAGMA user_version=1;",
    );
    await raw.runAsync("INSERT INTO events VALUES ($id,$at,$json)", {
      $id: pendingEvent.id,
      $at: pendingEvent.occurredAt,
      $json: JSON.stringify(pendingEvent),
    });
    await raw.runAsync("INSERT INTO pending VALUES ($id)", { $id: pendingEvent.id });
    await raw.execAsync(
      "INSERT INTO meta VALUES ('owner','legacy-owner'); INSERT INTO meta VALUES ('cursor','7');",
    );
    const store = createSqliteEventStore(checkpointTestHash);
    expect(await store.readSnapshot()).toMatchObject({
      owner: "legacy-owner",
      cursor: 7,
      coverage: "full",
      checkpoint: null,
      records: [{ seq: null, event: pendingEvent }],
      pendingIds: [pendingEvent.id],
    });
  });

  it.each([0, 1, 2])("rolls back an interrupted remote write after mutation %s", async (after) => {
    const store = createSqliteEventStore(checkpointTestHash);
    await store.setStoreId("store-a");
    await store.setCursor(0);
    await store.setSyncVersion(2);
    await store.append([pendingEvent]);
    await mockSqlite.open().runAsync("INSERT INTO meta (key,value) VALUES ('coverage','full')");
    const before = await store.readSnapshot();
    mockSqlite.failAfterWrites(after);
    await expect(
      store.applyRemotePage({
        guard: before,
        storeId: "store-a",
        since: 0,
        seq: 1,
        records: [{ seq: 1, event: { ...pendingEvent, recordedAt: "2026-10-06T10:00:01.000Z" } }],
      }),
    ).rejects.toThrow("injected SQL write failure");
    expect(await createSqliteEventStore(checkpointTestHash).readSnapshot()).toEqual(before);
  });

  it("serializes concurrent first opens without applying additive migrations twice", async () => {
    const one = createSqliteEventStore(checkpointTestHash);
    const two = createSqliteEventStore(checkpointTestHash);
    const snapshots = await Promise.all([one.readSnapshot(), two.readSnapshot()]);
    expect(snapshots[0].copyToken).toBe(snapshots[1].copyToken);
  });
});

describe("createSqliteEventStore", () => {
  it("migrates the schema once and records the version", async () => {
    const store = createSqliteEventStore();
    await store.listAll();
    expect(mockSqlite.userVersion()).toBe(SCHEMA_VERSION);
    expect(mockSqlite.tables()).toEqual(["events", "meta", "pending"]);
    expect(mockSqlite.executed.filter((sql) => sql.includes("journal_mode"))).toHaveLength(1);
  });

  it("appends idempotently by id and lists everything ordered by occurredAt", async () => {
    const store = createSqliteEventStore();
    await store.append([b, a]);
    await store.append([settingsEvent(a.id, at(9), "en")]);
    await expect(store.listAll()).resolves.toEqual([a, b]);
  });

  it("writes a batch inside one exclusive transaction with a prepared statement", async () => {
    const store = createSqliteEventStore();
    await store.listAll();
    const migrated = mockSqlite.transactions;
    await store.append([a, b]);
    expect(mockSqlite.transactions).toBe(migrated + 1);
    expect(mockSqlite.prepared.filter((sql) => sql.includes("INTO events"))).toHaveLength(1);
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

  it("knows no store id at first and remembers the one it is given", async () => {
    const store = createSqliteEventStore();
    await expect(store.getStoreId()).resolves.toBeNull();
    await store.setStoreId("store-a");
    await store.setStoreId("store-b");
    await expect(store.getStoreId()).resolves.toBe("store-b");
  });

  it("starts the sync version at 0 (a log from before versions) and remembers it", async () => {
    const store = createSqliteEventStore();
    await expect(store.getSyncVersion()).resolves.toBe(0);
    await store.setSyncVersion(1);
    await expect(store.getSyncVersion()).resolves.toBe(1);
  });

  it("clears events, the outbox, the cursor, the store id and the sync version", async () => {
    const store = createSqliteEventStore();
    await store.append([a]);
    await store.setCursor(7);
    await store.setStoreId("store-a");
    await store.setSyncVersion(1);
    await store.clear();
    await expect(store.getSyncVersion()).resolves.toBe(0);
    await expect(store.listAll()).resolves.toEqual([]);
    await expect(store.listPending()).resolves.toEqual([]);
    await expect(store.getCursor()).resolves.toBe(0);
    await expect(store.getStoreId()).resolves.toBeNull();
  });

  it("keeps a copy another session claimed when asked to clear only its own (re-review N3)", async () => {
    const store = createSqliteEventStore();
    await store.setOwner("ended:new");
    await store.append([a]);
    await store.clear("ended:old");
    await expect(store.listAll()).resolves.toHaveLength(1);
    await store.clear("ended:new");
    await expect(store.listAll()).resolves.toEqual([]);
    // Unclaimed (cleared, or from before owners): any session's clear drops it.
    await store.append([a]);
    await store.clear("ended:old");
    await expect(store.listAll()).resolves.toEqual([]);
  });

  it("opens the database once for every operation", async () => {
    const store = createSqliteEventStore();
    await Promise.all([store.getCursor(), store.listAll(), store.listPending()]);
    expect(mockSqlite.opens).toBe(1);
  });
});
