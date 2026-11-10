# Architecture

## Layers

```
apps/app (Expo: Android + web) ─► packages/client ─► packages/core
apps/api (Worker) ───────────────────────────────► packages/core
```

| Layer | Package | Holds | May import |
|---|---|---|---|
| core | `@pace/core` | pure, immutable TypeScript: event schemas, sorting, materializer, reducers, settings, i18n, design tokens, time helpers, `Result`, the zod API contract | its npm deps only (zod, ulidx, date-fns) |
| client | `@pace/client` | the typed API client (`createApiClient`, `ApiError`), auth flows (`createAuth`), the local-first event store and app state (`createAppState`: the four core slices `tasks`/`projects`/`presets`/`settings` folded by the core reducers, the effective `events`, the raw `log` with corrections, and `version`), the actions (`createActions`: every user intent validated by the core's retro rules, appended with the client's envelope, answered as `Result<Event[], ActionError>`), the pure view-models (`view-models/*`: Now rows with typed meta parts, task, project, inbox, review, history over `AppState` + `QueryContext`), the `Clock` (`systemClock`, `quickTimes`), the outbox/sync loop (`createSyncClient`, over the live socket or HTTP through `sync-transport.ts`) and `createPaceClient`, which wires them the one way both shells use; the `EventStore`/`SessionStore` ports with memory adapters; `@pace/client/react` adds `createAppHooks` (store selectors plus `useClock`/`useNow`/`useTaskView`/`useProjectView`/`useInbox`/`useReview`/`useHistory`, memoized on the store version and a 30 s tick) and re-exports zustand's `useStore`; `@pace/client/testing` is the fake `fetch` for every test suite, `@pace/core/testing` the artboard fixtures | core |
| api | `@pace/api` | the Cloudflare Worker: Hono app, auth, bot, sync routes, the `UserStore` Durable Object, D1 schema | core |
| app | `@pace/app` | the one UI: Expo / React Native (expo-router, NativeWind) on Android, and the same screens on the web through react-native-web (a PWA served by the `pace-web` assets Worker) | client, core |

### One UI on two platforms

`apps/app` builds for Android (`expo run:android`, the release APK) and for the web
(`bun run build`: `expo export --platform web`, then a Workbox service worker). The web
build differs in four ways, all through `metro.config.js`:

- **Stand-ins** for phone-only modules (`expo-notifications`, `expo-calendar`,
  `expo-task-manager`, `expo-background-task`, `expo-secure-store`, `expo-share-intent`) live in
  `src/platform/web/`; phone features check `IS_PHONE` (`src/platform/device.ts`) before they
  show.
- **`.web.tsx` siblings**: when `x.web.ts(x)` exists next to `x.ts(x)`, the web build uses it
  (the IndexedDB event store, the Telegram Login Widget, the OAuth consent page, the Excel
  export, the update banner). A `.web` file never imports its own base file.
