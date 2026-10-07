import type { Settings } from "../model/settings.ts";
import type { Reducer } from "./materializer.ts";

/** Folds `settings.updated` patches; every other event leaves the state untouched. */
export const settingsReducer: Reducer<Settings> = (state, event) => {
  if (event.type !== "settings.updated") {
    return state;
  }
  const { digestWindows, language, quietHours, timezone } = event.payload;
  return {
    language: language ?? state.language,
    timezone: timezone ?? state.timezone,
    digestWindows: digestWindows ?? state.digestWindows,
    quietHours: quietHours ?? state.quietHours,
  };
};
