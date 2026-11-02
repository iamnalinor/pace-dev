import type { PeerTabs } from "@pace/client";

/** The app is one process with one copy of the log: no other tab shares it. */
export const createPeerTabs = (_isShared: () => Promise<boolean>): PeerTabs | undefined =>
  undefined;
