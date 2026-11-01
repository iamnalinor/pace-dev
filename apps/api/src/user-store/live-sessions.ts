import { LIVE_SESSION_ENDED } from "@pace/core";

/*
A live socket lives no longer than the session that opened it. The Worker checks the bearer once,
at the upgrade; after that the socket carries the session's id and expiry in its tags (all a
hibernating socket keeps), so the store can close it when the session is revoked (`deleteSession`
calls `endLiveSessions`) and stops serving it once the session has expired.
*/

const SESSION_TAG = "session:";
const EXPIRES_TAG = "expires:";

/** The tags that tie a socket to its session. */
export const sessionTags = (sessionId: string, expiresAt: number): readonly string[] => [
  `${SESSION_TAG}${sessionId}`,
  `${EXPIRES_TAG}${String(expiresAt)}`,
];

/** The session and expiry a request names, as the Worker set them; `null` when either is missing. */
export const namedSession = (
  sessionId: null | string,
  expires: null | string,
): null | { readonly expiresAt: number; readonly sessionId: string } => {
  const expiresAt = Number(expires);
  return sessionId === null || sessionId === "" || expires === null || !Number.isFinite(expiresAt)
    ? null
    : { expiresAt, sessionId };
};

/** Closes a socket as one whose session ended; one already closing is left to finish. */
const endSocket = (socket: WebSocket): void => {
  try {
    socket.close(LIVE_SESSION_ENDED, "session ended");
  } catch {
    // Already closing or closed: nothing more to end.
  }
};

/** Whether a socket's session has expired by `now` (a socket with no expiry has none to pass). */
const isExpired = (ctx: DurableObjectState, socket: WebSocket, now: number): boolean => {
  const tag = ctx.getTags(socket).find((item) => item.startsWith(EXPIRES_TAG));
  return tag !== undefined && Number(tag.slice(EXPIRES_TAG.length)) <= now;
};

/**
Whether a socket may still be served at `now`. One whose session expired is closed with
`LIVE_SESSION_ENDED` instead, so its app checks its session rather than reconnecting.
*/
export const isServed = (ctx: DurableObjectState, socket: WebSocket, now = Date.now()): boolean => {
  if (isExpired(ctx, socket, now)) {
    endSocket(socket);
    return false;
  }
  return true;
};

/** The sockets (with `tag`, or all) that may still be served; expired ones are closed on the way. */
export const servedSockets = (ctx: DurableObjectState, tag?: string): readonly WebSocket[] => {
  const now = Date.now();
  return ctx.getWebSockets(tag).filter((socket) => isServed(ctx, socket, now));
};

/**
Closes the live sockets of a session that ended (revoked in Settings, logged out, "Not me"), or of
every session when none is named (the account is gone), with `LIVE_SESSION_ENDED`.
*/
export const endLiveSessions = (ctx: DurableObjectState, sessionId?: string): void => {
  const sockets = ctx.getWebSockets(
    sessionId === undefined ? undefined : `${SESSION_TAG}${sessionId}`,
  );
  for (const socket of sockets) {
    endSocket(socket);
  }
};
