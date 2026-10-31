import { and, eq, gt, isNull, lte } from "drizzle-orm";

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
};

/** Step 2 (bot side): attaches the user who opened the link; a nonce binds once. */
export const bindNonce = async (
  db: Db,
  input: BindNonce,
): Promise<Result<undefined, "nonce/already-bound" | "nonce/not-found">> => {
  const notExpired = gt(loginNonces.expiresAt, new Date(input.now));
  const row = await db.query.loginNonces.findFirst({
    where: and(eq(loginNonces.nonce, input.nonce), notExpired),
  });
  if (row === undefined) {
    return err("nonce/not-found");
  }
  if (row.userId !== null) {
    return err("nonce/already-bound");
  }
  await db
    .update(loginNonces)
    .set({ userId: input.userId })
    .where(eq(loginNonces.nonce, input.nonce));
  return ok(undefined);
};

export type NonceState =
  | { readonly status: "not-found" }
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly userId: string; readonly login: NonceLogin };

/** Step 3 (app side): `ready` is returned once — the nonce is marked consumed in the same call. */
export const consumeNonce = async (db: Db, nonce: string, now: number): Promise<NonceState> => {
  const notExpired = gt(loginNonces.expiresAt, new Date(now));
  const row = await db.query.loginNonces.findFirst({
    where: and(eq(loginNonces.nonce, nonce), notExpired, isNull(loginNonces.consumedAt)),
  });
  if (row === undefined) {
    return { status: "not-found" };
  }
  if (row.userId === null) {
    return { status: "pending" };
  }
  await db
    .update(loginNonces)
    .set({ consumedAt: new Date(now) })
    .where(eq(loginNonces.nonce, nonce));
  return {
    login: {
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      // A nonce minted before `from` was kept came from the app (the default then and now).
      from: row.from === "web" ? "web" : "app",
      place: { city: row.city, country: row.country, ip: row.ip, userAgent: row.userAgent },
    },
    status: "ready",
    userId: row.userId,
  };
};

/** Notes the session a consumed nonce opened, so a login notice can name it (and "Not me" end it). */
export const recordNonceSession = async (
  db: Db,
  nonce: string,
  sessionId: string,
): Promise<void> => {
  await db.update(loginNonces).set({ sessionId }).where(eq(loginNonces.nonce, nonce));
};
