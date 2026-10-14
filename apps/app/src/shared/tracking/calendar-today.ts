import type { CalendarAccess, PhoneCalendarEvent } from "#app/platform/phone-calendar.ts";

import { calendarKey } from "#app/platform/phone-memory.ts";
import { type ApiClient, CALENDAR_LEAD_MINUTES, isCalendarRun } from "@pace/client";
import { type Activity, addMinutesIso } from "@pace/core";

/** Where today's calendar is read from: the phone's own, or the copy it sends (on the web). */
export type CalendarSource = {
  readonly api: ApiClient;
  readonly now: string;
  readonly zone: string;
};

export type CalendarToday = {
  readonly access: CalendarAccess;
  /** Today's events going on or still to come, the person's own or accepted. */
  readonly events: readonly PhoneCalendarEvent[];
};

export type PromptMemory = {
  /** Occurrences waved away on this phone (`calendarKey`). */
  readonly dismissed: ReadonlySet<string>;
  /** Series answered "every time": logged or hidden without asking. */
  readonly ruled: ReadonlySet<string>;
  readonly activities: readonly Pick<Activity, "endAt" | "label" | "startAt">[];
};

/** One of its runs is on the ledger already (`isCalendarRun`): it was attended. */
const isTracked = (event: PhoneCalendarEvent, activities: PromptMemory["activities"]): boolean =>
  activities.some((activity) => isCalendarRun(event, activity));

/**
The event Now asks "Attend or skip?" about: starting within fifteen minutes or going on, not
waved away, not answered for its whole series, not tracked yet; the earliest first.
*/
export const promptedEvent = (
  events: readonly PhoneCalendarEvent[],
  now: string,
  memory: PromptMemory,
): null | PhoneCalendarEvent =>
  events
    .filter(
      (event) => addMinutesIso(event.startAt, -CALENDAR_LEAD_MINUTES) <= now && now < event.endAt,
    )
    .filter((event) => !memory.dismissed.has(calendarKey(event)))
    .filter((event) => event.series === null || !memory.ruled.has(event.series))
    .filter((event) => !isTracked(event, memory.activities))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt))
    .at(0) ?? null;

/**
Whether "Attend" makes sense for the event now: it started, or starts within fifteen minutes
(attending it before its start begins the activity now). An event hours away is only skipped.
*/
export const isAttendableNow = (event: Pick<PhoneCalendarEvent, "startAt">, now: string): boolean =>
  addMinutesIso(event.startAt, -CALENDAR_LEAD_MINUTES) <= now;

export type CalendarButtonState =
  | { readonly kind: "loading" }
  | { readonly kind: "noAccess" }
  | { readonly kind: "nothingNear" }
  | { readonly kind: "ready"; readonly events: readonly PhoneCalendarEvent[] };

/**
What the Calendar button can link an activity to now: the events starting, going on or just
over within fifteen minutes of now (earliest first), or why there is nothing to link.
*/
export const calendarButtonState = (
  today: CalendarToday | null,
  now: string,
): CalendarButtonState => {
  if (today === null) {
    return { kind: "loading" };
  }
  if (today.access !== "granted") {
    return { kind: "noAccess" };
  }
  const events = today.events
    .filter(
      (event) =>
        addMinutesIso(event.startAt, -CALENDAR_LEAD_MINUTES) <= now &&
        now <= addMinutesIso(event.endAt, CALENDAR_LEAD_MINUTES),
    )
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt));
  return events.length === 0 ? { kind: "nothingNear" } : { events, kind: "ready" };
};
