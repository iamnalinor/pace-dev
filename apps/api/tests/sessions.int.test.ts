import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { endpoints, type Session } from "@pace/core";

import { findUserIdByTelegramId } from "../src/auth/users.ts";
import { d1 } from "../src/shared/db/d1.ts";
import { answerOf, call, json, loginAsDev, nonceLogin, readJson } from "./helpers.ts";
import { mcpCall, obtainToken } from "./oauth-flow.ts";

/* eslint-disable sonarjs/no-hardcoded-ip -- the addresses Cloudflare reports are these tests' fixture */
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const OKHTTP = "okhttp/4.12.0";

type Problem = { readonly code: string };

/** A request as Cloudflare hands it over: its address, country and city, and the client's UA. */
const from = (ip: string, userAgent: string, cf: { city: string; country: string }) => ({
  cf,
  headers: { "CF-Connecting-IP": ip, "User-Agent": userAgent },
});

const userIdOf = async (telegramId: string): Promise<string> =>
  (await findUserIdByTelegramId(d1(env.DB), telegramId)) ?? "";

/**
Ends every session and grant the account has: D1 and KV are shared by the whole file, and each
test counts what it made itself.
*/
const freshAccount = async (telegramId: string): Promise<void> => {
  const userId = await userIdOf(telegramId);
  await env.DB.prepare("delete from sessions where user_id = ?").bind(userId).run();
  const { keys } = await env.OAUTH_KV.list({ prefix: `grant:${userId}:` });
  await Promise.all(
    keys.map(async (key) => {
      await env.OAUTH_KV.delete(key.name);
    }),
  );
};

const list = async (token: string): Promise<readonly Session[]> =>
  (await answerOf(endpoints.sessions.list, "/api/sessions", { token })).sessions;

