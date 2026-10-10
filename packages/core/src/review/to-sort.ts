import type { EventInput } from "../events/event-schema.ts";
import type { CoreState } from "../materialize/core-state.ts";
import type { ResolvedPreset } from "../model/preset.ts";
import type { QueryContext } from "../queries/context.ts";

import { isOpen, progressOf, type Task } from "../model/task.ts";
import { isActiveTask, isInboxTask, presetOf } from "../queries/classify.ts";
import { UNSORTED_TOO_LONG_MINUTES } from "../queries/inbox.ts";
import { suggestFor, type Suggestion } from "../queries/suggest.ts";
import { minutesBetween } from "../time.ts";

/**
The "to sort" block of stage 1: what the user forgot to tell the system, each with the
events that would settle it. The keys are translated by the UI; the events are plain
inputs for the client's dispatch, which stamps its own source and device.
*/
export type ReviewKind =
  | "confirm-auto-outcome"
  | "deadline-passed"
  | "submitted"
  | "unsorted-too-long";

export type ReviewActionKey =
  | "cancel"
  | "confirm"
  | "keep-open"
  | "mark-done"
  | "skip"
  | "sort"
  | "submit-now"
  | "undo";

export type ReviewAction = {
  readonly key: ReviewActionKey;
  readonly events: readonly EventInput[];
};

export type ReviewItem = {
  readonly kind: ReviewKind;
  readonly taskId: string;
  /** When the condition started: the last solve, the due date, the capture, the automatic closure. */
  readonly since: string;
  readonly actions: readonly ReviewAction[];
};

/** A task fully solved but still open this long after the last solve is probably submitted. */
const SUBMITTED_AFTER_MINUTES = 24 * 60;

/** Distributive over the event union, so `type` and `payload` stay correlated in the spread. */
type Payload<I = EventInput> = I extends { readonly type: unknown; readonly payload: unknown }
  ? Pick<I, "payload" | "type">
  : never;

/** A suggested event happens now, from the app: the dispatcher replaces the envelope. */
const suggested = (now: string, body: Payload): EventInput => ({
  ...body,
  occurredAt: now,
  precision: "exact",
  source: "app",
});

const closeAs = (task: Task, now: string, outcome: "cancelled" | "done" | "skipped"): EventInput =>
  suggested(now, { type: "task.closed", payload: { taskId: task.id, outcome } });

const KEEP_OPEN: ReviewAction = { key: "keep-open", events: [] };

/** The last solve for per-problem progress, else the last activity (the slider has no own instant). */
const byInstant = (a: string, b: string): number => Date.parse(a) - Date.parse(b);

const fullSince = (task: Task, preset: ResolvedPreset): string => {
  const solves = task.subtasks
    .map((item) => item.solvedAt)
    .filter((solvedAt): solvedAt is string => solvedAt !== null);
  const isBySubtasks = preset.progressMode === "subtasks" && solves.length > 0;
  return isBySubtasks ? (solves.toSorted(byInstant).at(-1) ?? task.lastEventAt) : task.lastEventAt;
};

/** Sending the solved problems closes the task when they are the last ones; otherwise close it as done. */
const finishAction = (task: Task, preset: ResolvedPreset, now: string): ReviewAction => {
  const pending = task.subtasks
    .filter((item) => item.solvedAt !== null && item.submittedAt === null)
    .map((item) => item.id);
  if (preset.submission === "per_subtask" && pending.length > 0) {
    return {
      key: "submit-now",
      events: [
        suggested(now, {
          type: "task.submitted",
          payload: { taskId: task.id, subtaskIds: pending, closes: true },
        }),
      ],
    };
  }
  return { key: "mark-done", events: [closeAs(task, now, "done")] };
};

/** Every problem solved (or the slider at the end) and the task still open a day later. */
const submittedItem = (task: Task, preset: ResolvedPreset, now: string): ReviewItem | undefined => {
  if (progressOf(task, preset.progressMode) < 1) {
    return undefined;
  }
  const since = fullSince(task, preset);
  return minutesBetween(since, now) >= SUBMITTED_AFTER_MINUTES
    ? {
        kind: "submitted",
        taskId: task.id,
        since,
        actions: [finishAction(task, preset, now), KEEP_OPEN],
      }
    : undefined;
};

