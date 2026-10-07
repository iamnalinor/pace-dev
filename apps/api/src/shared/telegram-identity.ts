import { err, ok, type Result, type TelegramLogin } from "@pace/core";

import type { Config } from "./config.ts";
import type { Db } from "./db/d1.ts";
import type { Problem } from "./mount.ts";

import { verifyTelegramLogin } from "../auth/telegram-widget.ts";
import { type TelegramProfile, upsertTelegramUser, type User } from "../auth/users.ts";
import { isAllowed } from "../auth/whitelist.ts";

export type { User } from "../auth/users.ts";
export { isAllowed } from "../auth/whitelist.ts";

export type TelegramIdentityInput = {
  /** The Telegram Login Widget payload, signed by the bot token. */
  readonly telegram?: TelegramLogin | undefined;
  /** Local and e2e only: a whitelisted id without Telegram (ignored in production). */
  readonly devTelegramId?: string | undefined;
  readonly now: number;
};

const NOT_ALLOWED: Problem = {
  code: "auth/not-allowed",
  message: "This Telegram account is not allowed to use Pace",
  status: 403,
};

const IDENTITY_REQUIRED: Problem = {
  code: "auth/identity-required",
  message: "Sign in with Telegram to continue",
  status: 422,
};

const WIDGET_PROBLEMS: Readonly<Record<"auth/expired" | "auth/invalid-hash", Problem>> = {
  "auth/expired": {
    code: "auth/expired",
    message: "Telegram login expired, try again",
    status: 401,
  },
  "auth/invalid-hash": {
    code: "auth/invalid-hash",
    message: "Invalid Telegram signature",
    status: 401,
  },
};

const verifyWidget = async (
  payload: TelegramLogin,
  config: Config,
  now: number,
): Promise<Result<TelegramProfile, Problem>> => {
  if (config.telegramBotToken === undefined) {
    return err({
      code: "auth/not-configured",
      message: "Telegram login is not configured",
      status: 503,
    });
  }
  const verified = await verifyTelegramLogin(
    payload,
    config.telegramBotToken,
    Math.floor(now / 1000),
  );
  return verified.ok ? verified : err(WIDGET_PROBLEMS[verified.error]);
};

const identify = async (
  config: Config,
  input: TelegramIdentityInput,
): Promise<Result<TelegramProfile, Problem>> => {
  if (input.telegram !== undefined) {
    return await verifyWidget(input.telegram, config, input.now);
  }
  if (input.devTelegramId !== undefined && config.environment !== "production") {
    const telegramId = input.devTelegramId;
    return ok({ name: `Dev ${telegramId}`, photoUrl: null, telegramId, username: null });
  }
  return err(IDENTITY_REQUIRED);
};

/**
 * Proves who is at the keyboard (a signed Login Widget payload, or a dev id outside
 * production), applies the whitelist and returns the user row, created on first sight.
 * Shared by the web login and the MCP consent page.
 */
export const resolveTelegramIdentity = async (
  db: Db,
  config: Config,
  input: TelegramIdentityInput,
): Promise<Result<User, Problem>> => {
  const profile = await identify(config, input);
  if (!profile.ok) {
    return profile;
  }
  return isAllowed(profile.value.telegramId, config.allowedTelegramIds)
    ? ok(await upsertTelegramUser(db, profile.value, input.now))
    : err(NOT_ALLOWED);
};
