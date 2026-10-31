import { and, desc, eq, gt } from "drizzle-orm";
import { ulid } from "ulidx";

import type { Db } from "../shared/db/d1.ts";
import type { User } from "./users.ts";

import { randomBase64Url, sha256Hex } from "../shared/crypto.ts";
import { sessions, users } from "../shared/db/d1-schema.ts";
import { type RequestPlace, UNKNOWN_PLACE } from "../shared/request-place.ts";

const SESSION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** What opened a session: a browser, the phone app, a computer's agent, or a dev login. */
export type SessionKind = "agent" | "app" | "browser" | "dev";

export type NewSession = {
  readonly userId: string;
  readonly kind: SessionKind;
  /** How the person tells it apart: "Chrome on macOS", the phone's model, a computer's name. */
  readonly name: string;
  readonly now: number;
  /** Where it signed in from; unknown parts stay null. */
  readonly place?: RequestPlace | undefined;
  /** The device whose usage it sends (a phone's install id); an agent files under the session id. */
  readonly deviceId?: null | string | undefined;
  /** A device token's one permission; a sign-in has none (it may do everything). */
  readonly scope?: SessionScope | undefined;
  /** How long it lasts; a sign-in's 90 days by default. */
  readonly days?: number | undefined;
};

/** What a device token may do: upload its usage. */
export type SessionScope = "usage:write";

/**
A device sending with its own token: its id (the phone's install id, or the session's for an
agent) and its name.
*/
export type DeviceIdentity = { readonly id: string; readonly name: string };

/**
A bearer session resolved: whose it is and, for a device token, its one permission and the
device it belongs to (whatever it sends is filed under that device).
*/
export type SessionAccess = {
  /** The session the bearer opened (its row in D1). */
  readonly sessionId: string;
  readonly user: User;
  readonly scope: null | SessionScope;
  readonly device: DeviceIdentity | null;
};

const isScope = (value: null | string): value is SessionScope => value === "usage:write";

/**
The device a session's usage is filed under: the one it was opened for (a phone's install id),
else an agent's own session id; a full sign-in without a device sends under whatever device its
request names, so none is known here.
*/
const usageDeviceOf = (row: {
  readonly sessionId: string;
  readonly scope: null | string;
  readonly deviceId: null | string;
}): null | string => row.deviceId ?? (isScope(row.scope) ? row.sessionId : null);

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
    kind: input.kind,
    name: input.name,
    scope: input.scope ?? null,
    ...(input.place ?? UNKNOWN_PLACE),
    deviceId: input.deviceId ?? null,
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
      name: sessions.name,
      deviceId: sessions.deviceId,
      user: {
        id: users.id,
        telegramId: users.telegramId,
        name: users.name,
        firstName: users.firstName,
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
  const scope = isScope(row.scope) ? row.scope : null;
  return {
    device: scope === null ? null : { id: usageDeviceOf(row) ?? row.sessionId, name: row.name },
    scope,
    sessionId: row.sessionId,
    user: row.user,
  };
};

/** One of the person's sessions as Settings lists it. */
export type ListedSession = {
  readonly id: string;
  readonly kind: SessionKind;
  readonly name: string;
  readonly ip: null | string;
  readonly country: null | string;
  readonly city: null | string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  /** The device its usage is filed under; null when it sends none. */
  readonly usageDevice: null | string;
};

const SESSION_KINDS: ReadonlySet<string> = new Set<SessionKind>(["agent", "app", "browser", "dev"]);

const isSessionKind = (value: string): value is SessionKind => SESSION_KINDS.has(value);

/** A stored kind; a row from before kinds were stored (or a newer one) reads as a browser. */
const kindOf = (value: string): SessionKind => (isSessionKind(value) ? value : "browser");

/** The person's live sessions, the most recently seen first. */
export const listSessions = async (
  db: Db,
  userId: string,
  now: number,
): Promise<readonly ListedSession[]> => {
  const notExpired = gt(sessions.expiresAt, new Date(now));
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), notExpired))
    .orderBy(desc(sessions.lastSeenAt));
  return rows.map((row) => ({
    city: row.city,
    country: row.country,
    createdAt: row.createdAt.getTime(),
    id: row.id,
    ip: row.ip,
    kind: kindOf(row.kind),
    lastSeenAt: row.lastSeenAt.getTime(),
    name: row.name,
    usageDevice: usageDeviceOf({ ...row, sessionId: row.id }),
  }));
};

export const revokeSession = async (db: Db, token: string): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)));
};
