import type { TaskViewModel } from "@pace/client";

/** What the sheet records: the task done, or the task given up. */
export type CloseMode = "done" | "other";

const isAfter = (at: string, deadline: null | string): boolean =>
  deadline !== null && Date.parse(at) > Date.parse(deadline);

/**
Whether the outcome reads "late" (core's `taskOutcome`): a task closed as done with subtasks done
is as late as its latest done subtask; anything else (or one with no subtask done) goes by the
closing time. No preset decides this since its submission mode went (2026-11-09).
*/
export const isLatePreview = (view: TaskViewModel, mode: CloseMode, at: string): boolean => {
  const due = view.stats.dueAt;
  const doneAt = view.subtasks.map((subtask) => subtask.doneAt).filter((done) => done !== null);
  return mode === "done" && doneAt.length > 0
    ? doneAt.some((done) => isAfter(done, due))
    : isAfter(at, due);
};
