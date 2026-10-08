import {
  coreReducer,
  err,
  evaluateNotifications,
  type Event,
  INITIAL_CORE_STATE,
  INITIAL_NOTIFY_MEMORY,
  materializeAt,
  type NotifyMemory,
  type NotifyMessage,
  nowList,
  ok,
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

/** The tables a query may read and how they were created (internal ones left out). */
export const describeTables = (storage: DurableObjectStorage): readonly TableSchema[] =>
  storage.sql
    .exec<{ name: string; sql: string }>(
      String.raw`SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\_%' ESCAPE '\' ORDER BY name`,
    )
    .toArray();

/** A simulation never steps more than this many times. */
const MAX_STEPS = 500;

const describeMessage = (message: NotifyMessage): Omit<SimulatedMessage, "at"> => {
  switch (message.kind) {
    case "critical": {
      return {
        kind: "critical",
        taskId: message.taskId,
        text: `${message.title}: critical (${message.rule})`,
      };
    }
    case "digest": {
      return {
        kind: "digest",
        taskId: null,
        text:
          message.top.length === 0
            ? "Digest: nothing on top"
            : `Digest: ${message.top.map((row) => row.title).join(", ")}`,
      };
    }
    case "limit": {
      return {
        kind: "limit",
        taskId: null,
        text: `${message.label} past its ${String(message.limitMinutes)} min limit`,
      };
    }
    case "stuck": {
      return {
        kind: "stuck",
        taskId: message.taskId,
        text: `${message.title}: stuck (${message.rule}, ${String(message.days)} d)`,
      };
    }
  }
};

const stateAt = (events: readonly Event[], at: string) =>
  materializeAt(events, at, { initial: INITIAL_CORE_STATE, reducer: coreReducer });

/**
Replays the notification rules over the log from `from` to `to`, evaluating at each instant
the notifier would have woken up (from a fresh memory, so earlier sends are not known), and
ranks Now at `to` with optional importance multipliers. Reads only.
*/
export const simulate = (
  events: readonly Event[],
  { from, multipliers = {}, to }: SimulationArgs,
): Simulation => {
  const messages: SimulatedMessage[] = [];
  let memory: NotifyMemory = INITIAL_NOTIFY_MEMORY;
  let at: null | string = from;
  let steps = 0;
  while (at !== null && at <= to && steps < MAX_STEPS) {
    const evaluation = evaluateNotifications(
      stateAt(events, at),
      { deviceTz: SERVER_TZ, now: at },
      memory,
    );
    const when: string = at;
    messages.push(
      ...evaluation.messages.map((message) => ({ at: when, ...describeMessage(message) })),
    );
    memory = evaluation.memory;
    at = evaluation.nextAt;
    steps += 1;
  }
  const ranking = nowList(stateAt(events, to), { deviceTz: SERVER_TZ, now: to })
    .items.map((item) => ({
      importance: item.importance,
      score: item.score.score,
      simulatedScore:
        (multipliers[item.importance] ?? item.score.multiplier) * item.score.urgency +
        item.score.rankBonus,
      taskId: item.task.id,
      title: item.task.title,
      urgency: item.score.urgency,
    }))
    .toSorted((a, b) => b.simulatedScore - a.simulatedScore);
  return { isCut: steps >= MAX_STEPS, messages, ranking };
};
