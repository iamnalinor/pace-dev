import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import type { createFakeNotifications } from "#app/testing/notifications.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { createApiClient } from "@pace/client";
import { createFakeFetch } from "@pace/client/testing";

import type { readSessionValue as actualReadSessionValue } from "./session-value.ts";

import * as firebaseProject from "./firebase-project.ts";
import {
  pollNow,
  pushMethodOf,
  pushStore,
  registerPush,
  setPushChoice,
  setupNotificationCategories,
} from "./notifications.ts";
import { handlePushTask } from "./push-task.ts";

const fake = Notifications as unknown as ReturnType<typeof createFakeNotifications>;
const mockCursorRead = {
  gate: null as null | Promise<boolean>,
  started: null as (() => void) | null,
};

jest.mock("./session-value.ts", () => {
  const actual = jest.requireActual<{ readonly readSessionValue: typeof actualReadSessionValue }>(
    "./session-value.ts",
  );
  return {
    ...actual,
    readSessionValue: async (key: string, session: string) => {
      if (key === "pace.push.cursor" && mockCursorRead.gate !== null) {
        mockCursorRead.started?.();
        await mockCursorRead.gate;
      }
      return await actual.readSessionValue(key, session);
    },
  };
});

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

const apiWith = (
  routes: Parameters<typeof createFakeFetch>[0],
  token: () => string | undefined = () =>
    (SecureStore as unknown as FakeSecureStore).values.get("pace.session"),
) => {
  const fetcher = createFakeFetch(routes);
  return {
    api: createApiClient({
      baseUrl: "https://api.test",
      fetch: fetcher.fetch,
      token,
    }),
    fetcher,
  };
};

/**
A server offering `pushMethods`; it refuses (409) the ones in `refusing` all the same. It names
the Firebase project it sends with when given one (`null`: none; absent: an older server).
*/
const registering = (
  pushMethods: readonly string[],
  refusing: readonly string[] = [],
  fcmProject?: null | string,
) =>
  apiWith({
    "GET /api/push/methods": () => ({
      pushMethods,
      ...(fcmProject !== undefined && { fcmProject }),
    }),
    "PUT /api/push/subscription": ({ body }) => {
      const { method } = body as { method: string };
      return refusing.includes(method)
        ? Response.json({ code: "push/method-unavailable", message: "No" }, { status: 409 })
        : { method };
    },
  });

beforeEach(async () => {
  mockCursorRead.gate = null;
  mockCursorRead.started = null;
  await setPushChoice(null);
  fake.state.granted = true;
  fake.state.pushToken = null;
  fake.state.scheduled = [];
  fake.state.dismissed = [];
  fake.state.scheduleGate = null;
  fake.state.scheduleStarted = null;
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

  it("keeps the method chosen in Settings: polling on a phone that has Google's push", async () => {
    fake.state.pushToken = "fcm-token";
    await setPushChoice("poll");
    const { api, fetcher } = registering(["fcm", "poll"]);
    expect(await registerPush(api)).toBe("poll");
    expect(fetcher.calls.at(-1)?.body).toEqual({ method: "poll" });
    expect(pushStore.getState()).toMatchObject({ choice: "poll", method: "poll" });
  });

  it("registers none when chosen, without asking which methods the server has", async () => {
    fake.state.pushToken = "fcm-token";
    await setPushChoice("none");
    const { api, fetcher } = registering(["fcm", "poll"]);
    expect(await registerPush(api)).toBe("none");
    expect(fetcher.pathsCalled("/api/push/methods")).toEqual([]);
    expect(fetcher.calls.at(-1)?.body).toEqual({ method: "none" });
  });

  it("falls back from the chosen method only when the server does not take it", async () => {
    fake.state.pushToken = "fcm-token";
    await setPushChoice("fcm");
    const notOffered = registering(["poll"]);
    expect(await registerPush(notOffered.api)).toBe("poll");
    const refused = registering(["fcm", "poll"], ["fcm"]);
    expect(await registerPush(refused.api)).toBe("poll");
    expect(refused.fetcher.calls.map((call) => call.body)).toEqual([
      undefined,
      { endpoint: "fcm-token", method: "fcm" },
      { method: "poll" },
    ]);
    // The choice stays: Google is used again once the server takes it.
    expect(pushStore.getState()).toMatchObject({ choice: "fcm", method: "poll" });
    expect(await registerPush(registering(["fcm", "poll"]).api)).toBe("fcm");
  });

  it("registers none without the notification permission", async () => {
    fake.state.granted = false;
    const { api, fetcher } = registering(["fcm", "poll"]);
    expect(await registerPush(api)).toBe("none");
    expect(fetcher.pathsCalled("/api/push/methods")).toEqual([]);
  });
});

