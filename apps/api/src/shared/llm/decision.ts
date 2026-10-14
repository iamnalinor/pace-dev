import type { ModelOutput, Proposal, Rejected } from "@pace/core";

import type { DecisionEntry } from "../contract.ts";

export type ParseOutcome =
  | {
      readonly status: "parsed";
      readonly provider: string;
      readonly output: ModelOutput;
      readonly proposals: readonly Proposal[];
      readonly rejected: readonly Rejected[];
    }
  | { readonly status: "unavailable"; readonly retryAt: null | string };

const doubtsOf = (proposals: readonly Proposal[]): readonly string[] => [
  ...new Set(proposals.flatMap((proposal) => proposal.doubtful ?? [])),
];

const leftOut = (item: Rejected): string => `${item.kind} (${item.reason})`;

const explain = (
  provider: string,
  proposals: readonly Proposal[],
  rejected: readonly Rejected[],
) => {
  const doubts = doubtsOf(proposals);
  return [
    doubts.length === 0
      ? `Parsed by ${provider}; every field matched the text.`
      : `Parsed by ${provider}; not found in the text: ${doubts.join(", ")}.`,
    ...(rejected.length === 0
      ? []
      : [`Left out: ${rejected.map((item) => leftOut(item)).join(", ")}.`]),
  ].join(" ");
};

/**
The decision-log entry of one LLM parse: the text, what the model answered, what was proposed
and what was left out (an unknown alias, an unquoted delete), and what could not be verified.
*/
export const parseDecision = (
  text: string,
  channel: "api" | "bot",
  outcome: ParseOutcome,
): DecisionEntry =>
  outcome.status === "parsed"
    ? {
        explanation: explain(outcome.provider, outcome.proposals, outcome.rejected),
        inputs: {
          channel,
          doubtful: [...doubtsOf(outcome.proposals)],
          output: outcome.output,
          proposals: outcome.proposals.map((proposal) => proposal.summary),
          rejected: outcome.rejected.map((item) => ({ ...item })),
          text,
        },
        kind: "parse",
        outcome: "parsed",
        rule: `parse.${outcome.proposals[0]?.kind ?? "none"}`,
        taskId: null,
      }
    : {
        explanation: "No model could answer (rate limits); the text was not parsed.",
        inputs: { channel, retryAt: outcome.retryAt, text },
        kind: "parse",
        outcome: "unavailable",
        rule: "parse.unavailable",
        taskId: null,
      };
