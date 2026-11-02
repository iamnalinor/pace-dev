import { type ReactNode, useEffect, useRef } from "react";
import { Text, View } from "react-native";

import type { PhoneCalendarEvent } from "#app/platform/phone-calendar.ts";

import { useAppState, usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { openUsageAccessSettings } from "#app/platform/phone-data.ts";
import { calendarKey } from "#app/platform/phone-memory.ts";
import { isAttendableNow } from "#app/shared/tracking/calendar-today.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { useToast } from "#app/ui/toast.tsx";
import { type DayEntry, type DayRow, isCalendarRun } from "@pace/client";
import { formatDuration } from "@pace/core";

import { type DayPhone, isCalendarLogged, type NamedApp } from "./use-day-phone.ts";

/** How many apps a block's phone line names. */
const TOP_APPS = 3;

/** The width of Day's time column (the blocks' start and end). */
export const TIME_WIDTH = "w-24";

/**
What sits under a block (its task, apps, prompts) starts at the block's words: a spacer as wide as
the time column and the row's gap, so the indent follows the scale on every platform.
*/
export const UnderBlock = ({ children }: { readonly children: ReactNode }) => (
  <View className="flex-row gap-3">
    <View className={TIME_WIDTH} />
    <View className="min-w-0 flex-1">{children}</View>
  </View>
);

/** "Phone 23m: Telegram 15m, YouTube 8m" under a block, when the phone was used in it. */
export const UsageLine = ({ apps }: { readonly apps: readonly NamedApp[] }) => {
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
  return (
    <Text className="pb-2 font-sans text-caption font-normal text-label-tertiary" numberOfLines={2}>
      {t("phone.usage", { apps: named, duration: formatDuration(total, language) })}
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
    <View className="pb-2">
      <Button
        onPress={() => {
          void run(actions.stopActivity({ at: pickupAt }));
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

/** For a repeating event, the toast's offer to give the same answer for the whole series. */
const useEveryTime = (phone: DayPhone, event: PhoneCalendarEvent) => {
  const t = useT();
  const toast = useToast();
  const { series } = event;
  return (rule: "attended" | "skip") =>
    series === null
      ? undefined
      : {
          label: t("phone.everyTime"),
          onPress: () => {
            phone.remember({ rule, series, title: event.title });
            toast.show({ message: t("phone.ruleSaved") });
          },
        };
};

/**
One event: its time and title, then Attended (it becomes a block, or starts now if the event
has not begun) / Skip, or "logged" once it
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
  const { now } = useViewer();
  // Attended ahead of its start, it runs from the tap: not on the day's blocks yet, but answered.
  const isStarted = useAppState((state) =>
    Object.values(state.time.activities).some((activity) => isCalendarRun(event, activity)),
  );
  const everyTime = useEveryTime(phone, event);
  return (
    <View className="flex-row items-center gap-2 border-t border-separator py-2">
      <Text className="w-20 font-sans text-caption font-normal tabular-nums text-label-tertiary">
        {`${clockTime(event.startAt, zone)}–${clockTime(event.endAt, zone)}`}
      </Text>
      <Text
        className="flex-1 font-sans text-subhead font-normal text-label-primary"
        numberOfLines={2}
      >
        {event.title}
      </Text>
      {isStarted ||
      phone.calendar.isAttendedElsewhere(event) ||
      isCalendarLogged(entries, event) ? (
        <Text className="font-sans text-caption font-normal text-label-tertiary">
          {t("phone.logged")}
        </Text>
      ) : (
        <View className="flex-row">
          {isAttendableNow(event, now) && (
            <Button
              onPress={() => {
                const action = everyTime("attended");
                // A recurring event offers to remember the answer for the whole series.
                void run(
                  actions.startCalendar(event),
                  action === undefined
                    ? undefined
                    : { action, success: t("phone.attendedDone", { title: event.title }) },
                );
              }}
              variant="ghost"
            >
              {t("day.attended")}
            </Button>
          )}
          <Button
            onPress={() => {
              void (async () => {
                if (!(await phone.skip(event))) {
                  toast.show({ message: t("notifications.failedAction") });
                  return;
                }
                const action = everyTime("skip");
                if (action !== undefined) {
                  toast.show({ action, message: t("day.skipped") });
                }
              })();
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
      <Text className="mx-5 mt-4 font-sans text-caption font-normal text-label-tertiary">
        {t("phone.calendarDenied")}
      </Text>
    );
  }
  if (events.length === 0) {
    return null;
  }
  return (
    <View accessibilityLabel={t("day.calendar")} className="mx-5 mt-4 gap-1" role="group">
      <Text
        accessibilityRole="header"
        className="font-sans text-footnote font-medium text-label-primary"
      >
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
