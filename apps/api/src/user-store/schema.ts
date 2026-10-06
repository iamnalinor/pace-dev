import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
