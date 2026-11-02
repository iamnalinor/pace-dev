import type { StoreApi } from "zustand/vanilla";

import { err, type Event, ok, type Result, shouldRematerialize } from "@pace/core";

import type { EventStore } from "./event-store.ts";

/** Why a write the state already shows was taken back: the local store refused it. */
export type PersistError = "persist_failed";

/** The outcome of one write to the local store, once it settles. */
export type Persisted = Promise<Result<readonly Event[], PersistError>>;

/**
Events the state shows already, and their write to the local store. A refused write takes them
out of the state again (rebuilt from the rest of the log) and answers `persist_failed`.
*/
export type Staged = {
  readonly events: readonly Event[];
  readonly persisted: Persisted;
};

/** How the state folds events: in order on top of itself, or rebuilt from the whole log. */
export type Fold<S> = {
  readonly applyInOrder: (state: S, fresh: readonly Event[]) => S;
  readonly rebuild: (state: S, all: readonly Event[]) => S;
  readonly lastAppliedOccurredAt: (state: S) => null | string;
};

export type LocalLog = {
  readonly has: (id: string) => boolean;
  /** Shows the events at once, then writes them; a refused write takes them back. */
  readonly persistLocal: (events: readonly Event[]) => Persisted;
  /** The same for the server's events (unknown ids only), written as synced. */
  readonly persistRemote: (events: readonly Event[]) => Persisted;
  /** Reads the whole log from the store again, once the writes in flight have settled. */
  readonly reload: () => Promise<void>;
  /**
  Drops the local copy (sign-out, another server, a reset store): the state is empty at once, and
  the store is cleared in the write queue, after the write in flight; a write still waiting
  behind it is never made.
  */
  readonly clear: () => Promise<void>;
};

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
  readonly known: Map<string, Event>;
  /** Local events the state shows whose write has not landed yet. */
  readonly unsaved: Set<string>;
  /** Shows events in the state: in order on top of it, or rebuilt when one comes before. */
  readonly integrate: (fresh: readonly Event[]) => void;
  /** Forgets events whose write was refused; the state is derived again from what is left. */
  readonly rollback: (ids: readonly string[]) => void;
  /** Replaces the whole log (a reload). */
  readonly replace: (all: readonly Event[]) => void;
  /** Takes the server's copy of ids the log holds already, and derives the state again. */
  readonly adopt: (copies: readonly Event[]) => void;
};

const createMemory = <S>(store: StoreApi<S>, fold: Fold<S>): Memory => {
  const known = new Map<string, Event>();
  const unsaved = new Set<string>();
  const rebuildAll = (): void => {
    store.setState(fold.rebuild(store.getState(), known.values().toArray()));
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
      const isNeedsRebuild = fresh.some((event) => shouldRematerialize(last, event));
      store.setState(
        isNeedsRebuild
          ? fold.rebuild(state, known.values().toArray())
          : fold.applyInOrder(state, fresh),
      );
    },
    known,
    replace: (all) => {
      known.clear();
      unsaved.clear();
      for (const event of all) {
        known.set(event.id, event);
      }
      store.setState(fold.rebuild(store.getState(), all));
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
        await eventStore.append(events);
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
        await eventStore.append(batch);
        await eventStore.markSynced(ids);
      } catch {
        // Not stored, so not kept (the cursor did not move, the next pull brings them again);
        // an adopted id whose own local write landed is on the disk and stays.
        memory.rollback([
          ...fresh.map((event) => event.id),
          ...adopted.map((event) => event.id).filter((id) => notOnDisk.has(id)),
        ]);
        return err("persist_failed");
      }
      for (const id of ids) {
        notOnDisk.delete(id);
      }
      return ok(batch);
    });
  };

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
    clear: async () => {
      copy += 1;
      notOnDisk.clear();
      memory.replace([]);
      await write(async () => {
        await eventStore.clear();
      });
    },
    has: (id) => memory.known.has(id),
    persistLocal: persistLocalWith(context),
    persistRemote: persistRemoteWith(context),
    reload: async () => {
      // A write in flight lands (or is taken back) first, or the reload would drop what it shows.
      await settledAll();
      memory.replace(await eventStore.listAll());
    },
  };
};
