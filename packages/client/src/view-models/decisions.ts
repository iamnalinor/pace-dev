import {
  ACTION_KINDS,
  type ActionKind,
  type Decision,
  DECISION_RESOLUTIONS,
  type DecisionInputs,
  type DecisionResolution,
  type DecisionStep,
  type Language,
  type MessageKey,
  type ParseField,
  readDecisionInputs,
  t,
  taskById,
} from "@pace/core";

import { existing, type Lookup, lookupOf, seenAfter, type World } from "./decision-lookup.ts";
import { providerLabel } from "./decision-provider.ts";

/** One row of the assistant log: what became of a message, in the reader's language. */
export type DecisionView = {
  readonly id: string;
  readonly at: string;
  /** What was done (or offered), one line per action; the first is the row's title. */
  readonly lines: readonly string[];
  /** What the person typed, verbatim. */
  readonly request: null | string;
  /** What the person did with it, read by the rules, read later, or what the data shows since. */
  readonly outcome: null | string;
  /** The fields the model only guessed: "Not in your text: project, subtasks". */
  readonly notFound: null | string;
  /** Which model read it, as a small detail; never a provider's internal name. */
  readonly via: null | string;
  /** The server's own explanation, for a row this client words only in part. */
  readonly note: null | string;
  /** A task the row opens: the one created, or the one the action was about. */
  readonly taskId: null | string;
};

const OPENING = ["“", "«"];
const CLOSING = ["”", "»"];

/** The first of `marks` in `text`, or -1. */
const firstOf = (text: string, marks: readonly string[]): number => {
  const found = marks.map((mark) => text.indexOf(mark)).filter((index) => index !== -1);
  return found.length === 0 ? -1 : Math.min(...found);
};

/** The quoted name in a summary ("The assistant will start “Gym”" → Gym), for older rows. */
const quoted = (summary: string): null | string => {
  const open = firstOf(summary, OPENING);
  const rest = summary.slice(open + 1);
  const close = firstOf(rest, CLOSING);
  return open === -1 || close < 1 ? null : rest.slice(0, close);
};

const KINDS: ReadonlySet<string> = new Set<string>(ACTION_KINDS);

type Steps = readonly (DecisionStep | null)[];

/**
The steps of a row, `null` for one this client cannot read: kept since the log stores them; for
an older row, the first from the decision's rule ("parse.activity.start") with the name its
summary quotes.
*/
const stepsOf = (decision: Decision, inputs: DecisionInputs): Steps => {
  if (inputs.steps.length > 0) {
    return inputs.steps;
  }
  const kind = decision.rule.replace(/^parse\./u, "");
  const subject = quoted(inputs.summaries[0] ?? "");
  return subject !== null && KINDS.has(kind)
    ? [
        {
          activityId: null,
          closeOutcome: null,
          fields: [],
          kind: kind as ActionKind,
          startAt: null,
          subject,
          taskId: null,
        },
      ]
    : [];
};

const known = (steps: Steps): readonly DecisionStep[] =>
  steps.filter((step): step is DecisionStep => step !== null);

const subjectOf = (step: DecisionStep, { state }: Lookup): string =>
  step.subject ??
  (step.taskId === null ? undefined : taskById(state.tasks, step.taskId)?.title) ??
  (step.activityId === null ? undefined : state.time.activities[step.activityId]?.label) ??
  "…";

const fieldList = (fields: readonly ParseField[], language: Language): string =>
  [...new Set(fields)].map((field) => t(language, `parseField.${field}`)).join(", ");

/**
A step in words; `null` when the step lacks what its sentence names (an older row's edit
without its fields, a close without its outcome), so the stored summary is shown instead.
*/
const stepText = (step: DecisionStep, tense: "done" | "offered", lookup: Lookup): null | string => {
  const { language } = lookup;
  const isEdit = step.kind === "task.update" || step.kind === "activity.update";
  if (
    (isEdit && step.fields.length === 0) ||
    (step.kind === "task.close" && step.closeOutcome === null)
  ) {
    return null;
  }
  const kind =
    step.kind === "task.update" && step.fields.every((f) => f === "dueDate")
      ? "task.due"
      : step.kind;
  const key: MessageKey = `decisions.${tense}.${kind}`;
  return t(language, key, {
    fields: fieldList(step.fields, language),
    outcome: step.closeOutcome === null ? "" : t(language, `outcome.${step.closeOutcome}`),
    subject: subjectOf(step, lookup),
  });
};

/** Each step in words beside its own summary; a step this client cannot word keeps the summary. */
const linesOf = (
  { inputs, steps }: { readonly steps: Steps; readonly inputs: DecisionInputs },
  tense: "done" | "offered",
  lookup: Lookup,
): readonly string[] => {
  const count = Math.max(steps.length, inputs.summaries.length);
  return Array.from({ length: count }, (_, index) => {
    const step = steps[index] ?? null;
    const text = step === null ? null : stepText(step, tense, lookup);
    return text ?? inputs.summaries[index] ?? "";
  }).filter((line) => line !== "");
};

/** "Parsed by compatible; …": the provider of a row written before it was kept apart. */
const providerOf = (decision: Decision, inputs: DecisionInputs): null | string =>
  inputs.provider ?? /^Parsed by (\S+?);/u.exec(decision.explanation)?.[1] ?? null;

