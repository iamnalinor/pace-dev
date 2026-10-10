import {
  calendarAccess,
  type CalendarAccess,
  calendarEvents,
  type PhoneCalendarEvent,
} from "#app/platform/phone-calendar.ts";
import { calendarKey } from "#app/platform/phone-memory.ts";
import { type Activity, addDaysIn, addMinutesIso, startOfDayIn } from "@pace/core";

export type CalendarToday = {
  readonly access: CalendarAccess;
  /** Today's events going on or still to come, the person's own or accepted. */
  readonly events: readonly PhoneCalendarEvent[];
};

/** What "From calendar" can start: today's events from now on, read on the phone. */
export const calendarToday = async (now: string, zone: string): Promise<CalendarToday> => {
  const access = await calendarAccess();
  if (access !== "granted") {
    return { access, events: [] };
  }
  const from = startOfDayIn(now, zone);
  const events = await calendarEvents(from, addDaysIn(from, 1, zone));
  return { access, events: events.filter((event) => event.endAt > now) };
};

/** The event going on at `now`, if any. */
export const eventOnNow = (
  events: readonly PhoneCalendarEvent[],
  now: string,
): null | PhoneCalendarEvent =>
  events.find((event) => event.startAt <= now && now < event.endAt) ?? null;

/** How long before its start an event is offered on Now. */
const AHEAD_MINUTES = 10;

export type PromptMemory = {
  /** Occurrences waved away on this phone (`calendarKey`). */
  readonly dismissed: ReadonlySet<string>;
  /** Series answered "every time": logged or hidden without asking. */
  readonly ruled: ReadonlySet<string>;
  readonly activities: readonly Pick<Activity, "endAt" | "label" | "startAt">[];
};

/** Something under the event's title is tracked from its offer on: it was attended already. */
const isTracked = (event: PhoneCalendarEvent, activities: PromptMemory["activities"]): boolean =>
  activities.some(
    (activity) =>
      activity.label === event.title &&
      activity.startAt >= addMinutesIso(event.startAt, -AHEAD_MINUTES) &&
      activity.startAt < event.endAt,
  );

/**
The event Now asks "Attend or skip?" about: starting within ten minutes or going on, not
waved away, not answered for its whole series, not tracked yet; the earliest first.
*/
export const promptedEvent = (
  events: readonly PhoneCalendarEvent[],
  now: string,
  memory: PromptMemory,
): null | PhoneCalendarEvent =>
  events
    .filter((event) => addMinutesIso(event.startAt, -AHEAD_MINUTES) <= now && now < event.endAt)
    .filter((event) => !memory.dismissed.has(calendarKey(event)))
    .filter((event) => event.series === null || !memory.ruled.has(event.series))
    .filter((event) => !isTracked(event, memory.activities))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt))
    .at(0) ?? null;
