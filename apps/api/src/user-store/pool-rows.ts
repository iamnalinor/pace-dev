import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";

import {
  newId,
  type NewNotification,
  NotificationSchema,
  type PoolNotification,
  refOf,
  type Resolution,
} from "@pace/core";

import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;
type Row = typeof schema.notifications.$inferSelect;

/** Telegram's copy of a notification: where it went, if anywhere. */
export type TelegramCopy = {
  readonly state: "failed" | "pending" | "sent" | "skipped";
  readonly chatId: null | string;
  readonly messageId: null | number;
};

/** A row of the pool with its Telegram copy. */
export type StoredNotification = {
  readonly notification: PoolNotification;
  readonly telegram: TelegramCopy;
};

const { notifications } = schema;

/** A row as the API shows it; a row whose payload no longer parses is left out. */
const toStored = (row: Row): StoredNotification[] => {
  const parsed = NotificationSchema.safeParse({
    createdAt: row.createdAt,
    id: row.id,
    kind: row.kind,
    payload: JSON.parse(row.payload) as unknown,
    readAt: row.readAt,
    resolution: row.resolution,
    resolvedAt: row.resolvedAt,
  });
  return parsed.success
    ? [
        {
          notification: parsed.data,
          telegram: {
            chatId: row.telegramChatId,
            messageId: row.telegramMessageId,
            state: row.telegramState as TelegramCopy["state"],
          },
        },
      ]
    : [];
};

/** Adds a notification to the pool, its Telegram copy still to be sent. */
export const insertNotification = async (
  db: Db,
  created: NewNotification,
  now: string,
): Promise<StoredNotification> => {
  const id = newId();
  await db.insert(notifications).values({
    createdAt: now,
    id,
    kind: created.kind,
    payload: JSON.stringify(created.payload),
    ref: refOf(created),
    telegramState: "pending",
  });
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
  const [stored] = row === undefined ? [] : toStored(row);
  if (stored === undefined) {
    throw new Error("a notification just written could not be read back");
  }
  return stored;
};

export const findNotification = async (
  db: Db,
  id: string,
): Promise<StoredNotification | undefined> => {
  const rows = await db.select().from(notifications).where(eq(notifications.id, id));
  return rows.flatMap((row) => toStored(row))[0];
};

/** The open (unresolved) notification about `ref`, if there is one. */
export const findOpenByRef = async (
  db: Db,
  kind: PoolNotification["kind"],
  ref: string,
): Promise<StoredNotification | undefined> => {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.kind, kind),
        eq(notifications.ref, ref),
        isNull(notifications.resolvedAt),
      ),
    );
  return rows.flatMap((row) => toStored(row))[0];
};

/** Every notification not resolved yet. */
export const openNotifications = async (db: Db): Promise<readonly StoredNotification[]> => {
  const rows = await db.select().from(notifications).where(isNull(notifications.resolvedAt));
  return rows.flatMap((row) => toStored(row));
};

/** A page of the pool, newest first; `before` is the id the previous page ended at. */
export const listNotifications = async (
  db: Db,
  { before, limit }: { readonly before?: string | undefined; readonly limit: number },
): Promise<{ readonly items: readonly PoolNotification[]; readonly more: boolean }> => {
  const rows = await db
    .select()
    .from(notifications)
    .where(before === undefined ? undefined : lt(notifications.id, before))
    .orderBy(desc(notifications.id))
    .limit(limit + 1);
  return {
    items: rows
      .slice(0, limit)
      .flatMap((row) => toStored(row).map((stored) => stored.notification)),
    more: rows.length > limit,
  };
};

/** Marks notifications read (the ones named, or all); one already read keeps its time. */
export const markRead = async (
  db: Db,
  which: { readonly all: true } | { readonly ids: readonly string[] },
  now: string,
): Promise<void> => {
  const unread = isNull(notifications.readAt);
  await db
    .update(notifications)
    .set({ readAt: now })
    .where("all" in which ? unread : and(unread, inArray(notifications.id, [...which.ids])));
};

/** Settles a notification (read along with it); `false` when it was settled already. */
export const didResolve = async (
  db: Db,
  {
    id,
    now,
    resolution,
  }: { readonly id: string; readonly resolution: Resolution; readonly now: string },
): Promise<boolean> => {
  const done = await db
    .update(notifications)
    .set({ resolution, resolvedAt: now })
    .where(and(eq(notifications.id, id), isNull(notifications.resolvedAt)))
    .returning({ id: notifications.id });
  await markRead(db, { ids: [id] }, now);
  return done.length > 0;
};

/** Records what became of the Telegram copy. */
export const setTelegramCopy = async (
  db: Db,
  id: string,
  copy: TelegramCopy & { readonly sentAt: null | string },
): Promise<void> => {
  await db
    .update(notifications)
    .set({
      telegramChatId: copy.chatId,
      telegramMessageId: copy.messageId,
      telegramSentAt: copy.sentAt,
      telegramState: copy.state,
    })
    .where(eq(notifications.id, id));
};
