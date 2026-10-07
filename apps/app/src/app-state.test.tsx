import { act, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, Text } from "react-native";

import { createMemoryEventStore, createMemorySessionStore } from "@pace/client";
import { createFakeFetch, emptySyncRoutes, fakeUser } from "@pace/client/testing";

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

const setup = async (): Promise<{
  readonly api: ReturnType<typeof createFakeFetch>;
  readonly runtime: PaceRuntime;
}> => {
  const api = createFakeFetch({
    ...emptySyncRoutes,
    "GET /api/me": () => fakeUser,
    "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
    "POST /api/auth/logout": () => ({ ok: true }),
  });
  const runtime = await createRuntime({
    baseUrl: "https://api.test",
    deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    eventStore: createMemoryEventStore(),
    fetch: api.fetch,
    session: createMemorySessionStore(),
  });
  await runtime.state.ready;
  return { api, runtime };
};

// eslint-disable-next-line @typescript-eslint/unbound-method -- inspecting the jest mock, never calling it
const addEventListener = jest.mocked(AppState.addEventListener);

afterEach(() => {
  addEventListener.mockClear();
});

describe("PaceProvider", () => {
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
    expect(api.pathsCalled("/api/sync")).toEqual(["/api/sync/pull"]);
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
      expect(api.pathsCalled("/api/sync/pull")).toHaveLength(1);
    });
    const [, listener] = addEventListener.mock.calls[0] ?? [];
    await act(async () => {
      listener?.("active");
      await runtime.sync.syncNow();
    });
    expect(api.pathsCalled("/api/sync/pull")).toHaveLength(2);
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
