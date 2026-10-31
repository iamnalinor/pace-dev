import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** One row per person allowed in; `telegramId` is the identity, `id` is what everything else references. */
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  telegramId: text().notNull().unique(),
  name: text().notNull(),
  firstName: text(),
  username: text(),
  photoUrl: text(),
  createdAt: integer({ mode: "timestamp_ms" }).notNull(),
});

/** A small cached Telegram profile photo; the public route never exposes the bot token. */
export const userAvatars = sqliteTable("user_avatars", {
  userId: text()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mime: text().notNull(),
  data: text().notNull(),
});

/** Opaque Telegram confirmation capabilities survive account deletion for terminal polling. */
export const accountConfirmations = sqliteTable(
  "account_confirmations",
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    telegramId: text().notNull(),
    action: text({ enum: ["wipe", "delete"] }).notNull(),
    status: text({
      enum: ["pending", "processing", "confirmed", "cancelled", "expired", "replaced"],
    }).notNull(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    sessionId: text().notNull(),
    messageId: integer(),
  },
  (table) => [index("account_confirmations_user_idx").on(table.userId, table.action, table.status)],
);

/** Bearer sessions: the client holds the random token, the database only its SHA-256. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    /** What opened it (`SessionKind`): `browser`, `app`, `agent` or `dev`. */
    kind: text().notNull().default("browser"),
    /** How the person tells it apart: "Chrome on macOS", the phone's model, a computer's name. */
    name: text().notNull().default(""),
    /** A device token's one permission (`usage:write`); `null` for a full sign-in. */
    scope: text(),
    /** Where it signed in from (`RequestPlace`), each part unknown when not told. */
    userAgent: text(),
    ip: text(),
    country: text(),
    city: text(),
    /** The device whose usage it sends (a phone's install id); an agent files under the session id. */
    deviceId: text(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

/**
A push method the server found broken on its own side (its credentials rejected), keyed by the
credentials' fingerprint: new credentials are tried afresh. Global, not per user.
*/
export const brokenPushMethods = sqliteTable("broken_push_methods", {
  method: text().primaryKey(),
  /** Which credentials failed (the account and its key's id). */
  fingerprint: text().notNull(),
  brokenAt: integer({ mode: "timestamp_ms" }).notNull(),
  reason: text().notNull(),
});

/**
FCM tokens a send was refused for as another Firebase project's (`SENDER_ID_MISMATCH`): the app
was built with one project's config, the server sends with another's. Such a token is not taken
for FCM again while the server sends with that project (its device polls); global, not per user.
*/
export const fcmRefusedTokens = sqliteTable("fcm_refused_tokens", {
  token: text().primaryKey(),
  /** The project the server sent with when it was refused. */
  projectId: text().notNull(),
  refusedAt: integer({ mode: "timestamp_ms" }).notNull(),
});

/**
How a signed-in device gets system notifications: its one push method (an FCM token, or its
polling); without a row it has none. Tied to the session, so signing out
or deleting the account drops it; the same endpoint belongs to one session at a time.
*/
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text().primaryKey(),
    sessionId: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `fcm` or `poll`: the transport module that sends to it. */
    transport: text().notNull(),
    /** The FCM registration token; the session id for polling. */
    endpoint: text().notNull(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    lastOkAt: integer({ mode: "timestamp_ms" }),
    /** Failed sends since the last one that went through. */
    failures: integer().notNull().default(0),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(table.transport, table.endpoint),
    // One way to push per device: a session has at most one subscription.
    uniqueIndex("push_subscriptions_session_idx").on(table.sessionId),
    index("push_subscriptions_user_idx").on(table.userId),
  ],
);

/** Android login: the app mints a nonce, the bot binds it to a user, the app exchanges it once. */
export const loginNonces = sqliteTable("login_nonces", {
  nonce: text().primaryKey(),
  createdAt: integer({ mode: "timestamp_ms" }).notNull(),
  expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
  userId: text().references(() => users.id, { onDelete: "cascade" }),
  consumedAt: integer({ mode: "timestamp_ms" }),
  /** Where the login started (`app` or `web`), so the session it opens gets its kind. */
  from: text(),
  /** Where the nonce was asked for: the session it opens is placed there, not where it polled. */
  ip: text(),
  country: text(),
  city: text(),
  userAgent: text(),
  /** The phone the app named when it asked (its model and install id); none from the web. */
  deviceName: text(),
  deviceId: text(),
  /** The session the nonce opened, once the app's poll consumed it. */
  sessionId: text(),
  /** The bot's reply to `/start` for this login, so the login notice can edit it into place. */
  replyChatId: text(),
  replyMessageId: integer(),
});
