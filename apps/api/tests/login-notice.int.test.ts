import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { endpoints, newId, type PoolNotification } from "@pace/core";

import type { UserStore } from "../src/user-store/user-store.ts";

import { findUserIdByTelegramId } from "../src/auth/users.ts";
import { hmacSha256Hex } from "../src/shared/crypto.ts";
import { d1 } from "../src/shared/db/d1.ts";
import { answerOf, call, json, loginAsDev, pushEvents, readJson } from "./helpers.ts";
import { obtainToken } from "./oauth-flow.ts";

/* eslint-disable sonarjs/no-hardcoded-ip -- the addresses Cloudflare and Telegram report are these tests' fixture */
const SIGN_IN_IP = "1.2.3.4";
const TELEGRAM_IP = "149.154.167.220";
/* eslint-enable sonarjs/no-hardcoded-ip -- the fixture addresses end here */
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const OKHTTP = "okhttp/4.12.0";
const ADA = 1001;
const NOT_ME = "Not me — end this session";

/** A request as Cloudflare hands it over from Berlin: its address, place and the client's UA. */
const fromBerlin = (userAgent: string) => ({
  cf: { city: "Berlin", country: "DE" },
  headers: { "CF-Connecting-IP": SIGN_IN_IP, "User-Agent": userAgent },
});

type TelegramCall = {
  readonly method: string;
  readonly body: Record<string, unknown>;
  /** The id Telegram gave a sent message. */
  readonly messageId: number;
};

/**
Every Telegram message call, from the bot and from the store alike (both use the global fetch);
an avatar lookup at sign-in is not one.
*/
const sent: TelegramCall[] = [];
const MESSAGING: ReadonlySet<string> = new Set([
  "answerCallbackQuery",
  "deleteMessage",
  "editMessageText",
  "sendMessage",
]);
const ids = { next: 500 };

const methodsSent = (): readonly string[] => sent.map((entry) => entry.method);

beforeEach(() => {
  sent.length = 0;
  const passThrough = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith("https://telegram.test")) {
      return await passThrough(input, init);
    }
    const method = url.split("/").at(-1) ?? "";
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<
      string,
      unknown
    >;
    ids.next += 1;
    if (MESSAGING.has(method)) {
      sent.push({ body, messageId: ids.next, method });
    }
    return Response.json({
      ok: true,
      result:
        method === "sendMessage"
          ? {
              chat: { id: body["chat_id"], type: "private" },
              date: Math.floor(Date.now() / 1000),
              message_id: ids.next,
              text: body["text"],
            }
          : true,
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Signs a Login Widget payload with the test bot token (reference algorithm). */
const widgetPayload = async (fields: Record<string, number | string>) => {
  const checkString = Object.keys(fields)
    .toSorted((a, b) => a.localeCompare(b, "en"))
    .map((key) => `${key}=${String(fields[key])}`)
    .join("\n");
  const secret = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN ?? ""),
  );
  return { ...fields, hash: await hmacSha256Hex(secret, checkString) };
};

const widgetLogin = async (
  telegramId: number,
  request: { cf?: Record<string, unknown>; headers?: Record<string, string> },
): Promise<string> => {
  const body = await widgetPayload({ auth_date: nowSeconds(), first_name: "Ada", id: telegramId });
  return (await json<{ token: string }>("/api/auth/telegram", { body, ...request })).token;
};

const setLanguage = async (token: string, language: "en" | "ru"): Promise<void> => {
  const at = new Date().toISOString();
  await pushEvents(token, [
    {
      deviceId: "test",
      id: newId(),
      occurredAt: at,
      payload: { language },
      precision: "exact",
      recordedAt: at,
      source: "app",
      type: "settings.updated",
    },
  ]);
};

/** A signed-in admin session to look with (its own notice is cleared from `sent`). */
const adminOf = async (telegramId: string, language: "en" | "ru" = "en"): Promise<string> => {
  const token = await loginAsDev(telegramId);
  await setLanguage(token, language);
  sent.length = 0;
  return token;
};

const currentSessionId = async (token: string): Promise<string> => {
  const { sessions } = await answerOf(endpoints.sessions.list, "/api/sessions", { token });
  return sessions.find((session) => session.current)?.id ?? "";
};

const loginNoticeOf = async (admin: string, sessionId: string): Promise<PoolNotification> => {
  const page = await answerOf(endpoints.notifications.list, "/api/notifications?limit=50", {
    token: admin,
  });
  const found = page.items.find(
    (item) => item.kind === "login" && item.payload.sessionId === sessionId,
  );
  if (found === undefined) {
    throw new Error(`no login notice for ${sessionId}`);
  }
  return found;
};

const updates = { next: 10_000 };

/** Calls the webhook as Telegram would: from one of its subnets, with the shared secret. */
const webhook = async (update: Record<string, unknown>): Promise<Response> => {
  updates.next += 1;
  return await call("/telegram/webhook", {
    body: { ...update, update_id: updates.next },
    headers: {
      "CF-Connecting-IP": TELEGRAM_IP,
      "X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret",
    },
  });
};

const start = (text: string) => ({
  message: {
    chat: { id: ADA, type: "private" },
    date: nowSeconds(),
    entities: [{ length: 6, offset: 0, type: "bot_command" }],
    from: { first_name: "Ada", id: ADA, is_bot: false, username: "ada" },
    message_id: updates.next,
    text,
  },
});

/** A press on a button of the message `messageId`, which shows `text`. */
const press = (data: string, message: { readonly messageId: number; readonly text: string }) => ({
  callback_query: {
    chat_instance: "1",
    data,
    from: { first_name: "Ada", id: ADA, is_bot: false },
    id: `q${String(updates.next)}`,
    message: {
      chat: { id: ADA, type: "private" },
      date: nowSeconds(),
      message_id: message.messageId,
      text: message.text,
    },
  },
});

type Keyboard = readonly (readonly Record<string, string>[])[];

const keyboardOf = (entry: TelegramCall | undefined): Keyboard | undefined =>
  (entry?.body["reply_markup"] as undefined | { inline_keyboard: Keyboard })?.inline_keyboard;

const sessionRow = async (sessionId: string) =>
  await env.DB.prepare("select id from sessions where id = ?").bind(sessionId).first();

/** The Telegram copy the user's store recorded for a notification. */
const telegramCopyOf = async (notificationId: string) => {
  const userId = (await findUserIdByTelegramId(d1(env.DB), String(ADA))) ?? "";
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(userId));
  return await runInDurableObject(stub, (_instance: UserStore, state) =>
    state.storage.sql
      .exec<{ chat: null | string; message: null | number; state: string }>(
        "select telegram_chat_id as chat, telegram_message_id as message, telegram_state as state from notifications where id = ?",
        notificationId,
      )
      .one(),
  );
};

