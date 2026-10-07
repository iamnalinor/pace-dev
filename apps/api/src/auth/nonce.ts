import { and, eq, gt, isNull } from "drizzle-orm";

import { err, ok, type Result } from "@pace/core";

import type { Db } from "../shared/db/d1.ts";

import { randomBase64Url } from "../shared/crypto.ts";
import { loginNonces } from "../shared/db/d1-schema.ts";

const NONCE_TTL_MS = 5 * 60 * 1000;

/** Step 1 of the app login: a short-lived nonce the bot will bind to whoever opens the deep link. */
export const createNonce = async (
  db: Db,
  now: number,
): Promise<{ readonly nonce: string; readonly expiresAt: number }> => {
  const nonce = randomBase64Url(24);
  const expiresAt = now + NONCE_TTL_MS;
  await db
    .insert(loginNonces)
    .values({ nonce, createdAt: new Date(now), expiresAt: new Date(expiresAt) });
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
  | { readonly status: "ready"; readonly userId: string };

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
  return { status: "ready", userId: row.userId };
};
