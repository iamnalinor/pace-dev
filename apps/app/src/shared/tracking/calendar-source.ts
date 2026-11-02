import { calendarAccess, calendarEvents } from "#app/platform/phone-calendar.ts";
import { addDaysIn, addMinutesIso, type MessageKey, startOfDayIn } from "@pace/core";

import type { CalendarSource, CalendarToday } from "./calendar-today.ts";

/** An event over this recently still counts: the Calendar button links to it. */
const RECENT_MINUTES = 15;

/** What "Calendar" can start on a phone: today's events from just now on, read on the phone. */
export const calendarToday = async ({ now, zone }: CalendarSource): Promise<CalendarToday> => {
  try {
    const access = await calendarAccess();
    if (access !== "granted") {
      return { access, events: [] };
    }
    const from = startOfDayIn(now, zone);
    const events = await calendarEvents(from, addDaysIn(from, 1, zone));
    return {
      access,
      events: events.filter((event) => event.endAt > addMinutesIso(now, -RECENT_MINUTES)),
    };
  } catch {
    // The phone's calendar refused to answer: as good as no access this time.
    return { access: "denied", events: [] };
  }
};

/** Why the Calendar picker has nothing to pick on a phone: nothing on, or no access to look. */
export const noEventsKey = (calendar: CalendarToday | null): MessageKey =>
  calendar?.access === "granted" ? "time.calendarNone" : "phone.calendarAsk";
