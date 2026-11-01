import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { InstanceError } from "@pace/client";
import type { Instance, Result } from "@pace/core";

import { API_BASE_URL, TELEGRAM_BOT, WEB_ORIGIN } from "./api-base.ts";

/** Which side needs an update when the app and its server do not fit. */
export type MismatchReason = "client-outdated" | "server-outdated";

export type ServerState = {
  /** The server this app talks to (`readServer`), set before the runtime is built for it. */
  readonly origin: string;
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
  instance: null,
  origin: API_BASE_URL,
  reason: null,
  status: "unknown",
}));

const mismatch = (origin: string, reason: MismatchReason): void => {
  if (serverStore.getState().origin === origin) {
    serverStore.setState({ reason, status: "incompatible" });
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
    serverStore.setState({ instance: result.value, reason: null, status: "ok" });
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
  /** The API (the desktop agent's `--api`). */
  readonly apiOrigin: string;
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

/** The current server's values from its instance; the build's defaults while it has not answered. */
export const serverInfoOf = ({ instance, origin }: ServerState): ServerInfo => {
  const buildWeb = isBuildServer(origin) ? WEB_ORIGIN : null;
  const ownWeb = instance === null ? buildWeb : instance.webOrigin;
  return {
    apiOrigin: instance?.apiOrigin ?? origin,
    botUsername: instance?.botUsername ?? TELEGRAM_BOT,
    loginWebOrigin: ownWeb,
    webOrigin: ownWeb ?? WEB_ORIGIN,
  };
};

export const useServerInfo = (): ServerInfo => serverInfoOf(useStore(serverStore));
