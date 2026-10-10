import {
  calendarAccess,
  type CalendarAccess,
  calendarEvents,
  type PhoneCalendarEvent,
} from "#app/platform/phone-calendar.ts";
import { addDaysIn, startOfDayIn } from "@pace/core";

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
