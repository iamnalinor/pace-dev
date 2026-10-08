import type { EventStore } from "@pace/client";

import { createSqliteEventStore } from "./sqlite-event-store.ts";

/** The local event log: SQLite on the phone (the web build swaps in `event-store.web.ts`). */
export const createEventStore = (): EventStore => createSqliteEventStore();
