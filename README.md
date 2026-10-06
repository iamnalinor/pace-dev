# Fullstack template

A production-grade starting point for web apps on **Bun**: an Elysia API with a
Drizzle/PostgreSQL database and a React SPA that talks to it through **Eden** —
a client SDK generated from the API's types, so frontend and backend can never drift apart.

It ships as a small working app — a toy social network (sign up, sign in, post, like) —
so you can see *how* each piece is meant to be written before writing your own.
**Everything that belongs to the example has `Example` / `example` in its name**
and is deleted in one step ([Starting your own project](#starting-your-own-project)).

| Layer | Tools |
|---|---|
| Runtime, package manager, API tests | [Bun](https://bun.sh) 1.4 (workspaces) |
| API | [Elysia](https://elysiajs.com), [better-auth](https://www.better-auth.com), [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL 17 |
| Client SDK | [Eden Treaty](https://elysiajs.com/eden/overview) (types inferred from the API) |
| Web | React 19, Vite 8, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com), React Router 8, TanStack Query 5 |
| Quality | TypeScript 6 (`@tsconfig/strictest`), ESLint 10 (typescript-eslint strict + 15 plugins), Biome (formatter), knip, jscpd, dependency-cruiser |
| Tests | `bun test` + fast-check, Testcontainers, Vitest + React Testing Library, Playwright + axe, Stryker |
| Delivery | Docker (multi-stage, non-root), docker compose, GitHub Actions |

## Quick start

Prerequisites: [Bun](https://bun.sh) 1.4+ and Docker.

```sh
bun install                 # also installs git hooks (lefthook)
cp .env.example .env
docker compose up -d db     # PostgreSQL on localhost:5432
bun dev                     # API :3000 (migrates on start) + web :5173
```

Open http://localhost:5173. API docs (OpenAPI/Scalar) are at http://localhost:5173/api/docs (disabled in production).

The whole stack, the way it runs in production:

```sh
docker compose up --build   # http://localhost:8080 (nginx → api → db)
```

## Commands

| Command | What it does |
|---|---|
| `bun dev` | API (watch mode) and web (Vite HMR) together |
| `bun lint` | **Everything static**, auto-fixing what can be fixed: format → eslint → tsc → knip → jscpd → dependency-cruiser → migrations in sync. Run it after every change. |
| `bun test:unit` | API unit tests (`bun test`) + web component tests (Vitest) |
| `bun test:integration` | API against a real PostgreSQL (Testcontainers; needs Docker) |
| `bun test:e2e` | Playwright against the production web build, real API and DB |
| `bun test` | All of the above |
| `bun test:mutation` | Stryker mutation testing of the web tests (slow; weekly in CI) |
| `bun db:generate --name=<name>` | Generate a SQL migration from schema changes |
| `bun db:migrate` | Apply migrations without starting the API |
| `bun run build` | Production build of the web app |

## Repository layout

```
apps/
  api/                      Elysia API (Clean Architecture, see docs/architecture.md)
    src/
      main.ts               composition root: config → migrations → server
      app.ts                createApp(deps): the HTTP app; `App` type for Eden
      contract.ts           type-only public contract imported by the web app
      auth/                 better-auth instance, Elysia macro `{ auth: true }`
      features/
        example-posts/      domain / application / infrastructure / http
      shared/               config, db, logger, Result, Clock
    drizzle/                generated SQL migrations (committed)
    tests/integration/      real server + real PostgreSQL
  web/                      React SPA
    src/
      features/             auth, example-posts (components, queries, tests)
      shared/               api client, auth client, layout, shadcn/ui
e2e/                        Playwright scenarios (+ axe accessibility checks)
docs/                       architecture, migrations, testing, linting
```

## Documentation

- [Architecture](docs/architecture.md) — layers, the rules that enforce them, **how to add a feature**
- [Migrations](docs/migrations.md) — creating, applying, rolling forward
- [Testing](docs/testing.md) — the pyramid: what is tested where, and what is deliberately not
- [Linting](docs/linting.md) — every tool in `bun lint` and why the non-obvious rules are set as they are

## Starting your own project

1. **Delete the example.** Everything it consists of contains `example` in its path or name:

   ```sh
   git rm -r apps/api/src/features/example-posts apps/web/src/features/example-posts \
     e2e/example-feed.e2e.ts apps/api/tests/integration/example-posts.int.test.ts
   ```

   Then remove the remaining references — `bun lint` lists every one of them:
   - `apps/api/src/app.ts` — the `createExamplePostsFeature` line;
   - `apps/api/src/shared/db/schema.ts` — the `example-posts-table` export;
   - `apps/api/src/contract.ts` — `ExamplePostMaxLength`;
   - `apps/web/src/router.tsx` — the `ExampleFeedPage` route (put your home page there).

2. **Drop the example tables.** For a brand-new project, the simplest is to delete
   `apps/api/drizzle/0001_example-posts.sql` and its entries in `apps/api/drizzle/meta/`
   (`0001_snapshot.json`, the `0001` item in `_journal.json`). If the migration has ever
   been applied somewhere you care about, generate a forward migration instead:
   `bun db:generate --name=drop-example-posts`.

3. **Refresh the API contract snapshot** (the example routes disappear from it):
   `bun test:integration --update-snapshots`.

4. **Remove what only the example used.** `bun lint` (knip) lists the shadcn/ui components
   and dependencies nothing imports anymore (e.g. `textarea`, `skeleton`, `fast-check`) —
   delete them, or keep them for your first feature.

5. **Check that nothing is left:** `git grep -il example -- apps e2e` must print nothing,
   and `bun lint && bun test` must pass.

6. Rename the packages (`@template/*`), the compose project `name:` and the page title.

## License

[MIT](LICENSE)
