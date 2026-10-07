import { z } from "zod";

import { err, ok, type Result } from "../../result.ts";
import { TelegramLoginSchema } from "./auth.ts";

/**
 * Every scope the OAuth provider can grant to an MCP client. Tools declare the one they
 * need; `offline_access` only asks for a refresh token.
 */
export const OAUTH_SCOPES = [
  "tasks:read",
  "tasks:write",
  "time:read",
  "time:write",
  "analytics:read",
  "offline_access",
] as const;

export const OAuthScopeSchema = z.enum(OAUTH_SCOPES);

export type OAuthScope = z.output<typeof OAuthScopeSchema>;

const isOAuthScope = (value: string): value is OAuthScope =>
  OAuthScopeSchema.safeParse(value).success;

/**
 * The scopes the consent page offers for a request: what the client asked for, limited to
 * the ones Pace knows. A client that asks for nothing (most MCP clients, when the resource
 * names no baseline) is offered everything and the person decides.
 */
export const requestedScopes = (requested: readonly string[]): readonly OAuthScope[] => {
  const known = requested.filter(isOAuthScope);
  return known.length === 0 ? OAUTH_SCOPES : [...new Set(known)];
};

export type GrantScopesError = "oauth/no-scopes" | "oauth/scope-not-requested";

/** What the person allowed, checked against what the consent page offered. */
export const grantedScopes = (
  offered: readonly OAuthScope[],
  chosen: readonly OAuthScope[],
): Result<readonly OAuthScope[], GrantScopesError> => {
  const unique = [...new Set(chosen)];
  if (unique.some((scope) => !offered.includes(scope))) {
    return err("oauth/scope-not-requested");
  }
  return unique.length === 0 ? err("oauth/no-scopes") : ok(unique);
};

/** The raw query string of the client's authorization request, carried by the consent page. */
const AuthQuerySchema = z.string().min(1).max(4096);

export const OAuthClientInfoQuerySchema = z.object({ authQuery: AuthQuerySchema });

/** What the consent page shows about the client (every string comes from the client: render as text). */
export const OAuthClientInfoSchema = z.object({
  clientName: z.string(),
  /** The hostname of a Client ID Metadata Document client; null for self-registered clients. */
  clientDomain: z.string().nullable(),
  clientUri: z.string().nullable(),
  logoUri: z.string().nullable(),
  /** Where the tokens will be sent (a hostname, or the whole URI for a native app). */
  redirectHost: z.string(),
  redirectIsLoopback: z.boolean(),
  scopes: z.array(OAuthScopeSchema),
});

export type OAuthClientInfo = z.output<typeof OAuthClientInfoSchema>;

export const OAuthCompleteBodySchema = z.object({
  authQuery: AuthQuerySchema,
  scopes: z.array(OAuthScopeSchema).max(OAUTH_SCOPES.length * 2),
  /** The Telegram Login Widget payload (web consent page). */
  telegram: TelegramLoginSchema.optional(),
  /** Local and e2e only: sign in as a whitelisted id without Telegram. */
  devTelegramId: z.string().min(1).optional(),
});

export const OAuthDenyBodySchema = z.object({ authQuery: AuthQuerySchema });

/** Where the browser goes next: back to the client with a code or an error. */
export const OAuthRedirectSchema = z.object({ redirectTo: z.string().min(1) });

export const OAuthGrantSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  logoUri: z.string().nullable(),
  scopes: z.array(z.string()),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
});

export type OAuthGrant = z.output<typeof OAuthGrantSchema>;

export const OAuthGrantsSchema = z.object({ grants: z.array(OAuthGrantSchema) });

export const OAuthGrantRevokedSchema = z.object({ ok: z.literal(true) });
