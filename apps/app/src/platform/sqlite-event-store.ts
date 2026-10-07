import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import type { EventStore } from "@pace/client";
import type { Event } from "@pace/core";

const DATABASE_NAME = "pace.db";

/** Each entry migrates from its index to the next version; `PRAGMA user_version` tracks it. */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS events (
     id TEXT PRIMARY KEY NOT NULL,
     occurred_at TEXT NOT NULL,
     json TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS events_occurred_at ON events (occurred_at, id);
   CREATE TABLE IF NOT EXISTS pending (id TEXT PRIMARY KEY NOT NULL);
   CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

const CURSOR_KEY = "cursor";

const migrate = async (db: SQLiteDatabase): Promise<void> => {
  await db.execAsync("PRAGMA journal_mode = WAL");
  const row = await db.getFirstAsync<{ readonly user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) {
    return;
  }
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const step of MIGRATIONS.slice(current)) {
      await txn.execAsync(step);
    }
    await txn.execAsync(`PRAGMA user_version = ${String(SCHEMA_VERSION)}`);
  });
};

const open = async (): Promise<SQLiteDatabase> => {
  const db = await openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  return db;
};

type JsonRow = { readonly json: string };

const parseRows = (rows: readonly JsonRow[]): readonly Event[] =>
  rows.map((row) => JSON.parse(row.json) as Event);

const insertAll = async (db: SQLiteDatabase, events: readonly Event[]): Promise<void> => {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const insertEvent = await txn.prepareAsync(
      "INSERT OR IGNORE INTO events (id, occurred_at, json) VALUES ($id, $occurredAt, $json)",
    );
    const insertPending = await txn.prepareAsync("INSERT OR IGNORE INTO pending (id) VALUES ($id)");
    try {
      for (const event of events) {
        const result = await insertEvent.executeAsync({
          $id: event.id,
          $json: JSON.stringify(event),
          $occurredAt: event.occurredAt,
        });
        if (result.changes > 0) {
          await insertPending.executeAsync({ $id: event.id });
        }
      }
    } finally {
      await insertEvent.finalizeAsync();
      await insertPending.finalizeAsync();
    }
  });
};

const deletePending = async (db: SQLiteDatabase, ids: readonly string[]): Promise<void> => {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const remove = await txn.prepareAsync("DELETE FROM pending WHERE id = $id");
    try {
      for (const id of ids) {
        await remove.executeAsync({ $id: id });
      }
    } finally {
      await remove.finalizeAsync();
    }
  });
};

/**
 * `EventStore` on expo-sqlite (`pace.db`, WAL). Events are stored as JSON next to their
 * `occurredAt` for ordered reads; the outbox is a separate id table; `meta` holds the cursor.
 */
export const createSqliteEventStore = (): EventStore => {
  let connection: Promise<SQLiteDatabase> | undefined;
  const db = async (): Promise<SQLiteDatabase> => {
    connection ??= open();
    return await connection;
  };

  return {
    append: async (events) => {
      if (events.length > 0) {
        await insertAll(await db(), events);
      }
    },
    clear: async () => {
      const connection = await db();
      await connection.execAsync("DELETE FROM events; DELETE FROM pending; DELETE FROM meta;");
    },
    getCursor: async () => {
      const connection = await db();
      const row = await connection.getFirstAsync<{ readonly value: string }>(
        "SELECT value FROM meta WHERE key = $key",
        { $key: CURSOR_KEY },
      );
      return row === null ? 0 : Number(row.value);
    },
    listAll: async () => {
      const connection = await db();
      return parseRows(
        await connection.getAllAsync<JsonRow>("SELECT json FROM events ORDER BY occurred_at, id"),
      );
    },
    listPending: async () => {
      const connection = await db();
      return parseRows(
        await connection.getAllAsync<JsonRow>(
          "SELECT e.json FROM events e JOIN pending p ON p.id = e.id ORDER BY e.occurred_at, e.id",
        ),
      );
    },
    markSynced: async (ids) => {
      if (ids.length > 0) {
        await deletePending(await db(), ids);
      }
    },
    setCursor: async (seq) => {
      const connection = await db();
      await connection.runAsync(
        "INSERT INTO meta (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        { $key: CURSOR_KEY, $value: String(seq) },
      );
    },
  };
};
