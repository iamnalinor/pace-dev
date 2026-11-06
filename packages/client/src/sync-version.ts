import type { EventStore } from "./event-store.ts";
import type { AppStateHandle } from "./state.ts";

/**
What this client can read of the server's log. A client below it skipped events it could not
read then (their pull moved the cursor past them), so its first run pulls the whole log again
once: 1 = event ids up to 128 characters (`EVENT_ID_MAX`, 64 before). Raise it whenever a
client update starts accepting events older clients dropped.
*/
export const SYNC_SCHEMA_VERSION = 1;

/** A schema upgrade rewinds only the same guarded full-source copy, in one metadata transaction. */
export const upgradeCursor = async (store: EventStore, state: AppStateHandle): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const guard = await store.readSnapshot();
    if (state.localCopy()?.owner !== guard.owner) {
      throw new Error("sync/copy-changed");
    }
    if (guard.syncVersion >= SYNC_SCHEMA_VERSION || guard.storeId === null) {
      return;
    }
    const result = await state.commitSnapshot(
      async () =>
        await store.applyLegacyPage({
          guard,
          storeId: guard.storeId ?? "",
          since: 0,
          seq: 0,
          events: [],
          syncVersion: SYNC_SCHEMA_VERSION,
        }),
    );
    if (result.ok) {
      return;
    }
    if (result.error !== "history/rebuild-required") {
      throw new Error(result.error);
    }
  }
  throw new Error("history/rebuild-required");
};
