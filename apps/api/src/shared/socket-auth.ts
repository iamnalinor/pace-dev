import { LIVE_V1, LIVE_V2 } from "@pace/core";

import { findSession, type SessionAccess } from "../auth/sessions.ts";
import { d1 } from "./db/d1.ts";

const AUTH_PREFIX = "pace.auth.";

/**
The session a live socket was opened with and when it expires (epoch ms), as the Worker hands
them to the user's store. Set by the live route over whatever the app sent, so they are the
Worker's word, never the app's: the store tags the socket with them and ends it with its session.
*/
export const LIVE_SESSION_HEADER = "X-Pace-Live-Session";
export const LIVE_EXPIRES_HEADER = "X-Pace-Live-Expires";

const protocolsOf = (header: null | string): readonly string[] =>
  header?.split(",").map((part) => part.trim()) ?? [];

/**
A browser cannot set headers on a WebSocket, so the bearer rides in the subprotocol list
(`pace.v2, pace.v1, pace.auth.<token>`): it is the token from the header that every request sends.
*/
export const tokenFromProtocols = (header: null | string): string | undefined =>
  protocolsOf(header)
    .find((part) => part.startsWith(AUTH_PREFIX))
    ?.slice(AUTH_PREFIX.length);

/**
The subprotocol a live socket speaks: `pace.v2` when the app offers it, `pace.v1` otherwise (what
every socket spoke before v2, whatever it offered), so an older app is served as it always was.
*/
export const liveProtocolOf = (header: null | string): typeof LIVE_V1 | typeof LIVE_V2 =>
  protocolsOf(header).includes(LIVE_V2) ? LIVE_V2 : LIVE_V1;

/** The signed-in session behind a socket's token; a device token (a computer's) is refused. */
export const socketSession = async (
  env: Cloudflare.Env,
  token: string | undefined,
): Promise<null | Pick<SessionAccess, "expiresAt" | "sessionId" | "user">> => {
  if (token === undefined || token === "") {
    return null;
  }
  const access = await findSession(d1(env.DB), token, Date.now());
  // A computer's token (with a scope) may only upload its usage.
  return access?.scope === null ? access : null;
};
