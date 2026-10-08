import type { UrgencyPolicy } from "../model/preset.ts";
import type { UrgencyInput } from "./input.ts";
import type { ExplainInput, ExplainKey, ExplainStep, FormulaSymbol } from "./trace.ts";

import { evaluate, type Evaluation, type Score, toScore } from "./score.ts";

/** The "why it's Nth" card: the policy's formula, what went in, and the numbers out. */
export type Explanation = {
  readonly policy: UrgencyPolicy;
  readonly formula: string;
  /** What each letter of the formula stands for. */
  readonly legend: readonly FormulaSymbol[];
  readonly inputs: readonly ExplainInput[];
  readonly steps: readonly ExplainStep[];
  readonly score: Score;
};

const rankRows = (rank: UrgencyInput["rank"]): readonly ExplainInput[] =>
  rank === null
    ? []
    : [
        { key: "rank", value: rank.position },
        { key: "rankSize", value: rank.size },
      ];

/** A row that is only shown when it applies. */
const optionalRow = (key: ExplainKey, value: null | string): readonly ExplainInput[] =>
  value === null ? [] : [{ key, value }];

const contextRows = (input: UrgencyInput, evaluation: Evaluation): readonly ExplainInput[] => [
  ...optionalRow("waitingSince", input.waitingSince),
  ...optionalRow("implicitDue", evaluation.implicit === null ? null : evaluation.effectiveDue),
];

/** The implicit horizon shows up as a step only when it decided the urgency. */
const implicitStep = (evaluation: Evaluation): readonly ExplainStep[] =>
  evaluation.implicit === null || evaluation.implicit.u <= evaluation.policy.u
    ? []
    : [{ key: "implicitUrgency", value: evaluation.implicit.u }];

/** The policy's own steps, the deciding implicit pace, then the score arithmetic. */
const stepRows = (evaluation: Evaluation, score: Score): readonly ExplainStep[] => {
  const own = evaluation.policy.steps.filter((row) => row.key !== "urgency");
  return [
    ...own,
    ...implicitStep(evaluation),
    { key: "urgency", value: evaluation.urgency },
    { key: "rankBonus", value: score.rankBonus },
    { key: "score", value: score.score },
  ];
};

export const explain = (input: UrgencyInput, now: string): Explanation => {
  const evaluation = evaluate(input, now);
  const score = toScore(input, now, evaluation);
  return {
    policy: input.policy,
    formula: evaluation.policy.formula,
    legend: evaluation.policy.legend,
    inputs: [
      ...evaluation.policy.inputs,
      { key: "multiplier", value: score.multiplier, unit: "x" },
      ...rankRows(input.rank),
      ...contextRows(input, evaluation),
    ],
    steps: stepRows(evaluation, score),
    score,
  };
};
