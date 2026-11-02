import { act, render, screen, waitFor } from "@testing-library/react-native";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import { createHash } from "node:crypto";
import { AppState, Text } from "react-native";

import {
  createMemoryEventStore,
  createMemorySessionStore,
  type EventStore,
  type SessionStore,
} from "@pace/client";
import {
  createFakeFetch,
  emptySyncRoutes,
  fakeMe,
  type FakeRoute,
  fakeUser,
  problem,
} from "@pace/client/testing";

import type { createFakeBackgroundTask } from "./testing/background-task.fake.ts";

import { PaceProvider, useAuth, useSync, useT } from "./app-state.tsx";
import { createRuntime, type PaceRuntime } from "./runtime.ts";
import { backOnline } from "./ui/sync-frame.tsx";

const Probe = () => {
  const { status, user } = useAuth();
  const { status: sync } = useSync();
  const t = useT();
  return (
    <>
      <Text testID="auth">{`${status}:${user?.name ?? "-"}`}</Text>
      <Text testID="sync">{sync.lastSyncAt === null ? "never" : "synced"}</Text>
      <Text testID="title">{t("nav.now")}</Text>
    </>
  );
};

const setup = async (
  routes: Readonly<Record<string, FakeRoute>> = {},
  session: SessionStore = createMemorySessionStore(),
): Promise<{
  readonly api: ReturnType<typeof createFakeFetch>;
  readonly eventStore: EventStore;
  readonly runtime: PaceRuntime;
}> => {
  const api = createFakeFetch({
    ...emptySyncRoutes,
    "GET /api/me": () => fakeMe,
    "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
    "POST /api/auth/logout": () => ({ ok: true }),
    ...routes,
  });
  const eventStore = createMemoryEventStore();
  const runtime = await createRuntime({
    baseUrl: "https://api.test",
    deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    eventStore,
    fetch: api.fetch,
    session,
  });
  await runtime.state.ready;
  return { api, eventStore, runtime };
};

/** Every time the half-typed line's draft is forgotten (a sign-out, round 7 review 4). */
const mockForgetLineDraft = jest.fn();
jest.mock("./platform/shared-in.ts", (): unknown => ({
  ...jest.requireActual<object>("./platform/shared-in.ts"),
  forgetLineDraft: () => {
    mockForgetLineDraft();
  },
}));

/** The browser window's focus coming back, as the web stand-in hears it. */
const mockWindowFocus = { listeners: new Set<() => void>() };
jest.mock("./platform/window-focus.ts", (): unknown => ({
  onWindowFocus: (listener: () => void) => {
    mockWindowFocus.listeners.add(listener);
    return () => {
      mockWindowFocus.listeners.delete(listener);
    };
  },
}));

// eslint-disable-next-line @typescript-eslint/unbound-method -- inspecting the jest mock, never calling it
const addEventListener = jest.mocked(AppState.addEventListener);

afterEach(() => {
  addEventListener.mockClear();
});

type FakeNotifications = {
  state: {
    granted: boolean;
    pushToken: null | string;
    dismissed: string[];
    scheduled: { readonly identifier: string }[];
    responseListeners: ((response: {
      readonly actionIdentifier: string;
      readonly notification: { readonly request: { readonly content: object } };
    }) => void)[];
  };
};

const notifications = Notifications as unknown as FakeNotifications;

/** A "still doing X?" in the pool, as the resolve endpoint answers it. */
const overrunNotice = {
  createdAt: "2026-10-07T08:00:00.000Z",
  id: "n-9",
  kind: "activity_overrun",
  payload: {
    activityId: "a-1",
    askedAt: "2026-10-07T08:00:00.000Z",
    expectMinutes: 30,
    label: "Commute",
    startAt: "2026-10-07T07:00:00.000Z",
  },
  readAt: null,
  resolution: null,
  resolvedAt: "2026-10-07T08:01:00.000Z",
};

