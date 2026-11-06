import type { Event } from "@pace/core";

import type { CheckpointStore, CopyGuard } from "./checkpoint-store-types.ts";

/**
Persistence port for the local event log. Platforms implement it (IndexedDB on the
web, SQLite in the app); `createMemoryEventStore` is the reference implementation.

"Pending" events are local ones the server has not acknowledged yet (the outbox).
`append` always adds to the outbox; the caller marks remote events synced right after.
Next to the cursor the store keeps the server store's id, so the sync can tell when the
server's data was reset and this copy must go, and the sync version the log was pulled under.
*/
export type EventStore = CheckpointStore & {
  readonly listAll: () => Promise<readonly Event[]>;
  /** Idempotent by `id`: an event already stored is left untouched. */
  readonly append: (events: readonly Event[], guard?: CopyGuard) => Promise<void>;
  readonly listPending: () => Promise<readonly Event[]>;
  readonly markSynced: (ids: readonly string[], guard?: CopyGuard) => Promise<void>;
  /** The server sequence number of the last pulled event (0 = never pulled). */
  readonly getCursor: () => Promise<number>;
  readonly setCursor: (seq: number) => Promise<void>;
  /** The id of the server store the log came from (`null` = none confirmed yet). */
  readonly getStoreId: () => Promise<null | string>;
  readonly setStoreId: (storeId: string) => Promise<void>;
  /**
  Which `SYNC_SCHEMA_VERSION` the log was pulled under (0 = before versions existed): a lower
  one makes the sync pull the whole log again once (see `sync-client.ts`).
  */
  readonly getSyncVersion: () => Promise<number>;
  readonly setSyncVersion: (version: number) => Promise<void>;
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
