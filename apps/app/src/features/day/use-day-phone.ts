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
import { dismissedKeys, dismiss as rememberDismissed } from "#app/platform/phone-memory.ts";
import {
  addDaysIn,
  addMinutesIso,
  type AppMinutes,
  appUsage,
  detectSleep,
  type PhoneEvent,
  type SleepCandidate,
} from "@pace/core";

/** The night before the day belongs to it: phone events are read from noon the day before. */
const NIGHT_LOOKBACK_MINUTES = 12 * 60;

export type NamedApp = { readonly name: string; readonly minutes: number };

export type DayPhone = {
  readonly hasUsageAccess: boolean;
  /** Last night's sleep as the screen tells it, unless logged or waved away. */
  readonly sleep: null | SleepCandidate;
  readonly calendar: {
    readonly access: CalendarAccess;
    readonly events: readonly PhoneCalendarEvent[];
  };
  /** Phone time inside a block, by app, largest first. */
  readonly usageIn: (startAt: string, endAt: string) => readonly NamedApp[];
  readonly askCalendar: () => void;
  readonly dismiss: (key: string) => void;
};

type Loaded = {
  readonly hasUsageAccess: boolean;
  readonly events: readonly PhoneEvent[];
  readonly labels: Readonly<Record<string, string>>;
  readonly dismissed: ReadonlySet<string>;
  readonly access: CalendarAccess;
  readonly calendar: readonly PhoneCalendarEvent[];
};

const EMPTY: Loaded = {
  access: "undetermined",
  calendar: [],
  dismissed: new Set(),
  events: [],
  hasUsageAccess: false,
  labels: {},
};

export const sleepKey = (sleep: SleepCandidate): string => `sleep@${sleep.startAt}`;
export const calendarKey = (event: PhoneCalendarEvent): string =>
  `calendar@${event.id}@${event.startAt}`;

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
  };
};

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
): readonly NamedApp[] =>
  rows.map((row) => ({ minutes: row.minutes, name: labels[row.app] ?? row.app }));

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
  return {
    askCalendar: () => {
      void (async () => {
        await requestCalendarAccess();
        reload();
      })();
    },
    calendar: {
      access: loaded.access,
      events: loaded.calendar.filter((event) => !loaded.dismissed.has(calendarKey(event))),
    },
    dismiss: (key) => {
      void (async () => {
        await rememberDismissed(key);
        reload();
      })();
    },
    hasUsageAccess: loaded.hasUsageAccess,
    sleep: sleepOf(day, loaded, now),
    usageIn: (startAt, endAt) =>
      named(appUsage(loaded.events, { from: startAt, now, to: endAt }), loaded.labels),
  };
};
