/** The rule whose backlog is ratcheted down (redesign-plan, "Lint baseline"). */
export const RULE_ID = "pace/no-raw-design-values";

type Result = {
  messages: readonly { ruleId: null | string; severity: number }[];
  warningCount: number;
};

type Summary = { designValues: number; problem: string | undefined };

/**
The ratchet: a part must report exactly `allowance` warnings of `RULE_ID` — more is a
regression, fewer means the developer lowers `DESIGN_VALUE_WARNINGS` so the gain stays.
Any other warning is a failure (the whole lint is otherwise zero-tolerance).
*/
export const summarise = (results: readonly Result[], allowance: number): Summary => {
  const messages = results.flatMap((result) => result.messages);
  const designValues = messages.filter((message) => message.ruleId === RULE_ID).length;
  const warnings = results.reduce((total, result) => total + result.warningCount, 0);
  const others = warnings - designValues;
  if (others > 0) {
    return { designValues, problem: `${others} other warning(s): fix them.` };
  }
  if (designValues > allowance) {
    return {
      designValues,
      problem: `${designValues} ${RULE_ID} warnings, ${allowance} allowed (DESIGN_VALUE_WARNINGS): new raw design values crept in; use the tokens.`,
    };
  }
  if (designValues < allowance) {
    return {
      designValues,
      problem: `${designValues} ${RULE_ID} warnings, ${allowance} allowed: lower DESIGN_VALUE_WARNINGS to ${designValues} in scripts/eslint-all.ts (and update the plan's "Lint baseline").`,
    };
  }
  return { designValues, problem: undefined };
};
