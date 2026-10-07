# Architecture

## Layers

```
apps/app (Expo) ─┐
apps/web (Vite) ─┼─► packages/client ─► packages/core
apps/api (Worker)┴──────────────────► packages/core
```

| Layer | Package | Holds | May import |
|---|---|---|---|
| core | `@pace/core` | pure, immutable TypeScript: event schemas, sorting, materializer, reducers, settings, i18n, design tokens, time helpers, `Result`, the zod API contract | its npm deps only (zod, ulidx, date-fns) |
| client | `@pace/client` | the typed API client (`createApiClient`, `ApiError`), auth flows (`createAuth`), the local-first event store and app state (`createAppState`: the four core slices `tasks`/`projects`/`presets`/`settings` folded by the core reducers, the effective `events`, the raw `log` with corrections, and `version`), the actions (`createActions`: every user intent validated by the core's retro rules, appended with the client's envelope, answered as `Result<Event[], ActionError>`), the pure view-models (`view-models/*`: Now rows with typed meta parts, task, project, inbox, review, history over `AppState` + `QueryContext`), the `Clock` (`systemClock`, `quickTimes`), the outbox/sync loop (`createSyncClient`) and `createPaceClient`, which wires them the one way both shells use; the `EventStore`/`SessionStore` ports with memory adapters; `@pace/client/react` adds `createAppHooks` (store selectors plus `useClock`/`useNow`/`useTaskView`/`useProjectView`/`useInbox`/`useReview`/`useHistory`, memoized on the store version and a 30 s tick) and re-exports zustand's `useStore`; `@pace/client/testing` is the fake `fetch` for every test suite, `@pace/core/testing` the artboard fixtures | core |
| api | `@pace/api` | the Cloudflare Worker: Hono app, auth, bot, sync routes, the `UserStore` Durable Object, D1 schema | core |
| web | `@pace/web` | React SPA (Vite, Tailwind v4, PWA), deployed as the `pace-web` assets Worker | client, core |
| app | `@pace/app` | Expo / React Native (expo-router, NativeWind) | client, core |

dependency-cruiser (`.dependency-cruiser.mjs`) fails `bun lint` when a dependency crosses
a boundary: core imports no workspace, client never imports an app or the API, the UIs
never import the API (the contract is in core), apps never import each other, API feature
folders (`auth/`, `bot/`, `sync/`, `user-store/`) only reach each other through
`src/shared/` or by composition in `app.ts`. `packages/core/src/**` and
`packages/client/src/view-models/**` additionally run eslint-plugin-functional: no `let`,
no mutation, no classes, no `throw`.

## The event model

Everything the user does is an append-only event. State is never stored as the truth on
the client; it is **materialized** from the log.

### Envelope

`packages/core/src/events/event-schema.ts` (zod discriminated union on `type`):

| Field | Type | Meaning |
|---|---|---|
| `id` | ULID, or a deterministic system id | unique; ULIDs sort by creation time |
| `type` | one of `EVENT_TYPES` | `task.created`, `task.closed`, `project.created`, `preset.updated`, `settings.updated`, `focus.started`, `event.amended`, … |
| `occurredAt` | UTC ISO instant | when it happened — editable by the user (retro entries) |
| `recordedAt` | UTC ISO instant | when the device recorded it — system time, never edited |
| `deviceId` | string | which client wrote it |
| `precision` | `exact` \| `approx` | how sure the user was about `occurredAt` |
| `source` | `app` \| `web` \| `bot` \| `mcp` \| `system` | which channel produced it |
| `payload` | per-type zod object (`payloads.ts`) | e.g. `{ taskId, title, presetId, dueAt?, dueTz?, subtasks[] }` |

Instants are UTC strings so string order equals time order. Every absolute time a person
sets carries the IANA zone it was set in (`dueAt` + `dueTz`, `startAt` + `startTz`);
`parseEvent(raw)` returns `Result<Event, string>` and is the only way in.

`EventInput` is what a caller dispatches: the store fills `id`, `recordedAt` and
`deviceId`.

### Corrections

Events are never edited or deleted. Two correction events do the job:

- `event.amended { targetId, patch }` — shallow-merges `patch` into the target's payload.
  An amendment that would make the target invalid is ignored.
- `event.revoked { targetId, reason? }` — removes the target from the effective log.

Corrections are themselves revocable (revoking a revocation restores the original; a
cycle counts as inactive) and apply regardless of their own `occurredAt`. `effectiveEvents`
in `materializer.ts` implements this; corrections never appear in its output.

### Deterministic ids

`ids.ts`: `newId()` is a monotonic ULID factory (shared per process, because the Workers
clock is frozen within a request). System-generated events use deterministic ids so that
every device and the server produce the same event once:

- `instanceId(presetId, isoWeek)` → `hw:<presetId>:<isoWeek>` (recurring homework)
- `autoOutcomeId(taskId, kind)` → `auto:<taskId>:missed|skipped` (automatic outcomes)

