import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";

import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/** Test double for `expo-sqlite`: the subset the event store uses, on a real in-memory SQLite. */
export type FakeSqlite = {
  /** What `openDatabaseAsync` should resolve to; counts the call. */
  readonly open: () => SQLiteDatabase;
  /** Every statement passed to `execAsync`. */
  readonly executed: string[];
  /** Every statement passed to `prepareAsync`. */
  readonly prepared: string[];
  readonly opens: number;
  readonly transactions: number;
  /** A fresh empty database and zeroed counters. */
  readonly reset: () => void;
  readonly tables: () => readonly string[];
  readonly userVersion: () => number;
};

type Row = Record<string, unknown>;

const toParams = (params: SQLiteBindParams): Readonly<Record<string, SQLInputValue>> =>
  Array.isArray(params)
    ? Object.fromEntries(params.map((value, index) => [String(index + 1), value as SQLInputValue]))
    : (params as Readonly<Record<string, SQLInputValue>>);

export const createFakeSqlite = (): FakeSqlite => {
  const executed: string[] = [];
  const prepared: string[] = [];
  const count = { opens: 0, transactions: 0 };
  let engine = new DatabaseSync(":memory:");

  const database = {
    execAsync: async (source: string) => {
      executed.push(source);
      engine.exec(source);
    },
    getAllAsync: async <T>(source: string, params: SQLiteBindParams = []) =>
      engine.prepare(source).all(toParams(params)) as T[],
    getFirstAsync: async <T>(source: string, params: SQLiteBindParams = []) =>
      (engine.prepare(source).get(toParams(params)) as T | undefined) ?? null,
    prepareAsync: async (source: string) => {
      prepared.push(source);
      const statement = engine.prepare(source);
      return {
        executeAsync: async (params: SQLiteBindParams = []) => {
          const result = statement.run(toParams(params));
          return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
        },
        finalizeAsync: async () => undefined,
      };
    },
    runAsync: async (source: string, params: SQLiteBindParams = []) => {
      const result = engine.prepare(source).run(toParams(params));
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    withExclusiveTransactionAsync: async (task: (txn: SQLiteDatabase) => Promise<void>) => {
      count.transactions += 1;
      engine.exec("BEGIN");
      try {
        await task(database as unknown as SQLiteDatabase);
        engine.exec("COMMIT");
      } catch (error) {
        engine.exec("ROLLBACK");
        throw error;
      }
    },
  };

  return {
    executed,
    open: () => {
      count.opens += 1;
      return database as unknown as SQLiteDatabase;
    },
    get opens() {
      return count.opens;
    },
    prepared,
    reset: () => {
      engine.close();
      engine = new DatabaseSync(":memory:");
      executed.length = 0;
      prepared.length = 0;
      count.opens = 0;
      count.transactions = 0;
    },
    tables: () =>
      engine
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => String((row as Row)["name"])),
    get transactions() {
      return count.transactions;
    },
    userVersion: () => Number((engine.prepare("PRAGMA user_version").get() as Row)["user_version"]),
  };
};
