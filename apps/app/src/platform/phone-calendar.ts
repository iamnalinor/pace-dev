import * as Calendar from "expo-calendar";

import { isTakenEvent } from "./calendar-filter.ts";

/** An event from the phone's calendars, read on the device and never uploaded. */
export type PhoneCalendarEvent = {
  readonly id: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  /** Same calendar and title for every occurrence of a repeating event; `null` for one-offs. */
  readonly series: null | string;
};

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

/** Whether the person takes part: their own event, or an invitation they accepted. */
type ListedEvent = Awaited<ReturnType<typeof Calendar.listEvents>>[number];

const isTaken = async (event: ListedEvent, ownerAccount: string | undefined): Promise<boolean> => {
  try {
    const attendees = await event.getAttendees();
    return isTakenEvent({ attendees, organizerEmail: event.organizerEmail, ownerAccount });
  } catch {
    // The attendees cannot be read: the event stays, as it did before the filter.
    return true;
  }
};

/**
The timed events of every visible calendar overlapping [from, to) that the person takes part
in (see `isTakenEvent`); all-day ones are left out.
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
  const owners = new Map(visible.map((calendar) => [calendar.id, calendar.ownerAccount]));
  const listed = await Calendar.listEvents(
    visible.map((calendar) => calendar.id),
    new Date(from),
    new Date(to),
  );
  const timed = listed.filter((event) => !event.allDay);
  const taken = await Promise.all(
    timed.map(async (event) => await isTaken(event, owners.get(event.calendarId))),
  );
  return timed
    .filter((_event, index) => taken[index] === true)
    .map((event) => {
      const title = event.title.trim() === "" ? "—" : event.title.trim();
      return {
        endAt: new Date(event.endDate).toISOString(),
        id: event.id,
        series: event.recurrenceRule === null ? null : `${event.calendarId}:${title}`,
        startAt: new Date(event.startDate).toISOString(),
        title,
      };
    })
    .toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
};
