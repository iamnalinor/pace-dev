/*
The API protocol: one integer the app and the server each carry, so an app can tell whether a
server (its own or a self-hosted one) speaks a contract it understands, and the server can turn
away an app too old for it. Bump `PROTOCOL` on a breaking API change only: adding a field or an
endpoint is never breaking (answers are read loosened). Raise a minimum when the other side's
older protocol stops being served.
*/

/** The protocol this build speaks (the app sends it, the server answers with it). */
export const PROTOCOL = 1;

/** The oldest app protocol a server built from this code still serves. */
export const MIN_CLIENT_PROTOCOL = 1;

/** The oldest server protocol an app built from this code still talks to. */
export const MIN_SERVER_PROTOCOL = 1;

/**
The request header the app sends its protocol in. A request without it (a cached web build, an
older APK) is served; an unreadable value counts as absent.
*/
export const PROTOCOL_HEADER = "X-Pace-Protocol";

/** The error code of a request refused because the app is older than the server serves (426). */
export const CLIENT_OUTDATED = "client/outdated";

/** Whether an app and a server fit, and which one needs an update when they do not. */
export type Compatibility = "client-outdated" | "ok" | "server-outdated";

type ClientProtocol = { readonly protocol: number; readonly minServerProtocol: number };

/** The app this code builds. */
const THIS_CLIENT: ClientProtocol = { minServerProtocol: MIN_SERVER_PROTOCOL, protocol: PROTOCOL };

/**
Whether this server and this app (this build unless named) fit: each must meet the other's
minimum. When both fall short the server is named, since an app cannot talk to it at all.
*/
export const compatibility = (
  server: { readonly protocol: number; readonly minClientProtocol: number },
  client: ClientProtocol = THIS_CLIENT,
): Compatibility => {
  if (server.protocol < client.minServerProtocol) {
    return "server-outdated";
  }
  return client.protocol < server.minClientProtocol ? "client-outdated" : "ok";
};
