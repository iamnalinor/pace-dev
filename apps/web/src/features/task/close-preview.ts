import type { ProblemRow } from "@pace/client";

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
    .map((problem) => problemName(problem)),
});
