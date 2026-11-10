import { createStore, type StoreApi } from "zustand/vanilla";

import {
  apply,
  DEFAULT_SETTINGS,
  effectiveInOrder,
  err,
  type Event,
  type EventInput,
  foldEffective,
  INITIAL_PRESETS_STATE,
  INITIAL_PROJECTS_STATE,
  INITIAL_SERIES_STATE,
  INITIAL_TASKS_STATE,
  INITIAL_TIME_STATE,
  mergeEvents,
  newId,
  ok,
  parseEvent,
  presetReducer,
  type PresetsState,
  projectReducer,
  type ProjectsState,
  type Reducer,
  type Result,
  seriesReducer,
  type SeriesState,
  type Settings,
  settingsReducer,
  sortEvents,
  taskReducer,
  type TasksState,
  timeReducer,
  type TimeState,
} from "@pace/core";

import type { EventStore } from "./event-store.ts";
import type { StoreChange } from "./peer-tabs.ts";

import {
  createLocalLog,
  createQueue,
  type Fold,
  type LocalLog,
  type Persisted,
  type Staged,
} from "./local-log.ts";
import { createRevocations } from "./revocations.ts";

/**
The whole client state: the materialized slices (the same four as the core's `CoreState`,
so every query reads it as is) plus the log and bookkeeping.
*/
export type AppState = {
  readonly status: "loading" | "ready";
  /** Effective events (corrections applied) in canonical order. */
  readonly events: readonly Event[];
  /** Every event in the store, corrections included, in canonical order: what history shows. */
  readonly log: readonly Event[];
  readonly tasks: TasksState;
  readonly projects: ProjectsState;
  readonly presets: PresetsState;
  readonly settings: Settings;
  readonly time: TimeState;
  readonly series: SeriesState;
  readonly deviceId: string;
  readonly lastAppliedOccurredAt: null | string;
  /** Bumps on every change; cheap way for view-models to memoize. */
  readonly version: number;
};

/** Materialized slices, each folded by its core reducer. */
type SliceKey = "presets" | "projects" | "series" | "settings" | "tasks" | "time";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What callers dispatch: the store fills `id`, `recordedAt`, `deviceId`, `source`, `precision`. */
export type DispatchInput = DistributiveOmit<EventInput, "precision" | "source"> & {
  readonly precision?: Event["precision"];
  readonly source?: Event["source"];
};

export type AppStateHandle = {
  readonly store: StoreApi<AppState>;
  /** Resolves once the persisted log is loaded and materialized. */
  readonly ready: Promise<void>;
  /**
  Validates every input, then shows them all in the state at once and writes them to the local
  store in one go, answering as soon as the state shows them (or with the first refusal, before
  anything is shown). `persisted` settles with the write: refused, the events leave the state.
  */
  readonly stage: (inputs: readonly DispatchInput[]) => Promise<Result<Staged, string>>;
  /** One event, staged; answers once its local write landed (`persist_failed` when refused). */
  readonly dispatch: (input: DispatchInput) => Promise<Result<Event, string>>;
  /**
  Remote events: known ids are skipped, the rest applied at once and written as synced; rejects
  (and takes them back) when the local store refuses them.
  */
  readonly ingest: (events: readonly Event[]) => Promise<void>;
  /** Revokes one event; `action/nothing-to-do` when it is revoked already (review M2). */
  readonly revoke: (eventId: string) => Promise<Result<Event, string>>;
  /**
  Revokes several events as one action: the revocations share their instants and are staged and
  written in one go, or none is (one refused, one revoked already: nothing is written).
  */
  readonly revokeAll: (eventIds: readonly string[]) => Promise<Result<readonly Event[], string>>;
  /** Revokes the latest effective event recorded by this device. */
  readonly undoLast: () => Promise<Result<Event, string>>;
  /** Full rebuild from the event store (after another writer touched it). */
  readonly rematerialize: () => Promise<void>;
  /**
  What another tab of this profile put into the store both share: its events are taken in
  without writing them again, a dropped copy is read again. Nothing is told on (no echo).
  */
  readonly adoptPeerChange: (change: StoreChange) => Promise<void>;
  /**
  Drops the local copy: the log, its outbox, the cursor and the store id go, through the write
  queue (a write still waiting is never made), and the state is empty. With `ifOwner`, the store
  keeps a copy another session of a shared store claimed since (`EventStore.clear`).
  */
  readonly clear: (ifOwner?: string) => Promise<void>;
  /** Marks the copy as a session's, in the write queue after any clear asked for before it. */
  readonly claim: (mark: string) => Promise<void>;
  /**
  Which local copy is current, bumped the moment `clear` is called (before its turn in the
  queue): a server page asked for one copy is never written into the next (fix round 1 of QA 22).
  */
  readonly copy: () => number;
};

