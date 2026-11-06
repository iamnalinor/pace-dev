import {
  type AnySQLiteColumn,
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const dailyDimensions = () => ({
  storeId: text().notNull(),
  zone: text().notNull(),
  day: text().notNull(),
  deviceId: text().notNull(),
});

const dailyPrimaryKey = (
  table: Readonly<Record<keyof ReturnType<typeof dailyDimensions>, AnySQLiteColumn>>,
) => [primaryKey({ columns: [table.storeId, table.zone, table.day, table.deviceId] })];

/** Derived history cache only; one complete snapshot replaces its predecessor atomically. */
export const historyCheckpoint = sqliteTable("history_checkpoint", {
  id: integer().primaryKey(),
  format: integer().notNull(),
  build: text().notNull(),
  storeId: text().notNull(),
  coveredSeq: integer().notNull(),
  cutoff: text().notNull(),
  cutoffTimezone: text().notNull(),
  eventCount: integer().notNull(),
  byteCount: integer().notNull(),
  chunkCount: integer().notNull(),
  sha256: text().notNull(),
});

/** UTF-8 bytes, split before SQL binding so growing snapshots never exceed a value limit. */
export const historyCheckpointChunks = sqliteTable("history_checkpoint_chunks", {
  chunk: integer().primaryKey(),
  data: blob({ mode: "buffer" }).notNull(),
});

/** Crash-safe copy operations; source rows are never removed by this journal. */
export const historyArchiveOperations = sqliteTable("_history_archive_operations", {
  id: text().primaryKey(),
  owner: text().notNull(),
  storeId: text().notNull(),
  month: text().notNull(),
  sourceSchemaTag: text().notNull(),
  capturedThroughSeq: integer().notNull(),
  rawRevision: integer().notNull(),
  eventSeq: integer().notNull(),
  monthRawRevision: integer().notNull(),
  stage: text().notNull(),
  manifest: text().notNull(),
  manifestKey: text().notNull(),
  attempts: integer().notNull().default(0),
  nextAttemptAt: integer().notNull().default(0),
  error: text(),
});
export const historyArchiveChunks = sqliteTable(
  "_history_archive_chunks",
  {
    operationId: text().notNull(),
    chunk: integer().notNull(),
    data: blob({ mode: "buffer" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.operationId, table.chunk] })],
);
export const historyArchiveManifests = sqliteTable("_history_archive_manifests", {
  operationId: text().primaryKey(),
  manifestKey: text().notNull().unique(),
  month: text().notNull(),
  manifest: text().notNull(),
});
export const historyArchiveMonths = sqliteTable("_history_archive_months", {
  month: text().primaryKey(),
  rawRevision: integer().notNull().default(0),
  activeOperationId: text(),
  blockedFingerprint: text(),
  blockedError: text(),
});
export const historyRawState = sqliteTable("_history_raw_state", {
  id: integer().primaryKey(),
  revision: integer().notNull(),
});
export const historyRawRevisions = sqliteTable(
  "_history_raw_revisions",
  {
    kind: text().notNull(),
    rowKey: text().notNull(),
    month: text().notNull(),
    revision: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.rowKey] }),
    index("history_raw_month_idx").on(table.month),
  ],
);
export const usageDailyApps = sqliteTable(
  "usage_daily_apps",
  {
    ...dailyDimensions(),
    app: text().notNull(),
    milliseconds: integer().notNull(),
    firstAt: text().notNull(),
    lastAt: text().notNull(),
    deviceNames: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.zone, table.day, table.deviceId, table.app] }),
  ],
);
export const usageDailyDevices = sqliteTable(
  "usage_daily_devices",
  {
    ...dailyDimensions(),
    deviceName: text().notNull(),
    milliseconds: integer().notNull(),
  },
  (table) => dailyPrimaryKey(table),
);
export const historyPhoneDaily = sqliteTable(
  "_history_phone_daily",
  {
    ...dailyDimensions(),
    milliseconds: integer().notNull(),
  },
  (table) => dailyPrimaryKey(table),
);
export const historyUsageState = sqliteTable("_history_usage_state", {
  id: integer().primaryKey(),
  zone: text().notNull(),
  throughDay: text().notNull(),
});
