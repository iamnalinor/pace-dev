import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { Event } from "@pace/core";

import { createMemoryEventStore, type EventStore } from "@pace/client";

const DB_NAME = "pace";
const DB_VERSION = 1;
const CURSOR_KEY = "cursor";

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
    readonly value: { readonly key: string; readonly value: number };
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

const clear = async (db: Db): Promise<void> => {
  const tx = db.transaction(["events", "pending", "meta"], "readwrite");
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
  clear: async () => {
    await clear(db);
  },
  getCursor: async () => {
    const row = await db.get("meta", CURSOR_KEY);
    return row?.value ?? 0;
  },
  listAll: async () => await db.getAllFromIndex("events", "byOccurredAt"),
  listPending: async () => await listPending(db),
  markSynced: async (ids) => {
    await markSynced(db, ids);
  },
  setCursor: async (seq) => {
    await db.put("meta", { key: CURSOR_KEY, value: seq });
  },
});

/**
Opens IndexedDB once; when it is unavailable (some private windows, blocked site data)
the log lives in memory for this page load so the app still works, just without persistence.
*/
const openBackend = async (): Promise<EventStore> => {
  try {
    return idbBackend(await open());
  } catch {
    return createMemoryEventStore();
  }
};

/** The local event log in IndexedDB (database `pace`): events, the outbox and the sync cursor. */
export const createEventStore = (): EventStore => {
  let backendPromise: Promise<EventStore> | undefined;
  const call = async <T>(run: (store: EventStore) => Promise<T>): Promise<T> => {
    backendPromise ??= openBackend();
    const store = await backendPromise;
    return await run(store);
  };
  return {
    append: async (events) => {
      await call(async (store) => {
        await store.append(events);
      });
    },
    clear: async () => {
      await call(async (store) => {
        await store.clear();
      });
    },
    getCursor: async () => await call(async (store) => await store.getCursor()),
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
  };
};
