import type { Event } from "@pace/core";

import type { EventStore } from "./event-store.ts";
import type { AppStateHandle } from "./state.ts";

/* What tests put into a local copy, through the guarded writes the client itself uses. */

/** The id a test's copy takes when no server named one. */
const SEEDED_STORE_ID = "store-test";

/** Local events the server has not acknowledged: written under the copy's own guard. */
export const seedPending = async (store: EventStore, events: readonly Event[]): Promise<void> => {
  await store.append(events, await store.readMeta());
};

/**
Events the copy holds as synced, the way an earlier run left them, with no cursor moved and no
store confirmed (a test's server names its own).
*/
export const seedSynced = async (store: EventStore, events: readonly Event[]): Promise<void> => {
  const guard = await store.readMeta();
  await store.append(events, guard);
  await store.markSynced(
    events.map((event) => event.id),
    guard,
  );
};

/** Every event the copy holds, in the order the store reads them. */
export const storedEvents = async (store: EventStore): Promise<readonly Event[]> => {
  const copy = await store.readSnapshot();
  return copy.records.map((record) => record.event);
};

/**
One page of the server's log, committed the way the legacy pull does it: the store takes it in
one guarded write, then the state shows what the store answered.
*/
export const pullPage = async (
  state: AppStateHandle,
  store: EventStore,
  events: readonly Event[],
): Promise<void> => {
  const guard = await store.readMeta();
  const result = await state.commitLegacyPage(
    async () =>
      await store.applyLegacyPage({
        guard,
        storeId: guard.storeId ?? SEEDED_STORE_ID,
        since: guard.cursor,
        seq: guard.cursor + events.length,
        events,
      }),
  );
  if (!result.ok) {
    throw new Error(result.error);
  }
};

/**
A copy as an earlier sync left it: the store's id, the cursor and the sync version it was pulled
under (and the events that page brought), written the one way a copy's meta moves, a legacy page.
*/
export const seedCopy = async (
  store: EventStore,
  copy: {
    readonly storeId?: string;
    readonly cursor?: number;
    readonly syncVersion?: number;
    readonly events?: readonly Event[];
  },
): Promise<void> => {
  const guard = await store.readMeta();
  const result = await store.applyLegacyPage({
    guard,
    storeId: copy.storeId ?? guard.storeId ?? SEEDED_STORE_ID,
    since: guard.cursor,
    seq: copy.cursor ?? guard.cursor,
    events: copy.events ?? [],
    ...(copy.syncVersion !== undefined && { syncVersion: copy.syncVersion }),
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
};
