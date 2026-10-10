import { Pressable, Text, View } from "react-native";

import type { CalendarEvent, Language, UsageRow } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { PROJECT_FILL } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import {
  type Lane,
  lanesOf,
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

/** A lane's share of the column, as percentages (a hair of room between neighbours). */
const laneStyle = ({
  lane,
  lanes,
}: Lane): { readonly left: `${number}%`; readonly width: `${number}%` } => ({
  left: `${(lane / lanes) * 100}%`,
  width: `${100 / lanes - 1}%`,
});

/** One thing on a day's column: a calendar event (outlined) or tracked time (filled). */
type Item =
  | { readonly kind: "block"; readonly at: Placement; readonly block: WeekBlock }
  | { readonly kind: "event"; readonly at: Placement; readonly event: CalendarEvent };

const isPlaced = <T extends { readonly at: null | Placement }>(
  item: T,
): item is T & { readonly at: Placement } => item.at !== null;

const keyOf = (item: Item): string =>
  item.kind === "event" ? `e-${item.event.id}-${item.event.startAt}` : `b-${item.block.id}`;

/** The day's calendar events and blocks, overlapping ones side by side in lanes. */
const DayItems = ({
  blocks,
  calendar,
  grid,
  onPick,
  zone,
}: {
  readonly blocks: readonly WeekBlock[];
  readonly calendar: readonly CalendarEvent[];
  readonly grid: Grid;
  readonly onPick: GridProps["onPick"];
  readonly zone: string;
}) => {
  const t = useT();
  const items: Item[] = [
    ...calendar
      .map((event) => ({ at: grid.place(event), event, kind: "event" as const }))
      .filter((item) => isPlaced(item)),
    // Placed again here: the grid may start earlier than the model did (an early event).
    ...blocks
      .map((block) => ({ at: grid.place(block), block, kind: "block" as const }))
      .filter((item) => isPlaced(item)),
  ];
  const lanes = lanesOf(items.map((item) => (item.kind === "event" ? item.event : item.block)));
  return items.map((item, index) => {
    const height = px(item.at.height, grid.hourPx);
    const isEvent = item.kind === "event";
    const label = isEvent ? item.event.title : item.block.label;
    const stretch = isEvent ? item.event : item.block;
    return (
      <Pressable
        accessibilityLabel={
          isEvent
            ? `${t("week.calendarEvent")}: ${label}`
            : `${label}, ${clockTime(stretch.startAt, zone)}–${clockTime(stretch.endAt, zone)}`
        }
        accessibilityRole="button"
        className={cx(
          "absolute overflow-hidden rounded-md px-1",
          isEvent ? "border border-dashed border-ink-slate" : "opacity-90",
          item.kind === "block" && PROJECT_FILL[item.block.color],
        )}
        key={keyOf(item)}
        onPress={() => {
          onPick(
            item.kind === "event"
              ? { event: item.event, kind: "event" }
              : { block: item.block, kind: "block" },
          );
        }}
        style={{
          ...laneStyle(lanes[index] ?? { lane: 0, lanes: 1 }),
          height: Math.max(2, height),
          top: px(item.at.top, grid.hourPx),
        }}
      >
        {height >= MIN_LABEL_PX ? (
          <Text
            className={cx(
              "font-sans text-[10px]",
              isEvent ? "text-fg2" : "font-medium text-accentFg",
            )}
            numberOfLines={1}
          >
            {label}
          </Text>
        ) : null}
      </Pressable>
    );
  });
};

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
        <View className="absolute bottom-0 left-1.5 right-0.5 top-0">
          <DayItems
            blocks={day.blocks}
            calendar={calendar}
            grid={grid}
            onPick={onPick}
            zone={week.zone}
          />
        </View>
      </View>
    </View>
  );
};

const hourIn = (at: string, zone: string): number =>
  Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: zone }).format(
      new Date(at),
    ),
  );

/**
Monday to Sunday side by side on one hour grid; it starts early enough for the first tracked
block or calendar event of the week.
*/
export const WeekGrid = (props: GridProps) => {
  const fromHour = Math.min(
    props.week.fromHour,
    ...props.calendar
      .filter(
        (event) => event.startAt >= props.week.weekStart && event.startAt < props.week.weekEnd,
      )
      .map((event) => hourIn(event.startAt, props.week.zone)),
  );
  const week = { ...props.week, fromHour };
  return (
    <View className="flex-row px-3 pb-6">
      <HourGutter fromHour={fromHour} hourPx={props.hourPx} />
      {week.days.map((day) => (
        <DayColumn key={day.date} {...props} day={day} week={week} />
      ))}
    </View>
  );
};
