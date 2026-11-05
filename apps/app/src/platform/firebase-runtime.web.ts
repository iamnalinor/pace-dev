import { createStore } from "zustand/vanilla";

import type { Instance } from "@pace/core";

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
  readonly status:
    | "disabled"
    | "error"
    | "package-missing"
    | "ready"
    | "restart-needed"
    | "unknown"
    | "unsupported";
  readonly projectId: null | string;
  readonly reason: "initialization-failed" | "invalid-config" | "storage-failed" | null;
  readonly blockReason: FirebaseBlockReason;
};
export const firebaseRuntimeStore = createStore<FirebaseRuntimeState>(() => ({
  origin: null,
  status: "unsupported",
  projectId: null,
  reason: null,
  blockReason: "unsupported",
}));
export const isRuntimeFirebase = (): boolean => false;
export const reconcileRuntimeFirebase = (_origin: string): void => undefined;
export const prepareRuntimeFirebase = (_origin: string, _instance: Instance): void => undefined;
export const stageRuntimeFirebase = (_origin: string, _instance: Instance): void => undefined;
export const commitRuntimeFirebase = (_origin: string): void => undefined;
export const restartRuntimeFirebase = (): void => undefined;
