import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { type CalendarEvent, endpoints, newId } from "@pace/core";

import type { FcmTarget } from "../src/shared/fcm.ts";
import type { TelegramTarget } from "../src/shared/telegram-api.ts";
import type { Couriers } from "../src/user-store/notification-pool.ts";
import type { UserStore } from "../src/user-store/user-store.ts";

import { sha256Hex } from "../src/shared/crypto.ts";
import { subscribe, subscriptionsOf, unsubscribe } from "../src/shared/push-subscriptions.ts";
import { acceptedMethods, isRegistrable, pushMethodsOf } from "../src/shared/push/registry.ts";
import { POOL_NEXT_AT_KEY } from "../src/user-store/pool-retry-alarm.ts";
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

/** The lease a first pass in a row holds (`pool-retry-alarm.ts`). */
const LEASE_MS = 5 * 60_000;

/**
After a pass at `passAt` run as the alarm's (the runtime took the alarm off first): the pool keeps
the time the pass answered as its own (`pool:next-at`, which every retry moves earlier), and the
store's alarm is the pass's lease's end or that time, whichever comes first.
*/
const expectArmedAfterPass = async (
  state: DurableObjectState,
  { nextAt, passAt }: { readonly nextAt: string; readonly passAt: string },
): Promise<void> => {
  expect(await state.storage.get<number>(POOL_NEXT_AT_KEY)).toBe(Date.parse(nextAt));
  expect(await state.storage.getAlarm()).toBe(
    Math.min(Date.parse(passAt) + LEASE_MS, Date.parse(nextAt)),
  );
};

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

/** What `notify` added; a refusal fails the test. */
const added = <T>(result: { readonly ok: false } | { readonly ok: true; readonly value: T }): T => {
  if (!result.ok) {
    throw new Error("the notification was refused");
  }
  return result.value;
};

const couriersOf = (telegram: TelegramTarget, fcm: FcmTarget | null = null): Couriers => ({
  push: { fcm },
  telegram,
});

