import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import type { PollEntry } from "../shared/push/poll-transport.ts";

import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/** One push attempt of a notification to a device, as the delivery log keeps it. */
export type DeliveryAttempt = {
  readonly sessionId: string;
  readonly device: string;
  readonly method: string;
  readonly endpoint: string;
  readonly result: "failed" | "queued" | "sent";
  readonly reason: null | string;
};

/** A delivery as the feed shows it: which device, how, when, and whether it was taken back. */
export type DeliveryEntry = {
  readonly device: string;
  readonly method: string;
  readonly at: string;
  readonly result: "dismissed" | "failed" | "queued" | "sent";
  readonly reason: null | string;
};

const { notificationDeliveries } = schema;

/** Whether the device already got this notification (a retried alarm sends nothing twice). */
export const wasDelivered = async (
  db: Db,
  notificationId: string,
  sessionId: string,
): Promise<boolean> => {
  const found = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.notificationId, notificationId),
        eq(notificationDeliveries.sessionId, sessionId),
        inArray(notificationDeliveries.result, ["queued", "sent"]),
      ),
    );
  return found.length > 0;
};

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

/** The copies of a notification still on devices, each marked taken back once. */
export const takeBackDeliveries = async (
  db: Db,
  notificationId: string,
  now: string,
): Promise<readonly Pick<DeliveryAttempt, "endpoint" | "method" | "sessionId">[]> =>
  await db
    .update(notificationDeliveries)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(notificationDeliveries.notificationId, notificationId),
        inArray(notificationDeliveries.result, ["queued", "sent"]),
        isNull(notificationDeliveries.dismissedAt),
      ),
    )
    .returning({
      endpoint: notificationDeliveries.endpoint,
      method: notificationDeliveries.method,
      sessionId: notificationDeliveries.sessionId,
    });

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
          at: row.dismissedAt ?? row.attemptedAt,
          device: row.device,
          method: row.method,
          reason: row.reason,
          result:
            row.dismissedAt === null ? (row.result as DeliveryAttempt["result"]) : "dismissed",
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
