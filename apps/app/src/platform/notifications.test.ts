import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { createHash } from "node:crypto";

import type { createFakeNotifications } from "#app/testing/notifications.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { createApiClient } from "@pace/client";
import { createFakeFetch } from "@pace/client/testing";

import type { readSessionValue as actualReadSessionValue } from "./session-value.ts";

import * as firebaseProject from "./firebase-project.ts";
import * as firebaseRuntime from "./firebase-runtime.ts";
import { clearPresentedPoolNotifications } from "./notification-cleanup.ts";
import {
  isBackgroundStepNeeded,
  loadOfferedMethods,
  loadPushState,
  pollNow,
  pushMethodOf,
  pushStore,
  registerPush,
  setPushChoice,
  setupNotificationCategories,
} from "./notifications.ts";
import { handlePushTask } from "./push-task.ts";
import { serverStore } from "./server-store.ts";

jest.mock("expo-notifications", () => {
  const fakeModule = jest
    .requireActual<{ readonly createFakeNotifications: typeof createFakeNotifications }>(
      "#app/testing/notifications.fake.ts",
    )
    .createFakeNotifications();
  return { ...fakeModule, getDevicePushTokenAsync: jest.fn(fakeModule.getDevicePushTokenAsync) };
});

const mockChoiceRead = {
  gate: null as null | Promise<unknown>,
  started: null as (() => void) | null,
};
const mockChoicePersistence = {
  gate: null as null | Promise<unknown>,
  started: null as (() => void) | null,
};
const mockMethodPersistence = {
  gate: null as null | Promise<void>,
  started: null as (() => void) | null,
};
jest.mock("expo-secure-store", () => {
  const secure = jest
    .requireActual<{ readonly createFakeSecureStore: () => FakeSecureStore }>(
      "#app/testing/secure-store.fake.ts",
    )
    .createFakeSecureStore();
  return {
    ...secure,
    getItemAsync: async (key: string) => {
      const value = await secure.getItemAsync(key);
      if (key === "pace.push.choice" && mockChoiceRead.gate !== null) {
        mockChoiceRead.started?.();
        await mockChoiceRead.gate;
      }
      return value;
    },
    setItemAsync: async (key: string, value: string) => {
      if (key === "pace.push.choice" && value === "fcm") {
        mockChoicePersistence.started?.();
        await mockChoicePersistence.gate;
      }
      if (key === "pace.push.method") {
        mockMethodPersistence.started?.();
        await mockMethodPersistence.gate;
      }
      await secure.setItemAsync(key, value);
    },
  };
});

const fake = Notifications as unknown as ReturnType<typeof createFakeNotifications>;
const SESSION_TOKEN = "session-a";
const SESSION_HASH = createHash("sha256").update(SESSION_TOKEN).digest("hex");
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
  const secure = (SecureStore as unknown as FakeSecureStore).values;
  secure.clear();
  mockChoiceRead.gate = null;
  mockChoiceRead.started = null;
  mockChoicePersistence.gate = null;
  mockChoicePersistence.started = null;
  mockMethodPersistence.gate = null;
  mockMethodPersistence.started = null;
  secure.set("pace.session", SESSION_TOKEN);
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

describe("setPushChoice", () => {
  afterEach(() => {
    (SecureStore as unknown as FakeSecureStore).writes.isRefused = false;
  });

  it("shows the pick at once, before the phone has saved it (bug-lessons 108)", async () => {
    const saved = setPushChoice("poll");
    expect(pushStore.getState().choice).toBe("poll");
    await saved;
    expect((SecureStore as unknown as FakeSecureStore).values.get("pace.push.choice")).toBe("poll");
  });

  it("takes the pick back when the phone refuses to save it", async () => {
    await setPushChoice("poll");
    (SecureStore as unknown as FakeSecureStore).writes.isRefused = true;
    const saved = setPushChoice("fcm");
    expect(pushStore.getState().choice).toBe("fcm");
    await expect(saved).rejects.toThrow("keystore refused the write");
    expect(pushStore.getState().choice).toBe("poll");
  });
});

