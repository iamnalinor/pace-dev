import { describe, expect, it } from "vitest";

import { newId } from "@pace/core";

import { call, json, loginAsDev, readJson } from "./helpers.ts";
import { mcpCall, obtainToken } from "./oauth-flow.ts";

const taskCreated = () => ({
  deviceId: "dev-1",
  id: newId(),
  occurredAt: "2026-10-06T09:00:00.000Z",
  payload: { fields: {}, presetId: "work", subtasks: [], taskId: newId(), title: "t" },
  precision: "exact",
  recordedAt: "2026-10-06T09:00:01.000Z",
  source: "app",
  type: "task.created",
});

describe("DELETE /api/me", () => {
  it("removes the account: its events, sessions and user; the next login starts empty", async () => {
    const token = await loginAsDev("1002");
    const me = await json<{ id: string }>("/api/me", { token });
    await json("/api/sync/push", { body: { events: [taskCreated()] }, token });
    const other = await loginAsDev("1002");

    const response = await call("/api/me", { method: "DELETE", token });
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ deleted: true });

    expect((await call("/api/me", { token })).status).toBe(401);
    // Every session of the account goes, not only the one that asked.
    expect((await call("/api/me", { token: other })).status).toBe(401);

    const fresh = await loginAsDev("1002");
    const again = await json<{ id: string }>("/api/me", { token: fresh });
    expect(again.id).not.toBe(me.id);
    const pulled = await json<{ events: unknown[] }>("/api/sync/pull", { token: fresh });
    expect(pulled.events).toEqual([]);
  });

  it("cuts off the MCP clients the account had connected", async () => {
    const { tokens } = await obtainToken({ devTelegramId: "1001" });
    expect((await mcpCall(tokens.access_token, "tools/list")).status).toBe(200);
    const token = await loginAsDev("1001");
    expect((await call("/api/me", { method: "DELETE", token })).status).toBe(200);
    expect((await mcpCall(tokens.access_token, "tools/list")).status).toBe(401);
  });

  it("needs a session", async () => {
    expect((await call("/api/me", { method: "DELETE" })).status).toBe(401);
  });
});
