import { View } from "react-native";

import type { CalendarEvent, Language, UsageRow } from "@pace/core";

import { Text } from "#app/ui/text.tsx";
import {
  type DayLayout,
  gridFromHour,
  layoutWeek,
  placeIn,
  type Placement,
  type WeekBlock,
  type WeekModel,
} from "@pace/client";

import { DayHeader } from "./day-strip.tsx";
import { SidewaysDays } from "./sideways-days.tsx";
import { FoldBox, ItemBox, MIN_TARGET_PX, pickOf } from "./week-boxes.tsx";
import { MAX_LANES, phoneColumnPx, px } from "./week-lanes.ts";
import { type Picked, pickedKey } from "./week-picked.ts";

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

/** The hours down the left edge: "07", "08", … Decoration: the grid's lines say the time. */
const HourGutter = ({
  fromHour,
  hourPx,
}: {
  readonly fromHour: number;
  readonly hourPx: number;
}) => (
  <View
    accessibilityElementsHidden
    className="w-8 pt-8"
    importantForAccessibility="no-hide-descendants"
  >
    {Array.from({ length: 24 - fromHour }, (_, index) => (
      <Text key={index} numeric role="caption" style={{ height: hourPx }} tone="tertiary">
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
        className="absolute left-0 w-0.5 bg-label-quaternary"
        key={`${session.deviceId}-${session.app}-${session.startAt}`}
        style={{ height: Math.max(1, px(at.height, hourPx)), top: px(at.top, hourPx) }}
      />
    );
  });

/** One day: its header and line, the hour lines, and what the day held laid over them. */
const DayColumn = ({
  columnPx,
  day,
  grid,
  hourPx,
  language,
  layout,
  now,
  onPick,
  selectedKey,
  usage,
  week,
}: Omit<GridProps, "calendar" | "minColumnPx"> & {
  readonly day: WeekModel["days"][number];
  readonly grid: Grid;
  readonly layout: DayLayout<CalendarEvent, WeekBlock>;
  /** The column's least width (0 on a computer, where the days share the width). */
  readonly columnPx: number;
}) => {
  const nowMinutes = (Date.parse(now) - Date.parse(day.date)) / 60_000 - week.fromHour * 60;
  const place = { language, onPick, selectedKey, zone: week.zone };
  return (
    <View className="min-w-0 flex-1" style={{ minWidth: columnPx }}>
      <DayHeader day={day} language={language} layout={layout} now={now} zone={week.zone} />
      <View
        className="relative border-l border-separator"
        style={{ height: (24 - week.fromHour) * hourPx + BOTTOM_PX }}
        testID="week-column"
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
          {layout.entries.map((entry) => (
            <ItemBox entry={entry} key={pickedKey(pickOf(entry.item))} {...place} />
          ))}
          {layout.folds.map((fold) => (
            <FoldBox fold={fold} key={pickedKey({ items: fold.items, kind: "group" })} {...place} />
          ))}
        </View>
      </View>
    </View>
  );
};

/**
The day names' row above the columns (`h-8`, and the gutter's `pt-8`), and the room left under the
grid (the phone's hint row, `h-6`, which is also the column's tail where a short item at midnight
hangs, `MIN_TARGET_PX`): the fit subtracts them, so they move with those classes
(week-screen.test.tsx reads both through the generated scale; bug-lessons class 11).
*/
export const LABELS_PX = 32;
export const BOTTOM_PX = 24;

/**
Monday to Sunday side by side on one hour grid; it starts early enough for the first tracked
block or calendar event of the week (or at midnight with night hours). On a phone the days keep
a readable width and the week scrolls sideways, snapping to whole days.
*/
export const WeekGrid = ({ calendar, minColumnPx, ...props }: GridProps) => {
  const fromHour = gridFromHour(props.week, calendar);
  const week = { ...props.week, fromHour };
  const where = { fromHour, zone: week.zone };
  const layouts = layoutWeek({
    calendar,
    days: week.days,
    fromHour,
    hourPx: props.hourPx,
    maxLanes: MAX_LANES,
    minPx: MIN_TARGET_PX,
    zone: week.zone,
  });
  const columns = week.days.map((day, index) => {
    const grid: Grid = {
      hourPx: props.hourPx,
      place: (stretch) => placeIn(day.date, stretch, where),
    };
    const layout = layouts[index];
    const lanes = Math.max(1, ...(layout?.entries ?? []).map((entry) => entry.lanes));
    const columnPx = minColumnPx === 0 ? 0 : phoneColumnPx(lanes, minColumnPx);
    return { columnPx, day, grid, layout };
  });
  const days = columns.flatMap(({ layout, ...column }) =>
    layout === undefined
      ? []
      : [<DayColumn key={column.day.date} {...props} {...column} layout={layout} week={week} />],
  );
  return (
    <View className="flex-row px-3">
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
