import { useRouter } from "expo-router";
import { View } from "react-native";

import { useLanguage, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { Button } from "#app/ui/button.tsx";
import { Icon, type IconName } from "#app/ui/icon.tsx";
import { Pressable } from "#app/ui/pressable.tsx";
import { Text } from "#app/ui/text.tsx";
import { type DeliveryEntry, type ListedSessions, signInState } from "@pace/client";
import {
  countryName,
  formatLeft,
  type Language,
  minutesBetween,
  plural,
  type PoolNotification,
  shownLabel,
} from "@pace/core";

import { Answers, Line } from "./answers.tsx";

export type Zoned = { readonly language: Language; readonly zone: string; readonly now: string };

/** `Fri 18:00` in the zone and language. */
const dayClock = (iso: string, { language, zone }: Zoned): string =>
  `${new Intl.DateTimeFormat(language, { timeZone: zone, weekday: "short" }).format(new Date(iso))} ${clockTime(iso, zone)}`;

type SignInPayload = Extract<PoolNotification, { kind: "login" }>["payload"];

/** A sign-in: from what, then where; this very session's own says "This device" first. */
const SignInBody = ({
  isOwn,
  isUnread,
  payload,
}: {
  readonly isOwn: boolean;
  readonly isUnread: boolean;
  readonly payload: SignInPayload;
}) => {
  const t = useT();
  const language = useLanguage();
  const { city, country, ip, name } = payload;
  // The country in words, as Settings and the Telegram notice spell it (QA round 17 L2).
  const place = [country === "" ? "" : countryName(country, language), city]
    .filter((part) => part !== undefined && part !== "")
    .join(", ");
  return (
    <View className="gap-0.5">
      <Line isStrong={isUnread}>{t("notifications.login", { name })}</Line>
      <Line tone="muted">
        {[isOwn ? t("devices.thisDevice") : undefined, ip, place]
          .filter((part) => part !== undefined && part !== "")
          .join(" · ")}
      </Line>
    </View>
  );
};

const DIGEST_LISTED = 5;

/** The tasks of a deadline digest: five at most, each opening its task, and «and N more». */
const DigestTasks = ({
  payload,
  zoned,
}: {
  readonly payload: Extract<PoolNotification, { kind: "deadline_digest" }>["payload"];
  readonly zoned: Zoned;
}) => {
  const t = useT();
  const router = useRouter();
  const listed = payload.tasks.slice(0, DIGEST_LISTED);
  const rest = payload.tasks.length - listed.length;
  return (
    <View className="gap-1">
      {listed.map((task) => (
        <Pressable
          className="min-h-hit-web justify-center"
          key={task.taskId}
          onPress={() => {
            router.push(`/task/${task.taskId}`);
          }}
          role="link"
        >
          <Text lines={2} policy="clamp" role="subhead">
            {task.title}
          </Text>
          <Text numeric role="caption" tone="tertiary">
            {t("notifications.dueLeft", {
              left: formatLeft(minutesBetween(zoned.now, task.dueAt), zoned.language),
              when: dayClock(task.dueAt, zoned),
            })}
          </Text>
        </Pressable>
      ))}
      {rest > 0 ? (
        <Text role="footnote" tone="secondary">
          {plural(zoned.language, rest, {
            few: t("notifications.more.few"),
            many: t("notifications.more.many"),
            one: t("notifications.more.one"),
            other: t("notifications.more.other"),
          })}
        </Text>
      ) : null}
      {payload.tasks.length > 1 ? (
        <View className="items-start">
          <Button
            onPress={() => {
              router.push("/");
            }}
            size="small"
            variant="plain"
          >
            {t("notifications.openNow")}
          </Button>
        </View>
      ) : null}
    </View>
  );
};

/** What the notification says, per kind; a sign-in about this very session says "This device". */
const Body = ({
  isOwn,
  isUnread,
  item,
  zoned,
}: {
  readonly isOwn: boolean;
  readonly isUnread: boolean;
  readonly item: PoolNotification;
  readonly zoned: Zoned;
}) => {
  const t = useT();
  switch (item.kind) {
    case "login": {
      return <SignInBody isOwn={isOwn} isUnread={isUnread} payload={item.payload} />;
    }
    case "deadline_digest": {
      return (
        <View className="gap-1">
          <Line isStrong={isUnread}>
            {item.payload.tasks.length === 1
              ? t("notifications.digestTitle")
              : t("notify.digestCount", { count: item.payload.tasks.length })}
          </Line>
          <DigestTasks payload={item.payload} zoned={zoned} />
        </View>
      );
    }
    case "event_start": {
      const { end, start, title } = item.payload;
      return (
        <Line isStrong={isUnread}>
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
      return <Line isStrong={isUnread}>{t("notifications.overrun", { label: shown })}</Line>;
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

const KIND_ICON: Readonly<Record<PoolNotification["kind"], IconName>> = {
  activity_overrun: "timer",
  deadline_digest: "calendar-clock",
  event_start: "calendar-days",
  login: "laptop",
};

/**
One notification as a row of the day's group: its kind's icon, what it says, the time, the answers
under it and how it was delivered. Unread: a bold first line and a danger dot that says «new».
*/
export const Item = ({
  asking,
  deliveries,
  isUnread = false,
  item,
  listed,
  zoned,
}: {
  /** The feed's one open Not me confirm: its notice, and how to move it. */
  readonly asking: { readonly id: null | string; readonly set: (id: null | string) => void };
  readonly item: PoolNotification;
  readonly deliveries: readonly DeliveryEntry[];
  /** Not read before this visit: it is marked read as the feed opens, and still shows as new here. */
  readonly isUnread?: boolean;
  readonly listed: ListedSessions;
  readonly zoned: Zoned;
}) => {
  const t = useT();
  const state = signInState(item, listed);
  return (
    <View className="gap-2 px-row-x py-row-y" testID={`notification-${item.id}`}>
      <View className="flex-row items-start gap-row-gap">
        <View className="min-h-6 justify-center">
          <Icon name={KIND_ICON[item.kind]} tone="secondary" />
        </View>
        <View className="min-w-0 flex-1">
          <Body isOwn={state === "own"} isUnread={isUnread} item={item} zoned={zoned} />
        </View>
        <View className="min-h-6 flex-row items-center gap-2">
          {isUnread ? (
            <View
              accessibilityLabel={t("notifications.unread")}
              accessible
              className="size-2 rounded-pill bg-danger"
              testID="unread-dot"
            />
          ) : null}
          <Text numeric role="caption" tone="tertiary">
            {clockTime(item.createdAt, zoned.zone)}
          </Text>
        </View>
      </View>
      <View className="ml-8 gap-2">
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
            <Text key={index} role="caption" tone="tertiary">
              {line}
            </Text>
          ))}
      </View>
    </View>
  );
};
