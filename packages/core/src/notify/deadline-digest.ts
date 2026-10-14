import type { CoreState } from "../materialize/core-state.ts";
import type { Settings } from "../model/settings.ts";
import type { DigestTask } from "./pool.ts";

import { isOpen } from "../model/task.ts";
import { isInboxTask } from "../queries/classify.ts";
import { addMinutesIso, minutesBetween } from "../time.ts";
import { lastDigestWindow, nextDigestAt } from "./schedule.ts";

/** A slot more than this late (the alarm was missed) is skipped rather than sent stale. */
export const DIGEST_GRACE_MINUTES = 90;

/** A task is announced while it still has at least this long once the next digest comes. */
const LEAD_MINUTES = 24 * 60;

/** How a task already reported at a deadline is remembered; a moved deadline is news again. */
export const reportedKey = (taskId: string, dueAt: string): string => `${taskId}@${dueAt}`;

export type DigestWindow = {
  /** The slot being sent. */
  readonly slot: string;
  /** The slot after it (tomorrow's first, possibly). */
  readonly next: string;
};

/**
The digest slot due at `now` in `zone` with the one after it; `null` without digest times or
when the last slot passed more than `DIGEST_GRACE_MINUTES` ago.
*/
export const digestSlotAt = (
  now: string,
  zone: string,
  settings: Pick<Settings, "digestWindows">,
): DigestWindow | null => {
  const slot = lastDigestWindow(now, zone, settings);
  if (slot === null || minutesBetween(slot, now) > DIGEST_GRACE_MINUTES) {
    return null;
  }
  const next = nextDigestAt(slot, zone, settings);
  return next === null ? null : { next, slot };
};

/**
The tasks a digest at `slot` announces: open, not in the Inbox, due after the slot and no later
than a day after the next slot (so each has at least a day once announced), minus the ones
already reported at the same deadline. Earliest deadline first.
*/
export const deadlineDigest = (
  state: Pick<CoreState, "tasks">,
  {
    nextSlot,
    reported,
    slot,
  }: { readonly slot: string; readonly nextSlot: string; readonly reported: readonly string[] },
): readonly DigestTask[] => {
  const until = addMinutesIso(nextSlot, LEAD_MINUTES);
  const known = new Set(reported);
  return Object.values(state.tasks.byId)
    .filter((task) => isOpen(task) && !isInboxTask(task))
    .map((task) => ({ dueAt: task.dueAt, dueTz: task.dueTz, taskId: task.id, title: task.title }))
    .filter(
      (task): task is DigestTask =>
        task.dueAt !== null &&
        task.dueAt > slot &&
        task.dueAt <= until &&
        !known.has(reportedKey(task.taskId, task.dueAt)),
    )
    .toSorted((a, b) => {
      const byDue = a.dueAt.localeCompare(b.dueAt);
      return byDue === 0 ? a.taskId.localeCompare(b.taskId) : byDue;
    });
};
