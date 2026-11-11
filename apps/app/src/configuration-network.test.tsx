import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as BackgroundTask from "expo-background-task";
import { Text } from "react-native";

import { createMemoryEventStore } from "@pace/client";
import { fakeInstance } from "@pace/client/testing";
import { endpoints } from "@pace/core";

import * as phoneRuntime from "./phone-runtime.ts";
import { stopBackgroundCheck } from "./platform/background-check.ts";
import { checkServer, CONFIGURATION_RECHECK_MAX_MS } from "./platform/server-origin.ts";
import { applyInstanceCheck, serverStore } from "./platform/server-store.ts";
import { LoginScreen } from "./screens/login-screen.tsx";
import { renderScreen } from "./test/render.tsx";
import { createTestRuntime } from "./test/runtime.ts";

jest.mock("expo-linking", () => ({
  canOpenURL: jest.fn(async () => false),
  openURL: jest.fn(async () => true),
}));

const misconfigured = () =>
  Response.json(
    {
      code: "server/misconfigured",
      message: "Server configuration is invalid",
      reason: "project-mismatch",
    },
    { status: 500 },
  );

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  serverStore.setState({ configurationError: null, status: "unknown", reason: null });
});

it("stops the pending bot nonce while configuration hides its waiting UI", async () => {
  const poll = jest.fn(() => ({ status: "pending" }));
  const runtime = await createTestRuntime({
    world: "empty",
    routes: {
      "POST /api/auth/nonce": () => ({
        deepLink: "https://t.me/TestBot?start=login_n1",
        nonce: "n1",
      }),
      "GET /api/auth/nonce/n1": poll,
    },
  });
  serverStore.setState({ origin: runtime.baseUrl, configurationError: null });
  const view = await renderScreen(<LoginScreen />, runtime);
  try {
    jest.useFakeTimers();
    await fireEvent.press(screen.getByText("Open Telegram"));
    await waitFor(() => {
      expect(poll).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      applyInstanceCheck(runtime.baseUrl, {
        ok: false,
        error: { kind: "server-misconfigured", reason: "project-mismatch" },
      });
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(poll).toHaveBeenCalledTimes(1);
    await act(async () => {
      await checkServer(runtime);
    });
    expect(screen.getByText("Open Telegram")).toBeOnTheScreen();
    expect(screen.queryByText("Waiting for Telegram…")).toBeNull();
    expect(poll).toHaveBeenCalledTimes(1);
  } finally {
    await view.unmount();
  }
});

it("observes an ordinary API failure, parks senders, retains the copy and resumes once on recovery", async () => {
  await stopBackgroundCheck();
  const backgroundStop = jest.mocked(BackgroundTask.unregisterTaskAsync);
  const backgroundStart = jest.mocked(BackgroundTask.registerTaskAsync);
  backgroundStop.mockClear();
  backgroundStart.mockClear();
  const network = { broken: false };
  const pull = jest.fn(() =>
    network.broken
      ? misconfigured()
      : { events: [], more: false, seq: 0, storeId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
  );
  const store = createMemoryEventStore();
  const runtime = await createTestRuntime({
    eventStore: store,
    routes: {
      "GET /api/instance": () => (network.broken ? misconfigured() : fakeInstance),
      "GET /api/sync/pull": pull,
    },
  });
  serverStore.setState({ origin: runtime.baseUrl, configurationError: null });
  await runtime.auth.me();
  const start = jest.spyOn(runtime.sync, "start");
  const syncNow = jest.spyOn(runtime.sync, "syncNow");
  const liveStart = jest.spyOn(runtime.live, "start");
  const stop = jest.spyOn(runtime.live, "stop");
  jest.useFakeTimers();
  const view = await renderScreen(<Text>Local copy</Text>, runtime);
  try {
    await waitFor(() => {
      expect(start).toHaveBeenCalledTimes(1);
    });
    network.broken = true;
    await act(async () => {
      await runtime.sync.syncNow();
    });
    expect(serverStore.getState().configurationError).toEqual({ reason: "project-mismatch" });
    expect(stop).toHaveBeenCalled();
    expect(backgroundStop).toHaveBeenCalledWith("pace.background-check");
    await act(async () => {
      expect(
        (
          await runtime.actions.createTask({
            presetId: "personal",
            title: "Kept while server is broken",
          })
        ).ok,
      ).toBe(true);
    });
    const before = runtime.state.store.getState();
    const pending = await store.listPending();
    expect(pending.length).toBeGreaterThan(0);
    const calls = pull.mock.calls.length;
    const starts = liveStart.mock.calls.length;
    jest.useFakeTimers();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(120_000);
    });
    expect(pull).toHaveBeenCalledTimes(calls);
    expect(liveStart).toHaveBeenCalledTimes(starts);
    expect(runtime.auth.store.getState().status).toBe("signed-in");
    expect(runtime.state.store.getState()).toBe(before);
    expect(await store.listPending()).toEqual(pending);
    const runs = syncNow.mock.calls.length;
    network.broken = false;
    await act(async () => {
      await checkServer(runtime);
    });
    await waitFor(() => {
      expect(start).toHaveBeenCalledTimes(2);
    });
    expect(syncNow).toHaveBeenCalledTimes(runs + 1);
    expect(backgroundStart).toHaveBeenCalledTimes(2);
    // One sync pulls, delivers the outbox, then pulls its derived events.
    expect(pull).toHaveBeenCalledTimes(calls + 2);
    expect(await store.listPending()).toEqual([]);
    expect(serverStore.getState().configurationError).toBeNull();
  } finally {
    await view.unmount();
    runtime.sync.stop();
    runtime.live.stop();
  }
});

it("does not apply an ordinary response from a runtime for another origin", async () => {
  const runtime = await createTestRuntime({ routes: { "GET /api/health": misconfigured } });
  serverStore.setState({ origin: "https://other.example", configurationError: null });
  await expect(runtime.api.call(endpoints.health, {})).rejects.toMatchObject({
    code: "server/misconfigured",
  });
  expect(serverStore.getState().configurationError).toBeNull();
});

it("resumes sync on its own once a misconfigured server is fixed, with no tap or return", async () => {
  const network = { broken: true };
  const runtime = await createTestRuntime({
    routes: {
      "GET /api/instance": () => (network.broken ? misconfigured() : fakeInstance),
    },
  });
  await runtime.auth.me();
  serverStore.setState({
    origin: runtime.baseUrl,
    configurationError: { reason: "project-mismatch" },
  });
  const start = jest.spyOn(runtime.sync, "start");
  jest.useFakeTimers();
  const view = await renderScreen(<Text>Local copy</Text>, runtime);
  try {
    expect(start).not.toHaveBeenCalled();
    network.broken = false;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CONFIGURATION_RECHECK_MAX_MS);
    });
    expect(serverStore.getState().configurationError).toBeNull();
    expect(start).toHaveBeenCalledTimes(1);
  } finally {
    await view.unmount();
    runtime.sync.stop();
    runtime.live.stop();
  }
});

it("finishes phone startup once after configuration interrupted the initial bootstrap", async () => {
  const network = { broken: true };
  const runtime = await createTestRuntime({
    routes: {
      "GET /api/instance": () => (network.broken ? misconfigured() : fakeInstance),
    },
  });
  await runtime.auth.me();
  serverStore.setState({
    origin: runtime.baseUrl,
    configurationError: { reason: "project-mismatch" },
  });
  const uploads = jest.spyOn(phoneRuntime, "sendPhoneData");
  const push = jest.spyOn(phoneRuntime, "startPhonePush");
  const start = jest.spyOn(runtime.sync, "start");
  const syncNow = jest.spyOn(runtime.sync, "syncNow");
  const view = await renderScreen(<Text>Local copy</Text>, runtime);
  try {
    expect(uploads).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    network.broken = false;
    await act(async () => {
      await checkServer(runtime);
    });
    await waitFor(() => {
      expect(start).toHaveBeenCalledTimes(1);
    });
    expect(uploads).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledTimes(1);
  } finally {
    await view.unmount();
  }
});
