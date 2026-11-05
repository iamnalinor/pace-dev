import Constants from "expo-constants";
import { createStore } from "zustand/vanilla";

import type { Instance } from "@pace/core";

import { type FirebaseStatus, paceNative } from "../../modules/pace-native/index.ts";
import { serverStore } from "./server-store.ts";

export type FirebaseBlockReason =
  | "initialization-failed"
  | "invalid-config"
  | "package-missing"
  | "restart-needed"
  | "server-disabled"
  | "storage-failed"
  | "unsupported"
  | null;
export type FirebaseRuntimeState = {
  readonly origin: null | string;
  readonly status: "package-missing" | "unknown" | FirebaseStatus["status"];
  readonly projectId: null | string;
  readonly reason: FirebaseStatus["reason"];
  readonly blockReason: FirebaseBlockReason;
};

/** Origin-scoped native facts. Project id always comes from the actual native app. */
export const firebaseRuntimeStore = createStore<FirebaseRuntimeState>(() => ({
  origin: null,
  status: "unknown",
  projectId: null,
  reason: null,
  blockReason: null,
}));
export const isRuntimeFirebase = (): boolean =>
  Constants.expoConfig?.extra?.["firebaseMode"] === "runtime";

const publish = (
  origin: string,
  state: FirebaseStatus,
  blockReason: FirebaseBlockReason = null,
): void => {
  firebaseRuntimeStore.setState({
    ...state,
    origin,
    blockReason:
      blockReason ??
      state.reason ??
      (state.status === "restart-needed" || state.status === "unsupported" ? state.status : null),
  });
};

// An installed APK can predate this bridge. Missing methods remain visible as unsupported.
const readNative = (operation: () => FirebaseStatus): FirebaseStatus => {
  try {
    return operation();
  } catch (error) {
    return error instanceof TypeError
      ? { status: "unsupported", projectId: null, reason: null }
      : { status: "error", projectId: null, reason: "initialization-failed" };
  }
};

const selection = (
  instance: Instance,
): { readonly json: null | string; readonly blockReason: FirebaseBlockReason } => {
  if (instance.firebase === null) {
    return { json: null, blockReason: "server-disabled" };
  }
  const app = instance.firebase.apps.find(
    ({ packageName }) =>
      packageName ===
      (typeof paceNative.packageName === "function" ? paceNative.packageName() : null),
  );
  return app === undefined
    ? { json: null, blockReason: "package-missing" }
    : {
        json: JSON.stringify({
          projectId: instance.firebase.projectId,
          senderId: instance.firebase.senderId,
          appId: app.appId,
          apiKey: app.apiKey,
        }),
        blockReason: null,
      };
};

/** Must receive only the origin just read from durable SecureStore. */
export const reconcileRuntimeFirebase = (origin: string): void => {
  if (isRuntimeFirebase()) {
    publish(
      origin,
      readNative(() => paceNative.reconcileFirebaseOrigin(origin)),
    );
  }
};

/** Discovery of an old runtime never changes the persisted native selection. */
export const prepareRuntimeFirebase = (origin: string, instance: Instance): void => {
  if (
    !isRuntimeFirebase() ||
    serverStore.getState().origin !== origin ||
    firebaseRuntimeStore.getState().origin !== origin
  ) {
    return;
  }
  const selected = selection(instance);
  const state = readNative(() => paceNative.ensureFirebase(origin, selected.json));
  publish(origin, state, selected.blockReason);
  if (
    selected.blockReason === "package-missing" &&
    state.status !== "error" &&
    state.status !== "unsupported" &&
    state.status !== "restart-needed"
  ) {
    firebaseRuntimeStore.setState({ status: "package-missing" });
  }
};

const requireStored = (state: FirebaseStatus): void => {
  if (state.status === "error" || state.status === "unsupported") {
    throw new Error("firebase-selection-failed");
  }
};

/** A staged change revokes the old origin's ensure authority until a cold launch. */
export const stageRuntimeFirebase = (origin: string, instance: Instance): void => {
  const selected = selection(instance);
  const state = readNative(() => paceNative.stageFirebaseConfig(origin, selected.json));
  requireStored(state);
  publish(origin, state, selected.blockReason);
};
export const commitRuntimeFirebase = (origin: string): void => {
  const state = readNative(() => paceNative.commitFirebaseConfig(origin));
  const { blockReason } = firebaseRuntimeStore.getState();
  publish(origin, state, blockReason);
  requireStored(state);
};
export const restartRuntimeFirebase = (): void => {
  if (typeof paceNative.restartApp !== "function" || !paceNative.restartApp()) {
    throw new Error("firebase-restart-failed");
  }
};
