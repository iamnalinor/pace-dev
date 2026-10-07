import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TelegramTransport } from "../src/bot/telegram-api.ts";

import { createApp } from "../src/app.ts";
import { json, readJson } from "./helpers.ts";

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

type WebhookOptions = {
  readonly secret?: string;
  /** The `CF-Connecting-IP` Cloudflare sets; `null` leaves the header out. */
  readonly ip?: null | string;
};

/** Calls the webhook as Telegram would: from one of its subnets, with the shared secret. */
const webhook = async (update: unknown, options: WebhookOptions = {}): Promise<Response> => {
  const ctx = createExecutionContext();
  const ip = options.ip === undefined ? "149.154.167.220" : options.ip;
  const response = await createApp({ telegramFetch }).fetch(
    new Request("https://pace-api.test/telegram/webhook", {
      body: JSON.stringify(update),
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": options.secret ?? "test-webhook-secret",
        ...(ip === null ? {} : { "CF-Connecting-IP": ip }),
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
    const response = await webhook(startUpdate(1001, "/start"), { ip: "8.8.8.8" });
    expect(response.status).toBe(403);
    expect(await readJson(response)).toMatchObject({ code: "bot/forbidden-ip" });
    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("8.8.8.8");
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