describe("PaceProvider", () => {
  it("registers how the phone gets notifications once signed in, and fetches what waits", async () => {
    notifications.state.granted = true;
    notifications.state.pushToken = null;
    const { api, runtime } = await setup({
      "GET /api/notifications": () => ({ deliveries: {}, items: [], more: false }),
      "GET /api/push/methods": () => ({ pushMethods: ["fcm", "poll"] }),
      "GET /api/push/poll": () => ({ cursor: 0, entries: [] }),
      "PUT /api/push/subscription": () => ({ method: "poll" }),
    });
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await act(async () => {
      await runtime.auth.loginWithDev("1");
    });
    // No Google token on this phone: it polls, and fetches what waits at once.
    await waitFor(() => {
      expect(api.pathsCalled("/api/push/poll")).toHaveLength(1);
    });
    expect(api.calls.find((call) => call.path === "/api/push/subscription")?.body).toEqual({
      method: "poll",
    });
    expect(api.pathsCalled("/api/notifications")).not.toEqual([]);
  });

  it("takes a notification away only once its answer button's answer is saved", async () => {
    notifications.state.granted = true;
    notifications.state.pushToken = null;
    notifications.state.dismissed = [];
    notifications.state.scheduled = [];
    const answers = { isUp: false };
    const { runtime } = await setup({
      "GET /api/notifications": () => ({ deliveries: {}, items: [], more: false }),
      "GET /api/push/methods": () => ({ pushMethods: ["poll"] }),
      "GET /api/push/poll": () => ({ cursor: 0, entries: [] }),
      "POST /api/notifications/n-9/resolve": () =>
        answers.isUp
          ? { notification: { ...overrunNotice, resolution: "still" } }
          : Response.json({ code: "server/error", message: "Down" }, { status: 503 }),
      "PUT /api/push/subscription": () => ({ method: "poll" }),
    });
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await act(async () => {
      await runtime.auth.loginWithDev("1");
    });
    await waitFor(() => {
      expect(notifications.state.responseListeners).not.toEqual([]);
    });
    const tap = () => {
      for (const listener of notifications.state.responseListeners) {
        listener({
          actionIdentifier: "still",
          notification: {
            request: {
              content: {
                body: "Still doing Commute?",
                categoryIdentifier: "activity_overrun",
                data: {
                  notificationId: "n-9",
                  sessionHash: createHash("sha256").update("tok_dev").digest("hex"),
                },
                title: "Still going?",
              },
            },
          },
        });
      }
    };
    await act(async () => {
      tap();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(notifications.state.scheduled.map((item) => item.identifier)).toContain("n-9");
    });
    expect(notifications.state.dismissed).not.toContain("n-9");
    answers.isUp = true;
    await act(async () => {
      tap();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(notifications.state.dismissed).toContain("n-9");
    });
  });

  it("exposes the auth status, the language and starts syncing once signed in", async () => {
    const { api, runtime } = await setup();
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    expect(screen.getByTestId("auth")).toHaveTextContent("signed-out:-");
    expect(screen.getByTestId("title")).toHaveTextContent("Now");
    expect(api.pathsCalled("/api/sync")).toEqual([]);

    await act(async () => {
      await runtime.auth.loginWithDev("1");
    });
    await waitFor(() => {
      expect(screen.getByTestId("sync")).toHaveTextContent("synced");
    });
    expect(screen.getByTestId("auth")).toHaveTextContent("signed-in:Ann");
    // The first pull comes before anything is pushed: the zone is set from what it brought.
    expect(api.pathsCalled("/api/sync")[0]).toBe("/api/sync/pull");
  });

  it("gives the account the device's time zone after the first sync", async () => {
    const { runtime } = await setup();
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    expect(runtime.state.store.getState().settings.timezone).toBeNull();
    await act(async () => {
      await runtime.auth.loginWithDev("1");
    });
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.timezone).toBe(runtime.clock.deviceTz);
    });
  });

  it("follows the account language", async () => {
    const { runtime } = await setup();
    await runtime.auth.loginWithDev("1");
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await act(async () => {
      await runtime.state.dispatch({
        occurredAt: "2026-10-06T10:00:00.000Z",
        payload: { language: "ru" },
        type: "settings.updated",
      });
    });
    expect(screen.getByTestId("title")).toHaveTextContent("Сейчас");
  });

  it("uses the browser language while signed out, then the account language after sign-in", async () => {
    const locale = jest.spyOn(globalThis.navigator, "language", "get").mockReturnValue("ru-RU");
    try {
      const { runtime } = await setup();
      await render(
        <PaceProvider runtime={runtime}>
          <Probe />
        </PaceProvider>,
      );
      expect(screen.getByTestId("title")).toHaveTextContent("Сейчас");
      await act(async () => {
        await runtime.auth.loginWithDev("1");
      });
      expect(screen.getByTestId("title")).toHaveTextContent("Now");
    } finally {
      locale.mockRestore();
    }
  });

  it("keeps the guest language until the signed-in account has synced", async () => {
    const locale = jest.spyOn(globalThis.navigator, "language", "get").mockReturnValue("ru-RU");
    const { promise: waiting, resolve: releasePull } = Promise.withResolvers<undefined>();
    try {
      const { runtime } = await setup({
        "GET /api/sync/pull": async () => {
          await waiting;
          return { events: [], more: false, seq: 0, storeId: "store-test" };
        },
      });
      await render(
        <PaceProvider runtime={runtime}>
          <Probe />
        </PaceProvider>,
      );
      expect(screen.getByTestId("title")).toHaveTextContent("Сейчас");
      await act(async () => {
        await runtime.auth.loginWithDev("1");
      });
      expect(screen.getByTestId("title")).toHaveTextContent("Сейчас");
      await act(async () => {
        releasePull(undefined);
      });
      await waitFor(() => {
        expect(screen.getByTestId("title")).toHaveTextContent("Now");
      });
    } finally {
      releasePull(undefined);
      locale.mockRestore();
    }
  });

  it("uses account language after a later successful sync when the first pull failed", async () => {
    const locale = jest.spyOn(globalThis.navigator, "language", "get").mockReturnValue("ru-RU");
    let isOnline = false;
    try {
      const { runtime } = await setup({
        "GET /api/sync/pull": () =>
          isOnline
            ? { events: [], more: false, seq: 0, storeId: "store-test" }
            : problem(503, "offline"),
      });
      await render(
        <PaceProvider runtime={runtime}>
          <Probe />
        </PaceProvider>,
      );
      await act(async () => {
        await runtime.auth.loginWithDev("1");
      });
      await waitFor(() => {
        expect(runtime.sync.status.getState().lastError).not.toBeNull();
      });
      expect(screen.getByTestId("title")).toHaveTextContent("Сейчас");
      isOnline = true;
      await act(async () => {
        await runtime.sync.syncNow();
      });
      expect(screen.getByTestId("title")).toHaveTextContent("Now");
    } finally {
      locale.mockRestore();
    }
  });

  it("syncs again when the app returns to the foreground", async () => {
    const { api, runtime } = await setup();
    await runtime.auth.loginWithDev("1");
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.timezone).not.toBeNull();
    });
    await act(async () => {
      await runtime.sync.syncNow();
    });
    const before = api.pathsCalled("/api/sync/pull").length;
    const [, listener] = addEventListener.mock.calls[0] ?? [];
    await act(async () => {
      listener?.("active");
      await runtime.sync.syncNow();
    });
    expect(api.pathsCalled("/api/sync/pull").length).toBeGreaterThan(before);
  });

  it("clears local data on logout", async () => {
    const { runtime } = await setup();
    await runtime.auth.loginWithDev("1");
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await act(async () => {
      await runtime.state.dispatch({
        occurredAt: "2026-10-06T10:00:00.000Z",
        payload: { language: "ru" },
        type: "settings.updated",
      });
    });
    expect(screen.getByTestId("title")).toHaveTextContent("Сейчас");
    await act(async () => {
      await runtime.auth.logout();
    });
    await waitFor(() => {
      expect(screen.getByTestId("title")).toHaveTextContent("Now");
    });
    expect(screen.getByTestId("auth")).toHaveTextContent("signed-out:-");
    // The half-typed line goes with the account: a share after the next sign-in is only the share.
    expect(mockForgetLineDraft).toHaveBeenCalledTimes(1);
  });

  it("after Log out the network goes quiet: only the logout names the session, nothing goes without one (QA round 18 R18-02)", async () => {
    const { api, runtime } = await setup();
    await runtime.auth.loginWithDev("1");
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("sync")).toHaveTextContent("synced");
    });
    const before = api.calls.length;
    await act(async () => {
      await runtime.auth.logout();
    });
    await act(async () => {
      // Whatever the sign-out sets off (the wipe, the loop's last tick, a foreground return).
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });
    // The server check (`/api/instance`) is public and names no one.
    const named = api.calls.slice(before).filter((call) => call.path !== "/api/instance");
    expect(named.map((call) => [call.path, call.headers["authorization"]])).toEqual([
      ["/api/auth/logout", "Bearer tok_dev"],
    ]);
    expect(screen.getByTestId("auth")).toHaveTextContent("signed-out:-");
    expect(runtime.auth.store.getState().endedElsewhere).toBeUndefined();
  });

  it("a session refused at start asks nothing more once it is signed out (QA round 18 R18-02)", async () => {
    const { api, runtime } = await setup({
      "GET /api/me": () => problem(401, "auth/unauthorized"),
    });
    await runtime.auth.loginWithDev("1");
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await act(async () => {
      await runtime.auth.me();
    });
    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("signed-out:-");
    });
    const after = api.calls.length;
    await act(async () => {
      runtime.sync.soon();
      await runtime.notifications.refresh();
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });
    expect(api.calls.slice(after)).toEqual([]);
    // A remote end is still told as one: the login card explains it.
    expect(runtime.auth.store.getState().endedElsewhere).toBe(true);
  });

  it("starts the background check once signed in, and stops it on logout", async () => {
    const background = BackgroundTask as unknown as ReturnType<typeof createFakeBackgroundTask>;
    background.registerTaskAsync.mockClear();
    background.unregisterTaskAsync.mockClear();
    const { runtime } = await setup();
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    expect(background.registerTaskAsync).not.toHaveBeenCalled();
    await act(async () => {
      await runtime.auth.loginWithDev("1");
    });
    await waitFor(() => {
      expect(background.registerTaskAsync).toHaveBeenCalledWith("pace.background-check", {
        minimumInterval: 15,
      });
    });
    expect(background.unregisterTaskAsync).not.toHaveBeenCalled();
    await act(async () => {
      await runtime.auth.logout();
    });
    await waitFor(() => {
      expect(background.unregisterTaskAsync).toHaveBeenCalledWith("pace.background-check");
    });
  });

  it("registers the background check even when a network step of the signed-in start fails", async () => {
    const background = BackgroundTask as unknown as ReturnType<typeof createFakeBackgroundTask>;
    background.registerTaskAsync.mockClear();
    const { runtime } = await setup();
    const refresh = jest
      .spyOn(runtime.notifications, "refresh")
      .mockRejectedValue(new Error("offline"));
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await act(async () => {
      await runtime.auth.loginWithDev("1");
    });
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(background.registerTaskAsync).toHaveBeenCalledWith("pace.background-check", {
        minimumInterval: 15,
      });
    });
  });

  it("drops the local log, outbox, cursor and store id when a 401 signs the device out", async () => {
    const { eventStore, runtime } = await setup({
      "GET /api/me": () => problem(401, "auth/unauthorized"),
    });
    await runtime.auth.loginWithDev("1");
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    // Synced, and the signed-in start's own write (the time zone) sent: then the loop rests.
    await waitFor(async () => {
      await expect(eventStore.getStoreId()).resolves.not.toBeNull();
      await expect(eventStore.listPending()).resolves.toEqual([]);
    });
    await act(async () => {
      runtime.sync.stop();
      await runtime.state.dispatch({
        occurredAt: "2026-10-06T10:00:00.000Z",
        payload: { language: "ru" },
        type: "settings.updated",
      });
    });
    await expect(eventStore.listPending()).resolves.toHaveLength(1);
    await act(async () => {
      await runtime.auth.me();
    });
    await waitFor(() => {
      expect(screen.getByTestId("title")).toHaveTextContent("Now");
    });
    await expect(eventStore.listAll()).resolves.toEqual([]);
    await expect(eventStore.listPending()).resolves.toEqual([]);
    await expect(eventStore.getCursor()).resolves.toBe(0);
    await expect(eventStore.getStoreId()).resolves.toBeNull();
  });
});

