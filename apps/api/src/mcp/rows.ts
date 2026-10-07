import { z } from "zod";

import {
  type CoreState,
  err,
  type NowItem,
  nowItem,
  ok,
  presetById,
  type Project,
  projectView,
  type Result,
  type Task,
  taskById,
  taskOutcome,
} from "@pace/core";

import { describeCode, type Rendered, type Scope, type ToolFailure } from "./tool-kit.ts";

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

const presetNameOf = (state: CoreState, task: Task): string =>
  presetById(state.presets, task.presetId)?.name ?? task.presetId;

/** A Now-list item as a row: the task's own deadline next to the effective one the score used. */
export const rowFromItem = (scope: Scope, item: NowItem): TaskRow => {
  const { task } = item;
  return {
    dueAt: task.dueAt,
    dueTz: task.dueTz,
    effectiveDueAt: item.score.effectiveDue,
    estimateMinutes: task.estimateMinutes,
    id: task.id,
    importance: item.importance,
    isLate: item.isLate,
    lateMinutes: item.lateMinutes,
    outcome: taskOutcome(task, item.preset),
    presetId: task.presetId,
    presetName: presetNameOf(scope.state, task),
    progress: item.progress,
    projectId: task.projectId,
    projectName: item.project?.name ?? null,
    score: item.score.score,
    solved: item.solved,
    startAt: task.startAt,
    status: task.status,
    submitted: item.submitted,
    title: task.title,
    total: item.total,
    url: taskUrl(scope.webOrigin, task.id),
  };
};

const problem = (code: string): ToolFailure => ({ code, message: describeCode(code) });

/** One task as a row, scored exactly as the Now list scores it (closed tasks included). */
export const taskRow = (scope: Scope, taskId: string): Result<TaskRow, ToolFailure> => {
  const task = taskById(scope.state.tasks, taskId);
  if (task === undefined) {
    return err(problem("task/unknown"));
  }
  const item = nowItem(scope.state, task, scope.qctx);
  return item.ok ? ok(rowFromItem(scope, item.value)) : err(problem(item.error));
};

/** The row of a task that is known to exist and resolve (after a successful write). */
export const rowOf = (scope: Scope, taskId: string): null | TaskRow => {
  const row = taskRow(scope, taskId);
  return row.ok ? row.value : null;
};

/** The open count is the project page's: empty homework instances awaiting assignment excluded. */
export const projectRow = (scope: Scope, project: Project): ProjectRow => {
  const view = projectView(scope.state, project.id, scope.qctx);
  return {
    archived: project.archived,
    color: project.color,
    createdAt: project.createdAt,
    description: project.description,
    id: project.id,
    name: project.name,
    openTasks: view.ok ? view.value.stats.open : 0,
    url: projectUrl(scope.webOrigin, project.id),
  };
};

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

/** The answer of a write about one task: its row after the write and a one-line summary. */
export const renderTask =
  (taskId: string, verb: string, extra: Record<string, unknown> = {}) =>
  (scope: Scope): Rendered => {
    const row = rowOf(scope, taskId);
    return {
      structured: { ...extra, task: row, taskId },
      summary: `${verb} ${labelOf(row, taskId)}.`,
    };
  };

/** Chains comparators: the next key decides only when the first one ties. */
export const thenBy = (first: number, next: () => number): number => (first === 0 ? next() : first);
