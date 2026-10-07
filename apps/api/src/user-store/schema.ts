import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The append-only event log: the source of truth for everything the user did. */
export const events = sqliteTable(
  "events",
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    id: text().notNull().unique(),
    type: text().notNull(),
    occurredAt: text().notNull(),
    recordedAt: text().notNull(),
    deviceId: text().notNull(),
    precision: text().notNull(),
    source: text().notNull(),
    payload: text().notNull(),
  },
  (table) => [index("events_occurred_idx").on(table.occurredAt)],
);

/** High-volume phone observations (usage, calendar) — facts, not decisions; never events. */
export const observations = sqliteTable(
  "observations",
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    kind: text().notNull(),
    key: text().notNull(),
    at: text().notNull(),
    payload: text().notNull(),
  },
  (table) => [index("observations_kind_key_idx").on(table.kind, table.key)],
);

/** Every automatic decision with its inputs, so "why?" can be answered later. */
export const decisions = sqliteTable(
  "decisions",
  {
    id: text().primaryKey(),
    at: text().notNull(),
    kind: text().notNull(),
    taskId: text(),
    rule: text().notNull(),
    inputs: text().notNull(),
    outcome: text().notNull(),
    explanation: text().notNull(),
  },
  (table) => [index("decisions_task_idx").on(table.taskId), index("decisions_at_idx").on(table.at)],
);

/** Small key/value state of the store (last digest time, budgets, cursors). */
export const meta = sqliteTable("meta", {
  key: text().primaryKey(),
  value: text().notNull(),
});

/**
Projections of the materialized state for SQL readers (stage 3 analytics, debugging).
Rewritten by the store after every append; never the source of truth.
*/
export const tasks = sqliteTable(
  "tasks",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    presetId: text().notNull(),
    projectId: text(),
    /** The effective importance: the task's own, else the preset default. */
    importance: text().notNull(),
    status: text().notNull(),
    dueAt: text(),
    dueTz: text(),
    startAt: text(),
    createdAt: text().notNull(),
    closedAt: text(),
    /** Derived outcome (`done_late` included); null while open. */
    outcome: text(),
    /** 0..1 in the preset's progress mode. */
    progress: real().notNull(),
    estimateMinutes: integer(),
    touched: integer({ mode: "boolean" }).notNull(),
    /** The task's `lastEventAt`. */
    updatedAt: text().notNull(),
  },
  (table) => [
    index("tasks_project_idx").on(table.projectId),
    index("tasks_status_idx").on(table.status),
    index("tasks_due_idx").on(table.dueAt),
  ],
);

export const subtasks = sqliteTable(
  "subtasks",
  {
    id: text().notNull(),
    taskId: text().notNull(),
    number: integer(),
    label: text().notNull(),
    solvedAt: text(),
    submittedAt: text(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.id] })],
);

export const projects = sqliteTable("projects", {
  id: text().primaryKey(),
  name: text().notNull(),
  color: text(),
  archived: integer({ mode: "boolean" }).notNull(),
  createdAt: text().notNull(),
});

export const presets = sqliteTable("presets", {
  id: text().primaryKey(),
  name: text().notNull(),
  extends: text(),
  builtIn: integer({ mode: "boolean" }).notNull(),
  archived: integer({ mode: "boolean" }).notNull(),
  /** The preset's own definition (what it changes relative to its parent), as JSON. */
  definition: text().notNull(),
});
