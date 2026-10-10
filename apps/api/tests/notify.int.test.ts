import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { newId } from "@pace/core";

import type { TelegramTarget } from "../src/shared/telegram-api.ts";
import type { UserStore } from "../src/user-store/user-store.ts";

import { call, json, loginAsDev } from "./helpers.ts";

const MOSCOW = "Europe/Moscow";
const SEEDED = "2026-10-01T06:00:00.000Z";
/** 14:05 Moscow: just after the 14:00 digest window. */
const AFTER_TWO = "2026-10-07T11:05:00.000Z";
/** Due 23:00 Moscow the same day: a personal task is critical from 24 h before. */
const DUE = "2026-10-07T20:00:00.000Z";

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

const setup = (): Raw => envelope("settings.updated", SEEDED, { timezone: MOSCOW });

const report = (createdAt: string): Raw =>
  envelope("task.created", createdAt, {
    dueAt: DUE,
    dueTz: MOSCOW,
    importance: "normal",
    presetId: "personal",
    subtasks: [],
    taskId: "t-report",
    title: "Write the report",
  });

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

/** A Telegram that records every message instead of sending it. */
const recorder = () => {
  const sent: Raw[] = [];
  const target: TelegramTarget = {
    apiRoot: "https://telegram.test",
    fetch: async (_input, init) => {
      sent.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Raw);
      return Response.json({ ok: true, result: { message_id: 1 } });
    },
    token: "123456:TEST-TOKEN",
  };
  return { sent, target };
};

describe("the notifier in the user store", () => {
  it("does nothing until the user's chat is known", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      await instance.append([setup(), report("2026-10-07T07:00:00.000Z")], { now: AFTER_TWO });
      const telegram = recorder();
      expect(await instance.runNotifications(AFTER_TWO, telegram.target)).toEqual({
        decisions: 0,
        nextAt: null,
        sent: 0,
      });
      expect(telegram.sent).toEqual([]);
      expect(await state.storage.getAlarm()).toBeNull();
    });
  });

  it("sends the digest, logs every decision and arms the next alarm", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      await instance.append([setup(), report("2026-10-07T07:00:00.000Z")], { now: AFTER_TWO });
      await instance.notifyTo("1002", AFTER_TWO);
      expect(await state.storage.getAlarm()).not.toBeNull();

      const telegram = recorder();
      const run = await instance.runNotifications(AFTER_TWO, telegram.target);
      // The task was already critical before the first check: the digest shows it instead.
      expect(run).toMatchObject({ decisions: 2, sent: 1 });
      expect(telegram.sent).toHaveLength(1);
      expect(telegram.sent[0]).toMatchObject({ chat_id: "1002" });
      expect(String(telegram.sent[0]?.["text"])).toContain("Pace · 14:00");
      expect(String(telegram.sent[0]?.["text"])).toContain("Write the report");
      // The next window: 21:00 Moscow.
      expect(run.nextAt).toBe("2026-10-07T18:00:00.000Z");
      // Armed (the runtime moves an instant already past on the real clock up to now).
      expect(await state.storage.getAlarm()).not.toBeNull();

      const logged = await instance.decisions({ limit: 10 });
      expect(
        logged
          .map((entry) => `${entry.rule} ${entry.outcome}`)
          .toSorted((a, b) => a.localeCompare(b)),
      ).toEqual(["critical suppressed", "digest sent"]);
      expect(await instance.decisions({ limit: 10, taskId: "t-report" })).toHaveLength(1);
      expect(await instance.decisions({ limit: 10, q: "retro" })).toHaveLength(1);
    });
  });

  it("alerts once with Snooze and Done for a task that turned critical since the last check", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await instance.append([setup()], { now: "2026-10-07T10:00:00.000Z" });
      await instance.notifyTo("1002", "2026-10-07T10:00:00.000Z");
      await instance.runNotifications("2026-10-07T10:00:00.000Z", recorder().target);
      await instance.append([report("2026-10-07T10:30:00.000Z")], {
        now: "2026-10-07T10:30:00.000Z",
      });

      const telegram = recorder();
      await instance.runNotifications("2026-10-07T10:45:00.000Z", telegram.target);
      expect(telegram.sent).toEqual([
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [
                { callback_data: "z:t-report", text: "Snooze" },
                { callback_data: "d:t-report", text: "Done" },
              ],
            ],
          },
          text: "⚠️ Write the report: due today 23:00, 0% done.",
        }),
      ]);
      const again = recorder();
      await instance.runNotifications("2026-10-07T10:50:00.000Z", again.target);
      expect(again.sent).toEqual([]);
    });
  });

  it("keeps a snoozed task quiet and plans the phone's reminders", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await instance.append([setup()], { now: "2026-10-07T10:00:00.000Z" });
      await instance.notifyTo("1002", "2026-10-07T10:00:00.000Z");
      await instance.runNotifications("2026-10-07T10:00:00.000Z", recorder().target);
      await instance.append([report("2026-10-07T10:30:00.000Z")], {
        now: "2026-10-07T10:30:00.000Z",
      });
      await instance.snoozeTask("t-report", "2026-10-07T18:00:00.000Z", "2026-10-07T10:40:00.000Z");
      const telegram = recorder();
      await instance.runNotifications("2026-10-07T10:45:00.000Z", telegram.target);
      expect(telegram.sent).toEqual([]);
      expect(await instance.notifyPlan("2026-10-07T10:45:00.000Z")).toContainEqual({
        at: "2026-10-07T11:00:00.000Z",
        kind: "digest",
      });
    });
  });
});

describe("GET /api/notify/plan and /api/decisions", () => {
  it("answers for the signed-in user and refuses without a session", async () => {
    const token = await loginAsDev("1002");
    const plan = await json<{ items: { kind: string; at: string }[] }>("/api/notify/plan", {
      token,
    });
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.every((item) => item.at > new Date().toISOString())).toBe(true);
    const { decisions } = await json<{ decisions: unknown[] }>("/api/decisions?limit=5", { token });
    expect(Array.isArray(decisions)).toBe(true);
    expect((await call("/api/decisions?limit=0", { token })).status).toBe(422);
    expect((await call("/api/notify/plan")).status).toBe(401);
  });
});

describe("the Limit alert", () => {
  it("arms for the running activity's Limit and sends the alert once", async () => {
    /** 10:00 Moscow: no digest window, nothing else to say. */
    const started = "2026-10-07T07:00:00.000Z";
    const commute = envelope("activity.started", started, {
      activityId: "a-commute",
      category: "commute",
      label: "Commute",
      limitMinutes: 60,
    });
    await runInDurableObject(freshStore(), async (instance: UserStore) => {
      await instance.append([setup(), commute], { now: started });
      await instance.notifyTo("1002", started);
      const telegram = recorder();
      // Half an hour in: nothing to say yet, and the next check is the crossing itself.
      const halfway = await instance.runNotifications("2026-10-07T07:30:00.000Z", telegram.target);
      expect(halfway).toMatchObject({ nextAt: "2026-10-07T08:00:00.000Z", sent: 0 });

      const crossed = "2026-10-07T08:01:00.000Z";
      await instance.runNotifications(crossed, telegram.target);
      const texts = telegram.sent.map((message) => String(message["text"]));
      expect(texts).toEqual([expect.stringContaining("Commute is over its 1h limit")]);
      await instance.runNotifications("2026-10-07T08:30:00.000Z", telegram.target);
      expect(telegram.sent).toHaveLength(1);
    });
  });
});
