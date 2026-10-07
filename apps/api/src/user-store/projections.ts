import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { inArray } from "drizzle-orm";

import {
  type CoreState,
  importanceOf,
  type Preset,
  presetOf,
  progressOf,
  type Project,
  type Task,
  taskOutcome,
} from "@pace/core";

import type { Touched } from "./state.ts";

import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

type TaskRow = typeof schema.tasks.$inferInsert;
type SubtaskRow = typeof schema.subtasks.$inferInsert;
type ProjectRow = typeof schema.projects.$inferInsert;
type PresetRow = typeof schema.presets.$inferInsert;

/** The Durable Object's SQLite binds at most this many parameters per statement. */
const MAX_PARAMETERS = 100;

/** A task whose preset chain is broken still gets a row: its own fields, no derived ones. */
const taskRow = (state: CoreState, task: Task): TaskRow => {
  const preset = presetOf(state, task);
  return {
    closedAt: task.closed?.at ?? null,
    createdAt: task.createdAt,
    dueAt: task.dueAt,
    dueTz: task.dueTz,
    estimateMinutes: task.estimateMinutes,
    id: task.id,
    importance: preset.ok ? importanceOf(task, preset.value) : (task.importance ?? "normal"),
    outcome: preset.ok ? taskOutcome(task, preset.value) : (task.closed?.outcome ?? null),
    presetId: task.presetId,
    progress: preset.ok ? progressOf(task, preset.value.progressMode) : 0,
    projectId: task.projectId,
    startAt: task.startAt,
    status: task.status,
    title: task.title,
    touched: task.touched,
    updatedAt: task.lastEventAt,
  };
};

const subtaskRows = (task: Task): readonly SubtaskRow[] =>
  task.subtasks.map((item) => ({
    id: item.id,
    label: item.label,
    number: item.number,
    solvedAt: item.solvedAt,
    submittedAt: item.submittedAt,
    taskId: task.id,
  }));

const projectRow = (project: Project): ProjectRow => ({
  archived: project.archived,
  color: project.color,
  createdAt: project.createdAt,
  id: project.id,
  name: project.name,
});

const presetRow = (preset: Preset): PresetRow => ({
  archived: preset.archived,
  builtIn: preset.builtIn,
  definition: JSON.stringify(preset.definition),
  extends: preset.extends,
  id: preset.id,
  name: preset.name,
});

type Batch<T> = (batch: T[]) => Promise<unknown>;

/** Runs a statement per slice of `items`, `size` at a time. */
const inBatches = async <T>(items: readonly T[], size: number, run: Batch<T>): Promise<void> => {
  for (let start = 0; start < items.length; start += size) {
    await run(items.slice(start, start + size));
  }
};

/** Inserts in batches small enough for every row's columns to fit the parameter cap. */
const insertRows = async <T extends object>(
  rows: readonly T[],
  insert: Batch<T>,
): Promise<void> => {
  const columns = Math.max(1, Object.keys(rows[0] ?? {}).length);
  await inBatches(rows, Math.max(1, Math.floor(MAX_PARAMETERS / columns)), insert);
};

const deleteIds = async (ids: ReadonlySet<string>, remove: Batch<string>): Promise<void> => {
  await inBatches([...ids], MAX_PARAMETERS, remove);
};

const present = <T>(byId: Readonly<Record<string, T>>, ids: ReadonlySet<string>): readonly T[] =>
  Object.entries(byId)
    .filter(([id]) => ids.has(id))
    .map(([, value]) => value);

/** Inserts the current rows of the given entities; their previous rows must be gone. */
const insertTouched = async (db: Db, state: CoreState, touched: Touched): Promise<void> => {
  const tasks = present(state.tasks.byId, touched.taskIds);
  const projects = present(state.projects.byId, touched.projectIds);
  const presets = present(state.presets.byId, touched.presetIds);
  await insertRows(
    tasks.map((task) => taskRow(state, task)),
    (batch) => db.insert(schema.tasks).values(batch),
  );
  await insertRows(
    tasks.flatMap((task) => subtaskRows(task)),
    (batch) => db.insert(schema.subtasks).values(batch),
  );
  await insertRows(
    projects.map((project) => projectRow(project)),
    (batch) => db.insert(schema.projects).values(batch),
  );
  await insertRows(
    presets.map((preset) => presetRow(preset)),
    (batch) => db.insert(schema.presets).values(batch),
  );
};

const deleteTouched = async (db: Db, touched: Touched): Promise<void> => {
  await deleteIds(touched.taskIds, (ids) =>
    db.delete(schema.subtasks).where(inArray(schema.subtasks.taskId, ids)),
  );
  await deleteIds(touched.taskIds, (ids) =>
    db.delete(schema.tasks).where(inArray(schema.tasks.id, ids)),
  );
  await deleteIds(touched.projectIds, (ids) =>
    db.delete(schema.projects).where(inArray(schema.projects.id, ids)),
  );
  await deleteIds(touched.presetIds, (ids) =>
    db.delete(schema.presets).where(inArray(schema.presets.id, ids)),
  );
};

/** Every row from scratch: after a rebuild nothing can be assumed about what changed. */
export const rewriteProjections = async (db: Db, state: CoreState): Promise<void> => {
  await db.delete(schema.subtasks);
  await db.delete(schema.tasks);
  await db.delete(schema.projects);
  await db.delete(schema.presets);
  await insertTouched(db, state, {
    presetIds: new Set(Object.keys(state.presets.byId)),
    projectIds: new Set(Object.keys(state.projects.byId)),
    taskIds: new Set(Object.keys(state.tasks.byId)),
  });
};

/**
A preset change moves the derived columns (default importance, progress, outcome) of every
task down its chain, children included; presets change rarely, so all task rows are rewritten.
*/
const withAffectedTasks = (state: CoreState, touched: Touched): Touched =>
  touched.presetIds.size === 0
    ? touched
    : { ...touched, taskIds: new Set(Object.keys(state.tasks.byId)) };

/** Rewrites only the rows a batch touched (the incremental path). */
export const updateProjections = async (
  db: Db,
  state: CoreState,
  touched: Touched,
): Promise<void> => {
  const affected = withAffectedTasks(state, touched);
  await deleteTouched(db, affected);
  await insertTouched(db, state, affected);
};
