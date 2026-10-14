import type { Settings } from "../model/settings.ts";
import type { Reducer } from "./materializer.ts";

import { patchChannels } from "../model/notification-channels.ts";

/** Folds `settings.updated` patches; every other event leaves the state untouched. */
export const settingsReducer: Reducer<Settings> = (state, event) => {
  if (event.type !== "settings.updated") {
    return state;
  }
  const { digestWindows, language, nightHours, notificationChannels, quietHours, timezone } =
    event.payload;
  return {
    language: language ?? state.language,
    timezone: timezone ?? state.timezone,
    digestWindows: digestWindows ?? state.digestWindows,
    quietHours: quietHours ?? state.quietHours,
    nightHours: nightHours ?? state.nightHours,
    notificationChannels:
      notificationChannels === undefined
        ? state.notificationChannels
        : patchChannels(state.notificationChannels, notificationChannels),
  };
};
