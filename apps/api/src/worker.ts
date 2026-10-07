import { OAuthProvider, type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";

import { OAUTH_SCOPES } from "@pace/core";

import { createApp } from "./app.ts";
import { mcpHandler } from "./mcp/server.ts";
import { mountOAuthRoutes } from "./oauth/oauth-routes.ts";

export { UserStore } from "./user-store/user-store.ts";

const app = createApp();
mountOAuthRoutes(app);

/** A day: MCP clients refresh silently, and a revoked grant is dead within one request anyway. */
const ACCESS_TOKEN_TTL_SECONDS = 86_400;

/**
 * OAuth 2.1 authorization server and the protected MCP resource in one Worker. The provider
 * owns discovery, registration, the token endpoint and bearer validation for `/mcp`; the
 * Hono app owns `/authorize` (a redirect to the web consent page), the consent API and
 * everything else. The canonical resource is `<API_ORIGIN>/mcp`, so a token is only ever
 * valid for the origin that issued it.
 */
export const providerOptions = (apiOrigin: string): OAuthProviderOptions => ({
  accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
  apiHandler: { fetch: mcpHandler },
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientIdMetadataDocumentEnabled: true,
  clientRegistrationEndpoint: "/oauth/register",
  defaultHandler: {
    fetch: async (request, env, ctx): Promise<Response> => await app.fetch(request, env, ctx),
  },
  resourceMetadata: {
    authorization_servers: [apiOrigin],
    resource: `${apiOrigin}/mcp`,
    resource_name: "Pace",
  },
  scopesSupported: [...OAUTH_SCOPES],
  tokenEndpoint: "/oauth/token",
});

// The resource is fixed at construction and the origin is a binding (read per request, never
// at module scope), so the provider is built on first use and kept for the isolate's life.
const providers = new Map<string, OAuthProvider>();

const providerFor = (apiOrigin: string): OAuthProvider => {
  const existing = providers.get(apiOrigin);
  if (existing !== undefined) {
    return existing;
  }
  const created = new OAuthProvider(providerOptions(apiOrigin));
  providers.set(apiOrigin, created);
  return created;
};

export default {
  fetch: async (request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> =>
    await providerFor(env.API_ORIGIN).fetch(request, env, ctx),
} satisfies ExportedHandler<Cloudflare.Env>;