- **The server**: the phone talks to the server the person chose (`src/platform/server.ts`,
  Change server on the login screen; the build's `EXPO_PUBLIC_API_URL` by default). The web
  build always talks to its own deployment (`server.web.ts`): the API's CORS admits only its
  `WEB_ORIGIN`. Whatever needs the server's API, web app or bot reads `useServerInfo()` (UI) or
  `readServer()` (background), never the build constants in `api-base.ts`.
- **Layout**: from 1024 px the tabs become a sidebar and Now shows the picked task beside the
  list (`src/ui/layout.ts`, `src/screens/now-screen.tsx`).

The service worker precaches the build and waits; the update strip offers "Refresh page",
which hands control to the new worker. The phone tabs are Now, Day, Inbox and More (which
opens Week and the other destinations). On a wide screen the sidebar lists Now, Day, Week,
Inbox, Projects, Insights and Settings (devices and sessions live inside Settings).

dependency-cruiser (`.dependency-cruiser.mjs`) fails `bun lint` when a dependency crosses
a boundary: core imports no workspace, client never imports an app or the API, the UIs
never import the API (the contract is in core), app feature folders only reach each other
through `src/shared/` or by composition in `src/screens/`, API feature
folders (`auth/`, `bot/`, `sync/`, `user-store/`) only reach each other through
`src/shared/` or by composition in `app.ts`. `packages/core/src/**` and
`packages/client/src/view-models/**` additionally run eslint-plugin-functional: no `let`,
no mutation, no classes, no `throw`.

## Infrastructure ports and adapters

API domain modules consume contracts in `shared/ports`. Cloudflare composition lives in
`platform/cloudflare` and `worker.ts`; raw bindings and driver construction do not cross into
routes, notifications, sync or the user-store service.

| Contract | Responsibility | Cloudflare adapter |
| --- | --- | --- |
| SQLite database | Existing typed SQLite queries; shared database batches commit atomically | `sqlite.ts` (D1), `actor-storage.ts` (DO SQLite and migrations) |
| ActorStorage / ActorValues | Actor-owned SQLite transactions and durable values | `actor-storage.ts` |
| Scheduler | Persistent get/set/delete alarm, preserving earliest-wakeup policy | `actor-storage.ts` |
| ActorContext / LiveChannel | Session-tagged sockets, upgrades, keepalive and actor initialization | `live-channel.ts` |
| UserStoreHost | Resolve a person's existing typed RPC service | `bindings.ts`, hosted `user-store.ts` |
| KeyValue / OAuth | Grant storage and provider operations | `key-value.ts`, `oauth.ts` |
| RequestPlaceReader | Trusted request provenance | `request-place.ts` |

The domain UserStore keeps its current service composition. The Cloudflare Durable Object wraps
that service and forwards its explicit RPC surface. Each actor serializes top-level calls through
its own queue, including external awaits; internal service calls do not re-enter it. A slow external
operation can therefore delay that user's next call, while another user's actor remains independent.
The adapter owns DO inheritance, migration execution, WebSocket pairs and hibernating keepalive.

The database contract deliberately targets SQLite, not arbitrary SQL dialects. No second runtime
or production migration is implemented here. The web assets binding already lives exclusively in
`apps/app/worker.ts`, the web deployment's composition entry; API domain code does not consume it,
so no unused API Assets abstraction or cross-app import is introduced.

ESLint AST checks reject Cloudflare ambient types and request metadata outside composition;
dependency-cruiser rejects domain imports of platform modules. Tests exercise the actual workerd
adapters, atomic batch rollback, repeated migrations, persisted/earliest/past alarms, actor RPC
serialization across an await, other-user progress, and the existing session-scoped socket tests.
See [the execution plan](../context/technical-execution/tasks-8-9-plan.md).

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
- `seriesInstanceId(seriesId, revisionKey, n)` → `rep:<series>:<revision>:<n>` (a task series's
  n-th instance; `n` counts from the series' `template.startAt`, which `seriesAnchor` sets to the
  start the person chose or else to 00:00 of the day the series was made, so later instances start
  at the person's time of day or at the start of their day, never at the minute of creation)
- `autoOutcomeId(taskId, kind)` → `auto:<taskId>:skipped` (automatic outcomes; `:missed` is the
  automatic `cancelled_missed` of old logs, no longer made since feedback 5)
- automatic sleep: `auto:sleep-<night>:start-<yyyyMMddTHHmm>` (the start and its activity),
  `auto:sleep-stop-<digest of the activity id>-<yyyyMMddTHHmm>`, and `auto:<stop id>:reopen` /
  `auto:<start id>:discard` for the revocations; a `-2`, `-3`… suffix where the first is used

`EventIdSchema` accepts a ULID or `^(?:hw|auto|rep):\S+$`; the log stores an id once
(`INSERT … ON CONFLICT DO NOTHING`), so a second copy is a no-op. The sync carries ids of at
most `EVENT_ID_MAX` (128) characters: one built longer stays on the server and a client's pull
leaves it out. Follow-ups nest the id they follow (`auto:<instance>:missed` of an edited series's
`rep:<series>:<revision>:<n>` is over 70, a sleep's reopen and discard nest its stop and start),
so `ids.test.ts` checks every builder at its longest against the limit; the sleep stop names its
activity by a digest instead, since an activity id may be as long as any id.

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
(`settings.updated` patches `language`, `timezone`, `digestWindows`, `quietHours` and, per kind,
the `notificationChannels` switches on top
of `DEFAULT_SETTINGS`); the task, project and preset reducers come in stage 1.

A full rebuild costs time linear in the log (bug-lessons class 55): `materialize` and
`materializeAt` fold as one batch (`materialize/transient.ts`), in which a reducer's map writes
(`assoc`, `putById`) copy a map once and then write that copy in place, and a subset of a map is
read through a kept index (`keysWhere`), never by scanning the map per event. Outside a batch
(the incremental `apply`) the same calls copy. After a rebuild the maps it made are frozen (a batch
nested in another freezes the outer one's maps first, see `inBatch`); on the incremental path every
change makes new objects, immutable by type and lint, and leaves the frozen ones alone.
`materialize-cost.test.ts` holds the budget. The client merges an action's events into its sorted
`events` and `log` with `mergeEvents` (a binary search and a copy) instead of sorting them again;
`state-cost.test.ts` holds that per-action budget.

High-volume phone facts (the calendar copy, app usage) are **not** events. They have
their own tables in the Durable Object (`calendar_events`, `usage_sessions`, and `phone_uses`:
when a phone was really in use, which automatic sleep reads instead of its app sessions),
replaced or added per device through the cloud routes; only derived decisions become events.
A phone sends its calendar copy with every background run, mostly unchanged, so the store writes
only the rows that differ and the pool looks again only when a row or the ruled series changed.
A change is marked (`calendar:unplanned`) before its rows go in and unmarked once the pool has
looked at it, so a copy cut short in between is looked at with the next upload.
Each usage upload also records how far that device's usage is known (storage key
`usage:known:<deviceId>`: the phone's `until`, or the arrival of a computer's upload).

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
- **Android** (and the web through the bot): `POST /api/auth/nonce?from=app|web` → `{ nonce,
  deepLink }` (24 random bytes, base64url, 5-minute TTL, stored in D1 `login_nonces`; each mint
  clears the expired rows, and the stored User-Agent is capped at 512 characters). The app
  sends an optional strict body `{ deviceName, deviceId }` (its phone model and install id); the
  web sends none. The nonce row keeps `from`, that request's place and the named device, so the
  session it opens is named and placed by the request that started the login, not by the poll.
  The bot's `/start login_<nonce>` handler checks the nonce can still be bound, replies
  "Logged in. Return to Pace.", then upserts the Telegram user and binds the nonce together with
  that reply's `replyChatId`/`replyMessageId` (`bot-login.ts`; one conditional UPDATE, so a nonce
  binds once; a bind that loses edits the reply to "expired"). `GET /api/auth/nonce/:nonce`
  answers `pending` until then, then `ready` with a session exactly once: the claim is one
  conditional UPDATE (bound, unconsumed, unexpired → consumed), and the session insert and the
  nonce's `sessionId` go in one batch.
- **Sign-in notices**: every new `browser`, `app` or `dev` session (not agents or MCP grants)
  calls the user store's `notify({ kind: "login", … })`. The text leads with what Cloudflare
  reported (IP, country named in the account language, city), then the client's name, as plain
  text; parts not reported are left out. A deep-link login passes `adoptTelegramMessage` (the
  bot's reply), so the pool edits that reply into the notice with [Return to Pace] [Not me]
  instead of sending a second message. "Not me" is the `login` kind's pool answer `revoked`
  (`nr:<id>` in Telegram, a phone action, the feed): `pool-answers.ts` ends the session through
  `deleteSession` before the notification resolves; a second press changes nothing.
- **Sessions** (`auth/sessions.ts`): 32 random bytes as the bearer token, SHA-256 in D1
  `sessions`, 90-day expiry, `lastSeenAt` touched at most hourly. Each has a `kind` (`browser`:
  the widget or a bot login from the web; `app`: a bot login from the app; `agent`: a computer's
  `usage:write` token made in Settings; `dev`), a readable `name` ("Chrome on macOS" from the
  User-Agent by `auth/user-agent.ts`, the phone's model, the computer's typed name, "Dev login")
  and where it signed in from (`ip` from `CF-Connecting-IP`, `country`/`city` from `request.cf`,
  `userAgent`; `shared/request-place.ts`). A phone's session carries its `deviceId`; a
  `usage:write` session files its uploads under `deviceId ?? sessionId`. `shared/session-rows.ts`
  `deleteSession` is the one revoke by id. `requireAuth` middleware resolves the bearer to
  `CurrentUser`; handlers read it with `requireUser(c)`.
- **Schema changes ship expand, then contract.** `deploy.yml` applies the D1 migrations before the
  new Worker serves, and `wrangler rollback` runs the previous Worker on the new schema, so no
  migration drops or renames a column the previous release still reads or writes. The column goes in
  a later release, once a release has served without it. Open follow-up
  (`TODO(sessions-label-contract)`): `sessions.label`, replaced by `kind` and `name` in 0008, is
  still written (`legacyLabelOf`) and never read; the next release's migration first backfills
  `kind`/`name` again for rows the previous Worker inserted during the deploy window (`name = ''`),
  then drops `label`, and `legacyLabelOf` goes.
- **A Durable Object class added or removed is a rollback barrier.** Cloudflare refuses
  `wrangler rollback` across a release that changes the DO classes (the `migrations` in
  `apps/api/wrangler.jsonc`), and a plain revert that drops a class does not deploy (removing one
  needs a `deleted_classes` migration). The release that added `LlmHealth` (migration `v2`, PR #48)
  is such a barrier: no release from it on can be rolled back past it. A backout after it is a
  forward deploy that keeps `export { LlmHealth }` and migration `v2`; to undo the health logic, keep
  the class and stop calling it. Ship a new DO class alone in a small release first when the release
  around it should stay rollback-able. The orphaned `llm:health` key in `OAUTH_KV` (the memory before
  the DO) expires within a day.
- **Dev login** `POST /api/auth/dev { telegramId }` is a 404 in `production`.
- **Which server**: the app stores its token with the origin of the server that issued it
  (`pace.session` = `{ origin, token }`); a store for another server reads it as signed out, and
  switching servers deletes it and the local log, so a token never reaches another server. On
  start and on each sign-in and sign-out the app reads `GET /api/instance` (public) and checks the
  protocols (`compatibility` in core). A server too old for the app (or one without the route), or
  a `426 client/outdated` on any call, holds a signed-in app at "Server and app versions don't
  match" with only Log out, and refuses a sign-in on the login screen. An unreachable server
  blocks nothing. See [self-hosting.md](self-hosting.md).

D1 tables (`src/shared/db/d1-schema.ts`): `users`, `sessions`, `login_nonces`,
`push_subscriptions` (each session's one push method) and `broken_push_methods`. They are
global; everything per user lives in the Durable Object.

## Sync protocol

Clients keep their own log and an outbox; the server keeps the authoritative sequence.
A local action is shown first and written after (`packages/client/src/local-log.ts`): the
state integrates the events at once, writes to the local store run one after another in the
order integrated, and a refused write takes its events back (the state rebuilt by the
materializer from the rest) and answers `persist_failed`. The outbox is the store's, so only
what landed on the disk is ever pushed.

| Call | Request | Response | Rules |
|---|---|---|---|
| `POST /api/sync/push` | `{ events: Event[] (≤ 500), storeId }` | `{ accepted: id[], rejected: { id, reason }[], seq }` | a `storeId` that is not the store's current one refuses the whole batch with `409 store/changed`; each envelope is validated with the core schema (`user-store/event-log.ts`); a rejected one is reported and the rest still goes in; a known id is accepted again without a second copy; a `recordedAt` after the server clock is clamped to it |
| `GET /api/sync/pull?since=&limit=` | cursor `since` (default 0), `limit` 1–500 (default 200) | `{ events, seq, more, storeId }` | events after `since` in **sequence** order; `seq` is the cursor for the next call; `more` says whether to call again; `storeId` names the store they came from (below) |
| `GET /api/sync/live` (WebSocket) | subprotocols `pace.v2, pace.v1, pace.auth.<token>` (`pace.v2` only when offered), `?device=<deviceId>&protocol=<n>` | v1: `{"type":"changed","seq":n}`; v2: `hello` first, then `events`; both: the notification pool's notices (`notification`, `dismiss`, `read`, `push-methods-changed`) | the user's Durable Object keeps it as a hibernating socket tagged with its subprotocol, device and session (id and expiry, set by the Worker; no duration billed while quiet; `ping` → `pong` without waking it). Revoking the session (Settings, logout, "Not me", account deletion: all through `deleteSession`) closes its sockets with code `4401` (`LIVE_SESSION_ENDED`); an expired one is closed instead of served, and the app checks its session rather than reconnecting. Whenever its log grows it tells every socket but the writing device's: v1 hears `changed`, v2 gets the new events (below). Not an `endpoint()`: an upgrade is not a JSON call. |

**`pace.v2`** (`packages/core/src/api/live-protocol.ts`) carries the sync hot path over the same
socket; everything else stays HTTP, which also stays the fallback (a closed socket, or no answer
within `LIVE_REQUEST_TIMEOUT_MS` = 10 s; a client keeps at most `LIVE_MAX_IN_FLIGHT` = 4 requests
open). It is additive: the API `PROTOCOL` stays the same and a socket offering only `pace.v1` is
served as before. Requests are strict, answers loose (an unknown `type` reads as `unknown`).

| Client sends | Server answers |
|---|---|
| `{ type: "push", id, storeId, events }` (the HTTP push body, `SyncPushBodySchema`, under a request id of 1–64 characters) | `{ type: "pushed", id, accepted, rejected, seq }` (the HTTP push answer), or `{ type: "error", id, code: "store/changed" }`; the store's same `push` runs, so a known id is accepted again without a second copy |
| `{ type: "pull", id, since, limit? }` (`limit` 1–500, default `LIVE_PAGE` = 200) | `{ type: "events", id, since, seq, storeId, events, more }`: the HTTP pull's page |
| anything else (invalid JSON, an unknown type, a bad field) | `{ type: "error", id, code: "bad-request" }` (`id` when one was readable, else empty); the socket stays open |
| — (after any append) | `{ type: "events", since, seq, storeId, events, more: false }` to every v2 socket but the writing device's, with `since` the sequence before the append; more than `LIVE_PAGE` events go as `events: []`, `more: true`, for the client to pull. The writer hears `pushed` for its batch, and `events` for the system events the server derived from it |

The client sends a local change within 0.8 s of writing it (and what is unsent when the tab
is hidden or the app goes to the background), pulls on every `changed` and on every
reconnect of the live socket (back after 1 s, 2 s, … 60 s), and polls as a safety net: every
5 minutes while the socket is up, every 30 s while it is down.

**One sync, two transports** (`packages/client/src/sync-transport.ts`). The sync client runs
one pull loop, one outbox push and one `applyPage` over a `SyncTransport` and never knows
which carries a call: `httpTransport` (the routes above) or `socketTransport` (the live
socket's `pace.v2`, whose `request` correlates answers by id, keeps at most four open and gives
up after 10 s, dropping a silent socket to reconnect). `preferSocket` picks per call: the socket
while it is open and has said `hello`, HTTP when it is closed, speaks only v1, is busy or does
not answer (`LiveUnavailable`). A push whose answer the socket lost is pushed again over HTTP;
the server keeps one copy of a known id and accepts it again, so the outbox is marked synced
once. New `events` the socket brings unasked go to `SyncClient.ingestLive`, which waits for a
run in flight and then applies the page through the same `applyPage` when it continues the
cursor of the same store; a page the log already reaches past (the writer's derived events,
which arrive before its own `pushed`) changes nothing, and anything else (a gap, `more`,
another store) asks for a run within 0.8 s.

**The store id.** Every user store has a random `storeId` (16 bytes, base64url), made when it
is created and again whenever it is wiped (account deletion, an epoch change). The pull
answers it (so does `GET /api/me`). The client keeps it next to its cursor: the first pull
of an empty cursor adopts it; a different one means the server's data was reset, so the
client drops its local log, outbox and cursor, keeps the new id and pulls from 0. A run
pulls before it pushes, and the push names the store that pull confirmed (the server
refuses a push for any other with `409 store/changed`, which the client treats as a reset),
so an outbox meant for a store that no longer exists never lands in the fresh one; it pulls
again after a push for what the server derived from it. A run resets at most once: a second
change in the same run stops it and the next run retries. What was written on the old copy
while a reset was under way goes with it. Signing out (a 401 on `/api/me` included) drops
the local log, outbox, cursor and id as well.

**A one-time re-pull after an update.** A client update that accepts events older clients left
out (their pull skipped what they could not read and moved the cursor past it) raises
`SYNC_SCHEMA_VERSION` in `sync-version.ts`; the store keeps the version its log was pulled under
(`syncVersion` in the copy's meta, 0 for logs from before versions). A run that finds a lower one
rewinds the cursor to 0 and stores the current version in one guarded write (`upgradeCursor`, a
legacy page from 0 with no events), before its pull: the log and the outbox
stay, events the log already holds are skipped on the way in, the outbox is pushed as usual, and
the next start pulls from its cursor again. A reset stores the current version with the fresh copy,
and a log without a store id is dropped by its pull anyway. Version 1 is the id limit raised from
64 to 128. On the server the re-pull is the ordinary paged pull (`listPage`: the next `limit`
events after `since` by the `seq` primary key), so it costs one request per 200 events, once per
device.

**The local copy.** The device's copy of the log is behind the `EventStore` port
(`packages/client/src/event-store.ts`; IndexedDB, SQLite, memory). Next to the events and the
outbox it keeps the copy's meta: `copyToken` (a random identity, new after a clear or another
owner), `owner` (the session's mark), `storeId`, `cursor`, `syncVersion` and `coverage`.
`readMeta` reads the meta alone, `readSnapshot` the whole copy (`LocalSnapshot`: the meta, the
stored checkpoint if any, the records with their `seq`, the outbox ids), for a load only. The
port has no setter for the cursor or the store id: the meta moves only with what it describes,
through the guarded operations (`applyLegacyPage`, `installBootstrap`, `applyRemotePage`,
`installHistory`), each checked against a `CopyGuard` inside its own transaction, as `append`
and `markSynced` are. A refusal that cannot travel as a `Result` is thrown as a `SyncError` and
read by its `code` (`COPY_CHANGED` ends the run and has the client ask whether its session
still stands).

**Checkpoint sync (off by default).** With `PACE_HISTORY_CHECKPOINT_MODE=active` the server
offers `features.historyCheckpoint` (the `CHECKPOINT_VERSION`) on `/api/instance`, and a copy
that has pulled nothing yet starts from a checkpoint instead of the whole log:

- `GET /api/sync/bootstrap?limit=` answers `kind: "checkpoint"` with the checkpoint as a JSON
  string and its SHA-256, the high-water mark `throughSeq` and the first page of the tail
  (`records`, `seq`, `more`), or `kind: "source"` when it has no checkpoint to give (the client
  then pulls the whole log). The client checks hash, version, shape and store before installing.
- `GET /api/sync/pull` takes three optional parameters. `checkpointVersion` asks for `records`
  (each event with its `seq`) and may be answered `bootstrapRequired` when the cursor is behind
  the server's checkpoint; `storeId` makes a pull of another store a `409 store/changed`;
  `through` pins a read of the complete source up to that `seq` and is never redirected to a
  bootstrap. The socket's `pull` and `events` carry the same fields.
- A copy built on a checkpoint has `coverage: "checkpoint"`: its state is the checkpoint's
  `CoreState` with the tail and the outbox replayed on top (`replayCheckpoint`), and its log
  holds only what came after. An event the base cannot take (a correction, a backdate, an id a
  known correction targets: `requiresSource`) needs the source first. `state.ensureHistory()`
  (the History screen, export, undo, revoke, source-dependent edits, the system's own backdated
  instances) reads the complete source with pinned pulls and installs it in one write
  (`installHistory`); the copy is `coverage: "full"` from then on.
- Which run a copy takes is decided per run from its meta (`CheckpointSync.enabled`): the
  checkpoint run when the server offers checkpoints and the copy is built on one or has pulled
  nothing; the legacy run otherwise. A full copy that has pulled is never bootstrapped again or
  cut down to a checkpoint. A checkpoint copy on a server that stopped offering them (the flag
  rolled back, or a version this build reads as none) is turned into a full one by the legacy
  run: a pull from 0 whose first page replaces the base and keeps the outbox. Both runs push
  the outbox through one function (`sync-push.ts`).
- A tail page is read as a legacy page is: an event this build cannot read is left out and the
  cursor moves past it (`readTailRecords`), so a newer client's event never stops an older
  client's sync. Only the pinned read of the complete source is strict.
- The shape of a checkpoint's state belongs to `CHECKPOINT_VERSION`:
  `packages/core/src/checkpoint/state-shape.test.ts` fails when the shape differs from the one
  frozen for the current version. A stored base this build cannot read leaves the state not
  ready until the next run replaces it (a bootstrap, or the legacy pull from 0); the outbox is
  kept through both.

A store fenced for an account cleanup answers its sync routes `503 cleanup/busy`. The client
takes that as "not now": the run fails, the loop backs off, and the status keeps what the last
run said (no error, not offline).

A reset also forgets the store's Telegram chat; the store then sends to the user's private
chat, whose id is their Telegram id (looked up in D1 by the store's name, the user id).

The transport validates only the envelope (`SyncEventSchema`); the per-type payload is
checked by the Durable Object. `seq` is a server-assigned integer, so a client that
pulls from its last `seq` gets exactly what it missed, in any order of `occurredAt`; the
materialization rule above decides whether an incremental apply is enough.

## Assistant proposals and time tracking

`POST /api/parse` reads free text in the requested `task` or `activity` domain and answers
with checked proposals. Core names the proposal kinds in `proposals/kinds.ts` (create,
update, delete, close and subtask changes for tasks; start, log, update and delete for
activities). `planProposal` in `proposals/plan.ts` validates one accepted proposal against
the current state and produces events; `planProposals` plans a batch in order. Parsing
alone does not write events. The app's full proposal cards and the bot's proposal picker
are planned for later PRs.

### Models: who is asked, in which order

Every read (the app's `POST /api/parse`, the bot, the deferred queue's drain) goes through
`readMessage(models, …)` in `apps/api/src/shared/llm/read.ts`, where `models` carries the
providers and the health memory together, so no caller reads without it. The providers are the
numbered slots (`LLM_BASE_URL_N` / `LLM_API_KEY_N` / `LLM_MODEL_N`): every model of every key is one
provider, in slot order (`providers.ts`). `runStructured` (`llm.ts`) races them with a hedge: the
next one is asked as well when the current one fails or has not sent a first token within 5 s;
one provider gives up after 45 s; the bot's read ends at 10 s, the app's at 20 s.

Two memories decide who is asked:

- **Rests, per person** (the user's Durable Object, `llm:cooldowns`): a 429 or 503 rests the
  provider until its `retry-after` (a minute without one), a refused key (401/403) for an hour.
  A resting provider is skipped; when all rest, the error says when the soonest is back.
- **Health, shared by every user and isolate** (`health.ts`, `health-store.ts`): a failure that
  says the provider cannot serve anyone (a 5xx, 404, 408 or 410, a dropped connection or the race
  giving up, an in-stream error object whose code or type says server error or overload), or
  being silent past the hedge twice in a row while another provider answered, moves it to the end
  of the order for a minute, doubling with each failure in a row up to 30 minutes; a success
  clears it. A failure about this request, key or answer (a 400 or 422, `invalid_request_error`,
  a content filter, a context too long, an endpoint's refusal of its own model's answer, a rate
  limit, a refused key, an error object that says nothing known) does not count; an in-stream
  rate limit (`code: 429`, `rate_limit*`) rests the provider for this person until the time it
  names (`failure.ts` sorts every failure once, by what it says: bug class 15). Moved last, not
  left out: with every provider under penalty the configured order stands. Once a penalty is over
  the provider is back in its place as a probe: the next provider is asked alongside it at once,
  so nobody waits on a provider that may still be down. Its first token counts as recovery; a
  probe the read ends before it can judge goes back to its place, strikes kept, so no later read
  asks two providers for it (bug class 96). Silence counts as slow only when some provider
  answered: a read lost to its deadline strikes nobody. The memory is kept by its own small
  Durable Object (`LlmHealth`, one for the deployment, `idFromName("global")`, `health-object.ts`
  and `health-keeper.ts`): one writer, so records sent at once all count, and its storage is
  written only when who is asked first changes (a penalty, a recovery, a probe put back); a first
  slow answer stays in its memory. Each isolate trusts what it read for 15 s and calls the object
  only for a read that changes a record as it sees it; the app's and the bot's reads save after
  the response (`waitUntil`), the deferred queue's drain awaits it. The object unreachable, the
  read goes ahead in the configured order and the failure is logged as an error. The reason kept
  is a category (`server-error`, `gone`, `timeout`, `dropped`, `slow`), never an endpoint's words,
  and a logged failure leaves out the generation an endpoint quotes back (bug class 98). Each
  change is logged once ("provider asked last" with its reason and until when, "provider back in
  its place").

An answer passes one check however it arrives (`answer-check.ts`): nullable keys an action left
out, which mean "does not apply", are filled with null (never a list: an answer with no `actions`
is no reading, bug class 95), lengths clamped, then the zod schema. An
endpoint that checks its model's answer itself and refuses it is read for that answer (bug class
85); failing ours too, it is an answer out of shape, not an outage.

When no model reads a text, the parse answer is the rules' reading with a `reason`
(`PARSE_UNAVAILABLE_REASONS`): `limited` (resting, with a time), `unreachable` (down or silent,
no time said), `unreadable` (every model answered out of shape) or `off` (no model configured).
`defer` keeps the text on the server only for `limited` and `unreachable` (`canReadLater`; with
no time it is read at the queue's next try, then every five minutes for a day); the app offers
"Read it when it's back" only then, once, and says "couldn't read this one" for `unreadable`, as
the bot does (bug class 99). An older server sends no reason: the client reads it from `retryAt`.

On Day, the time bar offers Calendar, Task, Chores and Rest, plus a typed activity; Now
shows a compact row for what is running. A computer can contribute foreground-app and
idle-time observations through the scoped token and the Python agent described in
[desktop.md](desktop.md). Observations are separate from the immutable user-action log.

## Durable Object per user

`apps/api/src/user-store/user-store.ts`: `class UserStore extends DurableObject`, one
instance per user (`USER_STORE.idFromName(user.id)`). Storage is the DO's SQLite through
drizzle (`drizzle-orm/durable-sqlite`); migrations (`drizzle/do`, bundled as
`migrations.js`) run in the constructor inside `blockConcurrencyWhile`, so no request
sees a half-migrated store. Before they run, a store whose stored epoch is not
`STORE_EPOCH` (`user-store/store-identity.ts`; a store from before epochs has none) is
emptied: `deleteAll` (SQL tables and keys) and its alarm. Raising the epoch drops every
user's data at once, so a breaking change never needs a data migration (and the DO
migrations could be squashed into one `0000`). Tables (`user-store/schema.ts`): `events`
(`seq` primary key, `id` unique, indexed by `occurredAt`), `calendar_events`,
`usage_sessions`, `phone_uses`, `decisions` (every automatic decision with its inputs, for "why?"), the
notification pool (`notifications`, its delivery log `notification_deliveries`, and
`poll_outbox` for phones that poll),
`meta` (cursors, budgets) and the projections `tasks`, `subtasks`, `projects`, `presets`
(the materialized state as SQL rows for SQL readers; never the source of truth).

The object keeps core's `CoreState` materialized in memory (`user-store/state-cache.ts`), tagged
with the log `seq` it was built at; a cache behind the log is rebuilt. A batch that is in
order (nothing before the last applied `occurredAt`, no correction: core's
`shouldRematerialize`) is folded incrementally and only the rows it touched are rewritten
(a preset change rewrites every task row, since it moves their derived columns); anything
else rebuilds the state and rewrites the projection rows that differ from the state before
(`user-store/projections.ts`). Production evicts an instance idle for a minute or two, so most
alarms and uploads at night start with nothing in memory. The projection rows therefore carry a
mark (key `projections:mark`: the log `seq`, the build that wrote them, as `PACE_VERSION` plus
the newest DO migration, and the state's zone), written after them: a cold rebuild at the marked
`seq` and build loads the log but writes no row, and a deploy or a write cut short rewrites every
row once. A build without `PACE_VERSION` (`dev`) may be newer code under the same name, so its
every cold start rewrites every row (`docs/self-hosting.md` says to set it). Automatic sleep reads the zone from the mark while it is current, without loading the
log. The log as last loaded is kept in step with what goes in, so a pass that reads it and then
writes, or a write out of order, does not load it again. After every
append (a client's sync push, an `apply`) and before every read and every `apply`,
`derive(now)` appends the system events the state calls for: this week's homework instances, the automatic
`skipped` outcome of an empty instance (a task past its deadline stays open, overdue), then the next instance of a course left with none open
(`user-store/derive-steps.ts`), with deterministic ids, so they are idempotent
against clients that derived the same events.

The notification pool (`user-store/pool-service.ts`) evaluates calendar starts, activity
overruns and deadline digest slots. A pass stores notifications once per subject, records
delivery per channel and device, and arms the Durable Object alarm for the next due time.
The feed and open app update through the live socket. Telegram and a configured FCM project
can deliver outside the app; a phone with a different Firebase project uses polling.

**Automatic sleep** (`user-store/sleep-pass.ts`) runs after every phone's usage upload and at
its own alarm time (a computer's uploads and other waits' alarms run no pass).
A pass reads use on every device from 36 hours back and how far the phones have told
(`usageForSleep`), builds the rules' input from the log with core's `sleepInputOf` (the same
builder the rules' own tests use: every effective activity, plus each instant the person recorded
for a non-Rest activity, which counts as a use of no length, and where their live starts close a
sleep), decides with `decideSleep` and appends `sleepEvents` through
the system path (device `server`, deterministic `auto:sleep-…` ids, so passes are idempotent).
Each decision that wrote an event goes to `decisions` (kind `sleep`, rule `sleep.open` /
`sleep.stop` / `sleep.reopen` / `sleep.discard`, inputs: the instant, the zone, `knownUntil` and
the spells awake around it); the assistant log words them through `decision-system.ts`. The
highest `knownUntil` a pass decided with is kept (key `sleep:decided-until`) and passed back, so
less known later undoes nothing. The stored label `"Sleep"` is the server's; every screen shows
an automatic sleep through `shownLabel` in the reader's language, and the Day sheet sends back
only what the person changed (times at the minute it shows them, the label against the shown
one), so a save never makes the worded label or an unchanged time the person's. A pass loads the
log only when what it decides on can have changed since the last pass that read it (key
`sleep:held`: digests of the log's `seq` and the zone, of the uses, and of the uses before what it
decided on, with core's `sleepHorizon` of its input; `user-store/sleep-hold.ts`). The uses digested are those of the window
that pass decided on, from its front (the hold's `anchor`): while the hold lasts, later passes read
from the anchor rather than from their own front, so the front moving on with `now` changes no
digest, and use that arrives late anywhere in the window still does. A use leaving the window is
no change (core's property 13 moves the front: a night whose evening use left the window stands as
decided), and a day past the front the hold is let go and made again, so no read grows without
bound. It skips when the log, zone and uses are the
same and `knownUntil` is still short of the horizon (the next instant a decision compares with:
a use or a recorded instant becoming known, a rest's bound, the open rest's candidate and its 45
minutes, a possible wake-up's 90), or, by day (noon to 21:00), when everything it followed is
decided for good and only new use came after what it knew. A quiet night with an upload every 15 minutes
and sleep's hourly alarm therefore reads the log when the night opens and when the morning's first
use ends it, and otherwise only when the person records something or a late upload lands in the
window (`sleep-pass.test.ts` counts the reads over such a night). That holds on a cold instance
too, the normal case at night: the zone comes from the projection mark, and the alarm's other
waits pass only at their own time (below). `night-cost.int.test.ts` runs a night of uploads and
alarms on a new instance each time and counts the log loads (the pool's two digest passes and
sleep's passes that can decide something, one load each) and the projection rows written (none). The usage reads go through end indexes
(`phone_uses_end_idx`, `usage_sessions_end_idx`, `calendar_events_end_idx`), so a pass, the pool's
calendar read and the usage list read the rows of their window, never all history (nothing is
pruned: the owner keeps the data). Without a phone upload within a day nothing new is decided
and nothing armed, but an automatic sleep still running ends where knowledge ended (the highest
`knownUntil` decided with), and goes when that leaves it short: a dead or signed-out phone never
leaves a sleep open for days. A phone that tells again later walks it as usual. A failed pass is logged and never fails what ran it: after an
upload the upload is answered, at the alarm sleep looks again in an hour, doubling while
passes keep failing up to four hours (key `sleep:failures`; a pass that completes starts it again).

**The alarm** is one per store and shared: the pool's next pass and delivery retries, the
assistant's queue and automatic sleep each arm it through `armEarliest` (`user-store/alarm.ts`),
which only ever moves it earlier, so none postpones another's earlier time. `alarm()` runs the
pool, the queue and sleep (a failure in one does not hold the others back; the pool's or the
queue's fails the alarm afterwards, so the runtime retries it, while the pool itself passes again
only once its backoff has come, from a minute up to four hours, and sleep's is logged and looked
at again later, from an hour up to four hours), and each arms its next time again; the runtime takes the alarm off as it fires.
Each wait keeps its own time and reads nothing before it has come: the pool's (`pool:next-at`,
the earliest pass any write, retry or pass asked for), the queue's (its earliest text) and
sleep's (`sleep:next-at`); before that each arms its time again. A pool pass loads the log on a
cold instance, so it runs only at its own times, never at sleep's looks: its digest slots, the
starts of calendar events and the ends of those announced, the overrun wait, the end of the quiet
hours, delivery retries, and never later than a day after the pass before (`scheduleNextPass`):
a pass that finds nothing coming still looks again within a day, within the three days of
calendar it reads, so an event that comes into that window with no write and an unchanged
calendar copy is still announced, and a time left by older rules heals (bug-lessons class 57). A
pass first counts itself (`pool:failures`, the passes in a row that have not completed), writes a
lease (`pool:lease`, five minutes on for the first pass in a row, doubling for each one after up to
four hours), arms the alarm at the lease's end and takes the pool's time (`null`); whatever asks for a pass while it runs arms the time again, its
own next decision included, and at the end it gives the lease back if it is still its own. A
pass cut short (an isolate reset mid-delivery: a deploy, the CPU limit) leaves its lease, and the
lease's wake runs it again, whether or not the runtime retries the alarm (class 58), and one that
keeps being cut short (the CPU limit, where no `catch` runs) waits 5, 10, 20 minutes and so on up
to four hours; after a pass that completed, that wake reads the gate and loads nothing. A failed
pass runs again a minute on, doubling while passes keep failing or being cut short, up to four
hours (a pass that completes clears `pool:failures`), or sooner when a write asks for it (a pass
asks for its own delivery retries only at its end, so one that breaks after a failed delivery
still backs off); a store from before the key passes
at its next alarm, and one with no alarm at all (main deleted it when nothing was coming; a store
just made or wiped has none) gets one at once from its next write or calendar copy, changed or
not (`armIfPoolUnplanned`), so its pool starts its own times. Sleep looks every hour from 21:00 to noon in the person's zone (owner, 2026-11-01: not every 15
minutes; a night's start is its last use and its end the morning's first, whenever a pass sees
them, and each phone upload runs a pass, so the hour only delays a night while no phone uploads) and at the
next 21:00 by day (`nextSleepCheckAt`).

**The background check** (`apps/app/src/platform/background-check.ts`): every signed-in phone
registers `pace.background-check` with `expo-background-task` (WorkManager,
`minimumInterval: 15`) on sign-in and unregisters it on logout. A run builds its client with
`backgroundApi()` (`background-api.ts`, shared with the push task): the stored server and the
token stored for that server, read together, so a token kept for another server reads as
signed out and nothing is sent. It polls `GET /api/push/poll` only when the phone's method is
`poll` (the server logs the hand-over as delivered via `poll`), then uploads the calendar and
usage on every phone, whatever the method, since the server's rules need them at night too.
Each step is caught on its own (a failed poll never stops the upload); a logout during a run
makes its client stop sending the ended session's token.

**The battery step**: Android defers an optimized app's background work for hours, so a phone
whose push method is `poll` is asked to leave Pace out of battery optimization. One predicate,
`isBackgroundStepNeeded` (`platform/notifications.ts`: method `poll`), decides whether the
permission walk-through lists the `background` step, Settings → Permissions shows it and the hint
under the push picker appears (bug class 1); with Google push, or no method, nothing is asked.
Allow opens the phone maker's autostart page where there is one (`Battery.kt`, the packages
listed under `<queries>` in the module's manifest) and Android's own exemption dialog on top of
it; a phone without the dialog gets the list of optimized apps, and one without either opens
nothing instead of crashing.
Answering or settling a notification resolves it in the pool and takes back its copies.

Methods: `append` and `list` (sync; `list` answers the store id too), `storeId`, `wipe`, `find(id)`, `read(now)`,
`apply(inputs, { source, deviceId, now })` (derives, then validates the batch in order with
core's `validateEventInput`, the first refusal stops it and none of it is written; stamps
ids, `recordedAt` and the device; returns the stored events and the new state), `dryRun`
(the same without any write, derivation included), `derive(now)`, `countEvents`, `addUsage`
(stores an upload, then runs a sleep pass), `usageForSleep`. The MCP tools and the bot reach it
through `UserStoreApi` in `shared/contract.ts`, so heavy recomputes never cross a network
boundary.

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

### Android update publisher

`apps/updates` is an isolated Worker serving publisher-owned OTA artifacts from its own R2
binding. It imports neither the account API nor the app. Account-server selection never
changes the publisher, runtime, channel or signing authority. Runtime-safe manifest/protocol
and release-storage helpers live in `apps/updates/src/shared`, exported through
`@pace/updates/*` to publication commands under `scripts/ota`;
filesystem export reading and private-key signing remain CLI-only and are excluded from the
Worker runtime dependency graph. The publisher is not deployed or enabled by adding this workspace.
