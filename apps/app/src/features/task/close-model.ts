import type { SubtaskRow, TaskViewModel } from "@pace/client";

/** What the sheet records: subtasks sent, the task done, or the task given up. */
export type CloseMode = "done" | "other" | "submit";

/** `3`, or the label for an item without a number (`7a Bonus`). */
export const subtaskName = (subtask: SubtaskRow): string =>
  subtask.number === null ? subtask.label : String(subtask.number);

/** The sheet the task opens with: sending its solved subtasks when there are any. */
export const initialMode = (view: TaskViewModel): CloseMode =>
  view.primaryAction.kind === "submit" ? "submit" : "done";

/** The subtasks being sent now. */
export const sendingIds = (view: TaskViewModel): readonly string[] =>
  view.primaryAction.kind === "submit" ? view.primaryAction.subtaskIds : [];

/** Subtasks that stay open after this submission. */
export const stillOpen = (view: TaskViewModel): readonly string[] => {
  const sending = new Set(sendingIds(view));
  return view.subtasks
    .filter((subtask) => subtask.state !== "submitted" && !sending.has(subtask.id))
    .map((subtask) => subtaskName(subtask));
};

const isAfter = (at: string, deadline: null | string): boolean =>
  deadline !== null && Date.parse(at) > Date.parse(deadline);

/**
Whether the outcome reads "late": a submission is late after the due; a per-subtask task
closed as done is as late as its latest sent subtask; anything else goes by the closing time.
*/
export const isLatePreview = (view: TaskViewModel, mode: CloseMode, at: string): boolean => {
  const due = view.stats.dueAt;
  const sentAt = view.subtasks
    .map((subtask) => subtask.submittedAt)
    .filter((submittedAt) => submittedAt !== null);
  return mode === "done" && sentAt.length > 0
    ? sentAt.some((sent) => isAfter(sent, due))
    : isAfter(at, due);
};
