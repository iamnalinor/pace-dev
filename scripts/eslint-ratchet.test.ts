import { describe, expect, it } from "bun:test";

import { RULE_ID, summarise } from "./eslint-ratchet.ts";

const result = (ruleIds: readonly string[]) => ({
  messages: ruleIds.map((ruleId) => ({ ruleId, severity: 1 })),
  warningCount: ruleIds.length,
});

describe("summarise", () => {
  it("counts only this rule's messages against the allowance", () => {
    const results = [result([RULE_ID, RULE_ID]), result([RULE_ID])];
    expect(summarise(results, 3)).toEqual({ designValues: 3, problem: undefined });
  });

  it("fails above the allowance", () => {
    const { problem } = summarise([result([RULE_ID, RULE_ID])], 1);
    expect(problem).toContain("2");
    expect(problem).toContain("DESIGN_VALUE_WARNINGS");
  });

  it("fails below the allowance and asks to lower it to the new number", () => {
    const { problem } = summarise([result([RULE_ID])], 5);
    expect(problem).toContain("lower DESIGN_VALUE_WARNINGS to 1");
  });

  it("fails on any other warning, even within the allowance", () => {
    const { problem } = summarise([result([RULE_ID]), result(["no-console"])], 1);
    expect(problem).toContain("other warning");
  });

  it("is quiet when nothing is reported and nothing is allowed", () => {
    expect(summarise([], 0).problem).toBeUndefined();
  });
});
