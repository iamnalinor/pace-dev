import { Pressable, Text, View } from "react-native";

import type { CalendarEvent, Language, UsageRow } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { PROJECT_FILL } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import {
  placeIn,
  type Placement,
  type WeekBlock,
  type WeekDay,
  type WeekModel,
} from "@pace/client";

/** What a tap on the grid opens: a tracked block, or a calendar event. */
export type Picked =
  | { readonly kind: "block"; readonly block: WeekBlock }
  | { readonly kind: "event"; readonly event: CalendarEvent };

export type GridProps = {
  readonly week: WeekModel;
  readonly calendar: readonly CalendarEvent[];
  readonly usage: readonly UsageRow[];
  readonly hourPx: number;
  readonly language: Language;
  readonly onPick: (picked: Picked) => void;
};

/** "Mon 5", "пн 5" in the person's language. */
export const dayLabel = (date: string, zone: string, language: Language): string =>
  new Intl.DateTimeFormat(language, { day: "numeric", timeZone: zone, weekday: "short" }).format(
    new Date(date),
  );

/** Text inside a box only when it has room for a line. */
const MIN_LABEL_PX = 16;

const px = (minutes: number, hourPx: number): number => (minutes / 60) * hourPx;

/** The hours down the left edge: "07", "08", … */
const HourGutter = ({
  fromHour,
  hourPx,
}: {
  readonly fromHour: number;
  readonly hourPx: number;
}) => (
  <View className="w-8 pt-7">
    {Array.from({ length: 24 - fromHour }, (_, index) => (
      <Text
        className="font-sans text-[10px] tabular-nums text-muted"
        key={index}
        style={{ height: hourPx }}
      >
        {String(fromHour + index).padStart(2, "0")}
      </Text>
    ))}
  </View>
);

/** Where a stretch sits in this column, and how tall an hour is. */
type Grid = {
  readonly hourPx: number;
  readonly place: (stretch: {
    readonly startAt: string;
    readonly endAt: string;
  }) => null | Placement;
};

/** A thin strip at the column's edge wherever some device had an app in front. */
const UsageStrip = ({ hourPx, place, usage }: Grid & Pick<GridProps, "usage">) =>
  usage.map((session) => {
    const at = place(session);
    return at === null ? null : (
      <View
        className="absolute left-0 w-[3px] bg-fg2 opacity-40"
        key={`${session.deviceId}-${session.app}-${session.startAt}`}
        style={{ height: Math.max(1, px(at.height, hourPx)), top: px(at.top, hourPx) }}
      />
    );
  });

/** The calendar's events as dashed outlines. */
const CalendarBoxes = ({
  calendar,
  hourPx,
  onPick,
  place,
}: Grid & Pick<GridProps, "calendar" | "onPick">) => {
  const t = useT();
  return calendar.map((event) => {
    const at = place(event);
    return at === null ? null : (
      <Pressable
        accessibilityLabel={`${t("week.calendarEvent")}: ${event.title}`}
        accessibilityRole="button"
        className="absolute left-1 right-0.5 overflow-hidden rounded-md border border-dashed border-ink-slate px-1"
        key={`${event.id}-${event.startAt}`}
        onPress={() => {
          onPick({ event, kind: "event" });
        }}
        style={{ height: px(at.height, hourPx), top: px(at.top, hourPx) }}
      >
        {px(at.height, hourPx) >= MIN_LABEL_PX ? (
          <Text className="font-sans text-[10px] text-fg2" numberOfLines={1}>
            {event.title}
          </Text>
        ) : null}
      </Pressable>
    );
  });
};

type BlocksProps = Pick<GridProps, "hourPx" | "onPick"> & {
  readonly blocks: readonly WeekBlock[];
  readonly zone: string;
};

/** Tracked time filled in its color; what ran alongside on the right half. */
const BlockBoxes = ({ blocks, hourPx, onPick, zone }: BlocksProps) =>
  blocks.map((block) => (
    <Pressable
      accessibilityLabel={`${block.label}, ${clockTime(block.startAt, zone)}–${clockTime(block.endAt, zone)}`}
      accessibilityRole="button"
      className={cx(
        "absolute overflow-hidden rounded-md px-1 opacity-90",
        PROJECT_FILL[block.color],
        block.isAlongside ? "left-[55%] right-0.5" : "left-2 right-1",
      )}
      key={block.id}
      onPress={() => {
        onPick({ block, kind: "block" });
      }}
      style={{ height: Math.max(2, px(block.height, hourPx)), top: px(block.top, hourPx) }}
    >
      {px(block.height, hourPx) >= MIN_LABEL_PX ? (
        <Text className="font-sans text-[10px] font-medium text-accentFg" numberOfLines={1}>
          {block.label}
        </Text>
      ) : null}
    </Pressable>
  ));

/** One day: its date, the hour lines, and what the day held laid over them. */
const DayColumn = ({
  calendar,
  day,
  hourPx,
  language,
  onPick,
  usage,
  week,
}: GridProps & { readonly day: WeekDay }) => {
  const where = { fromHour: week.fromHour, zone: week.zone };
  const grid: Grid = { hourPx, place: (stretch) => placeIn(day.date, stretch, where) };
  return (
    <View className="min-w-0 flex-1">
      <Text
        className={cx(
          "h-7 text-center font-sans text-[11px] tabular-nums",
          day.isToday ? "font-semibold text-fg" : "text-muted",
        )}
      >
        {dayLabel(day.date, week.zone, language)}
      </Text>
      <View
        className="relative border-l border-line"
        style={{ height: (24 - week.fromHour) * hourPx }}
      >
        {Array.from({ length: 24 - week.fromHour }, (_, index) => (
          <View
            className="absolute left-0 right-0 border-t border-line"
            key={index}
            style={{ top: index * hourPx }}
          />
        ))}
        <UsageStrip {...grid} usage={usage} />
        <CalendarBoxes {...grid} calendar={calendar} onPick={onPick} />
        <BlockBoxes blocks={day.blocks} hourPx={hourPx} onPick={onPick} zone={week.zone} />
      </View>
    </View>
  );
};

/** Monday to Sunday side by side on one hour grid. */
export const WeekGrid = (props: GridProps) => (
  <View className="flex-row px-3 pb-6">
    <HourGutter fromHour={props.week.fromHour} hourPx={props.hourPx} />
    {props.week.days.map((day) => (
      <DayColumn key={day.date} {...props} day={day} />
    ))}
  </View>
);
