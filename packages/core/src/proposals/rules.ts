import type { CoreState } from "../materialize/core-state.ts";
import type { ActivityCategory, TimeState } from "../tracking/model.ts";
import type { ParseDomain } from "./kinds.ts";
import type { ProposalBody, TaskDraft } from "./schema.ts";

import { parseQuickInput, type QuickInput, shortTitle } from "../input/parse-quick-input.ts";
import { accountTz, type QueryContext } from "../queries/context.ts";
import { typedActivity, typedSpan } from "../tracking/typed.ts";
import { fitMinutes, fitText, PROPOSAL_LIMITS as LIMITS } from "./limits.ts";

/** A label used before keeps the category it had last; anything new is Other. */
export const categoryOfLabel = (time: TimeState, label: string): ActivityCategory => {
  const key = label.trim().toLowerCase();
  return (
    Object.values(time.activities)
      .filter((activity) => activity.label.trim().toLowerCase() === key)
      .toSorted((a, b) => b.startAt.localeCompare(a.startAt))[0]?.category ?? "other"
  );
};

/** The rules' title; a line of nothing but punctuation is its own title. */
const titleOfInput = (input: QuickInput): string =>
  [input.title, shortTitle(input.text), fitText(input.text.trim(), LIMITS.title)].find(
    (title) => title !== "",
  ) ?? input.text;

/** The composer's rule-based reading as a create form's fields. */
export const draftOfInput = (input: QuickInput): TaskDraft => ({
  description: input.description,
  dueAt: input.dueAt,
  dueTz: input.dueTz,
  estimateMinutes: fitMinutes(input.estimateMinutes, LIMITS.estimateMinutes),
  importance: input.isImportanceExplicit ? input.importance : null,
  // A link too long to keep is left in the text, where it stays as typed.
  link: input.link !== null && input.link.length <= LIMITS.link ? input.link : null,
  presetId: input.presetId,
  projectId: input.projectId,
  projectName: input.projectName === null ? null : fitText(input.projectName, LIMITS.projectName),
  sourceText: input.text,
  subtasks: input.subtasks.slice(0, LIMITS.subtasks).map((subtask) => ({
    label: fitText(subtask.label, LIMITS.subtaskLabel),
    number: subtask.number,
  })),
  title: titleOfInput(input),
});

const MINUTE = 60_000;

/**
An activity typed without the assistant: a block already over ("7:30 - 8:30 военкомат") is
logged, one still on is started from its beginning, expected to last until its end; words
without a span start now, a length in them as the Expect.
*/
const activityByRules = (text: string, world: World): ProposalBody => {
  const { ctx, state } = world;
  const span = typedSpan(text, { now: ctx.now, zone: accountTz(state, ctx) });
  if (span === null) {
    const typed = typedActivity(text);
    return {
      category: categoryOfLabel(state.time, typed.label),
      expectMinutes: fitMinutes(typed.expectMinutes, LIMITS.expectMinutes),
      kind: "activity.start",
      label: typed.label,
    };
  }
  const category = categoryOfLabel(state.time, span.label);
  return span.endAt <= ctx.now
    ? { category, end: span.endAt, kind: "activity.log", label: span.label, start: span.startAt }
    : {
        category,
        expectMinutes: fitMinutes(
          (Date.parse(span.endAt) - Date.parse(span.startAt)) / MINUTE,
          LIMITS.expectMinutes,
        ),
        kind: "activity.start",
        label: span.label,
        startAt: span.startAt,
      };
};

type World = { readonly state: CoreState; readonly ctx: QueryContext };

/**
What a message proposes when no model can read it: a new task by the composer's rules, or an
activity by its typed span. Never an edit: those need the model to tell which item is meant.
*/
export const proposalsByRules = (
  text: string,
  domain: ParseDomain,
  world: World,
): readonly ProposalBody[] => [
  domain === "task"
    ? { kind: "task.create", task: draftOfInput(parseQuickInput(text, world.state, world.ctx)) }
    : activityByRules(text, world),
];

/** How sure the rules are of the domain they pick: never enough to skip asking. */
export const RULES_CONFIDENCE = 0.5;

/** The rules' guess at what a message is about: a typed time span is an activity. */
export const domainByRules = (text: string, world: World): ParseDomain =>
  typedSpan(text, { now: world.ctx.now, zone: accountTz(world.state, world.ctx) }) === null
    ? "task"
    : "activity";