const slice =
  <K extends SliceKey>(key: K, reduce: Reducer<AppState[K]>): Reducer<AppState> =>
  (state, event) => {
    const next = reduce(state[key], event);
    return next === state[key] ? state : { ...state, [key]: next };
  };

const composeReducers =
  (reducers: readonly Reducer<AppState>[]): Reducer<AppState> =>
  (state, event) => {
    let next = state;
    for (const reduce of reducers) {
      next = reduce(next, event);
    }
    return next;
  };

/** One entry per materialized slice, applied in order. */
export const rootReducer: Reducer<AppState> = composeReducers([
  slice("tasks", taskReducer),
  slice("projects", projectReducer),
  slice("presets", presetReducer),
  slice("settings", settingsReducer),
  slice("time", timeReducer),
  slice("series", seriesReducer),
]);

const initialState = (deviceId: string): AppState => ({
  deviceId,
  events: [],
  lastAppliedOccurredAt: null,
  log: [],
  presets: INITIAL_PRESETS_STATE,
  projects: INITIAL_PROJECTS_STATE,
  settings: DEFAULT_SETTINGS,
  status: "loading",
  tasks: INITIAL_TASKS_STATE,
  time: INITIAL_TIME_STATE,
  series: INITIAL_SERIES_STATE,
  version: 0,
});

const rebuild = (state: AppState, all: readonly Event[]): AppState => {
  const base: AppState = {
    ...initialState(state.deviceId),
    status: "ready",
    version: state.version + 1,
  };
  // Derived once: the fold and the state's `events` share it (class 55).
  const events = effectiveInOrder(all);
  return {
    ...foldEffective(events, rootReducer, base),
    events,
    lastAppliedOccurredAt: events.at(-1)?.occurredAt ?? null,
    log: sortEvents(all),
  };
};

/**
Incremental path: every event is in order and none is a correction. The fresh events are merged
into the sorted `events` and `log`, never sorted with them again (class 55).
*/
const applyInOrder = (state: AppState, fresh: readonly Event[]): AppState => {
  const sorted = sortEvents(fresh);
  let folded = state;
  for (const event of sorted) {
    folded = apply(folded, event, rootReducer);
  }
  return {
    ...folded,
    events: mergeEvents(state.events, sorted),
    lastAppliedOccurredAt: sorted.at(-1)?.occurredAt ?? state.lastAppliedOccurredAt,
    log: mergeEvents(state.log, sorted),
    version: state.version + 1,
  };
};

const latestOwn = (events: readonly Event[], deviceId: string): Event | undefined =>
  events
    .filter((event) => event.deviceId === deviceId)
    .toSorted((a, b) => `${b.recordedAt}${b.id}`.localeCompare(`${a.recordedAt}${a.id}`))
    .at(0);

/** Fills what the caller left out: the store owns the envelope. */
const envelope = (
  input: DispatchInput,
  defaults: { readonly deviceId: string; readonly now: () => string; readonly source: string },
): unknown => ({
  precision: "exact",
  source: defaults.source,
  ...input,
  deviceId: input.deviceId ?? defaults.deviceId,
  id: input.id ?? newId(),
  recordedAt: input.recordedAt ?? defaults.now(),
});

