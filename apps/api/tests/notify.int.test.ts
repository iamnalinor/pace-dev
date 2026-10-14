import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { type CalendarEvent, endpoints, newId } from "@pace/core";

import type { FcmTarget } from "../src/shared/fcm.ts";
import type { TelegramTarget } from "../src/shared/telegram-api.ts";
import type { Couriers } from "../src/user-store/notification-pool.ts";
import type { UserStore } from "../src/user-store/user-store.ts";

import { subscribe, subscriptionsOf } from "../src/shared/push-subscriptions.ts";
import { acceptedMethods } from "../src/shared/push/registry.ts";
import { answerOf, call, json, loginAsDev } from "./helpers.ts";

const MOSCOW = "Europe/Moscow";
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- the address a sign-in notice shows
const SIGN_IN_IP = "1.2.3.4";
const SEEDED = "2026-10-01T06:00:00.000Z";
/** 14:05 Moscow: just after the 14:00 slot (the next is 21:00). */
const AFTER_TWO = "2026-10-07T11:05:00.000Z";

type Raw = Record<string, unknown>;

const envelope = (type: string, occurredAt: string, payload: Raw): Raw => ({
  deviceId: "dev-1",
  id: newId(),
  occurredAt,
  payload,
  precision: "exact",
  recordedAt: occurredAt,
  source: "app",
  type,
});

const setup = (extra: Raw = {}): Raw =>
  envelope("settings.updated", SEEDED, { timezone: MOSCOW, ...extra });

/** Due Thursday 09:00 Moscow: within a day of the 21:00 slot's next day. */
const report = (): Raw =>
  envelope("task.created", "2026-10-07T07:00:00.000Z", {
    dueAt: "2026-10-08T06:00:00.000Z",
    dueTz: MOSCOW,
    importance: "normal",
    presetId: "personal",
    subtasks: [],
    taskId: "t-report",
    title: "Write the report",
  });

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

type Call = { readonly method: string; readonly body: Raw };

/** A Telegram that records every call (method and body) instead of making it. */
const telegramRecorder = () => {
  const calls: Call[] = [];
  const target: TelegramTarget = {
    apiRoot: "https://telegram.test",
    fetch: async (input, init) => {
      calls.push({
        body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Raw,
        method: String(input).split("/").at(-1) ?? "",
      });
      return Response.json({ ok: true, result: { message_id: 41 } });
    },
    token: "123456:TEST-TOKEN",
  };
  return { calls, sent: () => calls.filter((entry) => entry.method === "sendMessage"), target };
};

const couriersOf = (telegram: TelegramTarget, fcm: FcmTarget | null = null): Couriers => ({
  push: { fcm },
  telegram,
});

describe("the deadline digest", () => {
  it("is added to the pool at a slot and sent to Telegram with links to its tasks", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      await instance.append([setup(), report()], { now: AFTER_TWO });
      await instance.notifyTo("1002", AFTER_TWO);
      expect(await state.storage.getAlarm()).not.toBeNull();
      const telegram = telegramRecorder();
      const run = await instance.runNotifications(AFTER_TWO, couriersOf(telegram.target));
      expect(run.created.map((item) => item.kind)).toEqual(["deadline_digest"]);
      expect(run.nextAt).toBe("2026-10-07T18:00:00.000Z");
      const [message] = telegram.sent();
      expect(message?.body).toMatchObject({ chat_id: "1002" });
      expect(String(message?.body["text"])).toBe(
        "⏰ Deadlines in the next day\n• Write the report · Thu 09:00 · 18h 55m left",
      );
      expect(message?.body["reply_markup"]).toEqual({
        inline_keyboard: [[{ text: "Write the report", url: `${env.WEB_ORIGIN}/task/t-report` }]],
      });
      const { items } = await instance.listNotifications({ limit: 10 });
      expect(items).toEqual([
        expect.objectContaining({ kind: "deadline_digest", readAt: null, resolvedAt: null }),
      ]);
      // The 21:00 slot: reported already at this deadline.
      const evening = await instance.runNotifications(
        "2026-10-07T18:01:00.000Z",
        couriersOf(telegram.target),
      );
      expect(evening.created).toEqual([]);
    });
  });

  it("stays in the pool but not in Telegram when that channel is off", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      const off = { notificationChannels: { deadline_digest: { telegram: false } } };
      await instance.append([setup(off), report()], { now: AFTER_TWO });
      await instance.notifyTo("1002", AFTER_TWO);
      const telegram = telegramRecorder();
      const run = await instance.runNotifications(AFTER_TWO, couriersOf(telegram.target));
      expect(run.created).toHaveLength(1);
      expect(telegram.calls).toEqual([]);
    });
  });

  it("skips a slot the server slept through by more than 90 minutes", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      const late = "2026-10-07T12:31:00.000Z";
      await instance.append([setup(), report()], { now: late });
      const run = await instance.runNotifications(late, couriersOf(telegramRecorder().target));
      expect(run.created).toEqual([]);
    });
  });
});

