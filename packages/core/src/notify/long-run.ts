import type { TimeState } from "../tracking/model.ts";

import { remindAt } from "../tracking/expect.ts";
import { runningActivity } from "../tracking/timeline.ts";

/** The running activity has taken twice its Expect: time to ask whether it is still going. */
export type LongRun = {
  readonly activityId: string;
  readonly label: string;
  readonly expectMinutes: number;
  readonly startAt: string;
  /** When it reached twice its Expect. */
  readonly crossedAt: string;
};

/** The running main activity's long-run point, asked or not yet; `null` without an Expect. */
export const longRunCrossing = (time: TimeState, now: string): LongRun | null => {
  const running = runningActivity(time, now) ?? undefined;
  const crossedAt = remindAt(running);
  return running === undefined || crossedAt === null || running.expectMinutes === null
    ? null
    : {
        activityId: running.id,
        crossedAt,
        expectMinutes: running.expectMinutes,
        label: running.label,
        startAt: running.startAt,
      };
};

/** How an asked question is remembered: the activity and the moment, so a new Expect asks again. */
export const longRunKey = (run: Pick<LongRun, "activityId" | "crossedAt">): string =>
  `${run.activityId}@${run.crossedAt}`;

/** The question due at `now`: crossed, still running, not asked at this moment before. */
export const longRunOf = (
  time: TimeState,
  now: string,
  asked: readonly string[],
): LongRun | null => {
  const crossing = longRunCrossing(time, now);
  return crossing !== null && crossing.crossedAt <= now && !asked.includes(longRunKey(crossing))
    ? crossing
    : null;
};
