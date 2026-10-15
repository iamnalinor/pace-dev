import * as SecureStore from "expo-secure-store";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { SleepCandidate } from "@pace/core";

import type { PhoneCalendarEvent } from "./phone-calendar.ts";

import { readSessionValue, writeSessionValue } from "./session-value.ts";

/**
Counts the changes to what this phone remembers (a dismissal, a series answered for good, one
forgotten). Each screen that reads it (Now's offer, Day, Settings → Permissions) reads it again
when the count moves: a tab stays mounted while another screen changes it (bug class 8).
*/
const changes = createStore<{ readonly version: number }>(() => ({ version: 0 }));

const changed = (): void => {
  changes.setState(({ version }) => ({ version: version + 1 }));
};

/** The change count of the phone's memory: a dependency of every effect that reads it. */
export const usePhoneMemoryVersion = (): number => useStore(changes, (state) => state.version);

/** Only recent choices matter; older ones are dropped. */
const KEEP = 200;

const readJson = async (key: string): Promise<unknown> => {
  try {
    const stored = await SecureStore.getItemAsync(key);
    return stored === null ? null : (JSON.parse(stored) as unknown);
  } catch {
    return null;
  }
};

/** A capped list of keys kept on this phone. */
const keyList = (storeKey: string) => {
  const load = async (): Promise<readonly string[]> => {
    const parsed = await readJson(storeKey);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  };
  return {
    add: async (key: string): Promise<void> => {
      const current = await load();
      await SecureStore.setItemAsync(
        storeKey,
        JSON.stringify([...current.filter((item) => item !== key), key].slice(-KEEP)),
      );
      changed();
    },
    all: async (): Promise<ReadonlySet<string>> => new Set(await load()),
  };
};

/** The key a sleep guess is remembered by (dismissed, asked about). */
export const sleepKey = (sleep: Pick<SleepCandidate, "startAt">): string =>
  `sleep@${sleep.startAt}`;

/** The key one occurrence of a calendar event is remembered by. */
export const calendarKey = (event: Pick<PhoneCalendarEvent, "id" | "startAt">): string =>
  `calendar@${event.id}@${event.startAt}`;

/** What the person waved away on this phone: a sleep stretch, a calendar event. */
const dismissed = keyList("pace.phone.dismissed");

export const dismissedKeys = dismissed.all;
export const dismiss = dismissed.add;

/** "Every time" for a repeating calendar event: log it as attended, or never show it. */
export type SeriesRule = {
  readonly series: string;
  readonly title: string;
  readonly rule: "attended" | "skip";
};

const RULES_KEY = "pace.phone.rules";

const isRule = (value: unknown): value is SeriesRule =>
  typeof value === "object" &&
  value !== null &&
  "series" in value &&
  typeof value.series === "string" &&
  "title" in value &&
  typeof value.title === "string" &&
  "rule" in value &&
  (value.rule === "attended" || value.rule === "skip");

export const seriesRules = async (): Promise<readonly SeriesRule[]> => {
  const parsed = await readJson(RULES_KEY);
  return Array.isArray(parsed) ? parsed.filter((item) => isRule(item)) : [];
};

const saveRules = async (rules: readonly SeriesRule[]): Promise<void> => {
  await SecureStore.setItemAsync(RULES_KEY, JSON.stringify(rules));
  changed();
};

export const setSeriesRule = async (rule: SeriesRule): Promise<void> => {
  const current = await seriesRules();
  await saveRules([...current.filter((item) => item.series !== rule.series), rule]);
};

export const removeSeriesRule = async (series: string): Promise<void> => {
  const current = await seriesRules();
  await saveRules(current.filter((item) => item.series !== series));
};

const CALENDAR_SYNC_KEY = "pace.phone.calendarSync";

/** Whether this phone sends its calendar to Pace (on until turned off in Settings). */
export const isCalendarSyncOn = async (): Promise<boolean> =>
  (await readJson(CALENDAR_SYNC_KEY)) !== false;

export const setCalendarSync = async (isOn: boolean): Promise<void> => {
  await SecureStore.setItemAsync(CALENDAR_SYNC_KEY, JSON.stringify(isOn));
};

const USAGE_CURSOR_KEY = "pace.phone.usageCursor";

/** Where the next usage upload starts: the start of the last session sent (it may have grown). */
export const usageCursor = async (session: string): Promise<null | string> => {
  const value = await readSessionValue(USAGE_CURSOR_KEY, session);
  return typeof value === "string" ? value : null;
};

export const setUsageCursor = async (
  session: string,
  at: string,
  isCurrentSession: () => boolean,
): Promise<void> => {
  await writeSessionValue({ key: USAGE_CURSOR_KEY, session, value: at, isCurrentSession });
};
