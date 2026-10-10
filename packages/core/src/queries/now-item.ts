import type { CoreState } from "../materialize/core-state.ts";
import type { Importance, ResolvedPreset } from "../model/preset.ts";
import type { PresetError } from "../presets/resolve-preset.ts";
import type { QueryContext } from "./context.ts";

import { type Project, projectById } from "../model/project.ts";
import { progressOf, solvedCount, submittedCount, type Task } from "../model/task.ts";
import { presetById } from "../presets/preset-reducer.ts";
import { err, ok, type Result } from "../result.ts";
import { minutesBetween } from "../time.ts";
import { importanceOf, presetOf } from "./classify.ts";

/** One row of the Now list (and of a project's list): the task with everything its meta line shows. */
export type NowItem = {
  readonly task: Task;
  readonly preset: ResolvedPreset;
  /** The category's name as stored (built-in ones are translated by the UI). */
  readonly presetName: string;
  readonly project: null | Project;
  readonly importance: Importance;
  /** Progress 0..1 in the preset's progress mode. */
  readonly progress: number;
  readonly solved: number;
  readonly total: number;
  readonly submitted: number;
  readonly dueAt: null | string;
  readonly dueTz: null | string;
  /** Minutes past the due date; `null` while on time or without a due date. */
  readonly lateMinutes: null | number;
  readonly isLate: boolean;
};

const lateMinutesOf = (task: Task, now: string): null | number => {
  if (task.dueAt === null) {
    return null;
  }
  const minutes = minutesBetween(task.dueAt, now);
  return minutes > 0 ? minutes : null;
};

export const nowItem = (
  state: CoreState,
  task: Task,
  ctx: QueryContext,
): Result<NowItem, PresetError> => {
  const preset = presetOf(state, task);
  if (!preset.ok) {
    return err(preset.error);
  }
  const lateMinutes = lateMinutesOf(task, ctx.now);
  return ok({
    task,
    preset: preset.value,
    presetName: presetById(state.presets, task.presetId)?.name ?? task.presetId,
    project: task.projectId === null ? null : (projectById(state.projects, task.projectId) ?? null),
    importance: importanceOf(task, preset.value),
    progress: progressOf(task, preset.value.progressMode),
    solved: solvedCount(task),
    total: task.subtasks.length,
    submitted: submittedCount(task),
    dueAt: task.dueAt,
    dueTz: task.dueTz,
    lateMinutes,
    isLate: lateMinutes !== null,
  });
};

/** Starts later than `now`: such a task waits under "In future". */
export const hasLaterStart = (task: Task, now: string): boolean =>
  task.startAt !== null && task.startAt > now;

const byInstant = (a: null | string, b: null | string): number => {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  return b === null || a < b ? -1 : 1;
};

/**
The one order of task lists: the nearest deadline first, tasks without one after all the
dated ones, then the older task, then the id (so equal tasks never swap places).
*/
export const compareNowItems = (a: NowItem, b: NowItem): number => {
  const byDue = byInstant(a.dueAt, b.dueAt);
  if (byDue !== 0) {
    return byDue;
  }
  const byAge = byInstant(a.task.createdAt, b.task.createdAt);
  return byAge === 0 ? a.task.id.localeCompare(b.task.id) : byAge;
};

/** Under "In future": the earliest start first. */
export const compareFutureItems = (a: NowItem, b: NowItem): number => {
  const byStart = byInstant(a.task.startAt, b.task.startAt);
  return byStart === 0 ? compareNowItems(a, b) : byStart;
};
