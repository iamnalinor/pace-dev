import type { CoreState } from "../materialize/core-state.ts";
import type { Importance, ResolvedPreset } from "../model/preset.ts";
import type { PresetError } from "../presets/resolve-preset.ts";
import type { QueryContext } from "./context.ts";

import { type Project, projectById } from "../model/project.ts";
import { progressOf, type Task, taskById, type TaskStatus } from "../model/task.ts";
import { err, ok, type Result } from "../result.ts";
import { zonesDiffer } from "../time.ts";
import { taskTrackedMinutes } from "../tracking/insights.ts";
import { importanceOf, presetOf } from "./classify.ts";

/** The task screen: the stats card. */
export type TaskView = {
  readonly task: Task;
  readonly preset: ResolvedPreset;
  readonly project: null | Project;
  readonly importance: Importance;
  readonly status: TaskStatus;
  /** `estimate × (1 − progress)`, whole minutes. */
  readonly workLeftMinutes: number;
  /** Minutes tracked on the task, all time. */
  readonly trackedMinutes: number;
  /** The due date was set in a zone whose offset differs from the device's. */
  readonly dueZoneDiffers: boolean;
};

/** The task's own estimate, else the preset's default. */
export const estimateMinutesOf = (task: Task, preset: ResolvedPreset): number =>
  task.estimateMinutes ?? preset.defaultEstimateMinutes;

const isDueZoneDifferent = (task: Task, deviceTz: string): boolean =>
  task.dueAt !== null &&
  task.dueTz !== null &&
  zonesDiffer({ at: task.dueAt, tz: task.dueTz }, { at: task.dueAt, tz: deviceTz });

export const taskView = (
  state: CoreState,
  taskId: string,
  ctx: QueryContext,
): Result<TaskView, "task/unknown" | PresetError> => {
  const task = taskById(state.tasks, taskId);
  if (task === undefined) {
    return err("task/unknown");
  }
  const preset = presetOf(state, task);
  if (!preset.ok) {
    return err(preset.error);
  }
  return ok({
    task,
    preset: preset.value,
    project: task.projectId === null ? null : (projectById(state.projects, task.projectId) ?? null),
    importance: importanceOf(task, preset.value),
    status: task.status,
    workLeftMinutes: Math.round(
      estimateMinutesOf(task, preset.value) * (1 - progressOf(task, preset.value.progressMode)),
    ),
    trackedMinutes: taskTrackedMinutes(state, task.id, ctx.now),
    dueZoneDiffers: isDueZoneDifferent(task, ctx.deviceTz),
  });
};
