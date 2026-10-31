import type { ParseQuestion } from "./schema.ts";

import { err, ok, type Result } from "../result.ts";

/**
A tapped answer as the correction the assistant reads with its thread: the question it
answers, quoted, then the option chosen. The model's own words, never translated, so the app
and the bot send the same text: `«By when does this need to be done?» — Tomorrow`.
*/
export const answerText = (question: string, option: string): string =>
  `«${question.trim()}» — ${option.trim()}`;

/**
The correction a button stands for, by its question's and option's place in the answer
(Telegram's callback data carries indexes, never text); `answer/unknown` for a place that does
not exist (a stale or forged press).
*/
export const answerAt = (
  questions: readonly ParseQuestion[],
  at: { readonly question: number; readonly option: number },
): Result<string, "answer/unknown"> => {
  const question = Number.isSafeInteger(at.question) ? questions[at.question] : undefined;
  const option = Number.isSafeInteger(at.option) ? question?.options[at.option] : undefined;
  return question === undefined || option === undefined
    ? err("answer/unknown")
    : ok(answerText(question.question, option));
};
