import type { Task } from "../model/task.ts";

/**
The window a task is paced over: from its start (or creation) to its explicit due date,
or to the horizon its importance implies when it has none. The pace marker on Now and
"N % of window gone" on the task screen read the same window.
*/

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Share of the window elapsed at `now`, clamped to 0..1; `null` without any due. */
export const windowElapsedOf = (
  task: Task,
  effectiveDue: null | string,
  now: string,
): null | number => {
  const end = task.dueAt ?? effectiveDue;
  if (end === null) {
    return null;
  }
  const start = Date.parse(task.startAt ?? task.createdAt);
  const length = Date.parse(end) - start;
  // A window that has no length is treated as fully elapsed.
  return length <= 0 ? 1 : clamp01((Date.parse(now) - start) / length);
};
