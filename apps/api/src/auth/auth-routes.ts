import type { Hono } from "hono";

import { endpoints, err, ok, type Result } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { Config } from "../shared/config.ts";

import { requireUser } from "../shared/current-user.ts";
import { d1, type Db } from "../shared/db/d1.ts";
import { type Handler, mount, type Problem } from "../shared/mount.ts";
import { readBearer } from "./auth-middleware.ts";
import { mountDeviceRoutes } from "./device-routes.ts";
import { consumeNonce, createNonce } from "./nonce.ts";
import { createSession, revokeSession } from "./sessions.ts";
import { verifyTelegramLogin } from "./telegram-widget.ts";
import { findUserById, type TelegramProfile, upsertTelegramUser, type User } from "./users.ts";
import { isAllowed } from "./whitelist.ts";

type Session = { readonly token: string; readonly user: User };

const NOT_ALLOWED: Problem = {
  code: "auth/not-allowed",
  message: "This Telegram account is not allowed to use Pace",
  status: 403,
};

const NONCE_NOT_FOUND: Problem = {
  code: "auth/nonce-not-found",
  message: "Unknown or expired login",
  status: 404,
};

/** Shared tail of every login: whitelist → user row → session. */
const signIn = async (
  db: Db,
  config: Config,
  input: { readonly profile: TelegramProfile; readonly label: string; readonly now: number },
): Promise<Result<Session, Problem>> => {
  if (!isAllowed(input.profile.telegramId, config.allowedTelegramIds)) {
    return err(NOT_ALLOWED);
  }
  const user = await upsertTelegramUser(db, input.profile, input.now);
  const { token } = await createSession(db, {
    label: input.label,
    now: input.now,
    userId: user.id,
  });
  return ok({ token, user });
};

const telegramLogin: Handler<typeof endpoints.auth.telegram> = async ({ c, body }) => {
  const config = c.get("config");
  if (config.telegramBotToken === undefined) {
    return err({
      code: "auth/not-configured",
      message: "Telegram login is not configured",
      status: 503,
    });
  }
  const now = Date.now();
  const verified = await verifyTelegramLogin(body, config.telegramBotToken, Math.floor(now / 1000));
  if (verified.ok) {
    return await signIn(d1(c.env.DB), config, { label: "web", now, profile: verified.value });
  }
  switch (verified.error) {
    case "auth/invalid-hash": {
      return err({ code: verified.error, message: "Invalid Telegram signature", status: 401 });
    }
    case "auth/expired": {
      return err({
        code: verified.error,
        message: "Telegram login expired, try again",
        status: 401,
      });
    }
  }
};

const pollNonce: Handler<typeof endpoints.auth.noncePoll> = async ({ c, params }) => {
  const db = d1(c.env.DB);
  const now = Date.now();
  const state = await consumeNonce(db, params.nonce, now);
  switch (state.status) {
    case "not-found": {
      return err(NONCE_NOT_FOUND);
    }
    case "pending": {
      return ok({ status: "pending" as const });
    }
    case "ready": {
      const user = await findUserById(db, state.userId);
      if (user === null) {
        return err(NONCE_NOT_FOUND);
      }
      const { token } = await createSession(db, { label: "android", now, userId: user.id });
      return ok({ status: "ready" as const, token, user });
    }
  }
};

const devLogin: Handler<typeof endpoints.auth.dev> = async ({ c, body }) => {
  const config = c.get("config");
  if (config.environment === "production") {
    return err({ code: "not-found", message: "Not found", status: 404 });
  }
  const profile: TelegramProfile = {
    name: `Dev ${body.telegramId}`,
    photoUrl: null,
    telegramId: body.telegramId,
    username: null,
  };
  return await signIn(d1(c.env.DB), config, { label: "dev", now: Date.now(), profile });
};

export const mountAuthRoutes = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.auth.telegram, telegramLogin);
  mount(app, endpoints.auth.nonceCreate, async ({ c }) => {
    const { nonce } = await createNonce(d1(c.env.DB), Date.now());
    const deepLink = `https://t.me/${c.get("config").telegramBotUsername}?start=login_${nonce}`;
    return ok({ deepLink, nonce });
  });
  mount(app, endpoints.auth.noncePoll, pollNonce);
  mount(app, endpoints.auth.logout, async ({ c }) => {
    const bearer = readBearer(c.req.header("Authorization"));
    if (bearer !== undefined) {
      await revokeSession(d1(c.env.DB), bearer);
    }
    return ok({ ok: true as const });
  });
  mount(app, endpoints.me, ({ c }) => ok(requireUser(c)));
  mount(app, endpoints.auth.dev, devLogin);
  mountDeviceRoutes(app);
};
