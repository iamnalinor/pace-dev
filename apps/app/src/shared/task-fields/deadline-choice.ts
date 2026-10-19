import type { DeadlinePolicy } from "@pace/core";

import type { Zoned } from "./date-field.tsx";

/** A second stage always has a main due date and a later hard endpoint. */
export const isDeadlineChoiceValid = (policy: DeadlinePolicy, due: Zoned): boolean => {
  if (policy.kind === "hard") {
    return true;
  }
  if (due === null) {
    return false;
  }
  return policy.finalMode === "offset"
    ? Number.isSafeInteger(policy.softDays) && policy.softDays > 0
    : policy.finalAt !== null &&
        policy.finalTz !== null &&
        Date.parse(policy.finalAt) > Date.parse(due.at);
};
