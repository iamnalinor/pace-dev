import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type PoolNotification } from "@pace/core";

import { createApiClient } from "./api-client.ts";
import { createFakeFetch, problem } from "./fake-fetch.fake.ts";
import { createNotificationFeed, parseLiveNotice } from "./notifications.ts";
import { eventAnswers, feedModel } from "./view-models/notifications.ts";

const MOSCOW = "Europe/Moscow";

const login = (id: string, createdAt: string, readAt: null | string = null): PoolNotification => ({
  createdAt,
  id,
  kind: "login",
  // eslint-disable-next-line sonarjs/no-hardcoded-ip -- the address a sign-in notice shows
  payload: { country: "Germany", ip: "1.2.3.4", kind: "web", name: "Chrome", sessionId: "s" },
  readAt,
  resolution: null,
  resolvedAt: null,
});

const digest = (id: string, createdAt: string): PoolNotification => ({
  createdAt,
  id,
  kind: "deadline_digest",
  payload: {
    slot: createdAt,
    tasks: [{ dueAt: "2026-10-08T06:00:00.000Z", dueTz: null, taskId: "t", title: "T" }],
  },
  readAt: null,
  resolution: null,
  resolvedAt: null,
});

const seminar = (resolution: PoolNotification["resolution"]): PoolNotification => ({
  createdAt: "2026-10-07T07:00:00.000Z",
  id: "e",
  kind: "event_start",
  payload: {
    end: "2026-10-07T08:30:00.000Z",
    eventKey: "2026-10-07T07:00:00.000Z@Seminar",
    start: "2026-10-07T07:00:00.000Z",
    title: "Seminar",
  },
  readAt: null,
  resolution,
  resolvedAt: resolution === null ? null : "2026-10-07T07:05:00.000Z",
});

describe("feedModel", () => {
  const all = [
    login("01A", "2026-10-06T20:00:00.000Z", "2026-10-06T21:00:00.000Z"),
    digest("01B", "2026-10-07T06:00:00.000Z"),
    login("01C", "2026-10-07T09:00:00.000Z"),
  ];

  it("shows on the web only the kinds on for the web, and counts their unread", () => {
    const model = feedModel(all, { platform: "web", settings: DEFAULT_SETTINGS, zone: MOSCOW });
    // The digest goes to Telegram only by default.
    expect(model.items.map((item) => item.id)).toEqual(["01C", "01A"]);
    expect(model.unread).toBe(1);
    expect(model.unreadIds).toEqual(["01C"]);
  });

  it("follows a channel switched on, and groups by the day in the zone", () => {
    const settings = {
      notificationChannels: {
        ...DEFAULT_SETTINGS.notificationChannels,
        deadline_digest: { app: true, telegram: true, web: false },
      },
    };
    const model = feedModel(all, { platform: "app", settings, zone: MOSCOW });
    expect(model.unread).toBe(2);
    expect(model.days.map((day) => day.items.map((item) => item.id))).toEqual([
      ["01C", "01B"],
      ["01A"],
    ]);
  });

  it("is empty and unread-free with nothing in the pool", () => {
    expect(feedModel([], { platform: "web", settings: DEFAULT_SETTINGS, zone: MOSCOW })).toEqual({
      days: [],
      items: [],
      unread: 0,
      unreadIds: [],
    });
  });

  it("knows the calendar occurrences answered anywhere", () => {
    expect([...eventAnswers([seminar("skipped")])]).toEqual([
      ["2026-10-07T07:00:00.000Z@Seminar", "skipped"],
    ]);
    expect([...eventAnswers([seminar(null), seminar("expired")])]).toEqual([]);
  });
});

const feedWith = (routes: Parameters<typeof createFakeFetch>[0]) => {
  const fake = createFakeFetch(routes);
  const api = createApiClient({ baseUrl: "https://api.test", fetch: fake.fetch, token: () => "t" });
  return { fake, feed: createNotificationFeed({ api, source: "web" }) };
};

