import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/** SQLite query builders shared by adapters; no promise of another SQL dialect. */
export type SqliteDatabase<
  Mode extends "async" | "sync",
  Schema extends Record<string, unknown>,
> = Pick<
  BaseSQLiteDatabase<Mode, unknown, Schema>,
  "delete" | "insert" | "query" | "select" | "update"
>;

/** A shared SQLite database. A batch is atomic: all statements commit, or none do. */
export type SqlDatabase<Schema extends Record<string, unknown>> = SqliteDatabase<
  "async",
  Schema
> & {
  readonly batch: <Item extends BatchItem<"sqlite">, Queries extends readonly [Item, ...Item[]]>(
    queries: Queries,
  ) => Promise<BatchResponse<Queries>>;
};
