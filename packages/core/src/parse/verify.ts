import type { ParseField, ParseResult } from "./schema.ts";

import { isQuotedFrom, isWordFrom } from "./normalize.ts";

/**
A parse with the fields that could not be checked against the message. Nothing is
dropped: a doubtful field is shown marked, and the person confirms or fixes it.
*/
export type VerifiedParse = {
  readonly result: ParseResult;
  readonly doubtful: readonly ParseField[];
  /** All fields check out and nothing is asked: safe to accept in one tap. */
  readonly isClean: boolean;
};

type Context = {
  readonly source: string;
  /** Names of existing projects: picking one needs no quote. */
  readonly projectNames: readonly string[];
};

/** Fields whose value is a number or a date: they need a quote that says it. */
const NEEDS_EVIDENCE: readonly ParseField[] = ["dueDate", "dueTime", "estimateMinutes"];

const hasEvidence = (result: ParseResult, field: ParseField, source: string): boolean =>
  result.evidence.some((entry) => entry.field === field && isQuotedFrom(entry.quote, source));

const isVerbatim = (value: null | string, source: string): boolean =>
  value === null || isQuotedFrom(value, source);

const isKnownProject = (name: null | string, names: readonly string[]): boolean =>
  name !== null && names.some((known) => known.toLowerCase() === name.toLowerCase());

const textDoubts = (result: ParseResult, { projectNames, source }: Context): readonly ParseField[] => [
  ...(isVerbatim(result.title, source) ? [] : ["title" as const]),
  ...(isVerbatim(result.description, source) ? [] : ["description" as const]),
  ...(isKnownProject(result.project, projectNames) || isVerbatim(result.project, source)
    ? []
    : ["project" as const]),
  ...(result.subtasks.every((subtask) => isWordFrom(subtask.label, source))
    ? []
    : ["subtasks" as const]),
];

const numberDoubts = (result: ParseResult, source: string): readonly ParseField[] =>
  NEEDS_EVIDENCE.filter((field) => {
    const value = result[field as "dueDate" | "dueTime" | "estimateMinutes"];
    return value !== null && !hasEvidence(result, field, source);
  });

/**
Checks a parse against its message: copied strings must occur in it (normalized compare),
numbers and dates need a quote from it. Invented values come back as doubtful.
*/
export const verifyParse = (result: ParseResult, context: Context): VerifiedParse => {
  const doubtful = [...textDoubts(result, context), ...numberDoubts(result, context.source)];
  return {
    doubtful,
    isClean: doubtful.length === 0 && result.questions.length === 0,
    result,
  };
};
