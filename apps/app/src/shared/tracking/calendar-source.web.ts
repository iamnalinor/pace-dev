import { addDaysIn, addMinutesIso, endpoints, type MessageKey, startOfDayIn } from "@pace/core";

import type { CalendarSource, CalendarToday } from "./calendar-today.ts";

/** An event over this recently still counts: the Calendar button links to it. */
const RECENT_MINUTES = 15;

/**
In a browser there is no calendar to read: today's events come from the copy the phone sends
(Settings → Devices and sessions). Offline, or with nothing sent, there are none.
*/
export const calendarToday = async ({ api, now, zone }: CalendarSource): Promise<CalendarToday> => {
  const from = startOfDayIn(now, zone);
  try {
    const { events } = await api.call(endpoints.calendar.list, {
      query: { from, to: addDaysIn(from, 1, zone) },
    });
    return {
      access: "granted",
      events: events.filter((event) => event.endAt > addMinutesIso(now, -RECENT_MINUTES)),
    };
  } catch {
    // Offline or the server failed: nothing to link now, but nothing to allow either.
    return { access: "granted", events: [] };
  }
};

/**
Why the Calendar picker has nothing to pick in a browser: nothing is on. There is no phone
calendar here to set up or allow (QA round 19 L6: it offered "Calendar from the phone" and
Android's settings).
*/
export const noEventsKey = (_calendar: CalendarToday | null): MessageKey => "time.calendarNone";