/** Wednesday 10:00–11:30 Moscow. */
const SEMINAR = {
  endAt: "2026-10-07T08:30:00.000Z",
  id: "ev-1",
  series: "seminar-series",
  startAt: "2026-10-07T07:00:00.000Z",
  title: "Seminar",
};

const withCalendar = async (
  instance: UserStore,
  options: {
    readonly ruledSeries?: readonly string[];
    readonly events?: readonly CalendarEvent[];
  } = {},
): Promise<void> => {
  await instance.append([setup()], { now: "2026-10-07T06:30:00.000Z" });
  await instance.notifyTo("1002", "2026-10-07T06:30:00.000Z");
  await instance.syncCalendar(
    {
      deviceId: "phone-1",
      events: [SEMINAR],
      from: "2026-10-06T00:00:00.000Z",
      to: "2026-10-09T00:00:00.000Z",
      ...options,
    },
    "2026-10-07T06:30:00.000Z",
  );
};

describe("an event starting", () => {
  it("is announced in Telegram at its start with Attend and Skip, and Attend from the app tracks it and deletes the message", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await withCalendar(instance);
      const telegram = telegramRecorder();
      const couriers = couriersOf(telegram.target);
      const early = await instance.runNotifications("2026-10-07T06:59:00.000Z", couriers);
      expect(early).toMatchObject({ created: [], nextAt: SEMINAR.startAt });
      const run = await instance.runNotifications(SEMINAR.startAt, couriers);
      const [announced] = run.created;
      expect(announced).toMatchObject({ kind: "event_start", payload: { title: "Seminar" } });
      const id = announced?.id ?? "";
      expect(telegram.sent()[0]?.body).toMatchObject({
        reply_markup: {
          inline_keyboard: [
            [
              { callback_data: `na:${id}`, text: "Attend" },
              { callback_data: `ns:${id}`, text: "Skip" },
            ],
          ],
        },
        text: "📅 Seminar, 10:00–11:30. Attend?",
      });

      const now = "2026-10-07T07:03:00.000Z";
      const resolved = await instance.resolveNotification(id, "attended", {
        couriers,
        now,
        origin: "app",
      });
      expect(resolved).toMatchObject({ ok: true, value: { resolution: "attended" } });
      const { state } = await instance.read(now);
      expect(Object.values(state.time.activities)).toEqual([
        expect.objectContaining({ label: "Seminar", startAt: SEMINAR.startAt }),
      ]);
      expect(telegram.calls.filter((entry) => entry.method === "deleteMessage")).toEqual([
        { body: { chat_id: "1002", message_id: 41 }, method: "deleteMessage" },
      ]);
      // A second answer changes nothing.
      const again = await instance.resolveNotification(id, "skipped", {
        couriers,
        now,
        origin: "app",
      });
      expect(again).toMatchObject({ ok: true, value: { resolution: "attended" } });
      expect(
        await instance.resolveNotification(id, "still", { couriers, now, origin: "app" }),
      ).toMatchObject({ ok: true });
    });
  });

  it("is resolved as attended when the event is tracked from anywhere, as expired at its end", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await withCalendar(instance);
      const couriers = couriersOf(telegramRecorder().target);
      await instance.runNotifications(SEMINAR.startAt, couriers);
      await instance.append(
        [
          envelope("activity.started", "2026-10-07T07:01:00.000Z", {
            activityId: "a-1",
            category: "other",
            label: "Seminar",
          }),
        ],
        { now: "2026-10-07T07:02:00.000Z" },
      );
      const { items } = await instance.listNotifications({ limit: 5 });
      expect(items[0]).toMatchObject({ resolution: "attended" });
    });
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await withCalendar(instance);
      const telegram = telegramRecorder();
      await instance.runNotifications(SEMINAR.startAt, couriersOf(telegram.target));
      const end = await instance.runNotifications(SEMINAR.endAt, couriersOf(telegram.target));
      expect(end.created).toEqual([]);
      const { items } = await instance.listNotifications({ limit: 5 });
      expect(items[0]).toMatchObject({ resolution: "expired" });
      expect(telegram.calls.map((entry) => entry.method)).toEqual(["sendMessage", "deleteMessage"]);
    });
  });

  it("is attended from a notification however long its title or the event", async () => {
    // A 200-character title over a 30-hour event: the label is cut and the Expect capped, as the app does.
    const marathon = {
      ...SEMINAR,
      endAt: "2026-10-08T13:00:00.000Z",
      id: "ev-long",
      series: null,
      title: `Hackathon ${"x".repeat(190)}`,
    };
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await withCalendar(instance, { events: [marathon] });
      const couriers = couriersOf(telegramRecorder().target);
      const [announced] = (await instance.runNotifications(SEMINAR.startAt, couriers)).created;
      const now = "2026-10-07T07:05:00.000Z";
      const resolved = await instance.resolveNotification(announced?.id ?? "", "attended", {
        couriers,
        now,
        origin: "telegram",
      });
      expect(resolved).toMatchObject({ ok: true, value: { resolution: "attended" } });
      const { state } = await instance.read(now);
      expect(Object.values(state.time.activities)).toEqual([
        expect.objectContaining({ expectMinutes: 24 * 60, label: marathon.title.slice(0, 80) }),
      ]);
    });
  });

  it("is never announced when skipped beforehand or when its series is answered for good", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await withCalendar(instance);
      await instance.skipCalendarEvent(`${SEMINAR.startAt}@Seminar`, {
        now: "2026-10-07T06:55:00.000Z",
        origin: "app",
      });
      const run = await instance.runNotifications(
        SEMINAR.startAt,
        couriersOf(telegramRecorder().target),
      );
      expect(run.created).toEqual([]);
    });
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await withCalendar(instance, { ruledSeries: ["seminar-series"] });
      const run = await instance.runNotifications(
        SEMINAR.startAt,
        couriersOf(telegramRecorder().target),
      );
      expect(run.created).toEqual([]);
    });
  });
});

