import type { Event } from "@pace/core";

/**
Persistence port for the local event log. Platforms implement it (IndexedDB on the
web, SQLite in the app); `createMemoryEventStore` is the reference implementation.

"Pending" events are local ones the server has not acknowledged yet (the outbox).
`append` always adds to the outbox; the caller marks remote events synced right after.
*/
export type EventStore = {
  readonly listAll: () => Promise<readonly Event[]>;
  /** Idempotent by `id`: an event already stored is left untouched. */
  readonly append: (events: readonly Event[]) => Promise<void>;
  readonly listPending: () => Promise<readonly Event[]>;
  readonly markSynced: (ids: readonly string[]) => Promise<void>;
  /** The server sequence number of the last pulled event (0 = never pulled). */
  readonly getCursor: () => Promise<number>;
  readonly setCursor: (seq: number) => Promise<void>;
  readonly clear: () => Promise<void>;
};