describe("isBackgroundStepNeeded", () => {
  it("asks for the battery exemption only while the phone polls (owner rule)", () => {
    expect(isBackgroundStepNeeded({ method: "poll" })).toBe(true);
    for (const method of ["fcm", "none", null] as const) {
      expect(isBackgroundStepNeeded({ method })).toBe(false);
    }
  });
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
  data: {
    kind: "event_start",
    notificationId: "n-2",
    sessionHash: SESSION_HASH,
    url: "/notifications",
  },
  title: "Starting now",
};

describe("the push task", () => {
  it("shows a silent FCM notice only while its intended session is current", async () => {
    const store = SecureStore as unknown as FakeSecureStore;
    const token = "session-a";
    const sessionHash = createHash("sha256").update(token).digest("hex");
    const data = {
      kind: "activity_overrun",
      notificationId: "n-silent",
      paceBody: "Still doing Commute?",
      paceTitle: "Still going?",
      sessionHash,
      type: "notification",
    };
    store.values.set("pace.session", token);
    await handlePushTask({ data });
    expect(fake.state.scheduled).toEqual([expect.objectContaining({ identifier: "n-silent" })]);
    store.values.set("pace.session", "session-b");
    await handlePushTask({ data });
    expect(fake.state.scheduled).toHaveLength(1);
    store.values.delete("pace.session");
    await handlePushTask({ data });
    expect(fake.state.scheduled).toHaveLength(1);
  });

  it("dismisses a previous session's answer without sending it or showing it again", async () => {
    const store = SecureStore as unknown as FakeSecureStore;
    store.values.set("pace.session", "session-b");
    const { api, fetcher } = apiWith({});
    await handlePushTask(
      {
        actionIdentifier: "attended",
        notification: {
          request: {
            content: {
              ...seminarContent,
              data: { ...seminarContent.data, sessionHash: "old-session-hash" },
            },
          },
        },
      },
      api,
    );
    expect(fetcher.calls).toEqual([]);
    expect(fake.state.dismissed).toEqual(["n-2"]);
    expect(fake.state.scheduled).toEqual([]);
  });

  it("clears only presented Pace pool notices on logout", async () => {
    fake.state.scheduled = [
      { content: seminarContent, identifier: "n-2" },
      { content: { data: { local: true }, title: "Other" }, identifier: "other" },
      {
        content: { data: { notificationId: "n-b", sessionHash: "session-b" }, title: "B" },
        identifier: "n-b",
      },
    ];
    await clearPresentedPoolNotifications(SESSION_TOKEN);
    expect(fake.state.dismissed).toEqual(["n-2"]);
  });
  it("takes a notification away on a dismiss push", async () => {
    await handlePushTask({
      data: { notificationId: "n-1", sessionHash: SESSION_HASH, type: "dismiss" },
    });
    expect(fake.state.dismissed).toEqual(["n-1"]);
  });

  it("does not show a late FCM notice after its dismissal arrived first", async () => {
    await handlePushTask({
      data: { notificationId: "n-late", sessionHash: SESSION_HASH, type: "dismiss" },
    });
    await handlePushTask({
      data: {
        kind: "activity_overrun",
        notificationId: "n-late",
        paceBody: "Private body",
        paceTitle: "Private title",
        sessionHash: SESSION_HASH,
        type: "notification",
      },
    });
    expect(fake.state.scheduled.some((item) => item.identifier === "n-late")).toBe(false);
  });

  it("withdraws a notice when dismissal arrives while Android is scheduling it", async () => {
    const started = Promise.withResolvers<boolean>();
    const gate = Promise.withResolvers<boolean>();
    fake.state.scheduleStarted = () => {
      started.resolve(true);
    };
    fake.state.scheduleGate = gate.promise;
    const show = handlePushTask({
      data: {
        kind: "activity_overrun",
        notificationId: "n-racing",
        paceBody: "Private body",
        paceTitle: "Private title",
        sessionHash: SESSION_HASH,
        type: "notification",
      },
    });
    await started.promise;
    await handlePushTask({
      data: { notificationId: "n-racing", sessionHash: SESSION_HASH, type: "dismiss" },
    });
    gate.resolve(true);
    await show;
    expect(fake.state.dismissed).toContain("n-racing");
  });

  it("answers an answer button through the resolve endpoint, the notification gone", async () => {
    const { api, fetcher } = apiWith({
      "POST /api/notifications/n-2/resolve": () => ({ notification: { ...login, id: "n-2" } }),
    });
    await handlePushTask(
      {
        actionIdentifier: "attended",
        notification: {
          request: { content: { data: { notificationId: "n-2", sessionHash: SESSION_HASH } } },
        },
      },
      api,
    );
    expect(fake.state.dismissed).toEqual(["n-2"]);
    expect(fetcher.calls.at(-1)).toMatchObject({
      body: { from: "app", resolution: "attended" },
      path: "/api/notifications/n-2/resolve",
    });
  });

  it("answers in the background on the stored server, only with the token stored for it", async () => {
    const store = SecureStore as unknown as FakeSecureStore;
    const server = "https://pace.example.dev";
    store.values.set("pace.server", server);
    store.values.set("pace.session", JSON.stringify({ origin: server, token: SESSION_TOKEN }));
    const fetcher = createFakeFetch({
      "POST /api/notifications/n-2/resolve": () => ({ notification: { ...login, id: "n-2" } }),
    });
    const sent = jest.spyOn(globalThis, "fetch").mockImplementation(fetcher.fetch as typeof fetch);
    const tap = {
      actionIdentifier: "attended",
      notification: {
        request: { content: { data: { notificationId: "n-2", sessionHash: SESSION_HASH } } },
      },
    };
    await handlePushTask(tap);
    const [url, init] = sent.mock.calls[0] ?? [];
    expect(url).toBe(`${server}/api/notifications/n-2/resolve`);
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${SESSION_TOKEN}`);
    sent.mockClear();
    // The same token stored for another server is no session here: nothing is sent anywhere.
    store.values.set(
      "pace.session",
      JSON.stringify({ origin: "https://other.example.dev", token: SESSION_TOKEN }),
    );
    await handlePushTask(tap);
    expect(sent).not.toHaveBeenCalled();
    sent.mockRestore();
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

  it("offers Not me on a sign-in notice and ends that session from it in the background", async () => {
    await setupNotificationCategories("en");
    expect(fake.state.categories.get("login")).toEqual([
      {
        buttonTitle: "Not me — end this session",
        identifier: "revoked",
        options: { opensAppToForeground: false },
      },
    ]);
    const { api, fetcher } = apiWith({
      "POST /api/notifications/n-login/resolve": () => ({
        notification: { ...login, resolution: "revoked", resolvedAt: login.createdAt },
      }),
    });
    await handlePushTask(
      {
        actionIdentifier: "revoked",
        notification: {
          request: {
            content: {
              categoryIdentifier: "login",
              data: { kind: "login", notificationId: "n-login", sessionHash: SESSION_HASH },
            },
          },
        },
      },
      api,
    );
    expect(fetcher.calls.at(-1)).toMatchObject({
      body: { from: "app", resolution: "revoked" },
      path: "/api/notifications/n-login/resolve",
    });
    expect(fake.state.dismissed).toEqual(["n-login"]);
  });

  it("dismisses a private notification when the phone is signed out", async () => {
    await handlePushTask(
      { actionIdentifier: "skipped", notification: { request: { content: seminarContent } } },
      null,
    );
    expect(fake.state.dismissed).toEqual(["n-2"]);
    expect(fake.state.scheduled).toEqual([]);
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

describe("runtime Firebase registration", () => {
  beforeEach(() => {
    jest.spyOn(firebaseRuntime, "isRuntimeFirebase").mockReturnValue(true);
    jest.spyOn(firebaseProject, "appFirebaseProject").mockReturnValue("baked-project");
    fake.state.pushToken = "native-token";
    jest
      .mocked(jest.requireMock<typeof Notifications>("expo-notifications").getDevicePushTokenAsync)
      .mockImplementation(async () => {
        if (fake.state.pushToken === null) {
          throw new Error("services-unavailable");
        }
        return { type: "android", data: fake.state.pushToken };
      });
    serverStore.setState({ origin: "https://api.test" });
    firebaseRuntime.firebaseRuntimeStore.setState({
      origin: "https://api.test",
      status: "ready",
      projectId: "native-project",
      reason: null,
      blockReason: null,
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses the actual initialized native project instead of the baked extra", async () => {
    const { api, fetcher } = registering(["fcm", "poll"], [], "native-project");
    expect(await registerPush(api, "https://api.test")).toBe("fcm");
    expect(fetcher.calls.at(-1)?.body).toEqual({
      method: "fcm",
      endpoint: "native-token",
      projectId: "native-project",
    });
  });

  it.each([
    "server-disabled",
    "package-missing",
    "restart-needed",
    "initialization-failed",
    "storage-failed",
    "unsupported",
    "invalid-config",
  ] as const)("never requests a token for %s", async (blockReason) => {
    firebaseRuntime.firebaseRuntimeStore.setState({ blockReason });
    const token = jest.spyOn(
      jest.requireMock<typeof Notifications>("expo-notifications"),
      "getDevicePushTokenAsync",
    );
    token.mockClear();
    const { api } = registering(["fcm", "poll"], [], "native-project");
    expect(await registerPush(api, "https://api.test")).toBe("poll");
    expect(token).not.toHaveBeenCalled();
    expect(pushStore.getState().fcmIneligibilityReason).toBe(blockReason);
  });

  it("settles after repeated registrations without a retry loop", async () => {
    const { api, fetcher } = registering(["fcm", "poll"], [], "native-project");
    await registerPush(api, "https://api.test");
    await registerPush(api, "https://api.test");
    await Promise.resolve();
    expect(fetcher.calls).toHaveLength(4);
    expect(pushStore.getState().method).toBe("fcm");
  });

  it("polls while native configuration is still unknown", async () => {
    firebaseRuntime.firebaseRuntimeStore.setState({ status: "unknown", projectId: null });
    const token = jest.spyOn(
      jest.requireMock<typeof Notifications>("expo-notifications"),
      "getDevicePushTokenAsync",
    );
    token.mockClear();
    const { api } = registering(["fcm", "poll"], [], "native-project");
    expect(await registerPush(api, "https://api.test")).toBe("poll");
    expect(token).not.toHaveBeenCalled();
    expect(pushStore.getState().fcmIneligibilityReason).toBe("configuration-pending");
  });

  it("falls back with a visible services reason when token retrieval fails", async () => {
    fake.state.pushToken = null;
    const { api } = registering(["fcm", "poll"], [], "native-project");
    expect(await registerPush(api, "https://api.test")).toBe("poll");
    expect(pushStore.getState().offered).toEqual(["poll"]);
    await setPushChoice("poll");
    expect(await registerPush(api, "https://api.test")).toBe("poll");
    await loadOfferedMethods(api, "https://api.test");
    expect(pushStore.getState().offered).toEqual(["poll"]);
    expect(pushStore.getState().fcmIneligibilityReason).toBe("services-unavailable");
    await setPushChoice(null);
    fake.state.pushToken = "recovered-token";
    expect(await registerPush(api, "https://api.test")).toBe("fcm");
    expect(pushStore.getState().offered).toEqual(["fcm", "poll"]);
  });

  it.each([undefined, "https://old.test"])(
    "never requests FCM without the current origin: %s",
    async (origin) => {
      const token = jest.spyOn(
        jest.requireMock<typeof Notifications>("expo-notifications"),
        "getDevicePushTokenAsync",
      );
      token.mockClear();
      const { api } = registering(["fcm", "poll"], [], "native-project");
      await registerPush(api, origin);
      expect(token).not.toHaveBeenCalled();
    },
  );

  it("never requests FCM for an unknown or different server project", async () => {
    const token = jest.spyOn(
      jest.requireMock<typeof Notifications>("expo-notifications"),
      "getDevicePushTokenAsync",
    );
    token.mockClear();
    for (const project of [null, "other-project"]) {
      const { api } = registering(["fcm", "poll"], [], project);
      expect(await registerPush(api, "https://api.test")).toBe("poll");
    }
    expect(token).not.toHaveBeenCalled();
  });

  it("never sends an old subscription with a replacement session after a held client check", async () => {
    const { promise: checking, resolve: checked } = Promise.withResolvers<undefined>();
    const session = { current: SESSION_TOKEN };
    const fetcher = createFakeFetch({
      "GET /api/push/methods": () => ({
        pushMethods: ["fcm", "poll"],
        fcmProject: "native-project",
      }),
      "PUT /api/push/subscription": ({ body }) => ({
        method: (body as { readonly method: string }).method,
      }),
    });
    const api = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetcher.fetch,
      token: () => session.current,
      sessionCheck: (endpoint) =>
        endpoint.path === "/api/push/subscription" ? checking : undefined,
    });
    const registration = registerPush(api, "https://api.test");
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await Promise.resolve();
    }
    session.current = "session-b";
    checked(undefined);
    await registration;
    const subscriptions = fetcher.calls.filter((call) => call.method === "PUT");
    expect(
      subscriptions.every((call) => call.headers["authorization"] === `Bearer ${SESSION_TOKEN}`),
    ).toBe(true);
    await setPushChoice("poll");
    await registerPush(api, "https://api.test");
    expect(fetcher.calls.at(-1)?.headers["authorization"]).toBe("Bearer session-b");
    expect(pushStore.getState().method).toBe("poll");
  });

  it("keeps a newer pick when Settings finishes loading an older stored choice", async () => {
    await setPushChoice("fcm");
    const { promise: gate, resolve: finish } = Promise.withResolvers<undefined>();
    const { promise: reading, resolve: started } = Promise.withResolvers<undefined>();
    mockChoiceRead.gate = gate;
    mockChoiceRead.started = () => {
      started(undefined);
    };
    const loading = loadPushState();
    await reading;
    mockChoiceRead.gate = null;
    await setPushChoice("poll");
    finish(undefined);
    await loading;
    expect(pushStore.getState().choice).toBe("poll");
  });

  it("keeps the latest tap when an older choice write finishes late", async () => {
    const { promise: gate, resolve: finish } = Promise.withResolvers<undefined>();
    const { promise: writing, resolve: started } = Promise.withResolvers<undefined>();
    mockChoicePersistence.gate = gate;
    mockChoicePersistence.started = () => {
      started(undefined);
    };
    const { api, fetcher } = registering(["fcm", "poll"], [], "native-project");
    const pick = async (choice: "fcm" | "poll") => {
      const { isLatest } = await setPushChoice(choice);
      if (isLatest) {
        await registerPush(api, "https://api.test");
      }
    };
    const oldPick = pick("fcm");
    await writing;
    const newPick = pick("poll");
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await Promise.resolve();
    }
    finish(undefined);
    await Promise.all([oldPick, newPick]);
    expect((SecureStore as unknown as FakeSecureStore).values.get("pace.push.choice")).toBe("poll");
    expect(pushStore.getState()).toMatchObject({ choice: "poll", method: "poll" });
    expect(
      fetcher.calls
        .filter((call) => call.method === "PUT")
        .map((call) => (call.body as { readonly method: string }).method),
    ).toEqual(["poll"]);
  });

  it("lets the latest saved choice win when an older token arrives late", async () => {
    const { promise: pending, resolve: finish } = Promise.withResolvers<{
      type: "android";
      data: string;
    }>();
    const { promise: requesting, resolve: started } = Promise.withResolvers<undefined>();
    const token = jest.spyOn(
      jest.requireMock<typeof Notifications>("expo-notifications"),
      "getDevicePushTokenAsync",
    );
    token.mockImplementation(async () => {
      started(undefined);
      return await pending;
    });
    const { api, fetcher } = registering(["fcm", "poll"], [], "native-project");
    const oldRegistration = registerPush(api, "https://api.test");
    await requesting;
    await setPushChoice("poll");
    await registerPush(api, "https://api.test");
    finish({ type: "android", data: "old-token" });
    await oldRegistration;
    expect(fetcher.calls.filter((call) => call.method === "PUT").map((call) => call.body)).toEqual([
      { method: "poll" },
    ]);
    expect(await pushMethodOf()).toBe("poll");
    expect(pushStore.getState()).toMatchObject({ choice: "poll", method: "poll" });
  });

  it("orders an in-flight subscription before the newer saved choice", async () => {
    const { promise: gate, resolve: finish } = Promise.withResolvers<undefined>();
    const { promise: posting, resolve: started } = Promise.withResolvers<undefined>();
    const { promise: discovering, resolve: discovered } = Promise.withResolvers<undefined>();
    const calls = { discoveries: 0, subscriptions: 0 };
    const { api, fetcher } = apiWith({
      "GET /api/push/methods": () => {
        calls.discoveries += 1;
        if (calls.discoveries === 2) {
          discovered(undefined);
        }
        return { pushMethods: ["fcm", "poll"], fcmProject: "native-project" };
      },
      "PUT /api/push/subscription": async ({ body }) => {
        calls.subscriptions += 1;
        if (calls.subscriptions === 1) {
          started(undefined);
          await gate;
        }
        return { method: (body as { readonly method: string }).method };
      },
    });
    const oldRegistration = registerPush(api, "https://api.test");
    await posting;
    await setPushChoice("poll");
    const newRegistration = registerPush(api, "https://api.test");
    await discovering;
    finish(undefined);
    await Promise.all([oldRegistration, newRegistration]);
    expect(
      fetcher.calls
        .filter((call) => call.method === "PUT")
        .map((call) => (call.body as { readonly method: string }).method),
    ).toEqual(["fcm", "poll"]);
    expect(await pushMethodOf()).toBe("poll");
    expect(pushStore.getState()).toMatchObject({ choice: "poll", method: "poll" });
  });

  it("recovers the persistence queue after a failed native write", async () => {
    const secure = SecureStore as unknown as FakeSecureStore;
    const { api } = registering(["fcm", "poll"], [], "native-project");
    secure.writes.isRefused = true;
    try {
      await expect(registerPush(api, "https://api.test")).rejects.toThrow(
        "keystore refused the write",
      );
    } finally {
      secure.writes.isRefused = false;
    }
    expect(await registerPush(api, "https://api.test")).toBe("fcm");
    expect(await pushMethodOf()).toBe("fcm");
  });

  it("ignores an old subscription response after an origin change", async () => {
    const { promise: gate, resolve: finish } = Promise.withResolvers<undefined>();
    const { promise: posting, resolve: started } = Promise.withResolvers<undefined>();
    const { api, fetcher } = apiWith({
      "GET /api/push/methods": () => ({
        pushMethods: ["fcm", "poll"],
        fcmProject: "native-project",
      }),
      "PUT /api/push/subscription": async () => {
        started(undefined);
        await gate;
        return { method: "fcm" };
      },
    });
    const registration = registerPush(api, "https://api.test");
    await posting;
    serverStore.setState({ origin: "https://new.test" });
    pushStore.setState({ method: "none" });
    finish(undefined);
    await registration;
    expect(fetcher.calls).toHaveLength(2);
    expect(pushStore.getState().method).toBe("none");
    expect((SecureStore as unknown as FakeSecureStore).values.has("pace.push.method")).toBe(false);
  });

  it("does not publish a persisted old method after native configuration changes", async () => {
    const { promise: gate, resolve: finish } = Promise.withResolvers<undefined>();
    mockMethodPersistence.gate = gate;
    const { promise: writing, resolve: started } = Promise.withResolvers<undefined>();
    mockMethodPersistence.started = () => {
      started(undefined);
    };
    const { api } = registering(["fcm", "poll"], [], "native-project");
    const registration = registerPush(api, "https://api.test");
    await writing;
    firebaseRuntime.firebaseRuntimeStore.setState({ blockReason: "restart-needed" });
    pushStore.setState({ method: "poll" });
    finish(undefined);
    await registration;
    expect(pushStore.getState().method).toBe("poll");
  });

  it("keeps the new method durable when an older persistence call finishes late", async () => {
    const { promise: gate, resolve: finish } = Promise.withResolvers<undefined>();
    mockMethodPersistence.gate = gate;
    const { promise: writing, resolve: started } = Promise.withResolvers<undefined>();
    mockMethodPersistence.started = () => {
      started(undefined);
    };
    const { api } = registering(["fcm", "poll"], [], "native-project");
    const oldRegistration = registerPush(api, "https://api.test");
    await writing;
    firebaseRuntime.firebaseRuntimeStore.setState({ blockReason: "restart-needed" });
    mockMethodPersistence.gate = null;
    mockMethodPersistence.started = null;
    const newRegistration = registerPush(api, "https://api.test");
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await Promise.resolve();
    }
    finish(undefined);
    await Promise.all([oldRegistration, newRegistration]);
    expect(pushStore.getState().method).toBe("poll");
    expect(await pushMethodOf()).toBe("poll");
  });

  it.each(["origin", "configuration"])(
    "does not publish or register after %s changes while the token is pending",
    async (change) => {
      const { promise: pending, resolve: finish } = Promise.withResolvers<{
        type: "android";
        data: string;
      }>();
      const token = jest
        .spyOn(
          jest.requireMock<typeof Notifications>("expo-notifications"),
          "getDevicePushTokenAsync",
        )
        .mockReturnValue(pending);
      token.mockClear();
      const { api, fetcher } = registering(["fcm", "poll"], [], "native-project");
      const registration = registerPush(api, "https://api.test");
      for (let attempt = 0; attempt < 30 && token.mock.calls.length === 0; attempt += 1) {
        await Promise.resolve();
      }
      expect(token).toHaveBeenCalledTimes(1);
      if (change === "origin") {
        serverStore.setState({ origin: "https://new.test" });
      } else {
        firebaseRuntime.firebaseRuntimeStore.setState({ blockReason: "restart-needed" });
      }
      pushStore.setState({ method: "none" });
      finish({ type: "android", data: "late" });
      await registration;
      expect(fetcher.calls).toHaveLength(1);
      expect(pushStore.getState().method).toBe("none");
    },
  );
});
