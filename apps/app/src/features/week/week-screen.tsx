import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { useIsAccountUnknown, usePace, useSettings, useT } from "#app/app-state.tsx";
import { useBack } from "#app/shared/use-back.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useSearchParam, useZonedDateParam } from "#app/shared/use-search-param.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { WeekPeriod } from "#app/shared/week-period.tsx";
import { Button } from "#app/ui/button.tsx";
import { cx } from "#app/ui/cx.ts";
import { EmptyState, FirstSyncBody } from "#app/ui/empty-state.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";
import { Pressable } from "#app/ui/pressable.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { Shell } from "#app/ui/shell.tsx";
import { Text } from "#app/ui/text.tsx";
import { Tooltip } from "#app/ui/tooltip.tsx";
import { fitHourPx, gridFromHour, type WeekModel } from "@pace/client";
import { useCalendarRange, useUsage } from "@pace/client/react";
import { formatWeekRange } from "@pace/core";

import { PickedPane, PickedSheet } from "./picked-details.tsx";
import { BOTTOM_PX, LABELS_PX, WeekGrid } from "./week-grid.tsx";
import { type Picked, pickedKey } from "./week-picked.ts";

/** An hour is never drawn shorter than this; a day that would need less scrolls instead. */
const HOUR_FLOOR_PX = 18;

/** On a phone a day column keeps this width at least, and the week scrolls sideways. */
const PHONE_COLUMN_PX = 72;

/**
The moon: the night hours (00–07) on the grid, or not; the same switch as in Settings, so the same
rule: during the first sync of an empty copy the account's value is not known, and its place stays
empty (no default drawn as the account's, no tap that writes over it; QA round 20 M1).
*/
const NightHoursToggle = () => {
  const t = useT();
  const { actions } = usePace();
  const { nightHours } = useSettings();
  const run = useRunAction();
  // Until a sync of this session succeeded, a failed first pull included (round 7 review 12).
  const isUnknown = useIsAccountUnknown();
  if (isUnknown) {
    return <View className="h-hit-web w-hit-web" />;
  }
  const label = t("week.nightHours");
  return (
    <Tooltip label={label}>
      <Pressable
        checked={nightHours}
        className={cx(
          "h-hit-web flex-row items-center justify-center gap-1 rounded-pill px-3",
          nightHours && "bg-fill-3",
        )}
        label={label}
        onPress={() => {
          void run(actions.setNightHours(!nightHours));
        }}
        role="switch"
      >
        <Icon name="moon" tone={nightHours ? "accent" : "secondary"} />
        {/* In words: a bare moon read as a dark-mode switch (design review M13). */}
        <Text role="footnote" tone={nightHours ? "primary" : "secondary"}>
          {label}
        </Text>
      </Pressable>
    </Tooltip>
  );
};

/** The calendar layer could not be read: a line under the day strip's header, with a way to retry. */
const CalendarFailed = ({ onRetry }: { readonly onRetry: () => void }) => {
  const t = useT();
  return (
    <View className="flex-row items-center gap-2 px-gutter" role="alert">
      <Text className="flex-1" role="footnote" tone="secondary">
        {t("week.calendarFailed")}
      </Text>
      <Button onPress={onRetry} size="small" variant="plain">
        {t("common.retry")}
      </Button>
    </View>
  );
};

/** A week with nothing in it: what lands here, and the way to Now. */
const EmptyWeek = () => {
  const t = useT();
  const router = useRouter();
  return (
    <EmptyState
      action={
        <Button
          onPress={() => {
            router.navigate("/");
          }}
          size="small"
          variant="secondary"
        >
          {t("week.openNow")}
        </Button>
      }
      body={t("week.emptyBody")}
      title={t("week.empty")}
    />
  );
};

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
          <Text role="caption" tone="tertiary">
            {t("week.scrollHint")}
          </Text>
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
  const calendarRead = useCalendarRange(api, week.weekStart, week.weekEnd);
  const calendar = calendarRead.rows;
  const usage = useUsage(api, week.weekStart, week.weekEnd);
  const isEmpty =
    week.days.every((day) => day.blocks.length === 0) &&
    calendar.length === 0 &&
    usage.length === 0;
  // A phone opens Week from More: the chevron goes back there; beside the sidebar there is none.
  const back = useBack();
  return (
    <Screen
      fills
      header={
        <ScreenHeader
          {...(back !== undefined && { backLabel: t("common.back"), onBack: back })}
          actions={<NightHoursToggle />}
          period={
            <WeekPeriod
              isAway={!week.isCurrent}
              // Insights' form: one range, one format, and short enough for the pill in RU (N2).
              label={formatWeekRange(week.weekStart, week.zone, language)}
              next={week.next}
              onWeek={onWeek}
              previous={week.previous}
            />
          }
          title={t("nav.week")}
          variant="top"
        />
      }
    >
      <FirstSyncBody>
        {calendarRead.isFailed ? <CalendarFailed onRetry={calendarRead.retry} /> : null}
        {isEmpty && !calendarRead.isFailed ? <EmptyWeek /> : null}
        <FittedGrid
          calendar={calendar}
          language={language}
          now={now}
          onPick={onPick}
          selectedKey={picked === null ? null : pickedKey(picked)}
          usage={usage}
          week={week}
        />
      </FirstSyncBody>
    </Screen>
  );
};

/**
What the grid has picked: a tracked block from the address (`?block=<id>`), so a reload opens
it again; a calendar event or a folded run stays on the screen only (the phone's calendar is read
again after a reload, so what it held may be gone). A block the week does not hold is no pick, and
nothing is written back.
*/
const usePicked = (week: WeekModel): readonly [null | Picked, (next: null | Picked) => void] => {
  const [blockId, setBlockId] = useSearchParam("block");
  // An event or a run belongs to the week it was picked on: browser Back or Forward changes the
  // week in the address and keeps the screen mounted, so another week reads as no pick, derived
  // and not written back (review of round 24, I1; bug-lessons 201).
  const [kept, setKept] = useState<null | { readonly picked: Picked; readonly weekStart: string }>(
    null,
  );
  const other = kept?.weekStart === week.weekStart ? kept.picked : null;
  const block =
    blockId === null
      ? undefined
      : week.days.flatMap((day) => day.blocks).find((item) => item.id === blockId);
  const picked: null | Picked = block === undefined ? other : { block, kind: "block" };
  const pick = (next: null | Picked): void => {
    setKept(
      next === null || next.kind === "block" ? null : { picked: next, weekStart: week.weekStart },
    );
    const nextBlock = next?.kind === "block" ? next.block.id : null;
    if (nextBlock !== blockId) {
      setBlockId(nextBlock);
    }
  };
  return [picked, pick];
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
  // The week and a picked block are in the address (`?week=`, `?block=`; feedback 5 item 6).
  const [weekOf, setWeekOf] = useZonedDateParam("week");
  const week = hooks.useWeek(weekOf);
  const [picked, setPicked] = usePicked(week);
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
    // The inspector opens with a pick and closes without one: the grid keeps the width (F-LAY-03).
    return (
      <Shell
        content={grid}
        inspector={
          picked === null ? undefined : (
            <PickedPane onClose={close} onPick={setPicked} picked={picked} week={week} />
          )
        }
        inspectorLabel={t("week.details")}
        inspectorOpen={picked !== null}
        onInspectorClose={close}
      />
    );
  }
  return (
    <>
      {grid}
      <OverlayPresence value={picked}>
        {(kept) => <PickedSheet onClose={close} onPick={setPicked} picked={kept} week={week} />}
      </OverlayPresence>
    </>
  );
};
