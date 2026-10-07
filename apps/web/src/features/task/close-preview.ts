import type { ProblemRow } from "@pace/client";
import type { Closure } from "@pace/core";

export type ClosePreview = {
  /** `done` when there is no deadline to compare with. */
  readonly outcome: "before-deadline" | "done" | "late";
  /** The problems that are neither sent before nor sent now. */
  readonly stillOpen: readonly string[];
};

type Input = {
  /** When it happened, as chosen in the sheet. */
  readonly at: string;
  readonly dueAt: null | string;
  readonly problems: readonly ProblemRow[];
  /** The problems this submission sends. */
  readonly sending: readonly string[];
};

/** How a problem is called in short lists: its number, else its label. */
export const problemName = (problem: ProblemRow): string =>
  problem.number === null ? problem.label : String(problem.number);

const outcomeOf = (at: string, dueAt: null | string): ClosePreview["outcome"] => {
  if (dueAt === null) {
    return "done";
  }
  return Date.parse(at) <= Date.parse(dueAt) ? "before-deadline" : "late";
};

/** The preview block of the close sheet: on time or late, and what remains. */
export const closePreview = ({ at, dueAt, problems, sending }: Input): ClosePreview => ({
  outcome: outcomeOf(at, dueAt),
  stillOpen: problems
    .filter((problem) => problem.state !== "submitted" && !sending.includes(problem.id))
    .map(problemName),
});

const RECENT_REASONS = 5;

/**
The reasons the person gave when closing other tasks, newest first and once each, to
reuse with one tap. Reasons the system wrote ("not assigned") are not theirs to offer.
*/
export const recentReasons = (
  tasks: Readonly<Record<string, { readonly closed: Closure | null }>>,
): readonly string[] => {
  const given = Object.values(tasks)
    .flatMap(({ closed }) =>
      closed === null || closed.reason === null || closed.source === "system"
        ? []
        : [{ at: closed.at, reason: closed.reason }],
    )
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map(({ reason }) => reason);
  return [...new Set(given)].slice(0, RECENT_REASONS);
};
