import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

import type { createFakeBackgroundTask } from "#app/testing/background-task.fake.ts";
import type { createFakeNotifications } from "#app/testing/notifications.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { createFakeFetch, type FakeRoute, problem } from "@pace/client/testing";

import {
  BACKGROUND_CHECK_TASK,
  BACKGROUND_INTERVAL_MINUTES,
  runBackgroundCheck,
  startBackgroundCheck,
  stopBackgroundCheck,
} from "./background-check.ts";

const at = (hhmm: string): number => Date.parse(`2026-10-06T${hhmm}:00.000Z`);

/**
Telegram in front 09:00–09:20: what the usage upload sends. The read answers only the events in
the range it is asked for, as Android's does (bug-lessons class 55: a fake ignoring its window).
*/
jest.mock("../../modules/pace-native/index.ts", () => ({
  paceNative: {
    appLabels: async (packages: readonly string[]) =>
      Object.fromEntries(packages.map((name) => [name, "Telegram"])),
    hasUsageAccess: () => true,
    openUsageAccessSettings: jest.fn(),
    queryUsageEvents: async (from: number, to: number) =>
      [
        { className: null, eventType: 15, packageName: "android", timestamp: at("09:00") },
        {
          className: null,
          eventType: 1,
          packageName: "org.telegram.messenger",
          timestamp: at("09:00"),
        },
        {
          className: null,
          eventType: 2,
          packageName: "org.telegram.messenger",
          timestamp: at("09:20"),
        },
      ].filter((event) => event.timestamp >= from && event.timestamp <= to),
  },
}));

const SERVER_A = "https://a.pace.test";
const SERVER_B = "https://b.pace.test";
const NOW = "2026-10-06T10:00:00.000Z";

const secure = (SecureStore as unknown as FakeSecureStore).values;
const notifications = Notifications as unknown as ReturnType<typeof createFakeNotifications>;
const background = BackgroundTask as unknown as ReturnType<typeof createFakeBackgroundTask>;
const tasks = (TaskManager as unknown as { tasks: Map<string, () => Promise<unknown>> }).tasks;

const login = {
  createdAt: "2026-10-06T09:55:00.000Z",
  id: "n-login",
  kind: "login",
  // eslint-disable-next-line sonarjs/no-hardcoded-ip -- the address a sign-in notice shows
  payload: { country: "Germany", ip: "1.2.3.4", kind: "web", name: "Chrome", sessionId: "s" },
  readAt: null,
  resolution: null,
  resolvedAt: null,
};

/** The phone's stored server and the session stored for `origin` (the app's own keys). */
const signIn = (server: string, origin: string = server): void => {
  secure.set("pace.server", server);
  secure.set("pace.session", JSON.stringify({ origin, token: "session-a" }));
};

/** Every request the run sends, with its full URL, answered by `routes`. */
const serve = (routes: Readonly<Record<string, FakeRoute>>) => {
  const fake = createFakeFetch({
    "POST /api/usage/sessions": () => ({ stored: 1 }),
    ...routes,
  });
  const urls: string[] = [];
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    return await fake.fetch(url, init ?? {});
  });
  return { calls: fake.calls, urls };
};

beforeEach(async () => {
  secure.clear();
  notifications.state.granted = true;
  notifications.state.scheduled = [];
  notifications.state.dismissed = [];
  await stopBackgroundCheck();
  background.registerTaskAsync.mockClear();
  background.unregisterTaskAsync.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the background check's task", () => {
  it("is defined when the module loads, and registered once about every 15 minutes", async () => {
    expect(BACKGROUND_CHECK_TASK).toBe("pace.background-check");
    expect(BACKGROUND_INTERVAL_MINUTES).toBe(15);
    expect(tasks.has(BACKGROUND_CHECK_TASK)).toBe(true);
    await Promise.all([startBackgroundCheck(), startBackgroundCheck()]);
    await startBackgroundCheck();
    expect(background.registerTaskAsync.mock.calls).toEqual([
      [BACKGROUND_CHECK_TASK, { minimumInterval: 15 }],
    ]);
  });

  it("is unregistered when stopped, and registered again on the next start", async () => {
    await startBackgroundCheck();
    await stopBackgroundCheck();
    expect(background.unregisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_CHECK_TASK);
    await startBackgroundCheck();
    expect(background.registerTaskAsync).toHaveBeenCalledTimes(2);
  });

  it("tells Android whether the run failed", async () => {
    signIn(SERVER_A);
    secure.set("pace.push.method", "poll");
    serve({ "GET /api/push/poll": () => problem(503, "server/error") });
    const run = tasks.get(BACKGROUND_CHECK_TASK);
    expect(await run?.()).toBe(background.BackgroundTaskResult.Failed);
    serve({ "GET /api/push/poll": () => ({ cursor: 0, entries: [] }) });
    expect(await run?.()).toBe(background.BackgroundTaskResult.Success);
  });
});

