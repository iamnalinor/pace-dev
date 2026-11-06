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
  storedSnapshot,
} from "#app/platform/checkpoint-persistence.ts";
import {
  EVENT_STORES,
  type EventDatabase,
  type EventTransaction,
  readEventImage,
  writeEventDelta,
} from "#app/platform/idb-event-database.ts";
import { err, type Result } from "@pace/core";

const read = async (db: EventDatabase) => {
  const tx = db.transaction(EVENT_STORES, "readonly");
  const image = await readEventImage(tx);
  await tx.done;
  return image;
};

const abortChange = async (tx: EventTransaction): Promise<void> => {
  if (tx.error === null) {
    tx.abort();
  }
  try {
    await tx.done;
  } catch {
    // Drain the abort rejection; the caller rethrows the original operation failure.
    return;
  }
};

const change = async <E>(
  db: EventDatabase,
  hash: Sha256Text,
  update: (current: LocalSnapshot) => Result<LocalSnapshot, E>,
): Promise<Result<LocalSnapshot, "sync/copy-changed" | E>> => {
  const before = await read(db);
  const checkpoint = await storedCheckpoint(before, hash);
  const tx = db.transaction(EVENT_STORES, "readwrite");
  try {
    const current = await readEventImage(tx);
    if (!isSameStoredBase(before, current)) {
      await tx.done;
      return err("sync/copy-changed");
    }
    const result = update(storedSnapshot(current, checkpoint));
    if (result.ok) {
      await writeEventDelta(tx, imageDelta(current, result.value));
    }
    await tx.done;
    return result;
  } catch (error) {
    await abortChange(tx);
    throw error;
  }
};

/** Hashing runs between atomic read and guarded write, never inside an IndexedDB transaction. */
export const idbCheckpointStore = (db: EventDatabase, hash: Sha256Text): CheckpointStore => ({
  readSnapshot: async () => {
    const image = await read(db);
    return storedSnapshot(image, await storedCheckpoint(image, hash));
  },
  ...checkpointOperations(hash, async (update) => await change(db, hash, update)),
});

export const appendIdbEvents = async (
  db: EventDatabase,
  hash: Sha256Text,
  input: GuardedAppendInput,
): Promise<void> => {
  await appendSnapshotEvents(async (update) => await change(db, hash, update), input);
};
