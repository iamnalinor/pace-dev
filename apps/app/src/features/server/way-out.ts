import type { MessageKey } from "@pace/core";

/**
What the versions screen tells a phone: update the app from its store, or log out and sign in on
another server (the login screen's Change). Nothing to reload: the app is installed.
*/
export const WAY_OUT: {
  readonly appOutdated: MessageKey;
  readonly serverOutdated: MessageKey;
  readonly reload: (() => void) | null;
} = {
  appOutdated: "server.mismatchApp",
  reload: null,
  serverOutdated: "server.mismatchServer",
};
