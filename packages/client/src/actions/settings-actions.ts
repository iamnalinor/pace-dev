import {
  type ActivityCategory,
  err,
  isValidTimeZone,
  type Language,
  type NotificationChannel,
  type NotificationKind,
  ok,
} from "@pace/core";

import {
  type ActionDeps,
  type ActionResult,
  emit,
  serially,
  type StagedResult,
  stageEmit,
  stamp,
} from "./deps.ts";

export type QuietHours = { readonly from: string; readonly to: string };

export type SettingsActions = {
  readonly setLanguage: (language: Language) => ActionResult;
  readonly setTimezone: (timezone: string) => ActionResult;
  /**
  Gives an account without a zone the device's one. Call it after the first sync of a
  session, so a zone chosen on another device wins; a no-op once a zone is set.
  */
  readonly ensureTimezone: () => ActionResult;
  /** `HH:MM` on the account's zone. */
  readonly setDigestWindows: (digestWindows: readonly string[]) => ActionResult;
  /**
  One digest time by its row, on the list as it stands when the write runs, not as a screen last
  drew it: a row gone meanwhile (its ✕ pressed while its field still held a typed time) writes
  nothing (review of the QA 27 wave, I1).
  */
  readonly setDigestTime: (index: number, time: string) => ActionResult;
  /** Removes the row that holds `time`; nothing when it is gone already (a second press). */
  readonly removeDigestTime: (index: number, time: string) => ActionResult;
  readonly setQuietHours: (quietHours: QuietHours) => ActionResult;
  /** Week from midnight to midnight (on), or from seven (off). */
  readonly setNightHours: (isOn: boolean) => ActionResult;
  readonly setCategoryEstimate: (
    category: ActivityCategory,
    minutes: null | number,
  ) => ActionResult;
  /** Turns one kind of notification on or off for one channel. */
  readonly setNotificationChannel: (
    kind: NotificationKind,
    channel: NotificationChannel,
    isOn: boolean,
  ) => ActionResult;
};

/** An action that found nothing to write: answered, with no events. */
const nothingStaged = (): StagedResult => ok({ events: [], persisted: Promise.resolve(ok([])) });

/**
Writes the digest list `change` makes of the current one, inside the action queue so a write
queued before it is seen (class 222); `null` from `change` writes nothing.
*/
const changeDigest = async (
  deps: ActionDeps,
  change: (current: readonly string[]) => null | readonly string[],
): ActionResult =>
  await serially(deps, async () => {
    const next = change(deps.state.store.getState().settings.digestWindows);
    return next === null
      ? nothingStaged()
      : await stageEmit(deps, [
          stamp(deps, { type: "settings.updated", payload: { digestWindows: [...next] } }),
        ]);
  });

export const settingsActions = (deps: ActionDeps): SettingsActions => ({
  setCategoryEstimate: async (category, minutes) =>
    await emit(deps, [
      stamp(deps, {
        type: "settings.updated",
        payload: { categoryEstimates: { [category]: minutes } },
      }),
    ]),
  // The system's own setting, not the person's act: History lists it with no Undo (PR55-1-11).
  ensureTimezone: async () =>
    deps.state.store.getState().settings.timezone === null && isValidTimeZone(deps.clock.deviceTz)
      ? await emit(deps, [
          {
            ...stamp(deps, {
              type: "settings.updated",
              payload: { timezone: deps.clock.deviceTz },
            }),
            source: "system",
          },
        ])
      : ok([]),
  setDigestWindows: async (digestWindows) =>
    await emit(deps, [
      stamp(deps, { type: "settings.updated", payload: { digestWindows: [...digestWindows] } }),
    ]),
  setDigestTime: async (index, time) =>
    await changeDigest(deps, (current) =>
      index >= current.length || current[index] === time ? null : current.with(index, time),
    ),
  removeDigestTime: async (index, time) =>
    await changeDigest(deps, (current) =>
      current[index] === time ? current.filter((_, position) => position !== index) : null,
    ),
  setLanguage: async (language) =>
    await emit(deps, [stamp(deps, { type: "settings.updated", payload: { language } })]),
  setNightHours: async (isOn) =>
    await emit(deps, [stamp(deps, { type: "settings.updated", payload: { nightHours: isOn } })]),
  setNotificationChannel: async (kind, channel, isOn) =>
    await emit(deps, [
      stamp(deps, {
        type: "settings.updated",
        payload: { notificationChannels: { [kind]: { [channel]: isOn } } },
      }),
    ]),
  setQuietHours: async (quietHours) =>
    await emit(deps, [
      stamp(deps, { type: "settings.updated", payload: { quietHours: { ...quietHours } } }),
    ]),
  setTimezone: async (timezone) =>
    isValidTimeZone(timezone)
      ? await emit(deps, [stamp(deps, { type: "settings.updated", payload: { timezone } })])
      : err("action/invalid-input"),
});