describe("createNotificationFeed", () => {
  it("loads, then takes a live notification in and a dismissal as resolved", async () => {
    const { feed } = feedWith({
      "GET /api/notifications": () => ({ deliveries: {}, items: [seminar(null)], more: false }),
    });
    await feed.refresh();
    expect(feed.store.getState()).toMatchObject({ status: "ready" });
    const notice = parseLiveNotice({
      body: "b",
      notification: login("01Z", "2026-10-07T09:00:00.000Z"),
      title: "t",
      type: "notification",
    });
    expect(notice).not.toBeNull();
    if (notice !== null) {
      feed.receive(notice);
    }
    expect(feed.store.getState().items.map((item) => item.id)).toContain("01Z");
    feed.receive({ id: "e", resolution: "skipped", type: "dismiss" });
    expect(feed.store.getState().items.find((item) => item.id === "e")?.resolution).toBe("skipped");
    expect(parseLiveNotice({ seq: 1, type: "changed" })).toBeNull();
  });

  it("reads a newer server's pool: keys it adds dropped, kinds and results it adds left out", async () => {
    const newer = seminar("attended");
    const { feed } = feedWith({
      "GET /api/notifications": () => ({
        deliveries: {
          e: [
            { at: newer.createdAt, device: "Pixel", method: "fcm", reason: null, result: "sent" },
            { at: newer.createdAt, device: "Pixel", method: "fcm", reason: null, result: "read" },
          ],
        },
        items: [
          { ...newer, payload: { ...newer.payload, colour: "red" }, priority: 2 },
          { ...login("x", newer.createdAt), kind: "weather", payload: { rain: true } },
          { ...digest("d", newer.createdAt), resolution: "snoozed", resolvedAt: newer.createdAt },
        ],
        more: false,
        total: 3,
      }),
    });
    await feed.refresh();
    const { deliveries, items } = feed.store.getState();
    expect(items).toEqual([
      newer,
      { ...digest("d", newer.createdAt), resolution: "read", resolvedAt: newer.createdAt },
    ]);
    expect(deliveries["e"]?.map((entry) => entry.result)).toEqual(["sent"]);
    const notice = parseLiveNotice({ id: "e", resolution: "snoozed", type: "dismiss", by: "x" });
    expect(notice).toEqual({ id: "e", resolution: "read", type: "dismiss" });
  });

  it("answers through the resolve endpoint as the web, keeping the store in step", async () => {
    const { fake, feed } = feedWith({
      "GET /api/notifications": () => ({ deliveries: {}, items: [seminar(null)], more: false }),
      "POST /api/notifications/e/resolve": () => ({ notification: seminar("attended") }),
    });
    await feed.refresh();
    expect(await feed.resolve("e", "attended")).toBe(true);
    expect(fake.calls.at(-1)?.body).toEqual({ from: "web", resolution: "attended" });
    expect(feed.store.getState().items[0]?.resolution).toBe("attended");
  });

  it("says a refused answer failed and keeps the item open", async () => {
    const { feed } = feedWith({
      "GET /api/notifications": () => ({ deliveries: {}, items: [seminar(null)], more: false }),
      "POST /api/notifications/e/resolve": () => problem(409, "retro/future"),
    });
    await feed.refresh();
    expect(await feed.resolve("e", "attended")).toBe(false);
    expect(feed.store.getState().items[0]?.resolution).toBeNull();
  });

  it("marks read at once and tells the server; a first load that fails says so", async () => {
    const { fake, feed } = feedWith({
      "GET /api/notifications": () => ({
        deliveries: {},
        items: [login("01A", "2026-10-07T09:00:00.000Z")],
        more: false,
      }),
      "POST /api/notifications/read": () => ({ ok: true }),
    });
    await feed.refresh();
    await feed.markRead(["01A"]);
    expect(feed.store.getState().items[0]?.readAt).not.toBeNull();
    expect(fake.calls.at(-1)).toMatchObject({
      body: { ids: ["01A"] },
      path: "/api/notifications/read",
    });
    const offline = feedWith({});
    await offline.feed.refresh();
    expect(offline.feed.store.getState().status).toBe("failed");
  });
});
