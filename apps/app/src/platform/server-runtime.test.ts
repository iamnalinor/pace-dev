import * as SecureStore from "expo-secure-store";

import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";
import type * as PaceClient from "@pace/client";

import { checkInstance } from "@pace/client";
import { fakeInstance } from "@pace/client/testing";
import { err, InstanceSchema, ok } from "@pace/core";

import { paceNative } from "../../modules/pace-native/index.ts";
import { API_BASE_URL } from "./api-base.ts";
import { firebaseRuntimeStore } from "./firebase-runtime.ts";
import { serverStore } from "./server-store.ts";
import { retryServerRestart, serverSwitchStore } from "./server-switch-state.ts";
import { readServer, switchServer } from "./server.ts";

jest.mock("expo-constants", () => ({ expoConfig: { extra: { firebaseMode: "runtime" } } }));
jest.mock("@pace/client", () => ({
  ...jest.requireActual<typeof PaceClient>("@pace/client"),
  checkInstance: jest.fn(),
}));
const secureStore = SecureStore as unknown as FakeSecureStore;
const origin = "https://target.example";
const instance = InstanceSchema.parse(fakeInstance);
const ready = { status: "ready", projectId: "actual", reason: null } as const;

beforeEach(() => {
  serverSwitchStore.setState({ origin: null });
  secureStore.values.clear();
  secureStore.writes.isRefused = false;
  serverStore.setState({ origin: API_BASE_URL });
  jest.spyOn(paceNative, "stageFirebaseConfig").mockReturnValue(ready);
  jest.spyOn(paceNative, "commitFirebaseConfig").mockReturnValue(ready);
  jest.spyOn(paceNative, "restartApp").mockReturnValue(true);
  jest.mocked(checkInstance).mockResolvedValue(ok(instance));
});
afterEach(() => jest.restoreAllMocks());

it("stages before reset, writes before committing, restarts once without publishing another origin", async () => {
  const calls: string[] = [];
  jest.spyOn(paceNative, "stageFirebaseConfig").mockImplementation(() => {
    calls.push("stage");
    return ready;
  });
  jest.spyOn(paceNative, "commitFirebaseConfig").mockImplementation(() => {
    calls.push("commit");
    return ready;
  });
  jest.spyOn(paceNative, "restartApp").mockImplementation(() => {
    calls.push("restart");
    return true;
  });
  const resetLocalData = jest.fn(async () => {
    calls.push("reset");
  });
  await switchServer({ resetLocalData }, { origin, instance });
  expect(calls).toEqual(["stage", "reset", "commit", "restart"]);
  await expect(readServer()).resolves.toBe(origin);
  expect(serverStore.getState().origin).toBe(API_BASE_URL);
});
it("checks the build server before deleting local data on a return", async () => {
  jest.mocked(checkInstance).mockResolvedValue(err("unreachable"));
  const resetLocalData = jest.fn(async () => undefined);
  await expect(switchServer({ resetLocalData }, null)).rejects.toThrow();
  expect(checkInstance).toHaveBeenCalledWith(API_BASE_URL);
  expect(resetLocalData).not.toHaveBeenCalled();
});
it("does not reset local data if staging cannot persist", async () => {
  jest
    .spyOn(paceNative, "stageFirebaseConfig")
    .mockReturnValue({ status: "error", projectId: null, reason: "storage-failed" });
  const resetLocalData = jest.fn(async () => undefined);
  await expect(switchServer({ resetLocalData }, { origin, instance })).rejects.toThrow();
  expect(resetLocalData).not.toHaveBeenCalled();
});
it("does not commit or restart if SecureStore cannot persist", async () => {
  secureStore.writes.isRefused = true;
  await expect(
    switchServer({ resetLocalData: async () => undefined }, { origin, instance }),
  ).rejects.toThrow();
  expect(paceNative.commitFirebaseConfig).not.toHaveBeenCalled();
  expect(paceNative.restartApp).not.toHaveBeenCalled();
  expect(serverSwitchStore.getState().origin).toBeNull();
});
it("releases a failed restart for retry and coalesces simultaneous taps", async () => {
  jest.spyOn(paceNative, "restartApp").mockReturnValueOnce(false).mockReturnValue(true);
  const resetLocalData = jest.fn(async () => undefined);
  await expect(switchServer({ resetLocalData }, { origin, instance })).rejects.toThrow();
  const runtime = { resetLocalData };
  await Promise.all([
    switchServer(runtime, { origin, instance }),
    switchServer(runtime, { origin, instance }),
  ]);
  expect(resetLocalData).toHaveBeenCalledTimes(2);
  expect(paceNative.restartApp).toHaveBeenCalledTimes(2);
});
it("returns to the build through the same cold restart even for an identical project", async () => {
  const resetLocalData = jest.fn(async () => undefined);
  await switchServer({ resetLocalData }, null);
  expect(paceNative.stageFirebaseConfig).toHaveBeenCalledWith(API_BASE_URL, null);
  expect(paceNative.commitFirebaseConfig).toHaveBeenCalledWith(API_BASE_URL);
  expect(paceNative.restartApp).toHaveBeenCalledTimes(1);
});

