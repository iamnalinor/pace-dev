import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TelegramTransport } from "../src/bot/telegram-api.ts";

import { createApp } from "../src/app.ts";
import { echoParse, fakeParseModel } from "../src/parse/fake-model.ts";
import { json, loginAsDev, readJson } from "./helpers.ts";

/** Every outgoing Telegram API call lands here instead of the network. */
const sent: { method: string; body: Record<string, unknown> }[] = [];

const telegramFetch: TelegramTransport = async (input, init) => {
  const url = new URL(input);
  expect(url.origin).toBe("https://telegram.test");
  const method = url.pathname.split("/").at(-1) ?? "";
  const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<
    string,
    unknown
  >;
  sent.push({ body, method });
  return Response.json({ ok: true, result: { message_id: 1 } });
};

// Addresses the webhook is called from: inside Telegram's subnets (vitest.config.ts) and outside.
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- the fixture of the source-IP allowlist
const TELEGRAM_IP = "149.154.167.220";
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- the fixture of the source-IP allowlist
const OUTSIDE_IP = "8.8.8.8";

type WebhookOptions = {
  readonly secret?: string;
  /** The `CF-Connecting-IP` Cloudflare sets; `null` leaves the header out. */
  readonly ip?: null | string;
};

/** Calls the webhook as Telegram would: from one of its subnets, with the shared secret. */
const webhook = async (update: unknown, options: WebhookOptions = {}): Promise<Response> => {
  const ctx = createExecutionContext();
  const ip = options.ip === undefined ? TELEGRAM_IP : options.ip;
  const response = await createApp({
    fetch: async () => {
      throw new Error("no network in tests");
    },
    parseProviders: () => [{ model: fakeParseModel(echoParse), name: "fake" }],
    telegramFetch,
  }).fetch(
    new Request("https://pace-api.test/telegram/webhook", {
      body: JSON.stringify(update),
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": options.secret ?? "test-webhook-secret",
        ...(ip !== null && { "CF-Connecting-IP": ip }),
      },
      method: "POST",
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
};

const updates = { next: 1 };
const startUpdate = (telegramId: number, text: string) => {
  const updateId = updates.next;
  updates.next += 1;
  return {
    message: {
      chat: { id: telegramId, type: "private" },
      date: Math.floor(Date.now() / 1000),
      entities: [{ length: 6, offset: 0, type: "bot_command" }],
      from: { first_name: "Ada", id: telegramId, is_bot: false, username: "ada" },
      message_id: updateId,
      text,
    },
    update_id: updateId,
  };
};

describe("POST /telegram/webhook", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a wrong secret token from a Telegram address with 401 and does nothing", async () => {
    const response = await webhook(startUpdate(1001, "/start"), { secret: "wrong" });
    expect(response.status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("rejects a call from outside Telegram's subnets with 403 and logs the address", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await webhook(startUpdate(1001, "/start"), { ip: OUTSIDE_IP });
    expect(response.status).toBe(403);
    expect(await readJson(response)).toMatchObject({ code: "bot/forbidden-ip" });
    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(OUTSIDE_IP);
  });

  it("rejects a call without CF-Connecting-IP with 403 even with the right secret", async () => {
    const response = await webhook(startUpdate(1001, "/start"), { ip: null });
    expect(response.status).toBe(403);
    expect(await readJson(response)).toMatchObject({ code: "bot/forbidden-ip" });
    expect(sent).toEqual([]);
  });

  it("binds the login nonce for a whitelisted user and confirms", async () => {
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce", { method: "POST" });
    const response = await webhook(startUpdate(1001, `/start login_${nonce}`));
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("sendMessage");
    expect(sent[0]?.body).toMatchObject({ chat_id: 1001, text: "Logged in — return to Pace" });
    const ready = await json<{ status: string; user: { telegramId: string; name: string } }>(
      `/api/auth/nonce/${nonce}`,
    );
    expect(ready).toMatchObject({ status: "ready", user: { name: "Ada", telegramId: "1001" } });
  });

  it("tells a user outside the whitelist that they are not allowed", async () => {
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce", { method: "POST" });
    const response = await webhook(startUpdate(4242, `/start login_${nonce}`));
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("sendMessage");
    expect(sent[0]?.body).toMatchObject({ chat_id: 4242, text: "Not allowed" });
    expect(await json(`/api/auth/nonce/${nonce}`)).toEqual({ status: "pending" });
  });

  it("explains an unknown or expired login link", async () => {
    await webhook(startUpdate(1001, "/start login_doesnotexist"));
    expect(sent[0]?.body["text"]).toMatch(/expired/i);
  });

  it("greets a whitelisted user who just opens the bot", async () => {
    await webhook(startUpdate(1002, "/start"));
    expect(sent[0]?.body["text"]).toMatch(/Pace/);
  });
});

const textUpdate = (telegramId: number, text: string) => {
  const update = startUpdate(telegramId, text);
  const { entities: _entities, ...message } = update.message;
  return { ...update, message };
};

const callbackUpdate = (telegramId: number, data: string) => {
  const updateId = updates.next;
  updates.next += 1;
  return {
    callback_query: {
      chat_instance: "1",
      data,
      from: { first_name: "Ada", id: telegramId, is_bot: false },
      id: `q${String(updateId)}`,
      message: {
        chat: { id: telegramId, type: "private" },
        date: Math.floor(Date.now() / 1000),
        message_id: 99,
        text: "preview",
      },
    },
    update_id: updateId,
  };
};

type Keyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

describe("the bot as an assistant", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("previews a message with buttons and writes the task on Accept", async () => {
    const token = await loginAsDev("1002");
    await webhook(textUpdate(1002, "купить кабель USB-C"));
    const preview = sent.find((call) => call.method === "sendMessage");
    expect(preview?.body["text"]).toContain("I read it as:");
    expect(preview?.body["text"]).toContain("купить кабель USB-C");
    const keyboard = preview?.body["reply_markup"] as Keyboard;
    const accept = keyboard.inline_keyboard[0]?.find((button) => button.text === "Accept");
    expect(accept?.callback_data).toMatch(/^a:/u);

    sent.length = 0;
    await webhook(callbackUpdate(1002, accept?.callback_data ?? ""));
    expect(sent.map((call) => call.method)).toEqual(["answerCallbackQuery", "editMessageText"]);
    expect(sent[1]?.body).toMatchObject({ text: "Done ✓" });

    const pulled = await json<{ events: { type: string; source: string; payload: { title?: string } }[] }>(
      "/api/sync/pull",
      { token },
    );
    expect(pulled.events).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ title: "купить кабель USB-C" }),
        source: "bot",
        type: "task.created",
      }),
    );

    sent.length = 0;
    await webhook(callbackUpdate(1002, accept?.callback_data ?? ""));
    expect(sent[1]?.body).toMatchObject({ text: "This preview has expired. Send the message again." });
  });

  it("keeps a message in the Inbox on To Inbox and lists Now on /now", async () => {
    const token = await loginAsDev("1002");
    await webhook(textUpdate(1002, "подумать об отпуске"));
    const keyboard = sent.find((call) => call.method === "sendMessage")?.body["reply_markup"] as Keyboard;
    const toInbox = keyboard.inline_keyboard[0]?.find((button) => button.text === "To Inbox");
    sent.length = 0;
    await webhook(callbackUpdate(1002, toInbox?.callback_data ?? ""));
    expect(sent[1]?.body).toMatchObject({ text: "Saved to Inbox." });
    const pulled = await json<{ events: { payload: { presetId?: string; title?: string } }[] }>(
      "/api/sync/pull",
      { token },
    );
    expect(pulled.events.at(-1)?.payload).toMatchObject({ presetId: "inbox", title: "подумать об отпуске" });

    sent.length = 0;
    await webhook(startUpdate(1002, "/now"));
    expect(sent[0]?.body["text"]).toMatch(/^(Now:|Nothing to do right now\.)/u);
  });
});
