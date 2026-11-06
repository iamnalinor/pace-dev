import type { SQLiteDatabase } from "expo-sqlite";

import type { CheckpointStore, LocalSnapshot, Sha256Text } from "@pace/client";

import {
  appendSnapshotEvents,
  checkpointOperations,
  type GuardedAppendInput,
} from "#app/platform/checkpoint-operations.ts";
import {
  imageDelta,
  isSameStoredBase,
  storedCheckpoint,
  type StoredDelta,
  type StoredImage,
  storedSnapshot,
} from "#app/platform/checkpoint-persistence.ts";
import { err, type Event, type Result } from "@pace/core";

export const sqliteTransaction = async <T>(
  db: SQLiteDatabase,
  run: (tx: SQLiteDatabase) => Promise<T>,
): Promise<T> => {
  let result: undefined | { readonly value: T };
  await db.withExclusiveTransactionAsync(async (tx) => {
    result = { value: await run(tx) };
  });
  if (result === undefined) {
    throw new Error("storage/transaction-incomplete");
  }
  return result.value;
};

const readImage = async (db: SQLiteDatabase): Promise<StoredImage> => {
  const [meta, records, pending] = await Promise.all([
    db.getAllAsync<{ readonly key: string; readonly value: string }>("SELECT key, value FROM meta"),
    db.getAllAsync<{ readonly json: string; readonly seq: null | number }>(
      "SELECT json, seq FROM events ORDER BY occurred_at, id",
    ),
    db.getAllAsync<{ readonly id: string }>("SELECT id FROM pending ORDER BY id"),
  ]);
  return {
    meta: Object.fromEntries(meta.map((row) => [row.key, row.value])),
    records: records.map((row) => ({ seq: row.seq, event: JSON.parse(row.json) as Event })),
    pendingIds: pending.map((row) => row.id),
  };
};

const writeDelta = async (db: SQLiteDatabase, delta: StoredDelta): Promise<void> => {
  for (const record of delta.records) {
    await db.runAsync(
      "INSERT INTO events (id, occurred_at, json, seq) VALUES ($id, $at, $json, $seq) ON CONFLICT(id) DO UPDATE SET occurred_at=excluded.occurred_at, json=excluded.json, seq=excluded.seq",
      {
        $id: record.event.id,
        $at: record.event.occurredAt,
        $json: JSON.stringify(record.event),
        $seq: record.seq,
      },
    );
  }
  for (const id of delta.deleted) {
    await db.runAsync("DELETE FROM events WHERE id = $id", { $id: id });
  }
  for (const id of delta.pendingAdded) {
    await db.runAsync("INSERT OR IGNORE INTO pending (id) VALUES ($id)", { $id: id });
  }
  for (const id of delta.pendingRemoved) {
    await db.runAsync("DELETE FROM pending WHERE id = $id", { $id: id });
  }
  for (const [key, value] of Object.entries(delta.meta)) {
    await db.runAsync(
      "INSERT INTO meta (key,value) VALUES ($key,$value) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      { $key: key, $value: value },
    );
  }
  for (const key of delta.metaRemoved) {
    await db.runAsync("DELETE FROM meta WHERE key = $key", { $key: key });
  }
};

const change = async <E>(
  db: SQLiteDatabase,
  hash: Sha256Text,
  update: (snapshot: LocalSnapshot) => Result<LocalSnapshot, E>,
): Promise<Result<LocalSnapshot, "sync/copy-changed" | E>> => {
  const before = await sqliteTransaction(db, readImage);
  const checkpoint = await storedCheckpoint(before, hash);
  return await sqliteTransaction(db, async (tx) => {
    const image = await readImage(tx);
    if (!isSameStoredBase(before, image)) {
      return err("sync/copy-changed");
    }
    const result = update(storedSnapshot(image, checkpoint));
    if (result.ok) {
      await writeDelta(tx, imageDelta(image, result.value));
    }
    return result;
  });
};

export const sqliteCheckpointStore = (
  db: () => Promise<SQLiteDatabase>,
  hash: Sha256Text,
): CheckpointStore => ({
  readSnapshot: async () => {
    const image = await sqliteTransaction(await db(), readImage);
    return storedSnapshot(image, await storedCheckpoint(image, hash));
  },
  ...checkpointOperations(hash, async (update) => await change(await db(), hash, update)),
});

export const appendSqliteEvents = async (
  db: SQLiteDatabase,
  hash: Sha256Text,
  input: GuardedAppendInput,
): Promise<void> => {
  await appendSnapshotEvents(async (update) => await change(db, hash, update), input);
};
