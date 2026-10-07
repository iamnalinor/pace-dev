import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { endpoints } from "@pace/core";

import { createApp } from "../src/app.ts";
import { bindNonce } from "../src/auth/nonce.ts";
import { upsertTelegramUser } from "../src/auth/users.ts";
import { hmacSha256Hex } from "../src/shared/crypto.ts";
import { d1 } from "../src/shared/db/d1.ts";
import { call, json, loginAsDev, readJson } from "./helpers.ts";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Signs a Login Widget payload with the test bot token (reference algorithm). */
const widgetPayload = async (fields: Record<string, number | string>) => {
  const checkString = Object.keys(fields)
    .toSorted((a, b) => a.localeCompare(b, "en"))
    .map((key) => `${key}=${String(fields[key])}`)
    .join("\n");
  const token = env.TELEGRAM_BOT_TOKEN ?? "";
  const secret = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return { ...fields, hash: await hmacSha256Hex(secret, checkString) };
};

describe("dev login", () => {
  it("signs in a whitelisted id and serves /api/me", async () => {
    const response = await call("/api/auth/dev", { body: { telegramId: "1001" } });
    expect(response.status).toBe(200);
    const session = await readJson<{ token: string; user: { telegramId: string } }>(response);
    expect(session.user).toMatchObject({ telegramId: "1001", username: null, photoUrl: null });
    expect(await json("/api/me", { token: session.token })).toEqual(session.user);
  });

  it("refuses ids outside the whitelist", async () => {
    const response = await call("/api/auth/dev", { body: { telegramId: "9999" } });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "auth/not-allowed" });
  });

  it("does not exist in production", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("https://pace-api.test/api/auth/dev", {
        body: JSON.stringify({ telegramId: "1001" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      { ...env, ENVIRONMENT: "production" },
    );
    expect(response.status).toBe(404);
  });
});

describe("bearer sessions", () => {
  const protectedEndpoints = [
    endpoints.me,
    endpoints.auth.logout,
    endpoints.sync.push,
    endpoints.sync.pull,
    endpoints.sync.observations,
  ];

  it.each(protectedEndpoints)("$method $path is 401 without a bearer", async (endpoint) => {
    const response = await call(endpoint.path, {
      body: endpoint.method === "POST" ? {} : undefined,
      method: endpoint.method,
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "auth/unauthorized", message: "Unauthorized" });
  });

  it("rejects an unknown token", async () => {
    const response = await call("/api/me", { token: "nope" });
    expect(response.status).toBe(401);
  });

  it("logout revokes the token", async () => {
    const token = await loginAsDev("1001");
    expect(await json("/api/auth/logout", { method: "POST", token })).toEqual({ ok: true });
    expect((await call("/api/me", { token })).status).toBe(401);
  });
});

describe("Telegram Login Widget", () => {
  it("accepts a valid signature and creates the session", async () => {
    const body = await widgetPayload({
      auth_date: nowSeconds(),
      first_name: "Ada",
      id: 1001,
      username: "ada",
    });
    const response = await call("/api/auth/telegram", { body });
    expect(response.status).toBe(200);
    const session = await readJson<{ token: string; user: { name: string } }>(response);
    expect(session.user).toMatchObject({ name: "Ada", telegramId: "1001", username: "ada" });
    expect((await call("/api/me", { token: session.token })).status).toBe(200);
  });

  it("rejects a bad hash with 401", async () => {
    const body = {
      ...(await widgetPayload({ auth_date: nowSeconds(), first_name: "A", id: 1001 })),
    };
    const response = await call("/api/auth/telegram", { body: { ...body, id: 1002 } });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "auth/invalid-hash" });
  });

  it("rejects a stale payload with 401", async () => {
    const body = await widgetPayload({ auth_date: nowSeconds() - 600, first_name: "A", id: 1001 });
    const response = await call("/api/auth/telegram", { body });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "auth/expired" });
  });

  it("refuses a correctly signed payload from someone not whitelisted", async () => {
    const body = await widgetPayload({ auth_date: nowSeconds(), first_name: "Eve", id: 4242 });
    const response = await call("/api/auth/telegram", { body });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "auth/not-allowed" });
  });
});

describe("login nonce", () => {
  it("mints a nonce with the bot deep link and stays pending until bound", async () => {
    const created = await json<{ nonce: string; deepLink: string }>("/api/auth/nonce", {
      method: "POST",
    });
    expect(created.nonce).toMatch(/^[\w-]{32}$/);
    expect(created.deepLink).toBe(`https://t.me/PaceTestBot?start=login_${created.nonce}`);
    expect(await json(`/api/auth/nonce/${created.nonce}`)).toEqual({ status: "pending" });
  });

  it("hands out the session once after the bot bound it", async () => {
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce", { method: "POST" });
    const user = await upsertTelegramUser(
      d1(env.DB),
      { name: "Ada", photoUrl: null, telegramId: "1001", username: "ada" },
      Date.now(),
    );
    await bindNonce(d1(env.DB), { nonce, now: Date.now(), userId: user.id });

    const ready = await json<{ status: string; token: string }>(`/api/auth/nonce/${nonce}`);
    expect(ready).toMatchObject({ status: "ready", user: { id: user.id } });
    expect((await call("/api/me", { token: ready.token })).status).toBe(200);

    const again = await call(`/api/auth/nonce/${nonce}`);
    expect(again.status).toBe(404);
    expect(await again.json()).toMatchObject({ code: "auth/nonce-not-found" });
  });

  it("is 404 for an unknown nonce", async () => {
    expect((await call("/api/auth/nonce/unknown-nonce")).status).toBe(404);
  });
});
