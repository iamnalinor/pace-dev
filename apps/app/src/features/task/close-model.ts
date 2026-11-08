import type { TaskViewModel } from "@pace/client";

/** What the sheet records: the task done, or the task given up. */
export type CloseMode = "done" | "other";

const isAfter = (at: string, deadline: null | string): boolean =>
  deadline !== null && Date.parse(at) > Date.parse(deadline);

/** Done subtask by subtask: the preset's "per problem" (its tag on the task screen). */
const isPerSubtask = (view: TaskViewModel): boolean =>
  view.tags.some((tag) => tag.kind === "submission" && tag.submission === "per_subtask");

/**
Whether the outcome reads "late" (core's `taskOutcome`): a per-subtask task closed as done is as
late as its latest done subtask; anything else (or one with no subtask done) goes by the closing
time.
*/
export const isLatePreview = (view: TaskViewModel, mode: CloseMode, at: string): boolean => {
  const due = view.stats.dueAt;
  const doneAt = isPerSubtask(view)
    ? view.subtasks.map((subtask) => subtask.doneAt).filter((done) => done !== null)
    : [];
  return mode === "done" && doneAt.length > 0
    ? doneAt.some((done) => isAfter(done, due))
    : isAfter(at, due);
};
