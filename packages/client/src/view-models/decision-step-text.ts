import {
  type DecisionStep,
  type Language,
  type MessageKey,
  type ParseField,
  shownLabel,
  t,
  taskById,
} from "@pace/core";

import type { Lookup } from "./decision-lookup.ts";

import { quoted } from "./decision-text.ts";

/** An activity's name as the reader sees it (automatic sleep's stored label worded, class 42). */
const activityName = (
  activityId: null | string,
  { language, state }: Pick<Lookup, "language" | "state">,
): string | undefined => {
  const activity = activityId === null ? undefined : state.time.activities[activityId];
  return activity === undefined ? undefined : shownLabel(activity, language);
};

/** What a step is about as it was named when read (its summary quotes it), else as it is now. */
const subjectOf = (step: DecisionStep, lookup: Lookup, summary = ""): string =>
  step.subject ??
  quoted(summary) ??
  (step.taskId === null ? undefined : taskById(lookup.state.tasks, step.taskId)?.title) ??
  activityName(step.activityId, lookup) ??
  "…";

export const fieldList = (fields: readonly ParseField[], language: Language): string =>
  [...new Set(fields)].map((field) => t(language, `parseField.${field}`)).join(", ");

const isOnly = (step: DecisionStep, field: ParseField): boolean =>
  step.fields.length > 0 && step.fields.every((changed) => changed === field);

/** Which sentence says a step: a rename and a moved deadline have their own. */
const sentenceOf = (step: DecisionStep) => {
  if (step.renamedTo !== null && step.kind === "task.update" && isOnly(step, "title")) {
    return "task.rename";
  }
  if (step.renamedTo !== null && step.kind === "activity.update" && isOnly(step, "label")) {
    return "activity.rename";
  }
  return step.kind === "task.update" && isOnly(step, "dueDate") ? "task.due" : step.kind;
};

/** Done (applied), offered (answered or expired), pending (a card still open: QA round 17 L16). */
export type Tense = "done" | "offered" | "pending";

/**
A step in words; `null` when the step lacks what its sentence names (an older row's edit
without its fields, a close without its outcome), so the stored summary is shown instead.
*/
export const stepText = (
  step: DecisionStep,
  {
    lookup,
    quote = (text) => text,
    summary,
    tense,
  }: {
    readonly lookup: Lookup;
    readonly summary: string | undefined;
    readonly tense: Tense;
    /** How a name from data is quoted in the sentence (shortened at its slot in a toast). */
    readonly quote?: (text: string) => string;
  },
): null | string => {
  const { language } = lookup;
  const isEdit = step.kind === "task.update" || step.kind === "activity.update";
  if (
    (isEdit && step.fields.length === 0) ||
    (step.kind === "task.close" && step.closeOutcome === null)
  ) {
    return null;
  }
  const key: MessageKey = `decisions.${tense}.${sentenceOf(step)}`;
  return t(language, key, {
    fields: fieldList(step.fields, language),
    outcome: step.closeOutcome === null ? "" : t(language, `outcome.${step.closeOutcome}`),
    subject: quote(subjectOf(step, lookup, summary)),
    to: quote(step.renamedTo ?? ""),
  });
};
