import type { StoreApi } from "zustand/vanilla";

import { type Event, isCorrection, shouldRematerialize } from "@pace/core";

import type { LocalSnapshot } from "./checkpoint-store-types.ts";
import type { Fold, LocalLog } from "./local-log-types.ts";
import type { StoreChange } from "./peer-tabs.ts";

import { idSet } from "./checkpoint-validation.ts";
import { COPY_CHANGED, SyncError } from "./sync-error.ts";

export const uniqueById = (events: readonly Event[]): readonly Event[] =>
  new Map(events.map((event) => [event.id, event])).values().toArray();

/**
The raw log in memory, the copy it belongs to and the state folded from it. Every change derives
the next state first and takes the events after: a fold that refuses (a checkpoint's base cannot
take a correction) throws its `SyncError` with the log and the state as they were.
*/
export type Memory = {
  readonly snapshot: () => LocalSnapshot | undefined;
  readonly known: ReadonlyMap<string, Event>;
  /** Local events the state shows whose write has not landed yet. */
  readonly unsaved: Set<string>;
  /** Shows events in the state: in order on top of it, or rebuilt when one comes before. */
  readonly integrate: (fresh: readonly Event[]) => void;
  /** Forgets events whose write was refused; the state is derived again from what is left. */
  readonly rollback: (ids: readonly string[]) => void;
  /** Replaces the whole log (a reload). */
  readonly replace: (all: readonly Event[], snapshot: LocalSnapshot) => void;
  /** Takes the copy's new meta; the log and the state stay as they are. */
  readonly retain: (snapshot: LocalSnapshot) => void;
  readonly has: (id: string) => boolean;
  /** Takes the server's copy of ids the log holds already, and derives the state again. */
  readonly adopt: (copies: readonly Event[]) => void;
};

const NO_IDS: readonly string[] = [];

const refreshCorrectionTargets = (targets: Set<string>, events: Iterable<Event>): void => {
  targets.clear();
  for (const event of events) {
    if (isCorrection(event)) {
      targets.add(event.payload.targetId);
    }
  }
};

const withEvents = (known: ReadonlyMap<string, Event>, events: readonly Event[]) => {
  const next = new Map(known);
  for (const event of events) {
    next.set(event.id, event);
  }
  return next;
};

const takeEvents = (known: Map<string, Event>, events: Iterable<Event>): void => {
  for (const event of events) {
    known.set(event.id, event);
  }
};

const idsOf = (events: readonly Event[]): readonly string[] => events.map((event) => event.id);

const forget = (unsaved: Set<string>, ids: readonly string[]): void => {
  for (const id of ids) {
    unsaved.delete(id);
  }
};

/** Whether showing `fresh` needs a rebuild: one is a correction's target, or comes before the last. */
const isOutOfOrder = (
  fresh: readonly Event[],
  targets: ReadonlySet<string>,
  last: null | string,
): boolean => fresh.some((event) => targets.has(event.id) || shouldRematerialize(last, event));

export const createMemory = <S>(store: StoreApi<S>, fold: Fold<S>): Memory => {
  const known = new Map<string, Event>();
  const unsaved = new Set<string>();
  const correctionTargets = new Set<string>();
  let snapshot: LocalSnapshot | undefined;
  /**
  Derives the state of `next`, then takes `next` as the log. A refusal throws with nothing
  changed; a copy read from the store is taken anyway (`isStored`) and shown as unreadable.
  */
  const rebuildFrom = (
    next: ReadonlyMap<string, Event>,
    { copy = snapshot, isStored = false } = {},
  ): void => {
    const all = next.values().toArray();
    const rebuilt = fold.rebuild(store.getState(), all, copy);
    if (!isStored && !rebuilt.ok) {
      throw new SyncError(rebuilt.error);
    }
    const state = rebuilt.ok ? rebuilt.value : fold.unreadable(store.getState(), all);
    snapshot = copy;
    known.clear();
    takeEvents(known, next.values());
    refreshCorrectionTargets(correctionTargets, known.values());
    store.setState(state);
  };
  return {
    adopt: (copies) => {
      if (copies.length === 0) {
        return;
      }

      rebuildFrom(withEvents(known, copies));
      forget(unsaved, idsOf(copies));
    },
    integrate: (fresh) => {
      if (fresh.length === 0) {
        return;
      }
      const state = store.getState();
      if (isOutOfOrder(fresh, correctionTargets, fold.lastAppliedOccurredAt(state))) {
        rebuildFrom(withEvents(known, fresh));
        return;
      }
      const next = fold.applyInOrder(state, fresh);
      takeEvents(known, fresh);
      store.setState(next);
    },
    snapshot: () => snapshot,
    has: (id) => known.has(id) || idSet(snapshot?.checkpoint?.value.eventIds ?? NO_IDS).has(id),
    known,
    retain: (next) => {
      snapshot = next;
    },
    replace: (all, next) => {
      rebuildFrom(withEvents(new Map(), all), { copy: next, isStored: true });
      unsaved.clear();
    },
    rollback: (ids) => {
      const gone = new Set(ids);
      rebuildFrom(new Map(known.entries().filter(([id]) => !gone.has(id))));
      forget(unsaved, ids);
    },
    unsaved,
  };
};

export const replaceSnapshot = (memory: Memory, snapshot: LocalSnapshot): void => {
  memory.replace(
    snapshot.records.map((record) => record.event),
    snapshot,
  );
};

/** A copy another session claimed is never shown here (a reload from the disk refuses it too). */
export const assertHeldOwner = (memory: Memory, owner: null | string): void => {
  const held = memory.snapshot()?.owner;
  if (held !== undefined && held !== owner) {
    throw new SyncError(COPY_CHANGED);
  }
};

/** Whether another tab's change was made to the very copy `copy` (the one held, or the disk's). */
export const isCopyOf = (copy: LocalSnapshot | undefined, change: StoreChange): boolean =>
  copy !== undefined &&
  change.copyToken === copy.copyToken &&
  change.storeId === copy.storeId &&
  change.owner === copy.owner;

export const unknownOf = (memory: Memory, events: readonly Event[]): readonly Event[] =>
  uniqueById(events).filter((event) => !memory.known.has(event.id));

/** What the store just committed is shown from its own answer, never read back from the disk. */
export const committed = (memory: Memory): Pick<LocalLog, "applyLegacyPage" | "install"> => ({
  applyLegacyPage: ({ events, isReplaced, meta }) => {
    assertHeldOwner(memory, meta.owner);
    const snapshot: LocalSnapshot = { ...meta, checkpoint: null, records: [], pendingIds: [] };
    if (isReplaced) {
      memory.replace(events, snapshot);
      return;
    }
    memory.retain(snapshot);
    // The server's copy of a known id took the local one's place in the store: here as well.
    const copies = events.filter((event) => {
      const known = memory.known.get(event.id);
      return known !== undefined && JSON.stringify(known) !== JSON.stringify(event);
    });
    memory.integrate(unknownOf(memory, events));
    memory.adopt(copies);
  },
  install: (snapshot) => {
    assertHeldOwner(memory, snapshot.owner);
    replaceSnapshot(memory, snapshot);
  },
});
