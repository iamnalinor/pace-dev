import type { Context, Hono } from "hono";

import {
  endpoints,
  err,
  grantedScopes,
  type GrantScopesError,
  type OAuthClientInfo,
  ok,
  requestedScopes,
  type Result,
  type TelegramLogin,
} from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { GrantMetadata } from "../shared/oauth-grants.ts";

import { type Handler, mount, type Problem } from "../shared/mount.ts";
import { oauthHelpers } from "../shared/oauth-helpers.ts";
import { bearerOf, resolveSessionIdentity } from "../shared/session-identity.ts";
import { resolveTelegramIdentity, type User } from "../shared/telegram-identity.ts";
import { loadConsent, parseAuthorization } from "./consent.ts";

const SCOPE_PROBLEMS: Readonly<Record<GrantScopesError, Problem>> = {
  "oauth/no-scopes": {
    code: "oauth/no-scopes",
    message: "Allow at least one permission, or deny the request",
    status: 422,
  },
  "oauth/scope-not-requested": {
    code: "oauth/scope-not-requested",
    message: "The app did not ask for one of these permissions",
    status: 422,
  },
};

const clientInfo: Handler<typeof endpoints.oauth.clientInfo> = async ({ c, query }) => {
  const consent = await loadConsent(c, query.authQuery);
  if (!consent.ok) {
    return consent;
  }
  const { details } = consent.value;
  const info: OAuthClientInfo = {
    clientDomain: details.clientDomain ?? null,
    clientName: details.clientName,
    clientUri: details.clientUri ?? null,
    logoUri: details.logoUri ?? null,
    redirectHost: details.redirectHost,
    redirectIsLoopback: details.redirectIsLoopback,
    scopes: [...requestedScopes(details.scope)],
  };
  return ok(info);
};

const IDENTITY_CONFLICT: Problem = {
  code: "auth/identity-conflict",
  message: "Send either the Pace session or a Telegram proof, not both",
  status: 422,
};

/**
Who is allowing: the browser's Pace session when the request carries its bearer, else the
Telegram widget payload (or a dev id outside production) of a signed-out browser. One proof per
request, so the grant can only ever belong to the user the page showed.
*/
const identityOf = async (
  c: Context<AppEnv>,
  body: {
    readonly devTelegramId?: string | undefined;
    readonly telegram?: TelegramLogin | undefined;
  },
): Promise<Result<User, Problem>> => {
  const now = Date.now();
  const bearer = bearerOf(c.req.header("Authorization"));
  if (bearer !== undefined) {
    const hasSecondProof = body.telegram !== undefined || body.devTelegramId !== undefined;
    return hasSecondProof
      ? err(IDENTITY_CONFLICT)
      : await resolveSessionIdentity(c.env.DB, c.get("config"), { now, token: bearer });
  }
  return await resolveTelegramIdentity(c.env.DB, c.get("config"), {
    devTelegramId: body.devTelegramId,
    now,
    telegram: body.telegram,
  });
};

const complete: Handler<typeof endpoints.oauth.complete> = async ({ c, body }) => {
  const consent = await loadConsent(c, body.authQuery);
  if (!consent.ok) {
    return consent;
  }
  const { details, request } = consent.value;
  const scopes = grantedScopes(requestedScopes(request.scope), body.scopes);
  if (!scopes.ok) {
    return err(SCOPE_PROBLEMS[scopes.error]);
  }
  const identity = await identityOf(c, body);
  if (!identity.ok) {
    return identity;
  }
  const user = identity.value;
  const metadata: GrantMetadata = {
    label: details.clientName,
    logoUri: details.logoUri,
    telegramId: user.telegramId,
  };
  const { redirectTo } = await oauthHelpers(c).completeAuthorization({
    metadata,
    props: { telegramId: user.telegramId, userId: user.id },
    request,
    scope: [...scopes.value],
    userId: user.id,
  });
  return ok({ redirectTo });
};

const deny: Handler<typeof endpoints.oauth.deny> = async ({ c, body }) => {
  const consent = await loadConsent(c, body.authQuery);
  return consent.ok ? ok({ redirectTo: oauthHelpers(c).deny(consent.value.request) }) : consent;
};

export const mountOAuthRoutes = (app: Hono<AppEnv>): Hono<AppEnv> => {
  // The authorization endpoint the provider advertises: validate, then hand the person to
  // the consent page on the web origin (the Telegram widget may only run there).
  app.get("/authorize", async (c) => {
    const parsed = await parseAuthorization(c, c.req.raw);
    if (!parsed.ok) {
      return parsed.error.redirectTo === undefined
        ? c.json({ code: parsed.error.code, message: parsed.error.message }, parsed.error.status)
        : c.redirect(parsed.error.redirectTo, 302);
    }
    return c.redirect(
      `${c.get("config").webOrigin}/oauth/authorize${new URL(c.req.url).search}`,
      302,
    );
  });

  mount(app, endpoints.oauth.clientInfo, clientInfo);
  mount(app, endpoints.oauth.complete, complete);
  mount(app, endpoints.oauth.deny, deny);
  return app;
};
