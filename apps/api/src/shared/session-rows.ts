import { and, eq } from "drizzle-orm";

import type { Db } from "./db/d1.ts";

import { sessions } from "./db/d1-schema.ts";

/** The person's store, as a revoke needs it: its RPC stub, or the store itself. */
export type LiveSessions = {
  readonly endLiveSessions: (sessionId: string) => Promise<void> | void;
};

/**
Ends one of the person's sessions by its id: its token stops working at once, its push
subscription goes with it (cascade) and its live sockets are closed (the bearer is checked only
when a socket opens, so a socket must not outlive its session). The one revoke Settings, logging
out, "Not me" and the agents share; true when a row went, false when there was none (already
ended, or not theirs). The sockets are closed either way: none of another person's is in `live`.
*/
// eslint-disable-next-line unicorn/consistent-boolean-name -- an action that reports whether a row went, not a predicate; Tasks 4-5 call it by this name
export const deleteSession = async (
  db: Db,
  { sessionId, userId }: { readonly sessionId: string; readonly userId: string },
  live: LiveSessions,
): Promise<boolean> => {
  const removed = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  await live.endLiveSessions(sessionId);
  return removed.length > 0;
};
