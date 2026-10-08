import { describe, expect, it } from "vitest";

import { mcpResult, obtainToken } from "./oauth-flow.ts";

type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
};

const ALL = {
  scope: "tasks:read tasks:write time:read time:write",
  scopes: ["tasks:read", "tasks:write", "time:read", "time:write"],
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

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

describe("MCP time tools", () => {
  it("starts from a button, switches, stops, and shows the day", async () => {
    const token = (await obtainToken(ALL)).tokens.access_token;
    const { buttons } = await ok(token, "list_activity_buttons");
    expect(buttons).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "btn:food", label: "Food" })]),
    );

    await ok(token, "start_activity", { at: minutesAgo(90), buttonId: "btn:work" });
    await ok(token, "start_activity", { at: minutesAgo(30), category: "food", label: "Lunch" });
    await ok(token, "stop_activity");
    expect((await call(token, "stop_activity")).content[0]?.text).toMatch(
      /^activity\/none-running/u,
    );

    const day = await ok(token, "get_day");
    const labels = (day["segments"] as { label: string; minutes: number }[]).map((segment) => [
      segment.label,
      segment.minutes,
    ]);
    expect(labels).toEqual([
      ["Work", 60],
      ["Lunch", 30],
    ]);
    expect(day["running"]).toBeNull();
  });

  it("logs a past block that wins over live time and sums it by category", async () => {
    const token = (await obtainToken(ALL)).tokens.access_token;
    await ok(token, "log_activity", {
      category: "study",
      endAt: minutesAgo(60),
      label: "Lecture",
      startAt: minutesAgo(150),
    });
    expect(
      (
        await call(token, "log_activity", {
          category: "study",
          endAt: minutesAgo(90),
          label: "x",
          startAt: minutesAgo(60),
        })
      ).content[0]?.text,
    ).toMatch(/^activity\/bad-range/u);
    const summary = await ok(token, "summary_time", {
      from: minutesAgo(600),
      to: new Date().toISOString(),
    });
    expect(summary["byCategory"]).toEqual(
      expect.arrayContaining([{ category: "study", minutes: 90 }]),
    );
  });

  it("asks for the time scopes", async () => {
    const token = (await obtainToken({ scope: "tasks:read", scopes: ["tasks:read"] })).tokens
      .access_token;
    const result = await call(token, "start_activity", { label: "Work" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/time:write/u);
  });
});
