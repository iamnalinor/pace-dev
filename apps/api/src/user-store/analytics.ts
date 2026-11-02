import {
  coreReducer,
  err,
  type Event,
  INITIAL_CORE_STATE,
  INITIAL_POOL_MEMORY,
  materializeAt,
  type NewNotification,
  ok,
  type PoolMemory,
  poolPass,
  type Result,
} from "@pace/core";

import type {
  SimulatedMessage,
  Simulation,
  SimulationArgs,
  SqlError,
  SqlRows,
  TableSchema,
} from "../shared/contract.ts";

import { SERVER_TZ } from "./notifier.ts";

/** At most this many rows come back from `query_sql`; one more tells that it was cut. */
export const ROW_LIMIT = 500;

/** Statements and keywords that change something or reach outside the store. */
const FORBIDDEN =
  /\b(?:alter|analyze|attach|begin|commit|create|delete|detach|drop|insert|pragma|reindex|release|replace|rollback|savepoint|update|upsert|vacuum)\b/iu;

/**
Tables no query reads and the schema does not list: when the phone was unlocked, minute by minute,
is for automatic sleep only, never for a connected AI app. Matched anywhere in the text, string
literals included (SQLite takes `FROM 'phone_uses'` for the table) and in any case.
*/
const PRIVATE_TABLES = ["phone_uses"] as const;

const privateTableIn = (sql: string): string | undefined =>
  PRIVATE_TABLES.find((table) => sql.toLowerCase().includes(table));

/**
String literals are data: a quoted 'update' must not trip the keyword check. Nor does the
string function `replace(…)`, unlike the REPLACE statement.
*/
const withoutStrings = (sql: string): string =>
  sql.replaceAll(/'(?:[^']|'')*'/gu, "''").replaceAll(/\breplace\s*\(/giu, "fn(");

/**
Only one `SELECT` (or `WITH … SELECT`): no second statement, no write or schema keyword,
wrapped so at most `ROW_LIMIT + 1` rows are read.
*/
export const guardSql = (sql: string): Result<string, SqlError> => {
  const text = sql.trim().replace(/;\s*$/u, "");
  const bare = withoutStrings(text);
  if (bare.includes(";")) {
    return err({ code: "sql/forbidden", message: "One statement only." });
  }
  if (!/^(?:select|with)\b/iu.test(text)) {
    return err({ code: "sql/not-select", message: "Only SELECT (or WITH … SELECT) is allowed." });
  }
  const hidden = privateTableIn(text);
  if (hidden !== undefined) {
    return err({ code: "sql/forbidden", message: `"${hidden}" is private to the store.` });
  }
  const keyword = FORBIDDEN.exec(bare);
  return keyword === null
    ? ok(`SELECT * FROM (${text}) LIMIT ${String(ROW_LIMIT + 1)}`)
    : err({ code: "sql/forbidden", message: `"${keyword[0]}" is not allowed: read only.` });
};

/** Thrown inside the transaction so it always rolls back, whatever the query did. */
const ROLLBACK = new Error("read-only: rolled back");

/** Runs a guarded query in a transaction that is always rolled back. */
export const runReadOnly = (
  storage: DurableObjectStorage,
  sql: string,
): Result<SqlRows, SqlError> => {
  const guarded = guardSql(sql);
  if (!guarded.ok) {
    return guarded;
  }
  const captured: { value?: SqlRows } = {};
  try {
    storage.transactionSync(() => {
      const cursor = storage.sql.exec(guarded.value);
      const objects = cursor.toArray();
      const columns = cursor.columnNames;
      const rows = objects.map((row) => columns.map((column) => row[column] ?? null));
      captured.value = {
        columns,
        rows: rows.slice(0, ROW_LIMIT),
        truncated: rows.length > ROW_LIMIT,
      };
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) {
      return err({ code: "sql/failed", message: String(error) });
    }
  }
  return captured.value === undefined
    ? err({ code: "sql/failed", message: "The query returned nothing." })
    : ok(captured.value);
};

/** The tables a query may read and how they were created (internal and private ones left out). */
export const describeTables = (storage: DurableObjectStorage): readonly TableSchema[] =>
  [
    ...storage.sql.exec<{ name: string; sql: string }>(
      String.raw`SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\_%' ESCAPE '\' ORDER BY name`,
    ),
  ].filter((table) => privateTableIn(table.name) === undefined);

/** A simulation never steps more than this many times. */
const MAX_STEPS = 500;

const describeMessage = (message: NewNotification): Omit<SimulatedMessage, "at"> => {
  switch (message.kind) {
    case "deadline_digest": {
      return {
        kind: message.kind,
        taskId: null,
        text: `Deadlines: ${message.payload.tasks.map((task) => task.title).join(", ")}`,
      };
    }
    case "activity_overrun": {
      const { expectMinutes, label } = message.payload;
      return {
        kind: message.kind,
        taskId: null,
        text: `${label}: still going past its ${String(expectMinutes)} min`,
      };
    }
    case "event_start": {
      return { kind: message.kind, taskId: null, text: `${message.payload.title} starts` };
    }
    case "login": {
      return { kind: message.kind, taskId: null, text: `Sign-in: ${message.payload.name}` };
    }
  }
};

const stateAt = (events: readonly Event[], at: string) =>
  materializeAt(events, at, { initial: INITIAL_CORE_STATE, reducer: coreReducer });

/**
Replays the notification pool over the log from `from` to `to`: the deadline digests and the
"still doing X?" asks, at each instant the server would have woken up (from a fresh memory, so
earlier sends are not known; the calendar is not replayed). Reads only.
*/
export const simulate = (events: readonly Event[], { from, to }: SimulationArgs): Simulation => {
  const messages: SimulatedMessage[] = [];
  let memory: PoolMemory = INITIAL_POOL_MEMORY;
  let at: null | string = from;
  let steps = 0;
  while (at !== null && at <= to && steps < MAX_STEPS) {
    const state = stateAt(events, at);
    const pass = poolPass({
      calendar: [],
      memory,
      now: at,
      open: [],
      ruledSeries: [],
      state,
      zone: state.settings.timezone ?? SERVER_TZ,
    });
    const when: string = at;
    messages.push(...pass.created.map((message) => ({ at: when, ...describeMessage(message) })));
    memory = pass.memory;
    at = pass.nextAt;
    steps += 1;
  }
  return { isCut: steps >= MAX_STEPS, messages };
};
