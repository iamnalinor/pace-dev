import { createStore } from "zustand/vanilla";

import { err, ok, type Result } from "@pace/core";

import type { HistoryError } from "./history-types.ts";
import type { AppState, AppStateHandle, AppStateOptions as Options } from "./state-types.ts";

import { createLocalLog, createQueue } from "./local-log.ts";
import { createBatchClock, createPrepare, createStageEvents, externalChanges } from "./state-actions.ts";
import { createAnnounce, createCopyControls } from "./state-controls.ts";
import { createEventActions } from "./state-dispatch.ts";
import { FOLD, initialState } from "./state-fold.ts";

export { rootReducer } from "./state-fold.ts";
export type { AppState, AppStateHandle, DispatchInput } from "./state-types.ts";

export const createAppState = (options: Options): AppStateHandle => {
  const { deviceId, now } = options;
  const store = createStore<AppState>(() => initialState(deviceId));
  const log = createLocalLog(options.store, store, FOLD);
  const ready = log.reload();
  const enqueue = createQueue(ready);
  const announce = createAnnounce(options, log.snapshot);
  const prepare = createPrepare(options, createBatchClock(options.now));
  const stageEvents = createStageEvents(log, enqueue, {
    ...options,
    onStored: announce,
    current: store.getState,
  });
  const stage: AppStateHandle["stage"] = async (inputs, refusal) => {
    const prepared = prepare(inputs);
    return prepared.ok ? await stageEvents(prepared.value, refusal) : prepared;
  };
  let historyLoader = async (): Promise<Result<void, HistoryError>> => {
    await ready;
    return store.getState().historyCoverage === "full" ? ok(undefined) : err("history/not-loaded");
  };
  const ensureHistory = async (): Promise<Result<void, HistoryError>> => await historyLoader();

  return {
    ...externalChanges(log, enqueue, announce),
    ensureHistory,
    localCopy: log.snapshot,
    ...createCopyControls({ log, enqueue, store, announce }),
    setHistoryLoader: (load) => {
      historyLoader = load;
    },
    ...createEventActions({ stage, ready, ensureHistory, log, now, store, deviceId }),
    prepare,
    ready,
    stage,
    stageEvents,
    store,
  };
};
