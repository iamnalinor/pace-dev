import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import type { TelegramTransport } from "../src/bot/telegram-api.ts";

import { createApp } from "../src/app.ts";
import { json } from "./helpers.ts";

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

const webhook = async (update: unknown, secret = "test-webhook-secret"): Promise<Response> => {
  const ctx = createExecutionContext();
  const response = await createApp({ telegramFetch }).fetch(
    new Request("https://pace-api.test/telegram/webhook", {
      body: JSON.stringify(update),
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": secret,
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

  it("rejects a wrong secret token with 401 and does nothing", async () => {
    const response = await webhook(startUpdate(1001, "/start"), "wrong");
    expect(response.status).toBe(401);
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
