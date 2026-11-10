import {
  appendSnapshotEvents,
  checkpointOperations,
  type GuardedAppendInput,
} from "#app/platform/checkpoint-operations.ts";
import {
  imageDelta,
  isSameStoredBase,
  legacyPageDelta,
  storedCheckpoint,
  storedMeta,
  storedSnapshot,
} from "#app/platform/checkpoint-persistence.ts";
import {
  EVENT_STORES,
  type EventDatabase,
  eventMeta,
  type EventTransaction,
  readEventImage,
  writeEventDelta,
} from "#app/platform/idb-event-database.ts";
import {
  type CheckpointStore,
  COPY_CHANGED,
  legacyPageChange,
  type LocalSnapshot,
  type Sha256Text,
} from "@pace/client";
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

/** One read-write transaction over the copy: committed when `run` answers, aborted when it throws. */
const transact = async <T>(
  db: EventDatabase,
  run: (tx: EventTransaction) => Promise<T>,
): Promise<T> => {
  const tx = db.transaction(EVENT_STORES, "readwrite");
  try {
    const result = await run(tx);
    await tx.done;
    return result;
  } catch (error) {
    await abortChange(tx);
    throw error;
  }
};

const change = async <E>(
  db: EventDatabase,
  hash: Sha256Text,
  update: (current: LocalSnapshot) => Result<LocalSnapshot, E>,
): Promise<Result<LocalSnapshot, "sync/copy-changed" | E>> => {
  const before = eventMeta(await db.getAll("meta"));
  const checkpoint = await storedCheckpoint(before, hash);
  return await transact(db, async (tx) => {
    const current = await readEventImage(tx);
    if (!isSameStoredBase(before, current.meta)) {
      return err(COPY_CHANGED);
    }
    const result = update(storedSnapshot(current, checkpoint));
    if (result.ok) {
      await writeEventDelta(tx, imageDelta(current, result.value));
    }
    return result;
  });
};

/**
A checkpoint's copy becoming a full one: of its events only the outbox stays (read by its ids),
the base goes with the page's meta delta.
*/
const keepOutboxOnly = async (tx: EventTransaction): Promise<void> => {
  const events = tx.objectStore("events");
  const ids = await tx.objectStore("pending").getAllKeys();
  const found = await Promise.all(ids.map(async (id) => await events.get(id)));
  await Promise.all([events.clear(), tx.objectStore("sequences").clear()]);
  await Promise.all(
    found.map(async (event) => {
      if (event !== undefined) {
        await events.put(event);
      }
    }),
  );
};

/** Hashing runs between atomic read and guarded write, never inside an IndexedDB transaction. */
export const idbCheckpointStore = (db: EventDatabase, hash: Sha256Text): CheckpointStore => ({
  readSnapshot: async () => {
    const image = await read(db);
    return storedSnapshot(image, await storedCheckpoint(image.meta, hash));
  },
  readMeta: async () => storedMeta(eventMeta(await db.getAll("meta"))),
  applyLegacyPage: async (input) =>
    await transact(db, async (tx) => {
      const meta = eventMeta(await tx.objectStore("meta").getAll());
      const result = legacyPageChange(storedMeta(meta), input);
      if (result.ok) {
        if (result.value.isReplaced) {
          await Promise.all(
            (["events", "pending", "sequences"] as const).map(async (name) => {
              await tx.objectStore(name).clear();
            }),
          );
        } else if (result.value.isConverted) {
          await keepOutboxOnly(tx);
        }
        await writeEventDelta(tx, legacyPageDelta(meta, result.value));
      }
      return result;
    }),
  ...checkpointOperations(hash, async (update) => await change(db, hash, update)),
});

export const appendIdbEvents = async (
  db: EventDatabase,
  hash: Sha256Text,
  input: GuardedAppendInput,
): Promise<void> => {
  await appendSnapshotEvents(async (update) => await change(db, hash, update), input);
};
