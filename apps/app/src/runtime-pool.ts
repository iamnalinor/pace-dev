import type { PaceRuntime } from "./runtime.ts";

import { onWindowFocus } from "./platform/window-focus.ts";
import { canStartSenders } from "./senders.ts";

/** How long a fetch of the notification pool counts as current: no second one a moment later. */
const POOL_FRESH_MS = 5000;

/**
The notification pool's refresh, remembering when it last succeeded: the socket's connection
right after the signed-in start (or a return to the app) asks for what the pool got meanwhile,
which was just fetched (QA round 20 L9: two identical requests a second apart).
*/
export type Pool = { readonly refresh: () => Promise<void>; readonly isFresh: () => boolean };

export const poolOf = (runtime: PaceRuntime): Pool => {
  let fetchedAt = -Infinity;
  return {
    isFresh: () => Date.now() - fetchedAt < POOL_FRESH_MS,
    refresh: async () => {
      const { store } = runtime.notifications;
      const before = store.getState();
      await runtime.notifications.refresh();
      // A page that came sets the feed anew; offline it is left as it was.
      const after = store.getState();
      if (after !== before && after.status === "ready") {
        fetchedAt = Date.now();
      }
    },
  };
};

/**
Back in the window while the offline line shows: the server is tried at once, not at the end of
the backoff (QA round 20 L2). Online, a focus asks for nothing. Answers the way to stop.
*/
export const retryOnWindowFocus = (runtime: PaceRuntime): (() => void) =>
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
