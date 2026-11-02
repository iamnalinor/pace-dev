import { Pressable, Text, View } from "react-native";

import type { CalendarEvent, Language, UsageRow } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { inkClass, tintClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { Tooltip } from "#app/ui/tooltip.tsx";
import {
  gridFromHour,
  type Lane,
  lanesOf,
  placeIn,
  type Placement,
  type WeekBlock,
  type WeekDay,
  type WeekModel,
} from "@pace/client";

import { SidewaysDays } from "./sideways-days.tsx";
import { laneStyle, phoneColumnPx } from "./week-lanes.ts";

/** What a tap on the grid opens: a tracked block, or a calendar event. */
export type Picked =
  | { readonly kind: "block"; readonly block: WeekBlock }
  | { readonly kind: "event"; readonly event: CalendarEvent };

/** Which block or event a pick is, so the grid can mark it. */
export const pickedKey = (picked: Picked): string =>
  picked.kind === "event" ? `e-${picked.event.id}-${picked.event.startAt}` : `b-${picked.block.id}`;

export type GridProps = {
  readonly week: WeekModel;
  readonly calendar: readonly CalendarEvent[];
  readonly usage: readonly UsageRow[];
  readonly hourPx: number;
  readonly language: Language;
  readonly onPick: (picked: Picked) => void;
  /** The picked block or event (its `pickedKey`), marked; `null` for none. */
  readonly selectedKey: null | string;
  /** Where the "now" line goes in today's column. */
  readonly now: string;
  /** A phone keeps each day readable at this width and scrolls the week sideways. */
  readonly minColumnPx: number;
};

/** "Mon 5", "пн 5" in the person's language. */
export const dayLabel = (date: string, zone: string, language: Language): string =>
  new Intl.DateTimeFormat(language, { day: "numeric", timeZone: zone, weekday: "short" }).format(
    new Date(date),
  );

/** A block or an event is at least this tall: a two-minute one is still something to tap. */
const MIN_TARGET_PX = 24;

const px = (minutes: number, hourPx: number): number => (minutes / 60) * hourPx;

/** The hours down the left edge: "07", "08", … */
const HourGutter = ({
  fromHour,
  hourPx,
}: {
  readonly fromHour: number;
  readonly hourPx: number;
}) => (
  <View className="w-8 pt-8">
    {Array.from({ length: 24 - fromHour }, (_, index) => (
      <Text
        className="font-sans text-caption2 font-normal tabular-nums text-label-tertiary"
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
        className="absolute left-0 w-0.5 bg-label-secondary opacity-40"
        key={`${session.deviceId}-${session.app}-${session.startAt}`}
        style={{ height: Math.max(1, px(at.height, hourPx)), top: px(at.top, hourPx) }}
      />
    );
  });

/** One thing on a day's column: a calendar event (outlined) or tracked time (washed in its hue). */
type Item =
  | { readonly kind: "block"; readonly at: Placement; readonly block: WeekBlock }
  | { readonly kind: "event"; readonly at: Placement; readonly event: CalendarEvent };

const isPlaced = <T extends { readonly at: null | Placement }>(
  item: T,
): item is T & { readonly at: Placement } => item.at !== null;

const pickOf = (item: Item): Picked =>
  item.kind === "event"
    ? { event: item.event, kind: "event" }
    : { block: item.block, kind: "block" };

/** How an item looks: events outlined, blocks ink on their hue's tint; the picked one ringed. */
const itemLook = (
  item: Item,
  isSelected: boolean,
): { readonly box: string; readonly text: string } => {
  if (item.kind === "block") {
    return {
      box: cx(tintClass(item.block.color), isSelected && "border-2 border-accent"),
      text: cx("font-medium", inkClass(item.block.color)),
    };
  }
  return isSelected
    ? { box: "border-2 border-accent bg-accent-quiet", text: "text-accent-text" }
    : { box: "border border-dashed border-hue-slate-ink", text: "text-label-secondary" };
};

/** One block or event on its column, in its lane; a tap picks it. */
const ItemBox = ({
  grid,
  item,
  lane,
  onPick,
  selectedKey,
  zone,
}: {
  readonly item: Item;
  readonly lane: Lane;
  readonly grid: Grid;
  readonly onPick: GridProps["onPick"];
  readonly selectedKey: null | string;
  readonly zone: string;
}) => {
  const t = useT();
  const picked = pickOf(item);
  const isSelected = pickedKey(picked) === selectedKey;
  const look = itemLook(item, isSelected);
  const stretch = item.kind === "event" ? item.event : item.block;
  const label = item.kind === "event" ? item.event.title : item.block.label;
  const times = `${clockTime(stretch.startAt, zone)}–${clockTime(stretch.endAt, zone)}`;
  // The whole name and the times on hover and keyboard focus: a narrow lane shows a letter or two
  // of the name (QA round 18 L7); a tap opens the details anyway.
  const named =
    item.kind === "event" ? `${t("week.calendarEvent")}: ${label}` : `${label}, ${times}`;
  return (
    <View
      className="absolute"
      style={{
        ...laneStyle(lane),
        height: Math.max(MIN_TARGET_PX, px(item.at.height, grid.hourPx)),
        top: px(item.at.top, grid.hourPx),
      }}
    >
      <Tooltip isFilling label={`${label}, ${times}`} showsOnTap={false}>
        <Pressable
          accessibilityLabel={named}
          accessibilityRole="button"
          aria-current={isSelected ? "true" : undefined}
          className={cx("flex-1 overflow-hidden rounded-md px-1", look.box)}
          onPress={() => {
            onPick(picked);
          }}
        >
          <Text className={cx("font-sans text-caption2 font-normal", look.text)} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      </Tooltip>
    </View>
  );
};

/** A day's calendar events and blocks placed on its column, each with its lane. */
type LaidOut = { readonly item: Item; readonly lane: Lane };

/**
The day's calendar events and blocks on its column, overlapping ones side by side in lanes, laid
out by the height each is drawn at (a short block is drawn MIN_TARGET_PX tall).
*/
const layOut = (
  day: WeekDay,
  calendar: readonly CalendarEvent[],
  grid: Grid,
): readonly LaidOut[] => {
  const items: Item[] = [
    ...calendar
      .map((event) => ({ at: grid.place(event), event, kind: "event" as const }))
      .filter((item) => isPlaced(item)),
    // Placed again here: the grid may start earlier than the model did (an early event).
    ...day.blocks
      .map((block) => ({ at: grid.place(block), block, kind: "block" as const }))
      .filter((item) => isPlaced(item)),
  ];
  const lanes = lanesOf(
    items.map((item) => (item.kind === "event" ? item.event : item.block)),
    (MIN_TARGET_PX / grid.hourPx) * 60,
  );
  return items.map((item, index) => ({ item, lane: lanes[index] ?? { lane: 0, lanes: 1 } }));
};

/** The most lanes side by side anywhere in the day. */
const mostLanes = (laidOut: readonly LaidOut[]): number =>
  Math.max(1, ...laidOut.map(({ lane }) => lane.lanes));

/** The day's calendar events and blocks, overlapping ones side by side in lanes. */
const DayItems = ({
  laidOut,
  ...rest
}: {
  readonly laidOut: readonly LaidOut[];
  readonly grid: Grid;
  readonly onPick: GridProps["onPick"];
  readonly selectedKey: null | string;
  readonly zone: string;
}) =>
  laidOut.map(({ item, lane }) => (
    <ItemBox key={pickedKey(pickOf(item))} {...rest} item={item} lane={lane} />
  ));

/** One day: its date, the hour lines, and what the day held laid over them. */
const DayColumn = ({
  columnPx,
  day,
  grid,
  hourPx,
  language,
  laidOut,
  now,
  onPick,
  selectedKey,
  usage,
  week,
}: Omit<GridProps, "calendar" | "minColumnPx"> & {
  readonly day: WeekDay;
  readonly grid: Grid;
  readonly laidOut: readonly LaidOut[];
  /** The column's least width (0 on a computer, where the days share the width). */
  readonly columnPx: number;
}) => {
  const nowMinutes = (Date.parse(now) - Date.parse(day.date)) / 60_000 - week.fromHour * 60;
  return (
    <View className="min-w-0 flex-1" style={{ minWidth: columnPx }}>
      <Text
        className={cx(
          "h-8 text-center font-sans text-caption2 tabular-nums",
          day.isToday ? "text-label-primary" : "font-normal text-label-secondary",
        )}
      >
        {dayLabel(day.date, week.zone, language)}
      </Text>
      <View
        className="relative border-l border-separator"
        style={{ height: (24 - week.fromHour) * hourPx }}
      >
        {Array.from({ length: 24 - week.fromHour }, (_, index) => (
          <View
            className="absolute left-0 right-0 border-t border-separator"
            key={index}
            style={{ top: index * hourPx }}
          />
        ))}
        <UsageStrip {...grid} usage={usage} />
        {nowMinutes >= 0 && day.isToday ? (
          // The line only shows where now is; the blocks and events carry the words.
          <View
            className="absolute left-0 right-0 h-0.5 bg-danger"
            style={{ top: px(nowMinutes, hourPx) }}
          />
        ) : null}
        {/* The blocks clear the 2 px usage strip by 2 px, and the right edge by 2 (`COLUMN_INSET_PX`). */}
        <View className="absolute bottom-0 left-1 right-0.5 top-0" testID="week-blocks">
          <DayItems
            grid={grid}
            laidOut={laidOut}
            onPick={onPick}
            selectedKey={selectedKey}
            zone={week.zone}
          />
        </View>
      </View>
    </View>
  );
};

/**
The day names' row above the columns (`h-8`, and the gutter's `pt-8`), and the room left under the
grid (the phone's hint row, `h-6`): the fit subtracts them, so they move with those classes
(week-screen.test.tsx reads both through the generated scale; bug-lessons class 11).
*/
export const LABELS_PX = 32;
export const BOTTOM_PX = 24;

/**
Monday to Sunday side by side on one hour grid; it starts early enough for the first tracked
block or calendar event of the week (or at midnight with night hours). On a phone the days keep
a readable width and the week scrolls sideways.
*/
export const WeekGrid = ({ calendar, minColumnPx, ...props }: GridProps) => {
  const fromHour = gridFromHour(props.week, calendar);
  const week = { ...props.week, fromHour };
  const where = { fromHour, zone: week.zone };
  const columns = week.days.map((day) => {
    const grid: Grid = {
      hourPx: props.hourPx,
      place: (stretch) => placeIn(day.date, stretch, where),
    };
    const laidOut = layOut(day, calendar, grid);
    const columnPx = minColumnPx === 0 ? 0 : phoneColumnPx(mostLanes(laidOut), minColumnPx);
    return { columnPx, day, grid, laidOut };
  });
  const days = columns.map((column) => (
    <DayColumn key={column.day.date} {...props} {...column} week={week} />
  ));
  return (
    <View className="flex-row px-3" style={{ paddingBottom: BOTTOM_PX }}>
      <HourGutter fromHour={fromHour} hourPx={props.hourPx} />
      {minColumnPx === 0 ? (
        days
      ) : (
        <SidewaysDays columnPx={columns.map((column) => column.columnPx)} week={week}>
          {days}
        </SidewaysDays>
      )}
    </View>
  );
};
