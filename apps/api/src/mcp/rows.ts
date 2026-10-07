import { z } from "zod";

import {
  type CoreState,
  err,
  type Importance,
  isOpen,
  minutesBetween,
  type NowItem,
  ok,
  presetById,
  progressOf,
  type Project,
  type ResolvedPreset,
  resolvePreset,
  type Result,
  type Score,
  solvedCount,
  submittedCount,
  type Task,
  taskOutcome,
  type TaskView,
  taskView,
} from "@pace/core";

import type { Scope, ToolFailure } from "./tool-kit.ts";

/** The shapes the tools answer with for tasks and projects, and the renderers behind them. */

export const taskUrl = (webOrigin: string, taskId: string): string => `${webOrigin}/task/${taskId}`;

export const projectUrl = (webOrigin: string, projectId: string): string =>
  `${webOrigin}/projects/${projectId}`;

export const TaskRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  presetId: z.string(),
  presetName: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  importance: z.string().describe("Effective importance: the task's own, else the preset default."),
  status: z.string().describe("not_started | in_progress | paused | waiting"),
  score: z.number().describe("Urgency score; Now is sorted by it, highest first."),
  dueAt: z.string().nullable().describe("The explicit deadline (ISO, UTC)."),
  dueTz: z.string().nullable().describe("The zone the deadline was set in."),
  effectiveDueAt: z
    .string()
    .nullable()
    .describe(
      "The deadline or the horizon the importance implies (ASAP: end of day), whichever is first.",
    ),
  startAt: z.string().nullable(),
  isLate: z.boolean(),
  lateMinutes: z.number().nullable(),
  progress: z.number().describe("0..1 in the preset's progress mode."),
  solved: z.int(),
  total: z.int().describe("Number of subtasks."),
  submitted: z.int(),
  estimateMinutes: z.int().nullable(),
  outcome: z
    .string()
    .nullable()
    .describe("done | done_late | cancelled | cancelled_missed | skipped; null while open."),
  url: z.string(),
});

export type TaskRow = z.output<typeof TaskRowSchema>;

export const ProjectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.string(),
  openTasks: z.int(),
  url: z.string(),
});

export type ProjectRow = z.output<typeof ProjectRowSchema>;

type RowSource = {
  readonly task: Task;
  readonly preset: ResolvedPreset;
  readonly project: null | Project;
  readonly importance: Importance;
  readonly score: Score;
  readonly progress: number;
  readonly lateMinutes: null | number;
};

const presetNameOf = (state: CoreState, task: Task): string =>
  presetById(state.presets, task.presetId)?.name ?? task.presetId;

const toRow = (scope: Scope, source: RowSource): TaskRow => {
  const { task } = source;
  return {
    dueAt: task.dueAt,
    dueTz: task.dueTz,
    effectiveDueAt: source.score.effectiveDue,
    estimateMinutes: task.estimateMinutes,
    id: task.id,
    importance: source.importance,
    isLate: source.lateMinutes !== null,
    lateMinutes: source.lateMinutes,
    outcome: taskOutcome(task, source.preset),
    presetId: task.presetId,
    presetName: presetNameOf(scope.state, task),
    progress: source.progress,
    projectId: task.projectId,
    projectName: source.project?.name ?? null,
    score: source.score.score,
    solved: solvedCount(task),
    startAt: task.startAt,
    status: task.status,
    submitted: submittedCount(task),
    title: task.title,
    total: task.subtasks.length,
    url: taskUrl(scope.webOrigin, task.id),
  };
};

/** Minutes past the explicit deadline, or null while on time or without one. */
const lateMinutesOf = (task: Task, now: string): null | number => {
  if (task.dueAt === null) {
    return null;
  }
  const minutes = minutesBetween(task.dueAt, now);
  return minutes > 0 ? minutes : null;
};

export const rowFromItem = (scope: Scope, item: NowItem): TaskRow => toRow(scope, item);

export const rowFromView = (scope: Scope, view: TaskView): TaskRow =>
  toRow(scope, {
    importance: view.importance,
    lateMinutes: lateMinutesOf(view.task, scope.qctx.now),
    preset: view.preset,
    progress: progressOf(view.task, view.preset.progressMode),
    project: view.project,
    score: view.explanation.score,
    task: view.task,
  });

/** One task as a row, through the task view (so the score and outcome are the screen's). */
export const taskRow = (scope: Scope, taskId: string): Result<TaskRow, ToolFailure> => {
  const view = taskView(scope.state, taskId, scope.qctx);
  return view.ok
    ? ok(rowFromView(scope, view.value))
    : err({ code: view.error, message: view.error });
};

/** The row of a task that is known to exist and resolve (after a successful write). */
export const rowOf = (scope: Scope, taskId: string): null | TaskRow => {
  const row = taskRow(scope, taskId);
  return row.ok ? row.value : null;
};

export const effectiveImportance = (state: CoreState, task: Task): Importance => {
  if (task.importance !== null) {
    return task.importance;
  }
  const preset = resolvePreset(state.presets, task.presetId, task.overrides ?? undefined);
  return preset.ok ? preset.value.defaultImportance : "normal";
};

const openTasksOf = (state: CoreState, projectId: string): number =>
  Object.values(state.tasks.byId).filter((task) => task.projectId === projectId && isOpen(task))
    .length;

export const projectRow = (scope: Scope, project: Project): ProjectRow => ({
  archived: project.archived,
  color: project.color,
  createdAt: project.createdAt,
  description: project.description,
  id: project.id,
  name: project.name,
  openTasks: openTasksOf(scope.state, project.id),
  url: projectUrl(scope.webOrigin, project.id),
});

/** One line per task for text summaries. */
export const describeRow = (row: TaskRow): string => {
  const late = row.isLate ? " (late)" : "";
  const due = row.dueAt === null ? "" : `, due ${row.dueAt}${late}`;
  const progress = row.total > 0 ? `, ${row.solved}/${row.total} solved` : "";
  return `${row.title} [${row.id}] (${row.importance}, ${row.presetName}${due}${progress})`;
};

/** The row's line, or the bare id when the task cannot be rendered. */
export const labelOf = (row: null | TaskRow, taskId: string): string =>
  row === null ? taskId : describeRow(row);

/** Chains comparators: the next key decides only when the first one ties. */
export const thenBy = (first: number, next: () => number): number => (first === 0 ? next() : first);
