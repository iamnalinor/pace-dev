import { fakeInstance } from "@pace/client/testing";
import { InstanceSchema } from "@pace/core";

import { paceNative } from "../../modules/pace-native/index.ts";
import {
  firebaseRuntimeStore,
  prepareRuntimeFirebase,
  reconcileRuntimeFirebase,
} from "./firebase-runtime.ts";
import { serverStore } from "./server-store.ts";

jest.mock("expo-constants", () => ({ expoConfig: { extra: { firebaseMode: "runtime" } } }));

const origin = "https://custom.example";
const instance = InstanceSchema.parse({
  ...fakeInstance,
  firebase: {
    projectId: "project",
    senderId: "sender",
    apps: [{ packageName: "custom.package", appId: "app", apiKey: "key" }],
  },
});

beforeEach(() => {
  serverStore.setState({ origin });
  jest.spyOn(paceNative, "packageName").mockReturnValue("custom.package");
  jest.spyOn(paceNative, "restartApp").mockReturnValue(true);
  jest
    .spyOn(paceNative, "reconcileFirebaseOrigin")
    .mockReturnValue({ status: "disabled", projectId: null, reason: null });
  jest
    .spyOn(paceNative, "ensureFirebase")
    .mockReturnValue({ status: "ready", projectId: "actual", reason: null });
});
afterEach(() => jest.restoreAllMocks());

it("reconciles persisted origin before ensuring the exact native package's four options", () => {
  reconcileRuntimeFirebase(origin);
  prepareRuntimeFirebase(origin, instance);
  expect(paceNative.ensureFirebase).toHaveBeenCalledWith(
    origin,
    JSON.stringify({ projectId: "project", senderId: "sender", appId: "app", apiKey: "key" }),
  );
  expect(firebaseRuntimeStore.getState()).toMatchObject({
    origin,
    status: "ready",
    projectId: "actual",
  });
});
it("ignores old-origin discovery without persisting native options", () => {
  reconcileRuntimeFirebase(origin);
  serverStore.setState({ origin: "https://new.example" });
  prepareRuntimeFirebase(origin, instance);
  expect(paceNative.ensureFirebase).not.toHaveBeenCalled();
});
it("makes disabled and missing package distinct", () => {
  reconcileRuntimeFirebase(origin);
  prepareRuntimeFirebase(origin, { ...instance, firebase: null });
  expect(paceNative.ensureFirebase).toHaveBeenCalledWith(origin, null);
  jest.spyOn(paceNative, "packageName").mockReturnValue("other.package");
  prepareRuntimeFirebase(origin, instance);
  expect(firebaseRuntimeStore.getState().status).toBe("package-missing");
});

it.each([
  { status: "restart-needed", projectId: "old-project", reason: null },
  { status: "error", projectId: "actual-project", reason: "storage-failed" },
  { status: "error", projectId: null, reason: "initialization-failed" },
  { status: "unsupported", projectId: null, reason: null },
] as const)("preserves explicit native status $status / $reason", (state) => {
  reconcileRuntimeFirebase(origin);
  jest.spyOn(paceNative, "ensureFirebase").mockReturnValue(state);
  prepareRuntimeFirebase(origin, instance);
  expect(firebaseRuntimeStore.getState()).toMatchObject({ origin, ...state });
});

it("records disabled selection independently when the old native app still needs restart", () => {
  reconcileRuntimeFirebase(origin);
  jest
    .spyOn(paceNative, "ensureFirebase")
    .mockReturnValue({ status: "restart-needed", projectId: "old-project", reason: null });
  prepareRuntimeFirebase(origin, { ...instance, firebase: null });
  expect(firebaseRuntimeStore.getState()).toMatchObject({
    status: "restart-needed",
    projectId: "old-project",
    blockReason: "server-disabled",
  });
  expect(paceNative.restartApp).not.toHaveBeenCalled();
});

it("turns an unavailable bridge operation into explicit unsupported status", () => {
  reconcileRuntimeFirebase(origin);
  jest.spyOn(paceNative, "ensureFirebase").mockImplementation(() => {
    throw new TypeError("method absent");
  });
  prepareRuntimeFirebase(origin, instance);
  expect(firebaseRuntimeStore.getState()).toMatchObject({
    origin,
    status: "unsupported",
    blockReason: "unsupported",
  });
});
