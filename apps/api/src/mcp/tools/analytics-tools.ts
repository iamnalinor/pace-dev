import { z } from "zod";

import { defineTool } from "../registry.ts";
import { failure, success } from "../tool-kit.ts";

const READ = { destructiveHint: false, idempotentHint: true, readOnlyHint: true };

const TABLE = z.object({ name: z.string(), sql: z.string() });
const ROW = z.array(z.unknown());
const RECORD = z.record(z.string(), z.unknown());
const SQL_INPUT = z.string().min(1).max(4000).describe("One SELECT statement.");

/** A simulation covers at most a month: each step re-materializes the log. */
const MAX_SIMULATION_MS = 31 * 24 * 60 * 60 * 1000;

/** The store's tables, so a client can write `query_sql` against them. */
export const describeSchema = defineTool({
  annotations: READ,
  description:
    "Lists the tables query_sql can read (events: the immutable log with JSON payloads; tasks, subtasks, projects, presets: projections of the current state; decisions: why reminders were or were not sent; observations) with their CREATE statements. Times are ISO 8601 UTC text.",
  handler: async (_args, ctx) => {
    const tables = await ctx.store.describeSchema();
    return success(
      { tables: [...tables] },
      tables.map((table) => `${table.name}: ${table.sql}`).join("\n\n"),
    );
  },
  input: {},
  name: "describe_schema",
  output: { tables: z.array(TABLE) },
  scope: "analytics:read",
  title: "Describe schema",
});

/** Free-form questions over the store: one SELECT, read only, at most 500 rows. */
export const querySql = defineTool({
  annotations: READ,
  description:
    "Runs one read-only SQLite query (SELECT or WITH … SELECT; no semicolons, PRAGMA, ATTACH or writes) over the tables describe_schema lists and returns at most 500 rows. It runs in a transaction that is always rolled back. Use json_extract(payload, '$.field') on events.",
  handler: async (args, ctx) => {
    const result = await ctx.store.querySql(args.sql);
    if (!result.ok) {
      return failure(result.error.code, result.error.message);
    }
    const { columns, rows, truncated } = result.value;
    return success(
      { columns: [...columns], rows: rows.map((row) => [...row]), truncated },
      [
        columns.join("\t"),
        ...rows.map((row) => row.map((cell) => JSON.stringify(cell)).join("\t")),
        ...(truncated ? ["… (cut at 500 rows)"] : []),
      ].join("\n"),
    );
  },
  input: { sql: SQL_INPUT },
  name: "query_sql",
  output: {
    columns: z.array(z.string()),
    rows: z.array(ROW),
    truncated: z.boolean(),
  },
  scope: "analytics:read",
  title: "Query (SQL, read only)",
});

/** What the notifier would have sent over a past range. */
export const simulateTool = defineTool({
  annotations: READ,
  description:
    "Replays the reminder rules over the log from `from` to `to` (at most 31 days): every digest, critical alert, stuck report and Limit alert the notifier would send, starting from a fresh memory. Writes nothing.",
  handler: async (args, ctx) => {
    const span = Date.parse(args.to) - Date.parse(args.from);
    if (span <= 0 || span > MAX_SIMULATION_MS) {
      return failure("simulate/range", "`to` must be after `from` and at most 31 days later.");
    }
    const simulation = await ctx.store.simulate({ from: args.from, to: args.to });
    return success(
      {
        isCut: simulation.isCut,
        messages: simulation.messages.map((message) => ({ ...message })),
      },
      [
        `${String(simulation.messages.length)} notifications:`,
        ...simulation.messages.map((message) => `- ${message.at} ${message.text}`),
      ].join("\n"),
    );
  },
  input: {
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  },
  name: "simulate",
  output: {
    isCut: z.boolean(),
    messages: z.array(RECORD),
  },
  scope: "analytics:read",
  title: "Simulate reminders",
});

/** The whole log as NDJSON, a page at a time. */
export const exportAll = defineTool({
  annotations: READ,
  description:
    "Exports the immutable event log as NDJSON (one JSON event per line, corrections included) after the sequence number `since` (default 0), up to `limit` events (default 1000). When `more` is true, call again with `since` set to the returned `seq`.",
  handler: async (args, ctx) => {
    const page = await ctx.store.list(args.since ?? 0, args.limit ?? 1000);
    return success(
      { count: page.events.length, more: page.more, seq: page.seq },
      page.events.map((event) => JSON.stringify(event)).join("\n"),
    );
  },
  input: {
    since: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(5000).optional(),
  },
  name: "export_all",
  output: { count: z.number(), more: z.boolean(), seq: z.number() },
  scope: "analytics:read",
  title: "Export the event log",
});
