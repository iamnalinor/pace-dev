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
| **ChatGPT** (developer mode connectors) | Settings → Connectors → *Create* with the same URL; ChatGPT identifies itself by its metadata document (`chatgpt.com`). The `search` and `fetch` tools ChatGPT requires are there (see below), so the connector works in chat and deep research; the other tools are available in developer mode. |
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
| `tasks:read` | see tasks, subtasks, projects, presets, the inbox and the review block | `whoami`, `list_now`, `get_task`, `list_projects`, `list_project_tasks`, `list_presets`, `list_inbox`, `list_review`, `search`, `fetch`, `search_decisions` |
| `tasks:write` | add and change tasks, projects and presets | `create_task`, `capture_inbox`, `mark_subtasks`, `submit`, `close_task`, `reopen`, `update_task`, `set_importance`, `set_status`, `set_rank`, `add_subtasks`, `revoke_event`, `review_action`, `seed_example_presets`, `create_preset`, `update_preset`, `archive_preset` |
| `time:read` | see the time ledger and focus sessions | stage 3 |
| `time:write` | start, stop and log activities | stage 3 |
| `analytics:read` | see analytics | stage 3 |
| `offline_access` | keep a refresh token, so the connection survives the 24 h access token | — |

The catalogue is advertised as `scopes_supported` in the authorization server metadata.
The protected resource names no baseline scope, so clients that follow the metadata
request none and the **consent page offers the whole catalogue**; a client that asks for
specific scopes gets exactly those offered, and the person can untick any of them. Every
tool carries the MCP annotations `readOnlyHint`, `destructiveHint`, `idempotentHint`.

## Tools

Every tool answers `structuredContent` (typed by its output schema) plus a short text
summary; ids are opaque strings, times are ISO 8601 UTC, and deadlines carry the IANA
zone they were set in (`dueAt` + `dueTz`). A refusal is a tool result with `isError: true`
whose text starts with the Result code (`task/unknown: No task with id …`) and whose
`structuredContent` is `{ error: { code, message } }`, never a JSON-RPC error, so the
assistant can read it and try again. The server runs every tool against the user's Durable
Object: a read first derives the system events due by now (this week's homework instances,
automatic `cancelled_missed` / `skipped` outcomes), so the answer is the same the web app
shows.

