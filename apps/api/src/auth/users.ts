import { eq } from "drizzle-orm";
import { ulid } from "ulidx";

import type { Db } from "../shared/db/d1.ts";

import { users } from "../shared/db/d1-schema.ts";

export type User = {
  readonly id: string;
  readonly telegramId: string;
  readonly name: string;
  readonly username: null | string;
  readonly photoUrl: null | string;
};

export type TelegramProfile = {
  readonly telegramId: string;
  readonly name: string;
  readonly username: null | string;
  /** `undefined` when the login source has no photo (bot), which keeps the stored one. */
  readonly photoUrl: null | string | undefined;
};

const toUser = (row: typeof users.$inferSelect): User => ({
  id: row.id,
  telegramId: row.telegramId,
  name: row.name,
  username: row.username,
  photoUrl: row.photoUrl,
});

/** Creates the user on first login, refreshes name/username/photo afterwards; the id never changes. */
export const upsertTelegramUser = async (
  db: Db,
  profile: TelegramProfile,
  now: number,
): Promise<User> => {
  const photo = profile.photoUrl === undefined ? {} : { photoUrl: profile.photoUrl };
  const [row] = await db
    .insert(users)
    .values({
      id: ulid(now),
      telegramId: profile.telegramId,
      name: profile.name,
      username: profile.username,
      photoUrl: profile.photoUrl ?? null,
      createdAt: new Date(now),
    })
    .onConflictDoUpdate({
      set: { name: profile.name, username: profile.username, ...photo },
      target: users.telegramId,
    })
    .returning();
  if (row === undefined) {
    throw new Error("upsert returned no row");
  }
  return toUser(row);
};

export const findUserById = async (db: Db, id: string): Promise<null | User> => {
  const row = await db.query.users.findFirst({ where: eq(users.id, id) });
  return row === undefined ? null : toUser(row);
};