describe("registerPush and the Firebase project", () => {
  beforeEach(() => {
    fake.state.pushToken = "fcm-token";
    jest.spyOn(firebaseProject, "appFirebaseProject").mockReturnValue("pace-app");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers Google's push with this build's project when the server sends with the same one", async () => {
    const { api, fetcher } = registering(["fcm", "poll"], [], "pace-app");
    expect(await registerPush(api)).toBe("fcm");
    expect(fetcher.calls.at(-1)?.body).toEqual({
      endpoint: "fcm-token",
      method: "fcm",
      projectId: "pace-app",
    });
    expect(pushStore.getState()).toMatchObject({
      isFcmOtherProject: false,
      offered: ["fcm", "poll"],
    });
  });

  it("polls when the server sends with another Firebase project, even when Google's push is picked", async () => {
    // Its pushes would all be refused as SENDER_ID_MISMATCH: nothing would ever arrive.
    await setPushChoice("fcm");
    const { api, fetcher } = registering(["fcm", "poll"], [], "pace-selfhosted");
    expect(await registerPush(api)).toBe("poll");
    expect(fetcher.calls.map((call) => call.body)).toEqual([undefined, { method: "poll" }]);
    expect(pushStore.getState()).toMatchObject({ isFcmOtherProject: true, offered: ["poll"] });
  });

  it("stays on polling start after start once the server refuses its token as another project's", async () => {
    // An older server that does not say its project, or a build that does not know its own.
    jest.spyOn(firebaseProject, "appFirebaseProject").mockReturnValue(null);
    const server = registering(["fcm", "poll"], ["fcm"], null);
    expect(await registerPush(server.api)).toBe("poll");
    expect(await registerPush(server.api)).toBe("poll");
    expect(await pushMethodOf()).toBe("poll");
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
  beforeEach(async () => {
    await SecureStore.setItemAsync("pace.session", "session-A");
  });

  it("starts at zero for each signed-in session so another account keeps its pending notices", async () => {
    await SecureStore.deleteItemAsync("pace.push.cursor");
    const requests: { readonly session: string; readonly after: null | string }[] = [];
    const { api } = apiWith({
      "GET /api/push/poll": async ({ url }) => {
        const current = await SecureStore.getItemAsync("pace.session");
        requests.push({ session: current ?? "", after: url.searchParams.get("after") });
        const after = Number(url.searchParams.get("after"));
        return current === "session-A"
          ? { cursor: 100, entries: [] }
          : {
              cursor: 5,
              entries:
                after === 0
                  ? [
                      {
                        body: "Signed in: Chrome",
                        notification: login,
                        notificationId: "n-login",
                        title: "New sign-in",
                        type: "show",
                      },
                    ]
                  : [],
            };
      },
    });
    await pollNow(api);
    await SecureStore.setItemAsync("pace.session", "session-B");
    expect(await pollNow(api)).toBe(1);
    expect(requests).toEqual([
      { session: "session-A", after: "0" },
      { session: "session-B", after: "0" },
    ]);
    expect(fake.state.scheduled).toEqual([expect.objectContaining({ identifier: "n-login" })]);
    await pollNow(api);
    expect(requests.at(-1)).toEqual({ session: "session-B", after: "5" });
  });

  it("ignores an old session's poll response after the account changes", async () => {
    await SecureStore.deleteItemAsync("pace.push.cursor");
    const response = Promise.withResolvers<unknown>();
    const started = Promise.withResolvers<boolean>();
    const { api } = apiWith({
      "GET /api/push/poll": () => {
        started.resolve(true);
        return response.promise;
      },
    });
    const pending = pollNow(api);
    await started.promise;
    await SecureStore.setItemAsync("pace.session", "session-B");
    response.resolve({
      cursor: 100,
      entries: [
        {
          body: "Signed in: Chrome",
          notification: login,
          notificationId: "n-login",
          title: "New sign-in",
          type: "show",
        },
      ],
    });
    expect(await pending).toBe(0);
    expect(fake.state.scheduled).toEqual([]);
    expect(await SecureStore.getItemAsync("pace.push.cursor")).toBeNull();
  });

  it("takes back a show that finishes after the account changes", async () => {
    await SecureStore.deleteItemAsync("pace.push.cursor");
    const started = Promise.withResolvers<boolean>();
    const gate = Promise.withResolvers<boolean>();
    fake.state.scheduleStarted = () => {
      started.resolve(true);
    };
    fake.state.scheduleGate = gate.promise;
    const { api } = apiWith({
      "GET /api/push/poll": () => ({
        cursor: 1,
        entries: [
          {
            body: "Signed in: Chrome",
            notification: login,
            notificationId: "n-login",
            title: "New sign-in",
            type: "show",
          },
        ],
      }),
    });
    const pending = pollNow(api);
    await started.promise;
    await SecureStore.setItemAsync("pace.session", "session-B");
    gate.resolve(true);
    expect(await pending).toBe(0);
    expect(fake.state.dismissed).toEqual(["n-login"]);
    expect(await SecureStore.getItemAsync("pace.push.cursor")).toBeNull();
  });

  it("does not poll with A's cursor after the session changes while reading it", async () => {
    await SecureStore.setItemAsync(
      "pace.push.cursor",
      JSON.stringify({ session: "session-A", value: 100 }),
    );
    let activeToken = "session-A";
    const started = Promise.withResolvers<boolean>();
    const gate = Promise.withResolvers<boolean>();
    mockCursorRead.started = () => {
      started.resolve(true);
    };
    mockCursorRead.gate = gate.promise;
    const { api, fetcher } = apiWith(
      { "GET /api/push/poll": () => ({ cursor: 100, entries: [] }) },
      () => activeToken,
    );
    const pending = pollNow(api);
    await started.promise;
    // Auth changes its in-memory token before the secure-store write finishes.
    activeToken = "session-B";
    gate.resolve(true);
    expect(await pending).toBe(0);
    expect(fetcher.pathsCalled("/api/push/poll")).toEqual([]);
  });

  it("applies concurrent polls in order so a later dismissal stays last", async () => {
    await SecureStore.deleteItemAsync("pace.push.cursor");
    const first = Promise.withResolvers<unknown>();
    const started = Promise.withResolvers<boolean>();
    const afters: string[] = [];
    const { api } = apiWith({
      "GET /api/push/poll": ({ url }) => {
        afters.push(url.searchParams.get("after") ?? "");
        if (afters.length === 1) {
          started.resolve(true);
          return first.promise;
        }
        return { cursor: 2, entries: [{ notificationId: "n-login", type: "dismiss" }] };
      },
    });
    const earlier = pollNow(api);
    await started.promise;
    const later = pollNow(api);
    first.resolve({
      cursor: 1,
      entries: [
        {
          body: "Signed in: Chrome",
          notification: login,
          notificationId: "n-login",
          title: "New sign-in",
          type: "show",
        },
      ],
    });
    expect(await earlier).toBe(1);
    expect(await later).toBe(1);
    expect(afters).toEqual(["0", "1"]);
    expect(fake.state.dismissed).toEqual(["n-login"]);
    expect(
      JSON.parse((await SecureStore.getItemAsync("pace.push.cursor")) ?? "null"),
    ).toMatchObject({
      session: "session-A",
      value: 2,
    });
  });

  it("does not reuse a legacy device-wide cursor", async () => {
    await SecureStore.setItemAsync("pace.push.cursor", "100");
    const requests: string[] = [];
    const { api } = apiWith({
      "GET /api/push/poll": ({ url }) => {
        requests.push(url.searchParams.get("after") ?? "");
        return { cursor: 1, entries: [] };
      },
    });
    await pollNow(api);
    expect(requests).toEqual(["0"]);
  });

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
