import { createStore, type StoreApi } from "zustand/vanilla";

import {
  apply,
  DEFAULT_SETTINGS,
  effectiveEvents,
  err,
  type Event,
  type EventInput,
  INITIAL_PRESETS_STATE,
  INITIAL_PROJECTS_STATE,
  INITIAL_SERIES_STATE,
  INITIAL_TASKS_STATE,
  INITIAL_TIME_STATE,
  materialize,
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

import {
  createLocalLog,
  createQueue,
  type Fold,
  type LocalLog,
  type Persisted,
  type Staged,
} from "./local-log.ts";

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
  readonly revoke: (eventId: string) => Promise<Result<Event, string>>;
  /** Revokes the latest effective event recorded by this device. */
  readonly undoLast: () => Promise<Result<Event, string>>;
  /** Full rebuild from the event store (after another writer touched it). */
  readonly rematerialize: () => Promise<void>;
  /**
  Drops the local copy: the log, its outbox, the cursor and the store id go, through the write
  queue (a write still waiting is never made), and the state is empty.
  */
  readonly clear: () => Promise<void>;
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
  const events = sortEvents(effectiveEvents(all));
  return {
    ...materialize(all, rootReducer, base),
    events,
    lastAppliedOccurredAt: events.at(-1)?.occurredAt ?? null,
    log: sortEvents(all),
  };
};

/** Incremental path: every event is in order and none is a correction. */
const applyInOrder = (state: AppState, fresh: readonly Event[]): AppState => {
  const sorted = sortEvents(fresh);
  let folded = state;
  for (const event of sorted) {
    folded = apply(folded, event, rootReducer);
  }
  return {
    ...folded,
    events: sortEvents([...state.events, ...sorted]),
    lastAppliedOccurredAt: sorted.at(-1)?.occurredAt ?? state.lastAppliedOccurredAt,
    log: sortEvents([...state.log, ...sorted]),
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

type Options = {
  readonly deviceId: string;
  readonly now: () => string;
  readonly source: "app" | "web";
  readonly store: EventStore;
  /** Told after each event written here (the sync sends it within a second). */
  readonly onLocal?: () => void;
};

const FOLD: Fold<AppState> = {
  applyInOrder,
  lastAppliedOccurredAt: (state) => state.lastAppliedOccurredAt,
  rebuild,
};

/** Tells the sync once the write landed: only what is on the disk can be sent. */
const announced = async (persisted: Persisted, onLocal: (() => void) | undefined): Persisted => {
  const written = await persisted;
  if (written.ok) {
    onLocal?.();
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
      return ok({ events, persisted: announced(log.persistLocal(events), options.onLocal) });
    });

export const createAppState = (options: Options): AppStateHandle => {
  const { deviceId, now } = options;
  const store = createStore<AppState>(() => initialState(deviceId));
  const log = createLocalLog(options.store, store, FOLD);
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

  const revoke: AppStateHandle["revoke"] = async (eventId) => {
    await ready;
    if (!log.has(eventId)) {
      return err("event/not-found");
    }
    return await dispatch({
      occurredAt: now(),
      payload: { targetId: eventId },
      type: "event.revoked",
    });
  };

  return {
    clear: async () => {
      await enqueue(log.clear);
    },
    dispatch,
    ingest: async (events) => {
      const { persisted } = await enqueue(() => ({ persisted: log.persistRemote(events) }));
      const written = await persisted;
      if (!written.ok) {
        throw new Error(written.error);
      }
    },
    ready,
    rematerialize: async () => {
      await enqueue(log.reload);
    },
    revoke,
    stage,
    store,
    undoLast: async () => {
      await ready;
      const target = latestOwn(store.getState().events, deviceId);
      return target === undefined ? err("undo/nothing") : await revoke(target.id);
    },
  };
};
