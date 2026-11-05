import { OAuthProvider, type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";

import { OAUTH_SCOPES } from "@pace/core";

import { createApp } from "./app.ts";
import { MCP_RESOURCE_METADATA_PATH, mcpHandler } from "./mcp/server.ts";
import { mountOAuthRoutes } from "./oauth/oauth-routes.ts";
import { cloudflareRequestPlaceReader } from "./platform/cloudflare/request-place.ts";
import { oauthOrigin } from "./shared/config.ts";
import { createLogger } from "./shared/logger.ts";

export { LlmHealth } from "./shared/llm/health-object.ts";
export { UserStore } from "./user-store/user-store.ts";

/** The HTTP app plus the consent routes, which only make sense behind the provider. */
const app = mountOAuthRoutes(createApp(undefined, cloudflareRequestPlaceReader));
const log = createLogger("info");

/** A day: MCP clients refresh silently, and a revoked grant is dead within one request anyway. */
const ACCESS_TOKEN_TTL_SECONDS = 86_400;

/**
OAuth 2.1 authorization server and the protected MCP resource in one Worker. The provider
owns discovery, registration, the token endpoint and bearer validation for `/mcp`; the
Hono app owns `/authorize` (a redirect to the web consent page), the consent API and
everything else. The canonical resource is `<API_ORIGIN>/mcp`, so a token is only ever
valid for the origin that issued it.
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

// The resource is fixed at construction and the origin is a binding (read per request, never at
// module scope), so a provider is built on first use and kept. With no usable API_ORIGIN the key is
// the Host a request reached, which a proxy may vary at will: the cache keeps the latest few only
// (review M1).
const MAX_PROVIDERS = 4;
const providers = new Map<string, OAuthProvider>();

const providerFor = (apiOrigin: string): OAuthProvider => {
  const existing = providers.get(apiOrigin);
  if (existing !== undefined) {
    return existing;
  }
  const created = new OAuthProvider(providerOptions(apiOrigin));
  providers.set(apiOrigin, created);
  if (providers.size > MAX_PROVIDERS) {
    // Maps keep insertion order: the first key is the oldest.
    providers.delete(providers.keys().next().value ?? apiOrigin);
  }
  return created;
};

/** The provider's own read-only methods on its metadata (a CORS preflight included). */
const METADATA_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
The provider answers its resource metadata only at the canonical URL, so a Worker reached at
another address (a proxy, a LAN name) answered 404 there. The document is public and names the
canonical resource, so a read of that one path is served as if asked at the Worker's own origin.
*/
const atOwnOrigin = (request: Request, origin: string): Request => {
  const url = new URL(request.url);
  return METADATA_METHODS.has(request.method) &&
    url.pathname === MCP_RESOURCE_METADATA_PATH &&
    url.origin !== origin
    ? new Request(`${origin}${MCP_RESOURCE_METADATA_PATH}${url.search}`, request)
    : request;
};

/** The paths of OAuth and MCP, which need an origin the provider accepts. */
const isOAuthPath = (pathname: string): boolean =>
  pathname === "/mcp" ||
  pathname.startsWith("/mcp/") ||
  pathname === "/authorize" ||
  pathname.startsWith("/oauth/") ||
  pathname.startsWith("/.well-known/oauth-");

/** OAuth and MCP on a Worker no OAuth origin fits: a 503 that says why and what to set. */
const noOAuth = (): Response =>
  Response.json(
    {
      error: "temporarily_unavailable",
      error_description:
        "AI apps cannot connect: set API_ORIGIN to this server's https address (http only on localhost)",
    },
    { status: 503 },
  );

/** Logged once per isolate, not on every request. */
const noOAuthLog = { isDone: false };

export default {
  fetch: async (
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ): Promise<Response> => {
    // A configured origin the provider refuses reads as unset, as in the config; a reached one it
    // refuses too (plain http on a LAN) leaves the app without OAuth and MCP (review I3).
    const origin = oauthOrigin(env.API_ORIGIN, request.url);
    if (origin === null) {
      if (!isOAuthPath(new URL(request.url).pathname)) {
        return await app.fetch(request, env, ctx);
      }
      if (!noOAuthLog.isDone) {
        noOAuthLog.isDone = true;
        log.warn("oauth: off", { why: "no https API_ORIGIN, and reached over plain http" });
      }
      return noOAuth();
    }
    return await providerFor(origin).fetch(atOwnOrigin(request, origin), env, ctx);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
