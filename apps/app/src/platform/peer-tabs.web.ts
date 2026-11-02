import type { PeerTabs } from "@pace/client";

/** One channel for every tab of the profile: they share one IndexedDB copy of the log. */
const CHANNEL = "pace.local-log";

/**
The other tabs (and installed-app windows) of this browser profile. They share the copy of the
log and the device id, so the server tells none of them about the others' writes (QA round 17 M1).

The line is joined only once the copy is known to be shared (`isShared`: IndexedDB opened). A page
whose IndexedDB is blocked keeps its copy in memory: told of another tab's events it would show them
without having them, and lose them on its next read (review m2). Posts and messages wait for that
answer in order; it comes with the store's first read, before any message can arrive as a task.
*/
export const createPeerTabs = (isShared: () => Promise<boolean>): PeerTabs | undefined => {
  if (typeof BroadcastChannel === "undefined") {
    return undefined;
  }
  // An object, not a `let`: the closures below change it.
  const line = { isClosed: false };
  const joined: Promise<BroadcastChannel | null> = (async () => {
    try {
      return (await isShared()) && !line.isClosed ? new BroadcastChannel(CHANNEL) : null;
    } catch {
      return null;
    }
  })();
  return {
    close: () => {
      line.isClosed = true;
      void (async () => {
        const channel = await joined;
        channel?.close();
      })();
    },
    listen: (onMessage) => {
      const listener = (event: MessageEvent<unknown>): void => {
        onMessage(event.data);
      };
      void (async () => {
        const channel = await joined;
        if (!line.isClosed) {
          channel?.addEventListener("message", listener);
        }
      })();
      return () => {
        void (async () => {
          const channel = await joined;
          channel?.removeEventListener("message", listener);
        })();
      };
    },
    post: (change) => {
      void (async () => {
        const channel = await joined;
        try {
          if (!line.isClosed) {
            channel?.postMessage(change);
          }
        } catch {
          // A closing tab: the others read the shared copy when they sync or reload.
        }
      })();
    },
  };
};
