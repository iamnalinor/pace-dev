import type { EventInput } from "../events/event-schema.ts";
import type { ResolvedPreset } from "../model/preset.ts";
import type { PresetsState } from "../presets/preset-reducer.ts";

import { autoOutcomeId, type AutoOutcomeKind } from "../ids.ts";
import { isOpen, type Subtask, type Task, type TasksState } from "../model/task.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";
import { addMinutesIso } from "../time.ts";

/** The spec's outcome table; `done` vs `done_late` is derived from instants, never chosen. */
export type Outcome = "cancelled" | "cancelled_missed" | "done" | "done_late" | "skipped";

export type SubtaskOutcome = "done" | "done_late" | "pending";

export type Deadline = {
  readonly dueAt: null | string;
  /** The instant after which the task is missed: the due date, or the resubmission final. */
  readonly finalAt: null | string;
};

/** Instants are compared as instants: mixed sub-second precision would break string order. */
const isAfter = (iso: string, thanIso: string): boolean => Date.parse(iso) > Date.parse(thanIso);

export const deadlineOf = (task: Task, preset: ResolvedPreset): Deadline => {
  switch (preset.deadlinePolicy.kind) {
    case "hard": {
      return { dueAt: task.dueAt, finalAt: task.dueAt };
    }
    case "resubmission": {
      return { dueAt: task.dueAt, finalAt: preset.deadlinePolicy.finalAt };
    }
  }
};

const lateness = (at: string, dueAt: null | string): "done" | "done_late" =>
  dueAt !== null && isAfter(at, dueAt) ? "done_late" : "done";

export const subtaskOutcome = (subtask: Subtask, dueAt: null | string): SubtaskOutcome =>
  subtask.submittedAt === null ? "pending" : lateness(subtask.submittedAt, dueAt);

/**
Per-subtask submission: the submitted problems decide, and the ones still unsubmitted
when the task was closed as done were simply not needed. Whole submission (or a
per-subtask task without problems) goes by the closing instant.
*/
const doneOutcome = (
  task: Task,
  closedAt: string,
  preset: ResolvedPreset,
): "done" | "done_late" => {
  if (preset.submission === "per_subtask" && task.subtasks.length > 0) {
    const isLate = task.subtasks.some((item) => subtaskOutcome(item, task.dueAt) === "done_late");
    return isLate ? "done_late" : "done";
  }
  return lateness(closedAt, task.dueAt);
};

/**
`null` while the task is open. An automatic `cancelled_missed` is beaten by a retro
"done before the deadline" because the reducer keeps the earliest closure; the action
layer also revokes the automatic event so the log tells the same story.
*/
export const taskOutcome = (task: Task, preset: ResolvedPreset): null | Outcome => {
  if (task.closed === null) {
    return null;
  }
  switch (task.closed.outcome) {
    case "done": {
      return doneOutcome(task, task.closed.at, preset);
    }
    case "cancelled":
    case "cancelled_missed":
    case "skipped": {
      return task.closed.outcome;
    }
  }
};

export type AutoOutcomeInput = {
  readonly tasks: TasksState;
  readonly presets: PresetsState;
  readonly now: string;
  /** Every id already in the log, revoked ones included: an automatic outcome is emitted once. */
  readonly existingEventIds: ReadonlySet<string>;
};

type AutoOutcomeEvent = EventInput & { readonly id: string };

/** An empty instance gets this long after its due date before it is closed as skipped. */
const SKIP_GRACE_MINUTES = 24 * 60;

/** The reason stored on an automatic skip; the UI translates it. */
export const NOT_ASSIGNED_REASON = "not-assigned";

/** A recurring instance nobody filled in: no problems, no source, no progress, never started. */
const isEmptyInstance = (task: Task): boolean =>
  task.id.startsWith("hw:") &&
  task.subtasks.length === 0 &&
  task.sourceText === null &&
  task.slider === null &&
  task.status === "not_started";

type ClosePayload =
  | { readonly outcome: "cancelled_missed" }
  | { readonly outcome: "skipped"; readonly reason: string };

const closeEvent = (
  task: Task,
  kind: AutoOutcomeKind,
  when: { readonly occurredAt: string; readonly payload: ClosePayload },
): AutoOutcomeEvent => ({
  id: autoOutcomeId(task.id, kind),
  type: "task.closed",
  occurredAt: when.occurredAt,
  precision: "exact",
  source: "system",
  payload: { taskId: task.id, ...when.payload },
});

/** Empty instances are skipped, never missed: nothing was ever assigned to miss. */
const autoOutcome = (
  task: Task,
  preset: ResolvedPreset,
  now: string,
): AutoOutcomeEvent | undefined => {
  if (isEmptyInstance(task)) {
    const skipAt = task.dueAt === null ? null : addMinutesIso(task.dueAt, SKIP_GRACE_MINUTES);
    return skipAt !== null && isAfter(now, skipAt)
      ? closeEvent(task, "skipped", {
          occurredAt: skipAt,
          payload: { outcome: "skipped", reason: NOT_ASSIGNED_REASON },
        })
      : undefined;
  }
  const { finalAt } = deadlineOf(task, preset);
  return finalAt !== null && isAfter(now, finalAt)
    ? closeEvent(task, "missed", { occurredAt: finalAt, payload: { outcome: "cancelled_missed" } })
    : undefined;
};

const compare = (a: AutoOutcomeEvent, b: AutoOutcomeEvent): number => {
  if (a.occurredAt !== b.occurredAt) {
    return a.occurredAt < b.occurredAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
};

/**
The automatic outcomes due by `now`: `cancelled_missed` at the final deadline and
`skipped` for empty recurring instances a day after their due date. Deterministic ids
(`auto:<taskId>:<kind>`) keep them idempotent across devices and the server.
*/
export const autoOutcomeEvents = (input: AutoOutcomeInput): readonly EventInput[] =>
  Object.values(input.tasks.byId)
    .filter(isOpen)
    .flatMap((task) => {
      const preset = resolvePreset(input.presets, task.presetId, task.overrides ?? undefined);
      const event = preset.ok ? autoOutcome(task, preset.value, input.now) : undefined;
      return event === undefined || input.existingEventIds.has(event.id) ? [] : [event];
    })
    .toSorted(compare);