`EventIdSchema` accepts a ULID or `^(?:hw|auto):[^\s:]+:[^\s:]+$`; the log stores an id
once (`INSERT … ON CONFLICT DO NOTHING`), so a second copy is a no-op.

### Materialization rules

`packages/core/src/materialize/materializer.ts`:

- `sortEvents`: canonical order is `occurredAt`, then `id`.
- `materialize(events, reducer, initial)`: full rebuild — apply corrections, sort, fold.
- `materializeAt(events, atIso, …)`: the board at a past date — only events with
  `occurredAt ≤ atIso`, but **every** correction applies.
- `apply(state, event, reducer)`: the incremental path for an event that arrives in
  order; a correction is a no-op here (it needs a rebuild).
- `shouldRematerialize(lastAppliedOccurredAt, incoming)`: true when `incoming` is a
  correction or occurred before the last applied event. Clients and the server use the
  same rule: rebuild only when a retro edit makes it necessary.

Reducers are `(state, event) => state` and pure. `settings-reducer.ts` is the first one
(`settings.updated` patches `language`, `timezone`, `digestWindows`, `quietHours` on top
of `DEFAULT_SETTINGS`); the task, project and preset reducers come in stage 1.

High-volume phone facts (app usage, calendar entries, sleep candidates) are **not**
events. They are *observations* (`kind`, `key`, `at`, `payload`), stored once per
`kind+key`; only derived decisions become events.

## API contract

One description of every endpoint, shared by the Worker and the clients:

```
packages/core/src/api/endpoint.ts      endpoint() helper, EndpointShape, EndpointInput/Output, buildPath
packages/core/src/api/endpoints.ts     the contract: endpoints.{health, me, auth.*, sync.*}
packages/core/src/api/schemas/*.ts     zod bodies, params, queries, outputs
apps/api/src/shared/mount.ts           mount(app, endpoint, handler) for Hono
packages/client/src/api-client.ts      createApiClient({ baseUrl, token, fetch? }).call(endpoint, input)
```

An endpoint declares `method`, `path` (Hono `:param` syntax), `auth`, optional `params`,
`query`, `body` schemas and the `output` schema. `mount()` adds the bearer guard when
`auth` is true, validates each declared part (422 `validation` on mismatch, with the
offending path in the message) and serialises the handler's `Result<Output, Problem>`:
`ok` → JSON 200, `err` → `{ code, message }` with the problem's status. The client builds
the URL from the same definition, sends the bearer, throws `ApiError { status, code }` on
non-2xx and parses the response with the `output` schema — so a server change that
breaks the contract fails at the client boundary, not deep in the UI.

Every error body has the shape `{ code, message }`: `not-found` (404), `validation`
(422), `internal` (500, never a stack or SQL), `auth/unauthorized` (401),
`auth/not-allowed` (403), `auth/not-configured` (503), `auth/invalid-hash`,
`auth/expired` (401), `auth/nonce-not-found` (404), `bot/not-configured` (503).

The Worker reads bindings per request (`c.env`), never at module scope, so tests and
`wrangler dev` can supply different ones. `src/shared/config.ts` validates vars and
secrets with zod once per request and stores the result on the context.

## Auth and sessions

- **Identity** is a Telegram user id; `ALLOWED_TELEGRAM_IDS` (wrangler var) is the
  whitelist. `auth/whitelist.ts` is checked before any user row is created.
- **Web**: `POST /api/auth/telegram` with the Login Widget payload.
  `auth/telegram-widget.ts` builds the sorted `key=value\n` check string, derives the key
  as SHA-256 of the bot token, verifies HMAC-SHA-256 with a constant-time compare and
  rejects `auth_date` older than five minutes.
- **Android**: `POST /api/auth/nonce` → `{ nonce, deepLink }` (24 random bytes,
  base64url, 5-minute TTL, stored in D1 `login_nonces`). The bot's `/start login_<nonce>`
  handler upserts the Telegram user and binds the nonce (`bot-login.ts`; a nonce binds
  once). `GET /api/auth/nonce/:nonce` answers `pending` until then, then `ready` with a
  session exactly once (the row is marked consumed).
- **Sessions** (`auth/sessions.ts`): 32 random bytes as the bearer token, SHA-256 in D1
  `sessions` with a label (`web`, `android`, `dev`), 90-day expiry, `lastSeenAt` touched at
  most hourly. `requireAuth` middleware resolves the bearer to `CurrentUser`; handlers
  read it with `requireUser(c)`.
- **Dev login** `POST /api/auth/dev { telegramId }` is a 404 in `production`.

D1 tables (`src/shared/db/d1-schema.ts`): `users`, `sessions`, `login_nonces`. They are
global; everything per user lives in the Durable Object.

## Sync protocol

Clients keep their own log and an outbox; the server keeps the authoritative sequence.

