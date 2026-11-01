import type { ApiClient } from "@pace/client";

import {
  addMinutesIso,
  appSessions,
  endpoints,
  type Interval,
  isLockedAt,
  type PhoneEvent,
  phoneUses,
} from "@pace/core";

import { loadDeviceId } from "./device-id.ts";
import { calendarAccess, calendarEvents } from "./phone-calendar.ts";
import { appLabels, readPhoneEvents } from "./phone-data.ts";
import { isCalendarSyncOn, seriesRules, setUsageCursor, usageCursor } from "./phone-memory.ts";
import { phoneName } from "./phone-name.ts";
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
/** At most this many sessions, and this many uses, go in one request. */
const BATCH = 1000;

const quietUsageCursor = (since: string, now: string): string => {
  const reread = addMinutesIso(now, -REREAD_MINUTES);
  const at = Math.max(Date.parse(since), Date.parse(reread));
  return new Date(at).toISOString();
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

/**
Sends the sessions and the uses in requests of at most `BATCH` each, always at least one: a quiet
stretch still tells the server how far the phone read. Only the last request says so (`until`),
so a batch that never arrives leaves the server knowing less, never a quiet it was not told about.
*/
const didSendUsageBatches = async ({
  api,
  deviceId,
  named,
  now,
  session,
  uses,
}: {
  readonly api: ApiClient;
  readonly deviceId: string;
  readonly named: readonly NamedSession[];
  readonly uses: readonly Interval[];
  readonly now: string;
  readonly session: string;
}): Promise<boolean> => {
  const requests = Math.max(1, Math.ceil(named.length / BATCH), Math.ceil(uses.length / BATCH));
  for (let request = 0; request < requests; request += 1) {
    if (!api.isCurrentSession(session)) {
      return false;
    }
    const from = request * BATCH;
    await api.call(endpoints.usage.upload, {
      body: {
        deviceId,
        deviceName: phoneName(),
        sessions: named.slice(from, from + BATCH),
        uses: uses.slice(from, from + BATCH),
        ...(request === requests - 1 && { until: now }),
      },
    });
  }
  return true;
};

/**
Where the next read starts: at the earlier of the last app session's start and the start of the
use that ends last, since both may still grow and are sent again. With neither, a little back
from now, so an app opened just now is not cut at its start. The lock screen's state there is
kept with it (`isLockedAt`).
*/
const nextUsageCursor = ({
  named,
  now,
  since,
  uses,
}: {
  readonly named: readonly NamedSession[];
  readonly uses: readonly Interval[];
  readonly since: string;
  readonly now: string;
}): string => {
  const lastEnd = uses
    .map((use) => use.endAt)
    .toSorted((a, b) => b.localeCompare(a))
    .at(0);
  // The uses that end last (of several ending together, the first to start counts).
  const lastUses = uses.filter((use) => use.endAt === lastEnd).map((use) => use.startAt);
  const lastSession = named.at(-1)?.startAt;
  const starts = lastSession === undefined ? lastUses : [lastSession, ...lastUses];
  return starts.toSorted((a, b) => a.localeCompare(b)).at(0) ?? quietUsageCursor(since, now);
};

/**
What the phone recorded since the cursor (a day back without one), `null` without usage access.
The read starts with the lock screen as the read before left it: an app shown over it after
`since` is not use, though the lock itself came before this read (class 39).
*/
const readSinceCursor = async (
  session: string,
  now: string,
): Promise<null | { readonly since: string; readonly events: readonly PhoneEvent[] }> => {
  const cursor = await usageCursor(session);
  const since = cursor?.at ?? addMinutesIso(now, -FIRST_LOOKBACK_MINUTES);
  const phone = await readPhoneEvents(since, now);
  if (!phone.hasAccess) {
    return null;
  }
  const locked: readonly PhoneEvent[] =
    cursor?.locked === true ? [{ at: since, kind: "lock" }] : [];
  return { events: [...locked, ...phone.events], since };
};

const uploadUsage = async (api: ApiClient, deviceId: string, now: string): Promise<void> => {
  const session = api.currentSessionToken();
  const read = session === undefined ? null : await readSinceCursor(session, now);
  if (session === undefined || read === null) {
    return;
  }
  const { events, since } = read;
  const sessions = appSessions(events, now).filter((session) => session.startAt >= since);
  const uses = phoneUses(events, now).filter((use) => use.startAt >= since);
  const labels = await appLabels([...new Set(sessions.map((session) => session.app))]);
  const named = sessions.map((session) => ({
    app: (labels[session.app] ?? session.app).slice(0, 120),
    endAt: session.endAt,
    startAt: session.startAt,
  }));
  if (!(await didSendUsageBatches({ api, deviceId, named, now, session, uses }))) {
    return;
  }
  const at = nextUsageCursor({ named, now, since, uses });
  await setUsageCursor(session, { at, locked: isLockedAt(events, at) }, () =>
    api.isCurrentSession(session),
  );
};

/**
Sends what the phone knows beside the event log: its calendar (own and accepted events, while
"Send the calendar" is on), the apps it had in front (names and times only), when it was really
in use and how far it read (for automatic sleep). Offline or refused, it tries again on the next
start, return to the app or background check.
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
