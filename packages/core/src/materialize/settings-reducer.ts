import type { Settings } from "../model/settings.ts";
import type { Reducer } from "./materializer.ts";

import { patchChannels } from "../model/notification-channels.ts";

const patchEstimates = (
  previous: Settings["categoryEstimates"],
  patch: Readonly<Partial<Record<keyof Settings["categoryEstimates"], null | number>>>,
): Settings["categoryEstimates"] =>
  Object.fromEntries(
    Object.entries({ ...previous, ...patch }).filter(([, value]) => value !== null),
  );

/** Folds `settings.updated` patches; every other event leaves the state untouched. */
export const settingsReducer: Reducer<Settings> = (state, event) => {
  if (event.type !== "settings.updated") {
    return state;
  }
  const {
    categoryEstimates,
    digestWindows,
    language,
    nightHours,
    notificationChannels,
    quietHours,
    timezone,
  } = event.payload;
  return {
    language: language ?? state.language,
    timezone: timezone ?? state.timezone,
    digestWindows: digestWindows ?? state.digestWindows,
    quietHours: quietHours ?? state.quietHours,
    nightHours: nightHours ?? state.nightHours,
    categoryEstimates:
      categoryEstimates === undefined
        ? state.categoryEstimates
        : patchEstimates(state.categoryEstimates, categoryEstimates),
    notificationChannels:
      notificationChannels === undefined
        ? state.notificationChannels
        : patchChannels(state.notificationChannels, notificationChannels),
  };
};