const COMMUTE_START = "2026-10-07T07:00:00.000Z";
const CROSSED = "2026-10-07T08:00:00.000Z";
const commute = envelope("activity.started", COMMUTE_START, {
  activityId: "a-commute",
  category: "commute",
  expectMinutes: 30,
  label: "Commute",
});

describe("still doing X?", () => {
  it("asks at twice the Expect, on the phone only by default", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await instance.append([setup(), commute], { now: COMMUTE_START });
      await instance.notifyTo("1002", COMMUTE_START);
      const telegram = telegramRecorder();
      const halfway = await instance.runNotifications(
        "2026-10-07T07:30:00.000Z",
        couriersOf(telegram.target),
      );
      expect(halfway.nextAt).toBe(CROSSED);
      const run = await instance.runNotifications(CROSSED, couriersOf(telegram.target));
      expect(run.created).toEqual([
        expect.objectContaining({
          kind: "activity_overrun",
          payload: expect.objectContaining({ label: "Commute" }) as unknown,
        }),
      ]);
      expect(telegram.calls).toEqual([]);
    });
  });

  it("answers Yes, still in Telegram's buttons too, and takes the ask back when the activity stops elsewhere", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      const everywhere = { notificationChannels: { activity_overrun: { telegram: true } } };
      await instance.append([setup(everywhere), commute], { now: COMMUTE_START });
      await instance.notifyTo("1002", COMMUTE_START);
      const telegram = telegramRecorder();
      const couriers = couriersOf(telegram.target);
      const first = await instance.runNotifications(CROSSED, couriers);
      const id = first.created[0]?.id ?? "";
      expect(telegram.sent()[0]?.body).toMatchObject({
        reply_markup: {
          inline_keyboard: [
            [
              { callback_data: `nk:${id}`, text: "Yes, still" },
              { callback_data: `nx:${id}`, text: "Stop" },
            ],
          ],
        },
        text: "⏱ Still doing Commute? Started 10:00, usually ~30m.",
      });
      const now = "2026-10-07T08:05:00.000Z";
      await instance.resolveNotification(id, "still", { couriers, now, origin: "telegram" });
      const { state } = await instance.read(now);
      expect(state.time.activities["a-commute"]).toMatchObject({ stillAt: now });
      // Answered in Telegram: the bot edits the message there, nothing is deleted.
      expect(telegram.calls.map((entry) => entry.method)).toEqual(["sendMessage"]);

      // The next ask, at twice as far again, then a stop from the phone. Taking it back runs
      // with the Worker's own Telegram (the test one, behind the global fetch).
      const second = await instance.runNotifications("2026-10-07T09:10:00.000Z");
      expect(second.created).toHaveLength(1);
      const outgoing = vi.spyOn(globalThis, "fetch");
      await instance.append(
        [envelope("activity.stopped", "2026-10-07T09:12:00.000Z", { activityId: "a-commute" })],
        { now: "2026-10-07T09:12:00.000Z" },
      );
      const { items } = await instance.listNotifications({ limit: 5 });
      expect(items[0]).toMatchObject({ resolution: "stopped" });
      expect(
        outgoing.mock.calls.map(([input]) =>
          input instanceof Request ? input.url : String(input),
        ),
      ).toContain("https://telegram.test/bot123456:TEST-TOKEN/deleteMessage");
      outgoing.mockRestore();
    });
  });
});

