import type { Closure } from "@pace/core";

const RECENT_REASONS = 5;

/**
The reasons the person gave when closing other tasks, newest first and once each, to
reuse with one tap. Reasons the system wrote ("not assigned") are not theirs to offer.
*/
export const recentReasons = (
  tasks: Readonly<Record<string, { readonly closed: Closure | null }>>,
): readonly string[] => {
  const given = Object.values(tasks)
    .map(({ closed }) => {
      const reason = closed?.reason ?? null;
      return closed === null || reason === null || closed.source === "system"
        ? null
        : { at: closed.at, reason };
    })
    .filter((entry) => entry !== null)
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map(({ reason }) => reason);
  return [...new Set(given)].slice(0, RECENT_REASONS);
};