describe("the notification pool on the first load (QA round 20 L9)", () => {
  it("is fetched once by the signed-in start, not again by the socket's first connection", async () => {
    const { api, runtime } = await setup({
      "GET /api/notifications": () => ({ deliveries: {}, items: [], more: false }),
    });
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await act(async () => {
      await runtime.auth.loginWithDev("1");
    });
    await waitFor(() => {
      expect(api.pathsCalled("/api/notifications")).toHaveLength(1);
    });
    await act(async () => {
      runtime.live.status.setState({ isConnected: true });
      await Promise.resolve();
    });
    expect(api.pathsCalled("/api/notifications")).toHaveLength(1);
    // A reconnect later (the line dropped a while): what the pool got meanwhile is fetched.
    const later = Date.now() + 60_000;
    jest.spyOn(Date, "now").mockReturnValue(later);
    await act(async () => {
      runtime.live.status.setState({ isConnected: false });
      runtime.live.status.setState({ isConnected: true });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(api.pathsCalled("/api/notifications")).toHaveLength(2);
    });
    jest.restoreAllMocks();
  });
});

describe("the window's focus coming back while offline (QA round 20 L2)", () => {
  it("tries the server again at once, and only while the last run could not reach it", async () => {
    const network = { isDown: true };
    const { api, runtime } = await setup({
      "GET /api/sync/pull": () => {
        if (network.isDown) {
          throw new TypeError("Failed to fetch");
        }
        return { events: [], more: false, seq: 0, storeId: "store-test" };
      },
    });
    await runtime.auth.loginWithDev("1");
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await waitFor(() => {
      expect(runtime.sync.status.getState().online).toBe(false);
    });
    network.isDown = false;
    const before = api.pathsCalled("/api/sync/pull").length;
    await act(async () => {
      for (const listener of mockWindowFocus.listeners) {
        listener();
      }
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(runtime.sync.status.getState().online).toBe(true);
    });
    expect(api.pathsCalled("/api/sync/pull").length).toBeGreaterThan(before);
    // Online: a focus asks for nothing.
    const after = api.pathsCalled("/api/sync/pull").length;
    await act(async () => {
      for (const listener of mockWindowFocus.listeners) {
        listener();
      }
      await Promise.resolve();
    });
    expect(api.pathsCalled("/api/sync/pull")).toHaveLength(after);
  });
});