describe("the deadline digest", () => {
  it("stops retrying a Telegram dismissal when the bot transport is no longer configured", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      const started = new Date().toISOString();
      await instance.notifyTo("1002", started);
      const telegram = telegramRecorder();
      const notification = added(
        await instance.notify(
          {
            kind: "login",
            payload: {
              country: "Germany",
              ip: SIGN_IN_IP,
              kind: "web",
              name: "Chrome",
              sessionId: "unconfigured-telegram-dismiss",
            },
          },
          started,
          { couriers: couriersOf(telegram.target) },
        ),
      );
      const withoutTelegram: Couriers = { push: { fcm: null }, telegram: null };
      await instance.resolveNotification(notification.id, "read", {
        couriers: withoutTelegram,
        now: new Date(Date.parse(started) + 1000).toISOString(),
        origin: "app",
      });
      const passAt = new Date(Date.parse(started) + 61_000).toISOString();
      await state.storage.deleteAlarm();
      const run = await instance.runNotifications(passAt, withoutTelegram);
      expect(telegram.sent()).toHaveLength(1);
      expect(telegram.calls.filter((entry) => entry.method === "deleteMessage")).toHaveLength(0);
      await expectArmedAfterPass(state, { nextAt: run.nextAt, passAt });
      expect(
        (await instance.listNotifications({ limit: 5 })).deliveries[notification.id]?.[0],
      ).toMatchObject({ dismissedAt: null, reason: "dismissal-unavailable" });
    });
  });

  it("does not keep retrying a Telegram deletion refused as permanently impossible", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      const started = new Date().toISOString();
      await instance.notifyTo("1002", started);
      let removalAttempts = 0;
      const normal = telegramRecorder();
      const telegram: TelegramTarget = {
        ...normal.target,
        fetch: async (input, init) => {
          if (String(input).endsWith("/deleteMessage")) {
            removalAttempts += 1;
            return Response.json(
              { ok: false, description: "Bad Request: message to delete not found" },
              { status: 400 },
            );
          }
          return await normal.target.fetch(input, init);
        },
      };
      const couriers = couriersOf(telegram);
      const notification = added(
        await instance.notify(
          {
            kind: "login",
            payload: {
              country: "Germany",
              ip: SIGN_IN_IP,
              kind: "web",
              name: "Chrome",
              sessionId: "terminal-delete",
            },
          },
          started,
          { couriers },
        ),
      );
      const resolvedAt = new Date(Date.parse(started) + 1000).toISOString();
      await instance.resolveNotification(notification.id, "read", {
        couriers,
        now: resolvedAt,
        origin: "app",
      });
      const passAt = new Date(Date.parse(started) + 61_000).toISOString();
      await state.storage.deleteAlarm();
      const run = await instance.runNotifications(passAt, couriers);
      expect(removalAttempts).toBe(1);
      await expectArmedAfterPass(state, { nextAt: run.nextAt, passAt });
      expect(
        (await instance.listNotifications({ limit: 5 })).deliveries[notification.id]?.[0],
      ).toMatchObject({ dismissedAt: null, reason: "dismissal-refused" });
    });
  });

  it("retries a refused Telegram deletion after an app answer", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      await instance.notifyTo("1002", CROSSED);
      const telegram = telegramRecorder();
      let removalAttempts = 0;
      const flaky: TelegramTarget = {
        ...telegram.target,
        fetch: async (input, init) => {
          return String(input).endsWith("/deleteMessage") && removalAttempts++ === 0
            ? Response.json({ ok: false }, { status: 500 })
            : await telegram.target.fetch(input, init);
        },
      };
      const couriers = couriersOf(flaky);
      const notification = added(
        await instance.notify(
          {
            kind: "login",
            payload: {
              country: "Germany",
              ip: SIGN_IN_IP,
              kind: "web",
              name: "Chrome",
              sessionId: "delete-retry",
            },
          },
          CROSSED,
          { couriers },
        ),
      );
      await instance.resolveNotification(notification.id, "read", {
        couriers,
        now: "2026-10-07T08:01:00.000Z",
        origin: "app",
      });
      expect(
        (await instance.listNotifications({ limit: 5 })).deliveries[notification.id]?.[0]
          ?.dismissedAt,
      ).toBeNull();
      expect(await state.storage.getAlarm()).not.toBeNull();
      await instance.runNotifications("2026-10-07T08:02:00.000Z", couriers);
      expect(removalAttempts).toBe(2);
      expect(
        (await instance.listNotifications({ limit: 5 })).deliveries[notification.id]?.[0]
          ?.dismissedAt,
      ).toBe("2026-10-07T08:02:00.000Z");
      await instance.runNotifications("2026-10-07T08:03:00.000Z", couriers);
      expect(removalAttempts).toBe(2);
    });
  });

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
      // The log has the Telegram copy: sent at the start, taken back at the answer.
      const page = await instance.listNotifications({ limit: 5 });
      expect(page.deliveries[id]).toEqual([
        {
          at: SEMINAR.startAt,
          device: "Telegram",
          dismissedAt: now,
          method: "telegram",
          reason: null,
          result: "sent",
        },
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
      // Answered in Telegram: the bot edits the message there, nothing is deleted, and the
      // feed does not claim it was taken back from Telegram.
      expect(telegram.calls.map((entry) => entry.method)).toEqual(["sendMessage"]);
      const page = await instance.listNotifications({ limit: 5 });
      expect(page.deliveries[id]).toEqual([
        expect.objectContaining({ dismissedAt: null, method: "telegram", result: "sent" }),
      ]);

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
    const login = added(
      await store.notify(
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
      ),
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

/** How FCM answers one send: a status, with FCM's error code and the field it names. */
type FcmAnswer =
  | number
  | { readonly status: number; readonly errorCode: string; readonly field?: string };

/** FCM's error body as HTTP v1 sends it (`google.rpc.Status` with an `FcmError` detail). */
const fcmErrorBody = (answer: Exclude<FcmAnswer, number>) => ({
  error: {
    code: answer.status,
    details: [
      {
        "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
        errorCode: answer.errorCode,
      },
      ...(answer.field === undefined
        ? []
        : [
            {
              "@type": "type.googleapis.com/google.rpc.BadRequest",
              fieldViolations: [{ description: "Invalid value", field: answer.field }],
            },
          ]),
    ],
    message: "Request contains an invalid argument.",
    status: answer.errorCode,
  },
});

const fcmResponse = (answer: FcmAnswer): Response => {
  if (typeof answer !== "number") {
    return Response.json(fcmErrorBody(answer), { status: answer.status });
  }
  return Response.json(answer === 200 ? { name: "projects/pace-test/messages/1" } : {}, {
    status: answer,
  });
};

/**
Google's OAuth and FCM, answering as told: `token` for the token call; `send` for sends, one
answer per send in turn (the last one repeats).
*/
const fcmRecorder = async (
  answers: { readonly token?: number; readonly send?: FcmAnswer | readonly FcmAnswer[] } = {},
) => {
  const sendAnswers: readonly FcmAnswer[] = Array.isArray(answers.send)
    ? answers.send
    : [answers.send ?? 200];
  let sent = 0;
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
      const answer = sendAnswers[Math.min(sent, sendAnswers.length - 1)] ?? 200;
      sent += 1;
      return fcmResponse(answer);
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
  return {
    sessionId: session?.id ?? "",
    stub: env.USER_STORE.get(env.USER_STORE.idFromName(userId)),
    token,
    userId,
  };
};

describe("Firebase push", () => {
  it("stops retrying a failed push when that notification's app channel is turned off", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({ send: 500 });
    await runInDurableObject(stub, async (instance: UserStore, state) => {
      const started = new Date().toISOString();
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      added(
        await instance.notify(
          {
            kind: "login",
            payload: {
              country: "Germany",
              ip: SIGN_IN_IP,
              kind: "web",
              name: "Chrome",
              sessionId: "disabled-app-retry",
            },
          },
          started,
          { couriers },
        ),
      );
      const changedAt = new Date(Date.parse(started) + 1000).toISOString();
      await instance.append(
        [
          envelope("settings.updated", changedAt, {
            notificationChannels: { login: { app: false } },
          }),
        ],
        { now: changedAt },
      );
      // The retry's alarm fires: the runtime takes it off before the pass, which arms only what
      // is still due (nothing moves an alarm set earlier, so a pass outside it would keep it).
      await state.storage.deleteAlarm();
      const passAt = new Date(Date.parse(started) + 61_000).toISOString();
      const run = await instance.runNotifications(passAt, couriers);
      expect(fcm.sends()).toHaveLength(1);
      await expectArmedAfterPass(state, { nextAt: run.nextAt, passAt });
    });
  });

  it("stops retrying a dismissal when the delivering push transport is no longer configured", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder();
    await runInDurableObject(stub, async (instance: UserStore, state) => {
      const started = new Date().toISOString();
      const telegram = telegramRecorder().target;
      const notification = added(
        await instance.notify(
          {
            kind: "login",
            payload: {
              country: "Germany",
              ip: SIGN_IN_IP,
              kind: "web",
              name: "Chrome",
              sessionId: "unconfigured-dismiss",
            },
          },
          started,
          { couriers: couriersOf(telegram, fcm.target) },
        ),
      );
      const withoutFcm = couriersOf(telegram);
      await instance.resolveNotification(notification.id, "read", {
        couriers: withoutFcm,
        now: new Date(Date.parse(started) + 1000).toISOString(),
        origin: "app",
      });
      const passAt = new Date(Date.parse(started) + 61_000).toISOString();
      await state.storage.deleteAlarm();
      const run = await instance.runNotifications(passAt, withoutFcm);
      expect(fcm.sends()).toHaveLength(1);
      await expectArmedAfterPass(state, { nextAt: run.nextAt, passAt });
      expect(
        (await instance.listNotifications({ limit: 5 })).deliveries[notification.id]?.find(
          (entry) => entry.method === "fcm",
        ),
      ).toMatchObject({ dismissedAt: null, reason: "dismissal-unavailable" });
    });
  });

  it("stops retry alarms when the device with a failed send unsubscribes", async () => {
    const { stub, sessionId } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({ send: 500 });
    await runInDurableObject(stub, async (instance: UserStore, state) => {
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      const started = new Date().toISOString();
      added(
        await instance.notify(
          {
            kind: "login",
            payload: {
              country: "Germany",
              ip: SIGN_IN_IP,
              kind: "web",
              name: "Chrome",
              sessionId: "orphan-send",
            },
          },
          started,
          { couriers },
        ),
      );
      await unsubscribe(env.DB, sessionId);
      const now = new Date(Date.parse(started) + 60_000).toISOString();
      // The retry's alarm fires: the runtime takes it off before the pass.
      await state.storage.deleteAlarm();
      const run = await instance.runNotifications(now, couriers);
      await expectArmedAfterPass(state, { nextAt: run.nextAt, passAt: now });
      expect(fcm.sends()).toHaveLength(1);
    });
  });

  it("keeps one way to push per device, even when it registers twice at once", async () => {
    const { sessionId, userId } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const at = async (transport: string, endpoint: string) => {
      await subscribe(env.DB, { endpoint, now: Date.now(), sessionId, transport, userId });
    };
    await Promise.allSettled([at("fcm", `fcm-${crypto.randomUUID()}`), at("poll", sessionId)]);
    const rows = await env.DB.prepare(
      "SELECT transport FROM push_subscriptions WHERE session_id = ?",
    )
      .bind(sessionId)
      .all();
    expect(rows.results).toHaveLength(1);
    // The phone signed in to another account: its token pushes for that account only.
    const token = `fcm-${crypto.randomUUID()}`;
    await at("fcm", token);
    const otherToken = await loginAsDev("1002");
    const { id: otherId } = await json<{ id: string }>("/api/me", { token: otherToken });
    const otherSession = await env.DB.prepare(
      "SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(otherId)
      .first<{ id: string }>();
    await subscribe(env.DB, {
      endpoint: token,
      now: Date.now(),
      sessionId: otherSession?.id ?? "",
      transport: "fcm",
      userId: otherId,
    });
    expect(await subscriptionsOf(env.DB, userId, Date.now())).toEqual([]);
    expect(await subscriptionsOf(env.DB, otherId, Date.now())).toContainEqual(
      expect.objectContaining({ endpoint: token, transport: "fcm" }),
    );
    // The other account's tests expect no phone of its own.
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(otherId).run();
  });

  it("lists only polling and refuses FCM registration without the secret", async () => {
    expect(await answerOf(endpoints.notifications.pushMethods, "/api/push/methods")).toEqual({
      fcmProject: null,
      pushMethods: ["poll"],
    });
    const token = await loginAsDev("1002");
    const refused = await call("/api/push/subscription", {
      body: { endpoint: "fcm-token", method: "fcm", projectId: "pace-test" },
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
    const { stub, token } = await phoneWithToken(pushToken);
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
              paceBody: "Still doing Commute? Started 07:00, usually ~30m.",
              sessionHash: await sha256Hex(token),
              tag: id,
              paceTitle: "Still going?",
              type: "notification",
            }) as unknown,
            token: pushToken,
          },
        },
      ]);
      expect(fcm.sends()[0]?.message.data).not.toHaveProperty("title");
      expect(fcm.sends()[0]?.message.data).not.toHaveProperty("message");
      const page = await instance.listNotifications({ limit: 5 });
      expect(page.deliveries[id]).toEqual([
        // The device as its session is named: a dev login's.
        expect.objectContaining({
          device: "Dev login",
          method: "fcm",
          reason: null,
          result: "sent",
        }),
      ]);
      await instance.resolveNotification(id, "stopped", {
        couriers,
        now: "2026-10-07T08:02:00.000Z",
        origin: "app",
      });
      expect(fcm.sends().at(-1)?.message.data).toEqual({
        notificationId: id,
        sessionHash: await sha256Hex(token),
        type: "dismiss",
      });
      const after = await instance.listNotifications({ limit: 5 });
      expect(after.deliveries[id]?.[0]).toMatchObject({
        at: CROSSED,
        dismissedAt: "2026-10-07T08:02:00.000Z",
        result: "sent",
      });
      // The access token is reused: one token call for three messages.
      expect(fcm.calls.filter((entry) => entry.url.includes("oauth2"))).toHaveLength(1);
    });
  });

  it("withdraws an old FCM copy after its live session switches to polling", async () => {
    const pushToken = `fcm-${crypto.randomUUID()}`;
    const { sessionId, stub, token, userId } = await phoneWithToken(pushToken);
    const fcm = await fcmRecorder();
    await runInDurableObject(stub, async (instance: UserStore) => {
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      await instance.append([commute], { now: COMMUTE_START });
      const id = (await instance.runNotifications(CROSSED, couriers)).created[0]?.id ?? "";
      await subscribe(env.DB, {
        endpoint: sessionId,
        now: Date.now(),
        sessionId,
        transport: "poll",
        userId,
      });
      await instance.resolveNotification(id, "stopped", {
        couriers,
        now: "2026-10-07T08:02:00.000Z",
        origin: "app",
      });
      expect(fcm.sends().at(-1)?.message.data).toEqual({
        notificationId: id,
        sessionHash: await sha256Hex(token),
        type: "dismiss",
      });
      expect(fcm.sends().at(-1)?.message.token).toBe(pushToken);
    });
  });

  it("retries transient Telegram and FCM send failures on the next pool alarm without duplicate delivery", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({ send: [500, 200] });
    const telegram = telegramRecorder();
    let telegramAttempts = 0;
    const flakyTelegram: TelegramTarget = {
      ...telegram.target,
      fetch: async (input, init) => {
        return String(input).endsWith("/sendMessage") && telegramAttempts++ === 0
          ? Response.json({ ok: false }, { status: 500 })
          : await telegram.target.fetch(input, init);
      },
    };
    await runInDurableObject(stub, async (instance: UserStore, state) => {
      await instance.notifyTo("1001", CROSSED);
      const couriers = couriersOf(flakyTelegram, fcm.target);
      const login = added(
        await instance.notify(
          {
            kind: "login",
            payload: {
              country: "Germany",
              ip: SIGN_IN_IP,
              kind: "web",
              name: "Chrome",
              sessionId: "retry-send",
            },
          },
          CROSSED,
          { couriers },
        ),
      );
      expect((await instance.listNotifications({ limit: 5 })).deliveries[login.id]).toEqual([
        expect.objectContaining({ method: "telegram", result: "failed" }),
        expect.objectContaining({ method: "fcm", result: "failed" }),
      ]);
      expect(await state.storage.getAlarm()).not.toBeNull();
      await instance.runNotifications("2026-10-07T08:01:00.000Z", couriers);
      expect(fcm.sends()).toHaveLength(2);
      expect(telegramAttempts).toBe(2);
      await instance.runNotifications("2026-10-07T08:02:00.000Z", couriers);
      expect(fcm.sends()).toHaveLength(2);
      expect(telegramAttempts).toBe(2);
    });
  });

  it("keeps a failed FCM dismissal pending until the next pool pass succeeds", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({ send: [200, 500, 200] });
    await runInDurableObject(stub, async (instance: UserStore, state) => {
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      const login = added(
        await instance.notify(
          {
            kind: "login",
            payload: {
              country: "Germany",
              ip: SIGN_IN_IP,
              kind: "web",
              name: "Chrome",
              sessionId: "retry-dismiss",
            },
          },
          CROSSED,
          { couriers },
        ),
      );
      await instance.resolveNotification(login.id, "read", {
        couriers,
        now: "2026-10-07T08:01:00.000Z",
        origin: "app",
      });
      expect(fcm.sends().map((send) => send.message.data["type"])).toEqual([
        "notification",
        "dismiss",
      ]);
      expect(
        (await instance.listNotifications({ limit: 5 })).deliveries[login.id]?.find(
          (entry) => entry.method === "fcm",
        )?.dismissedAt,
      ).toBeNull();
      expect(await state.storage.getAlarm()).not.toBeNull();
      await instance.runNotifications("2026-10-07T08:02:00.000Z", couriers);
      expect(
        (await instance.listNotifications({ limit: 5 })).deliveries[login.id]?.find(
          (entry) => entry.method === "fcm",
        )?.dismissedAt,
      ).toBe("2026-10-07T08:02:00.000Z");
      expect(fcm.sends()).toHaveLength(3);
    });
  });

  it("stops retrying an FCM dismissal rejected for a mismatched project", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({
      send: [200, { errorCode: "SENDER_ID_MISMATCH", status: 403 }],
    });
    await runInDurableObject(stub, async (instance: UserStore, state) => {
      const started = new Date().toISOString();
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      const notification = added(
        await instance.notify(
          {
            kind: "login",
            payload: {
              country: "Germany",
              ip: SIGN_IN_IP,
              kind: "web",
              name: "Chrome",
              sessionId: "terminal-dismiss",
            },
          },
          started,
          { couriers },
        ),
      );
      const resolvedAt = new Date(Date.parse(started) + 1000).toISOString();
      await instance.resolveNotification(notification.id, "read", {
        couriers,
        now: resolvedAt,
        origin: "app",
      });
      const passAt = new Date(Date.parse(started) + 61_000).toISOString();
      await state.storage.deleteAlarm();
      const run = await instance.runNotifications(passAt, couriers);
      expect(fcm.sends()).toHaveLength(2);
      await expectArmedAfterPass(state, { nextAt: run.nextAt, passAt });
      expect(
        (await instance.listNotifications({ limit: 5 })).deliveries[notification.id]?.find(
          (entry) => entry.method === "fcm",
        ),
      ).toMatchObject({ dismissedAt: null, reason: "dismissal-incompatible" });
    });
  });

  it("drops a token FCM no longer knows, and pushes nothing for a kind off on the app", async () => {
    const pushToken = `fcm-${crypto.randomUUID()}`;
    const { stub, userId } = await phoneWithToken(pushToken);
    const fcm = await fcmRecorder({ send: { errorCode: "UNREGISTERED", status: 404 } });
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
        { couriers: couriersOf(telegramRecorder().target, quiet.target) },
      );
      expect(quiet.calls).toEqual([]);
    });
  });

  it("drops a device whose token is no token or unregistered, FCM staying on for all", async () => {
    const refusals: readonly FcmAnswer[] = [
      { errorCode: "INVALID_ARGUMENT", field: "message.token", status: 400 },
      { errorCode: "UNREGISTERED", status: 404 },
    ];
    for (const refusal of refusals) {
      const { stub, userId } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
      const fcm = await fcmRecorder({ send: refusal });
      await runInDurableObject(stub, async (instance: UserStore) => {
        await instance.append([commute], { now: COMMUTE_START });
        await instance.runNotifications(CROSSED, couriersOf(telegramRecorder().target, fcm.target));
        expect(await subscriptionsOf(env.DB, userId, Date.now())).toEqual([]);
        expect(await acceptedMethods(env.DB, { fcm: fcm.target }, Date.now())).toEqual([
          "fcm",
          "poll",
        ]);
        const page = await instance.listNotifications({ limit: 5 });
        expect(Object.values(page.deliveries).flat()).toEqual([
          expect.objectContaining({ reason: "gone", result: "failed" }),
        ]);
      });
    }
  });

  it("moves a phone whose token another Firebase project issued to polling, and keeps it there", async () => {
    // An APK built with one project's google-services.json, a server sending with another's: every
    // send is SENDER_ID_MISMATCH. Dropping the phone made it register FCM again: no notification, ever.
    const pushToken = `fcm-${crypto.randomUUID()}`;
    const { sessionId, stub, userId } = await phoneWithToken(pushToken);
    const fcm = await fcmRecorder({ send: { errorCode: "SENDER_ID_MISMATCH", status: 403 } });
    const config = { fcm: fcm.target };
    await runInDurableObject(stub, async (instance: UserStore) => {
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      await instance.append([commute], { now: COMMUTE_START });
      const run = await instance.runNotifications(CROSSED, couriers);
      const id = run.created[0]?.id ?? "";
      expect(await subscriptionsOf(env.DB, userId, Date.now())).toEqual([
        expect.objectContaining({ endpoint: sessionId, transport: "poll" }),
      ]);
      // Not lost: the same notification waits for the phone's poll, and the log says why.
      const page = await instance.listNotifications({ limit: 5 });
      expect(page.deliveries[id]).toEqual([
        expect.objectContaining({ method: "fcm", reason: "incompatible", result: "failed" }),
        expect.objectContaining({ method: "poll", result: "queued" }),
      ]);
      const polled = await instance.pollFor(sessionId, { after: 0, now: CROSSED });
      expect(polled.entries).toEqual([
        expect.objectContaining({ notificationId: id, type: "show" }),
      ]);
      // FCM stays on for everyone else; this phone's token is not taken for FCM again.
      expect(await acceptedMethods(env.DB, config, Date.now())).toEqual(["fcm", "poll"]);
      expect(
        await isRegistrable(env.DB, config, {
          endpoint: pushToken,
          method: "fcm",
          now: Date.now(),
        }),
      ).toBe(false);
      expect(
        await isRegistrable(env.DB, config, {
          endpoint: "fcm-other",
          method: "fcm",
          now: Date.now(),
        }),
      ).toBe(true);
      // The next notification goes by polling only.
      const sends = fcm.sends().length;
      const signIn = {
        kind: "login" as const,
        payload: {
          country: "Germany",
          ip: SIGN_IN_IP,
          kind: "web",
          name: "Chrome",
          sessionId: "s",
        },
      };
      const login = added(await instance.notify(signIn, CROSSED, { couriers }));
      expect(fcm.sends()).toHaveLength(sends);
      const logged = (await instance.listNotifications({ limit: 5 })).deliveries[login.id] ?? [];
      expect(logged.filter((entry) => entry.method !== "telegram")).toEqual([
        expect.objectContaining({ method: "poll", result: "queued" }),
      ]);
    });
  });

  it("says which Firebase project it sends with, and refuses a phone of another project", async () => {
    const fcm = await fcmRecorder();
    const config = { fcm: fcm.target };
    expect(await pushMethodsOf(env.DB, config, Date.now())).toEqual({
      fcmProject: "pace-test",
      pushMethods: ["fcm", "poll"],
    });
    expect(await pushMethodsOf(env.DB, { fcm: null }, Date.now())).toEqual({
      fcmProject: null,
      pushMethods: ["poll"],
    });
    const token = {
      endpoint: `fcm-${crypto.randomUUID()}`,
      method: "fcm" as const,
      now: Date.now(),
    };
    expect(await isRegistrable(env.DB, config, { ...token, projectId: "pace-test" })).toBe(true);
    expect(await isRegistrable(env.DB, config, { ...token, projectId: "someone-else" })).toBe(
      false,
    );
    // An app that does not say its project (an older one) is taken, as before.
    expect(await isRegistrable(env.DB, config, token)).toBe(true);
    expect(await isRegistrable(env.DB, { fcm: null }, token)).toBe(false);
  });

  it("keeps the device on a 404 that does not say the token is unregistered", async () => {
    // A 404 is also a project or URL FCM does not know: about the server, not this phone.
    for (const notFound of [404, { errorCode: "NOT_FOUND", status: 404 }] as const) {
      const { stub, userId } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
      const fcm = await fcmRecorder({ send: notFound });
      await runInDurableObject(stub, async (instance: UserStore) => {
        await instance.append([commute], { now: COMMUTE_START });
        await instance.runNotifications(CROSSED, couriersOf(telegramRecorder().target, fcm.target));
        expect(await subscriptionsOf(env.DB, userId, Date.now())).toHaveLength(1);
        const page = await instance.listNotifications({ limit: 5 });
        expect(Object.values(page.deliveries).flat()).toEqual([
          expect.objectContaining({ reason: "failed", result: "failed" }),
        ]);
      });
    }
  });

  it("keeps the device when FCM refuses the message itself, not its token", async () => {
    const { stub, userId } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({
      send: { errorCode: "INVALID_ARGUMENT", field: "message.data", status: 400 },
    });
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append([commute], { now: COMMUTE_START });
      await instance.runNotifications(CROSSED, couriersOf(telegramRecorder().target, fcm.target));
      expect(await subscriptionsOf(env.DB, userId, Date.now())).toHaveLength(1);
      expect(await acceptedMethods(env.DB, { fcm: fcm.target }, Date.now())).toContain("fcm");
    });
  });

  it("mints a fresh access token once when FCM says the one it had is no good", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({ send: [{ errorCode: "UNAUTHENTICATED", status: 401 }, 200] });
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append([commute], { now: COMMUTE_START });
      await instance.runNotifications(CROSSED, couriersOf(telegramRecorder().target, fcm.target));
      expect(fcm.calls.filter((entry) => entry.url.includes("oauth2"))).toHaveLength(2);
      expect(fcm.sends()).toHaveLength(2);
      const page = await instance.listNotifications({ limit: 5 });
      expect(Object.values(page.deliveries).flat()).toEqual([
        expect.objectContaining({ reason: null, result: "sent" }),
      ]);
      expect(await acceptedMethods(env.DB, { fcm: fcm.target }, Date.now())).toContain("fcm");
    });
  });

  it("marks FCM unavailable when a fresh token is refused too, and tries it again an hour later", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({ send: { errorCode: "UNAUTHENTICATED", status: 401 } });
    const now = Date.now();
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append([commute], { now: COMMUTE_START });
      await instance.runNotifications(CROSSED, couriersOf(telegramRecorder().target, fcm.target));
      expect(fcm.sends()).toHaveLength(2);
      expect(await acceptedMethods(env.DB, { fcm: fcm.target }, now)).toEqual(["poll"]);
      // While broken, a device on it is not pushed to, and the log says why.
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      const signIn = {
        kind: "login" as const,
        payload: {
          country: "Germany",
          ip: SIGN_IN_IP,
          kind: "web",
          name: "Chrome",
          sessionId: "s",
        },
      };
      const login = added(await instance.notify(signIn, CROSSED, { couriers }));
      expect(fcm.sends()).toHaveLength(2);
      const page = await instance.listNotifications({ limit: 5 });
      expect(page.deliveries[login.id]).toContainEqual(
        expect.objectContaining({ method: "fcm", reason: "unavailable", result: "failed" }),
      );
      expect(await acceptedMethods(env.DB, { fcm: fcm.target }, now + 59 * 60_000)).toEqual([
        "poll",
      ]);
      expect(await acceptedMethods(env.DB, { fcm: fcm.target }, now + 61 * 60_000)).toEqual([
        "fcm",
        "poll",
      ]);
    });
  });

  it("logs a device it cannot reach once per notification, however often the pass is repeated", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    await runInDurableObject(stub, async (instance: UserStore) => {
      // FCM not set up on this server: the phone on it cannot be reached.
      const couriers = couriersOf(telegramRecorder().target, null);
      const signIn = {
        kind: "login" as const,
        payload: {
          country: "Germany",
          ip: SIGN_IN_IP,
          kind: "web",
          name: "Chrome",
          sessionId: "s",
        },
      };
      const login = added(await instance.notify(signIn, CROSSED, { couriers }));
      added(await instance.notify(signIn, CROSSED, { couriers }));
      added(await instance.notify(signIn, "2026-10-07T08:05:00.000Z", { couriers }));
      const page = await instance.listNotifications({ limit: 5 });
      expect(page.deliveries[login.id]?.filter((entry) => entry.method === "fcm")).toEqual([
        expect.objectContaining({ reason: "unavailable", result: "failed" }),
      ]);
    });
  });

  it("marks FCM unavailable for everyone when Google refuses the server's credentials", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder({ token: 400 });
    await runInDurableObject(stub, async (instance: UserStore) => {
      const couriers = couriersOf(telegramRecorder().target, fcm.target);
      await instance.append([commute], { now: COMMUTE_START });
      expect(await acceptedMethods(env.DB, { fcm: fcm.target }, Date.now())).toEqual([
        "fcm",
        "poll",
      ]);
      await instance.runNotifications(CROSSED, couriers);
      expect(await acceptedMethods(env.DB, { fcm: fcm.target }, Date.now())).toEqual(["poll"]);
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
    const login = added(
      await store.notify(
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
      ),
    );
    const before = await answerOf(endpoints.notifications.list, "/api/notifications", {
      token: laptop,
    });
    expect(before.deliveries[login.id]).toEqual([
      expect.objectContaining({ method: "telegram", result: "sent" }),
      expect.objectContaining({ method: "poll", result: "queued" }),
    ]);

    const first = await answerOf(endpoints.notifications.poll, "/api/push/poll", { token: phone });
    expect(first.entries).toEqual([
      expect.objectContaining({
        body: "You signed in from IP 1.2.3.4 · Germany · Chrome",
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
    expect(after.deliveries[login.id]?.find((entry) => entry.method === "poll")?.result).toBe(
      "sent",
    );

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

describe("the pool's own bookkeeping", () => {
  const longLogin = {
    kind: "login" as const,
    payload: {
      country: "Germany",
      ip: SIGN_IN_IP,
      kind: "web",
      name: "x".repeat(500),
      sessionId: "s-long",
    },
  };

  it("refuses a notification whose payload breaks its contract, storing and sending nothing", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await instance.notifyTo("1002", CROSSED);
      const telegram = telegramRecorder();
      const refused = await instance.notify(longLogin, CROSSED, {
        couriers: couriersOf(telegram.target),
      });
      expect(refused).toEqual({ error: { code: "notification/invalid" }, ok: false });
      expect((await instance.listNotifications({ limit: 5 })).items).toEqual([]);
      expect(telegram.sent()).toEqual([]);
    });
  });

  it("adds one notification per subject, however often it is asked to", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await instance.notifyTo("1002", CROSSED);
      const telegram = telegramRecorder();
      const login = { ...longLogin, payload: { ...longLogin.payload, name: "Chrome" } };
      const first = await instance.notify(login, CROSSED, {
        couriers: couriersOf(telegram.target),
      });
      const second = await instance.notify(login, CROSSED, {
        couriers: couriersOf(telegram.target),
      });
      expect(first.ok && second.ok && first.value.id === second.value.id).toBe(true);
      expect((await instance.listNotifications({ limit: 5 })).items).toHaveLength(1);
      expect(telegram.sent()).toHaveLength(1);
    });
  });

  it("fits a digest of many long tasks into one Telegram message and one push", async () => {
    const { stub } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    const fcm = await fcmRecorder();
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append([setup({ notificationChannels: { deadline_digest: { app: true } } })], {
        now: COMMUTE_START,
      });
      await instance.notifyTo("1001", COMMUTE_START);
      const telegram = telegramRecorder();
      const tasks = Array.from({ length: 60 }, (_, index) => ({
        dueAt: "2026-10-08T07:00:00.000Z",
        dueTz: null,
        taskId: `t-${String(index)}`,
        title: `Task ${String(index)} ${"ж".repeat(190)}`,
      }));
      const couriers = couriersOf(telegram.target, fcm.target);
      const digest = { kind: "deadline_digest" as const, payload: { slot: CROSSED, tasks } };
      added(await instance.notify(digest, CROSSED, { couriers }));
      const text = String(telegram.sent()[0]?.body["text"]);
      expect(text.length).toBeLessThanOrEqual(4096);
      expect(text.endsWith("…")).toBe(true);
      const [push] = fcm.sends();
      const bytes = new TextEncoder().encode(JSON.stringify(push?.message.data)).length;
      expect(bytes).toBeLessThanOrEqual(4096);
    });
  });

  it("loses nothing and sends nothing twice when a pass is cut short", async () => {
    const { sessionId, stub, userId } = await phoneWithToken(`fcm-${crypto.randomUUID()}`);
    await subscribe(env.DB, {
      endpoint: sessionId,
      now: Date.now(),
      sessionId,
      transport: "poll",
      userId,
    });
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append([commute], { now: COMMUTE_START });
      const queued: string[] = [];
      const queue = { isDown: true };
      const poll = {
        enqueue: async (_session: string, entry: { readonly notificationId: string }) => {
          await Promise.resolve();
          if (queue.isDown) {
            throw new Error("the queue's storage is down");
          }
          queued.push(entry.notificationId);
        },
      };
      const couriers: Couriers = { push: { fcm: null, poll }, telegram: telegramRecorder().target };
      await expect(instance.runNotifications(CROSSED, couriers)).rejects.toThrow("down");
      queue.isDown = false;
      const again = await instance.runNotifications(CROSSED, couriers);
      const { items } = await instance.listNotifications({ limit: 5 });
      expect(items).toHaveLength(1);
      expect(again.created.map((created) => created.id)).toEqual([items[0]?.id]);
      expect(queued).toEqual([items[0]?.id]);
      expect((await instance.runNotifications(CROSSED, couriers)).created).toEqual([]);
      expect(queued).toHaveLength(1);
    });
  });
});