describe("the notifications API", () => {
  it("lists, marks read and answers for the signed-in user only", async () => {
    const token = await loginAsDev("1002");
    expect((await call("/api/notifications")).status).toBe(401);
    const page = await answerOf(endpoints.notifications.list, "/api/notifications?limit=5", {
      token,
    });
    expect(page).toMatchObject({ more: false });
    expect((await call("/api/notifications?limit=0", { token })).status).toBe(422);
    expect((await call("/api/notifications/read", { body: { all: true }, token })).status).toBe(
      200,
    );
    expect((await call("/api/notifications/read", { body: { ids: [] }, token })).status).toBe(422);
    const missing = await call("/api/notifications/nope/resolve", {
      body: { resolution: "read" },
      token,
    });
    expect(missing.status).toBe(404);
    expect(
      (await call("/api/notifications/x/resolve", { body: { resolution: "expired" }, token }))
        .status,
    ).toBe(422);
    expect((await call("/api/calendar/skip", { body: { eventKey: "k" }, token })).status).toBe(200);
  });

  it("reads and answers a notification through the routes", async () => {
    const token = await loginAsDev("1002");
    const { id: userId } = await json<{ id: string }>("/api/me", { token });
    const store = env.USER_STORE.get(env.USER_STORE.idFromName(userId));
    const login = await store.notify(
      {
        kind: "login",
        payload: {
          country: "Germany",
          ip: SIGN_IN_IP,
          kind: "web",
          name: "Chrome on macOS",
          sessionId: "s-1",
        },
      },
      new Date().toISOString(),
    );
    await call("/api/notifications/read", { body: { ids: [login.id] }, token });
    const listed = await answerOf(endpoints.notifications.list, "/api/notifications", { token });
    expect(listed.items.find((item) => item.id === login.id)?.readAt).not.toBeNull();
    const wrong = await call(`/api/notifications/${login.id}/resolve`, {
      body: { resolution: "attended" },
      token,
    });
    expect(wrong.status).toBe(422);
    const read = await answerOf(
      endpoints.notifications.resolve,
      `/api/notifications/${login.id}/resolve`,
      {
        body: { resolution: "read" },
        token,
      },
    );
    expect(read.notification.resolution).toBe("read");
  });
});

/** A service account key made for the test: Google is stubbed, the signature is real. */
const testServiceAccount = async (): Promise<string> => {
  const keys = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const base64 = btoa(String.fromCodePoint(...der));
  return JSON.stringify({
    client_email: "pace@pace-test.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`,
    private_key_id: crypto.randomUUID(),
    project_id: "pace-test",
    token_uri: "https://oauth2.test/token",
  });
};

type FcmCall = { readonly url: string; readonly body: string; readonly auth: null | string };

