import type { StoreApi } from "zustand/vanilla";

import { err, type Event, isCorrection, ok, shouldRematerialize } from "@pace/core";

import type { LocalSnapshot } from "./checkpoint-store-types.ts";
import type { EventStore } from "./event-store.ts";
import type { Fold, LocalLog } from "./local-log-types.ts";

import { emptyHeldCopy, isClearedCopy } from "./local-copy.ts";

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

const uniqueById = (events: readonly Event[]): readonly Event[] =>
  new Map(events.map((event) => [event.id, event])).values().toArray();

type Memory = {
  readonly snapshot: () => LocalSnapshot | undefined;
  readonly known: Map<string, Event>;
  /** Local events the state shows whose write has not landed yet. */
  readonly unsaved: Set<string>;
  /** Shows events in the state: in order on top of it, or rebuilt when one comes before. */
  readonly integrate: (fresh: readonly Event[]) => void;
  /** Forgets events whose write was refused; the state is derived again from what is left. */
  readonly rollback: (ids: readonly string[]) => void;
  /** Replaces the whole log (a reload). */
  readonly replace: (all: readonly Event[], snapshot: LocalSnapshot) => void;
  readonly has: (id: string) => boolean;
  /** Takes the server's copy of ids the log holds already, and derives the state again. */
  readonly adopt: (copies: readonly Event[]) => void;
};

const refreshCorrectionTargets = (targets: Set<string>, events: Iterable<Event>): void => {
  targets.clear();
  for (const event of events) {
    if (isCorrection(event)) {
      targets.add(event.payload.targetId);
    }
  }
};

const createMemory = <S>(store: StoreApi<S>, fold: Fold<S>): Memory => {
  const known = new Map<string, Event>();
  const unsaved = new Set<string>();
  const correctionTargets = new Set<string>();
  let snapshot: LocalSnapshot | undefined;
  const rebuildAll = (): void => {
    refreshCorrectionTargets(correctionTargets, known.values());
    store.setState(fold.rebuild(store.getState(), known.values().toArray(), snapshot));
  };
  return {
    adopt: (copies) => {
      if (copies.length === 0) {
        return;
      }
      for (const copy of copies) {
        known.set(copy.id, copy);
        unsaved.delete(copy.id);
      }
      rebuildAll();
    },
    integrate: (fresh) => {
      if (fresh.length === 0) {
        return;
      }
      for (const event of fresh) {
        known.set(event.id, event);
      }
      const state = store.getState();
      const last = fold.lastAppliedOccurredAt(state);
      const isNeedsRebuild = fresh.some(
        (event) => correctionTargets.has(event.id) || shouldRematerialize(last, event),
      );
      if (isNeedsRebuild) {
        rebuildAll();
      } else {
        store.setState(fold.applyInOrder(state, fresh));
      }
    },
    snapshot: () => snapshot,
    has: (id) => known.has(id) || (snapshot?.checkpoint?.value.eventIds.includes(id) ?? false),
    known,
    replace: (all, next) => {
      snapshot = next;
      known.clear();
      unsaved.clear();
      for (const event of all) {
        known.set(event.id, event);
      }
      rebuildAll();
    },
    rollback: (ids) => {
      for (const id of ids) {
        known.delete(id);
        unsaved.delete(id);
      }
      rebuildAll();
    },
    unsaved,
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

/** What the two write paths share. */
type Context = {
  readonly eventStore: EventStore;
  readonly memory: Memory;
  readonly write: <T>(job: () => Promise<T>) => Promise<T>;
  /** Which local copy is current: `clear` starts a new one. */
  readonly copy: () => number;
  /** Ids the server's copy took over whose own local write was refused: not on the disk. */
  readonly notOnDisk: Set<string>;
};

const persistLocalWith =
  ({ copy, eventStore, memory, notOnDisk, write }: Context): LocalLog["persistLocal"] =>
  async (events) => {
    const ofCopy = copy();
    const guard = memory.snapshot();
    if (guard === undefined) {
      return err("persist_failed");
    }
    memory.integrate(events);
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
        // A copy the server sent meanwhile (a deterministic id) stays: it is not this write's,
        // but it is not on the disk either.
        const ids = events.map((event) => event.id);
        const mine = ids.filter((id) => memory.unsaved.has(id));
        const adopted = ids.filter((id) => !memory.unsaved.has(id) && memory.known.has(id));
        for (const id of adopted) {
          notOnDisk.add(id);
        }
        memory.rollback(mine);
        return err("persist_failed");
      }
      for (const event of events) {
        memory.unsaved.delete(event.id);
      }
      return ok(events);
    });
  };

