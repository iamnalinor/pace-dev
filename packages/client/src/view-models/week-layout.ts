import { lanesOf, placeIn, type Placement } from "./week.ts";

type Stretch = { readonly startAt: string; readonly endAt: string };

/** A block or an event as the grid draws it: its box in pixels and its lane. */
export type Drawn<T> = {
  readonly item: T;
  /** Pixels from the column's first hour. */
  readonly top: number;
  /** The drawn height: never under `minPx`, and the one the lanes were computed on. */
  readonly height: number;
  readonly lane: number;
  readonly lanes: number;
};

/** A run of more overlapping items than the column has room for: one «+N» block that opens a list. */
export type Fold<T> = {
  readonly items: readonly T[];
  readonly top: number;
  readonly height: number;
};

/** A stretch of a day's 24 hours as shares of the width, for the day strip's compressed line. */
export type LineSegment<B> = {
  readonly block: B;
  readonly left: number;
  readonly width: number;
};

/** What the grid draws: a tracked block or a calendar event. */
export type DrawnItem<E, B> =
  | { readonly kind: "block"; readonly block: B }
  | { readonly kind: "event"; readonly event: E };

export type DayLayout<E, B> = {
  readonly date: string;
  readonly entries: readonly Drawn<
    { readonly kind: "block"; readonly block: B } | { readonly kind: "event"; readonly event: E }
  >[];
  readonly folds: readonly Fold<
    { readonly kind: "block"; readonly block: B } | { readonly kind: "event"; readonly event: E }
  >[];
  /** How far the lowest box reaches under the last hour (a short item at midnight hangs there). */
  readonly overhang: number;
  readonly line: readonly LineSegment<B>[];
};

export type LayoutInput<E extends Stretch, B extends Stretch> = {
  readonly days: readonly { readonly date: string; readonly blocks: readonly B[] }[];
  readonly calendar: readonly E[];
  readonly zone: string;
  readonly fromHour: number;
  readonly hourPx: number;
  /** The least a box is drawn at (a target's height). */
  readonly minPx: number;
  /** A run needing more lanes than this folds into one block (default: never). */
  readonly maxLanes?: number;
};

const MINUTES_PER_DAY = 1440;

type Boxed<T> = { readonly item: T; readonly top: number; readonly height: number };

/** The runs of boxes that overlap as drawn, each as its members in order of top. */
const runsOf = <T>(boxes: readonly Boxed<T>[]): readonly (readonly Boxed<T>[])[] => {
  const sorted = boxes.toSorted((a, b) => a.top - b.top);
  const reach = sorted.map((_, index) =>
    Math.max(...sorted.slice(0, index + 1).map((box) => box.top + box.height)),
  );
  // A box opens a run when it starts at or after everything before it has ended.
  const opens = sorted.map((box, index) => index === 0 || box.top >= (reach[index - 1] ?? 0));
  const runOf = opens.map((_, index) => opens.slice(0, index + 1).filter(Boolean).length);
  return Array.from({ length: runOf.at(-1) ?? 0 }, (_, run) =>
    sorted.filter((_box, index) => runOf[index] === run + 1),
  );
};

const px = (minutes: number, hourPx: number): number => (minutes / 60) * hourPx;

/**
One day's boxes: geometry, lanes and folds from the same drawn rectangles. A box is drawn at least
`minPx` tall, and the lanes are computed for that height, so no two boxes of one lane overlap and
none sits under another (F-DAT-05). A run that needs more than `maxLanes` lanes is folded.
*/
const layoutDay = <E extends Stretch, B extends Stretch>(
  day: { readonly date: string; readonly blocks: readonly B[] },
  input: LayoutInput<E, B>,
): DayLayout<E, B> => {
  const { calendar, fromHour, hourPx, maxLanes = Infinity, minPx, zone } = input;
  const where = { fromHour, zone };
  const events = calendar.map((event) => ({
    at: placeIn(day.date, event, where),
    item: { event, kind: "event" } satisfies DrawnItem<E, B>,
    stretch: event,
  }));
  const blocks = day.blocks.map((block) => ({
    at: placeIn(day.date, block, where),
    item: { block, kind: "block" } satisfies DrawnItem<E, B>,
    stretch: block,
  }));
  const placed = [...events, ...blocks].filter(
    (entry): entry is typeof entry & { readonly at: Placement } => entry.at !== null,
  );
  const lanes = lanesOf(
    placed.map((entry) => entry.stretch),
    (minPx / hourPx) * 60,
  );
  const boxes = placed.map((entry, index) => ({
    height: Math.max(minPx, px(entry.at.height, hourPx)),
    item: entry.item,
    lane: lanes[index]?.lane ?? 0,
    lanes: lanes[index]?.lanes ?? 1,
    top: px(entry.at.top, hourPx),
  }));
  const isFolded = (box: (typeof boxes)[number]): boolean => box.lanes > maxLanes;
  const folds = runsOf(boxes.filter((box) => isFolded(box))).map((run) => ({
    height:
      Math.max(...run.map((box) => box.top + box.height)) - Math.min(...run.map((box) => box.top)),
    items: run.map((box) => box.item),
    top: Math.min(...run.map((box) => box.top)),
  }));
  const hoursPx = (24 - fromHour) * hourPx;
  const entries = boxes.filter((box) => !isFolded(box));
  return {
    date: day.date,
    entries,
    folds,
    line: day.blocks
      .map((block) => ({ at: placeIn(day.date, block, { fromHour: 0, zone }), block }))
      .filter((entry) => entry.at !== null && entry.block.startAt !== entry.block.endAt)
      .map(({ at, block }) => ({
        block,
        left: (at?.top ?? 0) / MINUTES_PER_DAY,
        width: (at?.height ?? 0) / MINUTES_PER_DAY,
      })),
    overhang: Math.max(0, ...[...entries, ...folds].map((box) => box.top + box.height - hoursPx)),
  };
};

/**
The week's grid, laid out in one pass (F-DAT-05, bug-lessons class 1: geometry and lanes came from two
places and could disagree): each day's tracked blocks and calendar events as drawn boxes with their
lanes, the runs too crowded to draw as folds, the day strip's compressed line, and how far a short
item at the day's end reaches below the last hour.
*/
export const layoutWeek = <E extends Stretch, B extends Stretch>(
  input: LayoutInput<E, B>,
): readonly DayLayout<E, B>[] => input.days.map((day) => layoutDay(day, input));
