# Agent instructions

Pace — a personal task & time tracker. Bun workspaces: `packages/core` (pure shared logic),
`packages/client` (local-first store + sync + view-models), `apps/api` (Cloudflare Worker:
Hono + Durable Objects + D1), `apps/web` (React + Vite + shadcn/ui, PWA), `apps/app` (Expo,
Android), `e2e/` (Playwright). Read [docs/architecture.md](docs/architecture.md) before
changing structure.

## Rules

- **Bun only**: `bun install`, `bun run <script>`, `bunx <tool>`. Never npm/npx/yarn.
  (`vitest`, `jest`, `expo` and `wrangler` run under Node through their shebang — that is
  expected; never force `--bun` on them.)
- **After every change run `bun lint`** and fix everything it reports. Do not run
  biome/eslint/tsc/knip separately — `bun lint` is the single entry point (it auto-fixes).
- **Tests first (TDD)** for behaviour changes. Pick the level per [docs/testing.md](docs/testing.md):
  `bun test:unit` (core, client, web components), `bun test:api` (Worker in workerd with
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
- **Hono routes**: keep chains unbroken (`hc<AppType>` infers the client from them);
  validate input with `@hono/zod-validator`; read bindings from `c.env`, never at module scope.
- **Database**: change `src/shared/db/d1-schema.ts` (D1) or `src/user-store/schema.ts`
  (Durable Object), then `bun db:generate`; review and commit the SQL. Never edit an
  applied migration or `apps/api/drizzle/**/meta/*` by hand.
- **Every UI string goes through `t()`** from `@pace/core` (EN is the source catalog, RU
  mirrors it). User-entered content is never translated or rewritten.
- **Web imports** use `#web/*`; app imports use `#app/*`; packages and API use relative imports.
- **UI components**: `bunx shadcn@latest add <name>` inside `apps/web`, then run `bun lint`.
  Check that generated imports point to `#web/shared/lib/cn.ts`.
- Code, comments and identifiers in English.
