import { and, eq } from "drizzle-orm";

import type { Db } from "./db/d1.ts";

import { sessions } from "./db/d1-schema.ts";

/**
Ends one of the person's sessions by its id: its token stops working at once and its push
subscription goes with it (cascade). The one revoke Settings, "Not me" and the agents share;
true when a row went, false when there was none (already ended, or not theirs).
*/
// eslint-disable-next-line unicorn/consistent-boolean-name -- an action that reports whether a row went, not a predicate; Tasks 4-5 call it by this name
export const deleteSession = async (
  db: Db,
  userId: string,
  sessionId: string,
): Promise<boolean> => {
  const removed = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  return removed.length > 0;
};
