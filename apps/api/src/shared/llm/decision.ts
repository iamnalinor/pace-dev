import { type Action, decisionStepOf, type ModelOutput, type Rejected } from "@pace/core";

import type { DecisionEntry } from "../contract.ts";

export type ParseOutcome =
  | {
      readonly status: "parsed";
      readonly provider: string;
      readonly output: ModelOutput;
      readonly actions: readonly Action[];
      readonly rejected: readonly Rejected[];
      /** For a correction, the earlier turns of its thread, the request first. */
      readonly thread?: readonly string[] | undefined;
    }
  | { readonly status: "unavailable"; readonly retryAt: null | string };

const doubtsOf = (actions: readonly Action[]): readonly string[] => [
  ...new Set(actions.flatMap((action) => action.doubtful ?? [])),
];

const leftOut = (item: Rejected): string => `${item.kind} (${item.reason})`;

const explain = (provider: string, actions: readonly Action[], rejected: readonly Rejected[]) => {
  const doubts = doubtsOf(actions);
  return [
    doubts.length === 0
      ? `Parsed by ${provider}; every field matched the text.`
      : `Parsed by ${provider}; not found in the text: ${doubts.join(", ")}.`,
    ...(rejected.length === 0
      ? []
      : [`Left out: ${rejected.map((item) => leftOut(item)).join(", ")}.`]),
  ].join(" ");
};

/** A correction's request (the thread's first message) and the turns between it and this one. */
const threadOf = (text: string, thread: readonly string[] = []) => {
  const [request, ...turns] = thread;
  return request === undefined || request === text ? {} : { request, turns };
};

/**
The decision-log entry of one LLM parse: the text, what the model answered, what was proposed
and what was left out (an unknown alias, an unquoted delete), and what could not be verified.
A correction names the `request` it belongs to and the turns before it, so the log can show the
conversation as one.
*/
export const parseDecision = (
  text: string,
  channel: "api" | "bot",
  outcome: ParseOutcome,
): DecisionEntry =>
  outcome.status === "parsed"
    ? {
        explanation: explain(outcome.provider, outcome.actions, outcome.rejected),
        inputs: {
          channel,
          doubtful: [...doubtsOf(outcome.actions)],
          output: outcome.output,
          actions: outcome.actions.map((action) => action.summary),
          // What the log words in the reader's language, matches to an approval and opens.
          steps: outcome.actions.map((action) => decisionStepOf(action)),
          provider: outcome.provider,
          rejected: outcome.rejected.map((item) => ({ ...item })),
          text,
          ...threadOf(text, outcome.thread),
        },
        kind: "parse",
        outcome: "parsed",
        rule: `parse.${outcome.actions[0]?.kind ?? "none"}`,
        taskId: null,
      }
    : {
        explanation: "No model answered (limits, errors or time); the text was not parsed.",
        inputs: { channel, retryAt: outcome.retryAt, text },
        kind: "parse",
        outcome: "unavailable",
        rule: "parse.unavailable",
        taskId: null,
      };
