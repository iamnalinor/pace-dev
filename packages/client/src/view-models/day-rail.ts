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

/** What the rail needs of a row of the day (a `DayEntry` is one): its key and its time. */
export type RailEntry = { readonly key: string } & (
  | { readonly kind: "activity"; readonly row: RailBlock }
  | { readonly kind: "gap"; readonly gap: RailGap }
);

/** The bar beside one row: drawn at that row's own top and height, so the two never part. */
export type RailBar = {
  /** The row's key: the bar takes the row's measured frame. */
  readonly key: string;
  /** A block, a gap, or a block beside the main line (alongside, or overlapping an earlier one). */
  readonly kind: "block" | "gap" | "parallel";
  /** The category's hue; none for a gap. */
  readonly hue: HueName | null;
  /** Still running: its bar reaches the now line. */
  readonly isRunning: boolean;
};

export type DayRail = {
  readonly bars: readonly RailBar[];
  /** The row now falls in, and how far down it (0 at its top, 1 at its bottom); `null` outside the rows. */
  readonly now: null | { readonly key: string; readonly at: number };
};

const spanOf = (entry: RailEntry): RailGap => (entry.kind === "gap" ? entry.gap : entry.row);

/** Each row's bar, a block marked parallel when it ran alongside or overlaps an earlier main one. */
const barsOf = (entries: readonly RailEntry[]): readonly RailBar[] =>
  entries.map((entry, index) => {
    if (entry.kind === "gap") {
      return { hue: null, isRunning: false, key: entry.key, kind: "gap" };
    }
    const { row } = entry;
    // The latest end among the main line's blocks listed before this one.
    const latestEnd = Math.max(
      -Infinity,
      ...entries
        .slice(0, index)
        .map((earlier) =>
          earlier.kind === "activity" && !earlier.row.isAlongside
            ? Date.parse(earlier.row.endAt)
            : -Infinity,
        ),
    );
    return {
      hue: row.color,
      isRunning: row.isRunning,
      key: entry.key,
      kind: row.isAlongside || Date.parse(row.startAt) < latestEnd ? "parallel" : "block",
    };
  });

/**
The notebook page's rail (spec §2 A, Task 7.1; owner 2026-11-09: aligned with the rows): one bar
per row of the day, in the rows' order and under their keys, so each bar stands beside its own row
in its category's colour (a gap dashed, a parallel block narrower). The rows' heights are their own,
not time: the bar takes the row's measured frame. `now` names the row whose time holds the present
(the main line's before a parallel one) and how far into it, for the red margin line.
*/
export const dayRail = (entries: readonly RailEntry[], now: string): DayRail => {
  const bars = barsOf(entries);
  const instant = Date.parse(now);
  const holding = entries.filter((entry) => {
    const span = spanOf(entry);
    return Date.parse(span.startAt) <= instant && instant <= Date.parse(span.endAt);
  });
  const isMain = (entry: RailEntry): boolean =>
    bars.find((bar) => bar.key === entry.key)?.kind !== "parallel";
  const row = holding.find((entry) => isMain(entry)) ?? holding[0];
  if (row === undefined) {
    return { bars, now: null };
  }
  const span = spanOf(row);
  const length = Date.parse(span.endAt) - Date.parse(span.startAt);
  return {
    bars,
    now: { at: length <= 0 ? 1 : (instant - Date.parse(span.startAt)) / length, key: row.key },
  };
};
