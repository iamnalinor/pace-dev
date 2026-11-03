import { describe, expect, it } from "bun:test";

import {
  BARE_PRESSABLE_RULE,
  DESIGN_VALUE_RULE,
  type Ratchet,
  summarise,
} from "./eslint-ratchet.ts";

const result = (ruleIds: readonly string[]) => ({
  messages: ruleIds.map((ruleId) => ({ ruleId, severity: 1 })),
  warningCount: ruleIds.length,
});

const designValues = (allowance: number): Ratchet => ({
  allowance,
  constant: "DESIGN_VALUE_WARNINGS",
  rule: DESIGN_VALUE_RULE,
});

const barePressables = (allowance: number): Ratchet => ({
  allowance,
  constant: "BARE_PRESSABLE_WARNINGS",
  rule: BARE_PRESSABLE_RULE,
});

describe("summarise", () => {
  it("counts only this rule's messages against the allowance", () => {
    const results = [result([DESIGN_VALUE_RULE, DESIGN_VALUE_RULE]), result([DESIGN_VALUE_RULE])];
    expect(summarise(results, [designValues(3)])).toEqual({
      counts: { [DESIGN_VALUE_RULE]: 3 },
      problem: undefined,
    });
  });

  it("fails above the allowance", () => {
    const { problem } = summarise(
      [result([DESIGN_VALUE_RULE, DESIGN_VALUE_RULE])],
      [designValues(1)],
    );
    expect(problem).toContain("2");
    expect(problem).toContain("DESIGN_VALUE_WARNINGS");
  });

  it("fails below the allowance and asks to lower it to the new number", () => {
    const { problem } = summarise([result([DESIGN_VALUE_RULE])], [designValues(5)]);
    expect(problem).toContain("lower DESIGN_VALUE_WARNINGS to 1");
  });

  it("fails on any other warning, even within the allowance", () => {
    const { problem } = summarise(
      [result([DESIGN_VALUE_RULE]), result(["no-console"])],
      [designValues(1)],
    );
    expect(problem).toContain("other warning");
  });

  it("is quiet when nothing is reported and nothing is allowed", () => {
    expect(summarise([], []).problem).toBeUndefined();
  });

  it("holds every ratcheted rule to its own exact number, naming its own constant", () => {
    const results = [result([DESIGN_VALUE_RULE, BARE_PRESSABLE_RULE, BARE_PRESSABLE_RULE])];
    expect(summarise(results, [designValues(1), barePressables(2)]).problem).toBeUndefined();
    const above = summarise(results, [designValues(1), barePressables(1)]).problem;
    expect(above).toContain("BARE_PRESSABLE_WARNINGS");
    expect(above).not.toContain("DESIGN_VALUE_WARNINGS");
    expect(summarise(results, [designValues(1), barePressables(3)]).problem).toContain(
      "lower BARE_PRESSABLE_WARNINGS to 2",
    );
  });

  it("counts a ratcheted rule's warnings as other warnings where that part allows none", () => {
    const { problem } = summarise([result([BARE_PRESSABLE_RULE])], [designValues(0)]);
    expect(problem).toContain("other warning");
  });
});
