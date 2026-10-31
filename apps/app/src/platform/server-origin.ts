import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useStore } from "zustand";

import type { PaceRuntime } from "../runtime.ts";

import { applyInstanceCheck, serverStore } from "./server-store.ts";
import { readServer } from "./server.ts";

/**
The server to build the runtime for: `null` until the stored choice is read into `serverStore`,
then its origin (a switch on the login screen changes it, and the runtime is built again).
*/
export const useServerOrigin = (isNeeded: boolean): null | string => {
  const [isRead, setIsRead] = useState(false);
  const origin = useStore(serverStore, (state) => state.origin);
  useEffect(() => {
    if (!isNeeded) {
      return;
    }
    void (async () => {
      serverStore.setState({ origin: await readServer() });
      setIsRead(true);
    })();
  }, [isNeeded]);
  return isRead ? origin : null;
};

/** Asks the runtime's server what it is and whether it fits this app, into `serverStore`. */
const checkServer = (runtime: Pick<PaceRuntime, "baseUrl" | "checkInstance">): void => {
  void (async () => {
    applyInstanceCheck(runtime.baseUrl, await runtime.checkInstance());
  })();
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
    checkServer(runtime);
  }
  const stopAuth = runtime.auth.store.subscribe((current, previous) => {
    if (current.status !== previous.status && current.status !== "loading") {
      checkServer(runtime);
    }
  });
  const returns = AppState.addEventListener("change", (next) => {
    if (next === "active") {
      checkServer(runtime);
    }
  });
  return () => {
    stopAuth();
    returns.remove();
  };
};
