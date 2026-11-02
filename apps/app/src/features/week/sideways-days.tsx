import { type ReactNode, useEffect, useRef } from "react";
import { ScrollView } from "react-native";

import type { WeekModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";

/**
Where the phone's days scroll to when a week shows: today with the day before in sight, or the
Monday of a week without today. `null` while the same week stays: the person's own scroll is
kept (the calendar arriving must not pull it back).
*/
export const sidewaysStart = ({
  columnPx,
  scrolledWeek,
  week,
}: {
  readonly week: Pick<WeekModel, "days" | "weekStart">;
  /** The week the days were last scrolled for; `null` before the first. */
  readonly scrolledWeek: null | string;
  /** Each day's column width: a day with side-by-side blocks is wider. */
  readonly columnPx: readonly number[];
}): null | number => {
  if (scrolledWeek === week.weekStart) {
    return null;
  }
  const before = Math.max(0, week.days.findIndex((day) => day.isToday) - 1);
  return columnPx.slice(0, before).reduce((sum, width) => sum + width, 0);
};

/** The phone's days, scrolled sideways once per week shown (see `sidewaysStart`). */
export const SidewaysDays = ({
  children,
  columnPx,
  week,
}: {
  readonly children: ReactNode;
  readonly columnPx: readonly number[];
  readonly week: WeekModel;
}) => {
  const t = useT();
  const scrollerRef = useRef<ScrollView>(null);
  const scrolledWeekRef = useRef<null | string>(null);
  const scrollToStart = (): void => {
    const x = sidewaysStart({ columnPx, scrolledWeek: scrolledWeekRef.current, week });
    if (x === null || scrollerRef.current === null) {
      return;
    }

    scrollerRef.current.scrollTo({ animated: false, x });
    scrolledWeekRef.current = week.weekStart;
  };
  // Another week keeps the same width, so its content size never changes: every render asks,
  // and `sidewaysStart` answers only for a week not scrolled for yet.
  useEffect(scrollToStart);
  return (
    <ScrollView
      accessibilityLabel={t("week.scrollHint")}
      contentContainerClassName="min-w-full flex-row"
      horizontal
      onContentSizeChange={scrollToStart}
      ref={scrollerRef}
      tabIndex={0}
      testID="week-days"
    >
      {children}
    </ScrollView>
  );
};
