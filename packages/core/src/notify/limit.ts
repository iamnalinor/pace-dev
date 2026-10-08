import type { TimeState } from "../tracking/model.ts";

import { addMinutesIso } from "../time.ts";
import { runningActivity } from "../tracking/timeline.ts";

/** The running activity went past the Limit it was started with. */
export type LimitAlert = {
  readonly activityId: string;
  readonly label: string;
  readonly limitMinutes: number;
  readonly startAt: string;
  /** When it crossed the Limit. */
  readonly crossedAt: string;
};

/** The running activity's Limit crossing, alerted or not yet; `null` without a Limit. */
export const limitCrossing = (time: TimeState, now: string): LimitAlert | null => {
  const running = runningActivity(time, now);
  if (running === null) {
    return null;
  }
  const { limitMinutes } = running;
  return limitMinutes === null
    ? null
    : {
        activityId: running.id,
        crossedAt: addMinutesIso(running.startAt, limitMinutes),
        label: running.label,
        limitMinutes,
        startAt: running.startAt,
      };
};

/** The alert due at `now`: crossed, still running, not sent before (one per activity). */
export const limitAlertOf = (
  time: TimeState,
  now: string,
  alerted: readonly string[],
): LimitAlert | null => {
  const crossing = limitCrossing(time, now);
  return crossing !== null && crossing.crossedAt <= now && !alerted.includes(crossing.activityId)
    ? crossing
    : null;
};
