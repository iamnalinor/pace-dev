import type { PeerTabs } from "@pace/client";

/** One channel for every tab of the profile: they share one IndexedDB copy of the log. */
const CHANNEL = "pace.local-log";

/**
The other tabs (and installed-app windows) of this browser profile. They share the copy of the
log and the device id, so the server tells none of them about the others' writes (QA round 17 M1).
*/
export const createPeerTabs = (): PeerTabs | undefined => {
  if (typeof BroadcastChannel === "undefined") {
    return undefined;
  }
  const channel = new BroadcastChannel(CHANNEL);
  return {
    listen: (onMessage) => {
      const listener = (event: MessageEvent<unknown>): void => {
        onMessage(event.data);
      };
      channel.addEventListener("message", listener);
      return () => {
        channel.removeEventListener("message", listener);
      };
    },
    post: (change) => {
      try {
        channel.postMessage(change);
      } catch {
        // A closing tab: the others read the shared copy when they sync or reload.
      }
    },
  };
};
