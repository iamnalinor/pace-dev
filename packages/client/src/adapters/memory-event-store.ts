/* eslint-disable @typescript-eslint/require-await -- the in-memory adapter implements the async port synchronously */
import { newId, type Result } from "@pace/core";

import type { LocalSnapshot } from "../checkpoint-store-types.ts";

import {
  appendLocalSnapshot,
  bootstrapSnapshot,
  emptySnapshot,
  historySnapshot,
  isSameCopy,
  legacyPageSnapshot,
  remotePageSnapshot,
} from "../checkpoint-store.ts";
import { canClearCopy, type EventStore } from "../event-store.ts";

type Memory = {
  readonly get: () => LocalSnapshot;
  readonly set: (snapshot: LocalSnapshot) => void;
};
const queries = (get: Memory["get"]) => ({
  readSnapshot: async () => get(),
  getCursor: async () => get().cursor,
  getStoreId: async () => get().storeId,
  getSyncVersion: async () => get().syncVersion,
  listAll: async () => get().records.map((record) => record.event),
  listPending: async () => {
    const image = get();
    return image.records
      .filter((record) => image.pendingIds.includes(record.event.id))
      .map((record) => record.event);
  },
});
const writes = ({
  get,
  set,
}: Memory): Pick<
  EventStore,
  "append" | "clear" | "markSynced" | "setCursor" | "setOwner" | "setStoreId" | "setSyncVersion"
> => ({
  append: async (events, guard) => {
    const result = appendLocalSnapshot(get(), { events, ...(guard !== undefined && { guard }) });
    if (!result.ok) {
      throw new Error(result.error);
    }
    set(result.value);
  },
  clear: async (ifOwner) => {
    if (canClearCopy(get().owner, ifOwner)) {
      set(emptySnapshot());
    }
  },
  markSynced: async (ids, guard) => {
    const current = get();
    if (guard !== undefined && !isSameCopy(current, guard)) {
      throw new Error("sync/copy-changed");
    }
    const received = new Set(ids);
    set({ ...current, pendingIds: current.pendingIds.filter((id) => !received.has(id)) });
  },
  setOwner: async (owner) => {
    const current = get();
    set({ ...current, owner, copyToken: current.owner === owner ? current.copyToken : newId() });
  },
  setCursor: async (cursor) => {
    set({ ...get(), cursor });
  },
  setStoreId: async (storeId) => {
    set({ ...get(), storeId });
  },
  setSyncVersion: async (syncVersion) => {
    set({ ...get(), syncVersion });
  },
});
const checkpointWrites = ({
  get,
  set,
}: Memory): Pick<
  EventStore,
  "applyLegacyPage" | "applyRemotePage" | "installBootstrap" | "installHistory"
> => {
  const change = <E>(result: Result<LocalSnapshot, E>): Result<LocalSnapshot, E> => {
    if (result.ok) {
      set(result.value);
    }
    return result;
  };
  return {
    installBootstrap: async (input) => change(bootstrapSnapshot(get(), input)),
    applyRemotePage: async (input) => change(remotePageSnapshot(get(), input)),
    applyLegacyPage: async (input) => change(legacyPageSnapshot(get(), input)),
    installHistory: async (input) => change(historySnapshot(get(), input)),
  };
};
/** In-memory EventStore, sharing exactly the persistent adapters' guarded transitions. */
export const createMemoryEventStore = (): EventStore => {
  let image = emptySnapshot();
  const memory: Memory = {
    get: () => image,
    set: (next) => {
      image = next;
    },
  };
  return { ...queries(memory.get), ...writes(memory), ...checkpointWrites(memory) };
};
/* eslint-enable @typescript-eslint/require-await -- end of the synchronous adapter */
