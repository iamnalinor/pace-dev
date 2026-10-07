import type { Recurrence } from "../model/preset.ts";

/**
 * Which ISO week the due slot falls in, relative to the issued slot's week: `0` when the
 * due slot is later in the same week, `1` when it is earlier or the very same slot (a
 * homework issued Thursday 09:00 and due Thursday 09:00 is due a week later).
 */
export const dueWeekOffset = (recurrence: Recurrence): 0 | 1 => {
  const { issued, due } = recurrence;
  // Zero-padded `HH:MM` compares correctly as a string.
  const isLater =
    due.weekday > issued.weekday || (due.weekday === issued.weekday && due.time > issued.time);
  return isLater ? 0 : 1;
};
