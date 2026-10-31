import {
  type ActionKind,
  type Activity,
  type CoreState,
  type DecisionStep,
  type Language,
  type MessageKey,
  type Task,
  taskById,
} from "@pace/core";

/*
What the assistant log can see in the person's data after a reading it was not told about (an
older row, or an answer lost offline): a task of that name made soon after, a close, an activity
started. Said as a fact, never as an approval. The state is indexed once for the whole log.
*/

export type World = {
  readonly state: Pick<CoreState, "tasks" | "time">;
  readonly language: Language;
  /** When the log is read: a card shown a while ago is no longer open. */
  readonly now: string;
};

/** The state indexed once for a whole log: tasks by source text and by title, activities by label. */
export type Lookup = {
  readonly state: World["state"];
  readonly language: Language;
  readonly now: string;
  readonly bySource: ReadonlyMap<string, readonly Task[]>;
  readonly byTitle: ReadonlyMap<string, readonly Task[]>;
  readonly byLabel: ReadonlyMap<string, readonly Activity[]>;
};

/** The items by a key; an item without one is left out. */
const groupBy = <T>(
  items: readonly T[],
  keyOf: (item: T) => null | string,
): ReadonlyMap<string, readonly T[]> => {
  const keyed = items.filter((item) => keyOf(item) !== null);
  return Map.groupBy(keyed, (item) => keyOf(item) ?? "");
};

export const lookupOf = ({ language, now, state }: World): Lookup => {
  const tasks = Object.values(state.tasks.byId);
  return {
    byLabel: groupBy(Object.values(state.time.activities), (activity) => activity.label),
    bySource: groupBy(tasks, (task) => task.sourceText),
    byTitle: groupBy(tasks, (task) => task.title),
    language,
    now,
    state,
  };
};

const MINUTE = 60_000;
/** Server and device clocks differ a little: a write may read as slightly before the reading. */
const SKEW = 2 * MINUTE;
/** What came within this long of the reading may be its result; later is something else. */
const AFTER_WINDOW = 24 * 60 * MINUTE;
/** A started activity begins within this long of the start the reading asked for. */
const START_WINDOW = 60 * MINUTE;

const ms = (iso: string): number => Date.parse(iso);

const isWithin = (iso: string, from: string, span: number): boolean =>
  ms(iso) >= ms(from) - SKEW && ms(iso) <= ms(from) + span;

export type Reading = { readonly at: string; readonly text: null | string };

/** A task like the one a create proposed, made soon after: from this message or with this title. */
const createdTask = (step: DecisionStep, { at, text }: Reading, lookup: Lookup): null | Task =>
  [
    ...(text === null ? [] : (lookup.bySource.get(text) ?? [])),
    ...(step.subject === null ? [] : (lookup.byTitle.get(step.subject) ?? [])),
  ].find((task) => isWithin(task.createdAt, at, AFTER_WINDOW)) ?? null;

/** What the data shows after an unrecorded reading: a fact to state, never an approval. */
export type Seen = {
  readonly key: MessageKey;
  readonly subject: string;
  readonly taskId: null | string;
};

type Look = (step: DecisionStep, reading: Reading, lookup: Lookup) => null | Seen;

/** Edits, deletes and subtask changes leave nothing to tell by. */
const nothingSeen: Look = () => null;

const closedSince: Look = (step, { at }, { state }) => {
  const task = step.taskId === null ? undefined : taskById(state.tasks, step.taskId);
  const closure = task?.closed ?? undefined;
  // Done after the due date reads as "done_late": still the close that was proposed.
  return task !== undefined &&
    closure !== undefined &&
    step.closeOutcome !== null &&
    closure.outcome.startsWith(step.closeOutcome) &&
    isWithin(closure.at, at, AFTER_WINDOW)
    ? { key: "decisions.seen.task.close", subject: task.title, taskId: task.id }
    : null;
};

const startedSince: Look = (step, { at }, lookup) => {
  const span = step.startAt === null ? START_WINDOW : SKEW;
  const isStarted = (lookup.byLabel.get(step.subject ?? "") ?? []).some((activity) =>
    isWithin(activity.startAt, step.startAt ?? at, span),
  );
  return isStarted && step.subject !== null
    ? {
        key:
          step.kind === "activity.log"
            ? "decisions.seen.activity.log"
            : "decisions.seen.activity.start",
        subject: step.subject,
        taskId: null,
      }
    : null;
};

const LOOKS: Readonly<Record<ActionKind, Look>> = {
  "activity.delete": nothingSeen,
  "activity.log": startedSince,
  "activity.start": startedSince,
  "activity.update": nothingSeen,
  "task.addSubtasks": nothingSeen,
  "task.close": closedSince,
  "task.create": (step, reading, lookup) => {
    const task = createdTask(step, reading, lookup);
    return task === null
      ? null
      : { key: "decisions.seen.task.create", subject: task.title, taskId: task.id };
  },
  "task.delete": nothingSeen,
  "task.markSubtasks": nothingSeen,
  "task.update": nothingSeen,
};

/**
The first thing the data shows after an unrecorded reading, over its steps; a task a newer row
already accounts for (`claimed`) is not this reading's too.
*/
export const seenAfter = (
  steps: readonly DecisionStep[],
  reading: Reading,
  { claimed, lookup }: { readonly lookup: Lookup; readonly claimed: ReadonlySet<string> },
): null | Seen =>
  steps
    .map((step) => LOOKS[step.kind](step, reading, lookup))
    .find((found) => found !== null && (found.taskId === null || !claimed.has(found.taskId))) ??
  null;

/** The first of `ids` that is still a task. */
export const existing = (ids: readonly (null | string)[], { state }: Lookup): null | string =>
  ids.find((id): id is string => id !== null && taskById(state.tasks, id) !== undefined) ?? null;
