import type { HueName } from "@pace/core";

/** What the rail needs of a block: its place in time, its hue and whether it runs. */
export type RailBlock = {
  readonly startAt: string;
  readonly endAt: string;
  readonly color: HueName;
  readonly isRunning: boolean;
  /** Ran next to the main line. */
  readonly isAlongside: boolean;
};

/** Time with nothing logged. */
export type RailGap = { readonly startAt: string; readonly endAt: string };

/** One band of the rail, in rail minutes from the first item's start. */
export type RailItem = {
  readonly from: number;
  readonly to: number;
  /** The category's hue; none for a gap. */
  readonly hue: HueName | null;
  /** A band beside the main one (alongside, or overlapping an earlier block). */
  readonly kind: "block" | "gap" | "parallel";
  /** Still running: no end yet. */
  readonly open: boolean;
  /** A gap drawn shorter than it was: the rail shows a break in its scale. */
  readonly scaleBreak: boolean;
  /** Where a parallel band overlaps an earlier block (drawn hatched, never red); `null` else. */
  readonly overlap: null | { readonly from: number; readonly to: number };
};

export type DayRail = {
  readonly items: readonly RailItem[];
  /** Where now falls on the rail (today, inside what is drawn); `null` otherwise. */
  readonly nowAt: null | number;
  /** The rail's whole length in rail minutes. */
  readonly total: number;
};

/** A gap longer than this is drawn this long, with a scale break (spec §2 A, §5.2). */
export const GAP_CAP_MINUTES = 180;

const MINUTE_MS = 60_000;

const minutesBetween = (from: string, to: string): number =>
  (Date.parse(to) - Date.parse(from)) / MINUTE_MS;

/** What a capped gap takes off the clock before `at`, or the part of it `at` is inside. */
const givenUp = (gap: RailGap & { readonly minutes: number }, at: string): number => {
  if (Date.parse(at) >= Date.parse(gap.endAt)) {
    return gap.minutes - GAP_CAP_MINUTES;
  }
  if (Date.parse(at) > Date.parse(gap.startAt)) {
    // Inside a capped gap: in proportion to its drawn length.
    const into = minutesBetween(gap.startAt, at);
    return into - (into / gap.minutes) * GAP_CAP_MINUTES;
  }
  return 0;
};

/** Real time to rail minutes: the time since the first start, less what long gaps give up. */
const railClock = (origin: string, gaps: readonly RailGap[]) => {
  const capped = gaps
    .map((gap) => ({ ...gap, minutes: minutesBetween(gap.startAt, gap.endAt) }))
    .filter((gap) => gap.minutes > GAP_CAP_MINUTES);
  return (at: string): number =>
    capped.reduce((drawn, gap) => drawn - givenUp(gap, at), minutesBetween(origin, at));
};

/** A block as a band, given the latest end among the main-line blocks before it. */
const bandOf = (block: RailBlock, clock: (at: string) => number, latestEnd: number): RailItem => {
  const from = clock(block.startAt);
  const to = clock(block.endAt);
  // A block that ran alongside is a branch by design: it is not an overlap to hatch.
  const isOverlaps = !block.isAlongside && from < latestEnd;
  return {
    from,
    hue: block.color,
    kind: isOverlaps || block.isAlongside ? "parallel" : "block",
    open: block.isRunning,
    overlap: isOverlaps ? { from, to: Math.min(to, latestEnd) } : null,
    scaleBreak: false,
    to,
  };
};

/** Blocks by start, each given the latest end among the main-line blocks before it, for overlap. */
const withOverlap = (
  blocks: readonly RailBlock[],
  clock: (at: string) => number,
): readonly RailItem[] => {
  const ordered = blocks.toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  return ordered.map((block, index) =>
    bandOf(
      block,
      clock,
      Math.max(
        -Infinity,
        ...ordered
          .slice(0, index)
          .filter((earlier) => !earlier.isAlongside)
          .map((earlier) => clock(earlier.endAt)),
      ),
    ),
  );
};

/**
The notebook page's rail (spec §2 A, Task 7.1): the day's blocks and gaps as bands in time order,
proportional to their length, so a 2 h gap is twice a 1 h block. A gap longer than 3 h is drawn 3 h
long and says so (`scaleBreak`). A block that ran alongside the main line, or overlaps an earlier
one, is `parallel` (a narrower band; its overlapping stretch is hatched). `nowAt` is where the
present falls, for the margin line.
*/
export const dayRail = (
  blocks: readonly RailBlock[],
  gaps: readonly RailGap[],
  now: string,
): DayRail => {
  const starts = [...blocks, ...gaps].map((item) => item.startAt);
  const origin = starts.toSorted((a, b) => Date.parse(a) - Date.parse(b))[0];
  if (origin === undefined) {
    return { items: [], nowAt: null, total: 0 };
  }
  const clock = railClock(origin, gaps);
  const gapItems: readonly RailItem[] = gaps.map((gap) => {
    const from = clock(gap.startAt);
    const to = clock(gap.endAt);
    return {
      from,
      hue: null,
      kind: "gap",
      open: false,
      overlap: null,
      scaleBreak: minutesBetween(gap.startAt, gap.endAt) > GAP_CAP_MINUTES,
      to,
    };
  });
  const items = [...withOverlap(blocks, clock), ...gapItems].toSorted((a, b) =>
    a.from === b.from ? a.to - b.to : a.from - b.from,
  );
  const total = Math.max(...items.map((item) => item.to));
  const nowAt = clock(now);
  return { items, nowAt: nowAt <= total && nowAt >= 0 ? nowAt : null, total };
};
