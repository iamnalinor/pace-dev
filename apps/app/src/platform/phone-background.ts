import * as BackgroundTask from "expo-background-task";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

import {
  addMinutesIso,
  detectSleep,
  formatDuration,
  formatInZone,
  type Language,
  t,
} from "@pace/core";

import { type PhoneNotice, showNow } from "./notifications.ts";
import { calendarAccess, calendarEvents } from "./phone-calendar.ts";
import { readPhoneEvents } from "./phone-data.ts";
import {
  calendarKey,
  dismissedKeys,
  markNotified,
  notifiedKeys,
  seriesRules,
  sleepKey,
} from "./phone-memory.ts";

/** The task Android runs every half hour or so, with the app closed. */
export const PHONE_TASK = "pace.phone-check";

const INTERVAL_MINUTES = 30;
/** A night is looked for in the last 18 hours, and asked about until noon-ish (12 h after waking). */
const NIGHT_LOOKBACK_MINUTES = 18 * 60;
const SLEEP_FRESH_MINUTES = 12 * 60;
/** Calendar events that ended in the last three hours are asked about. */
const EVENT_FRESH_MINUTES = 3 * 60;

/** What a background run needs from the account: it has no store, so the app leaves it here. */
export type PhoneContext = { readonly language: Language; readonly zone: string };

const CONTEXT_KEY = "pace.phone.context";

const rememberPhoneContext = async (context: PhoneContext): Promise<void> => {
  await SecureStore.setItemAsync(CONTEXT_KEY, JSON.stringify(context));
};

const contextOf = async (): Promise<PhoneContext> => {
  const fallback: PhoneContext = {
    language: "en",
    zone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  try {
    const stored = await SecureStore.getItemAsync(CONTEXT_KEY);
    const parsed: unknown = stored === null ? null : JSON.parse(stored);
    return typeof parsed === "object" && parsed !== null && "language" in parsed && "zone" in parsed
      ? { ...fallback, ...(parsed as PhoneContext) }
      : fallback;
  } catch {
    return fallback;
  }
};

const clock = (at: string, zone: string): string => formatInZone(at, zone, "HH:mm");

const sleepNotices = async (now: string, { language, zone }: PhoneContext) => {
  const phone = await readPhoneEvents(addMinutesIso(now, -NIGHT_LOOKBACK_MINUTES), now);
  const sleep = phone.hasAccess ? detectSleep(phone.events, { now, zone }) : null;
  if (sleep === null || sleep.endAt < addMinutesIso(now, -SLEEP_FRESH_MINUTES)) {
    return [];
  }
  return [
    {
      body: t(language, "phone.notify.sleep", {
        duration: formatDuration(sleep.minutes, language),
        from: clock(sleep.startAt, zone),
        to: clock(sleep.endAt, zone),
      }),
      id: sleepKey(sleep),
      title: t(language, "phone.notify.sleepTitle"),
      url: "/day",
    },
  ];
};

const calendarNotices = async (now: string, { language, zone }: PhoneContext) => {
  if ((await calendarAccess()) !== "granted") {
    return [];
  }
  const since = addMinutesIso(now, -EVENT_FRESH_MINUTES);
  const rules = await seriesRules();
  const ruled = new Set(rules.map((rule) => rule.series));
  const events = await calendarEvents(addMinutesIso(since, -24 * 60), now);
  return events
    .filter((event) => event.endAt > since && event.endAt <= now)
    .filter((event) => event.series === null || !ruled.has(event.series))
    .map((event) => ({
      body: t(language, "phone.notify.event", {
        from: clock(event.startAt, zone),
        title: event.title,
        to: clock(event.endAt, zone),
      }),
      id: calendarKey(event),
      title: t(language, "phone.notify.eventTitle"),
      url: "/day",
    }));
};

/**
One background look at the phone: last night's sleep and the calendar events that just ended,
each asked about once (never what the person already waved away). Returns how many were shown.
*/
export const checkPhone = async (now: string): Promise<number> => {
  const context = await contextOf();
  const [dismissed, notified] = await Promise.all([dismissedKeys(), notifiedKeys()]);
  const candidates: readonly PhoneNotice[] = [
    ...(await sleepNotices(now, context)),
    ...(await calendarNotices(now, context)),
  ];
  const fresh = candidates.filter(
    (notice) => !dismissed.has(notice.id) && !notified.has(notice.id),
  );
  const shown = await showNow(fresh, context.language);
  if (shown > 0) {
    for (const notice of fresh) {
      await markNotified(notice.id);
    }
  }
  return shown;
};

// Defined when this module loads (the root layout imports it), as the task manager requires.
// eslint-disable-next-line unicorn/no-top-level-side-effects -- expo-task-manager needs the task defined at module load, before Android runs it
TaskManager.defineTask(PHONE_TASK, async () => {
  try {
    await checkPhone(new Date().toISOString());
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
Asks Android to run the check about every half hour (again later is harmless). Best effort:
a phone that refuses background work still has Day.
*/
export const startPhoneChecks = async (context: PhoneContext): Promise<void> => {
  try {
    await rememberPhoneContext(context);
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      return;
    }
    if (!(await TaskManager.isTaskRegisteredAsync(PHONE_TASK))) {
      await BackgroundTask.registerTaskAsync(PHONE_TASK, { minimumInterval: INTERVAL_MINUTES });
    }
  } catch {
    // Without background work the phone's data is still read when Day is open.
  }
};
