import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One row per person allowed in; `telegramId` is the identity, `id` is what everything else references. */
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  telegramId: text().notNull().unique(),
  name: text().notNull(),
  username: text(),
  photoUrl: text(),
  createdAt: integer({ mode: "timestamp_ms" }).notNull(),
});

/** Bearer sessions: the client holds the random token, the database only its SHA-256. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    label: text().notNull(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

/** Android login: the app mints a nonce, the bot binds it to a user, the app exchanges it once. */
export const loginNonces = sqliteTable("login_nonces", {
  nonce: text().primaryKey(),
  createdAt: integer({ mode: "timestamp_ms" }).notNull(),
  expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
  userId: text().references(() => users.id, { onDelete: "cascade" }),
  consumedAt: integer({ mode: "timestamp_ms" }),
});