it("refuses to trust the build origin when the selected origin cannot be read", async () => {
  const storage = jest.requireMock<FakeSecureStore>("expo-secure-store");
  storage.readGate = Promise.reject(new Error("keystore"));
  try {
    await expect(readServer()).rejects.toThrow("server-read-failed");
  } finally {
    storage.readGate = null;
  }
});

it("keeps the old coordinator selection usable when staging fails", async () => {
  firebaseRuntimeStore.setState({ origin: API_BASE_URL, ...ready, blockReason: null });
  jest
    .spyOn(paceNative, "stageFirebaseConfig")
    .mockReturnValue({ status: "error", projectId: "actual", reason: "storage-failed" });
  await expect(
    switchServer({ resetLocalData: async () => undefined }, { origin, instance }),
  ).rejects.toThrow();
  expect(firebaseRuntimeStore.getState()).toMatchObject({ origin: API_BASE_URL, status: "ready" });
});
it("reconciles the actual durable old origin after a failed write, then allows retry", async () => {
  jest.spyOn(paceNative, "reconcileFirebaseOrigin").mockReturnValue(ready);
  secureStore.writes.isRefused = true;
  await expect(
    switchServer({ resetLocalData: async () => undefined }, { origin, instance }),
  ).rejects.toThrow();
  expect(paceNative.reconcileFirebaseOrigin).toHaveBeenCalledWith(API_BASE_URL);
  expect(firebaseRuntimeStore.getState()).toMatchObject({ origin: API_BASE_URL, status: "ready" });
  secureStore.writes.isRefused = false;
  await switchServer({ resetLocalData: async () => undefined }, { origin, instance });
  await expect(readServer()).resolves.toBe(origin);
});

it("holds a persisted selection after commit failure and retries without clearing local data", async () => {
  jest
    .spyOn(paceNative, "commitFirebaseConfig")
    .mockReturnValue({ status: "error", projectId: "actual", reason: "storage-failed" });
  jest.spyOn(paceNative, "reconcileFirebaseOrigin").mockReturnValue(ready);
  const resetLocalData = jest.fn(async () => undefined);
  await expect(switchServer({ resetLocalData }, { origin, instance })).rejects.toThrow();
  expect(serverSwitchStore.getState().origin).toBe(origin);
  expect(serverStore.getState().origin).toBe(API_BASE_URL);
  expect(paceNative.restartApp).not.toHaveBeenCalled();
  retryServerRestart();
  expect(paceNative.restartApp).toHaveBeenCalledTimes(1);
  expect(resetLocalData).toHaveBeenCalledTimes(1);
});
