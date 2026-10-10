import { useState } from "react";
import { Text, View } from "react-native";

import type { WeekModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useWhereSat } from "#app/shared/use-where-sat.ts";
import { WeekArrows } from "#app/shared/week-arrows.tsx";
import { WhereSatLine } from "#app/shared/where-sat-line.tsx";
import { Button } from "#app/ui/button.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { useCalendarRange, useUsage } from "@pace/client/react";
import { addDaysIn, formatDuration, type Language } from "@pace/core";

import { dayLabel, type Picked, WeekGrid } from "./week-grid.tsx";

/** "5 Oct", "5 окт." */
const monthDay = (date: string, zone: string, language: Language): string =>
  new Intl.DateTimeFormat(language, { day: "numeric", month: "short", timeZone: zone }).format(
    new Date(date),
  );

/** [This week] [‹] [›], as on Day. */
const WeekNav = ({
  onWeek,
  week,
}: {
  readonly week: WeekModel;
  readonly onWeek: (weekOf: null | string) => void;
}) => {
  const t = useT();
  return (
    <View className="flex-row items-center gap-1">
      <Button
        disabled={week.next === null}
        onPress={() => {
          onWeek(null);
        }}
        variant="secondary"
      >
        {t("week.thisWeek")}
      </Button>
      <WeekArrows next={week.next} onWeek={onWeek} previous={week.previous} />
    </View>
  );
};

/** The block was time on a task: its page is one tap away. */
const OpenTaskButton = ({
  onOpened,
  taskId,
}: {
  readonly taskId: string;
  readonly onOpened: () => void;
}) => {
  const t = useT();
  const openTask = useOpenTask();
  return (
    <Button
      onPress={() => {
        onOpened();
        openTask(taskId);
      }}
      variant="secondary"
    >
      {t("week.openTask")}
    </Button>
  );
};

/** A tapped block (with where its time went) or calendar event. */
const PickedSheet = ({
  onClose,
  picked,
  week,
}: {
  readonly picked: Picked;
  readonly week: WeekModel;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const { language } = useViewer();
  const sat = useWhereSat(week.weekStart, week.weekEnd);
  const stretch = picked.kind === "block" ? picked.block : picked.event;
  const title = picked.kind === "block" ? picked.block.label : picked.event.title;
  const hours = `${clockTime(stretch.startAt, week.zone)}–${clockTime(stretch.endAt, week.zone)}`;
  const when = `${dayLabel(stretch.startAt, week.zone, language)}, ${hours}`;
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} subtitle={when} title={title} visible>
      {picked.kind === "block" ? (
        <View className="gap-1">
          <Text className="font-sans text-[14px] text-fg">
            {[
              t(`category.${picked.block.category}`),
              formatDuration(picked.block.minutes, language),
            ].join(" · ")}
          </Text>
          <View className="-ml-[98px]">
            <WhereSatLine rows={sat(stretch.startAt, stretch.endAt)} />
          </View>
          {picked.block.taskId === null ? null : (
            <OpenTaskButton onOpened={onClose} taskId={picked.block.taskId} />
          )}
        </View>
      ) : (
        <Text className="font-sans text-[14px] text-muted">{t("week.calendarEvent")}</Text>
      )}
    </Sheet>
  );
};

/**
The week as lived: Monday to Sunday on one hour grid, tracked time filled in its color, the
calendar's events outlined, a thin strip where some device was in use. A tap tells more.
*/
export const WeekScreen = () => {
  const t = useT();
  const { api, hooks } = usePace();
  const { language } = useViewer();
  const isWide = useIsWide();
  const [weekOf, setWeekOf] = useState<null | string>(null);
  const [picked, setPicked] = useState<null | Picked>(null);
  const week = hooks.useWeek(weekOf);
  const calendar = useCalendarRange(api, week.weekStart, week.weekEnd);
  const usage = useUsage(api, week.weekStart, week.weekEnd);
  const lastDay = addDaysIn(week.weekStart, 6, week.zone);
  const header = (
    <ScreenHeader
      eyebrow={`${monthDay(week.weekStart, week.zone, language)} – ${monthDay(lastDay, week.zone, language)}`}
      right={<WeekNav onWeek={setWeekOf} week={week} />}
      title={t("week.title")}
    />
  );
  return (
    <Screen header={header}>
      <WeekGrid
        calendar={calendar}
        hourPx={isWide ? 40 : 30}
        language={language}
        onPick={setPicked}
        usage={usage}
        week={week}
      />
      {picked === null ? null : (
        <PickedSheet
          onClose={() => {
            setPicked(null);
          }}
          picked={picked}
          week={week}
        />
      )}
    </Screen>
  );
};
