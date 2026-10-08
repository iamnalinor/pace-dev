import type { Hono } from "hono";

import { authorizationErrorRedirect, type GrantSummary } from "@cloudflare/workers-oauth-provider";
import { z } from "zod";

import {
  endpoints,
  err,
  grantedScopes,
  type GrantScopesError,
  type OAuthClientInfo,
  type OAuthGrant,
  ok,
  requestedScopes,
} from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { requireUser } from "../shared/current-user.ts";
import { d1 } from "../shared/db/d1.ts";
import { type Handler, mount, type Problem } from "../shared/mount.ts";
import { oauthHelpers } from "../shared/oauth-helpers.ts";
import { resolveTelegramIdentity } from "../shared/telegram-identity.ts";
import { loadConsent, parseAuthorization } from "./consent.ts";

/** What consent stores on the grant: shown in "Connected apps" without a client lookup. */
const GrantMetadataSchema = z.object({
  label: z.string().optional(),
  logoUri: z.string().optional(),
  telegramId: z.string().optional(),
});

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
  const identity = await resolveTelegramIdentity(d1(c.env.DB), c.get("config"), {
    devTelegramId: body.devTelegramId,
    now: Date.now(),
    telegram: body.telegram,
  });
  if (!identity.ok) {
    return identity;
  }
  const user = identity.value;
  const { redirectTo } = await oauthHelpers(c).completeAuthorization({
    metadata: { label: details.clientName, logoUri: details.logoUri, telegramId: user.telegramId },
    props: { telegramId: user.telegramId, userId: user.id },
    request,
    scope: [...scopes.value],
    userId: user.id,
  });
  return ok({ redirectTo });
};

const deny: Handler<typeof endpoints.oauth.deny> = async ({ c, body }) => {
  const consent = await loadConsent(c, body.authQuery);
  return consent.ok
    ? ok({ redirectTo: authorizationErrorRedirect(consent.value.request, "access_denied") })
    : consent;
};

const toGrant = (summary: GrantSummary): OAuthGrant => {
  const metadata = GrantMetadataSchema.safeParse(summary.metadata);
  const stored = metadata.success ? metadata.data : {};
  return {
    id: summary.id,
    clientId: summary.clientId,
    clientName: stored.label ?? summary.clientId,
    logoUri: stored.logoUri ?? null,
    scopes: [...summary.scope],
    createdAt: new Date(summary.createdAt * 1000).toISOString(),
    expiresAt:
      summary.expiresAt === undefined ? null : new Date(summary.expiresAt * 1000).toISOString(),
  };
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

  mount(app, endpoints.oauth.grants.list, async ({ c }) => {
    const { items } = await oauthHelpers(c).listUserGrants(requireUser(c).id, { limit: 100 });
    return ok({ grants: items.map((item) => toGrant(item)) });
  });

  mount(app, endpoints.oauth.grants.revoke, async ({ c, params }) => {
    await oauthHelpers(c).revokeGrant(params.id, requireUser(c).id);
    return ok({ ok: true as const });
  });
  return app;
};
