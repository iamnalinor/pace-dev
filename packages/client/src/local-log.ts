import type { StoreApi } from "zustand/vanilla";

import { err, ok } from "@pace/core";

import type { EventStore } from "./event-store.ts";
import type { Fold, LocalLog } from "./local-log-types.ts";

import { emptyHeldCopy, isClearedCopy } from "./local-copy.ts";
import {
  assertHeldOwner,
  committed,
  createMemory,
  isCopyOf,
  type Memory,
  replaceSnapshot,
  unknownOf,
} from "./local-log-memory.ts";
import { COPY_CHANGED, SyncError } from "./sync-error.ts";

export type { Fold, LocalLog, Persisted, PersistError, Staged } from "./local-log-types.ts";

const settled = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    // Whoever started it saw the refusal; the next one runs regardless.
  }
};

/** Serializes jobs: each one starts once the one before it has settled, refused or not. */
export const createQueue = (
  first: Promise<void>,
): (<T>(job: () => Promise<T> | T) => Promise<T>) => {
  let tail: Promise<void> = settled(first);
  return async (job) => {
    const previous = tail;
    const next = (async () => {
      await previous;
      return await job();
    })();
    tail = settled(next);
    return await next;
  };
};

/** Writes in the order integrated, and a way to wait for every one handed over so far. */
const createWrites = (): {
  readonly write: <T>(job: () => Promise<T>) => Promise<T>;
  readonly settledAll: () => Promise<void>;
} => {
  const enqueue = createQueue(Promise.resolve());
  let last: Promise<unknown> = Promise.resolve();
  return {
    settledAll: async () => {
      await settled(last);
    },
    write: async (job) => {
      const next = enqueue(job);
      last = next;
      return await next;
    },
  };
};

type Context = {
  readonly eventStore: EventStore;
  readonly memory: Memory;
  readonly write: <T>(job: () => Promise<T>) => Promise<T>;
  /** Which local copy is current: `clear` starts a new one. */
  readonly copy: () => number;
};

/** Shows the events; `false` when the state cannot take them (nothing is shown or kept then). */
const canShow = (memory: Memory, events: Parameters<Memory["integrate"]>[0]): boolean => {
  try {
    memory.integrate(events);
    return true;
  } catch (error) {
    if (error instanceof SyncError) {
      return false;
    }
    throw error;
  }
};

const persistLocalWith =
  ({ copy, eventStore, memory, write }: Context): LocalLog["persistLocal"] =>
  async (events) => {
    const ofCopy = copy();
    const guard = memory.snapshot();
    if (guard === undefined || !canShow(memory, events)) {
      return err("persist_failed");
    }
    for (const event of events) {
      memory.unsaved.add(event.id);
    }
    return await write(async () => {
      if (ofCopy !== copy()) {
        // Written on a copy that was dropped meanwhile: it goes with it.
        return err("persist_failed");
      }
      try {
        await eventStore.append(events, guard);
      } catch {
        // A copy the server sent meanwhile (a deterministic id) stays: it is not this write's.
        memory.rollback(events.map((event) => event.id).filter((id) => memory.unsaved.has(id)));
        return err("persist_failed");
      }
      for (const event of events) {
        memory.unsaved.delete(event.id);
      }
      return ok(events);
    });
  };

const persistenceControls = ({
  eventStore,
  memory,
  settledAll,
  write,
}: {
  readonly eventStore: EventStore;
  readonly memory: Memory;
  readonly settledAll: () => Promise<void>;
  readonly write: <T>(job: () => Promise<T>) => Promise<T>;
}): Pick<LocalLog, "adoptPeer" | "claim" | "reload"> => ({
  adoptPeer: async (change) => {
    await settledAll();
    if (
      change.kind === "events" &&
      isCopyOf(memory.snapshot(), change) &&
      // Written by a tab that holds the same copy: shown as they are (class 259). Events this
      // copy's base cannot take (the other tab loaded the source for them) are read from the disk.
      canShow(memory, unknownOf(memory, change.events))
    ) {
      return;
    }
    const current = await eventStore.readSnapshot();
    if (change.copyToken !== undefined && !isCopyOf(current, change)) {
      return;
    }
    const held = memory.snapshot()?.owner ?? null;
    if (held !== null && held !== current.owner) {
      return;
    }
    // Payloads are hints. The atomic persisted snapshot is the only authoritative source.
    replaceSnapshot(memory, current);
  },
  claim: async (mark) => {
    await write(async () => {
      await eventStore.setOwner(mark);
      const snapshot = await eventStore.readSnapshot();
      if (snapshot.owner !== mark) {
        throw new SyncError(COPY_CHANGED);
      }
      replaceSnapshot(memory, snapshot);
    });
  },
  reload: async () => {
    // A write in flight lands (or is taken back) first, or the reload would drop what it shows.
    await settledAll();
    const snapshot = await eventStore.readSnapshot();
    assertHeldOwner(memory, snapshot.owner);
    replaceSnapshot(memory, snapshot);
  },
});

/**
The raw log in memory (corrections included) and its two steps for a local write: integrate (the
state shows the events at once, before any disk) and write (the local store, one write after
another, in the order integrated). A refused write forgets its events and rebuilds the state from
what is left, through the fold, so what arrived meanwhile (a later action, the server's events)
stays. The server's events come the other way round: the store commits them first, and the log
shows what it answered (`applyLegacyPage`, `install`).
*/
export const createLocalLog = <S>(
  eventStore: EventStore,
  store: StoreApi<S>,
  fold: Fold<S>,
): LocalLog => {
  const memory = createMemory(store, fold);
  const { settledAll, write } = createWrites();
  /** Bumped by `clear`: a write handed over before it is not made any more. */
  let copy = 0;
  const context: Context = { copy: () => copy, eventStore, memory, write };
  return {
    invalidate: () => {
      copy += 1;
    },
    settled: settledAll,
    snapshot: memory.snapshot,
    ...persistenceControls({ eventStore, memory, settledAll, write }),
    ...committed(memory),
    clear: async (ifOwner) => {
      copy += 1;
      memory.replace([], emptyHeldCopy(memory.snapshot()));
      await write(async () => {
        await eventStore.clear(ifOwner);
        const current = await eventStore.readSnapshot();
        if (isClearedCopy(current)) {
          memory.replace([], current);
        }
      });
    },
    has: memory.has,
    persistLocal: persistLocalWith(context),
  };
};
