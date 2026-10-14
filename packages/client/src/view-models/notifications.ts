import {
  isChannelOn,
  type NotificationChannel,
  type PoolNotification,
  type Settings,
  startOfDayIn,
} from "@pace/core";

/** Which channel this client is: the Android app or a browser. */
export type FeedPlatform = Extract<NotificationChannel, "app" | "web">;

/** A day of the feed: its date (the day's start in the zone) and its notifications, newest first. */
export type FeedDay = { readonly day: string; readonly items: readonly PoolNotification[] };

export type FeedModel = {
  /** What this client shows: the kinds whose channel for its platform is on, newest first. */
  readonly items: readonly PoolNotification[];
  readonly days: readonly FeedDay[];
  /** Unread among what is shown (the bell's badge). */
  readonly unread: number;
  readonly unreadIds: readonly string[];
};

/**
The feed as this client shows it: every notification of a kind on for this platform (the one
place that decides it, `isChannelOn`), grouped by day in `zone`, with the unread count of
exactly what is shown.
*/
export const feedModel = (
  all: readonly PoolNotification[],
  {
    platform,
    settings,
    zone,
  }: {
    readonly platform: FeedPlatform;
    readonly settings: Pick<Settings, "notificationChannels">;
    readonly zone: string;
  },
): FeedModel => {
  const items = all
    .filter((item) => isChannelOn(settings, item.kind, platform))
    .toSorted((a, b) => {
      const byTime = b.createdAt.localeCompare(a.createdAt);
      return byTime === 0 ? b.id.localeCompare(a.id) : byTime;
    });
  const dayOf = (item: PoolNotification): string => startOfDayIn(item.createdAt, zone);
  const dayKeys = [...new Set(items.map((item) => dayOf(item)))];
  const unreadIds = items.filter((item) => item.readAt === null).map((item) => item.id);
  return {
    days: dayKeys.map((day) => ({ day, items: items.filter((item) => dayOf(item) === day) })),
    items,
    unread: unreadIds.length,
    unreadIds,
  };
};

/** How a calendar occurrence was answered. */
export type EventAnswer = "attended" | "skipped";

/**
Calendar occurrences answered from any channel (Attend or Skip in Telegram, the web, a phone
notification, Now or Day), by `calendarEventKey`: Now's offer and Day's rows do not ask about
them again (Day hides a skipped one and reads an attended one as logged).
*/
export const eventAnswers = (all: readonly PoolNotification[]): ReadonlyMap<string, EventAnswer> =>
  new Map(
    all.flatMap((item) =>
      item.kind === "event_start" &&
      (item.resolution === "attended" || item.resolution === "skipped")
        ? [[item.payload.eventKey, item.resolution] as const]
        : [],
    ),
  );
