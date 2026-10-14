import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import type { createFakeNotifications } from "#app/testing/notifications.fake.ts";

import { createApiClient } from "@pace/client";
import { createFakeFetch } from "@pace/client/testing";

import {
  pollNow,
  pushMethodOf,
  registerPush,
  setupNotificationCategories,
} from "./notifications.ts";
import { handlePushTask } from "./push-task.ts";

const fake = Notifications as unknown as ReturnType<typeof createFakeNotifications>;

// eslint-disable-next-line sonarjs/no-hardcoded-ip -- the address a sign-in notice shows
const SIGN_IN_IP = "1.2.3.4";

const login = {
  createdAt: "2026-10-07T09:00:00.000Z",
  id: "n-login",
  kind: "login",
  payload: { country: "Germany", ip: SIGN_IN_IP, kind: "web", name: "Chrome", sessionId: "s" },
  readAt: null,
  resolution: null,
  resolvedAt: null,
};

const apiWith = (routes: Parameters<typeof createFakeFetch>[0]) => {
  const fetcher = createFakeFetch(routes);
  return {
    api: createApiClient({ baseUrl: "https://api.test", fetch: fetcher.fetch, token: () => "t" }),
    fetcher,
  };
};

const registering = (pushMethods: readonly string[]) =>
  apiWith({
    "GET /api/push/methods": () => ({ pushMethods }),
    "PUT /api/push/subscription": ({ body }) => ({
      method: (body as { method: string }).method,
    }),
  });

beforeEach(() => {
  fake.state.granted = true;
  fake.state.pushToken = null;
  fake.state.scheduled = [];
  fake.state.dismissed = [];
});

describe("registerPush", () => {
  it("registers Google's push when the server offers it and the phone has a token", async () => {
    fake.state.pushToken = "fcm-token";
    const { api, fetcher } = registering(["fcm", "poll"]);
    expect(await registerPush(api)).toBe("fcm");
    expect(fetcher.calls.at(-1)?.body).toEqual({ endpoint: "fcm-token", method: "fcm" });
    expect(await pushMethodOf()).toBe("fcm");
  });

  it("polls without Google services, and when the server stopped offering Google", async () => {
    const withoutGoogle = registering(["fcm", "poll"]);
    expect(await registerPush(withoutGoogle.api)).toBe("poll");
    fake.state.pushToken = "fcm-token";
    const serverWithout = registering(["poll"]);
    expect(await registerPush(serverWithout.api)).toBe("poll");
    expect(serverWithout.fetcher.calls.at(-1)?.body).toEqual({ method: "poll" });
  });

  it("registers none without the notification permission", async () => {
    fake.state.granted = false;
    const { api, fetcher } = registering(["fcm", "poll"]);
    expect(await registerPush(api)).toBe("none");
    expect(fetcher.pathsCalled("/api/push/methods")).toEqual([]);
  });
});

describe("the answer buttons", () => {
  it("are categories of the answerable kinds, answering without opening the app", async () => {
    await setupNotificationCategories("en");
    expect(fake.state.categories.get("event_start")).toEqual([
      { buttonTitle: "Attend", identifier: "attended", options: { opensAppToForeground: false } },
      { buttonTitle: "Skip", identifier: "skipped", options: { opensAppToForeground: false } },
    ]);
    expect(
      fake.state.categories.get("activity_overrun")?.map((action) => action.identifier),
    ).toEqual(["still", "stopped"]);
  });
});

describe("pollNow", () => {
  it("shows what waits under the pool id, takes back dismissals and acknowledges by cursor", async () => {
    await SecureStore.deleteItemAsync("pace.push.cursor");
    const { api, fetcher } = apiWith({
      "GET /api/push/poll": () => ({
        cursor: 7,
        entries: [
          {
            body: "Signed in: Chrome",
            notification: login,
            notificationId: "n-login",
            title: "New sign-in",
            type: "show",
          },
          { notificationId: "n-old", type: "dismiss" },
        ],
      }),
    });
    expect(await pollNow(api)).toBe(2);
    expect(fake.state.scheduled).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          body: "Signed in: Chrome",
          title: "New sign-in",
        }) as unknown,
        identifier: "n-login",
      }),
    ]);
    expect(fake.state.dismissed).toEqual(["n-old"]);
    await pollNow(api);
    expect(fetcher.calls.at(-1)?.path).toBe("/api/push/poll");
    expect(fetcher.calls.map((call) => call.path)).toHaveLength(2);
  });
});

const SEMINAR_BODY = "📅 Seminar, 10:00–11:00. Attend?";

/** A shown "event starting" as Android hands it back with a button tap. */
const seminarContent = {
  body: SEMINAR_BODY,
  categoryIdentifier: "event_start",
  data: { kind: "event_start", notificationId: "n-2", url: "/notifications" },
  title: "Starting now",
};

describe("the push task", () => {
  it("takes a notification away on a dismiss push", async () => {
    await handlePushTask({ data: { notificationId: "n-1", type: "dismiss" } }, null);
    expect(fake.state.dismissed).toEqual(["n-1"]);
  });

  it("answers an answer button through the resolve endpoint, the notification gone", async () => {
    const { api, fetcher } = apiWith({
      "POST /api/notifications/n-2/resolve": () => ({ notification: { ...login, id: "n-2" } }),
    });
    await handlePushTask(
      {
        actionIdentifier: "attended",
        notification: { request: { content: { data: { notificationId: "n-2" } } } },
      },
      api,
    );
    expect(fake.state.dismissed).toEqual(["n-2"]);
    expect(fetcher.calls.at(-1)).toMatchObject({
      body: { from: "app", resolution: "attended" },
      path: "/api/notifications/n-2/resolve",
    });
  });

  it("keeps the notification, saying the answer did not go through, so it can be tapped again", async () => {
    await setupNotificationCategories("en");
    const { api } = apiWith({
      "POST /api/notifications/n-2/resolve": () =>
        Response.json({ code: "server/error", message: "Down" }, { status: 503 }),
    });
    const tapped = {
      actionIdentifier: "attended",
      notification: { request: { content: seminarContent } },
    };
    await handlePushTask(tapped, api);
    expect(fake.state.dismissed).toEqual([]);
    const shownAgain = {
      content: { ...seminarContent, body: `That did not go through. Try again.\n${SEMINAR_BODY}` },
      identifier: "n-2",
    };
    expect(fake.state.scheduled).toEqual([expect.objectContaining(shownAgain)]);
    // Refused again, from the notification shown again: the line is not added twice.
    await handlePushTask(
      { ...tapped, notification: { request: { content: shownAgain.content } } },
      api,
    );
    expect(fake.state.scheduled.at(-1)).toEqual(expect.objectContaining(shownAgain));
  });

  it("keeps the notification when the phone is signed out", async () => {
    await handlePushTask(
      { actionIdentifier: "skipped", notification: { request: { content: seminarContent } } },
      null,
    );
    expect(fake.state.dismissed).toEqual([]);
    expect(fake.state.scheduled.map((item) => item.identifier)).toEqual(["n-2"]);
  });

  it("ignores a default tap and an unknown button", async () => {
    const { api, fetcher } = apiWith({});
    await handlePushTask(
      {
        actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
        notification: { request: { content: { data: { notificationId: "n-3" } } } },
      },
      api,
    );
    expect(fetcher.calls).toEqual([]);
  });
});