| Tool | Scope | What it does | Key inputs |
|---|---|---|---|
| `whoami` | read | the account behind the token, its scopes, the server time | — |
| `list_now` | read | the Now list (score order) with lateness and progress, the waiting tasks, `laterCount`, `inboxCount` | `projectId?` |
| `get_task` | read | one task with subtasks, closure and derived outcome, window elapsed, work left, the "why it is here" explanation, the submit preview | `id` |
| `list_projects` | read | projects (active first) with the project page's open count and links | — |
| `list_project_tasks` | read | the project page: open, awaiting assignment, done with outcomes, stats | `projectId` or `projectName` |
| `list_presets` | read | built-in and user presets, each with its own definition and the resolved settings | — |
| `list_inbox` | read | unsorted captures with a rule-based suggestion each | — |
| `list_review` | read | the "to sort" block: finished-looking tasks, passed deadlines, stale inbox items, automatic outcomes to confirm, with their action keys | — |
| `search` | read | full-text over titles, descriptions, source texts, subtask labels and project names → `{ results: [{ id, title, url }] }` | `query` |
| `fetch` | read | the task or project document → `{ id, title, text, url, metadata }` | `id` |
| `search_decisions` | read | the decision log, newest first: notifications sent or held back and LLM parses, each with `rule`, `inputs`, `outcome`, `explanation` | `taskId?`, `from?`, `to?`, `q?`, `limit?` |
| `create_task` | write | a task; project by id or name (created on the fly); subtasks as labels or `{ label, number }`; `dueTz` defaults to the account zone | `title`, `presetId?` (default `personal`), `projectId?`/`projectName?`, `importance?`, `dueAt?`, `dueTz?`, `startAt?`, `startTz?`, `estimateMinutes?`, `subtasks?`, `description?`, `sourceText?` |
| `capture_inbox` | write | a verbatim text into the inbox (`inbox/empty` for blank text) | `text` |
| `mark_subtasks` | write | marks subtasks solved by id or problem number (solved ≠ submitted); already solved ones are reported, not repeated | `taskId`, `subtaskIds?` or `numbers?` |
| `submit` | write | what the task screen's Submit does: per-subtask presets send the solved, unsubmitted problems (or the ones named) and close with the last of them; whole-submission presets submit and close as done | `taskId`, `subtaskIds?` |
| `close_task` | write | closes with `done` (`done_late` is derived), `cancelled` or `skipped` (+ reason) | `taskId`, `outcome`, `reason?` |
| `reopen` | write | reopens a closed task, subtasks and history kept | `taskId` |
| `update_task` | write | only the fields given: title, description (`null` clears), deadline, start, estimate (`null` clears), preset, project (by id or name) | `taskId`, `title?`, `description?`, `dueAt?`, `dueTz?`, `startAt?`, `startTz?`, `estimateMinutes?`, `presetId?`, `projectId?`/`projectName?` |
| `set_importance` | write | `asap` / `prioritized` / `normal` / `nice_to_have` | `taskId`, `importance` |
| `set_status` | write | `in_progress` / `paused` / `waiting` / `not_started` | `taskId`, `status` |
| `set_rank` | write | moves a task to a 1-based position in its importance category and renumbers the category (`rank/not-competing` for closed, inbox and empty tasks) | `taskId`, `position` |
| `add_subtasks` | write | appends subtasks and answers their ids | `taskId`, `labels` (labels or `{ label, number }`) |
| `revoke_event` | write | undoes one event by id (the log keeps it); revoking a revocation restores the original | `eventId`, `reason?` |
| `review_action` | write | runs a review item's action (`submit-now`, `mark-done`, `cancel`, `skip`, `keep-open`, `sort`, `confirm`, `undo`; `review/no-item`, `review/no-action` otherwise) | `taskId`, `key` |
| `seed_example_presets` | write | the three example course presets, skipping existing ones | — |
| `create_preset` | write | a user preset extending a built-in or another user preset, validated like the web editor (`preset/exists`, `preset/unknown-parent`, `preset/invalid-definition`, …) | `id`, `name`, `extends`, `definition` |
| `update_preset` | write | a user preset's name, parent or definition (a definition replaces the stored one); built-ins are refused | `id`, `name?`, `extends?`, `definition?` |
| `archive_preset` | write | archives a user preset; its tasks keep working (`preset/built-in` for built-ins) | `id` |

### Writes: `at`, `precision`, `dryRun`

Every mutating tool takes three optional inputs on top of its own:

- `at` — the ISO instant the event happened; defaults to the server time. A past instant
  records something retroactively ("I solved 3 and 4 an hour ago"); the core retro rules
  refuse what makes no sense (`retro/before-created`, `retro/task-closed`, `retro/future`
  beyond five minutes of clock skew).
- `precision` — `exact` (default) or `approx` when `at` is an estimate.
- `dryRun` — `true` validates the call, builds the events and answers the preview
  (`events`, the resulting task row) **without writing anything**; the summary starts with
  "Dry run: nothing was written." The assistant is the confirmer: it can show the preview
  and call again without `dryRun` once the person agrees.

Every write answers `{ dryRun, events: [{ id, type, occurredAt }], … }`; the event ids are
what `revoke_event` takes to undo. A write about a task or preset that does not exist is
refused first (`task/unknown`, `preset/unknown`), and a write without the `tasks:write`
scope never reaches the store. Events written through MCP carry `source: "mcp"` and
`deviceId: "mcp"`, and clients pull them through `/api/sync/pull` like any other.

### ChatGPT connectors

ChatGPT requires exactly two tools to use a connector in chat and deep research: `search`
(`{ results: [{ id, title, url }] }`) and `fetch` (`{ id, title, text, url, metadata }`).
Both are present with those shapes; `url` points at the web app (`/task/<id>`,
`/projects/<id>`). The other tools are reachable from ChatGPT's developer mode and from
Claude, Cursor and the Inspector as usual.

