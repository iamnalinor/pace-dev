import { type DBSchema, type IDBPDatabase, type IDBPTransaction, openDB } from "idb";

import type { Event } from "@pace/core";

import {
  compareStoredEvents,
  newCopyToken,
  type StoredDelta,
  type StoredImage,
} from "#app/platform/checkpoint-persistence.ts";

export type PaceDb = DBSchema & {
  readonly events: {
    readonly key: string;
    readonly value: Event;
    readonly indexes: { readonly byOccurredAt: string };
  };
  readonly pending: { readonly key: string; readonly value: { readonly id: string } };
  readonly meta: {
    readonly key: string;
    readonly value: { readonly key: string; readonly value: number | string };
  };
  readonly sequences: {
    readonly key: string;
    readonly value: { readonly id: string; readonly seq: number };
  };
};
export type EventDatabase = IDBPDatabase<PaceDb>;
export const EVENT_STORES = ["events", "pending", "meta", "sequences"] as const;
export type EventTransaction = IDBPTransaction<PaceDb, typeof EVENT_STORES, "readwrite">;
export type ReadEventTransaction = EventTransaction | IDBPTransaction<PaceDb, typeof EVENT_STORES>;

export const openEventDatabase = async (): Promise<EventDatabase> => {
  const db = await openDB<PaceDb>("pace", 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const events = database.createObjectStore("events", { keyPath: "id" });
        events.createIndex("byOccurredAt", "occurredAt");
        database.createObjectStore("pending", { keyPath: "id" });
        database.createObjectStore("meta", { keyPath: "key" });
      }
      if (oldVersion < 2) {
        database.createObjectStore("sequences", { keyPath: "id" });
      }
    },
  });
  const tx = db.transaction("meta", "readwrite");
  if ((await tx.store.get("copyToken")) === undefined) {
    await tx.store.put({ key: "copyToken", value: newCopyToken() });
  }
  await tx.done;
  return db;
};

export const readEventImage = async (tx: ReadEventTransaction): Promise<StoredImage> => {
  const [metadata, events, pendingIds, sequences] = await Promise.all([
    tx.objectStore("meta").getAll(),
    tx.objectStore("events").getAll(),
    tx.objectStore("pending").getAllKeys(),
    tx.objectStore("sequences").getAll(),
  ]);
  const seqs = new Map(sequences.map((row) => [row.id, row.seq]));
  return {
    meta: Object.fromEntries(metadata.map((row) => [row.key, String(row.value)])),
    pendingIds,
    records: events
      .toSorted(compareStoredEvents)
      .map((event) => ({ event, seq: seqs.get(event.id) ?? null })),
  };
};

const writeRecord = async (
  tx: EventTransaction,
  record: StoredDelta["records"][number],
): Promise<void> => {
  await tx.objectStore("events").put(record.event);
  if (record.seq === null) {
    await tx.objectStore("sequences").delete(record.event.id);
  } else {
    await tx.objectStore("sequences").put({ id: record.event.id, seq: record.seq });
  }
};

export const writeEventDelta = async (tx: EventTransaction, delta: StoredDelta): Promise<void> => {
  await Promise.all([
    ...delta.records.map(async (record) => {
      await writeRecord(tx, record);
    }),
    ...delta.deleted.map(async (id) => {
      await tx.objectStore("events").delete(id);
      await tx.objectStore("sequences").delete(id);
    }),
    ...delta.pendingAdded.map(async (id) => {
      await tx.objectStore("pending").put({ id });
    }),
    ...delta.pendingRemoved.map(async (id) => {
      await tx.objectStore("pending").delete(id);
    }),
    ...Object.entries(delta.meta).map(async ([key, value]) => {
      await tx.objectStore("meta").put({ key, value });
    }),
    ...delta.metaRemoved.map(async (key) => {
      await tx.objectStore("meta").delete(key);
    }),
  ]);
};
