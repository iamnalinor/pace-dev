import type { MessageKey } from "@pace/core";

/**
On the web the app is the page: an outdated one is fixed by reloading it, and there is no other
server to sign in on (the web build has no Change), so its owner updates it (QA round 17 L1).
*/
export const WAY_OUT: {
  readonly appOutdated: MessageKey;
  readonly serverOutdated: MessageKey;
  readonly reload: (() => void) | null;
} = {
  appOutdated: "server.mismatchAppWeb",
  reload: () => {
    globalThis.location.reload();
  },
  serverOutdated: "server.mismatchServerWeb",
};
