import { createStore } from "zustand/vanilla";

import {
  firebaseRuntimeStore,
  reconcileRuntimeFirebase,
  restartRuntimeFirebase,
} from "./firebase-runtime.ts";

/** A durably selected server may only take over after a cold launch. Never resume the old UI. */
export const serverSwitchStore = createStore<{ readonly origin: null | string }>(() => ({
  origin: null,
}));

/** Shared lifetime gate for authentication, observers and every sender. */
export const canUseCurrentServer = (): boolean => serverSwitchStore.getState().origin === null;

/** Retry only the unfinished handoff; never clear the local log or session again. */
export const retryServerRestart = (): void => {
  const { origin } = serverSwitchStore.getState();
  if (origin === null) {
    return;
  }
  reconcileRuntimeFirebase(origin);
  const { status } = firebaseRuntimeStore.getState();
  if (status === "error" || status === "unsupported") {
    throw new Error("server-restart-failed");
  }
  restartRuntimeFirebase();
};
