import type { View } from "react-native";

import { type RefObject, useMemo, useState } from "react";

import { useAppState, usePace, useT } from "#app/app-state.tsx";
import { fromWallClock } from "#app/format/time.ts";
import { PeriodStepper } from "#app/shared/period-stepper.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Calendar } from "#app/ui/calendar.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { Popover } from "#app/ui/popover.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { type DayModel, trackedDates } from "@pace/client";
import { formatInZone } from "@pace/core";

/** The date picker's calendar over the days with time on them (dotted). */
const DayCalendar = ({
  day,
  onPick,
}: {
  readonly day: DayModel;
  readonly onPick: (date: null | string) => void;
}) => {
  const t = useT();
  const { hooks } = usePace();
  const { language, now } = useViewer();
  const ctx = hooks.useClock();
  const state = useAppState((current) => current);
  const marked = useMemo(() => trackedDates(state, ctx), [ctx, state]);
  const shown = formatInZone(day.date, day.zone, "yyyy-MM-dd");
  const today = formatInZone(now, day.zone, "yyyy-MM-dd");
  return (
    <Calendar
      labels={{ next: t("calendar.nextMonth"), previous: t("calendar.previousMonth") }}
      language={language}
      marked={marked}
      max={today}
      onPick={(date) => {
        onPick(date === today ? null : fromWallClock({ date, time: "00:00", tz: day.zone }));
      }}
      selected={shown}
      today={today}
    />
  );
};

/**
The day's `PeriodStepper` (‹ date › and Today away from today): the date opens the calendar, in a
popover under it on a computer and in a sheet on a phone.
*/
export const DayNav = ({
  day,
  label,
  onDate,
}: {
  readonly day: DayModel;
  /** The day in words. */
  readonly label: string;
  readonly onDate: (date: null | string) => void;
}) => {
  const t = useT();
  const { language } = useViewer();
  const isWide = useIsWide();
  const [picking, setPicking] = useState<null | RefObject<null | View>>(null);
  const close = (): void => {
    setPicking(null);
  };
  const pick = (date: null | string): void => {
    close();
    onDate(date);
  };
  return (
    <>
      <PeriodStepper
        isAway={!day.isToday}
        label={label}
        labelAction={t("day.pick")}
        nextLabel={t("day.next")}
        onLabel={setPicking}
        onNext={
          day.next === null
            ? null
            : () => {
                onDate(day.next);
              }
        }
        onPrevious={() => {
          onDate(day.previous);
        }}
        onToday={() => {
          onDate(null);
        }}
        previousLabel={t("day.previous")}
        shortLabel={new Intl.DateTimeFormat(language, {
          day: "numeric",
          month: "short",
          timeZone: day.zone,
          weekday: "short",
        }).format(new Date(day.date))}
        todayLabel={t("period.today")}
      />
      {isWide && picking !== null ? (
        <Popover anchor={picking} label={t("day.pick")} onClose={close} open>
          <DayCalendar day={day} onPick={pick} />
        </Popover>
      ) : null}
      {isWide ? null : (
        <Sheet
          closeLabel={t("common.close")}
          name="day-picker"
          onClose={close}
          open={picking !== null}
          title={t("day.pick")}
        >
          <DayCalendar day={day} onPick={pick} />
        </Sheet>
      )}
    </>
  );
};
