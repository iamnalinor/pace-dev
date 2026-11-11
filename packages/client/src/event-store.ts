import type { Event } from "@pace/core";

import type { CheckpointStore, CopyGuard } from "./checkpoint-store-types.ts";

/**
Persistence port for the local event log. Platforms implement it (IndexedDB on the
web, SQLite in the app); `createMemoryEventStore` is the reference implementation.

"Pending" events are local ones the server has not acknowledged yet (the outbox). Next to the
events the store keeps the copy's meta (`readMeta`): the cursor, the server store's id, the sync
version the log was pulled under, its owner and its coverage. Every write names the copy it was
made for (a `CopyGuard`), checked inside the write's own transaction: nothing reaches a copy that
was dropped or changed hands meanwhile. The meta moves only with what it describes, through the
guarded operations of `CheckpointStore`; the port has no way to set a cursor on its own.
*/
export type EventStore = CheckpointStore & {
  /**
  Adds local events to the log and the outbox. Idempotent by `id`: an event already stored is
  left untouched. Throws `SyncError(COPY_CHANGED)` for a copy that is not `guard`'s any more.
  */
  readonly append: (events: readonly Event[], guard: CopyGuard) => Promise<void>;
  readonly listPending: () => Promise<readonly Event[]>;
  /** Takes the ids out of the outbox (the server holds them); guarded as `append` is. */
  readonly markSynced: (ids: readonly string[], guard: CopyGuard) => Promise<void>;
  /**
  Marks the copy as one session's (a mark of its token, never the token): written at sign-in,
  before the sync writes anything into it.
  */
  readonly setOwner: (mark: string) => Promise<void>;
  /**
  Drops the events, the outbox, the cursor, the store id, the sync version and the owner. With
  `ifOwner`, only while the copy is that session's or nobody's, checked in the clear's own
  transaction: a browser's tabs share the copy, and one may have signed in since (re-review N3).
  */
  readonly clear: (ifOwner?: string) => Promise<void>;
};

/**
Whether `clear(ifOwner)` may drop a copy whose stored owner is `owner`: always without `ifOwner`;
with it, while the copy is that session's or nobody's (one made before owners, or just cleared).
Every `EventStore` decides with this one rule.
*/
export const canClearCopy = (owner: null | string, ifOwner: string | undefined): boolean =>
  ifOwner === undefined || owner === null || owner === ifOwner;
