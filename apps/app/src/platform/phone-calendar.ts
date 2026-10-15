import * as Calendar from "expo-calendar";

import { CALENDAR_LIMITS, type CalendarEvent } from "@pace/core";

import { type CalendarAttendee, isTakenEvent } from "./calendar-filter.ts";

/**
An event from the phone's calendars, in the shape its copy goes to Pace in (while "Send the
calendar" is on): `series` is the same calendar and title for every occurrence of a repeating
event, `null` for a one-off.
*/
export type PhoneCalendarEvent = CalendarEvent;

/** What the calendar tells about an event beyond its time, each only when it is there. */
type PhoneCalendarDetails = Omit<CalendarEvent, "endAt" | "id" | "series" | "startAt" | "title">;

export type CalendarAccess = "denied" | "granted" | "undetermined";

const accessOf = (status: string, canAskAgain: boolean): CalendarAccess => {
  if (status === "granted") {
    return "granted";
  }
  return canAskAgain ? "undetermined" : "denied";
};

export const calendarAccess = async (): Promise<CalendarAccess> => {
  const permission = await Calendar.getCalendarPermissions();
  return accessOf(permission.status, permission.canAskAgain);
};

export const requestCalendarAccess = async (): Promise<CalendarAccess> => {
  const permission = await Calendar.requestCalendarPermissions();
  return accessOf(permission.status, permission.canAskAgain);
};

type ListedEvent = Awaited<ReturnType<typeof Calendar.listEvents>>[number];

/** An attendee as read, with the name the organizer line shows when there is one. */
type Person = CalendarAttendee & { readonly name?: string | undefined };

/** The event's people; `null` when they cannot be read. */
const peopleOf = async (event: ListedEvent): Promise<null | readonly Person[]> => {
  try {
    return await event.getAttendees();
  } catch {
    return null;
  }
};

/** Whether the person takes part: their own event, or an invitation they accepted. */
const isTaken = (
  event: ListedEvent,
  people: null | readonly Person[],
  ownerAccount: string | undefined,
): boolean =>
  // The attendees cannot be read: the event stays, as it did before the filter.
  people === null ||
  isTakenEvent({ attendees: people, organizerEmail: event.organizerEmail, ownerAccount });

/** Trimmed and cut to `limit`; nothing when it is empty. */
const textOf = (value: null | string | undefined, limit: number): string | undefined => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed.slice(0, limit);
};

const isSameAddress = (a: string | undefined, b: string | undefined): boolean =>
  a !== undefined && a.trim().toLowerCase() === b?.trim().toLowerCase();

/** Who organised an invitation, by name when the calendar has one; nobody for one's own event. */
const organizerOf = (
  event: ListedEvent,
  people: readonly Person[],
  ownerAccount: string | undefined,
): string | undefined => {
  const email = event.organizerEmail;
  if (email === undefined || people.length === 0 || isSameAddress(email, ownerAccount)) {
    return undefined;
  }
  const named = people.find((person) => isSameAddress(person.email, email))?.name;
  return textOf(named ?? email, CALENDAR_LIMITS.name);
};

/** What the event's calendar tells: its name and the account it belongs to. */
type CalendarInfo = {
  readonly title?: string | undefined;
  readonly ownerAccount?: string | undefined;
};

/** The event's place, notes, link, calendar and people, each left out when the calendar has none. */
const detailsOf = (
  event: ListedEvent,
  people: null | readonly Person[],
  calendar: CalendarInfo,
): PhoneCalendarDetails => {
  const fields = {
    attendeeCount: people === null || people.length === 0 ? undefined : people.length,
    calendarName: textOf(calendar.title, CALENDAR_LIMITS.name),
    location: textOf(event.location, CALENDAR_LIMITS.location),
    notes: textOf(event.notes, CALENDAR_LIMITS.notes),
    organizer: organizerOf(event, people ?? [], calendar.ownerAccount),
    url: textOf(event.url, CALENDAR_LIMITS.url),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
};

/**
The timed events of every visible calendar overlapping [from, to) that the person takes part
in (see `isTakenEvent`), with what else the calendar tells about each; all-day ones are left
out (they are no stretch of the day to attend or log).
*/
export const calendarEvents = async (
  from: string,
  to: string,
): Promise<readonly PhoneCalendarEvent[]> => {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const visible = calendars.filter((calendar) => calendar.isVisible !== false);
  if (visible.length === 0) {
    return [];
  }
  const byId = new Map<string, CalendarInfo>(visible.map((calendar) => [calendar.id, calendar]));
  const listed = await Calendar.listEvents(
    visible.map((calendar) => calendar.id),
    new Date(from),
    new Date(to),
  );
  const timed = listed.filter((event) => !event.allDay);
  const people = await Promise.all(timed.map(async (event) => await peopleOf(event)));
  return timed
    .map((event, index) => ({
      calendar: byId.get(event.calendarId) ?? {},
      event,
      who: people[index] ?? null,
    }))
    .filter(({ calendar, event, who }) => isTaken(event, who, calendar.ownerAccount))
    .map(({ calendar, event, who }) => {
      const title = event.title.trim() === "" ? "—" : event.title.trim();
      return {
        ...detailsOf(event, who, calendar),
        endAt: new Date(event.endDate).toISOString(),
        id: event.id,
        series: event.recurrenceRule === null ? null : `${event.calendarId}:${title}`,
        startAt: new Date(event.startDate).toISOString(),
        title,
      };
    })
    .toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
};