/** Google's OAuth and FCM, answering as told: `token` for the token call, `send` for sends. */
const fcmRecorder = async (answers: { readonly token?: number; readonly send?: number } = {}) => {
  const calls: FcmCall[] = [];
  const { fcmTargetOf } = await import("../src/shared/fcm.ts");
  const target = fcmTargetOf(
    { FIREBASE_SERVICE_ACCOUNT: await testServiceAccount() },
    async (input, init) => {
      calls.push({
        auth: new Headers(init.headers).get("Authorization"),
        body: typeof init.body === "string" ? init.body : "",
        url: input,
      });
      if (input.startsWith("https://oauth2.test")) {
        const status = answers.token ?? 200;
        return status === 200
          ? Response.json({ access_token: "ya29.test", expires_in: 3600 })
          : Response.json({ error: "invalid_grant" }, { status });
      }
      const status = answers.send ?? 200;
      return Response.json(status === 200 ? { name: "projects/pace-test/messages/1" } : {}, {
        status,
      });
    },
  );
  const sends = () =>
    calls
      .filter((entry) => entry.url.includes("fcm.googleapis.com"))
      .map(
        (entry) =>
          JSON.parse(entry.body) as { message: { data: Raw; token: string; android: Raw } },
      );
  return { calls, sends, target };
};

/** A signed-in phone with an FCM token (the account's only one), and its emptied store. */
const phoneWithToken = async (pushToken: string) => {
  const token = await loginAsDev("1001");
  const { id: userId } = await json<{ id: string }>("/api/me", { token });
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(userId).run();
  await env.USER_STORE.get(env.USER_STORE.idFromName(userId)).wipe();
  const session = await env.DB.prepare(
    "SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(userId)
    .first<{ id: string }>();
  await subscribe(env.DB, {
    endpoint: pushToken,
    now: Date.now(),
    sessionId: session?.id ?? "",
    transport: "fcm",
    userId,
  });
  return { stub: env.USER_STORE.get(env.USER_STORE.idFromName(userId)), token, userId };
};

describe("Firebase push", () => {
  it("lists only polling and refuses FCM registration without the secret", async () => {
    expect(await answerOf(endpoints.notifications.pushMethods, "/api/push/methods")).toEqual({
      pushMethods: ["poll"],
    });
    const token = await loginAsDev("1002");
    const refused = await call("/api/push/subscription", {
      body: { endpoint: "fcm-token", method: "fcm" },
      method: "PUT",
      token,
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "push/method-unavailable" });
    expect(
      await answerOf(endpoints.notifications.push, "/api/push/subscription", {
        body: { method: "none" },
        method: "PUT",
        token,
      }),
    ).toEqual({ method: "none" });
  });

  it("pushes an app-channel notification with the pool id as tag, logs it and dismisses it on resolve", async () => {
    const pushToken = `fcm-${crypto.randomUUID()}`;
    const { stub } = await phoneWithToken(pushToken);
    const fcm = await fcmRecorder();
    await runInDurableObject(stub, async (instance: UserStore) => {
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      await instance.append([commute], { now: COMMUTE_START });
      const run = await instance.runNotifications(CROSSED, couriers);
      const id = run.created[0]?.id ?? "";
      expect(fcm.calls[0]?.url).toBe("https://oauth2.test/token");
      expect(fcm.calls[1]?.auth).toBe("Bearer ya29.test");
      expect(fcm.sends()).toEqual([
        {
          message: {
            android: { collapse_key: id, priority: "high" },
            data: expect.objectContaining({
              categoryId: "activity_overrun",
              message: "Still doing Commute? Started 07:00, usually ~30m.",
              tag: id,
              title: "Still going?",
              type: "notification",
            }) as unknown,
            token: pushToken,
          },
        },
      ]);
      const page = await instance.listNotifications({ limit: 5 });
      expect(page.deliveries[id]).toEqual([
        expect.objectContaining({ device: "dev", method: "fcm", reason: null, result: "sent" }),
      ]);
      await instance.resolveNotification(id, "stopped", {
        couriers,
        now: "2026-10-07T08:02:00.000Z",
        origin: "app",
      });
      expect(fcm.sends().at(-1)?.message.data).toEqual({ notificationId: id, type: "dismiss" });
      const after = await instance.listNotifications({ limit: 5 });
      expect(after.deliveries[id]?.[0]).toMatchObject({ result: "dismissed" });
      // The access token is reused: one token call for three messages.
      expect(fcm.calls.filter((entry) => entry.url.includes("oauth2"))).toHaveLength(1);
    });
  });

  it("drops a token FCM no longer knows, and pushes nothing for a kind off on the app", async () => {
    const pushToken = `fcm-${crypto.randomUUID()}`;
    const { stub, userId } = await phoneWithToken(pushToken);
    const fcm = await fcmRecorder({ send: 404 });
    await runInDurableObject(stub, async (instance: UserStore) => {
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      await instance.append([commute], { now: COMMUTE_START });
      await instance.runNotifications(CROSSED, couriers);
      expect(await subscriptionsOf(env.DB, userId, Date.now())).toEqual([]);
      const page = await instance.listNotifications({ limit: 5 });
      expect(Object.values(page.deliveries).flat()).toEqual([
        expect.objectContaining({ reason: "gone", result: "failed" }),
      ]);
    });
    const quiet = await fcmRecorder();
    const second = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    await runInDurableObject(second.stub, async (instance: UserStore) => {
      await instance.notify(
        {
          kind: "deadline_digest",
          payload: {
            slot: CROSSED,
            tasks: [{ dueAt: SEMINAR.endAt, dueTz: null, taskId: "t", title: "T" }],
          },
        },
        CROSSED,
        couriersOf(telegramRecorder().target, quiet.target),
      );
      expect(quiet.calls).toEqual([]);
    });
  });

  it("marks FCM unavailable for everyone when Google refuses the server's credentials", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({ token: 400 });
    await runInDurableObject(stub, async (instance: UserStore) => {
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      await instance.append([commute], { now: COMMUTE_START });
      expect(await acceptedMethods(env.DB, { fcm: fcm.target })).toEqual(["fcm", "poll"]);
      await instance.runNotifications(CROSSED, couriers);
      expect(await acceptedMethods(env.DB, { fcm: fcm.target })).toEqual(["poll"]);
      const page = await instance.listNotifications({ limit: 5 });
      expect(Object.values(page.deliveries).flat()).toEqual([
        expect.objectContaining({ reason: "unavailable", result: "failed" }),
      ]);
    });
  });
});