/** A deep-link login from the app: the nonce, the bot's `/start`, and its reply. */
const deepLink = async (deviceName = "Pixel 9a") => {
  const deviceId = `pixel-${crypto.randomUUID()}`;
  const { nonce } = await json<{ nonce: string }>("/api/auth/nonce?from=app", {
    body: { deviceId, deviceName },
    ...fromBerlin(OKHTTP),
  });
  await webhook(start(`/start login_${nonce}`));
  const reply = sent.find((entry) => entry.method === "sendMessage");
  return { deviceId, nonce, reply };
};

describe("a sign-in notice in Telegram", () => {
  it("leads with the address and place Cloudflare reported, then the browser, with Not me", async () => {
    await adminOf(String(ADA));
    await widgetLogin(ADA, fromBerlin(CHROME_MAC));
    const messages = sent.filter((entry) => entry.method === "sendMessage");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body["text"]).toBe(
      "🔐 You signed in from IP 1.2.3.4 · Germany, Berlin · Chrome on macOS",
    );
    // Plain text: nothing the client named is read as markup.
    expect(messages[0]?.body).not.toHaveProperty("parse_mode");
    expect(keyboardOf(messages[0])).toEqual([
      [{ callback_data: expect.stringMatching(/^nr:/u) as string, text: NOT_ME }],
    ]);
  });

  it("names the country in the account's language", async () => {
    await adminOf("1002", "ru");
    await widgetLogin(1002, fromBerlin(CHROME_MAC));
    const message = sent.find((entry) => entry.method === "sendMessage");
    expect(message?.body["text"]).toBe("🔐 Вход с IP 1.2.3.4 · Германия, Berlin · Chrome on macOS");
    expect(keyboardOf(message)?.[0]?.[0]?.["text"]).toBe("Это не я — завершить сеанс");
    await setLanguage(await loginAsDev("1002"), "en");
  });

  it("leaves out what Cloudflare did not report (a server not behind its edge)", async () => {
    await adminOf(String(ADA));
    await widgetLogin(ADA, { headers: { "User-Agent": CHROME_MAC } });
    const message = sent.find((entry) => entry.method === "sendMessage");
    expect(message?.body["text"]).toBe("🔐 You signed in from Chrome on macOS");
  });

  it("sends nothing for an agent token made in Settings or an MCP app's consent", async () => {
    const admin = await adminOf(String(ADA));
    const agent = await call("/api/sessions/agents", {
      body: { name: "Linux Mint" },
      token: admin,
    });
    expect(agent.status).toBe(200);
    await obtainToken({ devTelegramId: String(ADA) });
    expect(methodsSent()).not.toContain("sendMessage");
  });
});

