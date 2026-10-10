import { useRouter } from "expo-router";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { useAppState, usePace, useT } from "#app/app-state.tsx";
import { fromWallClock } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Calendar } from "#app/ui/calendar.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { type DayModel, trackedDates } from "@pace/client";
import { formatInZone } from "@pace/core";

/** The week this day sits in, on one grid. */
const WeekLink = () => {
  const t = useT();
  const router = useRouter();
  return (
    <IconButton
      icon={CalendarRange}
      label={t("week.open")}
      onPress={() => {
        router.push("/week");
      }}
      variant="plain"
    />
  );
};

/**
[Week] [Today] [‹] [calendar] [›]: Today keeps its place (disabled on today) so the arrows never
move under the thumb; the calendar jumps to any past day, days with time on them dotted.
*/
export const DayNav = ({
  day,
  onDate,
}: {
  readonly day: DayModel;
  readonly onDate: (date: null | string) => void;
}) => {
  const t = useT();
  const { hooks } = usePace();
  const { language, now } = useViewer();
  const ctx = hooks.useClock();
  const state = useAppState((current) => current);
  const marked = useMemo(() => trackedDates(state, ctx), [ctx, state]);
  const [isPicking, setIsPicking] = useState(false);
  const shown = formatInZone(day.date, day.zone, "yyyy-MM-dd");
  const today = formatInZone(now, day.zone, "yyyy-MM-dd");
  return (
    <View className="flex-row items-center gap-1">
      <WeekLink />
      <Button
        disabled={day.isToday}
        onPress={() => {
          onDate(null);
        }}
        variant="secondary"
      >
        {t("day.today")}
      </Button>
      <IconButton
        icon={ChevronLeft}
        label={t("day.previous")}
        onPress={() => {
          onDate(day.previous);
        }}
        variant="plain"
      />
      <IconButton
        icon={CalendarDays}
        label={t("day.pick")}
        onPress={() => {
          setIsPicking(true);
        }}
        variant="plain"
      />
      <IconButton
        disabled={day.next === null}
        icon={ChevronRight}
        label={t("day.next")}
        onPress={() => {
          onDate(day.next);
        }}
        variant="plain"
      />
      <Sheet
        closeLabel={t("common.close")}
        onClose={() => {
          setIsPicking(false);
        }}
        title={t("day.pick")}
        visible={isPicking}
      >
        <Calendar
          labels={{ next: t("calendar.nextMonth"), previous: t("calendar.previousMonth") }}
          language={language}
          marked={marked}
          max={today}
          onPick={(date) => {
            setIsPicking(false);
            onDate(date === today ? null : fromWallClock({ date, time: "00:00", tz: day.zone }));
          }}
          selected={shown}
          today={today}
        />
      </Sheet>
    </View>
  );
};
