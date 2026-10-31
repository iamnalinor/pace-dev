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

/** One turn after the request in words: a tapped answer as an answer, typing as typing. */
const turnText = (text: string, language: Language): string => {
  const answer = readAnswer(text);
  return answer === null
    ? t(language, "decisions.corrected", { text })
    : t(language, "decisions.answered", { ...answer });
};

/**
The request and every turn after it, in order: a correction's row names its request and the
turns before it; a tapped answer reads as an answer to its question, never as quoted typing.
An older row without its request shows its own text as the request, or as an answer.
*/
export const conversationOf = (
  inputs: DecisionInputs,
  language: Language,
): { readonly followups: readonly string[]; readonly request: null | string } => {
  const { request, text, turns } = inputs;
  if (text === null) {
    return { followups: [], request };
  }
  if (request !== null) {
    return { followups: [...turns, text].map((turn) => turnText(turn, language)), request };
  }
  return readAnswer(text) === null
    ? { followups: [], request: text }
    : { followups: [turnText(text, language)], request: null };
};
