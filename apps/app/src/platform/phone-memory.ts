import * as SecureStore from "expo-secure-store";

import type { SleepCandidate } from "@pace/core";

import type { PhoneCalendarEvent } from "./phone-calendar.ts";

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
/** What a background check already asked about, so it asks once. */
const notified = keyList("pace.phone.notified");

export const dismissedKeys = dismissed.all;
export const dismiss = dismissed.add;
export const notifiedKeys = notified.all;
export const markNotified = notified.add;

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
export const usageCursor = async (): Promise<null | string> => {
  const value = await readJson(USAGE_CURSOR_KEY);
  return typeof value === "string" ? value : null;
};

export const setUsageCursor = async (at: string): Promise<void> => {
  await SecureStore.setItemAsync(USAGE_CURSOR_KEY, JSON.stringify(at));
};
