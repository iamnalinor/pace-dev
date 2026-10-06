import { and, eq, gt } from "drizzle-orm";
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
  /** Where the session was created: "web", "android", "dev" — shown in a future sessions list. */
  readonly label: string;
  readonly now: number;
};

/** Mints a bearer token (32 random bytes); only its SHA-256 is stored. */
export const createSession = async (
  db: Db,
  input: NewSession,
): Promise<{ readonly token: string; readonly expiresAt: number }> => {
  const token = randomBase64Url(32);
  const expiresAt = input.now + SESSION_DAYS * DAY_MS;
  await db.insert(sessions).values({
    id: ulid(input.now),
    userId: input.userId,
    tokenHash: await sha256Hex(token),
    label: input.label,
    createdAt: new Date(input.now),
    expiresAt: new Date(expiresAt),
    lastSeenAt: new Date(input.now),
  });
  return { token, expiresAt };
};

/** Resolves a bearer token to its user (null when unknown or expired); records activity hourly. */
export const findSession = async (db: Db, token: string, now: number): Promise<null | User> => {
  const tokenHash = await sha256Hex(token);
  const notExpired = gt(sessions.expiresAt, new Date(now));
  const [row] = await db
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
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
  if (row === undefined) {
    return null;
  }
  if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(sessions.id, row.sessionId));
  }
  return row.user;
};

export const revokeSession = async (db: Db, token: string): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)));
};
