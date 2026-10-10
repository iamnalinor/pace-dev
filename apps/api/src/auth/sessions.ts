import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { ulid } from "ulidx";

import type { Db } from "../shared/db/d1.ts";
import type { User } from "./users.ts";

import { randomBase64Url, sha256Hex } from "../shared/crypto.ts";
import { sessions, users } from "../shared/db/d1-schema.ts";

const SESSION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export type NewSession = {
  readonly userId: string;
  /** Where the session was created: "web", "android", "dev", or a device's name. */
  readonly label: string;
  readonly now: number;
  /** A device token's one permission; a sign-in has none (it may do everything). */
  readonly scope?: SessionScope | undefined;
  /** How long it lasts; a sign-in's 90 days by default. */
  readonly days?: number | undefined;
};

/** What a device token may do: upload its usage. */
export type SessionScope = "usage:write";

/** A bearer session resolved: whose it is and, for a device token, its one permission. */
export type SessionAccess = { readonly user: User; readonly scope: null | SessionScope };

const isScope = (value: null | string): value is SessionScope => value === "usage:write";

/** Mints a bearer token (32 random bytes); only its SHA-256 is stored. */
export const createSession = async (
  db: Db,
  input: NewSession,
): Promise<{ readonly id: string; readonly token: string; readonly expiresAt: number }> => {
  const token = randomBase64Url(32);
  const id = ulid(input.now);
  const expiresAt = input.now + (input.days ?? SESSION_DAYS) * DAY_MS;
  await db.insert(sessions).values({
    id,
    userId: input.userId,
    tokenHash: await sha256Hex(token),
    label: input.label,
    scope: input.scope ?? null,
    createdAt: new Date(input.now),
    expiresAt: new Date(expiresAt),
    lastSeenAt: new Date(input.now),
  });
  return { expiresAt, id, token };
};

/**
Resolves a bearer token to its user and scope (null when unknown or expired); records activity
hourly. An unknown scope reads as no access at all.
*/
export const findSession = async (
  db: Db,
  token: string,
  now: number,
): Promise<null | SessionAccess> => {
  const tokenHash = await sha256Hex(token);
  const notExpired = gt(sessions.expiresAt, new Date(now));
  const [row] = await db
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      scope: sessions.scope,
      user: {
        id: users.id,
        telegramId: users.telegramId,
        name: users.name,
        username: users.username,
        photoUrl: users.photoUrl,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), notExpired))
    .limit(1);
  if (row === undefined || (row.scope !== null && !isScope(row.scope))) {
    return null;
  }
  if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(sessions.id, row.sessionId));
  }
  return { scope: isScope(row.scope) ? row.scope : null, user: row.user };
};

/** A device connected with its own token: its name and when it was last heard from. */
export type DeviceSession = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
};

/** The person's device tokens, newest first. */
export const listDeviceSessions = async (
  db: Db,
  userId: string,
): Promise<readonly DeviceSession[]> => {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNotNull(sessions.scope)))
    .orderBy(desc(sessions.createdAt));
  return rows.map((row) => ({
    createdAt: row.createdAt.getTime(),
    id: row.id,
    lastSeenAt: row.lastSeenAt.getTime(),
    name: row.label,
  }));
};

/** Revokes one of the person's device tokens; how many went (0: no such device). */
export const revokeDeviceSession = async (
  db: Db,
  { id, userId }: { readonly userId: string; readonly id: string },
): Promise<number> => {
  const removed = await db
    .delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNotNull(sessions.scope)))
    .returning({ id: sessions.id });
  return removed.length;
};

export const revokeSession = async (db: Db, token: string): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)));
};
