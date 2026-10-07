# MCP server

Pace exposes its data to assistants through the [Model Context Protocol](https://modelcontextprotocol.io):
a standard **streamable HTTP** endpoint at `https://pace-api.nalinor.dev/mcp`, protected by
**OAuth 2.1** (PKCE S256, dynamic client registration, Client ID Metadata Documents, refresh
token rotation, revocation). Any MCP client that speaks the 2025-06-18 authorization spec can
connect: Claude (web, desktop, Code), ChatGPT connectors, Cursor, MCP Inspector, …

The transport is `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`
1.32 (the SDK's web-standard transport, which runs on Workers), in **stateless mode** with JSON
responses: every POST is a complete JSON-RPC exchange, no session id, no SSE stream kept
open, so the Worker stays request-shaped and `agents`/`McpAgent` are not needed. The OAuth
provider is `@cloudflare/workers-oauth-provider` 1.2 wrapping the Hono app in
`apps/api/src/worker.ts`.

## Connecting

The server URL is always `https://pace-api.nalinor.dev/mcp` (or `http://localhost:8787/mcp`
against `wrangler dev`). Clients discover the rest: the first unauthenticated call gets a
`401` whose `WWW-Authenticate` names the protected resource metadata
(`/.well-known/oauth-protected-resource/mcp`), which names the authorization server
(`/.well-known/oauth-authorization-server`), which names `/authorize`, `/oauth/token` and
`/oauth/register`.

| Client | How |
|---|---|
| **Claude** (web and desktop) | Settings → Connectors → *Add custom connector* → URL `https://pace-api.nalinor.dev/mcp`. Claude registers itself (CIMD or DCR), opens the consent page, and the connector shows up with the Pace tools. |
| **Claude Code** | `claude mcp add --transport http pace https://pace-api.nalinor.dev/mcp`, then `/mcp` inside Claude Code to sign in. |
| **ChatGPT** (developer mode connectors) | Settings → Connectors → *Create* with the same URL; ChatGPT identifies itself by its metadata document (`chatgpt.com`). The `search` and `fetch` tools ChatGPT expects arrive with the task tools in the next phase. |
| **Cursor** | Settings → MCP → *Add new MCP server* → type `streamableHttp` with the URL, or in `~/.cursor/mcp.json`: `{ "mcpServers": { "pace": { "url": "https://pace-api.nalinor.dev/mcp" } } }`. Cursor uses the `cursor://` callback alongside a loopback one; only the loopback is accepted. |
| **MCP Inspector** | `bunx @modelcontextprotocol/inspector`, transport *Streamable HTTP*, the URL, then *Open Auth Settings → Quick OAuth Flow* (or just *Connect*). |

Every client ends up on the same consent page; the account behind the connection is the
Telegram account that signs in there, and it must be on the deployment's whitelist
(`ALLOWED_TELEGRAM_IDS`), exactly like the web and Android logins.

## Scopes

Tools declare the scope they need; a tool called with a grant that lacks it answers an MCP
tool error (`isError: true`, explaining which scope is missing) instead of running.

| Scope | Lets a client | Tools (stage 1) |
|---|---|---|
| `tasks:read` | see tasks, subtasks, projects and presets | `whoami`, `get_task`, `list_now`, `list_projects`, `list_project_tasks`, `list_presets`, `search`, `fetch` |
| `tasks:write` | add and change tasks and projects | `create_task`, `capture_inbox`, `mark_subtasks`, `submit`, `close_task`, `reopen`, `update_task`, `set_importance`, `set_rank`, `revoke_event` |
| `time:read` | see the time ledger and focus sessions | stage 3 |
| `time:write` | start, stop and log activities | stage 3 |
| `analytics:read` | see analytics | stage 3 |
| `offline_access` | keep a refresh token, so the connection survives the 24 h access token | — |

Only `whoami` exists today (user id, Telegram id, granted scopes, server time); the task
tools come with the next phase. The catalogue is advertised as `scopes_supported` in the
authorization server metadata. The protected resource names no baseline scope, so clients
that follow the metadata request none and the **consent page offers the whole catalogue**;
a client that asks for specific scopes gets exactly those offered, and the person can
untick any of them. Mutating tools will take `at`, `precision` and `dryRun` (the preview);
every tool carries the MCP annotations `readOnlyHint`, `destructiveHint`, `idempotentHint`.

## The consent flow, step by step

1. The client calls `/mcp` without a token and reads the discovery documents.
2. It registers (`POST /oauth/register`, RFC 7591) or identifies by URL (CIMD), then opens
   `GET https://pace-api.nalinor.dev/authorize?response_type=code&client_id=…&redirect_uri=…&code_challenge=…&code_challenge_method=S256&scope=…&state=…&resource=…`.
3. The API validates the request with the provider (`parseAuthRequest`: known client, exact
   redirect URI, S256 PKCE, the `/mcp` resource) and answers `302` to the **web origin**,
   `https://pace.nalinor.dev/oauth/authorize?<the same query>`. Nothing is rendered on the
   API: the Telegram Login Widget may only run on the bot's one widget domain, the web app.
   A request the provider refuses is redirected back to the client with the OAuth error when
   the client and its redirect URI were valid, and answered with `400 oauth/invalid-request`
   otherwise (never a redirect to an unverified URI).
4. The consent page (`apps/web/src/features/oauth`) asks the API what to show
   (`GET /api/oauth/client-info?authQuery=<query>`): the client's name and logo, its domain for
   a metadata-document client ("registered itself; not verified" otherwise), the redirect host,
   a warning when that host is loopback, and the requested scopes with plain-language lines.
5. The person ticks scopes, signs in with the **Telegram Login Widget** (or, in local and e2e
   builds, types a whitelisted id) and presses **Allow** or **Deny**.
6. **Allow** → `POST /api/oauth/complete { authQuery, scopes, telegram | devTelegramId }`. The
   API re-parses the query (the page is never trusted beyond that string), verifies the widget
   signature (HMAC-SHA-256 with the bot token, five-minute freshness), applies the whitelist
   (`403 auth/not-allowed`), creates or refreshes the user row, rejects any scope the client
   did not ask for (`422 oauth/scope-not-requested`), and calls `completeAuthorization` with
   `props: { userId, telegramId }` and `metadata: { label, logoUri, telegramId }`. It answers
   `{ redirectTo }`: the client's redirect URI with `code`, `state` and `iss`.
   **Deny** → `POST /api/oauth/deny { authQuery }` → `{ redirectTo }` carrying
   `error=access_denied`. The page then navigates to `redirectTo`.
7. The client exchanges the code at `POST /oauth/token` (with its `code_verifier`) for an
   access token (24 h) and, with `offline_access`, a refresh token (30 days, rotated on every
   refresh; the previous one stays valid until its successor is used once).
8. Every MCP call carries `Authorization: Bearer …`. The provider validates the token (audience
   `https://pace-api.nalinor.dev/mcp`, expiry, revocation) and hands the handler `ctx.props`
   and the token's scopes; the handler re-checks the **whitelist** on every call (`403` once a
   Telegram id is removed) and builds a fresh `McpServer` for the request.

"Connected apps" (web settings) lists the person's grants (`GET /api/oauth/grants`: client
name, logo, scopes, dates) and revokes one (`DELETE /api/oauth/grants/:id`), which deletes its
access and refresh tokens at once.

