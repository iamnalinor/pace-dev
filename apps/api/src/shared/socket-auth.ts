import type { CurrentUser } from "./app-env.ts";

import { findSession } from "../auth/sessions.ts";
import { d1 } from "./db/d1.ts";

/** The subprotocol a live socket speaks; the server answers with it. */
export const LIVE_PROTOCOL = "pace.v1";

const AUTH_PREFIX = "pace.auth.";

/**
A browser cannot set headers on a WebSocket, so the bearer rides in the subprotocol list
(`pace.v1, pace.auth.<token>`): it is the token from the header that every request sends.
*/
export const tokenFromProtocols = (header: null | string): string | undefined =>
  header
    ?.split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith(AUTH_PREFIX))
    ?.slice(AUTH_PREFIX.length);

/** The signed-in person behind a socket's token; a device token (a computer's) is refused. */
export const socketUser = async (
  env: Cloudflare.Env,
  token: string | undefined,
): Promise<CurrentUser | null> => {
  if (token === undefined || token === "") {
    return null;
  }
  const access = await findSession(d1(env.DB), token, Date.now());
  // A computer's token (with a scope) may only upload its usage.
  return access?.scope === null ? access.user : null;
};
