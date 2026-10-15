import type { TimeState } from "../tracking/model.ts";

import { remindAt } from "../tracking/expect.ts";
import { runningActivity } from "../tracking/timeline.ts";

/** The running activity's reminder: time to ask whether it is still going. */
type LongRun = {
  readonly activityId: string;
  readonly label: string;
  readonly expectMinutes: number;
  readonly startAt: string;
  /** When it reaches its reminder (`REMIND_FACTOR` × its Expect, moved on by each "yes"). */
  readonly crossedAt: string;
};

/** The running main activity's reminder, past or ahead; `null` without an Expect. */
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
