import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { inArray } from "drizzle-orm";

import {
  type CoreState,
  type Preset,
  progressOf,
  type Project,
  resolvePreset,
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
export const taskRow = (state: CoreState, task: Task): TaskRow => {
  const preset = resolvePreset(state.presets, task.presetId, task.overrides ?? undefined);
  return {
    closedAt: task.closed?.at ?? null,
    createdAt: task.createdAt,
    dueAt: task.dueAt,
    dueTz: task.dueTz,
    estimateMinutes: task.estimateMinutes,
    id: task.id,
    importance: task.importance ?? (preset.ok ? preset.value.defaultImportance : "normal"),
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

export const subtaskRows = (task: Task): readonly SubtaskRow[] =>
  task.subtasks.map((item) => ({
    id: item.id,
    label: item.label,
    number: item.number,
    solvedAt: item.solvedAt,
    submittedAt: item.submittedAt,
    taskId: task.id,
  }));

export const projectRow = (project: Project): ProjectRow => ({
  archived: project.archived,
  color: project.color,
  createdAt: project.createdAt,
  id: project.id,
  name: project.name,
});

export const presetRow = (preset: Preset): PresetRow => ({
  archived: preset.archived,
  builtIn: preset.builtIn,
  definition: JSON.stringify(preset.definition),
  extends: preset.extends,
  id: preset.id,
  name: preset.name,
});

const chunks = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

type Insert<T extends object> = (chunk: T[]) => Promise<unknown>;

/** Inserts in chunks small enough for every row's columns to fit the parameter cap. */
const insertChunked = async <T extends object>(
  rows: readonly T[],
  insert: Insert<T>,
): Promise<void> => {
  const columns = Math.max(1, Object.keys(rows[0] ?? {}).length);
  for (const chunk of chunks(rows, Math.max(1, Math.floor(MAX_PARAMETERS / columns)))) {
    await insert([...chunk]);
  }
};

type Remove = (ids: string[]) => Promise<unknown>;

const deleteChunked = async (ids: ReadonlySet<string>, remove: Remove): Promise<void> => {
  for (const chunk of chunks([...ids], MAX_PARAMETERS)) {
    await remove([...chunk]);
  }
};

const taskRows = (state: CoreState, tasks: readonly Task[]) => ({
  subtasks: tasks.flatMap((task) => subtaskRows(task)),
  tasks: tasks.map((task) => taskRow(state, task)),
});

/** Every row from scratch: after a rebuild nothing can be assumed about what changed. */
export const rewriteProjections = async (db: Db, state: CoreState): Promise<void> => {
  await db.delete(schema.subtasks);
  await db.delete(schema.tasks);
  await db.delete(schema.projects);
  await db.delete(schema.presets);
  const rows = taskRows(state, Object.values(state.tasks.byId));
  await insertChunked(rows.tasks, (chunk) => db.insert(schema.tasks).values(chunk));
  await insertChunked(rows.subtasks, (chunk) => db.insert(schema.subtasks).values(chunk));
  const projects = Object.values(state.projects.byId).map(projectRow);
  await insertChunked(projects, (chunk) => db.insert(schema.projects).values(chunk));
  const presets = Object.values(state.presets.byId).map(presetRow);
  await insertChunked(presets, (chunk) => db.insert(schema.presets).values(chunk));
};

const present = <T>(byId: Readonly<Record<string, T>>, ids: ReadonlySet<string>): readonly T[] =>
  Object.entries(byId)
    .filter(([id]) => ids.has(id))
    .map(([, value]) => value);

const updateTasks = async (db: Db, state: CoreState, ids: ReadonlySet<string>): Promise<void> => {
  if (ids.size === 0) {
    return;
  }
  await deleteChunked(ids, (list) =>
    db.delete(schema.subtasks).where(inArray(schema.subtasks.taskId, list)),
  );
  await deleteChunked(ids, (list) => db.delete(schema.tasks).where(inArray(schema.tasks.id, list)));
  const rows = taskRows(state, present(state.tasks.byId, ids));
  await insertChunked(rows.tasks, (chunk) => db.insert(schema.tasks).values(chunk));
  await insertChunked(rows.subtasks, (chunk) => db.insert(schema.subtasks).values(chunk));
};

const updateProjects = async (
  db: Db,
  state: CoreState,
  ids: ReadonlySet<string>,
): Promise<void> => {
  if (ids.size === 0) {
    return;
  }
  await deleteChunked(ids, (list) =>
    db.delete(schema.projects).where(inArray(schema.projects.id, list)),
  );
  const rows = present(state.projects.byId, ids).map(projectRow);
  await insertChunked(rows, (chunk) => db.insert(schema.projects).values(chunk));
};

const updatePresets = async (db: Db, state: CoreState, ids: ReadonlySet<string>): Promise<void> => {
  if (ids.size === 0) {
    return;
  }
  await deleteChunked(ids, (list) =>
    db.delete(schema.presets).where(inArray(schema.presets.id, list)),
  );
  const rows = present(state.presets.byId, ids).map(presetRow);
  await insertChunked(rows, (chunk) => db.insert(schema.presets).values(chunk));
};

/** Rewrites only the rows a batch touched (the incremental path). */
export const updateProjections = async (
  db: Db,
  state: CoreState,
  touched: Touched,
): Promise<void> => {
  await updateTasks(db, state, touched.taskIds);
  await updateProjects(db, state, touched.projectIds);
  await updatePresets(db, state, touched.presetIds);
};
