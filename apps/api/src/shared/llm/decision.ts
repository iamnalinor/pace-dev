import type { ParseResult } from "@pace/core";

import type { DecisionEntry } from "../contract.ts";

export type ParseOutcome =
  | {
      readonly status: "parsed";
      readonly provider: string;
      readonly result: ParseResult;
      readonly doubtful: readonly string[];
    }
  | { readonly status: "unavailable"; readonly retryAt: null | string };

/** The decision-log entry of one LLM parse: the text, what came back, what could not be verified. */
export const parseDecision = (
  text: string,
  channel: "api" | "bot",
  outcome: ParseOutcome,
): DecisionEntry =>
  outcome.status === "parsed"
    ? {
        explanation:
          outcome.doubtful.length === 0
            ? `Parsed by ${outcome.provider}; every field matched the text.`
            : `Parsed by ${outcome.provider}; not found in the text: ${outcome.doubtful.join(", ")}.`,
        inputs: { channel, doubtful: [...outcome.doubtful], result: outcome.result, text },
        kind: "parse",
        outcome: "parsed",
        rule: `parse.${outcome.result.intent}`,
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
