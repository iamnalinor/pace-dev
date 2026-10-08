import { useEffect, useRef } from "react";
import { Text, View } from "react-native";

import type { PhoneCalendarEvent } from "#app/platform/phone-calendar.ts";
import type { DayEntry, DayRow } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { openUsageAccessSettings } from "#app/platform/phone-data.ts";
import { calendarKey, sleepKey } from "#app/platform/phone-memory.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { inkClass, washClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { useToast } from "#app/ui/toast.tsx";
import { CATEGORY_COLORS, countedMinutes, FOCUS_CATEGORIES, formatDuration } from "@pace/core";

import { type DayPhone, isCalendarLogged, type NamedApp } from "./use-day-phone.ts";

/** Sleep is drawn in the sleep category's color, like its blocks on the day. */
const SLEEP_COLOR = CATEGORY_COLORS.sleep;

/** How many apps a block's phone line names. */
const TOP_APPS = 3;

/** "Last night": the screen's guess at the sleep, to log in one tap or wave away. */
export const SleepCard = ({ phone, zone }: { readonly phone: DayPhone; readonly zone: string }) => {
  const t = useT();
  const { language } = useViewer();
  const { actions } = usePace();
  const run = useRunAction();
  const { sleep } = phone;
  if (sleep === null) {
    return null;
  }
  const summary = [
    t("phone.sleep", {
      duration: formatDuration(sleep.minutes, language),
      from: clockTime(sleep.startAt, zone),
      to: clockTime(sleep.endAt, zone),
    }),
    ...(sleep.wakeUps > 0 ? [t("phone.wakeUps", { count: sleep.wakeUps })] : []),
  ].join(" · ");
  return (
    <View
      accessibilityLabel={t("phone.sleepTitle")}
      className={cx("mx-5 mb-3 gap-2 rounded-xl border p-3.5", washClass(SLEEP_COLOR))}
    >
      <Text className={cx("font-sans text-[12px] font-medium", inkClass(SLEEP_COLOR))}>
        {t("phone.sleepTitle")}
      </Text>
      <Text className="font-sans text-[15px] text-fg">{summary}</Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            onPress={() => {
              phone.answered(sleepKey(sleep));
              void run(
                actions.logPast({
                  category: "sleep",
                  endAt: sleep.endAt,
                  label: t("phone.sleepLabel"),
                  startAt: sleep.startAt,
                }),
                { success: t("phone.sleepLogged"), undo: true },
              );
            }}
          >
            {t("phone.logSleep")}
          </Button>
        </View>
        <View className="flex-1">
          <Button
            onPress={() => {
              phone.dismiss(sleepKey(sleep));
            }}
            variant="secondary"
          >
            {t("phone.notSleep")}
          </Button>
        </View>
      </View>
    </View>
  );
};

/**
"Phone 23m: Telegram 15m, YouTube 8m" under a block, when the phone was used in it. A focus
block also says what it counts once a quarter of the messenger time is taken off.
*/
export const UsageLine = ({
  apps,
  row,
}: {
  readonly apps: readonly NamedApp[];
  readonly row: Pick<DayRow, "category" | "messengersOnPurpose" | "minutes">;
}) => {
  const t = useT();
  const { language } = useViewer();
  if (apps.length === 0) {
    return null;
  }
  const total = apps.map((app) => app.minutes).reduce((sum, minutes) => sum + minutes, 0);
  const named = apps
    .slice(0, TOP_APPS)
    .map((app) => `${app.name} ${formatDuration(app.minutes, language)}`)
    .join(", ");
  const { counted } = countedMinutes(row.minutes, apps, { onPurpose: row.messengersOnPurpose });
  const parts = [
    t("phone.usage", { apps: named, duration: formatDuration(total, language) }),
    ...(FOCUS_CATEGORIES.has(row.category) && counted !== row.minutes
      ? [t("phone.counted", { duration: formatDuration(counted, language) })]
      : []),
  ];
  return (
    <Text className="pb-2 pl-[98px] font-sans text-[12px] text-muted" numberOfLines={2}>
      {parts.join(" · ")}
    </Text>
  );
};

