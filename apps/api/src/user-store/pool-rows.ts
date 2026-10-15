import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";

import {
  err,
  newId,
  type NewNotification,
  NotificationSchema,
  ok,
  PAYLOAD_SCHEMAS,
  type PoolNotification,
  refOf,
  type Resolution,
  type Result,
} from "@pace/core";

import type { NotifyError } from "../shared/contract.ts";

import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;
type Row = typeof schema.notifications.$inferSelect;

/** Telegram's copy of a notification: where it went, if anywhere. */
export type TelegramCopy = {
  readonly state: "failed" | "kept" | "pending" | "sent" | "skipped" | "undismissable";
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

const bySubject = async (
  db: Db,
  created: NewNotification,
): Promise<StoredNotification | undefined> => {
  const ref = refOf(created);
  const subject = and(eq(notifications.kind, created.kind), eq(notifications.ref, ref));
  const found = await db.select().from(notifications).where(subject);
  return found.flatMap((row) => toStored(row))[0];
};

/**
Adds a notification to the pool, its Telegram copy still to be sent. One about the same subject
(its kind and `refOf`) is returned as it stands instead: a pass repeated after being cut short
adds nothing twice. A payload its kind's schema refuses is not stored (it could never be read
back).
*/
export const insertNotification = async (
  db: Db,
  created: NewNotification,
  now: string,
): Promise<Result<StoredNotification, NotifyError>> => {
  if (!PAYLOAD_SCHEMAS[created.kind].safeParse(created.payload).success) {
    return err({ code: "notification/invalid" });
  }
  const existing = await bySubject(db, created);
  if (existing !== undefined) {
    return ok(existing);
  }
  await db.insert(notifications).values({
    createdAt: now,
    id: newId(),
    kind: created.kind,
    payload: JSON.stringify(created.payload),
    ref: refOf(created),
    telegramState: "pending",
  });
  const stored = await bySubject(db, created);
  return stored === undefined ? err({ code: "notification/invalid" }) : ok(stored);
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

/** A Telegram-origin answer leaves its edited message in chat on purpose. */
export const markTelegramKept = async (db: Db, id: string): Promise<void> => {
  await db.update(notifications).set({ telegramState: "kept" }).where(eq(notifications.id, id));
};

/** The provider permanently refused taking this copy back. */
export const markTelegramUndismissable = async (db: Db, id: string): Promise<void> => {
  await db
    .update(notifications)
    .set({ telegramState: "undismissable" })
    .where(eq(notifications.id, id));
};
