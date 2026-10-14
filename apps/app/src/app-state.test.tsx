import { act, render, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { AppState, Text } from "react-native";

import { createMemoryEventStore, createMemorySessionStore, type EventStore } from "@pace/client";
import {
  createFakeFetch,
  emptySyncRoutes,
  fakeMe,
  type FakeRoute,
  fakeUser,
  problem,
} from "@pace/client/testing";

import { PaceProvider, useAuth, useSync, useT } from "./app-state.tsx";
import { createRuntime, type PaceRuntime } from "./runtime.ts";

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
    session: createMemorySessionStore(),
  });
  await runtime.state.ready;
  return { api, eventStore, runtime };
};

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
                data: { notificationId: "n-9" },
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
    await waitFor(async () => {
      await expect(eventStore.getStoreId()).resolves.not.toBeNull();
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
