import Constants from "expo-constants";

import type { ApiClient } from "@pace/client";

import { addMinutesIso, appSessions, endpoints } from "@pace/core";

import { loadDeviceId } from "./device-id.ts";
import { calendarAccess, calendarEvents } from "./phone-calendar.ts";
import { appLabels, readPhoneEvents } from "./phone-data.ts";
import { isCalendarSyncOn, setUsageCursor, usageCursor } from "./phone-memory.ts";

/** The calendar copy covers last week and the next two. */
const CALENDAR_BACK_MINUTES = 7 * 24 * 60;
const CALENDAR_AHEAD_MINUTES = 14 * 24 * 60;
/** A first upload looks back a day. */
const FIRST_LOOKBACK_MINUTES = 24 * 60;
/** At most this many sessions go in one request. */
const BATCH = 1000;

/** How the phone is named next to the computers in Settings → Devices. */
const deviceName = (): string => {
  const name = (Constants.deviceName ?? "").trim();
  return name === "" ? "Android" : name;
};

const uploadCalendar = async (api: ApiClient, deviceId: string, now: string): Promise<void> => {
  if (!(await isCalendarSyncOn()) || (await calendarAccess()) !== "granted") {
    return;
  }
  const from = addMinutesIso(now, -CALENDAR_BACK_MINUTES);
  const to = addMinutesIso(now, CALENDAR_AHEAD_MINUTES);
  const events = await calendarEvents(from, to);
  await api.call(endpoints.calendar.sync, {
    body: {
      deviceId,
      events: events.map((event) => ({ ...event, title: event.title.slice(0, 200) })),
      from,
      to,
    },
  });
};

const uploadUsage = async (api: ApiClient, deviceId: string, now: string): Promise<void> => {
  const since = (await usageCursor()) ?? addMinutesIso(now, -FIRST_LOOKBACK_MINUTES);
  const phone = await readPhoneEvents(since, now);
  if (!phone.hasAccess) {
    return;
  }
  const sessions = appSessions(phone.events, now).filter((session) => session.startAt >= since);
  const labels = await appLabels([...new Set(sessions.map((session) => session.app))]);
  const named = sessions.map((session) => ({
    app: (labels[session.app] ?? session.app).slice(0, 120),
    endAt: session.endAt,
    startAt: session.startAt,
  }));
  for (let index = 0; index < named.length; index += BATCH) {
    await api.call(endpoints.usage.upload, {
      body: { deviceId, deviceName: deviceName(), sessions: named.slice(index, index + BATCH) },
    });
  }
  // The last session may still grow: the next upload starts from its start and sends it again.
  await setUsageCursor(named.at(-1)?.startAt ?? now);
};

/**
Sends what the phone knows beside the event log: its calendar (own and accepted events, while
"Send the calendar" is on) and the apps it had in front (names and times only). Offline or
refused, it tries again on the next start or return to the app.
*/
export const uploadPhoneData = async (api: ApiClient, now: string): Promise<void> => {
  try {
    const deviceId = await loadDeviceId();
    await uploadCalendar(api, deviceId, now);
    await uploadUsage(api, deviceId, now);
  } catch {
    // Kept for the next try: nothing here is lost, the phone still has it.
  }
};
