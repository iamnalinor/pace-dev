import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { Language } from "@pace/core";

import { type CalendarDay, monthGrid, monthOf, shiftMonth } from "@pace/client";

import { cx } from "./cx.ts";
import { IconButton } from "./icon-button.tsx";

/** January 1, 2024 was a Monday: day `n` of that week names weekday `n`. */
const WEEKDAY_SAMPLES = [1, 2, 3, 4, 5, 6, 7].map((day) => new Date(Date.UTC(2024, 0, day)));

const monthTitle = (month: string, language: Language): string =>
  new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC", year: "numeric" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

const dayLabel = (date: string, language: Language): string =>
  new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${date}T00:00:00Z`));

/** The picked day on the accent, the month's days in ink, the neighbours' faint. */
const ink = (cell: CalendarDay, isSelected: boolean): string => {
  if (isSelected) {
    return "font-semibold text-accentFg";
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
  isToday,
  language,
  onPick,
}: {
  readonly cell: CalendarDay;
  readonly isDisabled: boolean;
  readonly isMarked: boolean;
  readonly isSelected: boolean;
  readonly isToday: boolean;
  readonly language: Language;
  readonly onPick: (date: string) => void;
}) => (
  <Pressable
    accessibilityLabel={dayLabel(cell.date, language)}
    accessibilityRole="button"
    aria-disabled={isDisabled}
    aria-selected={isSelected}
    className={cx(
      "h-10 flex-1 items-center justify-center rounded-lg active:opacity-70",
      isSelected && "bg-accent",
      !isSelected && isToday && "border-2 border-fg",
      isDisabled && "opacity-30",
    )}
    disabled={isDisabled}
    onPress={() => {
      onPick(cell.date);
    }}
  >
    <Text className={cx("font-sans text-[13px] tabular-nums", ink(cell, isSelected))}>
      {String(cell.day)}
    </Text>
    {isMarked ? (
      <View
        className={cx(
          "absolute bottom-1 h-1 w-1 rounded-full",
          isSelected ? "bg-accentFg" : "bg-accentText",
        )}
      />
    ) : null}
  </Pressable>
);

/**
A themed month view: the month's title with previous / next, Monday-first weeks, today
outlined, the picked day filled in the accent and days with something on them dotted.
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
  const [month, setMonth] = useState(() => monthOf(selected ?? today));
  const weekdays = WEEKDAY_SAMPLES.map((date) =>
    new Intl.DateTimeFormat(language, { timeZone: "UTC", weekday: "narrow" }).format(date),
  );
  return (
    <View className="gap-2">
      <View className="flex-row items-center">
        <IconButton
          icon={ChevronLeft}
          label={labels.previous}
          onPress={() => {
            setMonth(shiftMonth(month, -1));
          }}
          variant="plain"
        />
        <Text
          accessibilityLiveRegion="polite"
          className="flex-1 text-center font-sans text-[15px] font-medium capitalize text-fg"
        >
          {monthTitle(month, language)}
        </Text>
        <IconButton
          disabled={max !== undefined && shiftMonth(month, 1) > monthOf(max)}
          icon={ChevronRight}
          label={labels.next}
          onPress={() => {
            setMonth(shiftMonth(month, 1));
          }}
          variant="plain"
        />
      </View>
      <View className="flex-row">
        {weekdays.map((weekday, index) => (
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
      {monthGrid(month).map((week) => (
        <View className="flex-row gap-1" key={week[0]?.date}>
          {week.map((cell) => (
            <DayCell
              cell={cell}
              isDisabled={max !== undefined && cell.date > max}
              isMarked={marked.has(cell.date)}
              isSelected={cell.date === selected}
              isToday={cell.date === today}
              key={cell.date}
              language={language}
              onPick={onPick}
            />
          ))}
        </View>
      ))}
    </View>
  );
};