const persistRemoteWith =
  ({ copy, eventStore, memory, notOnDisk, write }: Context): LocalLog["persistRemote"] =>
  async (events) => {
    const ofCopy = copy();
    const guard = memory.snapshot();
    if (guard === undefined) {
      return err("persist_failed");
    }
    const unique = uniqueById(events);
    const fresh = unique.filter((event) => !memory.known.has(event.id));
    // An id whose local write is still in flight is the server's now: its copy is kept,
    // written and marked synced.
    const adopted = unique.filter((event) => memory.unsaved.has(event.id));
    const batch = [...fresh, ...adopted];
    if (batch.length === 0) {
      return ok([]);
    }
    memory.integrate(fresh);
    memory.adopt(adopted);
    return await write(async () => {
      if (ofCopy !== copy()) {
        return err("persist_failed");
      }
      const ids = batch.map((event) => event.id);
      try {
        await eventStore.append(batch, guard);
        await eventStore.markSynced(ids, guard);
      } catch (error) {
        // Not stored, so not kept (the cursor did not move, the next pull brings them again);
        // an adopted id whose own local write landed is on the disk and stays.
        memory.rollback([
          ...fresh.map((event) => event.id),
          ...adopted.map((event) => event.id).filter((id) => notOnDisk.has(id)),
        ]);
        // The store's own words go on to the sync's status ("The quota has been exceeded."):
        // a bare `persist_failed` there says nothing a person could act on (bug-lessons 99).
        throw error;
      }
      for (const id of ids) {
        notOnDisk.delete(id);
      }
      return ok(batch);
    });
  };

const replaceSnapshot = (memory: Memory, snapshot: LocalSnapshot): void => {
  memory.replace(
    snapshot.records.map((record) => record.event),
    snapshot,
  );
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
    const current = await eventStore.readSnapshot();
    if (
      change.copyToken !== undefined &&
      (change.copyToken !== current.copyToken ||
        change.storeId !== current.storeId ||
        change.owner !== current.owner)
    ) {
      return;
    }
    const previous = memory.snapshot();
    if (
      previous?.owner !== null &&
      previous?.owner !== undefined &&
      previous.owner !== current.owner
    ) {
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
        throw new Error("sync/copy-changed");
      }
      replaceSnapshot(memory, snapshot);
    });
  },
  reload: async () => {
    // A write in flight lands (or is taken back) first, or the reload would drop what it shows.
    await settledAll();
    const owner = memory.snapshot()?.owner;
    const snapshot = await eventStore.readSnapshot();
    if (owner !== undefined && owner !== snapshot.owner) {
      throw new Error("sync/copy-changed");
    }
    replaceSnapshot(memory, snapshot);
  },
});

/**
The raw log in memory (corrections included) and its two steps: integrate (the state shows the
events at once, before any disk) and write (the local store, one write after another, in the
order integrated). A refused write forgets its events and rebuilds the state from what is left,
through the fold, so what arrived meanwhile (a later action, the server's events) stays.
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
  const notOnDisk = new Set<string>();
  const context: Context = { copy: () => copy, eventStore, memory, notOnDisk, write };
  return {
    invalidate: () => {
      copy += 1;
    },
    settled: settledAll,
    snapshot: memory.snapshot,
    ...persistenceControls({ eventStore, memory, settledAll, write }),
    adopt: (events) => {
      memory.integrate(uniqueById(events).filter((event) => !memory.known.has(event.id)));
    },
    clear: async (ifOwner) => {
      copy += 1;
      notOnDisk.clear();
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
    persistRemote: persistRemoteWith(context),
  };
};
