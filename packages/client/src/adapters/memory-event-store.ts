/* eslint-disable @typescript-eslint/require-await -- the in-memory adapter implements the async port synchronously */
import { newId, type Result } from "@pace/core";

import type { LocalSnapshot } from "../checkpoint-store-types.ts";

import {
  appendLocalSnapshot,
  bootstrapSnapshot,
  copyMeta,
  emptySnapshot,
  historySnapshot,
  isSameCopy,
  legacyPageChange,
  remotePageSnapshot,
  withLegacyPage,
} from "../checkpoint-store.ts";
import { canClearCopy, type EventStore } from "../event-store.ts";
import { COPY_CHANGED, SyncError } from "../sync-error.ts";

type Memory = {
  readonly get: () => LocalSnapshot;
  readonly set: (snapshot: LocalSnapshot) => void;
};
const queries = (get: Memory["get"]) => ({
  readSnapshot: async () => get(),
  readMeta: async () => copyMeta(get()),
  listPending: async () => {
    const image = get();
    const pending = new Set(image.pendingIds);
    return image.records
      .filter((record) => pending.has(record.event.id))
      .map((record) => record.event);
  },
});
const writes = ({
  get,
  set,
}: Memory): Pick<EventStore, "append" | "clear" | "markSynced" | "setOwner"> => ({
  append: async (events, guard) => {
    const result = appendLocalSnapshot(get(), { events, guard });
    if (!result.ok) {
      throw new SyncError(result.error);
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
    if (!isSameCopy(current, guard)) {
      throw new SyncError(COPY_CHANGED);
    }
    const received = new Set(ids);
    set({ ...current, pendingIds: current.pendingIds.filter((id) => !received.has(id)) });
  },
  setOwner: async (owner) => {
    const current = get();
    set({ ...current, owner, copyToken: current.owner === owner ? current.copyToken : newId() });
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
    applyLegacyPage: async (input) => {
      const result = legacyPageChange(copyMeta(get()), input);
      if (result.ok) {
        set(withLegacyPage(get(), result.value));
      }
      return result;
    },
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
