import { useRouter } from "expo-router";
import { View } from "react-native";

import { useAppState, usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { IS_PHONE } from "#app/platform/device.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { isCalendarRun, type MessageKey, runningActivities } from "@pace/core";

import type { CalendarToday } from "./calendar-today.ts";

import { ChoiceItem, ChoiceList, ChoiceRow, type ListProps, Nothing } from "./choice-row.tsx";

/** Why there is nothing to pick: on the web the calendar is the copy the phone sends. */
const noEventsKey = (calendar: CalendarToday | null): MessageKey => {
  if (!IS_PHONE) {
    return "time.calendarNoneWeb";
  }
  return calendar?.access === "granted" ? "time.calendarNone" : "phone.calendarAsk";
};

/**
Nothing in the calendar: why, and the way on anyway — a meeting without an event (named later
on Day), on the web where the calendar comes from, on a phone without access its permissions.
*/
const NoEvents = ({ calendar, close, options, start }: ListProps) => {
  const t = useT();
  const router = useRouter();
  const { actions } = usePace();
  return (
    <View className="gap-2">
      <Nothing>{t(noEventsKey(calendar))}</Nothing>
      <ChoiceRow
        aside={null}
        label={t("time.calendarStartUntitled")}
        onPress={() => {
          start(
            actions.startActivity({
              alongside: options.alongside,
              buttonId: "calendar",
              category: "other",
              label: t("time.calendarUntitled"),
            }),
          );
        }}
      />
      {IS_PHONE ? null : (
        <ChoiceRow
          aside={null}
          label={t("time.calendarSetUp")}
          onPress={() => {
            close();
            router.push("/devices");
          }}
        />
      )}
      {/* The phone without calendar access: the way to grant it (the button's tooltip only says why). */}
      {IS_PHONE && calendar !== null && calendar.access !== "granted" ? (
        <ChoiceRow
          aside={null}
          label={t("permissions.title")}
          onPress={() => {
            close();
            router.push("/permissions");
          }}
        />
      ) : null}
    </View>
  );
};

/**
Calendar's picker: today's events from the calendar (own or accepted), or why there are none.
The event running already is checked, as in the other pickers, and picking it only closes.
*/
export const CalendarChoices = (props: ListProps) => {
  const t = useT();
  const { deviceTz, now } = useViewer();
  const { actions } = usePace();
  const time = useAppState((state) => state.time);
  const { calendar, close, options, start } = props;
  const events = calendar?.events ?? [];
  if (events.length === 0) {
    return <NoEvents {...props} />;
  }
  const running = runningActivities(time, now);
  return (
    <ChoiceList label={t("time.calendarToday")}>
      {events.map((event) => {
        const isRunning = running.some((activity) => isCalendarRun(event, activity));
        return (
          <ChoiceItem
            aside={`${clockTime(event.startAt, deviceTz)}–${clockTime(event.endAt, deviceTz)}`}
            isRunning={isRunning}
            key={event.id}
            label={event.title}
            onPress={() => {
              if (isRunning) {
                close();
                return;
              }
              start(actions.startCalendar(event, options));
            }}
          />
        );
      })}
    </ChoiceList>
  );
};
