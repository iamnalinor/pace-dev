import { err, ok, type Result } from "@pace/core";

import { hmacSha256Hex, isTimingSafeEqual } from "../shared/crypto.ts";

/** The Login Widget payload: `hash` signs every other field that is present. */
export type TelegramLoginPayload = {
  readonly id: number;
  readonly first_name: string;
  readonly last_name?: string | undefined;
  readonly username?: string | undefined;
  readonly photo_url?: string | undefined;
  readonly auth_date: number;
  readonly hash: string;
};

export type TelegramUser = {
  readonly telegramId: string;
  readonly name: string;
  readonly username: null | string;
  readonly photoUrl: null | string;
};

const MAX_AGE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

/** Plain code-unit order (Telegram sorts the keys bytewise, not by locale). */
const compareKeys = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
};

/** Telegram's data-check-string: every field but `hash`, sorted by key, `key=value` joined by `\n`. */
const checkString = (payload: TelegramLoginPayload): string => {
  const { hash: _hash, ...fields } = payload;
  return Object.entries(fields)
    .filter((entry): entry is [string, number | string] => entry[1] !== undefined)
    .toSorted(([a], [b]) => compareKeys(a, b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n");
};

/**
 * Verifies a Login Widget payload the way Telegram documents it
 * (https://core.telegram.org/widgets/login#checking-authorization): HMAC-SHA-256 of
 * the check string under SHA-256(bot token), compared in constant time, and
 * `auth_date` no older than five minutes.
 */
export const verifyTelegramLogin = async (
  payload: TelegramLoginPayload,
  botToken: string,
  nowSeconds: number,
): Promise<Result<TelegramUser, "auth/expired" | "auth/invalid-hash">> => {
  const secret = await crypto.subtle.digest("SHA-256", encoder.encode(botToken));
  const expected = await hmacSha256Hex(secret, checkString(payload));
  if (!isTimingSafeEqual(expected, payload.hash.toLowerCase())) {
    return err("auth/invalid-hash");
  }
  if (nowSeconds - payload.auth_date > MAX_AGE_SECONDS) {
    return err("auth/expired");
  }
  const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ");
  return ok({
    telegramId: String(payload.id),
    name,
    username: payload.username ?? null,
    photoUrl: payload.photo_url ?? null,
  });
};
