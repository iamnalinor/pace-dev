import { err, isValidTimeZone, type Language } from "@pace/core";

import { type ActionDeps, type ActionResult, emit, stamp } from "./deps.ts";

export type QuietHours = { readonly from: string; readonly to: string };

export type SettingsActions = {
  readonly setLanguage: (language: Language) => ActionResult;
  readonly setTimezone: (timezone: string) => ActionResult;
  /** `HH:MM` on the account's zone. */
  readonly setDigestWindows: (digestWindows: readonly string[]) => ActionResult;
  readonly setQuietHours: (quietHours: QuietHours) => ActionResult;
};

export const settingsActions = (deps: ActionDeps): SettingsActions => ({
  setDigestWindows: async (digestWindows) =>
    await emit(deps, [
      stamp(deps, { type: "settings.updated", payload: { digestWindows: [...digestWindows] } }),
    ]),
  setLanguage: async (language) =>
    await emit(deps, [stamp(deps, { type: "settings.updated", payload: { language } })]),
  setQuietHours: async (quietHours) =>
    await emit(deps, [
      stamp(deps, { type: "settings.updated", payload: { quietHours: { ...quietHours } } }),
    ]),
  setTimezone: async (timezone) =>
    isValidTimeZone(timezone)
      ? await emit(deps, [stamp(deps, { type: "settings.updated", payload: { timezone } })])
      : err("action/invalid-input"),
});
