import { AppState } from "react-native";

import type { PaceRuntime } from "./runtime.ts";

import { onWindowFocus } from "./platform/window-focus.ts";
import { canStartSenders } from "./senders.ts";

/**
The notification pool's refresh for the start, a return and the socket's connection: a page the
feed fetched a moment ago (by the start, or by the Notifications screen opening) is not fetched
again (QA round 20 L9, QA PR55-1-12: the same page twice a few hundred ms apart).
*/
export type Pool = { readonly refresh: () => Promise<void> };

export const poolOf = (runtime: PaceRuntime): Pool => ({
  refresh: async () => {
    await runtime.notifications.refreshUnlessFresh();
  },
});

/**
Back in the window while the offline line shows: the server is tried at once, not at the end of
the backoff (QA round 20 L2). Online, a focus asks for nothing. Answers the way to stop.
*/
const retryOnWindowFocus = (runtime: PaceRuntime): (() => void) =>
  onWindowFocus(() => {
    const { live, sync } = runtime;
    // Not while this device ends its own session (class 75), nor when online.
    if (!canStartSenders(runtime) || sync.status.getState().online) {
      return;
    }
    live.stop();
    live.start();
    void sync.syncNow();
  });

/**
Back in the app (the app has no network signal of its own): a Log out the server did not hear goes
again, signed in or not (QA round 22 R22-02). Answers the way to stop.
*/
const retryEndedOnReturn = (runtime: PaceRuntime): (() => void) => {
  const subscription = AppState.addEventListener("change", (next) => {
    if (next === "active") {
      void runtime.auth.retryEndedSessions();
    }
  });
  return () => {
    subscription.remove();
  };
};

/** What a return to the app or the window retries: the offline sync, a kept Log out. */
export const followReturns = (runtime: PaceRuntime): (() => void) => {
  const stops = [retryOnWindowFocus(runtime), retryEndedOnReturn(runtime)];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
};
