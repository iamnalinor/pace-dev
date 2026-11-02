import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { type Ref, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { Language } from "@pace/core";

import {
  type CalendarDay,
  calendarKeyMove,
  monthGrid,
  monthOf,
  rovingDay,
  shiftMonth,
} from "@pace/client";

import { claimFocus } from "../platform/claim-focus.ts";
import { moveFocus } from "../platform/move-focus.ts";
import { refuseFocus } from "../platform/refuse-focus.ts";
import { cx } from "./cx.ts";
import { IconButton } from "./icon-button.tsx";
import { KEYBOARD } from "./use-hotkey.tsx";

/** January 1, 2024 was a Monday: day `n` of that week names weekday `n`. */
const WEEKDAY_SAMPLES = [1, 2, 3, 4, 5, 6, 7].map((day) => new Date(Date.UTC(2024, 0, day)));

/** "October 2026", "Октябрь 2026": the month on its own (no "г."), capitalized once. */
const monthTitle = (month: string, language: Language): string => {
  const date = new Date(`${month}-01T00:00:00Z`);
  const name = new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" }).format(date);
  return `${name.charAt(0).toLocaleUpperCase(language)}${name.slice(1)} ${month.slice(0, 4)}`;
};

const dayLabel = (date: string, language: Language): string =>
  new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${date}T00:00:00Z`));

/** The picked day on the quiet accent, the month's days in ink, the neighbours' faint. */
const ink = (cell: CalendarDay, isSelected: boolean): string => {
  if (isSelected) {
    return "font-semibold text-accentQuietFg";
  }
  return cell.isInMonth ? "text-fg" : "text-faint";
};

const NONE: ReadonlySet<string> = new Set();

export type CalendarLabels = { readonly previous: string; readonly next: string };

const DayCell = ({
  cell,
  isDisabled,
  isMarked,
  isSelected,
  isStop,
  isToday,
  language,
  onPick,
  ref,
}: {
  readonly cell: CalendarDay;
  readonly isDisabled: boolean;
  readonly isMarked: boolean;
  readonly isSelected: boolean;
  /** The grid's one tab stop (roving tab index): every other day is reached by the arrows. */
  readonly isStop: boolean;
  readonly isToday: boolean;
  readonly language: Language;
  readonly onPick: (date: string) => void;
  readonly ref?: Ref<View>;
}) => (
  <Pressable
    accessibilityLabel={dayLabel(cell.date, language)}
    accessibilityRole="button"
    aria-disabled={isDisabled}
    aria-selected={isSelected}
    className={cx(
      "h-10 flex-1 items-center justify-center rounded-lg active:opacity-70",
      isSelected && "bg-accentQuiet",
      !isSelected && isToday && "border-2 border-fg",
      isDisabled && "opacity-30",
    )}
    disabled={isDisabled}
    // A sheet's focus trap walks every descendant (react-native-web's), past the tab index: the
    // days other than the stop refuse it, so Shift+Tab into the grid lands on the stop.
    {...(!isStop && refuseFocus !== undefined && { onFocus: refuseFocus })}
    onPress={() => {
      onPick(cell.date);
    }}
    ref={ref}
    tabIndex={isStop ? 0 : -1}
  >
    <Text className={cx("font-sans text-[13px] tabular-nums", ink(cell, isSelected))}>
      {String(cell.day)}
    </Text>
    {isMarked ? (
      <View
        className={cx(
          "absolute bottom-1 h-1 w-1 rounded-full",
          isSelected ? "bg-accentQuietFg" : "bg-accentQuietText",
        )}
      />
    ) : null}
  </Pressable>
);

/** The month's title between previous and next; next stops at the month of `max`. */
const MonthHeader = ({
  labels,
  language,
  max,
  month,
  onMonth,
}: {
  readonly labels: CalendarLabels;
  readonly language: Language;
  readonly max: string | undefined;
  readonly month: string;
  readonly onMonth: (month: string) => void;
}) => (
  <View className="flex-row items-center">
    <IconButton
      icon={ChevronLeft}
      label={labels.previous}
      onPress={() => {
        onMonth(shiftMonth(month, -1));
      }}
      variant="plain"
    />
    <Text
      accessibilityLiveRegion="polite"
      className="flex-1 text-center font-sans text-[15px] font-medium text-fg"
    >
      {monthTitle(month, language)}
    </Text>
    <IconButton
      disabled={max !== undefined && shiftMonth(month, 1) > monthOf(max)}
      icon={ChevronRight}
      label={labels.next}
      onPress={() => {
        onMonth(shiftMonth(month, 1));
      }}
      variant="plain"
    />
  </View>
);

/** Monday-first narrow weekday names over the columns. */
const WeekdayRow = ({ language }: { readonly language: Language }) => (
  <View className="flex-row">
    {WEEKDAY_SAMPLES.map((date) =>
      new Intl.DateTimeFormat(language, { timeZone: "UTC", weekday: "narrow" }).format(date),
    ).map((weekday, index) => (
      <Text
        className="flex-1 text-center font-sans text-[11px] tabular-nums text-muted"
        // Narrow names repeat (T, S): the column is the key.
        // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
        key={index}
      >
        {weekday}
      </Text>
    ))}
  </View>
);

/** A key the grid hears: react-native-web passes it, React Native's types do not list it. */
type GridKey = { readonly key: string; readonly preventDefault: () => void };

/**
The month shown and the grid's one tab stop (QA round 19 L5): a key moves the stop (and the month
with it) and focus follows once it is drawn; where there is a keyboard the stop takes focus as the
view opens.
*/
const useRovingDays = ({
  max,
  start,
}: {
  readonly max: string | undefined;
  readonly start: string;
}) => {
  const [month, setMonth] = useState(() => monthOf(start));
  const [wanted, setWanted] = useState(start);
  const stop = rovingDay(month, wanted, max);
  const stopCellRef = useRef<View>(null);
  useEffect(() => (KEYBOARD === null ? undefined : claimFocus(() => stopCellRef.current)), []);
  const shouldFocusRef = useRef(false);
  useEffect(() => {
    if (!shouldFocusRef.current) {
      return;
    }

    shouldFocusRef.current = false;
    moveFocus(stopCellRef.current);
  });
  const onKeyDown = (event: GridKey): void => {
    const next = calendarKeyMove(stop, event.key, max);
    if (next === null) {
      return;
    }
    event.preventDefault();
    shouldFocusRef.current = true;
    setWanted(next);
    setMonth(monthOf(next));
  };
  return { month, onKeyDown, setMonth, stop, stopCellRef };
};

/**
A themed month view: the month's title with previous / next, Monday-first weeks, today
outlined, the picked day filled in the quiet accent and days with something on them dotted.
The days are one tab stop (QA round 19 L5): the arrows move a day or a week, Home and End to the
week's ends, Page Up and Down a month, Enter or Space picks; with a keyboard the picked day (else
today) takes focus as the view opens.
*/
export const Calendar = ({
  labels,
  language,
  marked = NONE,
  max,
  onPick,
  selected,
  today,
}: {
  readonly selected: null | string;
  readonly today: string;
  readonly language: Language;
  readonly labels: CalendarLabels;
  readonly onPick: (date: string) => void;
  /** Days after it cannot be picked (the Day ledger stops at today). */
  readonly max?: string;
  readonly marked?: ReadonlySet<string>;
}) => {
  const { month, onKeyDown, setMonth, stop, stopCellRef } = useRovingDays({
    max,
    start: selected ?? today,
  });
  return (
    <View className="gap-2">
      <MonthHeader labels={labels} language={language} max={max} month={month} onMonth={setMonth} />
      <WeekdayRow language={language} />
      <View className="gap-2" testID="calendar-days" {...{ onKeyDown }}>
        {monthGrid(month).map((week) => (
          <View className="flex-row gap-1" key={week[0]?.date}>
            {week.map((cell) => (
              <DayCell
                cell={cell}
                isDisabled={max !== undefined && cell.date > max}
                isMarked={marked.has(cell.date)}
                isSelected={cell.date === selected}
                isStop={cell.date === stop}
                isToday={cell.date === today}
                key={cell.date}
                language={language}
                onPick={onPick}
                {...(cell.date === stop && { ref: stopCellRef })}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};
