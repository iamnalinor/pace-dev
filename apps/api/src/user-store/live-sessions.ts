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

/** The session a socket was opened by (from its tag); `undefined` for one with none. */
export const sessionOf = (ctx: DurableObjectState, socket: WebSocket): string | undefined =>
  ctx
    .getTags(socket)
    .find((tag) => tag.startsWith(SESSION_TAG))
    ?.slice(SESSION_TAG.length);

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

/** Where the store keeps a session that ended, until it would have expired (`endLiveSessions`). */
const ENDED_PREFIX = "ended-session:";

/**
Whether a session has ended here: an upgrade the Worker checked before a revoke can reach the store
after the revoke's `endLiveSessions`, and must not be accepted then (the store serializes both).
*/
export const isEndedSession = async (
  ctx: DurableObjectState,
  sessionId: string,
): Promise<boolean> => (await ctx.storage.get<number>(`${ENDED_PREFIX}${sessionId}`)) !== undefined;

/** Drops the ended sessions that have expired by `now`: no upgrade can name them any more. */
const pruneEnded = async (ctx: DurableObjectState, now: number): Promise<void> => {
  const ended = await ctx.storage.list<number>({ prefix: ENDED_PREFIX });
  const expired = [...ended].filter(([, until]) => until <= now).map(([key]) => key);
  if (expired.length > 0) {
    await ctx.storage.delete(expired);
  }
};

/**
Closes the live sockets of a session that ended (revoked in Settings, logged out, "Not me"), or of
every session when none is named (the account is gone), with `LIVE_SESSION_ENDED`. A named session
with its expiry (`until`) is also kept as ended until then, so an upgrade racing the revoke is
refused (`isEndedSession`); that bounds the record by the session's own life.
*/
export const endLiveSessions = async (
  ctx: DurableObjectState,
  sessionId?: string,
  until?: number,
): Promise<void> => {
  if (sessionId !== undefined && until !== undefined) {
    const now = Date.now();
    await pruneEnded(ctx, now);
    if (until > now) {
      await ctx.storage.put(`${ENDED_PREFIX}${sessionId}`, until);
    }
  }
  const sockets = ctx.getWebSockets(
    sessionId === undefined ? undefined : `${SESSION_TAG}${sessionId}`,
  );
  for (const socket of sockets) {
    endSocket(socket);
  }
};