describe("a background run", () => {
  it("polls a polling phone: shows and takes back what waits, acknowledges it, then uploads usage", async () => {
    signIn(SERVER_A);
    secure.set("pace.push.method", "poll");
    const { calls, urls } = serve({
      "GET /api/push/poll": ({ url }) => ({
        cursor: 7,
        entries:
          url.searchParams.get("after") === "0"
            ? [
                {
                  body: "Signed in: Chrome",
                  notification: login,
                  notificationId: "n-login",
                  title: "New sign-in",
                  type: "show",
                },
                { notificationId: "n-old", type: "dismiss" },
              ]
            : [],
      }),
    });
    expect(await runBackgroundCheck({ now: () => NOW })).toBe("done");
    expect(await runBackgroundCheck({ now: () => NOW })).toBe("done");

    expect(notifications.state.scheduled).toEqual([
      expect.objectContaining({ identifier: "n-login" }),
    ]);
    expect(notifications.state.dismissed).toContain("n-old");
    expect(calls.map((call) => call.path)).toEqual([
      "/api/push/poll",
      "/api/usage/sessions",
      "/api/push/poll",
      "/api/usage/sessions",
    ]);
    expect(urls.filter((url) => url.includes("/api/push/poll"))).toEqual([
      `${SERVER_A}/api/push/poll?after=0`,
      `${SERVER_A}/api/push/poll?after=7`,
    ]);
    expect(calls[0]?.headers["authorization"]).toBe("Bearer session-a");
  });

  it("does not poll a phone that gets Google's push, and still uploads its usage", async () => {
    signIn(SERVER_A);
    secure.set("pace.push.method", "fcm");
    const { calls } = serve({});
    expect(await runBackgroundCheck({ now: () => NOW })).toBe("done");
    expect(calls.map((call) => call.path)).toEqual(["/api/usage/sessions"]);
  });

  it("sends nothing while signed out", async () => {
    secure.set("pace.push.method", "poll");
    const { urls } = serve({});
    expect(await runBackgroundCheck({ now: () => NOW })).toBe("signed-out");
    expect(urls).toEqual([]);
  });

  it("treats a token stored for another server as signed out, and sends nothing to this one", async () => {
    signIn(SERVER_B, SERVER_A);
    secure.set("pace.push.method", "poll");
    const { urls } = serve({});
    expect(await runBackgroundCheck({ now: () => NOW })).toBe("signed-out");
    expect(urls).toEqual([]);
  });

  it("still uploads usage when the poll fails, and says the run failed", async () => {
    signIn(SERVER_A);
    secure.set("pace.push.method", "poll");
    const { calls } = serve({ "GET /api/push/poll": () => problem(503, "server/error") });
    expect(await runBackgroundCheck({ now: () => NOW })).toBe("failed");
    expect(calls.map((call) => call.path)).toEqual(["/api/push/poll", "/api/usage/sessions"]);
  });

  it("shows nothing and sends no more for a session that ended during the run", async () => {
    signIn(SERVER_A);
    secure.set("pace.push.method", "poll");
    const { calls } = serve({
      "GET /api/push/poll": async () => {
        // The person logs out while the poll is on its way.
        await stopBackgroundCheck();
        return {
          cursor: 7,
          entries: [
            {
              body: "Signed in: Chrome",
              notification: login,
              notificationId: "n-login",
              title: "New sign-in",
              type: "show",
            },
          ],
        };
      },
    });
    await runBackgroundCheck({ now: () => NOW });
    expect(notifications.state.scheduled).toEqual([]);
    expect(calls.map((call) => call.path)).toEqual(["/api/push/poll"]);
  });
});
