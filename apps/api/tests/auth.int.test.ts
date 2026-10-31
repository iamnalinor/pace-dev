import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { endpoints } from "@pace/core";

import { createApp } from "../src/app.ts";
import { bindNonce } from "../src/auth/nonce.ts";
import { upsertTelegramUser } from "../src/auth/users.ts";
import { hmacSha256Hex, sha256Hex } from "../src/shared/crypto.ts";
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
    expect(session.user).toMatchObject({
      firstName: null,
      photoUrl: null,
      telegramId: "1001",
      username: null,
    });
    expect(await json("/api/me", { token: session.token })).toEqual({
      ...session.user,
      storeId: expect.any(String) as string,
    });
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

  it("serves the first name from the widget payload on /api/me, not the full name", async () => {
    const body = await widgetPayload({
      auth_date: nowSeconds(),
      first_name: "Albert",
      id: 1001,
      last_name: "Einstein",
    });
    const session = await readJson<{ token: string }>(await call("/api/auth/telegram", { body }));
    expect(await json("/api/me", { token: session.token })).toMatchObject({
      firstName: "Albert",
      name: "Albert Einstein",
    });
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

  it("marks a login started in the browser, so the bot sends the person back there", async () => {
    const created = await json<{ nonce: string; deepLink: string }>("/api/auth/nonce?from=web", {
      method: "POST",
    });
    expect(created.deepLink).toBe(`https://t.me/PaceTestBot?start=weblogin_${created.nonce}`);
  });

  it("hands out the session once after the bot bound it", async () => {
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce", { method: "POST" });
    const user = await upsertTelegramUser(
      d1(env.DB),
      { firstName: "Ada", name: "Ada", photoUrl: null, telegramId: "1001", username: "ada" },
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

/* eslint-disable sonarjs/no-hardcoded-ip -- the address Cloudflare reports is these tests' fixture */
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";
const OKHTTP = "okhttp/4.12.0";

const BERLIN = { city: "Berlin", country: "DE" };

/** A request as Cloudflare hands it over: its address, country and city, and the client's UA. */
const from = (ip: string, userAgent: string, cf?: typeof BERLIN) => ({
  cf: cf ?? BERLIN,
  headers: { "CF-Connecting-IP": ip, "User-Agent": userAgent },
});

type SessionRow = {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly scope: null | string;
  readonly ip: null | string;
  readonly country: null | string;
  readonly city: null | string;
  readonly user_agent: null | string;
  readonly device_id: null | string;
};

const sessionOf = async (token: string): Promise<null | SessionRow> =>
  await env.DB.prepare(
    "select id, kind, name, scope, ip, country, city, user_agent, device_id from sessions where token_hash = ?",
  )
    .bind(await sha256Hex(token))
    .first<SessionRow>();

const nonceSessionOf = async (nonce: string): Promise<null | string> =>
  (
    await env.DB.prepare("select session_id from login_nonces where nonce = ?")
      .bind(nonce)
      .first<{ session_id: null | string }>()
  )?.session_id ?? null;

/** Binds a nonce to Ada the way the bot does, then polls it the way the app does. */
const finishBotLogin = async (nonce: string): Promise<string> => {
  const user = await upsertTelegramUser(
    d1(env.DB),
    { firstName: "Ada", name: "Ada", photoUrl: null, telegramId: "1001", username: "ada" },
    Date.now(),
  );
  await bindNonce(d1(env.DB), { nonce, now: Date.now(), userId: user.id });
  // The poll comes from another address: the session keeps the place the login started from.
  const ready = await json<{ token: string }>(`/api/auth/nonce/${nonce}`, from("9.9.9.9", OKHTTP));
  return ready.token;
};

describe("sessions record their kind, a readable name and where they signed in from", () => {
  it("a widget login is a browser session named after its browser", async () => {
    const body = await widgetPayload({ auth_date: nowSeconds(), first_name: "Ada", id: 1001 });
    const { token } = await json<{ token: string }>("/api/auth/telegram", {
      body,
      ...from("1.2.3.4", CHROME_MAC),
    });
    expect(await sessionOf(token)).toMatchObject({
      city: "Berlin",
      country: "DE",
      device_id: null,
      ip: "1.2.3.4",
      kind: "browser",
      name: "Chrome on macOS",
      scope: null,
      user_agent: CHROME_MAC,
    });
  });

  it("a dev login is a dev session", async () => {
    const { token } = await json<{ token: string }>("/api/auth/dev", {
      body: { telegramId: "1001" },
      ...from("1.2.3.4", CHROME_MAC),
    });
    expect(await sessionOf(token)).toMatchObject({ ip: "1.2.3.4", kind: "dev", name: "Dev login" });
  });

  it("a deep-link login from the app is an app session named by the phone, placed where it started", async () => {
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce?from=app", {
      body: { deviceId: "dev-1", deviceName: "Pixel 9a" },
      ...from("5.6.7.8", OKHTTP, { city: "Hamburg", country: "DE" }),
    });
    const token = await finishBotLogin(nonce);
    const session = await sessionOf(token);
    expect(session).toMatchObject({
      city: "Hamburg",
      country: "DE",
      device_id: "dev-1",
      ip: "5.6.7.8",
      kind: "app",
      name: "Pixel 9a",
      scope: null,
      user_agent: OKHTTP,
    });
    expect(await nonceSessionOf(nonce)).toBe(session?.id);
  });

  it("a deep-link login from the web is a browser session named after the browser that asked", async () => {
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce?from=web", {
      method: "POST",
      ...from("1.2.3.4", FIREFOX_LINUX),
    });
    const token = await finishBotLogin(nonce);
    expect(await sessionOf(token)).toMatchObject({
      device_id: null,
      ip: "1.2.3.4",
      kind: "browser",
      name: "Firefox on Linux",
      user_agent: FIREFOX_LINUX,
    });
  });

  it("an agent made in Settings is an agent session with the typed name and only usage:write", async () => {
    const owner = await loginAsDev("1001");
    const created = await json<{ id: string; token: string }>("/api/devices", {
      body: { name: "Work laptop" },
      token: owner,
    });
    const agent = await sessionOf(created.token);
    expect(agent).toMatchObject({ kind: "agent", name: "Work laptop", scope: "usage:write" });
    expect(agent?.id).toBe(created.id);
  });

  it("stores at most 512 characters of the User-Agent an anonymous nonce request sends", async () => {
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce?from=web", {
      method: "POST",
      ...from("1.2.3.4", "x".repeat(5000)),
    });
    const row = await env.DB.prepare("select user_agent from login_nonces where nonce = ?")
      .bind(nonce)
      .first<{ user_agent: string }>();
    expect(row?.user_agent).toBe("x".repeat(512));
  });

  it("refuses a nonce request body with fields it does not know", async () => {
    const response = await call("/api/auth/nonce?from=app", { body: { extra: 1 } });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "validation" });
  });

  it.each([{ deviceName: "" }, { deviceId: "x".repeat(65) }, { deviceName: "x".repeat(81) }])(
    "refuses an out-of-range device in the nonce request (%o)",
    async (body) => {
      expect((await call("/api/auth/nonce?from=app", { body })).status).toBe(422);
    },
  );
});
/* eslint-enable sonarjs/no-hardcoded-ip -- the fixtures above end here */
