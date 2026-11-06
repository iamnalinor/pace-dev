import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useStore } from "zustand";

import type { PaceRuntime } from "../runtime.ts";

import { prepareRuntimeFirebase, reconcileRuntimeFirebase } from "./firebase-runtime.ts";
import { applyInstanceCheck, serverStore } from "./server-store.ts";
import { canUseCurrentServer } from "./server-switch-state.ts";
import { readServer } from "./server.ts";

/**
The server to build the runtime for: `null` until the stored choice is read into `serverStore`,
then its origin (a switch on the login screen changes it, and the runtime is built again).
*/
export const useServerOrigin = (isNeeded: boolean): null | string => {
  const [readError, setReadError] = useState<Error | null>(null);
  const [isRead, setIsRead] = useState(false);
  const origin = useStore(serverStore, (state) => state.origin);
  useEffect(() => {
    if (!isNeeded) {
      return;
    }
    void (async () => {
      try {
        const selected = await readServer();
        reconcileRuntimeFirebase(selected);
        serverStore.setState({ origin: selected });
        setIsRead(true);
      } catch {
        setReadError(new Error("server-read-failed"));
      }
    })();
  }, [isNeeded]);
  if (readError !== null) {
    throw readError;
  }
  return isRead ? origin : null;
};

/** Asks the runtime's server what it is and whether it fits this app, into `serverStore`. */
const checks = new WeakMap<object, Promise<void>>();
export const checkServer = (
  runtime: Pick<PaceRuntime, "baseUrl" | "checkInstance">,
): Promise<void> => {
  if (!canUseCurrentServer()) {
    return Promise.resolve();
  }
  const pending = checks.get(runtime);
  if (pending !== undefined) {
    return pending;
  }
  const check = (async () => {
    try {
      const result = await runtime.checkInstance();
      if (!canUseCurrentServer()) {
        return;
      }
      if (result.ok) {
        prepareRuntimeFirebase(runtime.baseUrl, result.value);
      }
      applyInstanceCheck(runtime.baseUrl, result);
    } finally {
      checks.delete(runtime);
    }
  })();
  checks.set(runtime, check);
  return check;
};

/**
Keeps `serverStore` current for the runtime's server: asked on start, on every sign-in and
sign-out, and on every return to the app (the server may have been updated meanwhile, or what
stood in the way has cleared, so a held person gets back in). The versions screen and the login
refusal read it from there.
*/
export const watchServer = (
  runtime: Pick<PaceRuntime, "auth" | "baseUrl" | "checkInstance">,
): (() => void) => {
  if (runtime.auth.store.getState().status !== "loading") {
    void checkServer(runtime);
  }
  const stopAuth = runtime.auth.store.subscribe((current, previous) => {
    if (current.status !== previous.status && current.status !== "loading") {
      void checkServer(runtime);
    }
  });
  const returns = AppState.addEventListener("change", (next) => {
    if (next === "active") {
      void checkServer(runtime);
    }
  });
  return () => {
    stopAuth();
    returns.remove();
  };
};
