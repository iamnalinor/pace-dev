import {
  ACTION_KINDS,
  type ActionKind,
  type CoreState,
  type Decision,
  type DecisionInputs,
  type DecisionStep,
  type Language,
  type MessageKey,
  type ParseField,
  readDecisionInputs,
  t,
  taskById,
} from "@pace/core";

import { providerLabel } from "./decision-provider.ts";

/** One row of the assistant log: what became of a message, in the reader's language. */
export type DecisionView = {
  readonly id: string;
  readonly at: string;
  /** What was done (or offered), one line per action; the first is the row's title. */
  readonly lines: readonly string[];
  /** What the person typed, verbatim. */
  readonly request: null | string;
  /** Approved, shown for approval, read by the rules, read later. */
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

type World = { readonly state: CoreState; readonly language: Language };

const MINUTE = 60_000;
/** Server and device clocks differ a little: an approval may read as slightly before the reading. */
const SKEW = 2 * MINUTE;
/** An approval comes within this long of the reading; a later task of that name is another one. */
const APPROVAL_WINDOW = 24 * 60 * MINUTE;
/** A started activity begins within this long of the start the reading asked for. */
const START_WINDOW = 60 * MINUTE;

const ms = (iso: string): number => Date.parse(iso);

const isWithin = (iso: string, from: string, span: number): boolean =>
  ms(iso) >= ms(from) - SKEW && ms(iso) <= ms(from) + span;

/** The task an approved create wrote: made soon after, from this message or with this title. */
const createdTask = (step: DecisionStep, { at, text }: Reading, state: CoreState): null | string =>
  Object.values(state.tasks.byId).find(
    (task) =>
      isWithin(task.createdAt, at, APPROVAL_WINDOW) &&
      ((text !== null && task.sourceText === text) || task.title === step.subject),
  )?.id ?? null;

type Reading = { readonly at: string; readonly text: null | string };

type Check = (step: DecisionStep, reading: Reading, state: CoreState) => boolean;

/** Edits, deletes and subtask changes leave nothing to tell an approval by. */
const wasUnseen: Check = () => false;

const wasClosed: Check = (step, { at }, state) => {
  const closure =
    step.taskId === null ? undefined : (taskById(state.tasks, step.taskId)?.closed ?? undefined);
  // Done after the due date reads as "done_late": still the close that was asked for.
  return (
    closure !== undefined &&
    step.closeOutcome !== null &&
    closure.outcome.startsWith(step.closeOutcome) &&
    isWithin(closure.at, at, APPROVAL_WINDOW)
  );
};

const wasStarted: Check = (step, { at }, state) => {
  const span = step.startAt === null ? START_WINDOW : SKEW;
  return Object.values(state.time.activities).some(
    (activity) =>
      activity.label === step.subject && isWithin(activity.startAt, step.startAt ?? at, span),
  );
};

/** Whether the state shows the step done: the task, activity or close it would have written. */
const APPLIED: Readonly<Record<ActionKind, Check>> = {
  "activity.delete": wasUnseen,
  "activity.log": wasStarted,
  "activity.start": wasStarted,
  "activity.update": wasUnseen,
  "task.addSubtasks": wasUnseen,
  "task.close": wasClosed,
  "task.create": (step, reading, state) => createdTask(step, reading, state) !== null,
  "task.delete": wasUnseen,
  "task.markSubtasks": wasUnseen,
  "task.update": wasUnseen,
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

/**
The steps of a row: kept since the log stores them; for an older row, the first from the
decision's rule ("parse.activity.start") with the name its summary quotes.
*/
const stepsOf = (decision: Decision, inputs: DecisionInputs): readonly DecisionStep[] => {
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

const subjectOf = (step: DecisionStep, { state }: World): string =>
  step.subject ??
  (step.taskId === null ? undefined : taskById(state.tasks, step.taskId)?.title) ??
  (step.activityId === null ? undefined : state.time.activities[step.activityId]?.label) ??
  "…";

const fieldList = (fields: readonly ParseField[], language: Language): string =>
  [...new Set(fields)].map((field) => t(language, `parseField.${field}`)).join(", ");

const stepText = (step: DecisionStep, tense: "done" | "offered", world: World): null | string => {
  const { language } = world;
  const subject = subjectOf(step, world);
  const isEdit = step.kind === "task.update" || step.kind === "activity.update";
  if (isEdit && step.fields.length === 0) {
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
    subject,
  });
};

/** Each step in words; a step this client cannot word (an older row's) keeps its summary. */
const linesOf = (
  { inputs, steps }: { readonly steps: readonly DecisionStep[]; readonly inputs: DecisionInputs },
  tense: "done" | "offered",
  world: World,
): readonly string[] => {
  const count = Math.max(steps.length, inputs.summaries.length);
  return Array.from({ length: count }, (_, index) => {
    const step = steps[index];
    const text = step === undefined ? null : stepText(step, tense, world);
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

/** The task the row opens, if it is still there: the one created, else the one acted on. */
const taskOf = (
  decision: Decision,
  steps: readonly DecisionStep[],
  { text, world }: { readonly text: null | string; readonly world: World },
): null | string => {
  const { state } = world;
  const created = steps
    .filter((step) => step.kind === "task.create")
    .map((step) => createdTask(step, { at: decision.at, text }, state))
    .find((id) => id !== null);
  const candidates = [created, decision.taskId, ...steps.map((step) => step.taskId)];
  return (
    candidates.find(
      (id): id is string =>
        id !== null && id !== undefined && taskById(state.tasks, id) !== undefined,
    ) ?? null
  );
};

type Parts = Pick<DecisionView, "lines" | "note" | "outcome" | "taskId">;

const parseParts = (decision: Decision, inputs: DecisionInputs, world: World): Parts => {
  const { language } = world;
  const steps = stepsOf(decision, inputs);
  const words = (tense: "done" | "offered", fallback: MessageKey): readonly string[] => {
    const lines = linesOf({ inputs, steps }, tense, world);
    return lines.length > 0 ? lines : [t(language, fallback)];
  };
  const taskId = taskOf(decision, steps, { text: inputs.text, world });
  switch (decision.outcome) {
    case "parsed": {
      const reading = { at: decision.at, text: inputs.text };
      const isApproved = steps.some((step) => APPLIED[step.kind](step, reading, world.state));
      const isEmpty = steps.length === 0 && inputs.summaries.length === 0;
      const outcome = isApproved ? "decisions.outcome.approved" : "decisions.outcome.shown";
      return {
        lines: words(isApproved ? "done" : "offered", "decisions.nothing"),
        note: null,
        outcome: isEmpty ? null : t(language, outcome),
        taskId,
      };
    }
    case "applied": {
      return {
        lines: words("done", "decisions.deferredApplied"),
        note: null,
        outcome: t(language, "decisions.outcome.applied"),
        taskId,
      };
    }
    case "unavailable": {
      return {
        lines: [t(language, "decisions.unavailable")],
        note: null,
        outcome: t(language, "decisions.outcome.rules"),
        taskId: null,
      };
    }
    case "inbox": {
      return {
        lines: [t(language, "decisions.deferredInbox")],
        note: null,
        outcome: t(language, "decisions.outcome.inbox"),
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

/** A decision as the assistant log shows it. */
export const decisionView = (decision: Decision, world: World): DecisionView => {
  const { language } = world;
  const base = { at: decision.at, id: decision.id };
  if (decision.kind === "parse") {
    const inputs = readDecisionInputs(decision.inputs);
    return {
      ...base,
      ...parseParts(decision, inputs, world),
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
