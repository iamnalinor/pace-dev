import type { ProblemRow, TaskViewModel } from "@pace/client";
import type { CoreState } from "@pace/core";

/** What the sheet records: problems sent, the task done, or the task given up. */
export type CloseMode = "done" | "other" | "submit";

/** `3`, or the label for an item without a number (`7a Bonus`). */
export const problemName = (problem: ProblemRow): string =>
  problem.number === null ? problem.label : String(problem.number);

/** The sheet the task opens with: sending its solved problems when there are any. */
export const initialMode = (view: TaskViewModel): CloseMode =>
  view.primaryAction.kind === "submit" ? "submit" : "done";

/** The problems being sent now. */
export const sendingIds = (view: TaskViewModel): readonly string[] =>
  view.primaryAction.kind === "submit" ? view.primaryAction.subtaskIds : [];

/** Problems that stay open after this submission. */
export const stillOpen = (view: TaskViewModel): readonly string[] => {
  const sending = new Set(sendingIds(view));
  return view.problems
    .filter((problem) => problem.state !== "submitted" && !sending.has(problem.id))
    .map((problem) => problemName(problem));
};

const isAfter = (at: string, deadline: null | string): boolean =>
  deadline !== null && Date.parse(at) > Date.parse(deadline);

/**
Whether the outcome reads "late": a submission is late after the due; a per-problem task
closed as done is as late as its latest sent problem; anything else goes by the closing time.
*/
export const isLatePreview = (view: TaskViewModel, mode: CloseMode, at: string): boolean => {
  const due = view.stats.dueAt;
  const sentAt = view.problems
    .map((problem) => problem.submittedAt)
    .filter((submittedAt) => submittedAt !== null);
  return mode === "done" && sentAt.length > 0
    ? sentAt.some((sent) => isAfter(sent, due))
    : isAfter(at, due);
};

const RECENT_REASONS = 5;

/** The reasons people typed when they gave tasks up, newest first, each once. */
export const recentReasons = (state: Pick<CoreState, "tasks">): readonly string[] => {
  const given = Object.values(state.tasks.byId)
    .map(({ closed }) => {
      const reason = closed?.reason ?? null;
      return closed === null || reason === null || closed.source === "system"
        ? null
        : { at: closed.at, reason };
    })
    .filter((entry) => entry !== null)
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((entry) => entry.reason);
  return [...new Set(given)].slice(0, RECENT_REASONS);
};
