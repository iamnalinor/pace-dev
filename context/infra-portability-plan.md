# Infrastructure behind ports, so Pace does not depend on Cloudflare (to do; owner, 2026-11-02)

A brief for a new session. Read `CLAUDE.md`, `docs/architecture.md`, `docs/self-hosting.md` and
`.dependency-cruiser.mjs` first, then follow the usual working method (brainstorm → plan → tasks →
review → QA).

## Why

The owner's words: «хотим корректные абстракции от инфры чтобы не зависеть конкретно от кфа. вдруг
потом мы захотим переехать куда-то еще» (we want proper abstractions over the infrastructure, so we
don't depend on Cloudflare in particular, in case we want to move somewhere else later).

The goal of this task is **not** to move. It is to make a move a matter of writing adapters, not
rewriting the server. Cloudflare stays the production target.

## Where things stand (survey 2026-11-02, `apps/api/src`, about 130 non-test files)

**Already portable:**
- `packages/core`: all domain logic (the materializer, sleep, the notification pool's decisions,
  recurrence), pure, with no runtime imports.
- `packages/client`: talks to the server only through the zod contracts (`endpoints.ts`) over HTTP
  and WebSocket.
- The HTTP layer is Hono, which has adapters for Node, Bun and Deno.
- Both databases are SQLite through drizzle: D1, and the user store's Durable Object storage. Same
  schema dialect and migrations; only the driver differs per platform.
- Routes reach a person's user store through one typed contract (`shared/contract.ts`,
  `shared/user-store-of.ts`, about 5 call sites).

**Tied to Cloudflare, with no port in between:**
- **The user store is a Durable Object** (`user-store/*`, about 19 files touching DO APIs). It gives
  three things at once:
  - one writer per person, which the ordering of events relies on;
  - **alarms** (`setAlarm` / `getAlarm`): the notification pool, automatic sleep and the
    assistant's queue are driven by them;
  - **hibernating WebSockets** (`live-sockets.ts`, `live-sessions.ts`).

  The class mixes orchestration with these APIs.
- **D1** is used through drizzle's D1 client directly in about 20 files. There is no repository
  layer, so the driver cannot be swapped in one place.
- **KV** (`OAUTH_KV`, about 3 files: the OAuth provider library and, until round 7, the LLM health
  memory).
- **`request.cf` / `CF-Connecting-IP`** for the sign-in place (4 files).
- **`cloudflare:workers` `env`** imported at module level in a few places. CLAUDE.md already says to
  read bindings from `c.env`; sweep these.
- **Workers static assets** for the web build. **wrangler** for deploy and migrations.
- **Tests:** `bun test:api` runs in workerd (`cloudflare:test`, `runInDurableObject`).

## Design to start from

1. **Ports in `apps/api/src/shared/ports/`** (names to settle in the plan). Each is a small
   interface, owned by the domain side, with one Cloudflare adapter today and a test double:
   - `UserStoreHost`: get the actor for a person (one writer per person) and call it. Today: the
     DO namespace plus RPC.
   - `Scheduler`: set, get or clear the next wake-up for an actor, and run the actor's due work.
     Today: DO alarms. Elsewhere: a timer wheel whose wake-up times are kept in the actor's own
     database.
   - `LiveChannel`: accept, tag, list and close sockets per person, and hibernate when idle. Today:
     DO hibernating WebSockets.
   - `SqlDatabase`: the drizzle database for the shared tables. Today: D1. Elsewhere: libsql,
     `bun:sqlite`, better-sqlite3 or Postgres; decide how far the dialect may differ.
   - `ActorStorage`: the person's own SQLite and key-values. Today: DO SQLite storage.
   - `KeyValue`: OAuth's store. Today: KV.
   - `RequestPlace`: IP, country, city. Today: `request.cf`. Elsewhere: proxy headers plus an
     optional GeoIP.
   - `Assets`: the web build. Today: Workers assets.
2. **The domain side imports ports only.** That means the routes and the user store's logic
   (pool, sleep, queue, sync). The Cloudflare adapters live in one folder (`apps/api/src/platform/
   cloudflare/`), and the Worker entry wires them.
3. **Enforce it with dependency-cruiser.** Nothing outside `platform/cloudflare/` and the entry
   imports `cloudflare:*`, `DurableObject*`, `D1Database`, `KVNamespace` or `request.cf`. Add the rule,
   and make `bun lint` fail on a new leak. This is the guard; the bug-lessons class is "a platform API
   used where a port should be".
4. **A second adapter set proves the ports.** The smallest real one: a **single-process Node/Bun
   host** for self-hosting.
   - An in-process actor map with a per-person mutex.
   - A SQLite file per person.
   - A `Scheduler` backed by stored wake-up times.
   - `ws` for sockets.
   - libsql or `bun:sqlite` for the shared tables.
   - A static file server for the web build.

   It runs the same `bun test:api` suite through a host-agnostic test harness (the harness picks the
   adapter set), so each port's contract is tested twice. If that is too much for one PR, ship the
   ports, the Cloudflare adapters and the lint rule first, and the Node host as a follow-up. The
   lint rule alone keeps the coupling from growing.
5. **Cheaper interim option for self-hosters, worth checking first:** run the unchanged Worker in
   **workerd** (Cloudflare's open-source runtime) with Durable Objects and SQLite on local disk, as a
   Docker image with a state volume. Measure whether workerd outside Cloudflare is fit for production
   (alarms, hibernation, backups). If it is, the Node host loses urgency, but the ports are still
   worth having.
6. **Docs.**
   - `docs/architecture.md` gets a "Ports and adapters" section: which port, which adapter, the rule.
   - `docs/self-hosting.md` gets the non-Cloudflare way, once one exists.

## Tests that must exist

- **One contract test per port, run against every adapter set:**
  - `Scheduler`: a wake-up in the past runs once; a re-arm moves it earlier only. This is the class
    54/57 rules, which become port contracts.
  - `LiveChannel`: closing with 4401 ends exactly that session's sockets.
  - `UserStoreHost`: two concurrent writes for one person are serialized; two people run in
    parallel.
  - `SqlDatabase`: migrations apply cleanly and are idempotent.
- **Lint:** the dependency-cruiser rule fails on a deliberate leak (checked once, not committed).
- **No regression:** the existing `bun test:api` and e2e suites stay green on Cloudflare.

## Out of scope

Moving production off Cloudflare. Multi-node clustering for the Node host; a single node is enough for
a personal tracker, so note only what sticky routing would need.
