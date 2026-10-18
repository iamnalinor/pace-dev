import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newId } from "@pace/core";

import type { TelegramTransport } from "../src/shared/telegram-api.ts";

import { createApp } from "../src/app.ts";
import { echoReply, fakeParseModel } from "../src/shared/llm/fake-model.ts";
import { json, loginAsDev, pushEvents, readJson } from "./helpers.ts";

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
  readonly noModel?: boolean;
};

/** Calls the webhook as Telegram would: from one of its subnets, with the shared secret. */
const webhook = async (update: unknown, options: WebhookOptions = {}): Promise<Response> => {
  const ctx = createExecutionContext();
  const ip = options.ip === undefined ? TELEGRAM_IP : options.ip;
  const response = await createApp({
    fetch: async () => {
      throw new Error("no network in tests");
    },
    parseProviders: () =>
      options.noModel === true ? [] : [{ model: fakeParseModel(echoReply), name: "fake" }],
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
    // Started in the app: the button is the App Link that brings the app back to the front.
    expect(sent[0]?.body).toMatchObject({
      chat_id: 1001,
      reply_markup: {
        inline_keyboard: [[{ text: "Return to Pace", url: `${env.WEB_ORIGIN}/app/login` }]],
      },
      text: "Logged in. Return to Pace.",
    });
    const ready = await json<{ status: string; user: { telegramId: string; name: string } }>(
      `/api/auth/nonce/${nonce}`,
    );
    expect(ready).toMatchObject({ status: "ready", user: { name: "Ada", telegramId: "1001" } });
  });

  it("keeps the person's Telegram first name, which /api/me then serves", async () => {
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce", { method: "POST" });
    await webhook(startUpdate(1001, `/start login_${nonce}`));
    const ready = await json<{ token: string }>(`/api/auth/nonce/${nonce}`);
    expect(await json("/api/me", { token: ready.token })).toMatchObject({ firstName: "Ada" });
  });

  it("sends a login started in the browser back to the website", async () => {
    const { nonce } = await json<{ nonce: string }>("/api/auth/nonce?from=web", {
      method: "POST",
    });
    await webhook(startUpdate(1001, `/start weblogin_${nonce}`));
    expect(sent[0]?.body).toMatchObject({
      reply_markup: { inline_keyboard: [[{ text: "Return to Pace", url: `${env.WEB_ORIGIN}/` }]] },
    });
    expect(await json(`/api/auth/nonce/${nonce}`)).toMatchObject({ status: "ready" });
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

/** The assistant tests talk as one linked user. */
const ADA = 1002;

const textUpdate = (text: string) => {
  const update = startUpdate(ADA, text);
  const { entities: _entities, ...message } = update.message;
  return { ...update, message };
};

const callbackUpdate = (data: string) => {
  const telegramId = ADA;
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

/** The callback data of the preview button labelled `label` in the last message sent. */
const buttonData = (label: string): string => {
  const preview = sent.findLast((call) => ["sendMessage", "editMessageText"].includes(call.method));
  const keyboard = preview?.body["reply_markup"] as Keyboard | undefined;
  return keyboard?.inline_keyboard[0]?.find((button) => button.text === label)?.callback_data ?? "";
};

/** Plain free text is intentionally ambiguous until the owner chooses its domain. */
const chooseTaskPreview = async (): Promise<void> => {
  const choose = buttonData("Task");
  expect(choose).toMatch(/^t:/u);
  sent.length = 0;
  await webhook(callbackUpdate(choose));
};

type Pulled = {
  events: { type: string; source: string; payload: Record<string, unknown> }[];
};

/** The last event of `type` the bot wrote for the user. */
const pulledEvent = async (token: string, type: string) => {
  const pulled = await json<Pulled>("/api/sync/pull", { token });
  return pulled.events.findLast((event) => event.type === type && event.source === "bot");
};

describe("the bot as an assistant", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("previews a message with buttons and writes the task on Approve", async () => {
    const token = await loginAsDev("1002");
    await webhook(textUpdate("купить кабель USB-C"));
    await chooseTaskPreview();
    const text = String(sent.find((call) => call.method === "editMessageText")?.body["text"]);
    expect(text).toContain("The assistant will create this task:");
    expect(text).toContain("купить кабель USB-C");
    const accept = buttonData("Approve");
    expect(accept).toMatch(/^a:/u);

    sent.length = 0;
    await webhook(callbackUpdate(accept));
    expect(sent.map((call) => call.method)).toEqual(["answerCallbackQuery", "editMessageText"]);
    expect(sent[1]?.body).toMatchObject({ text: "Done ✓" });
    expect(await pulledEvent(token, "task.created")).toMatchObject({
      payload: { title: "купить кабель USB-C" },
    });

    sent.length = 0;
    await webhook(callbackUpdate(accept));
    expect(sent[1]?.body).toMatchObject({
      text: "This preview has expired. Send the message again.",
    });
  });

  it("offers an immediate rule preview and domain choice without a configured model", async () => {
    const token = await loginAsDev("1002");
    await webhook(textUpdate("eating"), { noModel: true });
    expect(buttonData("Activity")).toMatch(/^v:/u);
    expect(await pulledEvent(token, "activity.started")).toBeUndefined();

    const choose = buttonData("Activity");
    sent.length = 0;
    await webhook(callbackUpdate(choose), { noModel: true });
    expect(String(sent.find((call) => call.method === "editMessageText")?.body["text"])).toMatch(
      /eating/u,
    );
    const accept = buttonData("Approve");
    expect(accept).toMatch(/^a:/u);
    sent.length = 0;
    await webhook(callbackUpdate(accept), { noModel: true });
    expect(await pulledEvent(token, "activity.started")).toMatchObject({
      payload: { category: "food", label: "eating" },
    });
  });

  it("previews a change to an existing task by its summary and writes it on Approve", async () => {
    const token = await loginAsDev("1002");
    await webhook(textUpdate("water the balcony plants"));
    await chooseTaskPreview();
    await webhook(callbackUpdate(buttonData("Approve")));
    sent.length = 0;
    await webhook(textUpdate("close task water the balcony plants"));
    const text = String(sent.find((call) => call.method === "sendMessage")?.body["text"]);
    expect(text).toBe("The assistant will close “water the balcony plants” as Done");
    const accept = buttonData("Approve");
    sent.length = 0;
    await webhook(callbackUpdate(accept));
    expect(sent[1]?.body).toMatchObject({ text: "Done ✓" });
    expect(await pulledEvent(token, "task.closed")).toMatchObject({ payload: { outcome: "done" } });
  });

  it("adds problems to a task from the chat, the message kept as the task's source", async () => {
    const token = await loginAsDev("1002");
    await webhook(textUpdate("geometry sheet three"));
    await chooseTaskPreview();
    await webhook(callbackUpdate(buttonData("Approve")));
    sent.length = 0;
    const text = "add to geometry sheet three: 4, 5";
    await webhook(textUpdate(text));
    await webhook(callbackUpdate(buttonData("Approve")));
    expect(await pulledEvent(token, "task.subtasks.added")).toMatchObject({
      payload: { subtasks: [{ label: "4" }, { label: "5" }] },
    });
    expect(await pulledEvent(token, "task.source.attached")).toMatchObject({
      payload: { sourceText: text },
    });
  });

  it("keeps a message in the Inbox on To Inbox and lists Now on /now", async () => {
    const token = await loginAsDev("1002");
    await webhook(textUpdate("подумать об отпуске"));
    await chooseTaskPreview();
    const toInbox = buttonData("To Inbox");
    sent.length = 0;
    await webhook(callbackUpdate(toInbox));
    expect(sent[1]?.body).toMatchObject({ text: "Saved to Inbox." });
    expect(await pulledEvent(token, "task.created")).toMatchObject({
      payload: { presetId: "inbox", title: "подумать об отпуске" },
    });

    sent.length = 0;
    await webhook(startUpdate(1002, "/now"));
    expect(sent[0]?.body["text"]).toMatch(/^(Now:|Nothing to do right now\.)/u);
  });
});

describe("the bot's revised previews", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("keeps the request, not the correction, on To Inbox after a revision", async () => {
    const token = await loginAsDev("1002");
    await webhook(textUpdate("подумать о поездке"));
    await chooseTaskPreview();
    sent.length = 0;
    await webhook(textUpdate("нет, на завтра"));
    const toInbox = buttonData("To Inbox");
    expect(toInbox).toMatch(/^i:/u);
    sent.length = 0;
    await webhook(callbackUpdate(toInbox));
    expect(await pulledEvent(token, "task.created")).toMatchObject({
      payload: { presetId: "inbox", title: "подумать о поездке" },
    });
  });
});

describe("notification buttons", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("attends an event from the chat: the activity starts and the message keeps its text", async () => {
    const token = await loginAsDev("1002");
    const { id: userId } = await json<{ id: string }>("/api/me", { token });
    const now = Date.now();
    await pushEvents(token, [
      {
        deviceId: "test",
        id: newId(),
        occurredAt: new Date(now).toISOString(),
        payload: { quietHours: { from: "00:00", to: "00:00" } },
        precision: "exact",
        recordedAt: new Date(now).toISOString(),
        source: "app",
        type: "settings.updated",
      },
    ]);
    const title = `Seminar ${crypto.randomUUID().slice(0, 6)}`;
    await json("/api/calendar/sync", {
      body: {
        deviceId: "phone-1",
        events: [
          {
            endAt: new Date(now + 60 * 60_000).toISOString(),
            id: "ev-1",
            series: null,
            startAt: new Date(now - 2 * 60_000).toISOString(),
            title,
          },
        ],
        from: new Date(now - 24 * 3_600_000).toISOString(),
        to: new Date(now + 24 * 3_600_000).toISOString(),
      },
      token,
    });
    const store = env.USER_STORE.get(env.USER_STORE.idFromName(userId));
    await store.runNotifications(new Date().toISOString());
    const { items } = await json<{ items: { id: string; kind: string }[] }>("/api/notifications", {
      token,
    });
    const announced = items.find((item) => item.kind === "event_start");
    expect(announced).toBeDefined();

    await webhook(callbackUpdate(`na:${announced?.id ?? ""}`));
    expect(sent.map((call) => call.method)).toEqual(["answerCallbackQuery", "editMessageText"]);
    expect(sent[1]?.body["text"]).toBe("preview\n\n✓ Attending");
    expect(await pulledEvent(token, "activity.started")).toMatchObject({
      payload: { buttonId: "calendar", label: title },
    });
    const after = await json<{ items: { id: string; resolution: null | string }[] }>(
      "/api/notifications",
      { token },
    );
    expect(after.items.find((item) => item.id === announced?.id)?.resolution).toBe("attended");

    // A second tap changes nothing.
    sent.length = 0;
    await webhook(callbackUpdate(`na:${announced?.id ?? ""}`));
    expect(sent[1]?.body["text"]).toBe("preview\n\n✓ Attending");
  });

  it("keeps the message and its buttons when the answer is refused, and says why", async () => {
    await loginAsDev("1002");
    await webhook(callbackUpdate("na:no-such-notification"));
    // Not edited: the buttons stay to be tapped again; the refusal shows as an alert.
    expect(sent.map((call) => call.method)).toEqual(["answerCallbackQuery"]);
    expect(sent[0]?.body).toMatchObject({
      show_alert: true,
      text: "That did not work: notification/not-found",
    });
  });
});
