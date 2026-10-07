import type { EventInput } from "../events/event-schema.ts";

import { solvedCount, type Task, taskById, type TasksState } from "../model/task.ts";
import { presetById, type PresetsState } from "../presets/preset-reducer.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";
import { err, ok, type Result } from "../result.ts";
import { addMinutesIso } from "../time.ts";

export type RetroError =
  | "preset/unknown"
  | "retro/before-created"
  | "retro/future"
  | "retro/nothing-to-submit"
  | "retro/task-closed"
  | "subtask/unknown"
  | "task/unknown";

export type ValidationState = {
  readonly tasks: TasksState;
  readonly presets: PresetsState;
};

/** Device clocks drift; an event this far ahead still counts as "now". */
export const FUTURE_TOLERANCE_MINUTES = 5;

type TaskInput = Extract<EventInput, { readonly payload: { readonly taskId: string } }>;

/** Everything addressed to a task: `task.*` and the focus events. */
const isTaskInput = (input: EventInput): input is TaskInput => "taskId" in input.payload;

/** Work on a closed task needs a reopen first; editing, closing again and reopening do not. */
const REJECTED_WHEN_CLOSED: ReadonlySet<TaskInput["type"]> = new Set([
  "task.subtask.solved",
  "task.submitted",
  "task.progress.set",
  "task.status.set",
  "focus.started",
]);

const isAfter = (iso: string, thanIso: string): boolean => Date.parse(iso) > Date.parse(thanIso);

const checkPreset = (presets: PresetsState, presetId: string): RetroError | undefined =>
  presetById(presets, presetId) === undefined ? "preset/unknown" : undefined;

/** A whole submission of a per-subtask task needs at least one solved problem to send. */
const isWholeSubmittable = (presets: PresetsState, task: Task): boolean => {
  const preset = resolvePreset(presets, task.presetId, task.overrides ?? undefined);
  return !preset.ok || preset.value.submission === "whole" || solvedCount(task) > 0;
};

const checkSubmission = (
  presets: PresetsState,
  task: Task,
  ids: readonly string[] | undefined,
): RetroError | undefined => {
  if (ids === undefined) {
    return isWholeSubmittable(presets, task) ? undefined : "retro/nothing-to-submit";
  }
  const picked = ids.map((id) => task.subtasks.find((item) => item.id === id));
  if (picked.includes(undefined)) {
    return "subtask/unknown";
  }
  const isSolved = picked.every((item) => item?.solvedAt !== null);
  const isPending = picked.some((item) => item?.submittedAt === null);
  return isSolved && isPending ? undefined : "retro/nothing-to-submit";
};

const checkDetails = (
  presets: PresetsState,
  task: Task,
  input: Exclude<TaskInput, { readonly type: "task.created" }>,
): RetroError | undefined => {
  if (input.type === "task.preset.set") {
    return checkPreset(presets, input.payload.presetId);
  }
  if (input.type === "task.subtask.solved") {
    const isKnown = task.subtasks.some((item) => item.id === input.payload.subtaskId);
    return isKnown ? undefined : "subtask/unknown";
  }
  return input.type === "task.submitted"
    ? checkSubmission(presets, task, input.payload.subtaskIds)
    : undefined;
};

const checkTask = (state: ValidationState, input: TaskInput): RetroError | undefined => {
  if (input.type === "task.created") {
    return checkPreset(state.presets, input.payload.presetId);
  }
  const task = taskById(state.tasks, input.payload.taskId);
  if (task === undefined) {
    return "task/unknown";
  }
  if (isAfter(task.createdAt, input.occurredAt)) {
    return "retro/before-created";
  }
  return task.closed !== null && REJECTED_WHEN_CLOSED.has(input.type)
    ? "retro/task-closed"
    : checkDetails(state.presets, task, input);
};

/**
What a retro edit may not do (spec «Актуализация задним числом»), checked before an event
is appended. Corrections and events that are not about a task pass through untouched;
the reducer never validates, so this is the one gate.
*/
export const validateEventInput = (
  state: ValidationState,
  input: EventInput,
  now: string,
): Result<EventInput, RetroError> => {
  if (!isTaskInput(input)) {
    return ok(input);
  }
  const problem = isAfter(input.occurredAt, addMinutesIso(now, FUTURE_TOLERANCE_MINUTES))
    ? "retro/future"
    : checkTask(state, input);
  return problem === undefined ? ok(input) : err(problem);
};