describe("every starter while this device ends its own session (round 7 review 8, class 75)", () => {
  it("starts no socket and sends no run: foreground return, window focus, Retry", async () => {
    const network = { isDown: true };
    const { api, runtime } = await setup({
      "GET /api/sync/pull": () => {
        if (network.isDown) {
          throw new TypeError("Failed to fetch");
        }
        return { events: [], more: false, seq: 0, storeId: "store-test" };
      },
    });
    await runtime.auth.loginWithDev("1");
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    await waitFor(() => {
      expect(runtime.sync.status.getState().online).toBe(false);
    });
    network.isDown = false;
    // Ending this device's session: its revoke is on its way.
    void runtime.auth.endThisDevice(async () => {
      await new Promise<never>(() => undefined);
    });
    await waitFor(() => {
      expect(runtime.auth.isEnding()).toBe(true);
    });
    const starts = jest.spyOn(runtime.live, "start");
    const before = api.pathsCalled("/api/sync/pull").length;
    await act(async () => {
      for (const [type, listener] of addEventListener.mock.calls) {
        if (type === "change") {
          listener("active");
        }
      }
      for (const listener of mockWindowFocus.listeners) {
        listener();
      }
      backOnline(runtime);
      await Promise.resolve();
    });
    expect(starts).not.toHaveBeenCalled();
    expect(api.pathsCalled("/api/sync/pull")).toHaveLength(before);
  });
});

