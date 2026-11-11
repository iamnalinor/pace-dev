import type { Scheduler } from "./scheduler.ts";

/** Durable values owned by one actor. Values must support structured cloning. */
export type ActorValues = {
  readonly get: <T = unknown>(key: string) => Promise<T | undefined>;
  readonly put: (key: string, value: unknown) => Promise<void>;
  readonly delete: {
    (key: string): Promise<boolean>;
    (keys: string[]): Promise<number>;
  };
  readonly list: <T = unknown>(options: { readonly prefix: string }) => Promise<Map<string, T>>;
};

export type SqliteValue = ArrayBuffer | null | number | string;
export type SqliteCursor<Row> = Iterable<Row> & {
  readonly columnNames: string[];
  readonly toArray: () => Row[];
};

/** Actor-local SQLite, durable values and its persistent scheduler. */
export type ActorStorage = ActorValues &
  Scheduler & {
    readonly deleteAll: () => Promise<void>;
    readonly transactionSync: <T>(body: () => T) => T;
    readonly sql: {
      readonly exec: <Row extends Record<string, SqliteValue> = Record<string, SqliteValue>>(
        query: string,
        ...bindings: SqliteValue[]
      ) => SqliteCursor<Row>;
    };
  };
