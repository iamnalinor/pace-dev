import type { TaskViewModel } from "@pace/client";

import { doneLateness } from "@pace/core";

/** What the sheet records: the task done, or the task given up. */
export type CloseMode = "done" | "other";

const isAfter = (at: string, deadline: null | string): boolean =>
  deadline !== null && Date.parse(at) > Date.parse(deadline);

/**
Whether the outcome reads "late", by core's own rule (`doneLateness`, owner 2026-11-09): a task
closed as done whose subtasks are all done is as late as its latest done subtask; while any is
left open (or with none) the closing time decides. Anything but done goes by the closing time.
*/
export const isLatePreview = (view: TaskViewModel, mode: CloseMode, at: string): boolean => {
  const due = view.stats.dueAt;
  return mode === "done"
    ? doneLateness(
        view.subtasks.map((subtask) => subtask.doneAt),
        at,
        due,
      ) === "done_late"
    : isAfter(at, due);
};
