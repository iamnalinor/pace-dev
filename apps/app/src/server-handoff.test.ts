import { AppState } from "react-native";

import { createMemoryEventStore, createMemorySessionStore } from "@pace/client";
import { createFakeFetch, fakeInstance, fakeUser, storedEvents } from "@pace/client/testing";
import { InstanceSchema } from "@pace/core";

import type { FakeSecureStore } from "./testing/secure-store.fake.ts";

import { paceNative } from "../modules/pace-native/index.ts";
import { serverStore } from "./platform/server-store.ts";
import { serverSwitchStore } from "./platform/server-switch-state.ts";
import { switchServer } from "./platform/server.ts";
import { createRuntime } from "./runtime.ts";
import { canStartSenders } from "./senders.ts";
import { runSyncLoop } from "./sync-loop.ts";

jest.mock("expo-constants", () => ({ expoConfig: { extra: { firebaseMode: "runtime" } } }));
beforeEach(() => {
  jest
    .requireMock<FakeSecureStore>("expo-secure-store")
    .values.set("pace.server", "https://old.example");
});
afterEach(() => {
  serverSwitchStore.setState({ origin: null });
  jest.restoreAllMocks();
});

it("drops a deferred old-server login and stays network quiet after persisted handoff", async () => {
  const answer = Promise.withResolvers<unknown>();
  const fake = createFakeFetch({
    "GET /api/instance": () => fakeInstance,
    "GET /api/auth/nonce/old": async () => await answer.promise,
  });
  const session = createMemorySessionStore();
  const eventStore = createMemoryEventStore();
  const runtime = await createRuntime({
    baseUrl: "https://old.example",
    deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    session,
    eventStore,
    fetch: fake.fetch,
  });
  await runtime.auth.ready;
  serverStore.setState({ origin: runtime.baseUrl, configurationError: null });
  const ready = { status: "ready", projectId: "project", reason: null } as const;
  jest.spyOn(paceNative, "stageFirebaseConfig").mockReturnValue(ready);
  jest.spyOn(paceNative, "commitFirebaseConfig").mockReturnValue(ready);
  jest.spyOn(paceNative, "reconcileFirebaseOrigin").mockReturnValue(ready);
  jest.spyOn(paceNative, "restartApp").mockReturnValue(false);
  const foregroundListener = jest.spyOn(AppState, "addEventListener");
  const stop = runSyncLoop(runtime, () => undefined);
  const claim = jest.spyOn(runtime, "claimLocalCopy");
  const sync = jest.spyOn(runtime.sync, "syncNow");
  const live = jest.spyOn(runtime.live, "start");
  const waiting = runtime.auth
    .resumeBotLogin("old")
    .waitForToken({ intervalMs: 1, timeoutMs: 1000 });
  try {
    await expect(
      switchServer(runtime, {
        origin: "https://new.example",
        instance: InstanceSchema.parse(fakeInstance),
      }),
    ).rejects.toThrow();
    answer.resolve({ status: "ready", token: "old-token", user: fakeUser });
    await expect(waiting).resolves.toEqual({ ok: false, error: "cancelled" });
    await expect(session.get()).resolves.toBeNull();
    expect(runtime.auth.token()).toBeUndefined();
    expect(runtime.auth.store.getState().status).toBe("signed-out");
    expect(claim).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    expect(live).not.toHaveBeenCalled();
    const requests = fake.calls.length;
    const foreground = foregroundListener.mock.calls.filter(([name]) => name === "change");
    for (const [, onChange] of foreground) {
      onChange("active");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 15));
    expect(fake.calls).toHaveLength(requests);
    // Every starter still refuses even an independently published stale signed-in state.
    runtime.auth.store.setState({ status: "signed-in", user: fakeUser });
    expect(canStartSenders(runtime)).toBe(false);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(claim).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(requests);
    await expect(storedEvents(eventStore)).resolves.toEqual([]);
  } finally {
    stop();
    runtime.close();
  }
});

it.each(["grant", "adopt"] as const)(
  "drains a deferred %s storage write before persisting another server",
  async (kind) => {
    const memory = createMemorySessionStore();
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const session = {
      ...memory,
      set: async (token: string) => {
        entered.resolve(undefined);
        await release.promise;
        await memory.set(token);
      },
    };
    const fake = createFakeFetch({
      "POST /api/auth/dev": () => ({ token: "old", user: fakeUser }),
      "GET /api/me": () => fakeUser,
    });
    const runtime = await createRuntime({
      baseUrl: "https://old.example",
      deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      session,
      eventStore: createMemoryEventStore(),
      fetch: fake.fetch,
    });
    await runtime.auth.ready;
    serverStore.setState({ origin: runtime.baseUrl, configurationError: null });
    const ready = { status: "ready", projectId: "project", reason: null } as const;
    jest.spyOn(paceNative, "stageFirebaseConfig").mockReturnValue(ready);
    const commit = jest.spyOn(paceNative, "commitFirebaseConfig").mockReturnValue(ready);
    jest.spyOn(paceNative, "reconcileFirebaseOrigin").mockReturnValue(ready);
    jest.spyOn(paceNative, "restartApp").mockReturnValue(false);
    const login =
      kind === "grant" ? runtime.auth.loginWithDev("1") : runtime.auth.adoptToken("old");
    await entered.promise;
    const moving = switchServer(runtime, {
      origin: "https://new.example",
      instance: InstanceSchema.parse(fakeInstance),
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(commit).not.toHaveBeenCalled();
    release.resolve(undefined);
    await expect(moving).rejects.toThrow();
    await expect(login).resolves.toEqual({ ok: false, error: "session/changed" });
    await expect(memory.get()).resolves.toBeNull();
    expect(runtime.auth.token()).toBeUndefined();
    expect(runtime.auth.store.getState().status).toBe("signed-out");
    expect(fake.calls.filter(({ path }) => path === "/api/me")).toEqual([]);
    expect(serverSwitchStore.getState().origin).toBe("https://new.example");
    runtime.close();
  },
);

it("aborts before origin persistence when the handoff session clear fails, then allows fresh old-server login", async () => {
  const memory = createMemorySessionStore();
  const storage = { refused: true };
  const fake = createFakeFetch({
    "POST /api/auth/dev": () => ({ token: "fresh-old", user: fakeUser }),
  });
  const runtime = await createRuntime({
    baseUrl: "https://old.example",
    deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    session: {
      ...memory,
      clear: async () => {
        if (storage.refused) {
          throw new Error("disk");
        }
        await memory.clear();
      },
    },
    eventStore: createMemoryEventStore(),
    fetch: fake.fetch,
  });
  await runtime.auth.ready;
  serverStore.setState({ origin: runtime.baseUrl, configurationError: null });
  const ready = { status: "ready", projectId: "project", reason: null } as const;
  jest.spyOn(paceNative, "stageFirebaseConfig").mockReturnValue(ready);
  const commit = jest.spyOn(paceNative, "commitFirebaseConfig").mockReturnValue(ready);
  jest.spyOn(paceNative, "reconcileFirebaseOrigin").mockReturnValue(ready);
  const reset = jest.spyOn(runtime, "resetLocalData");
  await expect(
    switchServer(runtime, {
      origin: "https://new.example",
      instance: InstanceSchema.parse(fakeInstance),
    }),
  ).rejects.toThrow("disk");
  expect(reset).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(serverSwitchStore.getState().origin).toBeNull();
  storage.refused = false;
  await expect(runtime.auth.loginWithDev("1")).resolves.toEqual({ ok: true, value: fakeUser });
  await expect(memory.get()).resolves.toBe("fresh-old");
  runtime.close();
});
