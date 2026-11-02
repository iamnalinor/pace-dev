import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";
import { useFeed } from "#app/shared/notifications/use-feed.ts";
import { useSignInsChanged } from "#app/shared/notifications/use-sign-ins-changed.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { type DeliveryEntry, type ListedSessions, signInState } from "@pace/client";
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

type SignInPayload = Extract<PoolNotification, { kind: "login" }>["payload"];

/** A sign-in: from what, then where; this very session's own says "This device" first. */
const SignInBody = ({
  isOwn,
  payload,
}: {
  readonly isOwn: boolean;
  readonly payload: SignInPayload;
}) => {
  const t = useT();
  const { city, country, ip, name } = payload;
  return (
    <View className="gap-0.5">
      <Line>{t("notifications.login", { name })}</Line>
      <Line tone="muted">
        {[isOwn ? t("devices.thisDevice") : undefined, ip, city, country]
          .filter((part) => part !== undefined && part !== "")
          .join(" · ")}
      </Line>
    </View>
  );
};

/** What the notification says, per kind; a sign-in about this very session says "This device". */
const Body = ({
  isOwn,
  item,
  zoned,
}: {
  readonly isOwn: boolean;
  readonly item: PoolNotification;
  readonly zoned: Zoned;
}) => {
  const t = useT();
  const router = useRouter();
  switch (item.kind) {
    case "login": {
      return <SignInBody isOwn={isOwn} payload={item.payload} />;
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
              className="min-h-hit-web justify-center active:opacity-70"
              key={task.taskId}
              onPress={() => {
                router.push(`/task/${task.taskId}`);
              }}
            >
              <Text className="font-sans text-subhead font-normal text-label-primary">
                {task.title}
              </Text>
              <Text className="font-sans text-caption font-normal tabular-nums text-label-tertiary">
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
              className="min-h-hit-web justify-center"
              onPress={() => {
                router.push("/");
              }}
            >
              <Text className="font-sans text-footnote text-accent-text underline">
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

export const Item = ({
  asking,
  deliveries,
  item,
  listed,
  zoned,
}: {
  /** The feed's one open Not me confirm: its notice, and how to move it. */
  readonly asking: { readonly id: null | string; readonly set: (id: null | string) => void };
  readonly item: PoolNotification;
  readonly deliveries: readonly DeliveryEntry[];
  readonly listed: ListedSessions;
  readonly zoned: Zoned;
}) => {
  const t = useT();
  const state = signInState(item, listed);
  return (
    <View
      className="gap-2 border-t border-separator px-5 py-3"
      role="listitem"
      testID={`notification-${item.id}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <Body isOwn={state === "own"} item={item} zoned={zoned} />
        </View>
        <Text className="font-sans text-caption font-normal tabular-nums text-label-tertiary">
          {clockTime(item.createdAt, zoned.zone)}
        </Text>
      </View>
      <Answers
        isAsking={asking.id === item.id}
        item={item}
        onAsking={(isOpen) => {
          if (isOpen) {
            asking.set(item.id);
          } else if (asking.id === item.id) {
            asking.set(null);
          }
        }}
        state={state}
      />
      {deliveries
        .flatMap((entry) => deliveryLines(entry, t, zoned.zone))
        .map((line, index) => (
          // Lines repeat (two devices, one minute): their place keeps them apart.
          // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
          <Text className="font-sans text-caption2 font-normal text-label-tertiary" key={index}>
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
  // The account's sessions: this one's own sign-in (which it may not answer) and the sign-ins
  // whose session already ended elsewhere (nothing left to end) read apart from the rest; the
  // list follows new and answered sign-ins.
  const sessions = useSessions(api);
  useSignInsChanged(sessions.reload);
  // One Not me confirm open at a time: opening another closes it (as Settings' list does).
  const [askingId, setAskingId] = useState<null | string>(null);
  const asking = { id: askingId, set: setAskingId };
  const listed: ListedSessions = {
    current: sessions.sessions.find((session) => session.current)?.id,
    ids: new Set(sessions.sessions.map((session) => session.id)),
    loadedAt: sessions.status === "ready" ? sessions.loadedAt : null,
  };
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
          className="min-h-hit-web justify-center px-2 active:opacity-70"
          onPress={() => {
            router.push("/decisions");
          }}
        >
          <Text className="font-sans text-footnote text-label-secondary">
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
              className="px-5 pb-2 pt-4 font-sans text-caption2 font-normal uppercase text-label-tertiary"
            >
              {label}
            </Text>
            <View aria-label={label} role="list">
              {day.items.map((item) => (
                <Item
                  asking={asking}
                  deliveries={deliveries[item.id] ?? []}
                  item={item}
                  key={item.id}
                  listed={listed}
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
