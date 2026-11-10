import {
  apply,
  type Checkpoint,
  DEFAULT_SETTINGS,
  effectiveInOrder,
  type Event,
  foldEffective,
  INITIAL_PRESETS_STATE,
  INITIAL_PROJECTS_STATE,
  INITIAL_SERIES_STATE,
  INITIAL_TASKS_STATE,
  INITIAL_TIME_STATE,
  mergeEvents,
  ok,
  presetReducer,
  projectReducer,
  type Reducer,
  replayCheckpoint,
  type Result,
  seriesReducer,
  settingsReducer,
  sortEvents,
  taskReducer,
  timeReducer,
} from "@pace/core";

import type { LocalSnapshot } from "./checkpoint-store-types.ts";
import type { Fold } from "./local-log.ts";
import type { AppState } from "./state-types.ts";

type SliceKey = "presets" | "projects" | "series" | "settings" | "tasks" | "time";

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

export const initialState = (deviceId: string): AppState => ({
  deviceId,
  historyCoverage: "full",
  checkpoint: null,
  knownEventIds: new Set(),
  history: { status: "idle" },
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

const missingBase = (state: AppState, all: readonly Event[]): AppState => ({
  ...state,
  status: "loading",
  checkpoint: null,
  historyCoverage: "checkpoint",
  history: { status: "failed", error: "history/unavailable" },
  log: sortEvents(all),
  events: [],
  knownEventIds: new Set(all.map((event) => event.id)),
  version: state.version + 1,
});
const checkpointState = (
  state: AppState,
  all: readonly Event[],
  checkpoint: Checkpoint,
): Result<AppState, string> => {
  const replay = replayCheckpoint(
    checkpoint,
    sortEvents(all).map((event, index) => ({ event, seq: checkpoint.coveredSeq + index + 1 })),
  );
  if (!replay.ok) {
    return replay;
  }
  return ok({
    ...state,
    ...replay.value.state,
    status: "ready",
    checkpoint,
    historyCoverage: "checkpoint",
    knownEventIds: new Set(replay.value.ids),
    events: effectiveInOrder(all),
    log: sortEvents(all),
    lastAppliedOccurredAt: replay.value.lastEffective?.occurredAt ?? null,
    version: state.version + 1,
  });
};

const fullState = (state: AppState, all: readonly Event[]): AppState => {
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
    historyCoverage: "full",
    knownEventIds: new Set(all.map((event) => event.id)),
    history: { status: "ready" },
    lastAppliedOccurredAt: events.at(-1)?.occurredAt ?? null,
    log: sortEvents(all),
  };
};
const rebuild = (
  state: AppState,
  all: readonly Event[],
  snapshot?: LocalSnapshot,
): Result<AppState, string> => {
  const checkpoint =
    snapshot === undefined ? state.checkpoint : (snapshot.checkpoint?.value ?? null);
  const coverage = snapshot?.coverage ?? state.historyCoverage;
  if (checkpoint === null && coverage === "checkpoint") {
    return ok(missingBase(state, all));
  }
  if (checkpoint !== null) {
    return checkpointState(state, all, checkpoint);
  }
  return ok(fullState(state, all));
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
    knownEventIds: new Set([...state.knownEventIds, ...fresh.map((event) => event.id)]),
    events: mergeEvents(state.events, sorted),
    lastAppliedOccurredAt: sorted.at(-1)?.occurredAt ?? state.lastAppliedOccurredAt,
    log: mergeEvents(state.log, sorted),
    version: state.version + 1,
  };
};

export const FOLD: Fold<AppState> = {
  applyInOrder,
  lastAppliedOccurredAt: (state) => state.lastAppliedOccurredAt,
  rebuild,
  unreadable: missingBase,
};
