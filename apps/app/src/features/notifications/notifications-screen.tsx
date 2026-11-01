import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import type { DeliveryEntry } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";
import { useFeed } from "#app/shared/notifications/use-feed.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { useSessions } from "@pace/client/react";
import {
  formatLeft,
  formatRelativeDay,
  type Language,
  minutesBetween,
  type PoolNotification,
  shownLabel,
} from "@pace/core";

import { Answers, Line } from "./answers.tsx";

type Zoned = { readonly language: Language; readonly zone: string; readonly now: string };

/** `Fri 18:00` in the zone and language. */
const dayClock = (iso: string, { language, zone }: Zoned): string =>
  `${new Intl.DateTimeFormat(language, { timeZone: zone, weekday: "short" }).format(new Date(iso))} ${clockTime(iso, zone)}`;

/** What the notification says, per kind. */
const Body = ({ item, zoned }: { readonly item: PoolNotification; readonly zoned: Zoned }) => {
  const t = useT();
  const router = useRouter();
  switch (item.kind) {
    case "login": {
      const { city, country, ip, name } = item.payload;
      return (
        <View className="gap-0.5">
          <Line>{t("notifications.login", { name })}</Line>
          <Line tone="muted">
            {[ip, city, country].filter((part) => part !== undefined && part !== "").join(" · ")}
          </Line>
        </View>
      );
    }
    case "deadline_digest": {
      return (
        <View className="gap-1">
          <Line>
            {item.payload.tasks.length === 1
              ? t("notifications.digestTitle")
              : t("notify.digestCount", { count: item.payload.tasks.length })}
          </Line>
          {item.payload.tasks.map((task) => (
            <Pressable
              accessibilityRole="link"
              className="min-h-11 justify-center active:opacity-70"
              key={task.taskId}
              onPress={() => {
                router.push(`/task/${task.taskId}`);
              }}
            >
              <Text className="font-sans text-[14px] text-fg">{task.title}</Text>
              <Text className="font-sans text-[12px] tabular-nums text-muted">
                {t("notifications.dueLeft", {
                  left: formatLeft(minutesBetween(zoned.now, task.dueAt), zoned.language),
                  when: dayClock(task.dueAt, zoned),
                })}
              </Text>
            </Pressable>
          ))}
          {item.payload.tasks.length > 1 ? (
            <Pressable
              accessibilityRole="link"
              className="min-h-11 justify-center"
              onPress={() => {
                router.push("/");
              }}
            >
              <Text className="font-sans text-[13px] text-accentQuietText underline">
                {t("notifications.openNow")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    }
    case "event_start": {
      const { end, start, title } = item.payload;
      return (
        <Line>
          {t("notifications.eventStart", {
            from: clockTime(start, zoned.zone),
            title,
            to: clockTime(end, zoned.zone),
          })}
        </Line>
      );
    }
    case "activity_overrun": {
      const { activityId, label } = item.payload;
      const shown = shownLabel({ id: activityId, label }, zoned.language);
      return <Line>{t("notifications.overrun", { label: shown })}</Line>;
    }
  }
};

/** How it went out: to a device through its push method, or the Telegram copy. */
const deliveryText = (entry: DeliveryEntry, t: ReturnType<typeof useT>, zone: string): string => {
  const time = clockTime(entry.at, zone);
  if (entry.method === "telegram" && entry.result !== "queued") {
    return t(`notifications.delivery.telegram.${entry.result}`, { time });
  }
  const method =
    entry.method === "fcm" || entry.method === "poll"
      ? t(`notifications.method.${entry.method}`)
      : entry.method;
  return t(`notifications.delivery.${entry.result}`, { device: entry.device, method, time });
};

/** Each delivery's line, and a second one once it was taken back. */
const deliveryLines = (
  entry: DeliveryEntry,
  t: ReturnType<typeof useT>,
  zone: string,
): readonly string[] => [
  deliveryText(entry, t, zone),
  ...(entry.dismissedAt === null
    ? []
    : [
        t("notifications.delivery.dismissed", {
          device: entry.device,
          time: clockTime(entry.dismissedAt, zone),
        }),
      ]),
];

const Item = ({
  deliveries,
  item,
  ownSessionId,
  zoned,
}: {
  readonly item: PoolNotification;
  readonly deliveries: readonly DeliveryEntry[];
  readonly ownSessionId: string | undefined;
  readonly zoned: Zoned;
}) => {
  const t = useT();
  return (
    <View
      className="gap-1.5 border-t border-line px-5 py-3"
      role="listitem"
      testID={`notification-${item.id}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <Body item={item} zoned={zoned} />
        </View>
        <Text className="font-sans text-[12px] tabular-nums text-muted">
          {clockTime(item.createdAt, zoned.zone)}
        </Text>
      </View>
      <Answers item={item} ownSessionId={ownSessionId} />
      {deliveries
        .flatMap((entry) => deliveryLines(entry, t, zoned.zone))
        .map((line, index) => (
          // Lines repeat (two devices, one minute): their place keeps them apart.
          // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
          <Text className="font-sans text-[11px] text-muted" key={index}>
            {line}
          </Text>
        ))}
    </View>
  );
};

/**
The notification feed: what this client shows (the kinds on for its platform), grouped by day,
newest first. Opening it marks what it shows as read. The assistant's decision log is one quiet
link away.
*/
export const NotificationsScreen = () => {
  const t = useT();
  const router = useRouter();
  const viewer = useViewer();
  const { deliveries, feed, model, status, zone } = useFeed();
  const { api } = usePace();
  // This session's id, to tell its own sign-in notice (which it may not answer) from the rest.
  const ownSessionId = useSessions(api).sessions.find((session) => session.current)?.id;
  // The zone the feed grouped its days in: the times under each day are in it too.
  const zoned: Zoned = { language: viewer.language, now: viewer.now, zone };
  useEffect(() => {
    void feed.refresh();
  }, [feed]);
  const unread = model.unreadIds.join(",");
  useEffect(() => {
    if (unread !== "") {
      void feed.markRead(unread.split(","));
    }
  }, [feed, unread]);
  return (
    <PushedScreen
      right={
        <Pressable
          accessibilityRole="link"
          className="min-h-11 justify-center px-2 active:opacity-70"
          onPress={() => {
            router.push("/decisions");
          }}
        >
          <Text className="font-sans text-[13px] text-muted">
            {t("notifications.assistantLog")}
          </Text>
        </Pressable>
      }
      title={t("notifications.title")}
    >
      {status === "failed" && model.items.length === 0 ? (
        <EmptyState>{t("notifications.failed")}</EmptyState>
      ) : null}
      {status === "ready" && model.items.length === 0 ? (
        <EmptyState>{t("notifications.empty")}</EmptyState>
      ) : null}
      {model.days.map((day) => {
        const label = formatRelativeDay(day.day, viewer.now, {
          language: viewer.language,
          tz: zoned.zone,
        });
        // The day's heading, then its list: a list holds list items only.
        return (
          <View key={day.day}>
            <Text
              accessibilityRole="header"
              className="px-5 pb-1.5 pt-4 font-sans text-[11px] uppercase tracking-[0.06em] text-muted"
            >
              {label}
            </Text>
            <View aria-label={label} role="list">
              {day.items.map((item) => (
                <Item
                  deliveries={deliveries[item.id] ?? []}
                  item={item}
                  key={item.id}
                  ownSessionId={ownSessionId}
                  zoned={zoned}
                />
              ))}
            </View>
          </View>
        );
      })}
    </PushedScreen>
  );
};
