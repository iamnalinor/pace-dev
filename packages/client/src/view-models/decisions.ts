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
import { conversationOf, quoted } from "./decision-text.ts";

/** One row of the assistant log: what became of a message, in the reader's language. */
export type DecisionView = {
  readonly id: string;
  readonly at: string;
  /** What was done (or offered), one line per action; the first is the row's title. */
  readonly lines: readonly string[];
  /** What the person typed, verbatim: the conversation's request. */
  readonly request: null | string;
  /** The answer or correction this reading answered, in words: "You answered “When?”: Today". */
  readonly followup: null | string;
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
          renamedTo: null,
          startAt: null,
          subject,
          taskId: null,
        },
      ]
    : [];
};

const known = (steps: Steps): readonly DecisionStep[] =>
  steps.filter((step): step is DecisionStep => step !== null);

/** What a step is about as it was named when read (its summary quotes it), else as it is now. */
const subjectOf = (step: DecisionStep, { state }: Lookup, summary = ""): string =>
  step.subject ??
  quoted(summary) ??
  (step.taskId === null ? undefined : taskById(state.tasks, step.taskId)?.title) ??
  (step.activityId === null ? undefined : state.time.activities[step.activityId]?.label) ??
  "…";

const fieldList = (fields: readonly ParseField[], language: Language): string =>
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

/**
A step in words; `null` when the step lacks what its sentence names (an older row's edit
without its fields, a close without its outcome), so the stored summary is shown instead.
*/
const stepText = (
  step: DecisionStep,
  {
    lookup,
    summary,
    tense,
  }: {
    readonly lookup: Lookup;
    readonly summary: string | undefined;
    readonly tense: "done" | "offered";
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
    subject: subjectOf(step, lookup, summary),
    to: step.renamedTo ?? "",
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
    const summary = inputs.summaries[index];
    const text = step === null ? null : stepText(step, { lookup, summary, tense });
    return text ?? summary ?? "";
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
  /** Tasks newer rows already account for. */
  readonly claimed: ReadonlySet<string>;
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
  const reading = { at: decision.at, text: inputs.request ?? inputs.text };
  const seen = seenAfter(known(steps), reading, { claimed: row.claimed, lookup });
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

const viewOf = (
  decision: Decision,
  { claimed, lookup }: { readonly lookup: Lookup; readonly claimed: ReadonlySet<string> },
): DecisionView => {
  const { language } = lookup;
  const base = { at: decision.at, id: decision.id };
  if (decision.kind === "parse") {
    const inputs = readDecisionInputs(decision.inputs);
    return {
      ...base,
      ...parseParts({ claimed, decision, inputs, lookup, steps: stepsOf(decision, inputs) }),
      ...conversationOf(inputs, language),
      notFound:
        inputs.doubtful.length === 0
          ? null
          : t(language, "decisions.notFound", { fields: fieldList(inputs.doubtful, language) }),
      via:
        decision.outcome === "unavailable" ? null : viaOf(providerOf(decision, inputs), language),
    };
  }
  const none = { followup: null, notFound: null, request: null, via: null };
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

/**
The whole log as it shows, newest first, the state indexed once for every row. A reading the
person corrected is folded into the conversation's last row, which tells its outcome; a task is
accounted for by the newest row that sees it.
*/
export const decisionViews = (
  decisions: readonly Decision[],
  world: World,
): readonly DecisionView[] => {
  const lookup = lookupOf(world);
  const shown = decisions.filter((decision) => decision.resolution !== "corrected");
  const none: ReadonlySet<string> = new Set();
  const first = shown.map((decision) => viewOf(decision, { claimed: none, lookup }));
  return first.map((view, index) => {
    const claimed = new Set(first.slice(0, index).map((newer) => newer.taskId));
    const decision = shown[index];
    // A task a newer row already opens is not this row's too: worded again without it.
    return decision === undefined || view.taskId === null || !claimed.has(view.taskId)
      ? view
      : viewOf(decision, {
          claimed: new Set([...claimed].filter((id): id is string => id !== null)),
          lookup,
        });
  });
};
