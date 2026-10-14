import { and, eq, gt, sql } from "drizzle-orm";
import { ulid } from "ulidx";

import { pushSubscriptions, sessions } from "./db/d1-schema.ts";
import { d1 } from "./db/d1.ts";

/** A device's way to be pushed to: its session, the transport and where that transport sends. */
export type PushSubscription = {
  readonly id: string;
  readonly sessionId: string;
  /** The device as its session is named. */
  readonly device: string;
  readonly transport: string;
  readonly endpoint: string;
};

/** The subscriptions of a user's live sessions (expired sessions push nowhere). */
export const subscriptionsOf = async (
  binding: D1Database,
  userId: string,
  now: number,
): Promise<readonly PushSubscription[]> => {
  const liveSession = gt(sessions.expiresAt, new Date(now));
  return await d1(binding)
    .select({
      device: sessions.label,
      endpoint: pushSubscriptions.endpoint,
      id: pushSubscriptions.id,
      sessionId: pushSubscriptions.sessionId,
      transport: pushSubscriptions.transport,
    })
    .from(pushSubscriptions)
    .innerJoin(sessions, eq(sessions.id, pushSubscriptions.sessionId))
    .where(and(eq(pushSubscriptions.userId, userId), liveSession));
};

/**
Registers how a session's device is pushed to (its one method), in one batch: two registrations
at once leave one (the session is unique). An endpoint known under another session moves here,
whoever's it was: the phone signed in again, or signed in to another account, and a phone shows
the notifications of the account it is signed in to only. One device is never pushed to twice.
*/
export const subscribe = async (
  binding: D1Database,
  input: {
    readonly sessionId: string;
    readonly userId: string;
    readonly transport: string;
    readonly endpoint: string;
    readonly now: number;
  },
): Promise<void> => {
  const db = d1(binding);
  const sameEndpoint = and(
    eq(pushSubscriptions.transport, input.transport),
    eq(pushSubscriptions.endpoint, input.endpoint),
  );
  const sameSession = eq(pushSubscriptions.sessionId, input.sessionId);
  await db.batch([
    db.delete(pushSubscriptions).where(sameEndpoint),
    db.delete(pushSubscriptions).where(sameSession),
    db.insert(pushSubscriptions).values({
      createdAt: new Date(input.now),
      endpoint: input.endpoint,
      id: ulid(input.now),
      sessionId: input.sessionId,
      transport: input.transport,
      userId: input.userId,
    }),
  ]);
};

/** Stops pushing to a session's device (it gets the live socket only, while open). */
export const unsubscribe = async (binding: D1Database, sessionId: string): Promise<void> => {
  await d1(binding).delete(pushSubscriptions).where(eq(pushSubscriptions.sessionId, sessionId));
};

/** Forgets a subscription its transport called gone for good (an uninstalled app, a dead token). */
export const dropSubscription = async (binding: D1Database, id: string): Promise<void> => {
  await d1(binding).delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
};

/** Notes a send through a subscription: the last time it worked, or one more failure. */
export const noteSend = async (
  binding: D1Database,
  id: string,
  { isOk, now }: { readonly isOk: boolean; readonly now: number },
): Promise<void> => {
  await d1(binding)
    .update(pushSubscriptions)
    .set(
      isOk
        ? { failures: 0, lastOkAt: new Date(now) }
        : { failures: sql`${pushSubscriptions.failures} + 1` },
    )
    .where(eq(pushSubscriptions.id, id));
};
