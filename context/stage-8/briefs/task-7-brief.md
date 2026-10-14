# Task 7 — Part D: drop all data, a store id, dead pieces out

Owner's words: «Напомню что совершенно ок дропать всю базу если нужно. Давай ее дропнем даже чтобы не приходилось данные
мигрировать и какие-то корнер кейсы учитывать». «Делать ломающие изменения можно, мы не хотим обрастать костылями.»

## 1. D1 (apps/api/src/shared/db/d1-schema.ts, apps/api/drizzle/d1)
Add a custom migration (`bunx drizzle-kit generate --custom` with the D1 config — check apps/api/package.json's
db:generate script for the exact config path/flags) named like `reset_all_data` that empties every D1 table:
`DELETE FROM login_nonces; DELETE FROM sessions; DELETE FROM users;` (children first). Never edit applied
migrations. `bun run db:check` (part of `bun lint`) must pass.

## 2. Durable Object store (apps/api/src/user-store/*, apps/api/drizzle/do)
- Squash the DO migrations into one fresh `0000` from the current schema: delete apps/api/drizzle/do/*.sql and
  meta, regenerate with `bun db:generate` (DO config), rebuild migrations.js the way the repo does (check how
  migrations.js is produced — drizzle-kit generates it for durable-sqlite). This is allowed only because of the
  epoch wipe below; say so in the commit message.
- A `STORE_EPOCH` constant (e.g. 2) in user-store: in the UserStore constructor, inside the existing
  `blockConcurrencyWhile`, BEFORE running migrations: read the stored epoch from DO KV storage
  (`ctx.storage.get("epoch")`, the sync KV API or the async one — follow what the class uses); if it differs
  (including missing on an existing store with data), `await ctx.storage.deleteAll()` (clears SQL tables too) and
  `deleteAlarm`; then migrate; then store the epoch. A brand-new store just gets the epoch.
- Each store gets a random `storeId` (e.g. 16 random bytes base64url) created on first migrate and on every wipe;
  kept in DO storage. `UserStore.wipe()` (used by account deletion) regenerates it.

## 3. storeId to clients; clients reset on mismatch
- Return `storeId` from `GET /api/sync/pull` (add to its output schema in packages/core/src/api/schemas) and from
  `GET /api/me`.
- packages/client sync loop (createSyncClient / createPaceClient): remember the storeId the local log belongs to
  (in the EventStore/SessionStore ports' metadata — add a small `meta` get/set to the EventStore port with memory
  and IndexedDB (apps/app web store) and native (check what the Android event store uses) adapters, or store it
  next to the cursor if a cursor is already persisted — find where `since`/seq cursor is kept and keep storeId there).
  When a pull answers a different storeId than the stored one (and a stored one exists): drop the local log,
  outbox and cursor, keep the new storeId, pull from 0, and rematerialize (the app state must update). First run
  (no stored id): just store it. Never push the outbox before the first pull has confirmed the storeId (so an old
  outbox can never land in a fresh store) — check the order in the sync loop and make it so.
- Also make sure signing out (and a 401 that signs out) clears the local log, outbox and cursor — check; if it
  does not, make it.
Tests (TDD): client unit tests with the fake fetch (packages/client testing helpers): mismatch wipes the local log
and outbox and refetches; first id is stored; outbox is not pushed before the id is confirmed. API int tests:
pull returns a stable storeId; after wipe it changes; a store with a different stored epoch is wiped on startup
(simulate by writing an old epoch then re-instantiating — look at how tests reach the DO, e.g. runInDurableObject
from cloudflare:test).

## 4. Dead pieces out
- The `observations` DO table, `POST /api/sync/observations` endpoint + schema + handler + client code (nothing
  in the app sends to it — verify with grep first; if something does, report instead of deleting).
- Retired event types `activity.button.set` / `activity.button.removed` (packages/core/src/events/event-schema.ts,
  payloads, reducers, tests, i18n if any). Breaking is fine since the data is dropped.
- Update docs/architecture.md's sync table (observations row) and the "observations" paragraph.

`bun lint`, `bun test:unit`, `bun test:api`, `bun test:app` green.
