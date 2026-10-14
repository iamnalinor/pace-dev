import { and, eq, gt, sql } from "drizzle-orm";
import { ulid } from "ulidx";

import { fcmRefusedTokens, pushSubscriptions, sessions } from "./db/d1-schema.ts";
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

/**
Notes an FCM token refused as another Firebase project's (the server sends with `projectId`): it
is not taken for FCM again while the server sends with that project.
*/
const refuseFcmToken = async (
  binding: D1Database,
  {
    now,
    projectId,
    token,
  }: { readonly token: string; readonly projectId: string; readonly now: number },
): Promise<void> => {
  const row = { projectId, refusedAt: new Date(now), token };
  await d1(binding)
    .insert(fcmRefusedTokens)
    .values(row)
    .onConflictDoUpdate({ set: row, target: fcmRefusedTokens.token });
};

/**
A device whose FCM token is another Firebase project's than the one the server sends with: its
token is noted as refused (not taken for FCM again) and it polls from now on. Its new subscription.
*/
export const moveToPolling = async (
  binding: D1Database,
  {
    now,
    projectId,
    subscription,
    userId,
  }: {
    readonly subscription: PushSubscription;
    readonly projectId: string;
    readonly userId: string;
    readonly now: number;
  },
): Promise<PushSubscription> => {
  const { endpoint: token, sessionId } = subscription;
  await refuseFcmToken(binding, { now, projectId, token });
  await subscribe(binding, { endpoint: sessionId, now, sessionId, transport: "poll", userId });
  return { ...subscription, endpoint: sessionId, transport: "poll" };
};

/** Whether FCM refused this token as another project's while the server sent with `projectId`. */
export const isFcmTokenRefused = async (
  binding: D1Database,
  { projectId, token }: { readonly token: string; readonly projectId: string },
): Promise<boolean> => {
  const found = await d1(binding)
    .select({ token: fcmRefusedTokens.token })
    .from(fcmRefusedTokens)
    .where(and(eq(fcmRefusedTokens.token, token), eq(fcmRefusedTokens.projectId, projectId)));
  return found.length > 0;
};
