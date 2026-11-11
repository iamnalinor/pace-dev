import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { InstanceError } from "@pace/client";
import type { FirebaseConfigReason, Instance, Result } from "@pace/core";

import { API_BASE_URL, TELEGRAM_BOT, WEB_ORIGIN } from "./api-base.ts";

/** Which side needs an update when the app and its server do not fit. */
export type MismatchReason = "client-outdated" | "server-outdated";

export type ServerState = {
  /** The server this app talks to (`readServer`), set before the runtime is built for it. */
  readonly origin: string;
  /** Configuration failure belongs to this origin and never forces a sign-out. */
  readonly configurationError: null | { readonly reason: FirebaseConfigReason | null };
  /** What the server said about itself this session; null until it answered. */
  readonly instance: Instance | null;
  readonly status: "incompatible" | "ok" | "unknown";
  readonly reason: MismatchReason | null;
};

/** Whether `origin` is the server this build was made for (`EXPO_PUBLIC_API_URL`). */
export const isBuildServer = (origin: string): boolean => origin === API_BASE_URL;

/** The host (and a port that is not the default) people know a server by. */
export const serverHost = (origin: string): string => new URL(origin).host;

/** The current server and whether it fits this app (`unknown` until it answered, never blocking). */
export const serverStore = createStore<ServerState>(() => ({
  configurationError: null,
  instance: null,
  origin: API_BASE_URL,
  reason: null,
  status: "unknown",
}));

const mismatch = (origin: string, reason: MismatchReason): void => {
  if (serverStore.getState().origin === origin) {
    serverStore.setState({ configurationError: null, reason, status: "incompatible" });
  }
};

/**
One instance check of the current server (on start and each sign-in), into the store. A server
that does not answer `/api/instance` at all is a Pace older than the route, so older than this app
supports; one it cannot reach blocks nothing (what it said last is kept). A check of a server the
app has since left is dropped.
*/
export const applyInstanceCheck = (
  origin: string,
  result: Result<Instance, InstanceError>,
): void => {
  if (serverStore.getState().origin !== origin) {
    return;
  }
  if (result.ok) {
    serverStore.setState({
      configurationError: null,
      instance: result.value,
      reason: null,
      status: "ok",
    });
    return;
  }
  if (typeof result.error === "object") {
    serverStore.setState({
      configurationError: { reason: result.error.reason },
      reason: null,
      status: "unknown",
    });
    return;
  }
  switch (result.error) {
    case "unreachable": {
      return;
    }
    case "client-outdated": {
      mismatch(origin, "client-outdated");
      return;
    }
    case "not-pace":
    case "server-outdated": {
      mismatch(origin, "server-outdated");
      return;
    }
  }
};

/** Any call the server refused as too old an app (426 `client/outdated`). */
export const markClientOutdated = (origin: string): void => {
  mismatch(origin, "client-outdated");
};

/** Where the current server's pieces live, as the screens show and use them. */
export type ServerInfo = {
  /** The API as this device reaches it (the desktop agent's `--api`: bearer tokens, any address). */
  readonly apiOrigin: string;
  /**
  The MCP URL to hand an AI app: the server's own public API (`instance.apiOrigin`), since its
  OAuth resource is `<API_ORIGIN>/mcp` and an MCP client refuses tokens for any other; the address
  in use until the server has answered.
  */
  /** `null` when the server says it has no MCP (no https origin, re-review N4). */
  readonly mcpUrl: null | string;
  /** The server names another public address than the one this device uses (Connect says so). */
  readonly isPublicOriginOther: boolean;
  /** The Telegram bot of the web login widget. */
  readonly botUsername: string;
  /** The web app (the desktop agent is downloaded from it); the build's while unknown. */
  readonly webOrigin: string;
  /**
  The web app the browser login may run on: only the current server's own, since the token it
  hands back is sent to this server. Null when that is not known (another server that has not
  answered yet, or one without a web app).
  */
  readonly loginWebOrigin: null | string;
};

/**
MCP at the server's public API, its OAuth resource; `null` when the server says it has none (no
https origin, re-review N4). Before it answers, at the address in use.
*/
const mcpUrlOf = (instance: ServerState["instance"], origin: string): null | string => {
  if (instance === null) {
    return `${origin}/mcp`;
  }
  return instance.features.mcp ? `${instance.apiOrigin}/mcp` : null;
};

/** The current server's values from its instance; the build's defaults while it has not answered. */
export const serverInfoOf = ({ instance, origin }: ServerState): ServerInfo => {
  const buildWeb = isBuildServer(origin) ? WEB_ORIGIN : null;
  const ownWeb = instance === null ? buildWeb : instance.webOrigin;
  return {
    // The origin this app reaches the server at, not the one the server says it has: a Worker
    // started with another port or host than its `API_ORIGIN` names a dead address (QA round 18
    // L10), and the one in use is known to answer. Not for MCP: its OAuth resource is bound to
    // `API_ORIGIN` (`mcpUrl`, round 7 review 1).
    apiOrigin: origin,
    isPublicOriginOther: instance !== null && instance.apiOrigin !== origin,
    mcpUrl: mcpUrlOf(instance, origin),
    botUsername: instance?.botUsername ?? TELEGRAM_BOT,
    loginWebOrigin: ownWeb,
    webOrigin: ownWeb ?? WEB_ORIGIN,
  };
};

export const useServerInfo = (): ServerInfo => serverInfoOf(useStore(serverStore));
