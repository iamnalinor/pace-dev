import type { ActivityCategory, TimeState } from "./model.ts";

import { CATEGORY_DEFAULTS, type ExpectLimit } from "./categories.ts";

/** "Near the limit" starts this many minutes before it. */
export const NEAR_LIMIT_MINUTES = 10;
/** A label needs this many finished runs before its median becomes the default. */
export const MEDIAN_SAMPLES = 3;

export type PaceStatus = "near-limit" | "none" | "ok" | "over-expect" | "over-limit";

/** Where a running activity stands against what it expects and what it may take. */
export const paceStatus = (
  minutes: number,
  { expectMinutes, limitMinutes }: ExpectLimit,
): PaceStatus => {
  if (limitMinutes !== null) {
    if (minutes >= limitMinutes) {
      return "over-limit";
    }
    if (minutes >= limitMinutes - NEAR_LIMIT_MINUTES) {
      return "near-limit";
    }
  }
  if (expectMinutes !== null) {
    return minutes > expectMinutes ? "over-expect" : "ok";
  }
  return limitMinutes === null ? "none" : "ok";
};

const median = (values: readonly number[]): number => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? upper) + upper) / 2 : upper;
};

export type Defaults = ExpectLimit & {
  /** Where the Expect came from, for the "why" line. */
  readonly source: "category" | "history";
  readonly samples: number;
};

/**
What a new activity should expect: the median of the label's past finished runs once there are
`MEDIAN_SAMPLES` of them, else the category's default. The Limit always comes from the category.
*/
export const defaultsFor = (
  time: TimeState,
  { category, label }: { readonly label: string; readonly category: ActivityCategory },
): Defaults => {
  const key = label.trim().toLowerCase();
  const durations = Object.values(time.activities)
    .filter((activity) => activity.endAt !== null && activity.label.trim().toLowerCase() === key)
    .map(
      (activity) =>
        (Date.parse(activity.endAt ?? activity.startAt) - Date.parse(activity.startAt)) / 60_000,
    )
    .filter((minutes) => minutes > 0);
  const fallback = CATEGORY_DEFAULTS[category];
  return durations.length >= MEDIAN_SAMPLES
    ? {
        expectMinutes: Math.round(median(durations)),
        limitMinutes: fallback.limitMinutes,
        samples: durations.length,
        source: "history",
      }
    : { ...fallback, samples: durations.length, source: "category" };
};
