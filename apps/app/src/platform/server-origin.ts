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

/** A misconfigured server is asked again after 5 s, 10 s, 20 s, … at most every 5 minutes. */
export const CONFIGURATION_RECHECK_MIN_MS = 5000;
export const CONFIGURATION_RECHECK_MAX_MS = 5 * 60_000;

const recheckDelay = (attempt: number): number =>
  Math.min(CONFIGURATION_RECHECK_MIN_MS * 2 ** (attempt - 1), CONFIGURATION_RECHECK_MAX_MS);

/**
While the runtime's server says it is misconfigured, sync and the socket are parked: it is asked
again on its own with a growing delay, so an owner who fixes the server gets a device that
resumes without a tap or a return to the app. The delay starts over once the server answers.
*/
const recheckWhileMisconfigured = (
  runtime: Pick<PaceRuntime, "baseUrl" | "checkInstance">,
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  // Each run of re-checks has its own number: a check still out when its run ended arms nothing.
  let run = 0;
  const isMisconfigured = (state = serverStore.getState()): boolean =>
    state.origin === runtime.baseUrl && state.configurationError !== null;
  const arm = (owner: number): void => {
    attempt += 1;
    timer = setTimeout(() => {
      void (async () => {
        try {
          await checkServer(runtime);
        } catch {
          // Asked again at the next delay.
        }
        if (owner === run && isMisconfigured()) {
          arm(owner);
        }
      })();
    }, recheckDelay(attempt));
  };
  const end = (): void => {
    clearTimeout(timer);
    run += 1;
    attempt = 0;
  };
  const stopStore = serverStore.subscribe((current, previous) => {
    if (!isMisconfigured(current)) {
      end();
    } else if (!isMisconfigured(previous)) {
      end();
      arm(run);
    }
  });
  if (isMisconfigured()) {
    arm(run);
  }
  return () => {
    stopStore();
    end();
  };
};

/**
Keeps `serverStore` current for the runtime's server: asked on start, on every sign-in and
sign-out, on every return to the app (the server may have been updated meanwhile, or what
stood in the way has cleared, so a held person gets back in), and again on its own while it says
it is misconfigured. The versions screen and the login refusal read it from there.
*/
export const watchServer = (
  runtime: Pick<PaceRuntime, "auth" | "baseUrl" | "checkInstance">,
): (() => void) => {
  const stopRechecks = recheckWhileMisconfigured(runtime);
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
    stopRechecks();
    stopAuth();
    returns.remove();
  };
};
