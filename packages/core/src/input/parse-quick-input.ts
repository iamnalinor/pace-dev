import type { CoreState } from "../materialize/core-state.ts";
import type { Importance } from "../model/preset.ts";

import { extractLink } from "../links.ts";
import { presetChain, resolvePreset } from "../presets/resolve-preset.ts";
import { accountTz, type QueryContext } from "../queries/context.ts";
import { suggestFor } from "../queries/suggest.ts";
import {
  dueOf,
  estimateOf,
  findDay,
  findTime,
  importanceOf,
  problemsOf,
  projectTagOf,
  type QuickSubtask,
} from "./quick-fields.ts";
import { findFirst, type Found, mask, type QuickSpan, titleOf, toSpan } from "./quick-spans.ts";

/**
The single entry point's rule-based reading of what the user typed (the LLM parse of
stage 2 fills the same shape). Recognised phrases become fields and leave the title; the
rest of the title is the user's own words, untouched. The full text is kept as the source.
*/
export type QuickInput = {
  readonly text: string;
  readonly title: string;
  readonly presetId: string;
  readonly projectId: null | string;
  /** A `#name` for a project that does not exist yet: created on add. */
  readonly projectName: null | string;
  readonly importance: Importance;
  /** Whether the text named the importance (else it is the category's default). */
  readonly isImportanceExplicit: boolean;
  readonly dueAt: null | string;
  readonly dueTz: null | string;
  readonly estimateMinutes: null | number;
  readonly link: null | string;
  readonly subtasks: readonly QuickSubtask[];
  readonly spans: readonly QuickSpan[];
};

const linkSpansOf = (text: string, link: null | string): readonly QuickSpan[] => {
  const start = link === null ? -1 : text.indexOf(link);
  return link === null || start < 0 ? [] : [{ end: start + link.length, kind: "link", start }];
};

/** A leading "hw"/"дз" names the category, not the task, unless a number follows ("дз 7"). */
const HOMEWORK_TAG = /^ ?(?:hw|дз)(?![\p{L}\p{N}])(?! ?№? ?\d)/giu;

/** The leading tag when the chosen preset is Homework or a course under it. */
const presetTagOf = (state: CoreState, text: string, presetId: string): readonly Found[] => {
  const chain = presetChain(state.presets, presetId);
  return chain.ok && chain.value[0]?.id === "hw"
    ? optional(findFirst(text, HOMEWORK_TAG, "preset"))
    : [];
};

const optional = (found: Found | undefined): readonly Found[] =>
  found === undefined ? [] : [found];

const inOrder = (links: readonly QuickSpan[], found: readonly Found[]): readonly QuickSpan[] =>
  [...links, ...found.map((item) => toSpan(item))].toSorted((a, b) => a.start - b.start);

/** Date, time and project come first: their digits must not read as problems or estimates. */
const readDated = (state: CoreState, text: string) => {
  const project = projectTagOf(state, text);
  const time = findTime(text);
  const day = findDay(mask(text, optional(time)));
  const spans = [...project.spans, ...optional(time), ...optional(day)];
  return { day, project, rest: mask(text, spans), spans, time };
};

export const parseQuickInput = (text: string, state: CoreState, ctx: QueryContext): QuickInput => {
  const zone = accountTz(state, ctx);
  const link = extractLink(text);
  const linkSpans = linkSpansOf(text, link);
  const dated = readDated(state, mask(text, linkSpans));
  const estimate = estimateOf(dated.rest);
  const named = importanceOf(mask(dated.rest, estimate.spans));
  const words = mask(dated.rest, [...estimate.spans, ...named.spans]);
  const suggestion = suggestFor(state, words, ctx);
  const preset = resolvePreset(state.presets, suggestion.presetId);
  // Numbered problems belong to homework-like presets, where each one is submitted.
  const hasProblems = preset.ok && preset.value.submission === "per_subtask";
  const problems = hasProblems ? problemsOf(words) : { spans: [], subtasks: [] };
  const spans = inOrder(linkSpans, [
    ...presetTagOf(state, words, suggestion.presetId),
    ...dated.spans,
    ...estimate.spans,
    ...named.spans,
    ...problems.spans,
  ]);
  const dueAt = dueOf(dated, { now: ctx.now, zone });
  const { project } = dated;
  return {
    dueAt,
    dueTz: dueAt === null ? null : zone,
    estimateMinutes: estimate.minutes,
    importance: named.importance ?? (preset.ok ? preset.value.defaultImportance : "normal"),
    isImportanceExplicit: named.importance !== null,
    link,
    presetId: suggestion.presetId,
    projectId: project.projectId ?? (project.projectName === null ? suggestion.projectId : null),
    projectName: project.projectName,
    spans,
    subtasks: problems.subtasks,
    text,
    title: titleOf(text, spans),
  };
};
