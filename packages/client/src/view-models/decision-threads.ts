import { type Decision, readDecisionInputs } from "@pace/core";

/*
A conversation with the assistant is a request, then answers and corrections, each a reading of
its own in the log. The log shows the conversation once, on its newest reading.
*/

/** A conversation's later readings come within this long of its first. */
const THREAD_SPAN_MS = 60 * 60_000;

/** A reading's conversation (its request) and the turns it was preceded by. */
const threadOf = (decision: Decision) => {
  const { request, text, turns } = readDecisionInputs(decision.inputs);
  return { before: request === null ? [] : [request, ...turns], key: request ?? text, text };
};

/** Whether `later` went on from `earlier`: the same request, `earlier`'s text among its turns. */
const isContinuedBy = (earlier: Decision, later: Decision): boolean => {
  const own = threadOf(earlier);
  const next = threadOf(later);
  const gap = Date.parse(later.at) - Date.parse(earlier.at);
  const isSoonAfter = gap >= 0 && gap <= THREAD_SPAN_MS;
  return (
    isSoonAfter &&
    own.key !== null &&
    own.text !== null &&
    next.key === own.key &&
    next.before.includes(own.text)
  );
};

/**
A reading a newer one of the same conversation went on from (a correction or an answer after
it, recorded or not): that newer row tells the conversation.
*/
export const isFolded = (decision: Decision, newer: readonly Decision[]): boolean =>
  decision.kind === "parse" &&
  newer.some((later) => later.kind === "parse" && isContinuedBy(decision, later));
