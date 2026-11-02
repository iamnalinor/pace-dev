import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { usePace } from "#app/app-state.tsx";
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
  dismiss as rememberDismissed,
  type SeriesRule,
  seriesRules,
  setSeriesRule,
  usePhoneMemoryVersion,
} from "#app/platform/phone-memory.ts";
import { useFeed } from "#app/shared/notifications/use-feed.ts";
import { activityLabel, type DayModel, eventAnswers } from "@pace/client";
import {
  addDaysIn,
  addMinutesIso,
  type AppMinutes,
  appUsage,
  calendarEventKey,
  type PhoneEvent,
  phonePickupAt,
} from "@pace/core";

/** The night before the day belongs to it: phone events are read from noon the day before. */
const NIGHT_LOOKBACK_MINUTES = 12 * 60;

/** An app's time inside a block: its package id (for the messenger penalty) and its name. */
export type NamedApp = AppMinutes & { readonly name: string };

export type DayPhone = {
  readonly hasUsageAccess: boolean;
  readonly calendar: {
    readonly access: CalendarAccess;
    /**
    The day's events, minus ones skipped here or on any other channel (the notification pool)
    and series the person always skips.
    */
    readonly events: readonly PhoneCalendarEvent[];
    /** Attended on another channel (Telegram, the web, a phone notification): nothing to ask. */
    readonly isAttendedElsewhere: (event: PhoneCalendarEvent) => boolean;
    /** Ended events of a series marked "always attended": logged without asking. */
    readonly autoLog: readonly PhoneCalendarEvent[];
  };
  /** Phone time inside a block, by app, largest first. */
  readonly usageIn: (startAt: string, endAt: string) => readonly NamedApp[];
  /** When the phone was picked up for the session going on now (`null` on another day). */
  readonly pickupAt: null | string;
  readonly askCalendar: () => void;
  /**
  Skips one occurrence on every channel, then here, as Now's Skip does; `false` (and still shown)
  when the server did not take it.
  */
  readonly skip: (event: PhoneCalendarEvent) => Promise<boolean>;
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
      entry.row.label === activityLabel(event.title) &&
      entry.row.startAt < event.endAt &&
      entry.row.endAt > event.startAt,
  );

const ruleOf = (loaded: Loaded, event: PhoneCalendarEvent): null | SeriesRule["rule"] =>
  event.series === null
    ? null
    : (loaded.rules.find((rule) => rule.series === event.series)?.rule ?? null);

const named = (
  rows: readonly AppMinutes[],
  labels: Readonly<Record<string, string>>,
): readonly NamedApp[] => rows.map((row) => ({ ...row, name: labels[row.app] ?? row.app }));

/**
Answers kept on the phone (a series rule, a dismissed event): shown at once, then written to the
phone's storage (slow on Android, bug-lessons 57); the reload after it reads back what was kept.
*/
const phoneAnswers = (
  setLoaded: (change: (current: Loaded) => Loaded) => void,
  reload: () => void,
): { readonly remember: (rule: SeriesRule) => void; readonly dismiss: (key: string) => void } => {
  const keep = (write: () => Promise<void>): void => {
    void (async () => {
      try {
        await write();
      } finally {
        reload();
      }
    })();
  };
  return {
    dismiss: (key) => {
      setLoaded((current) => ({ ...current, dismissed: new Set([...current.dismissed, key]) }));
      keep(async () => {
        await rememberDismissed(key);
      });
    },
    remember: (rule) => {
      setLoaded((current) => ({
        ...current,
        rules: [...current.rules.filter((each) => each.series !== rule.series), rule],
      }));
      keep(async () => {
        await setSeriesRule(rule);
      });
    },
  };
};

/**
The phone's side of a day, read on the device: time in apps during each block and the calendar's
events (the night's sleep is recorded on the server from the uses the phone sends). Reloads when the app comes back (after granting access).
*/
export const useDayPhone = (day: DayModel, now: string): DayPhone => {
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const { notifications } = usePace();
  const { items } = useFeed();
  const answers = useMemo(() => eventAnswers(items), [items]);
  const { date, zone } = day;
  // A new day, the minute tick or a change to what the phone remembers changes the answer.
  const memory = usePhoneMemoryVersion();
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
  }, [reload, memory]);
  const shown = loaded.calendar.filter(
    (event) =>
      !loaded.dismissed.has(calendarKey(event)) &&
      ruleOf(loaded, event) !== "skip" &&
      answers.get(calendarEventKey(event)) !== "skipped",
  );
  const { dismiss, remember } = phoneAnswers(setLoaded, reload);
  return {
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
      isAttendedElsewhere: (event) => answers.get(calendarEventKey(event)) === "attended",
    },
    hasUsageAccess: loaded.hasUsageAccess,
    pickupAt: day.isToday ? phonePickupAt(loaded.events, now) : null,
    remember,
    skip: async (event) => {
      // Hidden only once the server took it: a skip that did not go through stays to tap again.
      const isSkipped = await notifications.skipEvent(calendarEventKey(event));
      if (isSkipped) {
        dismiss(calendarKey(event));
      }
      return isSkipped;
    },
    usageIn: (startAt, endAt) =>
      named(appUsage(loaded.events, { from: startAt, now, to: endAt }), loaded.labels),
  };
};
