import { type Event, STORE_CHANGED } from "@pace/core";

import type { CopyMeta } from "./checkpoint-store-types.ts";
import type { EventStore } from "./event-store.ts";
import type { AppStateHandle } from "./state.ts";
import type { SyncTransport } from "./sync-transport.ts";

import { isSameCopy } from "./checkpoint-store.ts";
import { COPY_CHANGED, SyncError } from "./sync-error.ts";
import { SYNC_PAGE } from "./sync-types.ts";

export type Pushed = {
  readonly pushed: number;
  /** What the server refused, as `<id> (<reason>)`: the run still succeeds and names them. */
  readonly rejected: readonly string[];
  /** The server refused the outbox for a store it no longer has. */
  readonly isReset: boolean;
};

/** What the one outbox push works with, whichever run it is part of. */
export type PushRun = {
  readonly transport: SyncTransport;
  readonly state: AppStateHandle;
  readonly store: EventStore;
  /** Throws once the run's lifetime ended (a closed runtime): nothing is sent or written after. */
  readonly assertLive?: () => void;
};

const chunk = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

/** Pushes one batch into the store the pull confirmed, and only into that one. */
const pushBatch = async (run: PushRun, inventory: CopyMeta, batch: readonly Event[]) => {
  const current = await run.store.readMeta();
  if (!isSameCopy(current, inventory)) {
    throw new SyncError(COPY_CHANGED);
  }
  run.assertLive?.();
  const result = await run.transport.push(batch, inventory.storeId ?? "");
  run.assertLive?.();
  if (result !== STORE_CHANGED) {
    // Guarded: a copy that changed hands meanwhile refuses the mark (`COPY_CHANGED`).
    await run.store.markSynced(result.accepted, inventory);
  }
  return result;
};

/**
Sends the outbox, for the legacy run and the checkpoint run alike (PR 55 review I7): in batches,
each into the copy the outbox was read from, each accepted id marked sent at once. A rejected
event does not fail the run; a store the server no longer has stops it (`isReset`).
*/
export const pushOutbox = async (run: PushRun): Promise<Pushed> => {
  const inventory = await run.store.readMeta();
  if (run.state.localCopy()?.owner !== inventory.owner) {
    throw new SyncError(COPY_CHANGED);
  }
  // The outbox is read after the copy it belongs to; each batch checks that copy again (class 254).
  const batches = inventory.storeId === null ? [] : chunk(await run.store.listPending(), SYNC_PAGE);
  let pushed = 0;
  const rejected: string[] = [];
  for (const batch of batches) {
    const result = await pushBatch(run, inventory, batch);
    if (result === STORE_CHANGED) {
      return { isReset: true, pushed, rejected };
    }
    pushed += result.accepted.length;
    rejected.push(...result.rejected.map((item) => `${item.id} (${item.reason})`));
  }
  return { isReset: false, pushed, rejected };
};