/**
Changes from outside this tab's own writes (the server, another tab, another writer); the other
tabs hear only what this state itself put into the store.
*/
const externalChanges = (
  log: LocalLog,
  enqueue: ReturnType<typeof createQueue>,
  onStored: ((change: StoreChange) => void) | undefined,
): Pick<AppStateHandle, "adoptPeerChange" | "ingest" | "rematerialize"> => ({
  adoptPeerChange: async (change) => {
    await enqueue(async () => {
      if (change.kind === "reload") {
        await log.reload();
      } else {
        log.adopt(change.events);
      }
    });
  },
  ingest: async (events) => {
    const { persisted } = await enqueue(() => ({ persisted: log.persistRemote(events) }));
    const written = await persisted;
    if (!written.ok) {
      throw new Error(written.error);
    }
    if (written.value.length > 0) {
      onStored?.({ events: written.value, kind: "events" });
    }
  },
  rematerialize: async () => {
    await enqueue(log.reload);
    onStored?.({ kind: "reload" });
  },
});

type Options = {
  readonly deviceId: string;
  readonly now: () => string;
  readonly source: "app" | "web";
  readonly store: EventStore;
  /** Told after each event written here (the sync sends it within a second). */
  readonly onLocal?: () => void;
  /** Told of every change this state made to the store (for the other tabs that share it). */
  readonly onStored?: (change: StoreChange) => void;
};

const FOLD: Fold<AppState> = {
  applyInOrder,
  lastAppliedOccurredAt: (state) => state.lastAppliedOccurredAt,
  rebuild,
};

/**
Tells the other tabs and the sync once the write landed: only what is on the disk can be adopted
by a tab sharing the store, or sent.
*/
const announced = async (persisted: Persisted, options: Options): Persisted => {
  const written = await persisted;
  if (written.ok) {
    options.onStored?.({ events: written.value, kind: "events" });
    options.onLocal?.();
  }
  return written;
};

/** Validates every input (a refusal shows nothing), then shows them all and starts their write. */
const createStage =
  (
    log: LocalLog,
    enqueue: ReturnType<typeof createQueue>,
    options: Options,
  ): AppStateHandle["stage"] =>
  async (inputs) =>
    await enqueue(() => {
      const events: Event[] = [];
      const ids = new Set<string>();
      for (const input of inputs) {
        const parsed = parseEvent(envelope(input, options));
        if (!parsed.ok) {
          return parsed;
        }
        const { id } = parsed.value;
        if (ids.has(id) || log.has(id)) {
          return err("event/duplicate");
        }
        ids.add(id);
        events.push(parsed.value);
      }
      // Not awaited here: the next action integrates while this write is on its way.
      return ok({ events, persisted: announced(log.persistLocal(events), options) });
    });

export const createAppState = (options: Options): AppStateHandle => {
  const { deviceId, now } = options;
  const store = createStore<AppState>(() => initialState(deviceId));
  const log = createLocalLog(options.store, store, FOLD);
  let copies = 0;
  const ready = log.reload();
  const enqueue = createQueue(ready);
  const stage = createStage(log, enqueue, options);

  const dispatch: AppStateHandle["dispatch"] = async (input) => {
    const staged = await stage([input]);
    if (!staged.ok) {
      return staged;
    }
    const written = await staged.value.persisted;
    const [event] = staged.value.events;
    return event !== undefined && written.ok ? ok(event) : err("persist_failed");
  };

  const { revoke, revokeAll } = createRevocations({
    hasEvent: (eventId) => log.has(eventId),
    log: () => store.getState().log,
    now,
    ready,
    stage,
  });

  return {
    ...externalChanges(log, enqueue, options.onStored),
    clear: async (ifOwner) => {
      copies += 1;
      await enqueue(async () => {
        await log.clear(ifOwner);
      });
      // The other tabs share the store that was just emptied: they read it again.
      options.onStored?.({ kind: "reload" });
    },
    claim: async (mark) => {
      await enqueue(async () => {
        await log.claim(mark);
      });
    },
    copy: () => copies,
    dispatch,
    ready,
    revoke,
    revokeAll,
    stage,
    store,
    undoLast: async () => {
      await ready;
      const target = latestOwn(store.getState().events, deviceId);
      return target === undefined ? err("undo/nothing") : await revoke(target.id);
    },
  };
};
