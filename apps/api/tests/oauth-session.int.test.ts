import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createSession } from "../src/auth/sessions.ts";
import { upsertTelegramUser } from "../src/auth/users.ts";
import { d1 } from "../src/shared/db/d1.ts";
import { call, loginAsDev, readJson } from "./helpers.ts";
import { authorizeQuery, codeFrom, exchangeCode, pkce, registerClient } from "./oauth-flow.ts";

/**
Owner bug 2026-11-03 (task A9): the consent page of a browser that holds the person's Pace
session proves who is allowing with that session (its bearer), not with the Telegram widget.
*/

const userIdOf = async (telegramId: string): Promise<string> => {
  const row = await env.DB.prepare("SELECT id FROM users WHERE telegram_id = ?")
    .bind(telegramId)
    .first<{ id: string }>();
  if (row === null) {
    throw new Error(`no user ${telegramId}`);
  }
  return row.id;
};

const grantKeysOf = async (userId: string): Promise<readonly string[]> =>
  (await env.OAUTH_KV.list({ prefix: `grant:${userId}:` })).keys.map((key) => key.name);

const allGrantKeys = async (): Promise<number> =>
  (await env.OAUTH_KV.list({ prefix: "grant:" })).keys.length;

/** A fresh authorization request of a fresh client, as `GET /authorize` passes it on. */
const request = async (): Promise<{
  readonly clientId: string;
  readonly query: string;
  readonly verifier: string;
}> => {
  const { clientId } = await registerClient();
  const { challenge, verifier } = await pkce();
  return { clientId, query: authorizeQuery(clientId, challenge), verifier };
};

const allowWith = async (
  query: string,
  token: string | undefined,
  extra: Record<string, unknown> = {},
): Promise<Response> =>
  await call("/api/oauth/complete", {
    body: { authQuery: query, scopes: ["tasks:read"], ...extra },
    ...(token !== undefined && { token }),
  });

describe("consent with the browser's Pace session", () => {
  it("completes with the session's bearer alone and the grant belongs to the session's user", async () => {
    const token = await loginAsDev("1002");
    const userId = await userIdOf("1002");
    const before = await grantKeysOf(userId);
    const { clientId, query, verifier } = await request();

    const response = await allowWith(query, token);

    expect(response.status).toBe(200);
    const { redirectTo } = await readJson<{ redirectTo: string }>(response);
    expect(await grantKeysOf(userId)).toHaveLength(before.length + 1);
    // The code exchanges into a working token: the grant is a real one.
    const tokens = await exchangeCode({ clientId, code: codeFrom(redirectTo), verifier });
    expect(tokens.access_token).not.toBe("");
  });

  it("refuses a revoked session with the typed 401 and stores no grant", async () => {
    const token = await loginAsDev("1002");
    const out = await call("/api/auth/logout", { method: "POST", token });
    expect(out.status).toBeLessThan(300);
    const { query } = await request();
    const grants = await allGrantKeys();

    const response = await allowWith(query, token);

    expect(response.status).toBe(401);
    expect(await readJson<{ readonly code: string }>(response)).toMatchObject({
      code: "auth/unauthorized",
    });
    expect(await allGrantKeys()).toBe(grants);
  });

  it("refuses an expired session with the typed 401", async () => {
    const token = await loginAsDev("1001");
    const userId = await userIdOf("1001");
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
      .bind(Date.now() - 1000, userId)
      .run();
    const { query } = await request();
    const before = await grantKeysOf(userId);

    const response = await allowWith(query, token);

    expect(response.status).toBe(401);
    expect(await readJson<{ readonly code: string }>(response)).toMatchObject({
      code: "auth/unauthorized",
    });
    expect(await grantKeysOf(userId)).toEqual(before);
  });

  it("refuses a device token (it may only upload usage) with 403", async () => {
    await loginAsDev("1002");
    const userId = await userIdOf("1002");
    const device = await createSession(d1(env.DB), {
      kind: "agent",
      name: "Work laptop",
      now: Date.now(),
      scope: "usage:write",
      userId,
    });
    const { query } = await request();
    const before = await grantKeysOf(userId);

    const response = await allowWith(query, device.token);

    expect(response.status).toBe(403);
    expect(await readJson<{ readonly code: string }>(response)).toMatchObject({
      code: "auth/forbidden",
    });
    expect(await grantKeysOf(userId)).toEqual(before);
  });

  it("refuses a session whose Telegram id left the whitelist with 403", async () => {
    const user = await upsertTelegramUser(
      d1(env.DB),
      { firstName: null, name: "Gone", photoUrl: null, telegramId: "4243", username: null },
      Date.now(),
    );
    const session = await createSession(d1(env.DB), {
      kind: "browser",
      name: "Chrome on macOS",
      now: Date.now(),
      userId: user.id,
    });
    const { query } = await request();

    const response = await allowWith(query, session.token);

    expect(response.status).toBe(403);
    expect(await readJson<{ readonly code: string }>(response)).toMatchObject({
      code: "auth/not-allowed",
    });
    expect(await grantKeysOf(user.id)).toHaveLength(0);
  });

  it("refuses a session and a second proof together: one proof per request", async () => {
    const token = await loginAsDev("1002");
    const { query } = await request();
    const grants = await allGrantKeys();

    const response = await allowWith(query, token, { devTelegramId: "1001" });

    expect(response.status).toBe(422);
    expect(await readJson<{ readonly code: string }>(response)).toMatchObject({
      code: "auth/identity-conflict",
    });
    expect(await allGrantKeys()).toBe(grants);
  });

  it("keeps the signed-out proofs: a dev id without a bearer still completes", async () => {
    const { query } = await request();
    const response = await allowWith(query, undefined, { devTelegramId: "1001" });
    expect(response.status).toBe(200);
  });
});
