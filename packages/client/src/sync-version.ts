import type { EventStore } from "./event-store.ts";

/**
What this client can read of the server's log. A client below it skipped events it could not
read then (their pull moved the cursor past them), so its first run pulls the whole log again
once: 1 = event ids up to 128 characters (`EVENT_ID_MAX`, 64 before). Raise it whenever a
client update starts accepting events older clients dropped.
*/
export const SYNC_SCHEMA_VERSION = 1;

/**
Once per update that lets this client read more of the log (`SYNC_SCHEMA_VERSION`): the cursor
goes back to 0 so the next pull reads everything again; the log and the outbox stay, so nothing
written here and not yet sent is lost, and what the log already holds is skipped on the way in.
The cursor moves first: a run cut off between the two writes re-pulls again rather than never.
A log without a store id is left alone: its pull drops it anyway (`isSameStore`).
*/
export const upgradeCursor = async (store: EventStore): Promise<void> => {
  if ((await store.getSyncVersion()) >= SYNC_SCHEMA_VERSION) {
    return;
  }
  if ((await store.getStoreId()) !== null) {
    await store.setCursor(0);
  }
  await store.setSyncVersion(SYNC_SCHEMA_VERSION);
};
