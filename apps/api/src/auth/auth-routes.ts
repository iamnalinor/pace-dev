import type { Hono } from "hono";

import { endpoints, err, isUlid, ok, type Result } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { Config } from "../shared/config.ts";
import type { TelegramTransport } from "../shared/telegram-api.ts";

import { requireUser } from "../shared/current-user.ts";
import { d1, type Db } from "../shared/db/d1.ts";
import { loginPayload } from "../shared/login-link.ts";
import { type Handler, mount, type Problem } from "../shared/mount.ts";
import { requestPlace, type RequestPlace } from "../shared/request-place.ts";
import { userStoreOf } from "../shared/user-store-of.ts";
import { readBearer } from "./auth-middleware.ts";
import { cachedAvatar, refreshAvatar } from "./avatar.ts";
import { consumeNonce, createNonce, type NonceLogin, recordNonceSession } from "./nonce.ts";
import { mountSessionRoutes } from "./session-routes.ts";
import { createSession, revokeSession, type SessionKind } from "./sessions.ts";
import { verifyTelegramLogin } from "./telegram-widget.ts";
import { clientName } from "./user-agent.ts";
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

/** An app that did not name its phone (one from before it could) is the Android app. */
const UNNAMED_APP = "Android";

/**
What a session opened by a bot login is: the app's, named by the phone it named, or the
browser's that asked for the nonce, named after that browser.
*/
const nonceSession = (
  login: NonceLogin,
): { readonly kind: SessionKind; readonly name: string; readonly deviceId: null | string } =>
  login.from === "app"
    ? { deviceId: login.deviceId, kind: "app", name: login.deviceName ?? UNNAMED_APP }
    : { deviceId: null, kind: "browser", name: clientName(login.place.userAgent) };

/** Shared tail of every login: whitelist → user row → session. */
const signIn = async (
  db: Db,
  config: Config,
  input: {
    readonly profile: TelegramProfile;
    readonly kind: SessionKind;
    readonly name: string;
    readonly place: RequestPlace;
    readonly now: number;
    readonly apiOrigin: string;
    readonly telegramFetch?: TelegramTransport;
  },
): Promise<Result<Session, Problem>> => {
  if (!isAllowed(input.profile.telegramId, config.allowedTelegramIds)) {
    return err(NOT_ALLOWED);
  }
  const stored = await upsertTelegramUser(db, { ...input.profile, photoUrl: undefined }, input.now);
  const user =
    config.telegramBotToken === undefined || input.telegramFetch === undefined
      ? stored
      : await refreshAvatar(db, stored, {
          target: {
            apiRoot: config.telegramApiRoot,
            token: config.telegramBotToken,
            fetch: input.telegramFetch,
          },
          apiOrigin: input.apiOrigin,
        });
  const { token } = await createSession(db, {
    kind: input.kind,
    name: input.name,
    now: input.now,
    place: input.place,
    userId: user.id,
  });
  return ok({ token, user });
};

const telegramLogin =
  (telegramFetch: TelegramTransport): Handler<typeof endpoints.auth.telegram> =>
  async ({ c, body }) => {
    const config = c.get("config");
    if (config.telegramBotToken === undefined) {
      return err({
        code: "auth/not-configured",
        message: "Telegram login is not configured",
        status: 503,
      });
    }
    const now = Date.now();
    const verified = await verifyTelegramLogin(
      body,
      config.telegramBotToken,
      Math.floor(now / 1000),
    );
    if (verified.ok) {
      const place = requestPlace(c.req.raw);
      return await signIn(d1(c.env.DB), config, {
        kind: "browser",
        name: clientName(place.userAgent),
        now,
        place,
        profile: verified.value,
        apiOrigin: new URL(c.req.url).origin,
        telegramFetch,
      });
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

const pollNonce =
  (telegramFetch: TelegramTransport): Handler<typeof endpoints.auth.noncePoll> =>
  async ({ c, params }) => {
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
        const stored = await findUserById(db, state.userId);
        if (stored === null) {
          return err(NONCE_NOT_FOUND);
        }
        const config = c.get("config");
        const user =
          config.telegramBotToken === undefined
            ? stored
            : await refreshAvatar(db, stored, {
                target: {
                  apiRoot: config.telegramApiRoot,
                  token: config.telegramBotToken,
                  fetch: telegramFetch,
                },
                apiOrigin: new URL(c.req.url).origin,
              });
        const opened = nonceSession(state.login);
        const { id, token } = await createSession(db, {
          ...opened,
          now,
          place: state.login.place,
          userId: user.id,
        });
        await recordNonceSession(db, params.nonce, id);
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
    firstName: null,
    photoUrl: null,
    telegramId: body.telegramId,
    username: null,
  };
  return await signIn(d1(c.env.DB), config, {
    kind: "dev",
    name: "Dev login",
    now: Date.now(),
    place: requestPlace(c.req.raw),
    profile,
    apiOrigin: new URL(c.req.url).origin,
  });
};

export const mountAuthRoutes = (app: Hono<AppEnv>, telegramFetch: TelegramTransport): void => {
  mount(app, endpoints.auth.telegram, telegramLogin(telegramFetch));
  mount(app, endpoints.auth.nonceCreate, async ({ body, c, query }) => {
    const from = query.from ?? "app";
    const { nonce } = await createNonce(d1(c.env.DB), {
      deviceId: body?.deviceId,
      deviceName: body?.deviceName,
      from,
      now: Date.now(),
      place: requestPlace(c.req.raw),
    });
    const payload = loginPayload(nonce, from);
    const deepLink = `https://t.me/${c.get("config").telegramBotUsername}?start=${payload}`;
    return ok({ deepLink, nonce });
  });
  mount(app, endpoints.auth.noncePoll, pollNonce(telegramFetch));
  mount(app, endpoints.auth.logout, async ({ c }) => {
    const bearer = readBearer(c.req.header("Authorization"));
    if (bearer !== undefined) {
      await revokeSession(d1(c.env.DB), bearer);
    }
    return ok({ ok: true as const });
  });
  mount(app, endpoints.me, async ({ c }) =>
    ok({ ...requireUser(c), storeId: await userStoreOf(c).storeId() }),
  );
  mount(app, endpoints.auth.dev, devLogin);
  // Binary image response: the JSON endpoint helper cannot serialize image bytes.
  app.get("/api/avatars/:userId", async (c) => {
    const userId = c.req.param("userId");
    if (!isUlid(userId)) {
      return await c.notFound();
    }
    const avatar = await cachedAvatar(d1(c.env.DB), userId);
    return avatar === null
      ? await c.notFound()
      : new Response(new Uint8Array(avatar.bytes).buffer, {
          headers: { "Content-Type": avatar.mime, "Cache-Control": "public, max-age=3600" },
        });
  });
  mountSessionRoutes(app);
};
