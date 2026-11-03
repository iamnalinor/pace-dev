import { err, ok, type Result } from "@pace/core";

import type { User } from "../auth/users.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db/d1.ts";
import type { Problem } from "./mount.ts";

import { readBearer } from "../auth/auth-middleware.ts";
import { findSession } from "../auth/sessions.ts";
import { isAllowed } from "../auth/whitelist.ts";

/** The refusal `requireAuth` gives, so the app's session check hears a revoked session the same way. */
const SESSION_ENDED: Problem = {
  code: "auth/unauthorized",
  message: "Unauthorized",
  status: 401,
};

const DEVICE_TOKEN: Problem = {
  code: "auth/forbidden",
  message: "This token cannot do that",
  status: 403,
};

const NOT_ALLOWED: Problem = {
  code: "auth/not-allowed",
  message: "This Telegram account is not allowed to use Pace",
  status: 403,
};

/** The bearer token a request carries in `Authorization`, if any. */
export const bearerOf = (header: string | undefined): string | undefined => readBearer(header);

/**
Who is allowing, proved by the browser's live Pace session (owner bug 2026-11-03): the user of an
unexpired, unrevoked sign-in. A revoked or expired one is the 401 `requireAuth` answers (the app
then checks its session, signs out and the page offers signing in); a device token, which may
only upload usage, is 403; a person who has left the whitelist since signing in is refused as the
widget would refuse them. A bearer, never a cookie: another site cannot send it, so no CSRF.
*/
export const resolveSessionIdentity = async (
  db: Db,
  config: Config,
  input: { readonly token: string; readonly now: number },
): Promise<Result<User, Problem>> => {
  const access = await findSession(db, input.token, input.now);
  if (access === null) {
    return err(SESSION_ENDED);
  }
  if (access.scope !== null) {
    return err(DEVICE_TOKEN);
  }
  return isAllowed(access.user.telegramId, config.allowedTelegramIds)
    ? ok(access.user)
    : err(NOT_ALLOWED);
};