## Code map

```
apps/api/src/worker.ts              OAuthProvider({ apiRoute: "/mcp", defaultHandler: the Hono app, … })
apps/api/src/oauth/oauth-routes.ts  GET /authorize, /api/oauth/{client-info,complete,deny,grants}
apps/api/src/oauth/consent.ts       parseAuthRequest / describeConsent wrappers → Result
apps/api/src/shared/telegram-identity.ts  widget signature + whitelist + user row (shared with login)
apps/api/src/mcp/server.ts          createMcpServer(grant), mcpHandler (whitelist, stateless transport)
apps/api/src/mcp/registry.ts        defineTool({ name, title, description, scope, annotations, input, output, handler })
apps/api/src/mcp/grant.ts           McpGrant from ctx.props + ctx.auth (zod-checked)
apps/api/src/mcp/tools/*.ts         one file per tool (whoami today)
packages/core/src/api/schemas/oauth.ts  OAUTH_SCOPES, requestedScopes, grantedScopes, the consent contract
apps/web/src/features/oauth/        the consent page
```

Adding a tool: `defineTool` in `apps/api/src/mcp/tools/<name>.ts`, add it to `TOOLS` in
`server.ts`, and the scope check, annotations and typed input come for free.

## Local testing

```sh
bun dev                                   # API on :8787 (ENVIRONMENT=development), web on :5173
bunx @modelcontextprotocol/inspector      # connect to http://localhost:8787/mcp
```

The `dev` environment in `apps/api/wrangler.jsonc` sets `API_ORIGIN=http://localhost:8787`
(the issuer and resource: `http` is accepted on loopback hosts only) and
`WEB_ORIGIN=http://localhost:5173`. The consent page in `vite dev` shows the dev identity
form, so no bot token is needed: type a whitelisted Telegram id and press Allow. Tokens,
clients and grants live in the local KV emulation (`.wrangler/state`).

The same flow runs in workerd in `apps/api/tests/oauth.int.test.ts` (discovery, registration,
the PKCE dance, refresh rotation, revocation, whitelist, scope checks, grants) and
`apps/api/tests/mcp.int.test.ts` (initialize, tools/list, whoami, 403 for a token whose
Telegram id is not allowed); `apps/api/src/mcp/registry.test.ts` covers the scope guard with
an in-memory client. `bun test:api` runs them.

## Operational notes

- `global_fetch_strictly_public` is in `compatibility_flags`: the provider needs it to fetch
  client metadata documents safely (CIMD is advertised only when it is set).
- The protected resource metadata lives at `/.well-known/oauth-protected-resource/mcp` (the
  path form, as the resource is `<origin>/mcp`); the provider owns the whole
  `/.well-known/oauth-protected-resource*` namespace and answers 404 for other paths.
- KV free tier: 1 000 writes a day. A consent writes a grant and a code, an exchange writes a
  token, a refresh rewrites the grant and a token. One person with a few connectors is far
  from the limit; `purgeExpiredData` can run from a cron trigger when needed.
- Web CSP (`apps/web/public/_headers`): `img-src https:` so client logos render.
