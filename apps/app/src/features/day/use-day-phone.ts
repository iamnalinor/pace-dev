import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import type { DayModel } from "@pace/client";

import {
  calendarAccess,
  type CalendarAccess,
  calendarEvents,
  type PhoneCalendarEvent,
  requestCalendarAccess,
} from "#app/platform/phone-calendar.ts";
import { appLabels, readPhoneEvents } from "#app/platform/phone-data.ts";
import {
  calendarKey,
  dismissedKeys,
  markNotified,
  dismiss as rememberDismissed,
  type SeriesRule,
  seriesRules,
  setSeriesRule,
  sleepKey,
} from "#app/platform/phone-memory.ts";
import {
  addDaysIn,
  addMinutesIso,
  type AppMinutes,
  appUsage,
  detectSleep,
  type PhoneEvent,
  phonePickupAt,
  type SleepCandidate,
} from "@pace/core";

/** The night before the day belongs to it: phone events are read from noon the day before. */
const NIGHT_LOOKBACK_MINUTES = 12 * 60;

/** An app's time inside a block: its package id (for the messenger penalty) and its name. */
export type NamedApp = AppMinutes & { readonly name: string };

export type DayPhone = {
  readonly hasUsageAccess: boolean;
  /** Last night's sleep as the screen tells it, unless logged or waved away. */
  readonly sleep: null | SleepCandidate;
  readonly calendar: {
    readonly access: CalendarAccess;
    /** The day's events, minus skipped ones and series the person always skips. */
    readonly events: readonly PhoneCalendarEvent[];
    /** Ended events of a series marked "always attended": logged without asking. */
    readonly autoLog: readonly PhoneCalendarEvent[];
  };
  /** Phone time inside a block, by app, largest first. */
  readonly usageIn: (startAt: string, endAt: string) => readonly NamedApp[];
  /** When the phone was picked up for the session going on now (`null` on another day). */
  readonly pickupAt: null | string;
  readonly askCalendar: () => void;
  readonly dismiss: (key: string) => void;
  /** Logged from Day: the background check need not ask about it any more. */
  readonly answered: (key: string) => void;
  /** "Every time" for a repeating event's series. */
  readonly remember: (rule: SeriesRule) => void;
};

type Loaded = {
  readonly hasUsageAccess: boolean;
  readonly events: readonly PhoneEvent[];
  readonly labels: Readonly<Record<string, string>>;
  readonly dismissed: ReadonlySet<string>;
  readonly access: CalendarAccess;
  readonly calendar: readonly PhoneCalendarEvent[];
  readonly rules: readonly SeriesRule[];
};

const EMPTY: Loaded = {
  access: "undetermined",
  calendar: [],
  dismissed: new Set(),
  events: [],
  hasUsageAccess: false,
  labels: {},
  rules: [],
};

const load = async (day: Pick<DayModel, "date" | "zone">, now: string): Promise<Loaded> => {
  const dayEnd = addDaysIn(day.date, 1, day.zone);
  const until = dayEnd > now ? now : dayEnd;
  const phone = await readPhoneEvents(addMinutesIso(day.date, -NIGHT_LOOKBACK_MINUTES), until);
  const apps = [
    ...new Set(
      phone.events.map((event) => event.app).filter((app): app is string => app !== undefined),
    ),
  ];
  const access = await calendarAccess();
  return {
    access,
    calendar: access === "granted" ? await calendarEvents(day.date, dayEnd) : [],
    dismissed: await dismissedKeys(),
    events: phone.events,
    hasUsageAccess: phone.hasAccess,
    labels: await appLabels(apps),
    rules: await seriesRules(),
  };
};

/** The event is on the day already: a block with its title over its time. */
export const isCalendarLogged = (
  entries: DayModel["entries"],
  event: Pick<PhoneCalendarEvent, "endAt" | "startAt" | "title">,
): boolean =>
  entries.some(
    (entry) =>
      entry.kind === "activity" &&
      entry.row.label === event.title &&
      entry.row.startAt < event.endAt &&
      entry.row.endAt > event.startAt,
  );

const ruleOf = (loaded: Loaded, event: PhoneCalendarEvent): null | SeriesRule["rule"] =>
  event.series === null
    ? null
    : (loaded.rules.find((rule) => rule.series === event.series)?.rule ?? null);

/** The sleep candidate this day shows: it ends inside the day, nobody logged or dismissed it. */
const sleepOf = (day: DayModel, loaded: Loaded, now: string): null | SleepCandidate => {
  const dayEnd = addDaysIn(day.date, 1, day.zone);
  const sleep = detectSleep(loaded.events, { now: dayEnd > now ? now : dayEnd, zone: day.zone });
  if (sleep === null || sleep.endAt < day.date || loaded.dismissed.has(sleepKey(sleep))) {
    return null;
  }
  const isLogged = day.entries.some(
    (entry) =>
      entry.kind === "activity" &&
      entry.row.category === "sleep" &&
      entry.row.startAt < sleep.endAt &&
      entry.row.endAt > sleep.startAt,
  );
  return isLogged ? null : sleep;
};

const named = (
  rows: readonly AppMinutes[],
  labels: Readonly<Record<string, string>>,
): readonly NamedApp[] => rows.map((row) => ({ ...row, name: labels[row.app] ?? row.app }));

/**
The phone's side of a day, read on the device: last night's sleep, time in apps during each
block, and the calendar's events. Reloads when the app comes back (after granting access).
*/
export const useDayPhone = (day: DayModel, now: string): DayPhone => {
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const { date, zone } = day;
  // A new day or the minute tick is what changes the answer.
  const reload = useCallback(() => {
    void (async () => {
      setLoaded(await load({ date, zone }, now));
    })();
  }, [date, zone, now]);
  useEffect(() => {
    reload();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        reload();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [reload]);
  const remember = (rule: SeriesRule): void => {
    void (async () => {
      await setSeriesRule(rule);
      reload();
    })();
  };
  const shown = loaded.calendar.filter(
    (event) => !loaded.dismissed.has(calendarKey(event)) && ruleOf(loaded, event) !== "skip",
  );
  return {
    answered: (key) => {
      void markNotified(key);
    },
    askCalendar: () => {
      void (async () => {
        await requestCalendarAccess();
        reload();
      })();
    },
    calendar: {
      access: loaded.access,
      autoLog: shown.filter(
        (event) =>
          ruleOf(loaded, event) === "attended" &&
          event.endAt <= now &&
          !isCalendarLogged(day.entries, event),
      ),
      events: shown,
    },
    dismiss: (key) => {
      void (async () => {
        await rememberDismissed(key);
        reload();
      })();
    },
    hasUsageAccess: loaded.hasUsageAccess,
    pickupAt: day.isToday ? phonePickupAt(loaded.events, now) : null,
    remember,
    sleep: sleepOf(day, loaded, now),
    usageIn: (startAt, endAt) =>
      named(appUsage(loaded.events, { from: startAt, now, to: endAt }), loaded.labels),
  };
};