/** Under a running block that is past its Expect: end it when the phone was picked up. */
export const EndedAtPrompt = ({
  phone,
  row,
  zone,
}: {
  readonly phone: DayPhone;
  readonly row: DayRow;
  readonly zone: string;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const { pickupAt } = phone;
  const isOverExpect = row.expectMinutes !== null && row.minutes > row.expectMinutes;
  if (pickupAt === null || !isOverExpect || !row.isRunning || pickupAt <= row.startAt) {
    return null;
  }
  const time = clockTime(pickupAt, zone);
  return (
    <View className="pb-2 pl-[98px]">
      <Button
        onPress={() => {
          void run(actions.stopActivity({ at: pickupAt }), {
            success: t("time.stopped", { label: row.label }),
            undo: true,
          });
        }}
        variant="ghost"
      >
        {t("phone.endedAt", { time })}
      </Button>
    </View>
  );
};

/** Day without usage access: one line that opens the Android screen granting it. */
export const UsageAccessHint = () => {
  const t = useT();
  return (
    <View className="mx-5 mb-3">
      <Button onPress={openUsageAccessSettings} variant="ghost">
        {t("phone.usageAsk")}
      </Button>
    </View>
  );
};

/**
One event: its time and title, then Attended (it becomes a block) / Skip, or "logged" once it
is on the day. A repeating event's toast offers "Every time" for the whole series.
*/
const CalendarRow = ({
  entries,
  event,
  phone,
  zone,
}: {
  readonly entries: readonly DayEntry[];
  readonly event: PhoneCalendarEvent;
  readonly phone: DayPhone;
  readonly zone: string;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const toast = useToast();
  const { series } = event;
  const everyTime = (rule: "attended" | "skip") =>
    series === null
      ? undefined
      : {
          label: t("phone.everyTime"),
          onPress: () => {
            phone.remember({ rule, series, title: event.title });
            toast.show({ message: t("phone.ruleSaved") });
          },
        };
  return (
    <View className="flex-row items-center gap-2 border-t border-line py-2">
      <Text className="w-[86px] font-mono text-[12px] text-muted">
        {`${clockTime(event.startAt, zone)}–${clockTime(event.endAt, zone)}`}
      </Text>
      <Text className="flex-1 font-sans text-[14px] text-fg" numberOfLines={2}>
        {event.title}
      </Text>
      {isCalendarLogged(entries, event) ? (
        <Text className="font-sans text-[12px] text-muted">{t("phone.logged")}</Text>
      ) : (
        <View className="flex-row">
          <Button
            onPress={() => {
              phone.answered(calendarKey(event));
              void run(
                actions.logPast({
                  category: "other",
                  endAt: event.endAt,
                  label: event.title,
                  startAt: event.startAt,
                }),
                {
                  action: everyTime("attended"),
                  success: t("phone.attendedDone", { title: event.title }),
                  undo: true,
                },
              );
            }}
            variant="ghost"
          >
            {t("day.attended")}
          </Button>
          <Button
            onPress={() => {
              phone.dismiss(calendarKey(event));
              const action = everyTime("skip");
              if (action !== undefined) {
                toast.show({ action, message: t("day.skipped") });
              }
            }}
            variant="ghost"
          >
            {t("phone.skip")}
          </Button>
        </View>
      )}
    </View>
  );
};

/** Logs the ended events of "always attended" series once each, as the person asked. */
const useSeriesAutoLog = (phone: DayPhone): void => {
  const { actions } = usePace();
  const loggedRef = useRef(new Set<string>());
  const { autoLog } = phone.calendar;
  useEffect(() => {
    for (const event of autoLog) {
      const key = calendarKey(event);
      if (loggedRef.current.has(key)) {
        continue;
      }
      loggedRef.current.add(key);
      void actions.logPast({
        category: "other",
        endAt: event.endAt,
        label: event.title,
        startAt: event.startAt,
      });
    }
  }, [actions, autoLog]);
};

export const CalendarSection = ({
  entries,
  phone,
  zone,
}: {
  readonly entries: readonly DayEntry[];
  readonly phone: DayPhone;
  readonly zone: string;
}) => {
  const t = useT();
  useSeriesAutoLog(phone);
  const { access, events } = phone.calendar;
  if (access === "undetermined") {
    return (
      <View className="mx-5 mt-4">
        <Button onPress={phone.askCalendar} variant="secondary">
          {t("phone.calendarAsk")}
        </Button>
      </View>
    );
  }
  if (access === "denied") {
    return (
      <Text className="mx-5 mt-4 font-sans text-[12px] text-muted">
        {t("phone.calendarDenied")}
      </Text>
    );
  }
  if (events.length === 0) {
    return null;
  }
  return (
    <View accessibilityLabel={t("day.calendar")} className="mx-5 mt-4 gap-1">
      <Text accessibilityRole="header" className="font-sans text-[13px] font-medium text-fg">
        {t("day.calendar")}
      </Text>
      {events.map((event) => (
        <CalendarRow
          entries={entries}
          event={event}
          key={calendarKey(event)}
          phone={phone}
          zone={zone}
        />
      ))}
    </View>
  );
};
