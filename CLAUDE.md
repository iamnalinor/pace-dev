# Agent instructions

Pace — a personal task & time tracker. Bun workspaces: `packages/core` (pure shared logic),
`packages/client` (local-first store + sync + view-models), `apps/api` (Cloudflare Worker:
Hono + Durable Objects + D1), `apps/app` (Expo: the one UI, Android and the web through
react-native-web, PWA), `e2e/` (Playwright). Read [docs/architecture.md](docs/architecture.md) before
changing structure. Product background (the spec, decisions taken with the user, the
build history) is in [context/](context/README.md).

## Rules

- **Bun only**: `bun install`, `bun run <script>`, `bunx <tool>`. Never npm/npx/yarn.
  (`vitest`, `jest`, `expo` and `wrangler` run under Node through their shebang — that is
  expected; never force `--bun` on them.)
- **After every change run `bun lint`** and fix everything it reports. Do not run
  biome/eslint/tsc/knip separately — `bun lint` is the single entry point (it auto-fixes).
- **Tests first (TDD)** for behaviour changes. Pick the level per [docs/testing.md](docs/testing.md):
  `bun test:unit` (core, client), `bun test:api` (Worker in workerd with
  real D1/DO/KV), `bun test:app` (jest-expo), `bun test:e2e` (Playwright + axe).
- **Never** disable a lint rule inline without `-- <reason>`; never weaken a rule to pass
  lint — fix the code. Never skip or delete a failing test.
- **Architecture** (enforced by dependency-cruiser): `core` is pure and immutable and
  imports no workspace; `client` imports `core` and only the *types* of `api`; apps import
  `client`/`core` and never each other; API feature folders only share through
  `apps/api/src/shared`.
- **Event sourcing**: every user action is an immutable event (`occurredAt` editable,
  `recordedAt` system); corrections are `event.amended` / `event.revoked`. State is
  derived by `core`'s materializer — never mutate projections directly.
- **Errors**: pure code returns `Result<T, E>` with string-literal error codes; HTTP maps
  them with an exhaustive `switch` (no `default`).
- **API contract first**: every route is a zod `endpoint()` in `packages/core/src/api/endpoints.ts`
  (shared by the Worker and `@pace/client`); the Worker mounts it with `mount(app, endpoint,
  handler)` from `apps/api/src/shared/mount.ts`, which validates input and maps `Result`
  errors. Read bindings from `c.env`, never at module scope.
- **Database**: change `src/shared/db/d1-schema.ts` (D1) or `src/user-store/schema.ts`
  (Durable Object), then `bun db:generate`; review and commit the SQL. Never edit an
  applied migration or `apps/api/drizzle/**/meta/*` by hand.
- **Every UI string goes through `t()`** from `@pace/core` (EN is the source catalog, RU
  mirrors it). User-entered content is never translated or rewritten.
- **App imports** use `#app/*`; packages and API use relative imports.
- **One UI for Android and the web**: screens are React Native in `apps/app`. Web-only code
  goes into a `.web.tsx` sibling (the web build swaps it in, see `metro.config.js`) or the
  stand-ins in `src/platform/web/`; never `if (Platform.OS === "web")` for whole screens.
  Never import a `.web.tsx` file from its own base file (it would resolve to itself).
- Code, comments and identifiers in English.
