import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import type { Event } from "@pace/core";

import { isStoredCopy, newCopyToken, storedCounter } from "#app/platform/checkpoint-persistence.ts";
import { sha256Text } from "#app/platform/sha256-text.ts";
import {
  appendSqliteEvents,
  sqliteCheckpointStore,
  sqliteTransaction,
} from "#app/platform/sqlite-checkpoint-store.ts";
import { canClearCopy, type CopyGuard, type EventStore, type Sha256Text } from "@pace/client";

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
  "ALTER TABLE events ADD COLUMN seq INTEGER; CREATE INDEX events_seq ON events (seq);",
];

export const SCHEMA_VERSION = MIGRATIONS.length;

const CURSOR_KEY = "cursor";
const STORE_ID_KEY = "storeId";
const SYNC_VERSION_KEY = "syncVersion";
const OWNER_KEY = "owner";

const migrate = async (db: SQLiteDatabase): Promise<void> => {
  await db.execAsync("PRAGMA journal_mode = WAL");
  const row = await db.getFirstAsync<{ readonly user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) {
    return;
  }
  await db.withExclusiveTransactionAsync(async (txn) => {
    const locked = await txn.getFirstAsync<{ readonly user_version: number }>(
      "PRAGMA user_version",
    );
    const version = locked?.user_version ?? 0;
    if (version >= SCHEMA_VERSION) {
      return;
    }
    for (const step of MIGRATIONS.slice(version)) {
      await txn.execAsync(step);
    }
    await txn.execAsync(`PRAGMA user_version = ${String(SCHEMA_VERSION)}`);
  });
};

const open = async (): Promise<SQLiteDatabase> => {
  const db = await openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  await sqliteTransaction(db, async (tx) => {
    if ((await readMeta(tx, "copyToken")) === null) {
      await writeMeta(tx, "copyToken", newCopyToken());
    }
  });
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

const deletePending = async (
  db: SQLiteDatabase,
  ids: readonly string[],
  guard?: CopyGuard,
): Promise<void> => {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const rows = await txn.getAllAsync<{ readonly key: string; readonly value: string }>(
      "SELECT key, value FROM meta",
    );
    if (
      guard !== undefined &&
      !isStoredCopy(Object.fromEntries(rows.map((row) => [row.key, row.value])), guard)
    ) {
      throw new Error("sync/copy-changed");
    }
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

const readMeta = async (db: SQLiteDatabase, key: string): Promise<null | string> => {
  const row = await db.getFirstAsync<{ readonly value: string }>(
    "SELECT value FROM meta WHERE key = $key",
    { $key: key },
  );
  return row?.value ?? null;
};

const writeMeta = async (db: SQLiteDatabase, key: string, value: string): Promise<void> => {
  await db.runAsync(
    "INSERT INTO meta (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    { $key: key, $value: value },
  );
};

/**
`EventStore` on expo-sqlite (`pace.db`, WAL). Events are stored as JSON next to their
`occurredAt` for ordered reads; the outbox is a separate id table; `meta` holds the cursor,
the store id, the sync version and the owner.
*/
export const createSqliteEventStore = (hash: Sha256Text = sha256Text): EventStore => {
  let connection: Promise<SQLiteDatabase> | undefined;
  const db = async (): Promise<SQLiteDatabase> => {
    connection ??= open();
    return await connection;
  };

  return {
    ...sqliteCheckpointStore(db, hash),
    append: async (events, guard) => {
      if (guard !== undefined) {
        await appendSqliteEvents(await db(), hash, { events, guard });
        return;
      }
      if (events.length > 0) {
        await insertAll(await db(), events);
      }
    },
    clear: async (ifOwner) => {
      const connection = await db();
      await connection.withExclusiveTransactionAsync(async (txn) => {
        const owner = await readMeta(txn, OWNER_KEY);
        if (!canClearCopy(owner, ifOwner)) {
          return;
        }
        await txn.execAsync("DELETE FROM events; DELETE FROM pending; DELETE FROM meta;");
        await writeMeta(txn, "copyToken", newCopyToken());
      });
    },
    getCursor: async () => storedCounter(await readMeta(await db(), CURSOR_KEY)),
    getStoreId: async () => await readMeta(await db(), STORE_ID_KEY),
    getSyncVersion: async () => storedCounter(await readMeta(await db(), SYNC_VERSION_KEY)),
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
    markSynced: async (ids, guard) => {
      if (guard !== undefined || ids.length > 0) {
        await deletePending(await db(), ids, guard);
      }
    },
    setOwner: async (mark) => {
      await sqliteTransaction(await db(), async (tx) => {
        if ((await readMeta(tx, OWNER_KEY)) !== mark) {
          await writeMeta(tx, "copyToken", newCopyToken());
        }
        await writeMeta(tx, OWNER_KEY, mark);
      });
    },
    setCursor: async (seq) => {
      await writeMeta(await db(), CURSOR_KEY, String(seq));
    },
    setStoreId: async (storeId) => {
      await writeMeta(await db(), STORE_ID_KEY, storeId);
    },
    setSyncVersion: async (version) => {
      await writeMeta(await db(), SYNC_VERSION_KEY, String(version));
    },
  };
};