const viaOf = (provider: null | string, language: Language): null | string => {
  const label = providerLabel(provider);
  if (label === null) {
    return null;
  }
  switch (label.kind) {
    case "model": {
      return t(language, "decisions.via.model", { model: label.name });
    }
    case "assistant": {
      return t(language, "decisions.via.assistant");
    }
    case "rules": {
      return t(language, "decisions.via.rules");
    }
  }
};

/** What the person did, as recorded; a value a newer server added reads as not recorded. */
const resolutionOf = (decision: Decision): DecisionResolution | null =>
  (DECISION_RESOLUTIONS as readonly (null | string | undefined)[]).includes(decision.resolution)
    ? (decision.resolution as DecisionResolution)
    : null;

type Parts = Pick<DecisionView, "lines" | "note" | "outcome" | "taskId">;

type Row = {
  readonly decision: Decision;
  readonly inputs: DecisionInputs;
  readonly steps: Steps;
  readonly lookup: Lookup;
};

const wordsOf = (
  { inputs, lookup, steps }: Row,
  tense: "done" | "offered",
  fallback: MessageKey,
) => {
  const lines = linesOf({ inputs, steps }, tense, lookup);
  return lines.length > 0 ? lines : [t(lookup.language, fallback)];
};

/** A reading shown for approval: what the person did, as recorded, or else what the data shows. */
const readingParts = (row: Row): Parts => {
  const { decision, inputs, lookup, steps } = row;
  const stepTasks = known(steps).map((step) => step.taskId);
  const resolution = resolutionOf(decision);
  if (resolution !== null) {
    const isApproved = resolution === "approved";
    return {
      lines: wordsOf(row, isApproved ? "done" : "offered", "decisions.nothing"),
      note: null,
      outcome: t(lookup.language, `decisions.resolved.${resolution}`),
      taskId: existing(isApproved ? [decision.taskId, ...stepTasks] : stepTasks, lookup),
    };
  }
  const seen = seenAfter(known(steps), { at: decision.at, text: inputs.text }, lookup);
  const isEmpty = steps.length === 0 && inputs.summaries.length === 0;
  const outcome =
    seen === null
      ? t(lookup.language, "decisions.outcome.shown")
      : t(lookup.language, seen.key, { subject: seen.subject });
  return {
    lines: wordsOf(row, "offered", "decisions.nothing"),
    note: null,
    outcome: isEmpty ? null : outcome,
    taskId: existing([seen?.taskId ?? null, ...stepTasks], lookup),
  };
};

/** No model answered: the rules offered a reading, which the person may have acted on. */
const unansweredParts = ({ decision, lookup }: Row): Parts => {
  const resolution = resolutionOf(decision);
  const rules = t(lookup.language, "decisions.outcome.rules");
  const answered =
    resolution === null ? null : t(lookup.language, `decisions.resolved.${resolution}`);
  return {
    lines: [t(lookup.language, "decisions.unavailable")],
    note: null,
    outcome: answered === null ? rules : `${rules} · ${answered}`,
    taskId: resolution === "approved" ? existing([decision.taskId], lookup) : null,
  };
};

const parseParts = (row: Row): Parts => {
  const { decision, lookup, steps } = row;
  switch (decision.outcome) {
    case "parsed": {
      return readingParts(row);
    }
    case "applied": {
      return {
        lines: wordsOf(row, "done", "decisions.deferredApplied"),
        note: null,
        outcome: t(lookup.language, "decisions.outcome.applied"),
        taskId: existing([decision.taskId, ...known(steps).map((step) => step.taskId)], lookup),
      };
    }
    case "unavailable": {
      return unansweredParts(row);
    }
    case "inbox": {
      return {
        lines: [t(lookup.language, "decisions.deferredInbox")],
        note: null,
        outcome: t(lookup.language, "decisions.outcome.inbox"),
        taskId: null,
      };
    }
    default: {
      // An outcome a newer server wrote: its own explanation says what happened.
      return { lines: [decision.explanation], note: null, outcome: null, taskId: null };
    }
  }
};

const NOTIFICATIONS: Readonly<Record<string, MessageKey>> = {
  sent: "decisions.notificationSent",
  suppressed: "decisions.notificationHeld",
};

const viewOf = (decision: Decision, lookup: Lookup): DecisionView => {
  const { language } = lookup;
  const base = { at: decision.at, id: decision.id };
  if (decision.kind === "parse") {
    const inputs = readDecisionInputs(decision.inputs);
    return {
      ...base,
      ...parseParts({ decision, inputs, lookup, steps: stepsOf(decision, inputs) }),
      notFound:
        inputs.doubtful.length === 0
          ? null
          : t(language, "decisions.notFound", { fields: fieldList(inputs.doubtful, language) }),
      request: inputs.text,
      via:
        decision.outcome === "unavailable" ? null : viaOf(providerOf(decision, inputs), language),
    };
  }
  const none = { notFound: null, request: null, via: null };
  const notification =
    decision.kind === "notification" && Object.hasOwn(NOTIFICATIONS, decision.outcome)
      ? NOTIFICATIONS[decision.outcome]
      : undefined;
  return notification === undefined
    ? { ...base, ...none, lines: [decision.explanation], note: null, outcome: null, taskId: null }
    : {
        ...base,
        ...none,
        lines: [t(language, notification)],
        note: decision.explanation,
        outcome: null,
        taskId: null,
      };
};

/** The whole log as it shows, the state indexed once for every row. */
export const decisionViews = (
  decisions: readonly Decision[],
  world: World,
): readonly DecisionView[] => {
  const lookup = lookupOf(world);
  return decisions.map((decision) => viewOf(decision, lookup));
};
