import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notLike,
  or,
  type SQL,
} from "drizzle-orm";

import type { PushSubscription } from "../shared/push-subscriptions.ts";
import type { PollEntry } from "../shared/push/poll-transport.ts";

import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/**
One attempt to deliver a notification, as the delivery log keeps it: a push to a device, or the
Telegram copy (`method` `telegram`, the chat as its endpoint).
*/
export type DeliveryAttempt = {
  readonly sessionId: string;
  readonly device: string;
  readonly method: string;
  readonly endpoint: string;
  readonly result: "failed" | "queued" | "sent";
  readonly reason: null | string;
};

/** A delivery as the feed shows it: which device, how, when, and when it was taken back. */
export type DeliveryEntry = {
  readonly device: string;
  readonly method: string;
  /** When it was sent (or queued, or failed). */
  readonly at: string;
  readonly result: DeliveryAttempt["result"];
  readonly reason: null | string;
  /** When it was taken back (resolved somewhere); `null` while it stands. */
  readonly dismissedAt: null | string;
};

const { notificationDeliveries } = schema;
const pendingDismissal = or(
  isNull(notificationDeliveries.reason),
  notLike(notificationDeliveries.reason, "dismissal-%"),
);

/** The reason logged for a device whose push method is not set up here, or found broken. */
const UNAVAILABLE = "unavailable";

/** Whether the log has an attempt for this notification and device that also matches `also`. */
const isLogged = async (
  db: Db,
  { notificationId, sessionId }: { readonly notificationId: string; readonly sessionId: string },
  also: readonly SQL[],
): Promise<boolean> => {
  const found = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.notificationId, notificationId),
        eq(notificationDeliveries.sessionId, sessionId),
        ...also,
      ),
    );
  return found.length > 0;
};

/** Whether the device already got this notification (a retried alarm sends nothing twice). */
export const wasDelivered = async (
  db: Db,
  notificationId: string,
  sessionId: string,
): Promise<boolean> =>
  await isLogged(db, { notificationId, sessionId }, [
    inArray(notificationDeliveries.result, ["queued", "sent"]),
  ]);

/** The latest attempt for one copy; a failed attempt may be retried after a short pause. */
export const latestAttempt = async (
  db: Db,
  notificationId: string,
  sessionId: string,
): Promise<typeof notificationDeliveries.$inferSelect | undefined> => {
  const attempts = await db
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.notificationId, notificationId),
        eq(notificationDeliveries.sessionId, sessionId),
      ),
    )
    .orderBy(desc(notificationDeliveries.id))
    .limit(1);
  return attempts[0];
};

/** Whether any copy's latest attempt failed transiently. */
export const hasFailedCopy = async (
  db: Db,
  notificationId: string,
  activeSessions: ReadonlySet<string>,
): Promise<boolean> => {
  const attempts = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.notificationId, notificationId))
    .orderBy(desc(notificationDeliveries.id));
  const seen = new Set<string>();
  for (const attempt of attempts) {
    if (seen.has(attempt.sessionId)) {
      continue;
    }
    seen.add(attempt.sessionId);
    if (
      activeSessions.has(attempt.sessionId) &&
      attempt.result === "failed" &&
      attempt.reason === "failed"
    ) {
      return true;
    }
  }
  return false;
};

/** Whether the device's attempt was logged already as unreachable by this method. */
const wasLoggedUnavailable = async (
  db: Db,
  notificationId: string,
  { method, sessionId }: { readonly sessionId: string; readonly method: string },
): Promise<boolean> =>
  await isLogged(db, { notificationId, sessionId }, [
    eq(notificationDeliveries.method, method),
    eq(notificationDeliveries.reason, UNAVAILABLE),
  ]);

export const logAttempt = async (
  db: Db,
  {
    attempt,
    notificationId,
    now,
  }: { readonly notificationId: string; readonly attempt: DeliveryAttempt; readonly now: string },
): Promise<void> => {
  await db.insert(notificationDeliveries).values({ ...attempt, attemptedAt: now, notificationId });
};

/**
A device whose method is not set up on this server, or found broken: nothing was sent, and the log
says it was unavailable, once per notification and method (a pass repeated meanwhile adds none).
*/
export const logUnavailable = async (
  db: Db,
  {
    notificationId,
    now,
    subscription,
  }: {
    readonly notificationId: string;
    readonly subscription: Omit<PushSubscription, "id">;
    readonly now: string;
  },
): Promise<void> => {
  const { device, endpoint, sessionId, transport: method } = subscription;
  if (await wasLoggedUnavailable(db, notificationId, { method, sessionId })) {
    return;
  }
  const attempt = {
    device,
    endpoint,
    method,
    reason: UNAVAILABLE,
    result: "failed" as const,
    sessionId,
  };
  await logAttempt(db, { attempt, notificationId, now });
};