describe("a stale tab of a browser signed in again elsewhere (round 6 I1)", () => {
  it("keeps the shared local copy when its late 401 finds another tab's session in the store", async () => {
    // The browser profile's session store, shared with a tab that logged out and in again.
    const shared = createMemorySessionStore();
    const server = { isOldEnded: false };
    const { eventStore, runtime } = await setup(
      { "GET /api/me": () => (server.isOldEnded ? problem(401, "auth/unauthorized") : fakeMe) },
      shared,
    );
    await runtime.auth.loginWithDev("1");
    await render(
      <PaceProvider runtime={runtime}>
        <Probe />
      </PaceProvider>,
    );
    // Synced, and the signed-in start's own write (the time zone) sent: then the loop rests.
    await waitFor(async () => {
      await expect(eventStore.getStoreId()).resolves.not.toBeNull();
      await expect(eventStore.listPending()).resolves.toEqual([]);
    });
    await act(async () => {
      runtime.sync.stop();
      await runtime.state.dispatch({
        occurredAt: "2026-10-06T10:00:00.000Z",
        payload: { language: "ru" },
        type: "settings.updated",
      });
    });
    // Another tab logged this session out and signed in again: its token is in the shared store.
    server.isOldEnded = true;
    await shared.set("tok_other_tab");
    await act(async () => {
      await runtime.auth.me();
    });
    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("signed-out:-");
    });
    await expect(shared.get()).resolves.toBe("tok_other_tab");
    await expect(eventStore.listPending()).resolves.toHaveLength(1);
    await expect(eventStore.getStoreId()).resolves.not.toBeNull();
  });
});

describe("a token adopted from the browser or an App Link", () => {
  it("signs the runtime in and syncs with it", async () => {
    const { api, runtime } = await setup();
    const result = await runtime.auth.adoptToken("tok_web");
    expect(result).toEqual({ ok: true, value: fakeUser });
    expect(runtime.auth.store.getState()).toEqual({ status: "signed-in", user: fakeUser });
    const me = api.calls.find((call) => call.path === "/api/me");
    expect(me).toBeDefined();
    await runtime.sync.syncNow();
    expect(api.pathsCalled("/api/sync/pull")).toHaveLength(1);
  });
});
