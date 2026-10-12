import { addDaysIn, endpoints, startOfDayIn } from "@pace/core";

import type { CalendarSource, CalendarToday } from "./calendar-today.ts";

/**
In a browser there is no calendar to read: today's events come from the copy the phone sends
(Settings → Devices). Offline, or with nothing sent, there are none.
*/
export const calendarToday = async ({ api, now, zone }: CalendarSource): Promise<CalendarToday> => {
  const from = startOfDayIn(now, zone);
  try {
    const { events } = await api.call(endpoints.calendar.list, {
      query: { from, to: addDaysIn(from, 1, zone) },
    });
    return { access: "granted", events: events.filter((event) => event.endAt > now) };
  } catch {
    return { access: "denied", events: [] };
  }
};