/**
The copies of a notification still on devices, each marked taken back once. The Telegram copy is
marked only when it was deleted (`isTelegramGone`): one answered in Telegram stays there, edited.
*/
export const takeBackDeliveries = async (
  db: Db,
  notificationId: string,
  { isTelegramGone }: { readonly isTelegramGone: boolean },
): Promise<
  readonly (Pick<DeliveryAttempt, "endpoint" | "method" | "sessionId"> & { readonly id: number })[]
> =>
  await db
    .select({
      id: notificationDeliveries.id,
      endpoint: notificationDeliveries.endpoint,
      method: notificationDeliveries.method,
      sessionId: notificationDeliveries.sessionId,
    })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.notificationId, notificationId),
        inArray(notificationDeliveries.result, ["queued", "sent"]),
        isNull(notificationDeliveries.dismissedAt),
        pendingDismissal,
        isTelegramGone ? undefined : ne(notificationDeliveries.method, "telegram"),
      ),
    );

/** Commit the dismissal after the transport accepted it. */
export const markDismissed = async (db: Db, id: number, now: string): Promise<void> => {
  await db
    .update(notificationDeliveries)
    .set({ dismissedAt: now })
    .where(and(eq(notificationDeliveries.id, id), isNull(notificationDeliveries.dismissedAt)));
};

/** Resolved notifications with push copies still awaiting dismissal. */
export const pendingDismissalIds = async (db: Db): Promise<readonly string[]> => {
  const pushCopy = ne(notificationDeliveries.method, "telegram");
  const telegramCopy = eq(schema.notifications.telegramState, "sent");
  const rows = await db
    .select({ notificationId: notificationDeliveries.notificationId })
    .from(notificationDeliveries)
    .innerJoin(
      schema.notifications,
      eq(schema.notifications.id, notificationDeliveries.notificationId),
    )
    .where(
      and(
        inArray(notificationDeliveries.result, ["queued", "sent"]),
        isNull(notificationDeliveries.dismissedAt),
        pendingDismissal,
        or(pushCopy, telegramCopy),
        isNotNull(schema.notifications.resolvedAt),
      ),
    );
  return [...new Set(rows.map((row) => row.notificationId))];
};

/** The delivery log of some notifications, oldest attempt first. */
export const deliveriesOf = async (
  db: Db,
  notificationIds: readonly string[],
): Promise<ReadonlyMap<string, readonly DeliveryEntry[]>> => {
  const logged =
    notificationIds.length === 0
      ? []
      : await db
          .select()
          .from(notificationDeliveries)
          .where(inArray(notificationDeliveries.notificationId, [...notificationIds]))
          .orderBy(notificationDeliveries.id);
  return new Map(
    notificationIds.map((id) => [
      id,
      logged
        .filter((row) => row.notificationId === id)
        .map((row) => ({
          at: row.attemptedAt,
          device: row.device,
          dismissedAt: row.dismissedAt,
          method: row.method,
          reason: row.reason,
          result: row.result as DeliveryAttempt["result"],
        })),
    ]),
  );
};

const { pollOutbox } = schema;

/** Queues an entry for a polling device. */
export const enqueuePoll = async (
  db: Db,
  {
    entry,
    now,
    sessionId,
  }: { readonly sessionId: string; readonly entry: PollEntry; readonly now: string },
): Promise<void> => {
  await db.insert(pollOutbox).values({
    body: entry.type === "show" ? entry.body : null,
    createdAt: now,
    notificationId: entry.notificationId,
    sessionId,
    title: entry.type === "show" ? entry.title : null,
    type: entry.type,
  });
};

/**
A polling device's fetch: drops what it acknowledged (up to `after`), answers what is left, and
logs the notifications it now gets as delivered.
*/
export const takePoll = async (
  db: Db,
  sessionId: string,
  { after, now }: { readonly after: number; readonly now: string },
): Promise<{
  readonly entries: readonly (PollEntry & { readonly seq: number })[];
  readonly cursor: number;
}> => {
  await db
    .delete(pollOutbox)
    .where(and(eq(pollOutbox.sessionId, sessionId), lte(pollOutbox.seq, after)));
  const rows = await db
    .select()
    .from(pollOutbox)
    .where(eq(pollOutbox.sessionId, sessionId))
    .orderBy(pollOutbox.seq);
  const shown = rows.filter((row) => row.type === "show").map((row) => row.notificationId);
  if (shown.length > 0) {
    await db
      .update(notificationDeliveries)
      .set({ attemptedAt: now, result: "sent" })
      .where(
        and(
          eq(notificationDeliveries.sessionId, sessionId),
          eq(notificationDeliveries.result, "queued"),
          inArray(notificationDeliveries.notificationId, shown),
        ),
      );
  }
  return {
    cursor: rows.at(-1)?.seq ?? after,
    entries: rows.map((row) =>
      row.type === "show"
        ? {
            body: row.body ?? "",
            notificationId: row.notificationId,
            seq: row.seq,
            title: row.title ?? "",
            type: "show" as const,
          }
        : { notificationId: row.notificationId, seq: row.seq, type: "dismiss" as const },
    ),
  };
};
