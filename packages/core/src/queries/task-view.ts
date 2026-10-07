import type { CoreState } from "../materialize/core-state.ts";
import type { Importance, ResolvedPreset } from "../model/preset.ts";
import type { PresetError } from "../presets/resolve-preset.ts";
import type { UrgencyInput } from "../urgency/input.ts";
import type { QueryContext } from "./context.ts";

import { type Project, projectById } from "../model/project.ts";
import { isOpen, progressOf, type Task, taskById, type TaskStatus } from "../model/task.ts";
import { err, ok, type Result } from "../result.ts";
import { zonesDiffer } from "../time.ts";
import { explain, type Explanation } from "../urgency/explain.ts";
import { importanceOf, presetOf } from "./classify.ts";
import { rankWithinCategory, urgencyInputFor } from "./urgency-input.ts";
import { windowElapsedOf } from "./window.ts";

/** What the Submit / Done button will do: send the solved problems, or close the whole task. */
export type SubmitPreview =
  | { readonly kind: "per_subtask"; readonly subtaskIds: readonly string[] }
  | { readonly kind: "whole"; readonly canClose: boolean };

/** The task screen: the stats card, the "why it's Nth" card and the submit preview. */
export type TaskView = {
  readonly task: Task;
  readonly preset: ResolvedPreset;
  readonly project: null | Project;
  readonly importance: Importance;
  readonly status: TaskStatus;
  /** Share of the window elapsed, 0..1; `null` without a due. */
  readonly windowElapsed: null | number;
  /** `estimate × (1 − progress)`, whole minutes. */
  readonly workLeftMinutes: number;
  /** Tracked time arrives with stage 3. */
  readonly trackedMinutes: number;
  readonly explanation: Explanation;
  /** Position inside the importance category; `null` when the task does not compete. */
  readonly rank: UrgencyInput["rank"];
  /** The due date was set in a zone whose offset differs from the device's. */
  readonly dueZoneDiffers: boolean;
  readonly submitPreview: SubmitPreview;
};

const submitPreviewOf = (task: Task, preset: ResolvedPreset): SubmitPreview =>
  preset.submission === "per_subtask"
    ? {
        kind: "per_subtask",
        subtaskIds: task.subtasks
          .filter((item) => item.solvedAt !== null && item.submittedAt === null)
          .map((item) => item.id),
      }
    : { kind: "whole", canClose: isOpen(task) };

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
  const rank = rankWithinCategory(state, task);
  const input = urgencyInputFor(state, task, ctx, rank);
  if (!input.ok) {
    return err(input.error);
  }
  const explanation = explain(input.value, ctx.now);
  return ok({
    task,
    preset: preset.value,
    project: task.projectId === null ? null : (projectById(state.projects, task.projectId) ?? null),
    importance: importanceOf(task, preset.value),
    status: task.status,
    windowElapsed: windowElapsedOf(task, explanation.score.effectiveDue, ctx.now),
    workLeftMinutes: Math.round(
      input.value.estimateHours * 60 * (1 - progressOf(task, preset.value.progressMode)),
    ),
    trackedMinutes: 0,
    explanation,
    rank,
    dueZoneDiffers: isDueZoneDifferent(task, ctx.deviceTz),
    submitPreview: submitPreviewOf(task, preset.value),
  });
};