| Call | Request | Response | Rules |
|---|---|---|---|
| `POST /api/sync/push` | `{ events: Event[] }` (≤ 500) | `{ accepted: id[], rejected: { id, reason }[], seq }` | each envelope is validated with the core schema (`user-store/event-log.ts`); a rejected one is reported and the rest still goes in; a known id is accepted again without a second copy; a `recordedAt` after the server clock is clamped to it |
| `GET /api/sync/pull?since=&limit=` | cursor `since` (default 0), `limit` 1–500 (default 200) | `{ events, seq, more }` | events after `since` in **sequence** order; `seq` is the cursor for the next call; `more` says whether to call again |
| `POST /api/sync/observations` | `{ observations }` (≤ 1000) | `{ accepted: n }` | append-only, idempotent by `kind+key` |

The transport validates only the envelope (`SyncEventSchema`); the per-type payload is
checked by the Durable Object. `seq` is a server-assigned integer, so a client that
pulls from its last `seq` gets exactly what it missed, in any order of `occurredAt`; the
materialization rule above decides whether an incremental apply is enough.

## Durable Object per user

`apps/api/src/user-store/user-store.ts`: `class UserStore extends DurableObject`, one
instance per user (`USER_STORE.idFromName(user.id)`). Storage is the DO's SQLite through
drizzle (`drizzle-orm/durable-sqlite`); migrations (`drizzle/do`, bundled as
`migrations.js`) run in the constructor inside `blockConcurrencyWhile`, so no request
sees a half-migrated store. Tables (`user-store/schema.ts`): `events` (`seq` primary key,
`id` unique, indexed by `occurredAt`), `observations`, `decisions` (every automatic
decision with its inputs, for "why?"), `meta` (cursors, budgets) and the projections
`tasks`, `subtasks`, `projects`, `presets` (the materialized state as SQL rows for SQL
readers; never the source of truth).

The object keeps core's `CoreState` materialized in memory (`user-store/state.ts`), tagged
with the log `seq` it was built at; a cache behind the log is rebuilt. A batch that is in
order (nothing before the last applied `occurredAt`, no correction: core's
`shouldRematerialize`) is folded incrementally and only the rows it touched are rewritten
(a preset change rewrites every task row, since it moves their derived columns); anything
else rebuilds the state and every projection row (`user-store/projections.ts`). After every
append (a client's sync push, an `apply`) and before every read and every `apply`,
`derive(now)` appends the system events the state calls for: this week's homework instances and the automatic
`cancelled_missed` / `skipped` outcomes, with deterministic ids, so they are idempotent
against clients that derived the same events.

Methods: `append` and `list` (sync), `appendObservations`, `find(id)`, `read(now)`,
`apply(inputs, { source, deviceId, now })` (derives, then validates the batch in order with
core's `validateEventInput`, the first refusal stops it and none of it is written; stamps
ids, `recordedAt` and the device; returns the stored events and the new state), `dryRun`
(the same without any write, derivation included), `derive(now)`, `countEvents`. The MCP tools (and the bot from stage
2) reach it through `UserStoreApi` in `shared/contract.ts`; alarms (digests) join in stage
2, so heavy recomputes never cross a network boundary.

## How to add an endpoint

1. **Schemas** — add the body/query/params/output zod objects to
   `packages/core/src/api/schemas/<area>.ts` (new file for a new area).
2. **Contract** — add the entry to `endpoints` in `packages/core/src/api/endpoints.ts`
   under `/api/...` with `auth` set; extend `endpoints.test.ts` (paths unique and under
   `/api`, protected vs public). Export new schemas and types from `src/core.ts`.
3. **Handler** — in `apps/api/src/<feature>/<feature>-routes.ts` write a
   `Handler<typeof endpoints.x.y>` returning `ok(value)` or `err({ status, code, message })`
   and register it with `mount(app, endpoints.x.y, handler)`; call the mount function
   from `createApp` in `app.ts`. Error codes are string literals handled by an exhaustive
   `switch` (no `default`).
4. **Test** — a file in `apps/api/tests/*.int.test.ts` through `call()` / `loginAsDev()`
   from `tests/helpers.ts`: happy path, validation (422), auth (401/403).
5. **Call it** — `client.call(endpoints.x.y, { body, params, query })` from
   `@pace/client`; the input and output types follow from the contract.

## How to add an event type

1. **Payload** — a zod object in `packages/core/src/events/payloads.ts` (reuse
   `InstantSchema`, `TimeZoneSchema` and the `zonePaired` refinement for zoned times).
2. **Type** — append the name to `EVENT_TYPES` and an `event("…", Payload)` entry to
   `EventSchema` in `event-schema.ts`. Round-trip it in `event-schema.test.ts`.
3. **Reducer** — handle it in the reducer that owns the state (pure; unknown types leave
   the state untouched). Property-test order-insensitivity when the reducer is not
   trivially commutative.
4. **System events** — if the system emits it, give it a deterministic id in `ids.ts`
   so every device produces the same one.
5. Nothing changes on the server: the Durable Object validates with `parseEvent` from
   core, so the new type is accepted as soon as the package is rebuilt. If the UI shows
   it, add the strings to `i18n/en.ts` **and** `ru.ts` (a test asserts the same keys).
