import type { ActionContext, ContextActivity, ContextTask } from "../actions/context.ts";
import type { ModelAction, ParseField } from "./schema.ts";

import { err, ok, type Result } from "../result.ts";
import { formatInZone, wallClockInstant } from "../time.ts";
import { hasWords, isQuotedFrom, isWordFrom, normalizeForEvidence } from "./normalize.ts";

/** Why an action the model gave cannot be proposed at all. */
export type ActionRejection =
  | "action/bad-time"
  | "action/unknown-activity"
  | "action/unknown-task"
  | "action/unquoted-delete";

/**
An action that checks out, with what it refers to and the fields that could not be checked
against the message. A doubtful field is not dropped: it is shown marked, and the person
confirms or fixes it.
*/
export type VerifiedAction = {
  readonly action: ModelAction;
  readonly doubtful: readonly ParseField[];
  readonly task: ContextTask | null;
  readonly activity: ContextActivity | null;
  /** The start and end read on the account's clock. */
  readonly start: null | string;
  readonly end: null | string;
};

export type VerifyContext = {
  readonly source: string;
  /** Names of existing projects: picking one needs no quote. */
  readonly projectNames: readonly string[];
  /** The lists the model was shown: every alias it uses must be one of them. */
  readonly context: ActionContext;
  readonly zone: string;
};

/** Fields whose value is a number, a date or a time: they need a quote that says it. */
const NEEDS_EVIDENCE = [
  "dueDate",
  "dueTime",
  "estimateMinutes",
  "expectMinutes",
  "start",
  "end",
] as const satisfies readonly (keyof ModelAction & ParseField)[];

const hasEvidence = (action: ModelAction, field: ParseField, source: string): boolean =>
  action.evidence.some((entry) => entry.field === field && isQuotedFrom(entry.quote, source));

const isVerbatim = (value: null | string, source: string): boolean =>
  value === null || isQuotedFrom(value, source);

const CYRILLIC = /\p{Script=Cyrillic}/u;

/** Longer than this a "title" is the message again, not a name for it. */
const TITLE_MAX_CHARS = 80;

/**
A title may be composed (a short name for a long message), but in the message's own
language: a Russian message never gets an English title, nor the other way round.
*/
const isFittingTitle = (title: null | string, source: string): boolean =>
  title === null ||
  isQuotedFrom(title, source) ||
  (title.length <= TITLE_MAX_CHARS && CYRILLIC.test(title) === CYRILLIC.test(source));

const isKnownProject = (name: null | string, names: readonly string[]): boolean =>
  name !== null && names.some((known) => known.toLowerCase() === name.toLowerCase());

const textDoubts = (
  action: ModelAction,
  { projectNames, source }: VerifyContext,
): readonly ParseField[] => [
  ...(isFittingTitle(action.title, source) ? [] : ["title" as const]),
  ...(isFittingTitle(action.label, source) ? [] : ["label" as const]),
  ...(isVerbatim(action.description, source) ? [] : ["description" as const]),
  ...(isVerbatim(action.link, source) ? [] : ["link" as const]),
  ...(isKnownProject(action.project, projectNames) || isVerbatim(action.project, source)
    ? []
    : ["project" as const]),
  ...(action.subtasks.every((subtask) => isWordFrom(subtask.label, source))
    ? []
    : ["subtasks" as const]),
];

const numberDoubts = (action: ModelAction, source: string): readonly ParseField[] =>
  NEEDS_EVIDENCE.filter((field) => action[field] !== null && !hasEvidence(action, field, source));

/** `YYYY-MM-DD HH:MM` on the zone's wall clock, if it names a real minute there. */
export const readWallClock = (value: string, zone: string): null | string => {
  const [date = "", time = ""] = value.split(" ", 2);
  const instant = wallClockInstant(date, time, zone);
  return Number.isNaN(Date.parse(instant)) ||
    formatInZone(instant, zone, "yyyy-MM-dd HH:mm") !== value
    ? null
    : instant;
};

const TASK_KINDS: ReadonlySet<ModelAction["kind"]> = new Set([
  "task.update",
  "task.delete",
  "task.close",
  "task.addSubtasks",
  "task.markSubtasks",
]);

const ACTIVITY_KINDS: ReadonlySet<ModelAction["kind"]> = new Set([
  "activity.update",
  "activity.delete",
]);

type Refs = Pick<VerifiedAction, "activity" | "task">;

/** The task or activity an action names, by an alias of the lists the model was shown. */
const refsOf = (action: ModelAction, context: ActionContext): Result<Refs, ActionRejection> => {
  const task = context.tasks.find((item) => item.alias === action.task) ?? null;
  const activity = context.activities.find((item) => item.alias === action.activity) ?? null;
  if (task === null && TASK_KINDS.has(action.kind)) {
    return err("action/unknown-task");
  }
  return activity === null && ACTIVITY_KINDS.has(action.kind)
    ? err("action/unknown-activity")
    : ok({ activity, task });
};

/** Shorter than this a title could hide inside another word: it must stand as whole words. */
const SHORT_TITLE = 4;

/** The listed name occurs in the quote; a short one only as whole words. */
const isNamedIn = (name: string, quote: string): boolean =>
  normalizeForEvidence(name).length < SHORT_TITLE
    ? hasWords(name, quote)
    : isQuotedFrom(name, quote);

/** A delete names the item as listed: a wrong alias then deletes nothing instead of something else. */
const isQuotedDelete = (action: ModelAction, refs: Refs): boolean => {
  const listed: Partial<Record<ModelAction["kind"], string | undefined>> = {
    "activity.delete": refs.activity?.label,
    "task.delete": refs.task?.title,
  };
  const name = listed[action.kind];
  return name === undefined || (action.quote !== null && isNamedIn(name, action.quote));
};

type Times = Pick<VerifiedAction, "end" | "start">;

/** `undefined` for a time given that names no real minute. */
const timeOf = (value: null | string, zone: string): null | string | undefined =>
  value === null ? null : (readWallClock(value, zone) ?? undefined);

const timesOf = (action: ModelAction, zone: string): Result<Times, "action/bad-time"> => {
  const start = timeOf(action.start, zone);
  const end = timeOf(action.end, zone);
  return start === undefined || end === undefined ? err("action/bad-time") : ok({ end, start });
};

/**
Checks one action against the message and the lists the model was shown: every alias must be
one of them, a delete must quote the item's title, times must name real minutes. Copied strings
must occur in the message (normalized compare), a title or label may be a short name in the
message's language, numbers, dates and times need a quote from it: what fails those comes
back as doubtful.
*/
export const verifyAction = (
  action: ModelAction,
  context: VerifyContext,
): Result<VerifiedAction, ActionRejection> => {
  const refs = refsOf(action, context.context);
  if (!refs.ok) {
    return refs;
  }
  if (!isQuotedDelete(action, refs.value)) {
    return err("action/unquoted-delete");
  }
  const times = timesOf(action, context.zone);
  if (!times.ok) {
    return times;
  }
  return ok({
    action,
    doubtful: [...textDoubts(action, context), ...numberDoubts(action, context.source)],
    ...refs.value,
    ...times.value,
  });
};
