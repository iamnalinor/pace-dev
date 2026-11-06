import type { LocalEventStore } from "#app/platform/event-store.ts";
import type { Event } from "@pace/core";

import { isStoredCopy, newCopyToken, storedCounter } from "#app/platform/checkpoint-persistence.ts";
import { appendIdbEvents, idbCheckpointStore } from "#app/platform/idb-checkpoint-store.ts";
import {
  type EventDatabase as Db,
  EVENT_STORES,
  openEventDatabase,
} from "#app/platform/idb-event-database.ts";
import {
  canClearCopy,
  type CopyGuard,
  createMemoryEventStore,
  type EventStore,
  type Sha256Text,
  sha256Text,
} from "@pace/client";

const CURSOR_KEY = "cursor";
const STORE_ID_KEY = "storeId";
const SYNC_VERSION_KEY = "syncVersion";
const OWNER_KEY = "owner";

const append = async (db: Db, events: readonly Event[]): Promise<void> => {
  const tx = db.transaction(["events", "pending"], "readwrite");
  const store = tx.objectStore("events");
  const pending = tx.objectStore("pending");
  for (const event of events) {
    if ((await store.getKey(event.id)) !== undefined) {
      continue;
    }

    await store.add(event);
    await pending.put({ id: event.id });
  }
  await tx.done;
};

const listPending = async (db: Db): Promise<readonly Event[]> => {
  const tx = db.transaction(["events", "pending"], "readonly");
  const ids = await tx.objectStore("pending").getAllKeys();
  const events = tx.objectStore("events");
  const found = await Promise.all(ids.map(async (id) => await events.get(id)));
  await tx.done;
  return found.filter((event): event is Event => event !== undefined);
};

const markSynced = async (db: Db, ids: readonly string[], guard?: CopyGuard): Promise<void> => {
  const tx = db.transaction(["pending", "meta"], "readwrite");
  const metadata = await tx.objectStore("meta").getAll();
  const meta = Object.fromEntries(metadata.map((row) => [row.key, String(row.value)]));
  if (guard !== undefined && !isStoredCopy(meta, guard)) {
    throw new Error("sync/copy-changed");
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
    if (guard !== undefined) {
      await appendIdbEvents(db, hash, { events, guard });
      return;
    }
    await append(db, events);
  },
  clear: async (ifOwner) => {
    await clear(db, ifOwner);
  },
  getCursor: async () => {
    const row = await db.get("meta", CURSOR_KEY);
    return storedCounter(row?.value);
  },
  getStoreId: async () => {
    const row = await db.get("meta", STORE_ID_KEY);
    return typeof row?.value === "string" ? row.value : null;
  },
  getSyncVersion: async () => {
    const row = await db.get("meta", SYNC_VERSION_KEY);
    return storedCounter(row?.value);
  },
  listAll: async () => await db.getAllFromIndex("events", "byOccurredAt"),
  listPending: async () => await listPending(db),
  markSynced: async (ids, guard) => {
    await markSynced(db, ids, guard);
  },
  setCursor: async (seq) => {
    await db.put("meta", { key: CURSOR_KEY, value: seq });
  },
  setOwner: async (mark) => {
    await setOwner(db, mark);
  },
  setStoreId: async (storeId) => {
    await db.put("meta", { key: STORE_ID_KEY, value: storeId });
  },
  setSyncVersion: async (version) => {
    await db.put("meta", { key: SYNC_VERSION_KEY, value: version });
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
    getCursor: async () => await call(async (store) => await store.getCursor()),
    getStoreId: async () => await call(async (store) => await store.getStoreId()),
    getSyncVersion: async () => await call(async (store) => await store.getSyncVersion()),
    listAll: async () => await call(async (store) => await store.listAll()),
    listPending: async () => await call(async (store) => await store.listPending()),
    markSynced: async (ids, guard) => {
      await call(async (store) => {
        await store.markSynced(ids, guard);
      });
    },
    setCursor: async (seq) => {
      await call(async (store) => {
        await store.setCursor(seq);
      });
    },
    setOwner: async (mark) => {
      await call(async (store) => {
        await store.setOwner(mark);
      });
    },
    setStoreId: async (storeId) => {
      await call(async (store) => {
        await store.setStoreId(storeId);
      });
    },
    setSyncVersion: async (version) => {
      await call(async (store) => {
        await store.setSyncVersion(version);
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
