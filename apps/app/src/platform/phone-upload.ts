import Constants from "expo-constants";

import type { ApiClient } from "@pace/client";

import { addMinutesIso, appSessions, endpoints } from "@pace/core";

import { loadDeviceId } from "./device-id.ts";
import { calendarAccess, calendarEvents } from "./phone-calendar.ts";
import { appLabels, readPhoneEvents } from "./phone-data.ts";
import { isCalendarSyncOn, seriesRules, setUsageCursor, usageCursor } from "./phone-memory.ts";
import { seriallyBySession } from "./session-poll-queue.ts";

/** The calendar copy covers last week and the next two. */
const CALENDAR_BACK_MINUTES = 7 * 24 * 60;
const CALENDAR_AHEAD_MINUTES = 14 * 24 * 60;
/** A first upload looks back a day. */
const FIRST_LOOKBACK_MINUTES = 24 * 60;
/** Without a session to resend, the next upload still reads this far back. */
const REREAD_MINUTES = 10;
/** At most this many events go in one calendar copy (what the server accepts). */
const MAX_EVENTS = 2000;
/** At most this many sessions go in one request. */
const BATCH = 1000;

const quietUsageCursor = (since: string, now: string): string => {
  const reread = addMinutesIso(now, -REREAD_MINUTES);
  const at = Math.max(Date.parse(since), Date.parse(reread));
  return new Date(at).toISOString();
};

/** How the phone is named next to the computers in Settings → Devices. */
const deviceName = (): string => {
  const name = (Constants.deviceName ?? "").trim();
  return name === "" ? "Android" : name;
};

const syncCalendar = async (
  api: ApiClient,
  {
    deviceId,
    now,
    session,
  }: { readonly deviceId: string; readonly now: string; readonly session: string },
): Promise<void> => {
  if (!(await isCalendarSyncOn(session)) || (await calendarAccess()) !== "granted") {
    return;
  }
  const from = addMinutesIso(now, -CALENDAR_BACK_MINUTES);
  const to = addMinutesIso(now, CALENDAR_AHEAD_MINUTES);
  const events = await calendarEvents(from, to);
  const rules = await seriesRules();
  if (!api.isCurrentSession(session) || !(await isCalendarSyncOn(session))) {
    return;
  }
  await api.call(endpoints.calendar.sync, {
    body: {
      deviceId,
      events: events.slice(0, MAX_EVENTS).map((event) => ({
        ...event,
        series: event.series?.slice(0, 300) ?? null,
        title: event.title.slice(0, 200),
      })),
      from,
      to,
      ruledSeries: rules.map((rule) => rule.series.slice(0, 300)).slice(0, 500),
    },
  });
};

const uploadCalendar = async (api: ApiClient, deviceId: string, now: string): Promise<void> => {
  const session = api.currentSessionToken();
  if (session === undefined) {
    return;
  }
  await seriallyBySession(`calendar:${session}`, async () => {
    await syncCalendar(api, { deviceId, now, session });
  });
};

/** Clears this session's calendar copy after any upload already in flight has finished. */
export const clearPhoneCalendar = async (api: ApiClient, session: string): Promise<void> => {
  await seriallyBySession(`calendar:${session}`, async () => {
    const deviceId = await loadDeviceId();
    if (api.isCurrentSession(session)) {
      await api.call(endpoints.calendar.clear, { query: { deviceId } });
    }
  });
};

type NamedSession = { readonly app: string; readonly endAt: string; readonly startAt: string };

const didSendUsageBatches = async ({
  api,
  deviceId,
  named,
  session,
}: {
  readonly api: ApiClient;
  readonly deviceId: string;
  readonly named: readonly NamedSession[];
  readonly session: string;
}): Promise<boolean> => {
  for (let index = 0; index < named.length; index += BATCH) {
    if (!api.isCurrentSession(session)) {
      return false;
    }
    await api.call(endpoints.usage.upload, {
      body: { deviceId, deviceName: deviceName(), sessions: named.slice(index, index + BATCH) },
    });
  }
  return true;
};

const uploadUsage = async (api: ApiClient, deviceId: string, now: string): Promise<void> => {
  const session = api.currentSessionToken();
  if (session === undefined) {
    return;
  }
  const since = (await usageCursor(session)) ?? addMinutesIso(now, -FIRST_LOOKBACK_MINUTES);
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
  if (!(await didSendUsageBatches({ api, deviceId, named, session }))) {
    return;
  }
  // The last session may still grow: the next upload starts from its start and sends it again.
  // With none, it starts a little back, so an app opened just now is not cut at its start.
  const quiet = quietUsageCursor(since, now);
  await setUsageCursor(session, named.at(-1)?.startAt ?? quiet, () =>
    api.isCurrentSession(session),
  );
};

/**
Sends what the phone knows beside the event log: its calendar (own and accepted events, while
"Send the calendar" is on) and the apps it had in front (names and times only). Offline or
refused, it tries again on the next start or return to the app.
*/
export const uploadPhoneData = async (api: ApiClient, now: string): Promise<void> => {
  const deviceId = await loadDeviceId();
  // Each on its own: a calendar the server refuses never holds the usage back, or the reverse.
  for (const upload of [uploadCalendar, uploadUsage]) {
    try {
      await upload(api, deviceId, now);
    } catch {
      // Kept for the next try: nothing here is lost, the phone still has it.
    }
  }
};