describe("polling", () => {
  it("queues what a polling device gets, hands it over once, then the dismissal", async () => {
    const phone = await loginAsDev("1002");
    const laptop = await loginAsDev("1002");
    expect(
      await answerOf(endpoints.notifications.push, "/api/push/subscription", {
        body: { method: "poll" },
        method: "PUT",
        token: phone,
      }),
    ).toEqual({ method: "poll" });
    const { id: userId } = await json<{ id: string }>("/api/me", { token: phone });
    const store = env.USER_STORE.get(env.USER_STORE.idFromName(userId));
    const login = await store.notify(
      {
        kind: "login",
        payload: {
          country: "Germany",
          ip: SIGN_IN_IP,
          kind: "web",
          name: "Chrome",
          sessionId: "s-9",
        },
      },
      new Date().toISOString(),
    );
    const before = await answerOf(endpoints.notifications.list, "/api/notifications", {
      token: laptop,
    });
    expect(before.deliveries[login.id]).toEqual([
      expect.objectContaining({ method: "poll", result: "queued" }),
    ]);

    const first = await answerOf(endpoints.notifications.poll, "/api/push/poll", { token: phone });
    expect(first.entries).toEqual([
      expect.objectContaining({
        body: "Signed in: Chrome · 1.2.3.4 · Germany",
        notification: expect.objectContaining({ id: login.id }) as unknown,
        notificationId: login.id,
        title: "New sign-in",
        type: "show",
      }),
    ]);
    expect(
      (await answerOf(endpoints.notifications.poll, "/api/push/poll", { token: laptop })).entries,
    ).toEqual([]);
    const after = await answerOf(endpoints.notifications.list, "/api/notifications", {
      token: laptop,
    });
    expect(after.deliveries[login.id]?.[0]?.result).toBe("sent");

    await call(`/api/notifications/${login.id}/resolve`, {
      body: { resolution: "read" },
      token: laptop,
    });
    const second = await answerOf(
      endpoints.notifications.poll,
      `/api/push/poll?after=${String(first.cursor)}`,
      {
        token: phone,
      },
    );
    expect(second.entries).toEqual([{ notificationId: login.id, type: "dismiss" }]);
    const third = await answerOf(
      endpoints.notifications.poll,
      `/api/push/poll?after=${String(second.cursor)}`,
      {
        token: phone,
      },
    );
    expect(third.entries).toEqual([]);
    expect((await call("/api/push/poll")).status).toBe(401);
  });
});
