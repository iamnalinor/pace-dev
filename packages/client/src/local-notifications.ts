import {
  addMinutesIso,
  endpoints,
  type Language,
  type PlannedNotification,
  REMIND_FACTOR,
  t,
} from "@pace/core";

import type { ApiClient } from "./api-client.ts";

/** One reminder the phone schedules itself, mirroring the server's plan. */
export type LocalNotification = {
  /** Stable for the same plan entry, so a re-sync replaces rather than duplicates. */
  readonly id: string;
  readonly at: string;
  readonly title: string;
  readonly body: string;
};

/** Every id this module schedules starts with this, so it never touches anyone else's. */
export const LOCAL_ID_PREFIX = "pace:";

/** The running activity's timer: "still doing this?". */
export const ACTIVITY_ID_PREFIX = `${LOCAL_ID_PREFIX}activity:`;

export const isActivityId = (id: string): boolean => id.startsWith(ACTIVITY_ID_PREFIX);

/** The calendar's events, each asked about as it starts. */
export const CALENDAR_ID_PREFIX = `${LOCAL_ID_PREFIX}calendar:`;

export const isCalendarId = (id: string): boolean => id.startsWith(CALENDAR_ID_PREFIX);

/** The server plan's reminders: every id of ours that is not an activity or calendar one. */
export const isPlanId = (id: string): boolean =>
  id.startsWith(LOCAL_ID_PREFIX) && !isActivityId(id) && !isCalendarId(id);

export type RunningTimer = {
  readonly activityId: string;
  readonly label: string;
  readonly startAt: string;
  readonly expectMinutes: null | number;
};

/**
The phone's own timer for the running activity, so it rings offline: "still doing this?" at
twice its Expect. A moment already behind `now` is left out.
*/
export const activityNotifications = (
  running: null | RunningTimer,
  now: string,
  language: Language,
): readonly LocalNotification[] => {
  const expectMinutes = running?.expectMinutes ?? null;
  if (running === null || expectMinutes === null) {
    return [];
  }
  const at = addMinutesIso(running.startAt, REMIND_FACTOR * expectMinutes);
  return Date.parse(at) <= Date.parse(now)
    ? []
    : [
        {
          at,
          body: t(language, "notify.activityLong", { label: running.label }),
          id: `${ACTIVITY_ID_PREFIX}${running.activityId}:long`,
          title: t(language, "notify.localTitle"),
        },
      ];
};

/** A calendar event the phone may remind about. */
export type CalendarReminder = {
  readonly id: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
};

/**
"Seminar, 10:00–11:30. Attend?" as each event starts, for the events still ahead; `clock`
writes an instant as the wall clock the person reads.
*/
export const calendarNotifications = (
  events: readonly CalendarReminder[],
  {
    clock,
    language,
    now,
  }: {
    readonly now: string;
    readonly language: Language;
    readonly clock: (atIso: string) => string;
  },
): readonly LocalNotification[] =>
  events
    .filter((event) => Date.parse(event.startAt) > Date.parse(now))
    .map((event) => ({
      at: event.startAt,
      body: t(language, "phone.notify.eventStart", {
        from: clock(event.startAt),
        title: event.title,
        to: clock(event.endAt),
      }),
      id: `${CALENDAR_ID_PREFIX}${event.id}@${event.startAt}`,
      title: t(language, "phone.notify.eventStartTitle"),
    }));

/** The plan as notifications in the account language. */
export const localNotifications = (
  plan: readonly PlannedNotification[],
  language: Language,
): readonly LocalNotification[] =>
  plan.map((item) =>
    item.kind === "digest"
      ? {
          at: item.at,
          body: t(language, "notify.localDigest"),
          id: `${LOCAL_ID_PREFIX}digest:${item.at}`,
          title: t(language, "notify.localTitle"),
        }
      : {
          at: item.at,
          body: t(language, "notify.localDeadline", { title: item.title }),
          id: `${LOCAL_ID_PREFIX}deadline:${item.taskId}:${item.at}`,
          title: t(language, "notify.localTitle"),
        },
  );

export type ScheduleChanges = {
  readonly cancel: readonly string[];
  readonly schedule: readonly LocalNotification[];
};

/**
What to cancel (ours, no longer wanted) and what to add (wanted, not scheduled yet); `isOwned`
says which scheduled ids this sync manages (the plan's by default).
*/
export const scheduleChanges = (
  scheduledIds: readonly string[],
  wanted: readonly LocalNotification[],
  isOwned: (id: string) => boolean = isPlanId,
): ScheduleChanges => {
  const wantedIds = new Set(wanted.map((item) => item.id));
  const scheduled = new Set(scheduledIds);
  return {
    cancel: scheduledIds.filter((id) => isOwned(id) && !wantedIds.has(id)),
    schedule: wanted.filter((item) => !scheduled.has(item.id)),
  };
};

/** The server's plan for the next day; `null` when it cannot be fetched (offline). */
export const fetchNotificationPlan = async (
  api: ApiClient,
): Promise<null | readonly PlannedNotification[]> => {
  try {
    const { items } = await api.call(endpoints.notify.plan, {});
    return items;
  } catch {
    return null;
  }
};
