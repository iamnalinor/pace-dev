import type { Event, EventInput } from "../events/event-schema.ts";
import type { ResolvedPreset } from "../model/preset.ts";
import type { PresetsState } from "../presets/preset-reducer.ts";

import { autoOutcomeId } from "../ids.ts";
import { isOpen, type Subtask, type Task, type TasksState } from "../model/task.ts";
import { taskPreset } from "../presets/resolve-preset.ts";
import { addDaysIn, addMinutesIso } from "../time.ts";

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
      const { finalAt, finalMode, softDays } = preset.deadlinePolicy;
      const offset =
        finalMode === "offset" && task.dueAt !== null
          ? addDaysIn(task.dueAt, softDays, task.dueTz ?? "UTC")
          : null;
      return { dueAt: task.dueAt, finalAt: finalAt ?? offset };
    }
  }
};

/**
The hard end of a two-stage deadline with the zone it reads in (a fixed date's own zone, else
the due date's); `null` under a hard policy or while the second stage has no end.
*/
export const finalDeadlineOf = (
  task: Task,
  preset: ResolvedPreset,
): null | { readonly at: string; readonly tz: string } => {
  const policy = preset.deadlinePolicy;
  if (policy.kind === "hard") {
    return null;
  }
  const { finalAt } = deadlineOf(task, preset);
  const tz = (policy.finalAt === null ? null : policy.finalTz) ?? task.dueTz ?? "UTC";
  return finalAt === null ? null : { at: finalAt, tz };
};

const lateness = (at: string, dueAt: null | string): "done" | "done_late" =>
  dueAt !== null && isAfter(at, dueAt) ? "done_late" : "done";

export const subtaskOutcome = (subtask: Subtask, dueAt: null | string): SubtaskOutcome =>
  subtask.doneAt === null ? "pending" : lateness(subtask.doneAt, dueAt);

/**
Whether a task closed as done at `closedAt` reads late (owner, 2026-11-09): its subtasks decide
only when every one of them is done, by the latest done instant (problems solved before the
deadline and the task closed after it is on time); while any is left open, or with no subtasks,
the closing instant decides. `doneAts` holds each subtask's done instant or `null`. The close
sheet's preview reads the same rule.
*/
export const doneLateness = (
  doneAts: readonly (null | string)[],
  closedAt: string,
  dueAt: null | string,
): "done" | "done_late" => {
  const done = doneAts.filter((when) => when !== null);
  if (doneAts.length === 0 || done.length < doneAts.length) {
    return lateness(closedAt, dueAt);
  }
  // The latest done instant is after the due exactly when any of them is.
  return done.some((when) => lateness(when, dueAt) === "done_late") ? "done_late" : "done";
};

const doneOutcome = (task: Task, closedAt: string): "done" | "done_late" =>
  doneLateness(
    task.subtasks.map((item) => item.doneAt),
    closedAt,
    task.dueAt,
  );

/**
`null` while the task is open. An automatic `cancelled_missed` (only in old logs) is beaten by a retro
"done before the deadline" because the reducer keeps the earliest closure; the action
layer also revokes the automatic event so the log tells the same story.
*/
export const taskOutcome = (task: Task): null | Outcome => {
  if (task.closed === null) {
    return null;
  }
  switch (task.closed.outcome) {
    case "done": {
      return doneOutcome(task, task.closed.at);
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

const closeEvent = (task: Task, occurredAt: string): AutoOutcomeEvent => ({
  id: autoOutcomeId(task.id, "skipped"),
  type: "task.closed",
  occurredAt,
  precision: "exact",
  source: "system",
  payload: { taskId: task.id, outcome: "skipped", reason: NOT_ASSIGNED_REASON },
});

/**
Only an empty instance is closed by the system, as skipped: nothing was ever assigned to it.
A task past its final deadline stays open and reads as overdue (feedback 5: the automatic
`cancelled_missed` was dropped); old ones in a log still materialize and can be reopened.
*/
const autoOutcome = (task: Task): AutoOutcomeEvent | undefined => {
  if (!isEmptyInstance(task)) {
    return undefined;
  }
  const skipAt = task.dueAt === null ? null : addMinutesIso(task.dueAt, SKIP_GRACE_MINUTES);
  return skipAt === null ? undefined : closeEvent(task, skipAt);
};

const compare = (a: AutoOutcomeEvent, b: AutoOutcomeEvent): number => {
  if (a.occurredAt !== b.occurredAt) {
    return a.occurredAt < b.occurredAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
};

/**
The automatic outcomes due by `now`: `skipped` for empty recurring instances a day after their
due date (of a preset that still resolves). Deterministic ids (`auto:<taskId>:skipped`) keep them
idempotent across devices and the server.
*/
export const autoOutcomeEvents = (input: AutoOutcomeInput): readonly EventInput[] =>
  Object.values(input.tasks.byId)
    .filter(isOpen)
    .flatMap((task) => {
      const event = taskPreset(input.presets, task).ok ? autoOutcome(task) : undefined;
      const isDue = event !== undefined && isAfter(input.now, event.occurredAt);
      return !isDue || input.existingEventIds.has(event.id) ? [] : [event];
    })
    .toSorted(compare);

/**
An automatic `cancelled_missed` close, which only an older client still writes (feedback 5: no
task is closed automatically any more).
*/
const isRetiredAutoMiss = (event: Event): boolean =>
  event.type === "task.closed" &&
  event.source === "system" &&
  event.payload.outcome === "cancelled_missed";

/**
The revocations of the automatic misses an older client just pushed: the server takes the event
(an old client keeps a refused one in its outbox and sends it on every sync) and revokes it at
once, so the task stays open on every device, that one included. Deterministic ids
(`<miss id>:retired`) keep it idempotent. Misses already in a log are not touched (the owner kept
old automatic closes as they are).
*/
export const retiredAutoMissRevokes = (
  pushed: readonly Event[],
  now: string,
): readonly EventInput[] =>
  pushed
    .filter((event) => isRetiredAutoMiss(event))
    .map((event) => ({
      id: `${event.id}:retired`,
      type: "event.revoked",
      occurredAt: now,
      precision: "exact",
      source: "system",
      payload: { targetId: event.id },
    }));
