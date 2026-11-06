import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import type { ListedSessions } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useFeed } from "#app/shared/notifications/use-feed.ts";
import { useSignInsChanged } from "#app/shared/notifications/use-sign-ins-changed.ts";
import { useBack } from "#app/shared/use-back.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { type ListSection, SectionedList } from "#app/ui/sectioned-list.tsx";
import { Skeleton } from "#app/ui/skeleton.tsx";
import { useSessions } from "@pace/client/react";
import { formatRelativeDay, type PoolNotification } from "@pace/core";

import { Item, type Zoned } from "./notification-item.tsx";

/** What was unread when each notification first showed: the dot stays while the visit lasts. */
const useUnreadAtOpen = (unreadIds: readonly string[]): ReadonlySet<string> => {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  if (unreadIds.some((id) => !seen.has(id))) {
    setSeen(new Set([...seen, ...unreadIds]));
  }
  return seen;
};

/** What the list shows while it has no rows: loading, the failure with Retry, or the empty feed. */
const FeedNothing = ({
  onRetry,
  status,
}: {
  readonly status: ReturnType<typeof useFeed>["status"];
  readonly onRetry: () => void;
}) => {
  const t = useT();
  const router = useRouter();
  if (status === "failed") {
    return (
      <EmptyState
        action={
          <Button onPress={onRetry} size="small" variant="secondary">
            {t("common.retry")}
          </Button>
        }
        title={t("notifications.failed")}
      />
    );
  }
  if (status !== "ready") {
    return <Skeleton label={t("sync.loadingData")} rows={6} />;
  }
  return (
    <EmptyState
      action={
        <Button
          onPress={() => {
            router.push("/settings");
          }}
          size="small"
          variant="secondary"
        >
          {t("notifications.setup")}
        </Button>
      }
      title={t("notifications.empty")}
    />
  );
};

/**
The feed's rows by day and what its rows need: the account's sessions (this one's own sign-in,
which it may not answer, and the sign-ins whose session already ended elsewhere read apart from the
rest; the list follows new and answered sign-ins), the one open Not me confirm, the zone the days
were grouped in. Opening the feed marks what it shows as read.
*/
const useNotificationFeed = () => {
  const viewer = useViewer();
  const { deliveries, feed, model, status, zone } = useFeed();
  const { api } = usePace();
  const sessions = useSessions(api);
  useSignInsChanged(sessions.reload);
  // One Not me confirm open at a time: opening another closes it (as Settings' list does).
  const [askingId, setAskingId] = useState<null | string>(null);
  const listed: ListedSessions = {
    current: sessions.sessions.find((session) => session.current)?.id,
    ids: new Set(sessions.sessions.map((session) => session.id)),
    loadedAt: sessions.status === "ready" ? sessions.loadedAt : null,
  };
  useEffect(() => {
    void feed.refresh();
  }, [feed]);
  const unread = model.unreadIds.join(",");
  useEffect(() => {
    if (unread !== "") {
      void feed.markRead(unread.split(","));
    }
  }, [feed, unread]);
  const sections = useMemo(
    (): readonly ListSection<PoolNotification>[] =>
      model.days.map((day) => ({
        key: day.day,
        rows: day.items,
        title: formatRelativeDay(day.day, viewer.now, { language: viewer.language, tz: zone }),
      })),
    [model.days, viewer.language, viewer.now, zone],
  );
  return {
    asking: { id: askingId, set: setAskingId },
    deliveries,
    listed,
    refresh: (): void => {
      void feed.refresh();
    },
    sections,
    status,
    unreadAtOpen: useUnreadAtOpen(model.unreadIds),
    // The zone the feed grouped its days in: the times under each day are in it too.
    zoned: { language: viewer.language, now: viewer.now, zone } satisfies Zoned,
  };
};

/**
The notification feed: what this client shows (the kinds on for its platform), grouped by day,
newest first, virtualised. The assistant's decision log is one quiet link away. A phone reaches it
pushed from the bell; beside the sidebar it is a destination of its own.
*/
export const NotificationsScreen = () => {
  const t = useT();
  const router = useRouter();
  const isWide = useIsWide();
  const back = useBack();
  const feed = useNotificationFeed();
  return (
    <Screen
      header={
        <ScreenHeader
          actions={
            <Button
              onPress={() => {
                router.push("/decisions");
              }}
              size="small"
              variant="plain"
            >
              {t("notifications.assistantLog")}
            </Button>
          }
          {...(!isWide && back !== undefined && { backLabel: t("common.back"), onBack: back })}
          title={t("notifications.title")}
          variant={isWide ? "top" : "pushed"}
        />
      }
      scroller={(scroll) => (
        <SectionedList
          empty={<FeedNothing onRetry={feed.refresh} status={feed.status} />}
          renderRow={(item) => (
            <Item
              asking={feed.asking}
              deliveries={feed.deliveries[item.id] ?? []}
              isUnread={feed.unreadAtOpen.has(item.id)}
              item={item}
              listed={feed.listed}
              zoned={feed.zoned}
            />
          )}
          rowKey={(item) => item.id}
          scroll={scroll}
          sections={feed.sections}
        />
      )}
    />
  );
};