describe("a deep-link sign-in", () => {
  it("turns the bot's reply into the notice: one message, edited, with Return and Not me", async () => {
    await adminOf(String(ADA));
    const { nonce, reply } = await deepLink();
    expect(methodsSent()).toEqual(["sendMessage"]);
    const returnButton = { text: "Return to Pace", url: `${env.WEB_ORIGIN}/app/login` };
    expect(reply?.body).toMatchObject({
      reply_markup: { inline_keyboard: [[returnButton]] },
      text: "Logged in. Return to Pace.",
    });
    sent.length = 0;

    const ready = await json<{ status: string; token: string }>(`/api/auth/nonce/${nonce}`);
    expect(ready.status).toBe("ready");
    expect(methodsSent()).toEqual(["editMessageText"]);
    const notice = await loginNoticeOf(
      await loginAsDev(String(ADA)),
      await currentSessionId(ready.token),
    );
    expect(sent[0]?.body).toMatchObject({
      chat_id: String(ADA),
      message_id: reply?.messageId,
      text: "🔐 You signed in from IP 1.2.3.4 · Germany, Berlin · Pixel 9a",
    });
    expect(keyboardOf(sent[0])).toEqual([
      [returnButton, { callback_data: `nr:${notice.id}`, text: NOT_ME }],
    ]);
    expect(await telegramCopyOf(notice.id)).toEqual({
      chat: String(ADA),
      message: reply?.messageId,
      state: "sent",
    });
  });

  it("shows a name the app chose as it is, never as markup", async () => {
    await adminOf(String(ADA));
    const { nonce } = await deepLink("<b>Your</b> *phone* _x_ [ok](https://evil.test)");
    sent.length = 0;
    await json(`/api/auth/nonce/${nonce}`);
    const edit = sent.find((entry) => entry.method === "editMessageText");
    expect(edit?.body["text"]).toBe(
      "🔐 You signed in from IP 1.2.3.4 · Germany, Berlin · <b>Your</b> *phone* _x_ [ok](https://evil.test)",
    );
    expect(edit?.body).not.toHaveProperty("parse_mode");
  });

  it("opens one session and sends one notice when the app polls twice at once", async () => {
    await adminOf(String(ADA));
    const { deviceId, nonce } = await deepLink();
    sent.length = 0;
    const polls = await Promise.all([
      call(`/api/auth/nonce/${nonce}`),
      call(`/api/auth/nonce/${nonce}`),
    ]);
    expect(polls.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([200, 404]);
    const row = await env.DB.prepare("select session_id from login_nonces where nonce = ?")
      .bind(nonce)
      .first<{ session_id: null | string }>();
    const ready = polls.find((response) => response.status === 200);
    const { token } = await readJson<{ token: string }>(ready ?? new Response("{}"));
    expect(row?.session_id).toBe(await currentSessionId(token));
    const deviceSessions = await env.DB.prepare(
      "select count(*) as n from sessions where device_id = ?",
    )
      .bind(deviceId)
      .first<{ n: number }>();
    expect(deviceSessions?.n).toBe(1);
    expect(methodsSent()).toEqual(["editMessageText"]);
  });

  it("says the link expired at /start for an expired nonce, binding nothing", async () => {
    await adminOf(String(ADA));
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce?from=app", {
      body: { deviceName: "Pixel 9a" },
    });
    await env.DB.prepare("update login_nonces set expires_at = ? where nonce = ?")
      .bind(Date.now() - 1000, nonce)
      .run();
    await webhook(start(`/start login_${nonce}`));
    expect(methodsSent()).toEqual(["sendMessage"]);
    expect(sent[0]?.body).toEqual({
      chat_id: ADA,
      text: "This login link has expired. Open Pace and try again.",
    });
    const row = await env.DB.prepare(
      "select user_id, reply_message_id from login_nonces where nonce = ?",
    )
      .bind(nonce)
      .first();
    expect(row).toEqual({ reply_message_id: null, user_id: null });
  });

  it("binds a link opened twice at once only once; the other reply ends up saying it expired", async () => {
    await adminOf(String(ADA));
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce?from=app", {
      body: { deviceName: "Pixel 9a" },
    });
    await Promise.all([
      webhook(start(`/start login_${nonce}`)),
      webhook(start(`/start login_${nonce}`)),
    ]);
    // Each reply's last word: an edit of a sent reply, else the reply itself.
    const finalTexts = sent
      .filter((entry) => entry.method === "sendMessage")
      .map((reply) => {
        const edit = sent.findLast(
          (entry) =>
            entry.method === "editMessageText" && entry.body["message_id"] === reply.messageId,
        );
        return (edit ?? reply).body["text"];
      });
    expect(finalTexts.map(String).toSorted((a, b) => a.localeCompare(b, "en"))).toEqual([
      "Logged in. Return to Pace.",
      "This login link has expired. Open Pace and try again.",
    ]);
    const row = await env.DB.prepare("select reply_message_id from login_nonces where nonce = ?")
      .bind(nonce)
      .first<{ reply_message_id: number }>();
    const bound = sent.find((entry) => entry.messageId === row?.reply_message_id);
    expect(bound?.body["text"]).toBe("Logged in. Return to Pace.");
  });
});

