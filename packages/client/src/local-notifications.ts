import { endpoints, type Language, type PlannedNotification, t } from "@pace/core";

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

/** What to cancel (ours, no longer planned) and what to add (planned, not scheduled yet). */
export const scheduleChanges = (
  scheduledIds: readonly string[],
  wanted: readonly LocalNotification[],
): ScheduleChanges => {
  const wantedIds = new Set(wanted.map((item) => item.id));
  const scheduled = new Set(scheduledIds);
  return {
    cancel: scheduledIds.filter((id) => id.startsWith(LOCAL_ID_PREFIX) && !wantedIds.has(id)),
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
