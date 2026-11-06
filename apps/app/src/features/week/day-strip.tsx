import { View } from "react-native";

import type { DayLayout, WeekBlock, WeekDay } from "@pace/client";
import type { CalendarEvent, Language } from "@pace/core";

import { cx } from "#app/ui/cx.ts";
import { fillClass } from "#app/ui/hue.ts";
import { Text } from "#app/ui/text.tsx";

/** "Mon 5", "пн 5" in the person's language. */
export const dayLabel = (date: string, zone: string, language: Language): string =>
  new Intl.DateTimeFormat(language, { day: "numeric", timeZone: zone, weekday: "short" }).format(
    new Date(date),
  );

/** A share of the width as a percentage. */
const pct = (share: number): `${number}%` => `${share * 100}%`;

/** A short block still shows on the line: at least this share of the day. */
const MIN_SEGMENT = 0.01;

/** The share of the day that has gone at `now`, for today's red mark; `null` on any other day. */
export const nowShare = (day: Pick<WeekDay, "date" | "isToday">, now: string): null | number =>
  day.isToday
    ? Math.min(1, Math.max(0, (Date.parse(now) - Date.parse(day.date)) / 86_400_000))
    : null;

/**
A day's header: its short name over a 4 px line of the day's tracked time in category strokes (the
day's 24 hours as its width, the same ink and now vocabulary as the running card). Today is
`label.primary` with an underline, and the line carries a red 1 px mark at now.
*/
export const DayHeader = ({
  day,
  language,
  layout,
  now,
  zone,
}: {
  readonly day: WeekDay;
  readonly layout: DayLayout<CalendarEvent, WeekBlock>;
  readonly language: Language;
  readonly now: string;
  readonly zone: string;
}) => {
  const mark = nowShare(day, now);
  return (
    <View className="h-8 justify-end" testID="day-header">
      <Text
        className={cx("h-6 text-center", day.isToday && "font-semibold underline")}
        numeric
        role="caption"
        tone={day.isToday ? "primary" : "secondary"}
      >
        {dayLabel(day.date, zone, language)}
      </Text>
      <View
        className="relative mx-1 mt-1 h-1 overflow-hidden rounded-pill bg-fill-3"
        testID="day-line"
      >
        {layout.line.map((segment) => (
          <View
            className={cx("absolute inset-y-0", fillClass(segment.block.color))}
            key={segment.block.id}
            style={{
              left: pct(segment.left),
              width: pct(Math.max(segment.width, MIN_SEGMENT)),
            }}
          />
        ))}
        {mark === null ? null : (
          <View
            className="absolute inset-y-0 border-l border-danger"
            style={{ left: pct(mark) }}
            testID="day-now"
          />
        )}
      </View>
    </View>
  );
};
