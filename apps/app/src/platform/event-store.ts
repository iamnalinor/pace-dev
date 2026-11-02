import type { EventStore } from "@pace/client";

import { createSqliteEventStore } from "./sqlite-event-store.ts";

/** The device's copy of the log, and whether other tabs of a browser profile share it. */
export type LocalEventStore = {
  readonly store: EventStore;
  /** True once the copy is known to live where every tab of the profile reads it (IndexedDB). */
  readonly isShared: () => Promise<boolean>;
};

/** The local event log: SQLite on the phone (the web build swaps in `event-store.web.ts`). */
export const createEventStore = (): LocalEventStore => ({
  isShared: () => Promise.resolve(false),
  store: createSqliteEventStore(),
});
