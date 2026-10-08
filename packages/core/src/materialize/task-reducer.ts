import type { Event, EventOf, EventType } from "../events/event-schema.ts";
import type { Reducer } from "./materializer.ts";

import { isHttpUrl } from "../links.ts";
import {
  type CloseOutcome,
  type Subtask,
  type Task,
  taskById,
  type TaskFields,
  type TasksState,
} from "../model/task.ts";
import { minutesBetween } from "../time.ts";

/** Events applied to an existing task; `task.created` is the one that needs the state instead. */
type AppliedEventType = Exclude<
  Extract<EventType, "focus.ended" | "focus.started" | `task.${string}`>,
  "task.created"
>;

/** Indexing a mapped type by its own key keeps `type` and `payload` correlated inside `apply`. */
type TaskEvent<K extends AppliedEventType = AppliedEventType> = {
  readonly [P in K]: EventOf<P>;
}[K];

type Handler<T extends AppliedEventType> = (task: Task, event: EventOf<T>) => Task;

type Handlers = { readonly [T in AppliedEventType]: Handler<T> };

type SubtaskInput = EventOf<"task.subtasks.added">["payload"]["subtasks"][number];

type FieldsInput = EventOf<"task.created">["payload"]["fields"];

const legacyLink = (ticket: string | undefined): null | string =>
  ticket !== undefined && isHttpUrl(ticket) ? ticket : null;

const toFields = (fields: FieldsInput): TaskFields => ({
  link: fields.link ?? legacyLink(fields.ticket),
  submitVia: fields.submitVia ?? null,
});

const toSubtask = (item: SubtaskInput): Subtask => ({
  id: item.id,
  label: item.label,
  number: item.number ?? null,
  solvedAt: null,
  submittedAt: null,
});

/** Appends the items whose id is new (the first occurrence wins inside one batch too). */
const appendSubtasks = (
  existing: readonly Subtask[],
  items: readonly SubtaskInput[],
): readonly Subtask[] => {
  const fresh = items.filter(
    (item, index) =>
      existing.every((known) => known.id !== item.id) &&
      items.findIndex((other) => other.id === item.id) === index,
  );
  return fresh.length === 0 ? existing : [...existing, ...fresh.map((item) => toSubtask(item))];
};

const emptyToNull = (
  overrides: Readonly<Record<string, unknown>> | undefined,
): null | Readonly<Record<string, unknown>> =>
  overrides === undefined || Object.keys(overrides).length === 0 ? null : overrides;

type CreatedPayload = EventOf<"task.created">["payload"];

const scheduleOf = (
  payload: CreatedPayload,
): Pick<Task, "dueAt" | "dueTz" | "startAt" | "startTz"> => ({
  dueAt: payload.dueAt ?? null,
  dueTz: payload.dueTz ?? null,
  startAt: payload.startAt ?? null,
  startTz: payload.startTz ?? null,
});

/** An importance given at creation counts as set then (it starts the Prioritized horizon). */
const importanceOf = (
  payload: CreatedPayload,
  occurredAt: string,
): Pick<Task, "importance" | "importanceSetAt"> => ({
  importance: payload.importance ?? null,
  importanceSetAt: payload.importance === undefined ? null : occurredAt,
});

const fromCreated = (event: EventOf<"task.created">): Task => {
  const { payload, occurredAt } = event;
  return {
    id: payload.taskId,
    title: payload.title,
    presetId: payload.presetId,
    projectId: payload.projectId ?? null,
    ...importanceOf(payload, occurredAt),
    ...scheduleOf(payload),
    estimateMinutes: payload.estimateMinutes ?? null,
    subtasks: appendSubtasks([], payload.subtasks),
    slider: null,
    description: payload.description ?? null,
    sourceText: payload.sourceText ?? null,
    sources:
      payload.sourceText === undefined
        ? []
        : [{ text: payload.sourceText, url: null, at: occurredAt }],
    fields: toFields(payload.fields),
    overrides: emptyToNull(payload.overrides),
    status: "not_started",
    statusSince: occurredAt,
    waitingMinutes: 0,
    touched: false,
    rank: null,
    createdAt: occurredAt,
    submittedAt: null,
    closed: null,
    reopenedAt: null,
    lastEventAt: occurredAt,
  };
};

