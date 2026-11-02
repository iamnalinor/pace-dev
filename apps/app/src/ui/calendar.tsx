import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { type CalendarDay, monthGrid, monthOf, shiftMonth } from "@pace/client";
import { capitalize, type Language } from "@pace/core";

import { cx } from "./cx.ts";
import { IconButton } from "./icon-button.tsx";

/** January 1, 2024 was a Monday: day `n` of that week names weekday `n`. */
const WEEKDAY_SAMPLES = [1, 2, 3, 4, 5, 6, 7].map((day) => new Date(Date.UTC(2024, 0, day)));

/** "October 2026", "Октябрь 2026": the month on its own (no "г."), capitalized once. */
const monthTitle = (month: string, language: Language): string => {
  const date = new Date(`${month}-01T00:00:00Z`);
  const name = new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" }).format(date);
  return `${capitalize(name, language)} ${month.slice(0, 4)}`;
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
    return "font-semibold text-accent-text";
  }
  return cell.isInMonth ? "text-label-primary" : "text-label-tertiary";
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
      isSelected && "bg-accent-quiet",
      !isSelected && isToday && "border-2 border-label-primary",
      isDisabled && "opacity-30",
    )}
    disabled={isDisabled}
    onPress={() => {
      onPick(cell.date);
    }}
  >
    <Text className={cx("font-sans text-footnote tabular-nums", ink(cell, isSelected))}>
      {String(cell.day)}
    </Text>
    {isMarked ? (
      <View
        className={cx(
          "absolute bottom-1 h-1 w-1 rounded-pill",
          isSelected ? "bg-accent-text" : "bg-accent",
        )}
      />
    ) : null}
  </Pressable>
);

/**
A themed month view: the month's title with previous / next, Monday-first weeks, today
outlined, the picked day filled in the quiet accent and days with something on them dotted.
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
          className="flex-1 text-center font-sans text-callout font-medium text-label-primary"
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
            className="flex-1 text-center font-sans text-caption2 font-normal tabular-nums text-label-tertiary"
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