/** The due date passed and nothing happened to the task since: what became of it? */
const deadlinePassedItem = (task: Task, now: string): ReviewItem | undefined => {
  const { dueAt } = task;
  if (dueAt === null || minutesBetween(dueAt, now) <= 0 || task.lastEventAt > dueAt) {
    return undefined;
  }
  return {
    kind: "deadline-passed",
    taskId: task.id,
    since: dueAt,
    actions: [
      { key: "mark-done", events: [closeAs(task, now, "done")] },
      { key: "cancel", events: [closeAs(task, now, "cancelled")] },
      { key: "skip", events: [closeAs(task, now, "skipped")] },
      KEEP_OPEN,
    ],
  };
};

const sortEvents = (task: Task, suggestion: Suggestion, now: string): readonly EventInput[] => [
  suggested(now, {
    type: "task.preset.set",
    payload: { taskId: task.id, presetId: suggestion.presetId },
  }),
  ...(suggestion.projectId === null
    ? []
    : [
        suggested(now, {
          type: "task.project.set",
          payload: { taskId: task.id, projectId: suggestion.projectId },
        }),
      ]),
  suggested(now, {
    type: "task.importance.set",
    payload: { taskId: task.id, importance: suggestion.importance },
  }),
  ...(suggestion.dueAt === null || suggestion.dueTz === null
    ? []
    : [
        suggested(now, {
          type: "task.updated",
          payload: { taskId: task.id, dueAt: suggestion.dueAt, dueTz: suggestion.dueTz },
        }),
      ]),
];

/** An inbox item nobody sorted for days: accept the suggestion, or drop it. */
const unsortedItem = (state: CoreState, task: Task, ctx: QueryContext): ReviewItem | undefined =>
  minutesBetween(task.createdAt, ctx.now) > UNSORTED_TOO_LONG_MINUTES
    ? {
        kind: "unsorted-too-long",
        taskId: task.id,
        since: task.createdAt,
        actions: [
          {
            key: "sort",
            events: sortEvents(
              task,
              suggestFor(state, task.sourceText ?? task.title, ctx),
              ctx.now,
            ),
          },
          { key: "cancel", events: [closeAs(task, ctx.now, "cancelled")] },
        ],
      }
    : undefined;

/** A system-made outcome stands until the user confirms it (amend) or undoes it (revoke). */
const confirmItem = (task: Task, now: string): ReviewItem | undefined => {
  const { closed } = task;
  if (closed?.source !== "system" || closed.confirmed) {
    return undefined;
  }
  return {
    kind: "confirm-auto-outcome",
    taskId: task.id,
    since: closed.at,
    actions: [
      {
        key: "confirm",
        events: [
          suggested(now, {
            type: "event.amended",
            payload: { targetId: closed.eventId, patch: { confirmed: true } },
          }),
        ],
      },
      {
        key: "undo",
        events: [suggested(now, { type: "event.revoked", payload: { targetId: closed.eventId } })],
      },
    ],
  };
};

/** At most one item per task: the open-task rules in order, the inbox rule for inbox items. */
const itemFor = (state: CoreState, task: Task, ctx: QueryContext): ReviewItem | undefined => {
  if (!isOpen(task)) {
    return confirmItem(task, ctx.now);
  }
  if (isInboxTask(task)) {
    return unsortedItem(state, task, ctx);
  }
  const preset = presetOf(state, task);
  return !preset.ok || !isActiveTask(task)
    ? undefined
    : (submittedItem(task, preset.value, ctx.now) ?? deadlinePassedItem(task, ctx.now));
};

const oldestFirst = (a: ReviewItem, b: ReviewItem): number => {
  if (a.since !== b.since) {
    return a.since < b.since ? -1 : 1;
  }
  return a.taskId < b.taskId ? -1 : 1;
};

export const reviewItems = (state: CoreState, ctx: QueryContext): readonly ReviewItem[] =>
  Object.values(state.tasks.byId)
    .flatMap((task) => {
      const item = itemFor(state, task, ctx);
      return item === undefined ? [] : [item];
    })
    .toSorted(oldestFirst);
