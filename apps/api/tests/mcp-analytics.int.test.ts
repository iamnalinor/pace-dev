import { describe, expect, it } from "vitest";

import { mcpResult, obtainToken } from "./oauth-flow.ts";

type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
};

const ANALYTICS = {
  scope: "tasks:read tasks:write analytics:read",
  scopes: ["tasks:read", "tasks:write", "analytics:read"],
};

const call = async (
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> =>
  await mcpResult<ToolResult>(token, "tools/call", { arguments: args, name });

const ok = async (token: string, name: string, args: Record<string, unknown> = {}) => {
  const result = await call(token, name, args);
  if (result.isError === true) {
    throw new Error(`${name} failed: ${result.content[0]?.text ?? ""}`);
  }
  return result.structuredContent ?? {};
};

const hoursFromNow = (hours: number): string => {
  const at = Date.now() + hours * 3_600_000;
  return new Date(at).toISOString();
};

describe("MCP analytics tools", () => {
  it("describes the tables and answers a read-only SELECT", async () => {
    const token = (await obtainToken(ANALYTICS)).tokens.access_token;
    await ok(token, "create_task", { title: "Write the report" });
    const { tables } = await ok(token, "describe_schema");
    expect((tables as { name: string }[]).map((table) => table.name)).toEqual(
      expect.arrayContaining(["decisions", "events", "tasks"]),
    );
    const answer = await ok(token, "query_sql", {
      sql: "SELECT title, status FROM tasks WHERE title = 'Write the report'",
    });
    expect(answer).toEqual({
      columns: ["title", "status"],
      rows: [["Write the report", "not_started"]],
      truncated: false,
    });
  });

  it("refuses anything but one SELECT and leaves no trace of a write", async () => {
    const token = (await obtainToken(ANALYTICS)).tokens.access_token;
    await ok(token, "create_task", { title: "Keep me" });
    for (const sql of [
      "DELETE FROM tasks",
      "SELECT 1; DELETE FROM tasks",
      "PRAGMA table_info(tasks)",
      "WITH gone AS (SELECT 1) UPDATE tasks SET title = 'x'",
    ]) {
      const result = await call(token, "query_sql", { sql });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/^sql\/(?:forbidden|not-select)/u);
    }
    // A quoted keyword is data, not a statement.
    const quoted = await ok(token, "query_sql", {
      sql: "SELECT count(*) AS n FROM tasks WHERE title = 'Keep me' AND title <> 'update; drop'",
    });
    expect(quoted["rows"]).toEqual([[1]]);
  });

  it("replays the reminders over a range and ranks Now with other weights", async () => {
    const token = (await obtainToken(ANALYTICS)).tokens.access_token;
    await ok(token, "create_task", { importance: "nice_to_have", title: "Someday" });
    await ok(token, "create_task", { importance: "normal", title: "Regular" });
    const result = await ok(token, "simulate", {
      from: hoursFromNow(-1),
      multipliers: { nice_to_have: 50 },
      to: hoursFromNow(0),
    });
    const ranking = result["ranking"] as { title: string; score: number; simulatedScore: number }[];
    const titles = ranking.map((row) => row.title);
    // A nice-to-have weighted 50 now outranks a normal task.
    expect(titles.indexOf("Someday")).toBeLessThan(titles.indexOf("Regular"));
    const someday = ranking.find((row) => row.title === "Someday");
    expect(someday?.simulatedScore).toBeGreaterThan(someday?.score ?? 0);
    const tooLong = await call(token, "simulate", {
      from: hoursFromNow(-24 * 40),
      to: hoursFromNow(0),
    });
    expect(tooLong.content[0]?.text).toMatch(/^simulate\/range/u);
  });

  it("exports the log as NDJSON a page at a time", async () => {
    const token = (await obtainToken(ANALYTICS)).tokens.access_token;
    await ok(token, "create_task", { title: "One" });
    await ok(token, "create_task", { title: "Two" });
    const first = await call(token, "export_all", { limit: 1 });
    expect(first.structuredContent).toMatchObject({ count: 1, more: true });
    const line = JSON.parse(first.content[0]?.text ?? "{}") as { type: string };
    expect(line.type).toBe("task.created");
    const rest = await ok(token, "export_all", {
      since: first.structuredContent?.["seq"] as number,
    });
    expect(rest["more"]).toBe(false);
  });
});
