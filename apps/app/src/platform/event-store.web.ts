import type { LocalEventStore } from "#app/platform/event-store.ts";
import type { Event } from "@pace/core";

import {
  canInsertGuarded,
  isStoredCopy,
  newCopyToken,
} from "#app/platform/checkpoint-persistence.ts";
import { appendIdbEvents, idbCheckpointStore } from "#app/platform/idb-checkpoint-store.ts";
import {
  type EventDatabase as Db,
  EVENT_STORES,
  eventMeta,
  openEventDatabase,
} from "#app/platform/idb-event-database.ts";
import {
  canClearCopy,
  COPY_CHANGED,
  type CopyGuard,
  createMemoryEventStore,
  type EventStore,
  type Sha256Text,
  sha256Text,
  SyncError,
} from "@pace/client";

const OWNER_KEY = "owner";

/**
Adds the unknown events to the log and the outbox. The copy is checked against the guard in the
same transaction from its `meta` rows alone (class 259); `covered` (nothing written) when a
checkpoint covers the copy, whose append needs the whole of it.
*/
const append = async (
  db: Db,
  events: readonly Event[],
  guard: CopyGuard,
): Promise<"covered" | "written"> => {
  const tx = db.transaction(["events", "pending", "meta"], "readwrite");
  const store = tx.objectStore("events");
  const pending = tx.objectStore("pending");
  if (!canInsertGuarded(eventMeta(await tx.objectStore("meta").getAll()), guard)) {
    await tx.done;
    return "covered";
  }
  for (const event of events) {
    if ((await store.getKey(event.id)) !== undefined) {
      continue;
    }

    await store.add(event);
    await pending.put({ id: event.id });
  }
  await tx.done;
  return "written";
};

const listPending = async (db: Db): Promise<readonly Event[]> => {
  const tx = db.transaction(["events", "pending"], "readonly");
  const ids = await tx.objectStore("pending").getAllKeys();
  const events = tx.objectStore("events");
  const found = await Promise.all(ids.map(async (id) => await events.get(id)));
  await tx.done;
  return found.filter((event): event is Event => event !== undefined);
};

const markSynced = async (db: Db, ids: readonly string[], guard: CopyGuard): Promise<void> => {
  const tx = db.transaction(["pending", "meta"], "readwrite");
  const meta = eventMeta(await tx.objectStore("meta").getAll());
  if (!isStoredCopy(meta, guard)) {
    throw new SyncError(COPY_CHANGED);
  }
  await Promise.all(
    ids.map(async (id) => {
      await tx.objectStore("pending").delete(id);
    }),
  );
  await tx.done;
};

/**
One read-write transaction for the check and the clear: another tab's writes wait behind it, so a
copy it claimed in the meantime is never wiped by a stale tab (re-review N3).
*/
const clear = async (db: Db, ifOwner: string | undefined): Promise<void> => {
  const tx = db.transaction(EVENT_STORES, "readwrite");
  const row = await tx.objectStore("meta").get(OWNER_KEY);
  const owner = row?.value ?? null;
  if (!canClearCopy(typeof owner === "string" ? owner : null, ifOwner)) {
    await tx.done;
    return;
  }
  await Promise.all([
    tx.objectStore("events").clear(),
    tx.objectStore("pending").clear(),
    tx.objectStore("meta").clear(),
    tx.objectStore("sequences").clear(),
  ]);
  await tx.objectStore("meta").put({ key: "copyToken", value: newCopyToken() });
  await tx.done;
};

const setOwner = async (db: Db, mark: string): Promise<void> => {
  const tx = db.transaction("meta", "readwrite");
  const previous = await tx.store.get(OWNER_KEY);
  if (previous?.value !== mark) {
    await tx.store.put({ key: "copyToken", value: newCopyToken() });
  }
  await tx.store.put({ key: OWNER_KEY, value: mark });
  await tx.done;
};

const idbBackend = (db: Db, hash: Sha256Text): EventStore => ({
  ...idbCheckpointStore(db, hash),
  append: async (events, guard) => {
    if ((await append(db, events, guard)) === "covered") {
      await appendIdbEvents(db, hash, { events, guard });
    }
  },
  clear: async (ifOwner) => {
    await clear(db, ifOwner);
  },
  listPending: async () => await listPending(db),
  markSynced: async (ids, guard) => {
    await markSynced(db, ids, guard);
  },
  setOwner: async (mark) => {
    await setOwner(db, mark);
  },
});

/**
Opens IndexedDB once; when it is unavailable (some private windows, blocked site data)
the log lives in memory for this page load so the app still works, just without persistence.
*/
const openBackend = async (hash: Sha256Text): Promise<Backend> => {
  if (typeof indexedDB === "undefined") {
    return { isShared: false, store: createMemoryEventStore() };
  }
  try {
    return { isShared: true, store: idbBackend(await openEventDatabase(), hash) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") {
      return { isShared: false, store: createMemoryEventStore() };
    }
    throw error;
  }
};

/** The opened copy: in IndexedDB (shared by every tab of the profile) or in this page's memory. */
type Backend = { readonly isShared: boolean; readonly store: EventStore };

/**
The local event log in IndexedDB (database `pace`): events, the outbox, and in `meta` the cursor,
the store id, the sync version and the owner.
*/
export const createEventStore = (hash: Sha256Text = sha256Text): LocalEventStore => {
  let backendPromise: Promise<Backend> | undefined;
  const call = async <T>(run: (store: EventStore) => Promise<T>): Promise<T> => {
    backendPromise ??= openBackend(hash);
    const { store } = await backendPromise;
    return await run(store);
  };
  const store: EventStore = {
    readSnapshot: async () => await call(async (store) => await store.readSnapshot()),
    readMeta: async () => await call(async (store) => await store.readMeta()),
    installBootstrap: async (input) =>
      await call(async (store) => await store.installBootstrap(input)),
    applyLegacyPage: async (input) =>
      await call(async (store) => await store.applyLegacyPage(input)),
    applyRemotePage: async (input) =>
      await call(async (store) => await store.applyRemotePage(input)),
    installHistory: async (input) => await call(async (store) => await store.installHistory(input)),
    append: async (events, guard) => {
      await call(async (store) => {
        await store.append(events, guard);
      });
    },
    clear: async (ifOwner) => {
      await call(async (store) => {
        await store.clear(ifOwner);
      });
    },
    listPending: async () => await call(async (store) => await store.listPending()),
    markSynced: async (ids, guard) => {
      await call(async (store) => {
        await store.markSynced(ids, guard);
      });
    },
    setOwner: async (mark) => {
      await call(async (store) => {
        await store.setOwner(mark);
      });
    },
  };
  return {
    isShared: async () => {
      backendPromise ??= openBackend(hash);
      const backend = await backendPromise;
      return backend.isShared;
    },
    store,
  };
};
