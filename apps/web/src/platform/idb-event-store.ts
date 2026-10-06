import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { EventStore } from "@pace/client";
import type { Event } from "@pace/core";

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
  readonly meta: { readonly key: string; readonly value: { readonly key: string; readonly value: number } };
};

const open = async (): Promise<IDBPDatabase<PaceDb>> =>
  await openDB<PaceDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const events = db.createObjectStore("events", { keyPath: "id" });
      events.createIndex("byOccurredAt", "occurredAt");
      db.createObjectStore("pending", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "key" });
    },
  });

/** The local event log in IndexedDB (database `pace`): events, the outbox and the sync cursor. */
export const createIdbEventStore = (): EventStore => {
  let dbPromise: Promise<IDBPDatabase<PaceDb>> | undefined;
  const db = async (): Promise<IDBPDatabase<PaceDb>> => {
    dbPromise ??= open();
    return await dbPromise;
  };

  return {
    append: async (events) => {
      const tx = (await db()).transaction(["events", "pending"], "readwrite");
      const store = tx.objectStore("events");
      const pending = tx.objectStore("pending");
      for (const event of events) {
        if ((await store.getKey(event.id)) === undefined) {
          await store.add(event);
          await pending.put({ id: event.id });
        }
      }
      await tx.done;
    },
    clear: async () => {
      const tx = (await db()).transaction(["events", "pending", "meta"], "readwrite");
      await Promise.all([
        tx.objectStore("events").clear(),
        tx.objectStore("pending").clear(),
        tx.objectStore("meta").clear(),
      ]);
      await tx.done;
    },
    getCursor: async () => (await (await db()).get("meta", CURSOR_KEY))?.value ?? 0,
    listAll: async () => await (await db()).getAllFromIndex("events", "byOccurredAt"),
    listPending: async () => {
      const tx = (await db()).transaction(["events", "pending"], "readonly");
      const ids = await tx.objectStore("pending").getAllKeys();
      const events = tx.objectStore("events");
      const found = await Promise.all(ids.map(async (id) => await events.get(id)));
      await tx.done;
      return found.filter((event): event is Event => event !== undefined);
    },
    markSynced: async (ids) => {
      const tx = (await db()).transaction("pending", "readwrite");
      await Promise.all(ids.map(async (id) => await tx.store.delete(id)));
      await tx.done;
    },
    setCursor: async (seq) => {
      await (await db()).put("meta", { key: CURSOR_KEY, value: seq });
    },
  };
};