const revoke = async (id: string, token: string): Promise<Response> =>
  await call(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE", token });

const createAgent = async (token: string, name: string) =>
  await answerOf(endpoints.sessions.createAgent, "/api/sessions/agents", {
    body: { name },
    token,
  });

const usage = (deviceId: string, endAt: string) => ({
  deviceId,
  deviceName: "Ignored",
  sessions: [{ app: "code", endAt, startAt: "2026-10-06T08:00:00.000Z" }],
});

/** A deep-link login from the app, named by the phone: the bot binds it, the app polls it. */
const appLogin = async (telegramId: string, deviceId: string): Promise<string> =>
  await nonceLogin(telegramId, {
    deviceId,
    from: "app",
    request: from("5.6.7.8", OKHTTP, { city: "Hamburg", country: "DE" }),
  });

describe("GET /api/sessions", () => {
  it("lists the browsers, the app, the agents and the MCP apps, marking the caller's own", async () => {
    await loginAsDev("1001");
    await freshAccount("1001");
    const { token } = await json<{ token: string }>("/api/auth/dev", {
      body: { telegramId: "1001" },
      ...from("1.2.3.4", CHROME_MAC, { city: "Berlin", country: "DE" }),
    });
    const phone = await appLogin("1001", "pixel-1");
    const agent = await createAgent(token, "Linux Mint");
    await obtainToken({ devTelegramId: "1001" });

    // The agent files under its own session whatever it claims; the phone under its install id.
    await json("/api/usage/sessions", {
      body: usage("anything", "2026-10-06T09:30:00.000Z"),
      token: agent.token,
    });
    await json("/api/usage/sessions", {
      body: usage("anything", "2026-10-06T09:10:00.000Z"),
      token: agent.token,
    });
    await json("/api/usage/sessions", {
      body: usage("pixel-1", "2026-10-06T10:45:00.000Z"),
      token: phone,
    });

    const sessions = await list(token);
    expect(sessions).toHaveLength(4);
    const byKind = Object.fromEntries(sessions.map((session) => [session.kind, session]));
    expect(byKind["dev"]).toMatchObject({
      city: "Berlin",
      country: "DE",
      current: true,
      ip: "1.2.3.4",
      lastDataAt: null,
      name: "Dev login",
    });
    expect(byKind["app"]).toMatchObject({
      city: "Hamburg",
      country: "DE",
      current: false,
      ip: "5.6.7.8",
      lastDataAt: "2026-10-06T10:45:00.000Z",
      name: "Pixel 9a",
    });
    expect(byKind["agent"]).toMatchObject({
      current: false,
      id: agent.id,
      lastDataAt: "2026-10-06T09:30:00.000Z",
      name: "Linux Mint",
    });
    expect(byKind["mcp"]).toMatchObject({
      city: null,
      country: null,
      current: false,
      ip: null,
      lastDataAt: null,
      lastSeenAt: null,
      name: "Test MCP client",
      scopes: ["tasks:read"],
    });
    expect(byKind["mcp"]?.id).toMatch(/^mcp:./u);
    expect(byKind["mcp"]?.createdAt).toBeGreaterThan(Date.now() - 60_000);
    // Each sees itself as the current one.
    expect((await list(phone)).filter((session) => session.current).map((s) => s.kind)).toEqual([
      "app",
    ]);
  });

  it("answers 404 for the removed device and grant lists", async () => {
    const token = await loginAsDev("1001");
    expect((await call("/api/devices", { token })).status).toBe(404);
    expect((await call("/api/devices/01X", { method: "DELETE", token })).status).toBe(404);
    expect((await call("/api/oauth/grants", { token })).status).toBe(404);
    expect((await call("/api/oauth/grants/g1", { method: "DELETE", token })).status).toBe(404);
  });

  it("needs a full session: an agent's token may not list or revoke", async () => {
    const token = await loginAsDev("1001");
    const agent = await createAgent(token, "Office PC");
    expect((await call("/api/sessions")).status).toBe(401);
    expect((await call("/api/sessions", { token: agent.token })).status).toBe(403);
    expect((await revoke(agent.id, agent.token)).status).toBe(403);
  });
});

describe("POST /api/sessions/agents", () => {
  it("shows the token once and lists the computer as an agent", async () => {
    const token = await loginAsDev("1002");
    const agent = await createAgent(token, "Work laptop");
    expect(agent).toMatchObject({ name: "Work laptop" });
    expect(agent.token.length).toBeGreaterThan(20);
    const listed = (await json<{ sessions: unknown[] }>("/api/sessions", { token })).sessions;
    expect(JSON.stringify(listed)).not.toContain(agent.token);
    expect((await list(token)).find((session) => session.id === agent.id)).toMatchObject({
      kind: "agent",
      lastDataAt: null,
      name: "Work laptop",
    });
  });
});

describe("DELETE /api/sessions/:id", () => {
  it("disconnects an agent: its token stops uploading at once", async () => {
    const token = await loginAsDev("1001");
    const agent = await createAgent(token, "Linux Mint");
    const body = usage("anything", "2026-10-06T09:30:00.000Z");
    expect((await call("/api/usage/sessions", { body, token: agent.token })).status).toBe(200);
    const revoked = await revoke(agent.id, token);
    expect(revoked.status).toBe(200);
    expect(endpoints.sessions.revoke.output.parse(await readJson(revoked))).toEqual({ ok: true });
    expect((await call("/api/usage/sessions", { body, token: agent.token })).status).toBe(401);
    expect((await list(token)).map((session) => session.id)).not.toContain(agent.id);
  });

  it("revokes an MCP app's grant: gone from KV, and its token is refused", async () => {
    const { tokens } = await obtainToken({ devTelegramId: "1002" });
    const token = await loginAsDev("1002");
    const userId = await userIdOf("1002");
    const grants = (await list(token)).filter((session) => session.kind === "mcp");
    const grant = grants.at(-1);
    expect(grant).toBeDefined();
    const grantId = (grant?.id ?? "").slice("mcp:".length);
    expect(await env.OAUTH_KV.get(`grant:${userId}:${grantId}`)).not.toBeNull();
    // Someone else cannot revoke it.
    const other = await loginAsDev("1001");
    expect((await revoke(grant?.id ?? "", other)).status).toBe(404);

    expect((await revoke(grant?.id ?? "", token)).status).toBe(200);
    expect(await env.OAUTH_KV.get(`grant:${userId}:${grantId}`)).toBeNull();
    expect((await mcpCall(tokens.access_token, "initialize")).status).toBe(401);
    expect((await list(token)).map((session) => session.id)).not.toContain(grant?.id);
    const again = await revoke(grant?.id ?? "", token);
    expect(again.status).toBe(404);
    expect(await readJson<Problem>(again)).toMatchObject({ code: "session/not-found" });
  });

  it("answers 404 for a session of another account, which keeps working", async () => {
    const mine = await loginAsDev("1001");
    const theirs = await loginAsDev("1002");
    const theirId = (await list(theirs)).find((session) => session.current)?.id ?? "";
    const response = await revoke(theirId, mine);
    expect(response.status).toBe(404);
    expect(await readJson<Problem>(response)).toMatchObject({ code: "session/not-found" });
    expect((await call("/api/me", { token: theirs })).status).toBe(200);
    expect((await revoke("mcp:no-such-grant", mine)).status).toBe(404);
  });

  it("ends the current session too: that is logging out", async () => {
    const token = await loginAsDev("1001");
    const ownId = (await list(token)).find((session) => session.current)?.id ?? "";
    expect((await revoke(ownId, token)).status).toBe(200);
    expect((await call("/api/me", { token })).status).toBe(401);
  });

  it("refuses an id longer than 128 characters", async () => {
    const token = await loginAsDev("1001");
    expect((await revoke("x".repeat(129), token)).status).toBe(422);
  });
});
/* eslint-enable sonarjs/no-hardcoded-ip -- the fixture addresses end here */
