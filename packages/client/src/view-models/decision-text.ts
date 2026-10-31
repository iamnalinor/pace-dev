import { type DecisionInputs, type Language, readAnswer, t } from "@pace/core";

const OPENING = ["“", "«"];
const CLOSING = ["”", "»"];

/** The first of `marks` in `text`, or -1. */
const firstOf = (text: string, marks: readonly string[]): number => {
  const found = marks.map((mark) => text.indexOf(mark)).filter((index) => index !== -1);
  return found.length === 0 ? -1 : Math.min(...found);
};

/** The quoted name in a summary ("The assistant will start “Gym”" → Gym), for older rows. */
export const quoted = (summary: string): null | string => {
  const open = firstOf(summary, OPENING);
  const rest = summary.slice(open + 1);
  const close = firstOf(rest, CLOSING);
  return open === -1 || close < 1 ? null : rest.slice(0, close);
};

/**
The request and what answered it: a correction's row names its request; a tapped answer reads
as an answer to its question, never as quoted typing.
*/
export const conversationOf = (
  inputs: DecisionInputs,
  language: Language,
): { readonly followup: null | string; readonly request: null | string } => {
  const { request, text } = inputs;
  const answer = text === null ? null : readAnswer(text);
  if (answer !== null) {
    return { followup: t(language, "decisions.answered", { ...answer }), request };
  }
  return request === null || text === null
    ? { followup: null, request: text }
    : { followup: t(language, "decisions.corrected", { text }), request };
};
