import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { Event } from "@pace/core";

import { canClearCopy, createMemoryEventStore, type EventStore } from "@pace/client";

import type { LocalEventStore } from "./event-store.ts";

const DB_NAME = "pace";
const DB_VERSION = 1;
const CURSOR_KEY = "cursor";
const STORE_ID_KEY = "storeId";
const SYNC_VERSION_KEY = "syncVersion";
const OWNER_KEY = "owner";

type PaceDb = DBSchema & {
  readonly events: {
    readonly key: string;
    readonly value: Event;
    readonly indexes: { readonly byOccurredAt: string };
  };
  /** The outbox: ids of local events the server has not acknowledged. */
  readonly pending: { readonly key: string; readonly value: { readonly id: string } };
  readonly meta: {
    readonly key: string;
    readonly value: { readonly key: string; readonly value: number | string };
  };
};

type Db = IDBPDatabase<PaceDb>;

const open = async (): Promise<Db> =>
  await openDB<PaceDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const events = db.createObjectStore("events", { keyPath: "id" });
      events.createIndex("byOccurredAt", "occurredAt");
      db.createObjectStore("pending", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "key" });
    },
  });

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

const markSynced = async (db: Db, ids: readonly string[]): Promise<void> => {
  const tx = db.transaction("pending", "readwrite");
  await Promise.all(
    ids.map(async (id) => {
      await tx.store.delete(id);
    }),
  );
  await tx.done;
};

/**
One read-write transaction for the check and the clear: another tab's writes wait behind it, so a
copy it claimed in the meantime is never wiped by a stale tab (re-review N3).
*/
const clear = async (db: Db, ifOwner: string | undefined): Promise<void> => {
  const tx = db.transaction(["events", "pending", "meta"], "readwrite");
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
  ]);
  await tx.done;
};

const idbBackend = (db: Db): EventStore => ({
  append: async (events) => {
    await append(db, events);
  },
  clear: async (ifOwner) => {
    await clear(db, ifOwner);
  },
  getCursor: async () => {
    const row = await db.get("meta", CURSOR_KEY);
    return typeof row?.value === "number" ? row.value : 0;
  },
  getStoreId: async () => {
    const row = await db.get("meta", STORE_ID_KEY);
    return typeof row?.value === "string" ? row.value : null;
  },
  getSyncVersion: async () => {
    const row = await db.get("meta", SYNC_VERSION_KEY);
    return typeof row?.value === "number" ? row.value : 0;
  },
  listAll: async () => await db.getAllFromIndex("events", "byOccurredAt"),
  listPending: async () => await listPending(db),
  markSynced: async (ids) => {
    await markSynced(db, ids);
  },
  setCursor: async (seq) => {
    await db.put("meta", { key: CURSOR_KEY, value: seq });
  },
  setOwner: async (mark) => {
    await db.put("meta", { key: OWNER_KEY, value: mark });
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
const openBackend = async (): Promise<Backend> => {
  try {
    return { isShared: true, store: idbBackend(await open()) };
  } catch {
    return { isShared: false, store: createMemoryEventStore() };
  }
};

/** The opened copy: in IndexedDB (shared by every tab of the profile) or in this page's memory. */
type Backend = { readonly isShared: boolean; readonly store: EventStore };

/**
The local event log in IndexedDB (database `pace`): events, the outbox, and in `meta` the cursor,
the store id, the sync version and the owner.
*/
export const createEventStore = (): LocalEventStore => {
  let backendPromise: Promise<Backend> | undefined;
  const call = async <T>(run: (store: EventStore) => Promise<T>): Promise<T> => {
    backendPromise ??= openBackend();
    const { store } = await backendPromise;
    return await run(store);
  };
  const store: EventStore = {
    append: async (events) => {
      await call(async (store) => {
        await store.append(events);
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
    markSynced: async (ids) => {
      await call(async (store) => {
        await store.markSynced(ids);
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
      backendPromise ??= openBackend();
      const backend = await backendPromise;
      return backend.isShared;
    },
    store,
  };
};
