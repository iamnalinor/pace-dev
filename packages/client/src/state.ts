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
  type Settings,
  settingsReducer,
  shouldRematerialize,
  sortEvents,
  taskReducer,
  type TasksState,
  timeReducer,
  type TimeState,
} from "@pace/core";

import type { EventStore } from "./event-store.ts";

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
  readonly deviceId: string;
  readonly lastAppliedOccurredAt: null | string;
  /** Bumps on every change; cheap way for view-models to memoize. */
  readonly version: number;
};

/** Materialized slices, each folded by its core reducer. */
type SliceKey = "presets" | "projects" | "settings" | "tasks" | "time";

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
  readonly dispatch: (input: DispatchInput) => Promise<Result<Event, string>>;
  /** Remote events: known ids are skipped, the rest persisted as synced and applied. */
  readonly ingest: (events: readonly Event[]) => Promise<void>;
  readonly revoke: (eventId: string) => Promise<Result<Event, string>>;
  /** Revokes the latest effective event recorded by this device. */
  readonly undoLast: () => Promise<Result<Event, string>>;
  /** Full rebuild from the event store (after another writer touched it). */
  readonly rematerialize: () => Promise<void>;
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

const uniqueById = (events: readonly Event[]): readonly Event[] =>
  new Map(events.map((event) => [event.id, event])).values().toArray();

/** Serializes mutations so persist-then-apply never interleaves. */
const createQueue = (first: Promise<void>): (<T>(job: () => Promise<T>) => Promise<T>) => {
  let tail: Promise<unknown> = first;
  return async (job) => {
    const previous = tail;
    const next = (async () => {
      try {
        await previous;
      } catch {
        // A failed job must not block the ones after it; its caller saw the error.
      }
      return await job();
    })();
    tail = next;
    return await next;
  };
};

/** The raw log in memory (corrections included) plus the persist-then-apply steps. */
const createLog = (
  eventStore: EventStore,
  store: StoreApi<AppState>,
): {
  readonly has: (id: string) => boolean;
  readonly persistLocal: (event: Event) => Promise<void>;
  readonly persistRemote: (events: readonly Event[]) => Promise<void>;
  readonly reload: () => Promise<void>;
} => {
  const known = new Map<string, Event>();

  const integrate = (fresh: readonly Event[]): void => {
    for (const event of fresh) {
      known.set(event.id, event);
    }
    const state = store.getState();
    const isNeedsRebuild = fresh.some((event) =>
      shouldRematerialize(state.lastAppliedOccurredAt, event),
    );
    store.setState(
      isNeedsRebuild ? rebuild(state, known.values().toArray()) : applyInOrder(state, fresh),
    );
  };

  return {
    has: (id) => known.has(id),
    persistLocal: async (event) => {
      await eventStore.append([event]);
      integrate([event]);
    },
    persistRemote: async (events) => {
      const fresh = uniqueById(events).filter((event) => !known.has(event.id));
      if (fresh.length === 0) {
        return;
      }
      await eventStore.append(fresh);
      await eventStore.markSynced(fresh.map((event) => event.id));
      integrate(fresh);
    },
    reload: async () => {
      const all = await eventStore.listAll();
      known.clear();
      for (const event of all) {
        known.set(event.id, event);
      }
      store.setState(rebuild(store.getState(), all));
    },
  };
};

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

export const createAppState = (options: {
  readonly deviceId: string;
  readonly now: () => string;
  readonly source: "app" | "web";
  readonly store: EventStore;
}): AppStateHandle => {
  const { deviceId, now } = options;
  const store = createStore<AppState>(() => initialState(deviceId));
  const log = createLog(options.store, store);
  const ready = log.reload();
  const enqueue = createQueue(ready);

  const dispatch: AppStateHandle["dispatch"] = async (input) =>
    await enqueue(async () => {
      const parsed = parseEvent(envelope(input, options));
      if (!parsed.ok) {
        return parsed;
      }
      if (log.has(parsed.value.id)) {
        return err("event/duplicate");
      }
      await log.persistLocal(parsed.value);
      return ok(parsed.value);
    });

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
    dispatch,
    ingest: async (events) => {
      await enqueue(async () => {
        await log.persistRemote(events);
      });
    },
    ready,
    rematerialize: async () => {
      await enqueue(log.reload);
    },
    revoke,
    store,
    undoLast: async () => {
      await ready;
      const target = latestOwn(store.getState().events, deviceId);
      return target === undefined ? err("undo/nothing") : await revoke(target.id);
    },
  };
};
