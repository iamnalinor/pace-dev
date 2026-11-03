import type { Lane } from "@pace/client";

/** The room between side-by-side lanes, as a share of the column. */
const LANE_GAP_PERCENT = 1;

/**
The column's edges the blocks keep clear of: the left rule and the usage strip, and the right. It
restates the blocks' `left-1 right-0.5` (week-screen.test.tsx reads both, bug-lessons class 11).
*/
export const COLUMN_INSET_PX = 6;

/** A thumb's target: on a phone each lane of a day is at least this wide (QA round 18 L6). */
const LANE_TARGET_PX = 44;

/**
How many side-by-side lanes a phone's column widens for, each at a thumb's width: a day with more
(a calendar full of overlapping events) shares the widest column among them, narrower lanes
named whole by their tooltips, instead of a column without end (100 lanes divided by nothing,
round 7 review 11).
*/
const PHONE_LANES_AT_TARGET = 6;

/** The widest a phone's day column gets, whatever the lanes. */
export const PHONE_COLUMN_MAX_PX =
  Math.ceil(LANE_TARGET_PX / (1 / PHONE_LANES_AT_TARGET - LANE_GAP_PERCENT / 100)) +
  COLUMN_INSET_PX;

/**
A phone's day column: `floorPx`, or wider for a day with side-by-side lanes, so each lane keeps a
thumb's width (two lanes of the 72 px column were 31 px wide, QA round 18 L6), up to
`PHONE_COLUMN_MAX_PX`.
*/
export const phoneColumnPx = (lanes: number, floorPx: number): number =>
  lanes >= PHONE_LANES_AT_TARGET
    ? Math.max(floorPx, PHONE_COLUMN_MAX_PX)
    : Math.max(
        floorPx,
        Math.ceil(LANE_TARGET_PX / (1 / lanes - LANE_GAP_PERCENT / 100)) + COLUMN_INSET_PX,
      );

/**
A lane's share of the column, as percentages: a hair of room between neighbours, never more than
half a lane (a hundred lanes have no 1 % each to spare, round 7 review 11).
*/
export const laneStyle = ({
  lane,
  lanes,
}: Lane): { readonly left: `${number}%`; readonly width: `${number}%` } => ({
  left: `${(lane / lanes) * 100}%`,
  width: `${Math.max(100 / lanes - LANE_GAP_PERCENT, 100 / lanes / 2)}%`,
});
