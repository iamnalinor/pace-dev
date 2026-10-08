import * as Calendar from "expo-calendar";

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

/** The timed events of every visible calendar overlapping [from, to); all-day ones are left out. */
export const calendarEvents = async (
  from: string,
  to: string,
): Promise<readonly PhoneCalendarEvent[]> => {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const ids = calendars
    .filter((calendar) => calendar.isVisible !== false)
    .map((calendar) => calendar.id);
  if (ids.length === 0) {
    return [];
  }
  const events = await Calendar.listEvents(ids, new Date(from), new Date(to));
  return events
    .filter((event) => !event.allDay)
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