/** Minutes of the waiting spell that started at `statusSince`, never negative. */
const spell = (task: Task, at: string): number => Math.max(0, minutesBetween(task.statusSince, at));

/** Folds the running waiting spell into the total when the task leaves (or is closed while) waiting. */
const endWaiting = (task: Task, at: string): Task =>
  task.status === "waiting"
    ? { ...task, waitingMinutes: task.waitingMinutes + spell(task, at), statusSince: at }
    : task;

/**
Work implies "in progress", but only from "not started": an explicit paused or waiting
status set by the user is never overridden by an implicit one.
*/
const touched = (task: Task, at: string): Task => {
  if (task.status === "not_started") {
    return { ...task, status: "in_progress", statusSince: at, touched: true };
  }
  return task.touched ? task : { ...task, touched: true };
};

/** The first closure stays until a reopen; an open waiting spell ends here. */
const close = (
  task: Task,
  event: TaskEvent<"task.closed" | "task.submitted">,
  closure: {
    readonly outcome: CloseOutcome;
    readonly reason: null | string;
    readonly confirmed: boolean;
  },
): Task =>
  task.closed === null
    ? {
        ...endWaiting(task, event.occurredAt),
        closed: { ...closure, at: event.occurredAt, source: event.source, eventId: event.id },
      }
    : task;

const statusSet: Handler<"task.status.set"> = (task, event) => {
  const { status } = event.payload;
  if (status === task.status) {
    return task;
  }
  return {
    ...endWaiting(task, event.occurredAt),
    status,
    statusSince: event.occurredAt,
    touched: task.touched || status === "in_progress",
  };
};

/** A solve is recorded once; a revoked solve disappears through re-materialization. */
const subtaskSolved: Handler<"task.subtask.solved"> = (task, event) => {
  const { subtaskId } = event.payload;
  const target = task.subtasks.find((item) => item.id === subtaskId);
  if (target?.solvedAt !== null) {
    return task;
  }
  const subtasks = task.subtasks.map((item) =>
    item.id === subtaskId ? { ...item, solvedAt: event.occurredAt } : item,
  );
  return touched({ ...task, subtasks }, event.occurredAt);
};

/** Only solved, not yet submitted subtasks among `ids` get the submission time. */
const submitSubtasks = (task: Task, ids: readonly string[], at: string): Task => {
  const isDue = (item: Subtask): boolean =>
    ids.includes(item.id) && item.solvedAt !== null && item.submittedAt === null;
  if (task.subtasks.every((item) => !isDue(item))) {
    return task;
  }
  const subtasks = task.subtasks.map((item) => (isDue(item) ? { ...item, submittedAt: at } : item));
  return { ...task, subtasks };
};

const submitted: Handler<"task.submitted"> = (task, event) => {
  const { subtaskIds, closes } = event.payload;
  const whole = task.submittedAt === null ? { ...task, submittedAt: event.occurredAt } : task;
  const marked =
    subtaskIds === undefined ? whole : submitSubtasks(task, subtaskIds, event.occurredAt);
  return closes === true
    ? close(marked, event, { outcome: "done", reason: null, confirmed: false })
    : marked;
};

const PATCHED_KEYS = ["title", "description", "dueAt", "dueTz", "startAt", "startTz"] as const;

const isSamePatch = (a: Task, b: Task): boolean =>
  PATCHED_KEYS.every((key) => a[key] === b[key]) &&
  a.fields.link === b.fields.link &&
  a.fields.submitVia === b.fields.submitVia;

/** `description: null` clears; `fields` replaces both fields when present. */
const updated: Handler<"task.updated"> = (task, event) => {
  const { payload } = event;
  const next: Task = {
    ...task,
    title: payload.title ?? task.title,
    description: payload.description === undefined ? task.description : payload.description,
    dueAt: payload.dueAt ?? task.dueAt,
    dueTz: payload.dueTz ?? task.dueTz,
    startAt: payload.startAt ?? task.startAt,
    startTz: payload.startTz ?? task.startTz,
    fields: payload.fields === undefined ? task.fields : toFields(payload.fields),
  };
  return isSamePatch(next, task) ? task : next;
};

const overridesSet: Handler<"task.overrides.set"> = (task, event) => {
  const overrides = emptyToNull(event.payload.overrides);
  return overrides === null && task.overrides === null ? task : { ...task, overrides };
};

