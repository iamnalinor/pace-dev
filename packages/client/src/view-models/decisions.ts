import {
  type Action,
  ACTION_KINDS,
  type ActionKind,
  type Decision,
  DECISION_RESOLUTIONS,
  type DecisionInputs,
  type DecisionResolution,
  type DecisionStep,
  decisionStepOf,
  type Language,
  type MessageKey,
  type ParseField,
  readDecisionInputs,
  shownLabel,
  t,
  taskById,
} from "@pace/core";

import { existing, type Lookup, lookupOf, seenAfter, type World } from "./decision-lookup.ts";
import { providerLabel } from "./decision-provider.ts";
import { systemRow } from "./decision-system.ts";
import { conversationOf, quoted } from "./decision-text.ts";
import { isFolded } from "./decision-threads.ts";

/** One row of the assistant log: what became of a message, in the reader's language. */
export type DecisionView = {
  readonly id: string;
  readonly at: string;
  /** What was done (or offered), one line per action; the first is the row's title. */
  readonly lines: readonly string[];
  /** What the person typed, verbatim: the conversation's request. */
  readonly request: null | string;
  /** Every answer or correction after the request, in order: "You answered “When?”: Today". */
  readonly followups: readonly string[];
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
/** Done (applied), offered (answered or expired), pending (a card still open: QA round 17 L16). */
type Tense = "done" | "offered" | "pending";

const stepText = (
  step: DecisionStep,
  {
    lookup,
    summary,
    tense,
  }: {
    readonly lookup: Lookup;
    readonly summary: string | undefined;
    readonly tense: Tense;
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

/**
What an approval did, one line per action in the log's past tense ("Created task “X”"), for the
toast after Approve that said only "Done" (QA round 11 L3); a step this client cannot word keeps
its summary.
*/
export const doneLines = (actions: readonly Action[], world: World): readonly string[] => {
  const lookup = lookupOf(world);
  return actions.map(
    (action) =>
      stepText(decisionStepOf(action), { lookup, summary: action.summary, tense: "done" }) ??
      action.summary,
  );
};

/** Each step in words beside its own summary; a step this client cannot word keeps the summary. */
const linesOf = (
  { inputs, steps }: { readonly steps: Steps; readonly inputs: DecisionInputs },
  tense: Tense,
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
      // An older row named no model: nothing worth a line.
      return null;
    }
    case "rules": {
      return t(language, "decisions.via.rules");
    }
  }
};

/** A card stays open for a while; after that, a reading nobody answered was closed or replaced. */
const OPEN_FOR_MS = 15 * 60_000;

const isStillOpen = (at: string, now: string): boolean =>
  Date.parse(now) - Date.parse(at) < OPEN_FOR_MS;

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

const wordsOf = ({ inputs, lookup, steps }: Row, tense: Tense, fallback: MessageKey) => {
  const lines = linesOf({ inputs, steps }, tense, lookup);
  return lines.length > 0 ? lines : [t(lookup.language, fallback)];
};

/** A reading the person answered: what they did, as recorded. */
const answeredParts = (row: Row, resolution: DecisionResolution): Parts => {
  const { decision, lookup, steps } = row;
  const stepTasks = known(steps).map((step) => step.taskId);
  const isApproved = resolution === "approved";
  return {
    lines: wordsOf(row, isApproved ? "done" : "offered", "decisions.nothing"),
    note: null,
    outcome: t(lookup.language, `decisions.resolved.${resolution}`),
    taskId: existing(isApproved ? [decision.taskId, ...stepTasks] : stepTasks, lookup),
  };
};

/** What became of a reading nobody answered: what the data shows, else waiting or no answer. */
const WAITING = { false: "decisions.outcome.unanswered", true: "decisions.outcome.shown" } as const;
const outcomeOf = (seen: ReturnType<typeof seenAfter>, isWaiting: boolean, lookup: Lookup) =>
  seen === null
    ? t(lookup.language, WAITING[`${isWaiting}`])
    : t(lookup.language, seen.key, { subject: seen.subject });

/** A reading shown for approval: what the person did, as recorded, or else what the data shows. */
const readingParts = (row: Row): Parts => {
  const { decision, inputs, lookup, steps } = row;
  const resolution = resolutionOf(decision);
  if (resolution !== null) {
    return answeredParts(row, resolution);
  }
  const stepTasks = known(steps).map((step) => step.taskId);
  const reading = { at: decision.at, text: inputs.request ?? inputs.text };
  const seen = seenAfter(known(steps), reading, { claimed: row.claimed, lookup });
  const isEmpty = steps.length === 0 && inputs.summaries.length === 0;
  const isWaiting = seen === null && isStillOpen(decision.at, lookup.now);
  return {
    lines: wordsOf(row, isWaiting ? "pending" : "offered", "decisions.nothing"),
    note: null,
    outcome: isEmpty ? null : outcomeOf(seen, isWaiting, lookup),
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
  const none = { followups: [], notFound: null, request: null, via: null };
  return { ...base, ...none, ...systemRow(decision, language), outcome: null, taskId: null };
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
  const shown = decisions.filter(
    (decision, index) =>
      decision.resolution !== "corrected" && !isFolded(decision, decisions.slice(0, index)),
  );
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
