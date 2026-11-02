import type { DeadlinePolicy } from "@pace/core";

import type { Zoned } from "./date-field.tsx";

/** What a two-stage deadline still lacks: a main due date, a final date after it, a day count. */
export type DeadlineChoiceProblem =
  | "deadline/days"
  | "deadline/final-after-due"
  | "deadline/no-due";

/**
A second stage always has a main due date and a later hard endpoint. The form's message and
whether Save is on both come from this one answer.
*/
export const deadlineChoiceProblem = (
  policy: DeadlinePolicy,
  due: Zoned,
): DeadlineChoiceProblem | null => {
  if (policy.kind === "hard") {
    return null;
  }
  if (due === null) {
    return "deadline/no-due";
  }
  if (policy.finalMode === "offset") {
    return Number.isSafeInteger(policy.softDays) && policy.softDays > 0 ? null : "deadline/days";
  }
  return policy.finalAt !== null &&
    policy.finalTz !== null &&
    Date.parse(policy.finalAt) > Date.parse(due.at)
    ? null
    : "deadline/final-after-due";
};

export const isDeadlineChoiceValid = (policy: DeadlinePolicy, due: Zoned): boolean =>
  deadlineChoiceProblem(policy, due) === null;

/**
Whether the form offers the deadline type: only once there is a deadline to give a type to (QA
round 17 L7), or while a two-stage one is chosen, so what it lacks is said under it.
*/
export const isDeadlineTypeShown = (policy: DeadlinePolicy, due: Zoned): boolean =>
  due !== null || policy.kind !== "hard";