const subtasksAdded: Handler<"task.subtasks.added"> = (task, event) => {
  const subtasks = appendSubtasks(task.subtasks, event.payload.subtasks);
  return subtasks === task.subtasks ? task : { ...task, subtasks };
};

const HANDLERS: Handlers = {
  "task.updated": updated,
  "task.preset.set": (task, event) =>
    event.payload.presetId === task.presetId ? task : { ...task, presetId: event.payload.presetId },
  "task.overrides.set": overridesSet,
  "task.status.set": statusSet,
  "task.subtask.solved": subtaskSolved,
  "task.subtasks.added": subtasksAdded,
  "task.submitted": submitted,
  "task.closed": (task, event) =>
    close(task, event, {
      outcome: event.payload.outcome,
      reason: event.payload.reason ?? null,
      confirmed: event.payload.confirmed ?? false,
    }),
  "task.reopened": (task, event) =>
    task.closed === null
      ? task
      : { ...task, closed: null, reopenedAt: event.occurredAt, statusSince: event.occurredAt },
  // Re-setting the same importance still restarts the Prioritized horizon.
  "task.importance.set": (task, event) => ({
    ...task,
    importance: event.payload.importance,
    importanceSetAt: event.occurredAt,
  }),
  "task.project.set": (task, event) =>
    event.payload.projectId === task.projectId
      ? task
      : { ...task, projectId: event.payload.projectId },
  "task.progress.set": (task, event) =>
    touched(
      event.payload.progress === task.slider ? task : { ...task, slider: event.payload.progress },
      event.occurredAt,
    ),
  "task.estimate.set": (task, event) =>
    event.payload.estimateMinutes === task.estimateMinutes
      ? task
      : { ...task, estimateMinutes: event.payload.estimateMinutes },
  "task.rank.set": (task, event) =>
    event.payload.rank === task.rank ? task : { ...task, rank: event.payload.rank },
  "task.source.attached": (task, event) => ({
    ...task,
    sourceText: task.sourceText ?? event.payload.sourceText,
    sources: [
      ...task.sources,
      {
        text: event.payload.sourceText,
        url: event.payload.sourceUrl ?? null,
        at: event.occurredAt,
      },
    ],
  }),
  "focus.started": (task, event) => touched(task, event.occurredAt),
  // Ending a focus changes no field, yet it is activity on the task, so `lastEventAt` moves.
  "focus.ended": (task) => ({ ...task }),
};

const isTaskEvent = (event: Event): event is TaskEvent => Object.hasOwn(HANDLERS, event.type);

const applyTaskEvent = <K extends AppliedEventType>(task: Task, event: TaskEvent<K>): Task =>
  HANDLERS[event.type](task, event);

const put = (state: TasksState, task: Task): TasksState => ({
  byId: { ...state.byId, [task.id]: task },
});

/** Deterministic instance ids make a repeated creation a no-op. */
const created = (state: TasksState, event: EventOf<"task.created">): TasksState =>
  taskById(state, event.payload.taskId) === undefined ? put(state, fromCreated(event)) : state;

/** Time started on a task is work on it: the task moves to in progress. */
const focused = (state: TasksState, event: EventOf<"activity.started">): TasksState => {
  const { taskId } = event.payload;
  const task = taskId === undefined ? undefined : taskById(state, taskId);
  return task === undefined
    ? state
    : put(state, { ...touched(task, event.occurredAt), lastEventAt: event.occurredAt });
};

/**
Folds every task event plus `focus.started` / `focus.ended`. Dumb by design: it records
what happened and never validates (`validation/retro-rules.ts` does that on input) nor
re-interprets outcomes (`outcomes/outcome.ts` derives them). Untouched state keeps its
reference.
*/
export const taskReducer: Reducer<TasksState> = (state, event) => {
  if (event.type === "task.created") {
    return created(state, event);
  }
  if (event.type === "activity.started") {
    return focused(state, event);
  }
  if (!isTaskEvent(event)) {
    return state;
  }
  const task = taskById(state, event.payload.taskId);
  if (task === undefined) {
    return state;
  }
  const next = applyTaskEvent(task, event);
  return next === task ? state : put(state, { ...next, lastEventAt: event.occurredAt });
};
