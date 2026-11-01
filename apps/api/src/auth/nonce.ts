import type { BatchItem } from "drizzle-orm/batch";

import { and, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";

import { err, ok, type Result } from "@pace/core";

import type { Db } from "../shared/db/d1.ts";
import type { LoginFrom } from "../shared/login-link.ts";
import type { RequestPlace } from "../shared/request-place.ts";

import { randomBase64Url } from "../shared/crypto.ts";
import { loginNonces } from "../shared/db/d1-schema.ts";

const NONCE_TTL_MS = 5 * 60 * 1000;

/** Who asked for a nonce: where the login started, from where, and the phone the app named. */
export type NonceLogin = {
  readonly from: LoginFrom;
  readonly place: RequestPlace;
  readonly deviceName: null | string;
  readonly deviceId: null | string;
};

export type NewNonce = {
  readonly now: number;
  readonly from: LoginFrom;
  readonly place: RequestPlace;
  readonly deviceName?: string | undefined;
  readonly deviceId?: string | undefined;
};

/**
Step 1 of the app login: a short-lived nonce the bot will bind to whoever opens the deep link.
It keeps who asked for it, so the session it opens is named and placed by that request rather
than by the poll that collects it.
*/
export const createNonce = async (
  db: Db,
  input: NewNonce,
): Promise<{ readonly nonce: string; readonly expiresAt: number }> => {
  const nonce = randomBase64Url(24);
  const expiresAt = input.now + NONCE_TTL_MS;
  // Nonces are minted by anyone and nothing else removes them: each mint clears the expired ones.
  const expired = db.delete(loginNonces).where(lte(loginNonces.expiresAt, new Date(input.now)));
  const minted = db.insert(loginNonces).values({
    nonce,
    createdAt: new Date(input.now),
    expiresAt: new Date(expiresAt),
    from: input.from,
    ...input.place,
    deviceName: input.deviceName ?? null,
    deviceId: input.deviceId ?? null,
  });
  await db.batch([expired, minted]);
  return { nonce, expiresAt };
};

export type BindNonce = {
  readonly nonce: string;
  readonly userId: string;
  readonly now: number;
  /** The bot's reply to `/start`, which the login notice will edit into place. */
  readonly reply?: NonceReply | undefined;
};

/** A message of the bot's in a chat: its reply to a deep-link `/start`. */
export type NonceReply = { readonly chatId: string; readonly messageId: number };

type BindError = "nonce/already-bound" | "nonce/not-found";

/**
Whether a nonce could be bound now: it exists, has not expired and nobody bound it yet. The bot
asks before it replies, so it says "expired" without sending a reply it would take back; the
bind itself still decides (see `bindNonce`).
*/
export const peekNonce = async (
  db: Db,
  nonce: string,
  now: number,
): Promise<Result<undefined, BindError>> => {
  const notExpired = gt(loginNonces.expiresAt, new Date(now));
  const row = await db.query.loginNonces.findFirst({
    where: and(eq(loginNonces.nonce, nonce), notExpired),
  });
  if (row === undefined) {
    return err("nonce/not-found");
  }
  return row.userId === null ? ok(undefined) : err("nonce/already-bound");
};

/**
Step 2 (bot side): attaches the user who opened the link, and the bot's reply, in one write that
only an unbound, unexpired nonce takes, so a link opened twice at once binds once.
*/
export const bindNonce = async (
  db: Db,
  input: BindNonce,
): Promise<Result<undefined, BindError>> => {
  const notExpired = gt(loginNonces.expiresAt, new Date(input.now));
  const bound = await db
    .update(loginNonces)
    .set({
      replyChatId: input.reply?.chatId ?? null,
      replyMessageId: input.reply?.messageId ?? null,
      userId: input.userId,
    })
    .where(and(eq(loginNonces.nonce, input.nonce), notExpired, isNull(loginNonces.userId)))
    .returning({ nonce: loginNonces.nonce });
  if (bound.length > 0) {
    return ok(undefined);
  }
  const why = await peekNonce(db, input.nonce, input.now);
  // Unbound after all: it expired between the two reads.
  return why.ok ? err("nonce/not-found") : why;
};

export type NonceState =
  | { readonly status: "not-found" }
  | { readonly status: "pending" }
  | {
      readonly status: "ready";
      readonly userId: string;
      readonly login: NonceLogin;
      /** The bot's reply to this login, if it recorded one: the notice takes it over. */
      readonly reply: NonceReply | null;
    };

/**
Step 3 (app side): `ready` is returned once. The claim is one conditional write (unconsumed,
bound, unexpired → consumed), so of two polls at once exactly one gets `ready`; the other reads
the nonce as gone.
*/
export const consumeNonce = async (db: Db, nonce: string, now: number): Promise<NonceState> => {
  const notExpired = gt(loginNonces.expiresAt, new Date(now));
  const unconsumed = and(eq(loginNonces.nonce, nonce), notExpired, isNull(loginNonces.consumedAt));
  const [claimed] = await db
    .update(loginNonces)
    .set({ consumedAt: new Date(now) })
    .where(and(unconsumed, isNotNull(loginNonces.userId)))
    .returning();
  if (claimed?.userId === undefined || claimed.userId === null) {
    const row = await db.query.loginNonces.findFirst({ where: unconsumed });
    return { status: row === undefined ? "not-found" : "pending" };
  }
  return {
    login: {
      deviceId: claimed.deviceId,
      deviceName: claimed.deviceName,
      // A nonce minted before `from` was kept came from the app (the default then and now).
      from: claimed.from === "web" ? "web" : "app",
      place: {
        city: claimed.city,
        country: claimed.country,
        ip: claimed.ip,
        userAgent: claimed.userAgent,
      },
    },
    reply:
      claimed.replyChatId === null || claimed.replyMessageId === null
        ? null
        : { chatId: claimed.replyChatId, messageId: claimed.replyMessageId },
    status: "ready",
    userId: claimed.userId,
  };
};

/**
Notes the session a consumed nonce opened, so a login notice can name it (and "Not me" end it).
A statement to batch with the session's own insert: neither goes in without the other.
*/
export const linkNonceSession = (db: Db, nonce: string, sessionId: string): BatchItem<"sqlite"> =>
  db.update(loginNonces).set({ sessionId }).where(eq(loginNonces.nonce, nonce));