/** A deep-link sign-in with its notice in place: the session, the token and the message. */
const signedIn = async () => {
  const admin = await adminOf(String(ADA));
  const { nonce, reply } = await deepLink();
  const { token } = await json<{ token: string }>(`/api/auth/nonce/${nonce}`);
  const sessionId = await currentSessionId(token);
  const notice = await loginNoticeOf(admin, sessionId);
  const edit = sent.findLast((entry) => entry.method === "editMessageText");
  sent.length = 0;
  return {
    admin,
    message: { messageId: reply?.messageId ?? 0, text: String(edit?.body["text"]) },
    notice,
    sessionId,
    token,
  };
};

describe("Not me", () => {
  it("ends the session from Telegram and says so; a second press changes nothing", async () => {
    const { admin, message, notice, sessionId, token } = await signedIn();
    await webhook(press(`nr:${notice.id}`, message));
    expect(methodsSent()).toEqual(["answerCallbackQuery", "editMessageText"]);
    expect(sent[0]?.body["show_alert"]).toBeUndefined();
    expect(sent[1]?.body).toMatchObject({
      message_id: message.messageId,
      text: `${message.text}\n\nSession ended`,
    });
    expect(sent[1]?.body).not.toHaveProperty("reply_markup");
    expect(await sessionRow(sessionId)).toBeNull();
    expect((await call("/api/me", { token })).status).toBe(401);
    const resolved = await loginNoticeOf(admin, sessionId);
    expect(resolved.resolution).toBe("revoked");

    // Pressed again (a double tap that raced the edit): no alert, no edit, nothing revoked again.
    sent.length = 0;
    await webhook(
      press(`nr:${notice.id}`, { ...message, text: `${message.text}\n\nSession ended` }),
    );
    expect(methodsSent()).toEqual(["answerCallbackQuery"]);
    expect(sent[0]?.body["show_alert"]).toBeUndefined();
    expect(await loginNoticeOf(admin, sessionId)).toEqual(resolved);
  });

  it("ends nothing twice when the session was revoked in Settings first, and still says so", async () => {
    const { admin, message, notice, sessionId } = await signedIn();
    const revoked = await call(`/api/sessions/${sessionId}`, { method: "DELETE", token: admin });
    expect(revoked.status).toBe(200);
    await webhook(press(`nr:${notice.id}`, message));
    expect(methodsSent()).toEqual(["answerCallbackQuery", "editMessageText"]);
    expect(sent[0]?.body["show_alert"]).toBeUndefined();
    expect(sent[1]?.body["text"]).toBe(`${message.text}\n\nSession ended`);
    expect((await loginNoticeOf(admin, sessionId)).resolution).toBe("revoked");
  });

  it("ends the session from the feed the same way, taking the Telegram message back", async () => {
    const { admin, message, notice, sessionId, token } = await signedIn();
    const answered = await answerOf(
      endpoints.notifications.resolve,
      `/api/notifications/${notice.id}/resolve`,
      { body: { from: "web", resolution: "revoked" }, token: admin },
    );
    expect(answered.notification.resolution).toBe("revoked");
    expect(await sessionRow(sessionId)).toBeNull();
    expect((await call("/api/me", { token })).status).toBe(401);
    expect(sent.find((entry) => entry.method === "deleteMessage")?.body).toMatchObject({
      message_id: message.messageId,
    });
  });
});
