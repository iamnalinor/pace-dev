import type { Activity, ActivityCategory, TimeState } from "./model.ts";

import { addMinutesIso } from "../time.ts";
import { CATEGORY_EXPECT } from "./categories.ts";

/** A label needs this many finished runs before its median becomes the default. */
export const MEDIAN_SAMPLES = 3;

/** Past this many times its Expect a running activity asks whether it is still going. */
export const REMIND_FACTOR = 2;

/** "long": twice the Expect is gone, time to ask; "none": nothing is expected. */
export type PaceStatus = "long" | "none" | "ok";

/** Where a running activity stands against what it expects. */
export const paceStatus = (minutes: number, expectMinutes: null | number): PaceStatus => {
  if (expectMinutes === null) {
    return "none";
  }
  return minutes >= REMIND_FACTOR * expectMinutes ? "long" : "ok";
};

/** When to ask "still doing this?": twice its Expect after the start; never without one. */
export const remindAt = (activity: Activity | undefined): null | string => {
  const expectMinutes = activity?.expectMinutes ?? null;
  return activity === undefined || expectMinutes === null
    ? null
    : addMinutesIso(activity.startAt, REMIND_FACTOR * expectMinutes);
};

const median = (values: readonly number[]): number => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? upper) + upper) / 2 : upper;
};

export type Defaults = {
  readonly expectMinutes: null | number;
  /** Where the Expect came from, for the "why" line. */
  readonly source: "category" | "history";
  readonly samples: number;
};

/**
What a new activity should expect: the median of the label's past finished runs once there are
`MEDIAN_SAMPLES` of them, else the category's default.
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
  return durations.length >= MEDIAN_SAMPLES
    ? {
        expectMinutes: Math.round(median(durations)),
        samples: durations.length,
        source: "history",
      }
    : { expectMinutes: CATEGORY_EXPECT[category], samples: durations.length, source: "category" };
};