### Prompts that work

- "What should I do now?" → `list_now`.
- "Add homework 3, 4 and 7 for Algebra due Thursday evening" → `create_task` with
  `presetId: "hw.algebra"` (or `projectName: "Algebra"`), `subtasks: ["3", "4", "7"]`,
  `dueAt` + `dueTz`.
- "I solved 3 and 4 an hour ago" → `mark_subtasks` with `numbers: [3, 4]` and `at`.
- "Send them" → `submit`; "mark the report done" → `close_task` or `submit`.
- "Why is the dashboard task on top?" → `get_task` (`explanation`).
- "Undo that" → `revoke_event` with the id from the previous answer.
- "Anything to sort out?" → `list_review`, then `review_action`.
- "Save this for later: …" → `capture_inbox`.

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
apps/api/src/mcp/server.ts          TOOLS, createMcpServer(ctx), mcpHandler (whitelist, stateless transport, the user's DO)
apps/api/src/mcp/registry.ts        defineTool({ name, title, description, scope, annotations, input, output, handler }), ToolContext
apps/api/src/mcp/grant.ts           McpGrant from ctx.props + ctx.auth (zod-checked)
apps/api/src/mcp/tool-kit.ts        runRead / runWrite (read → build → apply or dryRun → render), withTarget, stamp, failure codes
apps/api/src/mcp/inputs.ts          shared input schemas (at/precision/dryRun, subtasks, project by id or name), forTask
apps/api/src/mcp/rows.ts            TaskRow / ProjectRow schemas rendered from core's query results, renderTask, URLs
apps/api/src/mcp/tools/*.ts         the tools: list-tools, get-task, search-tools, task-tools, edit-tools,
                                    progress-tools, correction-tools, preset-tools, whoami
apps/api/src/user-store/state.ts    the DO's materialized CoreState cache (by seq), in-order vs rebuild, batch validation (prepareBatch)
apps/api/src/user-store/projections.ts  tasks / subtasks / projects / presets SQL rows (touched rows, or all after a rebuild)
apps/api/src/shared/contract.ts     the DO ↔ Worker types (RpcState, ApplyMeta, ApplyError, UserStoreApi)
packages/core/src/api/schemas/oauth.ts  OAUTH_SCOPES, requestedScopes, grantedScopes, the consent contract
apps/web/src/features/oauth/        the consent page
```

Adding a tool: `defineTool` in `apps/api/src/mcp/tools/<group>.ts` (a read tool wraps
`runRead`, a write tool `runWrite` with a `build` that turns the arguments into event
inputs against the current state, `forTask(taskId, …)` when it is about one task, and a
`render` for the answer), add it to `TOOLS` in `server.ts` and to the contract fixtures in
`tests/mcp-tools.int.test.ts`, and the scope check, annotations, typed input, `dryRun` and
the error convention come for free. Renderers read core's queries (`nowItem`, `taskView`,
`projectView`, `inboxList`, `reviewItems`) rather than recomputing them. The Durable Object
does the writing: `UserStore.apply(inputs, { source, deviceId, now })` derives what is due,
validates the batch with core's `validateEventInput` in order (the first refusal stops
everything), stamps ids, `recordedAt` and the device, appends, derives again and returns
the stored events with the new state; `UserStore.dryRun` does the same without writing.

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
Telegram id is not allowed), `apps/api/tests/mcp-tools.int.test.ts` (every tool through the
endpoint: create → pull → list_now, project on the fly, inbox, mark + submit closes,
retroactive `at`/`precision`, search/fetch with a Cyrillic query, review, presets; and a
contract over **every** write tool: `dryRun` writes nothing, a read-only grant is refused
before the store, each refusal is an `isError` result starting with its Result code) and
`apps/api/tests/projections.int.test.ts` (SQL rows, revoke, a preset change rewriting task
rows, rebuild on an earlier `occurredAt`, derived instances and automatic outcomes after a
sync push, before and after `apply`, `apply` / `dryRun`); `apps/api/src/mcp/registry.test.ts` covers
the scope guard with an in-memory client. `bun test:api` runs them.

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
