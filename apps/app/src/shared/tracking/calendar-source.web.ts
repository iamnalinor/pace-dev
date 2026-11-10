import { withinDeadline } from "@pace/client";
import {
  addMinutesIso,
  endpoints,
  type MessageKey,
  nextDayStartIn,
  startOfDayIn,
} from "@pace/core";

import type { CalendarSource, CalendarToday } from "./calendar-today.ts";

/** An event over this recently still counts: the Calendar button links to it. */
const RECENT_MINUTES = 15;

type CalendarEvents = Awaited<ReturnType<typeof listDay>>;

/** One day's events; a request that never answers fails at `REQUEST_DEADLINE_MS` (class 104). */
const listDay = async (api: CalendarSource["api"], from: string, to: string) => {
  const { events } = await withinDeadline(
    async (signal) => await api.call(endpoints.calendar.list, { query: { from, to } }, { signal }),
  );
  return events;
};

/**
A day's request still on its way, by its session and range: the time bar and the calendar prompt
read today together as the app opens, and they share one request (QA round 20 L9: two identical
ones). It has a deadline, so one that stalls is not joined by every later read for good, and a
read of another session never joins it (round 7 review 5).
*/
const asking = new Map<string, Promise<CalendarEvents>>();

const dayEvents = async (
  api: CalendarSource["api"],
  from: string,
  to: string,
): Promise<CalendarEvents> => {
  const key = `${api.currentSessionToken() ?? ""}/${from}/${to}`;
  const shared = asking.get(key) ?? listDay(api, from, to);
  asking.set(key, shared);
  try {
    return await shared;
  } finally {
    asking.delete(key);
  }
};

/**
In a browser there is no calendar to read: today's events come from the copy the phone sends
(Settings → Devices and sessions). Offline, or with nothing sent, there are none.
*/
export const calendarToday = async ({ api, now, zone }: CalendarSource): Promise<CalendarToday> => {
  const from = startOfDayIn(now, zone);
  try {
    const events = await dayEvents(api, from, nextDayStartIn(from, zone));
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
