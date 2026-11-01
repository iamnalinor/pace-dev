import * as SecureStore from "expo-secure-store";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { SleepCandidate } from "@pace/core";

import type { PhoneCalendarEvent } from "./phone-calendar.ts";

import { createSecureSessionStore } from "./secure-session.ts";
import { readServer } from "./server.ts";
import { sessionHashOf } from "./session-fingerprint.ts";
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

/** A capped list of keys kept on this phone. */
const currentSession = async (): Promise<null | string> =>
  await createSecureSessionStore(await readServer()).get();

const privateKey = async (key: string, session: string): Promise<string> =>
  `${key}.${await sessionHashOf(session)}`;

const readPrivate = async (key: string, session: string): Promise<unknown> => {
  try {
    const stored = await SecureStore.getItemAsync(await privateKey(key, session));
    return stored === null || (await currentSession()) !== session
      ? null
      : (JSON.parse(stored) as unknown);
  } catch {
    return null;
  }
};

const writePrivate = async (key: string, session: string, value: unknown): Promise<void> => {
  if ((await currentSession()) !== session) {
    return;
  }

  await SecureStore.setItemAsync(await privateKey(key, session), JSON.stringify(value));
  changed();
};

const keyList = (storeKey: string) => {
  const load = async (session: string): Promise<readonly string[]> => {
    const parsed = await readPrivate(storeKey, session);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  };
  return {
    add: async (key: string): Promise<void> => {
      const session = await currentSession();
      if (session === null) {
        return;
      }
      const current = await load(session);
      await writePrivate(
        storeKey,
        session,
        [...current.filter((item) => item !== key), key].slice(-KEEP),
      );
    },
    all: async (): Promise<ReadonlySet<string>> => {
      const session = await currentSession();
      return new Set(session === null ? [] : await load(session));
    },
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
  const session = await currentSession();
  const parsed = session === null ? null : await readPrivate(RULES_KEY, session);
  return Array.isArray(parsed) ? parsed.filter((item) => isRule(item)) : [];
};

export const setSeriesRule = async (rule: SeriesRule): Promise<void> => {
  const session = await currentSession();
  if (session === null) {
    return;
  }
  const current = await seriesRules();
  await writePrivate(RULES_KEY, session, [
    ...current.filter((item) => item.series !== rule.series),
    rule,
  ]);
};

export const removeSeriesRule = async (series: string): Promise<void> => {
  const session = await currentSession();
  if (session === null) {
    return;
  }
  const current = await seriesRules();
  await writePrivate(
    RULES_KEY,
    session,
    current.filter((item) => item.series !== series),
  );
};

const CALENDAR_SYNC_KEY = "pace.phone.calendarSync";

/** Per-session calendar upload consent; a different login begins with it off. */
export const isCalendarSyncOn = async (session: string): Promise<boolean> =>
  (await readSessionValue(CALENDAR_SYNC_KEY, session)) === 1;

export const setCalendarSync = async (
  session: string,
  isOn: boolean,
  isCurrentSession: () => boolean,
): Promise<void> => {
  await writeSessionValue({
    isCurrentSession,
    key: CALENDAR_SYNC_KEY,
    session,
    value: isOn ? 1 : 0,
  });
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
