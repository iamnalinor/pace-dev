import { Moon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { usePace, useSettings, useT } from "#app/app-state.tsx";
import { BackToToday } from "#app/shared/back-to-today.tsx";
import { useBack } from "#app/shared/use-back.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { WeekArrows } from "#app/shared/week-arrows.tsx";
import { cx } from "#app/ui/cx.ts";
import { useIsWide } from "#app/ui/layout.ts";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { SplitPane } from "#app/ui/split-pane.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { Tooltip } from "#app/ui/tooltip.tsx";
import { fitHourPx, gridFromHour, type WeekModel } from "@pace/client";
import { useCalendarRange, useUsage } from "@pace/client/react";
import { addDaysIn, type Language } from "@pace/core";

import { PickedPane, PickedSheet } from "./picked-details.tsx";
import { BOTTOM_PX, LABELS_PX, type Picked, pickedKey, WeekGrid } from "./week-grid.tsx";

/** An hour is never drawn shorter than this; a day that would need less scrolls instead. */
const HOUR_FLOOR_PX = 18;

/** On a phone a day column keeps this width at least, and the week scrolls sideways. */
const PHONE_COLUMN_PX = 72;

/** "5 Oct", "5 окт." */
const monthDay = (date: string, zone: string, language: Language): string =>
  new Intl.DateTimeFormat(language, { day: "numeric", month: "short", timeZone: zone }).format(
    new Date(date),
  );

/** The moon: the night hours (00–07) on the grid, or not; the same switch as in Settings. */
const NightHoursToggle = () => {
  const t = useT();
  const { actions } = usePace();
  const { nightHours } = useSettings();
  const { palette } = useTheme();
  const label = t("week.nightHours");
  return (
    <Tooltip label={label}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="switch"
        aria-checked={nightHours}
        className={cx(
          "h-11 w-11 items-center justify-center rounded-md active:opacity-80",
          nightHours && "bg-accentQuiet",
        )}
        onPress={() => {
          void actions.setNightHours(!nightHours);
        }}
      >
        <Moon
          color={nightHours ? palette.accentQuietFg : palette.fg2}
          size={18}
          strokeWidth={1.75}
        />
      </Pressable>
    </Tooltip>
  );
};

/** [moon] [Back to today] [‹] [›]: Back to today only on a week that is not this one. */
const WeekNav = ({
  onWeek,
  week,
}: {
  readonly week: WeekModel;
  readonly onWeek: (weekOf: null | string) => void;
}) => (
  <View className="flex-row items-center gap-1">
    <NightHoursToggle />
    <BackToToday
      isAway={!week.isCurrent}
      onPress={() => {
        onWeek(null);
      }}
    />
    <WeekArrows next={week.next} onWeek={onWeek} previous={week.previous} />
  </View>
);

type GridArgs = Omit<Parameters<typeof WeekGrid>[0], "hourPx" | "minColumnPx">;

/**
The grid in the height the screen leaves it: the hours share that height, so the whole day is
in sight without scrolling; only when an hour would be shorter than the floor does it scroll.
*/
const FittedGrid = (props: GridArgs) => {
  const t = useT();
  const isWide = useIsWide();
  const [available, setAvailable] = useState(0);
  const hours = 24 - gridFromHour(props.week, props.calendar);
  const { hourPx, scrolls } = fitHourPx({
    available: available - LABELS_PX - BOTTOM_PX - (isWide ? 0 : BOTTOM_PX),
    floorPx: HOUR_FLOOR_PX,
    hours,
  });
  return (
    <View
      className="flex-1"
      onLayout={(event) => {
        setAvailable(event.nativeEvent.layout.height);
      }}
      testID="week-body"
    >
      <ScrollView className="flex-1" scrollEnabled={scrolls} testID="week-scroller">
        <WeekGrid {...props} hourPx={hourPx} minColumnPx={isWide ? 0 : PHONE_COLUMN_PX} />
      </ScrollView>
      {isWide ? null : (
        <View className="h-6 items-end justify-center pr-3">
          <Text className="font-sans text-[11px] text-muted">{t("week.scrollHint")}</Text>
        </View>
      )}
    </View>
  );
};

/** The week's grid under its header: the dates, the moon, Back to today and the arrows. */
const WeekPage = ({
  onPick,
  onWeek,
  picked,
  week,
}: {
  readonly week: WeekModel;
  readonly picked: null | Picked;
  readonly onPick: (picked: Picked) => void;
  readonly onWeek: (weekOf: null | string) => void;
}) => {
  const t = useT();
  const { api } = usePace();
  const { language, now } = useViewer();
  const calendar = useCalendarRange(api, week.weekStart, week.weekEnd);
  const usage = useUsage(api, week.weekStart, week.weekEnd);
  const lastDay = addDaysIn(week.weekStart, 6, week.zone);
  // A phone opens Week from More: the chevron goes back there; beside the sidebar there is none.
  const back = useBack();
  return (
    <Screen
      fills
      header={
        <ScreenHeader
          {...(back !== undefined && { backLabel: t("common.back"), onBack: back })}
          eyebrow={`${monthDay(week.weekStart, week.zone, language)} – ${monthDay(lastDay, week.zone, language)}`}
          right={<WeekNav onWeek={onWeek} week={week} />}
          title={t("nav.week")}
        />
      }
    >
      <FittedGrid
        calendar={calendar}
        language={language}
        now={now}
        onPick={onPick}
        selectedKey={picked === null ? null : pickedKey(picked)}
        usage={usage}
        week={week}
      />
    </Screen>
  );
};

/**
The week as lived: Monday to Sunday on one hour grid that fits the screen, tracked time filled
in its color, the calendar's events outlined, a thin strip where some device was in use. A tap
tells more: beside the grid on a wide window, in a sheet on a phone.
*/
export const WeekScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const isWide = useIsWide();
  const [weekOf, setWeekOf] = useState<null | string>(null);
  const [picked, setPicked] = useState<null | Picked>(null);
  const week = hooks.useWeek(weekOf);
  const close = (): void => {
    setPicked(null);
  };
  const grid = (
    <WeekPage
      onPick={setPicked}
      onWeek={(next) => {
        setWeekOf(next);
        // What was picked belongs to the week it was on.
        setPicked(null);
      }}
      picked={picked}
      week={week}
    />
  );
  if (isWide) {
    return (
      <SplitPane
        main={grid}
        side={<PickedPane onClose={close} picked={picked} week={week} />}
        sideLabel={t("week.details")}
      />
    );
  }
  return (
    <>
      {grid}
      {picked === null ? null : <PickedSheet onClose={close} picked={picked} week={week} />}
    </>
  );
};
