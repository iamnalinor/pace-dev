/* eslint-disable @typescript-eslint/require-await -- the in-memory adapter implements the async port synchronously */
import type { Event } from "@pace/core";

import type { EventStore } from "../event-store.ts";

/** In-memory `EventStore`: the reference implementation, used by tests and as a fallback. */
export const createMemoryEventStore = (): EventStore => {
  const events = new Map<string, Event>();
  const pending = new Set<string>();
  let cursor = 0;
  let storeId: null | string = null;
  let syncVersion = 0;
  return {
    append: async (incoming) => {
      for (const event of incoming) {
        if (events.has(event.id)) {
          continue;
        }

        events.set(event.id, event);
        pending.add(event.id);
      }
    },
    clear: async () => {
      events.clear();
      pending.clear();
      cursor = 0;
      storeId = null;
      syncVersion = 0;
    },
    getCursor: async () => cursor,
    getStoreId: async () => storeId,
    getSyncVersion: async () => syncVersion,
    listAll: async () => events.values().toArray(),
    listPending: async () =>
      events
        .values()
        .filter((event) => pending.has(event.id))
        .toArray(),
    markSynced: async (ids) => {
      for (const id of ids) {
        pending.delete(id);
      }
    },
    setCursor: async (seq) => {
      cursor = seq;
    },
    setStoreId: async (id) => {
      storeId = id;
    },
    setSyncVersion: async (version) => {
      syncVersion = version;
    },
  };
};

/* eslint-enable @typescript-eslint/require-await -- end of the synchronous adapter */
