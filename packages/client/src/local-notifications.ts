import {
  addMinutesIso,
  endpoints,
  formatDuration,
  type Language,
  type PlannedNotification,
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

/** The running activity's timers: Expect, then the Limit's warning and crossing. */
export const ACTIVITY_ID_PREFIX = `${LOCAL_ID_PREFIX}activity:`;

export const isActivityId = (id: string): boolean => id.startsWith(ACTIVITY_ID_PREFIX);

/** The server plan's reminders: every id of ours that is not an activity timer. */
export const isPlanId = (id: string): boolean =>
  id.startsWith(LOCAL_ID_PREFIX) && !isActivityId(id);

/** Minutes before the Limit at which the warning goes out. */
const NEAR_LIMIT_MINUTES = 10;

export type RunningTimer = {
  readonly activityId: string;
  readonly label: string;
  readonly startAt: string;
  readonly expectMinutes: null | number;
  readonly limitMinutes: null | number;
};

/**
The phone's own timers for the running activity, so they ring offline: Expect passed, ten
minutes to the Limit, the Limit passed. Moments already behind `now` are left out.
*/
export const activityNotifications = (
  running: null | RunningTimer,
  now: string,
  language: Language,
): readonly LocalNotification[] => {
  if (running === null) {
    return [];
  }
  const timer = (kind: string, minutes: number, body: string): readonly LocalNotification[] => {
    const at = addMinutesIso(running.startAt, minutes);
    return Date.parse(at) > Date.parse(now)
      ? [
          {
            at,
            body,
            id: `${ACTIVITY_ID_PREFIX}${running.activityId}:${kind}`,
            title: t(language, "notify.localTitle"),
          },
        ]
      : [];
  };
  const { expectMinutes, label, limitMinutes } = running;
  const expect =
    expectMinutes === null
      ? []
      : timer(
          "expect",
          expectMinutes,
          t(language, "notify.activityExpect", {
            duration: formatDuration(expectMinutes, language),
            label,
          }),
        );
  const limit =
    limitMinutes === null
      ? []
      : [
          ...(limitMinutes > NEAR_LIMIT_MINUTES
            ? timer(
                "near-limit",
                limitMinutes - NEAR_LIMIT_MINUTES,
                t(language, "notify.activityNearLimit", {
                  duration: formatDuration(limitMinutes, language),
                  label,
                }),
              )
            : []),
          ...timer(
            "over-limit",
            limitMinutes,
            t(language, "notify.activityOverLimit", {
              duration: formatDuration(limitMinutes, language),
              label,
            }),
          ),
        ];
  return [...expect, ...limit];
};

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
