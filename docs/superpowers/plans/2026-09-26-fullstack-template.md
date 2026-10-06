# Fullstack template (Bun · Elysia · Eden · Drizzle · React · Vite · shadcn) — implementation plan

> Process: superpowers (brainstorming → spec → writing-plans → executing-plans + TDD + verification-before-completion).
> After the plan is approved, it is committed to the repo as `docs/superpowers/specs/2026-09-26-fullstack-template-design.md` (the design) and `docs/superpowers/plans/2026-09-26-fullstack-template.md` (this plan, with checkboxes).

## Context

The `ChickenBaconOnion-master/template` repo is empty (LICENSE, README, .gitignore). We need a **reference template** for fullstack applications: a working example app that makes it immediately clear *how* to write your own apps in this stack, following Clean Architecture, with maximally strict linting (in the style of olympagg.github.io: everything through one `bun lint`) and a full test pyramid.

The example app is a minimal social network: sign up → log in → posts → likes.
Anything that's an example and must be deleted before starting your own project has **`Example`** in its name (`ExamplePost`, `example_posts`, `features/example-posts/`…). auth/users stay as the base.

Decisions agreed with the user:
- Auth: **better-auth** (email+password, Drizzle adapter, sessions in the DB, httpOnly cookie).
- Integration tests: **Testcontainers** (`@testcontainers/postgresql`), a real Postgres container.
- Frontend component tests: **Vitest + React Testing Library**; the api stays on `bun test`.
- Example marking: the word `Example` in entities, tables, folders and routes (no extra scripts or markers).
- Structure: variant A — a bun workspaces monorepo, Clean Architecture layers **inside each feature**.

Global constraints:
- Everything runs through Bun (`bun install`, `bun run`, `bunx`). Node is used only where a tool requires it (Playwright/Vitest start under bun).
- **Bun 1.4.x** (1.4.2 shipped 2026-08-20; hoisted linker by default — needed for the cross-workspace type import of Eden; catalogs). Pinned in `package.json#packageManager` and `.bun-version` for CI; the local container has 1.3.11 → `bun upgrade` before starting.
- TypeScript **`~6.0.3`** (exactly the 6.0 line: typescript-eslint 8.70 declares peer `<6.1.0`; TS 7 native isn't supported). TS 6 changes that matter: `types` defaults to `[]` (set explicitly), `noUncheckedSideEffectImports` is on by default, `baseUrl` is deprecated (not used).
- ESLint **10** (unicorn 76 needs ≥10.4; all other plugins have peers for 10; `eslint-plugin-jsx-a11y` 6.10.2 has no peer declared for 10 but works — `overrides` in package.json, documented; fallback: the fork `eslint-plugin-jsx-a11y-x`).
- Versions of critical interdependent packages (`elysia`, `@elysiajs/*`, `typescript`, `drizzle-orm`/`drizzle-kit`, `better-auth`, `vite`, `vitest`) are pinned **exactly** in a Bun **catalog** in the root `package.json` (`"catalog": {...}`, `"elysia": "catalog:"` in the workspaces): Eden requires identical Elysia versions on client and server, and 1.4.13 had a workspace type regression. `bunfig.toml`: `[install] exact = true`.
- **Path aliases — only through `package.json#imports`** (`"#web/*": "./src/*"` in web), not tsconfig `paths`/`baseUrl`: web's `tsc` type-checks api sources with *its own* tsconfig, so aliases would clash; Vitest also doesn't pick up `resolve.tsconfigPaths` from Vite 8. The api uses **relative imports** only (drizzle-kit loads the schema with its own loader and doesn't understand aliases).
- One `bun lint` = format(write) → eslint --fix → tsc → knip → jscpd → depcruise. CI runs `bun lint` and fails if it produced a git diff.
- No `any`, no `// eslint-disable` without a `-- reason` comment (rule `eslint-comments/require-description`).

---

## 1. Repository structure

```
.
├── package.json                # workspaces, root scripts, all dev tools
├── bun.lock
├── bunfig.toml                 # [install] exact = true; [test] root/preload settings
├── tsconfig.base.json          # extends @tsconfig/strictest + our additions
├── tsconfig.json               # solution file: references to apps/*, e2e, root configs
├── eslint.config.ts            # single flat config for the whole monorepo
├── biome.json                  # formatter only
├── knip.json                   # workspaces
├── .jscpd.json
├── .dependency-cruiser.cjs     # architectural boundaries
├── .editorconfig  .gitignore  .gitattributes  .env.example
├── docker-compose.yml          # db + api + web (prod-like)
├── docker-compose.dev.yml      # db only for local development
├── lefthook.yml                # pre-commit: bun lint on staged; pre-push: unit tests
├── playwright.config.ts
├── e2e/                        # Playwright: scenarios + axe
│   ├── fixtures.ts
│   ├── auth.e2e.ts
│   └── example-feed.e2e.ts
├── apps/
│   ├── api/
│   │   ├── package.json        # name: @template/api, exports: { "./app": "./src/app.ts" } (types only); bunfig.toml: [test] root="./src" (unit), integration via an explicit path + preload
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── Dockerfile
│   │   ├── drizzle/            # generated SQL migrations + meta/ (committed)
│   │   ├── src/
│   │   │   ├── main.ts                     # composition root: config → migrate → createApp → listen, graceful shutdown
│   │   │   ├── app.ts                      # createApp(deps) → Elysia; export type App
│   │   │   ├── shared/
│   │   │   │   ├── config.ts               # env parsing/validation (TypeBox), fail-fast
│   │   │   │   ├── result.ts               # Result<T,E>, ok(), err()
│   │   │   │   ├── clock.ts                # Clock port (now()) — for determinism in tests
│   │   │   │   └── db/
│   │   │   │       ├── client.ts           # createDb(url) → { db, close }
│   │   │   │       ├── migrate.ts          # runMigrations(db) (drizzle migrator)
│   │   │   │       └── schema.ts           # re-export of all tables (for drizzle-kit and the adapter)
│   │   │   ├── auth/
│   │   │   │   ├── auth.ts                 # createAuth({ db, config }) — better-auth instance
│   │   │   │   ├── auth-schema.ts          # user/session/account/verification tables (generated by `bunx auth@<pinned> generate` — the `auth` package; @better-auth/cli is deprecated; committed, then biome format)
│   │   │   │   ├── auth-plugin.ts          # Elysia plugin {name:'better-auth'}: .mount(auth.handler) (basePath /api/auth) + .macro({ auth: { resolve → getSession({headers}) | status(401) } }) → { user, session }. Attached at the ROOT app (eden#215: nested .mount+.macro → types degrade to any)
│   │   │   │   └── current-user.ts         # type CurrentUser (id, name, email) — what the application layer sees
│   │   │   ├── health/health-routes.ts     # GET /api/health (liveness), /api/health/ready (SELECT 1)
│   │   │   └── features/
│   │   │       └── example-posts/
│   │   │           ├── domain/
│   │   │           │   ├── example-post.ts         # ExamplePost type, validateExamplePostBody()
│   │   │           │   ├── example-post.test.ts    # unit (only non-trivial: normalization/limits in grapheme clusters)
│   │   │           │   ├── example-feed-cursor.ts  # encode/decode cursor (createdAt,id) → opaque base64url
│   │   │           │   ├── example-feed-cursor.test.ts  # property-based (fast-check): decode(encode(x)) == x, garbage → err
│   │   │           │   └── example-post-errors.ts  # ExamplePostError union
│   │   │           ├── application/
│   │   │           │   ├── example-post-repository.ts   # port (interface)
│   │   │           │   ├── create-example-post.ts       # use case → Result
│   │   │           │   ├── delete-example-post.ts       # authorization: author only
│   │   │           │   ├── list-example-feed.ts         # pagination
│   │   │           │   └── set-example-like.ts          # idempotent like/unlike
│   │   │           ├── infrastructure/
│   │   │           │   ├── example-posts-table.ts       # drizzle: example_posts, example_likes
│   │   │           │   └── drizzle-example-post-repository.ts
│   │   │           └── http/
│   │   │               ├── example-post-schemas.ts      # TypeBox (t.*) DTOs for request/response
│   │   │               └── example-post-routes.ts       # Elysia plugin, error→status mapping via exhaustive switch
│   │   └── tests/
│   │       └── integration/
│   │           ├── preload.ts               # bun test --preload: ONE Testcontainers PG per run (TESTCONTAINERS_RYUK_DISABLED=true — Ryuk keeps the bun process alive; stop the container in a global afterAll) → migrations
│   │           ├── setup.ts                 # createApp with real deps → app.listen(0) → Eden client over HTTP
│   │           ├── eden-types.int.test.ts   # type-level guard: expectTypeOf/`satisfies` — the Eden client does NOT degrade to any (eden#215 regression)
│   │           ├── helpers.ts               # signUp()/cookie jar for Eden
│   │           ├── auth.int.test.ts
│   │           ├── example-posts.int.test.ts
│   │           └── migrations.int.test.ts   # migrations apply to an empty DB and are idempotent
│   └── web/
│       ├── package.json        # @template/web; dependency "@template/api": "workspace:*" (for import-x/knip); imports: { "#web/*": "./src/*" }
│       ├── tsconfig.json
│       ├── vite.config.ts      # react, tailwind, proxy /api → API_URL (for dev AND preview: same origin → no CORS/SameSite issues). No aliases — #web/* via package.json imports
│       ├── vitest.config.ts    # (or test section in vite.config) jsdom, setup, coverage thresholds
│       ├── components.json     # shadcn (init: `shadcn init -t vite --monorepo`, add: `-c apps/web`; aliases → #web/shared/ui, tailwind.config is empty for v4)
│       ├── index.html
│       ├── Dockerfile          # build with bun → nginx (static + proxy /api)
│       ├── nginx.conf
│       └── src/
│           ├── main.tsx
│           ├── app.tsx                         # QueryClientProvider + RouterProvider
│           ├── router.tsx                      # routes + guards (protected/guest)
│           ├── styles.css                      # tailwind + shadcn theme tokens
│           ├── shared/
│           │   ├── api/api-client.ts           # treaty<App>(origin, { fetch: { credentials: 'include' } })
│           │   ├── api/unwrap.ts               # Eden {data,error} → data | throw ApiError (for TanStack Query)
│           │   ├── ui/                         # shadcn: button, input, label, card, textarea, sonner(toast), skeleton
│           │   └── lib/cn.ts
│           ├── features/
│           │   ├── auth/
│           │   │   ├── auth-client.ts          # createAuthClient() from better-auth/react
│           │   │   ├── sign-in-page.tsx
│           │   │   ├── sign-up-page.tsx
│           │   │   ├── auth-form.tsx
│           │   │   ├── use-session.ts
│           │   │   └── require-auth.tsx        # guard
│           │   └── example-posts/
│           │       ├── example-feed-page.tsx
│           │       ├── example-post-composer.tsx
│           │       ├── example-post-composer.test.tsx   # RTL: counter/limit, submit disabled, error from server
│           │       ├── example-post-card.tsx
│           │       ├── example-like-button.tsx
│           │       ├── example-like-button.test.tsx     # RTL: optimistic update and rollback on error
│           │       └── example-posts-queries.ts         # useInfiniteQuery / useMutation + optimistic updates
│           └── test/setup.ts                   # jest-dom/vitest matchers, RTL cleanup (network is mocked via vi.mock of api-client, see §5)
├── docs/
│   ├── architecture.md          # layers, dependency rules, "how to add a feature" (step-by-step on example-posts)
│   ├── migrations.md            # how to create/apply/roll back migrations
│   ├── testing.md               # the pyramid: what goes where and why; what we do NOT unit-test
│   ├── linting.md               # every tool and the reasoning behind non-obvious rules
│   └── superpowers/specs|plans/ # design + plan
├── .github/workflows/ci.yml
├── CLAUDE.md / AGENTS.md        # rules for agents: bun lint after changes, TDD, where to put what
└── README.md                    # quickstart, commands, "Starting your own project" (deleting Example)
```

Naming: all files and folders are kebab-case (check-file). Tests sit next to the code: `*.test.ts(x)` (unit/component); integration in `apps/api/tests/integration/*.int.test.ts`; e2e in `e2e/*.e2e.ts` (a distinct suffix so `bun test` and Vitest can't pick them up by accident).

---

## 2. Backend (apps/api)

### 2.1 Data model (Drizzle, `snake_case` via `casing: 'snake_case'`)
- better-auth tables (`user`, `session`, `account`, `verification`) — generated by the better-auth CLI into `auth/auth-schema.ts`, committed; we don't edit them by hand.
- `example_posts`: `id uuid pk default gen_random_uuid()`, `author_id text fk → user.id on delete cascade`, `body text not null` + `check (char_length(body) between 1 and 500)`, `created_at timestamptz not null default now()`. Index `(created_at desc, id desc)` for the feed.
- `example_likes`: `(user_id, post_id)` composite pk (like idempotency is enforced by the DB), both FKs `on delete cascade`, `created_at`. Index on `post_id`.
- The limit (500) is a single constant in the domain (`EXAMPLE_POST_MAX_LENGTH`), used by the domain validator, the TypeBox schema (`maxLength`) and the DB check → defense in depth.

### 2.2 Domain / application
- `Result<T, E>` = `{ ok: true; value: T } | { ok: false; error: E }` — no exceptions in the domain (functional/no-throw-statements in domain+application).
- Errors are string-literal unions: `ExamplePostError = 'example-post/empty' | 'example-post/too-long' | 'example-post/not-found' | 'example-post/forbidden'`, `ExampleFeedError = 'example-feed/invalid-cursor'`.
- Use cases are factory functions `makeCreateExamplePost({ repository, clock }) => (input) => Promise<Result<…>>` (functional/no-classes; DI through parameters, the composition root is in `app.ts`/`main.ts`).
- Feed: keyset pagination by `(created_at, id) < cursor`, `limit ≤ 50` (default 20), returns `{ items, nextCursor | null }`; each item has `likeCount` and `likedByMe` (a single SQL query with aggregation, no N+1).
- Deleting a post: author only → `forbidden` (403), missing → `not-found` (404).
- Likes: `PUT /api/example-posts/:id/like` and `DELETE …/like` — idempotent (PUT = `insert … on conflict do nothing`); liking a missing post → 404 (FK violation mapped in the repository to `not-found`, not a 500).

### 2.3 HTTP (Elysia)
- `createApp(deps)` assembles: global `onError` (unknown → 500 without a stack in the response, logged), `auth-plugin`, `health-routes`, `example-post-routes`. Prefix `/api`.
- Every route has a TypeBox schema for `params/query/body` **and** `response` per status (200/201/204/400/401/403/404) → Eden types errors on the client, OpenAPI describes them.
- `@elysiajs/openapi` at `/api/docs` (only when `NODE_ENV !== 'production'`).
- Mapping `ExamplePostError → status` is `switch (error)` without `default`, checked by `switch-exhaustiveness-check`: adding a new error without handling it = lint error.
- CORS isn't needed: in dev Vite proxies `/api`, in prod nginx does → one origin, SameSite=Lax cookies, better-auth `trustedOrigins` = `WEB_ORIGIN`.
- `app.ts` imports only domain/application/http/auth types — no Bun globals or DB drivers in its transitive type graph (important for type-importing `App` into web). DB/Bun are wired only in `main.ts`. `app.ts` doesn't call `.listen()`. Since web's `tsc` checks api sources with its own tsconfig, both extend one `tsconfig.base.json`, and web's `types` includes `bun` (only to type-check the imported api graph; the web code itself doesn't use Bun — enforced by ESLint `no-restricted-globals` in web).
- Methods on Elysia are chained (required for Eden type inference).

### 2.4 Config and startup
- `config.ts`: `DATABASE_URL`, `PORT` (3000), `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL`, `WEB_ORIGIN`, `NODE_ENV`, `LOG_LEVEL`. Validated with TypeBox `Value.Parse`; on error the process exits with a clear message (fail-fast).
- `main.ts`: parse config → `createDb` → **`runMigrations`** (drizzle `migrate()`, advisory lock so parallel replicas don't race) → `createAuth` → `createApp` → `listen` → SIGTERM/SIGINT: `app.stop()` + `db.close()`.
- Logging: a minimal structured logger (`console` → JSON in prod) behind a `Logger` port; no dependencies.

### 2.5 Migrations
- Source of truth is the TS schema (`shared/db/schema.ts` re-exports auth + feature tables).
- `bun db:generate --name <name>` → `drizzle-kit generate` → SQL in `apps/api/drizzle/` (committed, reviewed like code).
- `bun db:migrate` → the same `runMigrations` as at startup (a separate script `src/scripts/migrate.ts`), for manual runs.
- Automatic apply at API startup up to the latest version (§2.4).
- Rollback: drizzle has no down migrations → policy "roll forward" (a new corrective migration); documented in `docs/migrations.md` together with the expand/contract pattern for zero-downtime.
- CI check "schema ↔ migrations in sync": `drizzle-kit check` checks only history consistency, NOT schema drift → so `db:check` = `drizzle-kit check && drizzle-kit generate --name=drift-check` and then the CI step `git status --porcelain` must be empty (specifically `status`, not `git diff`: a new migration is an *untracked* file and `git diff` doesn't see it — the reference CI has this hole).
- Runtime migrator: `migrate(db, { migrationsFolder })` from `drizzle-orm/postgres-js/migrator` on a **separate** `postgres(url, { max: 1 })` connection, folder resolved via `import.meta.dir` (doesn't depend on cwd), + `pg_advisory_lock` around it. drizzle.config: `casing: 'snake_case'`, `migrations.prefix: 'index'`, names via `--name=`. **Important:** the drizzle site shows v1 docs by default (1.0 rc, different folder layout) — we're on 0.45, use the 0.x docs.
- `docs/migrations.md`: create, apply, custom SQL migrations (`--custom`), what to do on conflicts between branches, how to delete the Example tables (generate a migration after deleting the files).

---

## 3. Frontend (apps/web)

- Vite 8 + React 19 + Tailwind 4 (`@tailwindcss/vite`), shadcn (new-york, radix-ui, lucide-react), **react-router 8** (`createBrowserRouter` from `react-router`, `RouterProvider` from `react-router/dom`; `react-router-dom` no longer exists), TanStack Query 5.
- tsconfig web: `types: ["vite/client", "bun"]` (`vite/client` is needed for `import "./styles.css"` under TS 6's `noUncheckedSideEffectImports`), `lib: DOM`, `jsx: react-jsx`.
- Vitest 5 (peer vite ^8), setup: `import "@testing-library/jest-dom/vitest"`.
- `api-client.ts`: `treaty<App>(window.location.origin, …).api` — the SDK types are the backend types; no hand-written DTOs on the front.
- `unwrap()`: turns the Eden response into a value or a typed `ApiError(status, body)`; used in `queryFn/mutationFn`.
- Auth: `better-auth/react` (`useSession`, `signIn.email`, `signUp.email`, `signOut`); `RequireAuth` (redirect to `/sign-in?next=…`) and `GuestOnly` guards.
- Pages: `/sign-in`, `/sign-up`, `/` (feed: composer, infinite list with "Load more", like button with an optimistic update, delete own post with confirmation).
- Error/loading/empty states on every page; error boundary at the router level; toasts via `sonner`.
- A11y: labels on every input, `aria-pressed` on the like button, focus management after navigation; checked by jsx-a11y + axe in e2e.
- Env: `import.meta.env` isn't needed (same origin). The dev proxy target comes from `API_URL` (default `http://localhost:3000`).

---

## 4. Linting and formatting (`bun lint`)

```jsonc
"lint": "biome format --write . && eslint . --fix --max-warnings 0 --cache && tsc -b && knip && jscpd && depcruise apps e2e && bun run db:check"
```
(the order follows the reference: formatting → autofix → types → dead code → duplication → architecture. `lint:ci` is the same thing, and CI additionally checks `git diff --exit-code`.)

### 4.1 TypeScript
`tsconfig.base.json` extends `@tsconfig/strictest` (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noPropertyAccessFromIndexSignature, noFallthroughCasesInSwitch, noImplicitReturns, noUnusedLocals/Parameters, useUnknownInCatchVariables, checkJs) + `verbatimModuleSyntax`, `isolatedModules`, `moduleDetection: force`, `module: Preserve`, `moduleResolution: bundler`, `noEmit`, `erasableSyntaxOnly` (no enum/namespace/parameter properties — plain TS that Bun/Vite strip without transformation). `skipLibCheck: true` is the only concession (third-party .d.ts). Project references: `apps/api`, `apps/web`, `e2e`, root configs → `tsc -b`.

### 4.2 ESLint (flat config, one file)
Base: `@eslint/js` recommended + `typescript-eslint` **strictTypeChecked + stylisticTypeChecked** (projectService).
Explicitly enabled/tuned:
- `no-floating-promises`, `no-misused-promises` (with `checksVoidReturn.attributes: false` for JSX handlers — as in the reference), `switch-exhaustiveness-check` (`requireDefaultForNonUnion: true`, `considerDefaultExhaustiveForUnions: false`), `strict-boolean-expressions` (strict: without allowNullableObject… defaults), `no-unnecessary-condition`, `prefer-nullish-coalescing`, `no-explicit-any`, the whole `no-unsafe-*` family, `consistent-type-imports` (inline), `explicit-module-boundary-types` (off for `*.tsx` components — the return type JSX.Element is noise, as in the reference), `consistent-type-definitions: type` (we choose `type`: unions/intersections are ubiquitous in the domain; the reference uses `interface`, but for a Result/union domain `type` is more uniform), `no-non-null-assertion: error` (stricter than the reference), `prefer-readonly`, `naming-convention` (types PascalCase; variables camelCase/UPPER_CASE; React components PascalCase; is/has prefixes for booleans are NOT required — too noisy with DB/DTO fields).
- Core: `curly: all`, `eqeqeq`, `no-console` (except `shared/logger`, scripts), `no-param-reassign`, `prefer-const`, `object-shorthand`, `no-restricted-syntax` (ban `enum`, `export *`, `for…in`).
- Sizes (WPS-style): `complexity: 10`, `max-depth: 3`, `max-params: 3` (DI via an object), `max-statements: 15`, `max-lines-per-function: 60` (80 for tsx), `max-lines: 300`, `max-nested-callbacks: 3`. Relaxed in tests (`max-lines-per-function` off, since describe blocks are long).
- **unicorn** (recommended) — disabled with reasons: `no-null` (JSON/DB/React use null), `prevent-abbreviations` (fights `db`, `props`, `params` — noise), `filename-case` (check-file handles it), `no-array-reduce` (kept on!), `prefer-top-level-await` on.
- **sonarjs** (recommended): cognitive-complexity 10, no-identical-functions, no-duplicate-string (threshold 3, off in tests).
- **functional** — only for `**/domain/**` and `**/application/**`: `no-let`, `immutable-data`, `no-classes`, `no-this-expressions`, `no-throw-statements`, `prefer-readonly-type` → via `readonly` in types (`functional/type-declaration-immutability` is too noisy — off). Outside the domain it's off (React/Elysia/Drizzle are imperative).
- **import-x**: `no-cycle`, `no-duplicates`, `no-default-export` (exceptions: `*.config.ts`, `eslint.config.ts`, `vite/vitest/playwright/drizzle` configs — they require default), `no-extraneous-dependencies` (per workspace), `no-self-import`, `no-useless-path-segments`, `no-relative-packages`, `no-namespace` (a single override: `shared/db/schema.ts` consumers use `import * as schema` — drizzle requires a schema object). Import sorting is left to perfectionist (import-x/order off to avoid conflicts).
- **perfectionist**: `sort-imports`, `sort-named-imports`, `sort-named-exports`, `sort-exports`, `sort-union-types`, `sort-intersection-types`, `sort-jsx-props`, `sort-heritage-clauses`. **Not enabled:** `sort-objects`, `sort-interfaces`, `sort-object-types`, `sort-classes` — they break semantic order (id first, table columns, config keys) → "worse", deliberately off (documented in linting.md).
- **check-file**: `filename-naming-convention` kebab-case for `**/*.{ts,tsx}` (ignoring the middle extension `.test`, `.int.test`, `.e2e`), `folder-naming-convention` kebab-case; `no-index`… (index.ts barrels are banned: `check-file/no-index` in src) → imports point to concrete files.
- **promise** (recommended; `always-return` off — conflicts with async/await style), `prefer-await-to-then`, `prefer-await-to-callbacks`.
- **regexp** (recommended), **security** (recommended; `detect-object-injection` off — false positives on every `obj[key]` in typed code, documented).
- **@eslint-community/eslint-comments**: `require-description`, `no-unused-disable`, `no-unlimited-disable`.
- **React** (only `apps/web/**/*.tsx`): `react-hooks` (recommended-latest + React Compiler rules), `@eslint-react` (recommended-type-checked), `jsx-a11y` (**strict**).
- **Tests**: `@vitest/eslint-plugin` (web), `eslint-plugin-testing-library` (react config, web component tests), `eslint-plugin-playwright` (e2e), for `bun:test` — the same size relaxations.
- **shadcn/ui** (`apps/web/src/shared/ui/**`): generated code is linted too, but with a relaxed override block (it doesn't pass strictTypeChecked/unicorn/functional/size rules untouched): off are `max-lines*`, `unicorn/*`-noise, `@typescript-eslint/explicit-module-boundary-types`, perfectionist jsx-props; type safety rules (`no-unsafe-*`, `no-explicit-any`) stay on. The list of relaxations sits in one block with a comment explaining why.
- **eslint-plugin-better-tailwindcss** (web): class sorting, duplicates, unknown classes, conflicting classes (Tailwind 4 entry = `src/styles.css`).
- `eslint-config-prettier` at the end — disables purely formatting rules (including unicorn's) that conflict with the Biome formatter. **Not** `eslint-config-biome`: it disables the ESLint rules that the *Biome linter* duplicates, but our Biome linter is off → we'd silently lose checks.

### 4.3 Biome — formatter only
`biome.json`: `formatter.enabled: true`, `formatter.indentStyle: "space"` (default is tab!), `indentWidth: 2`, `lineWidth: 100`, `linter.enabled: false`, `assist.enabled: false` (otherwise organizeImports conflicts with perfectionist), `vcs.enabled/useIgnoreFile: true`, `css.parser.tailwindDirectives: true`, JS: double quotes, trailingCommas all, semicolons always (= Prettier defaults). Formats ts/tsx/js/json/jsonc/css. Markdown/YAML aren't formatted by Biome — acceptable (editorconfig covers whitespace). Tailwind class sorting is done by the ESLint plugin (§4.2), not Biome's nursery `useSortedClasses` (unsafe fix, no config).
Generators (`drizzle-kit generate`, `auth generate`, `shadcn add`) → their output goes through `bun lint`, otherwise the CI diff check fails; `db:generate` does it automatically.

### 4.4 knip
Workspaces `apps/api` (entry `src/main.ts`, `src/scripts/*.ts`, tests + preload), `apps/web` (Vite/Vitest plugins auto-detected), root (playwright, eslint, biome, drizzle, dependency-cruiser — knip has plugins for all of these). No plugins for better-auth/shadcn/jscpd → pointwise: `ignore` for unused shadcn exports in `shared/ui/**` (the generator exports subcomponents that aren't all used), `ignoreDependencies` for CLIs that run via bunx. `ignoreExportsUsedInFile: true`; the `App` type export is detected through the web import. Any other ignore only comes with a justifying comment.

### 4.5 jscpd
`.jscpd.json`: `minTokens: 50`, `threshold: 0` (any duplicate → fail), `ignore`: `**/drizzle/**` (migrations), `**/shared/ui/**` (shadcn), `**/*.test.*` (tests are allowed explicit repetition — deliberate, DAMP > DRY), reporters `console`.

### 4.6 dependency-cruiser (architecture)
Rules (`forbidden`, severity error):
1. `domain` → only `domain` of the same feature and `shared/result`. No `elysia`, `drizzle-orm`, `better-auth`, `bun`, `node:*`.
2. `application` → `domain` (own feature), `shared/{result,clock}`, `auth/current-user` (type). No infrastructure/http/libraries.
3. `infrastructure` → application (ports), domain, `shared/db`. Not http.
4. `http` → application, domain, `auth/auth-plugin`, `shared`. Not infrastructure (only through injected ports).
5. Features don't import each other (`features/A` ↛ `features/B`).
6. `apps/web` → `@template/api` **type-only** (`dependencyTypesNot: ["type-only"]` is forbidden); any other api imports are banned.
7. `no-circular`, `no-orphans` (except configs/d.ts), `not-to-test` (prod code doesn't import tests), `not-to-dev-dep` (prod code doesn't import devDependencies).

### 4.7 Hooks
`lefthook`: pre-commit → `bun lint` (full, it's fast enough thanks to the cache; an option on staged files is documented), pre-push → `bun test:unit`. Installation via `prepare`.

---

## 5. Tests (the pyramid)

| Level | Tool | What | Where |
|---|---|---|---|
| Unit | `bun test` + `fast-check` | Only non-trivial pure logic: the feed cursor (property: roundtrip, rejecting garbage/tampered input), post body validation (Unicode: emoji/grapheme clusters vs `length`, trim, limit), use cases with non-trivial branches (delete-by-non-author, like on a missing post) — with fake in-memory repositories. **We don't test**: DTOs, Drizzle mappings, trivial routes, shadcn. | next to the code `*.test.ts` |
| Component | Vitest + RTL + user-event + jest-dom, jsdom | Components with logic: the composer (length counter, disabled submit, showing server errors), the like button (optimistic update + rollback on error), the auth form (validation, redirect `next`). Network is replaced by mocking the `api-client` module (`vi.mock`) — dumb components aren't tested. | `apps/web/src/**/*.test.tsx` |
| Integration | `bun test` + **Testcontainers** (`postgres:17-alpine`) | Real stack: container PG → **real migrations** → `createApp` with real dependencies → `app.listen(0)` → **Eden treaty over HTTP** (it tests the SDK too). Scenarios: sign-up/sign-in/sign-out/me, 401 without a session, create/validation (400)/feed with pagination and likedByMe, likes idempotency, 403 deleting someone else's post, 404, cascading deletes, migrations on an empty DB + a re-run = no-op. Isolation: `TRUNCATE … CASCADE` in `beforeEach`, one container per run (global preload). | `apps/api/tests/integration/*.int.test.ts` |
| E2E | Playwright (chromium) + `@axe-core/playwright` | User scenarios through the UI: sign-up → feed → post → like → reload (persistence) → sign-out → sign-in; a second user sees the post and the like count; the guard redirects a guest; a11y scan of every page (0 violations of level serious/critical). | `e2e/*.e2e.ts` |

Extra "maximum quality" (beyond the pyramid):
- **Coverage thresholds**: api unit+integration ≥ 90% lines (bunfig `coverageThreshold`), web ≥ 80% on components with logic (vitest `coverage.thresholds`).
- **Property-based** tests (fast-check) for parsers/cursors.
- **Mutation testing** (Stryker, `@stryker-mutator/core` + vitest-runner for web; for bun test via the command-runner) — the `bun test:mutation` script, **not in** the fast CI (slow), run weekly on a schedule / by hand. *Optional — see the questions.*
- **A11y**: jsx-a11y strict (static) + axe in e2e (runtime).
- **Contract**: Eden = compile-time contract; plus a snapshot of the OpenAPI spec (`/api/docs/json`) in the integration test → a public API change is visible in the diff.
- **Schema ↔ migrations in sync** in CI.
- **`bun audit`** in CI (vulnerable dependencies), Dependabot/Renovate for updates (`.github/dependabot.yml`).
- **Docker smoke**: in CI `docker compose up --wait` + `curl /api/health/ready` + a Playwright smoke against the compose stack.

Test commands (important: plain `bun test` from the root would pick up **every** `*.test.*`/`*.spec.*`, including Vitest and Playwright files → never run it from the root without a path; the root `test` script is a chain of explicit commands):
- `bun test:unit` → `bun --cwd apps/api test ./src` + `bun --cwd apps/web vitest run`
- `bun test:integration` → `bun --cwd apps/api test ./tests/integration --preload ./tests/integration/preload.ts` (needs Docker; without `--parallel/--isolate`)
- `bun test:e2e` → `playwright test` (webServer: Testcontainers-free option — PG from `docker compose -f docker-compose.dev.yml up -d db`, API `bun run apps/api/src/main.ts`, web `vite preview` with a proxy; in CI — PG as a service container)
- `bun test` (root) → all of the above in order.

---

## 6. Docker / docker-compose
- `apps/api/Dockerfile`: multi-stage `oven/bun:1.3-alpine`: `bun install --frozen-lockfile --production --filter @template/api` → runtime without dev dependencies, `USER bun`, `HEALTHCHECK` on `/api/health`, `CMD ["bun", "src/main.ts"]` (migrations are applied at startup).
- `apps/web/Dockerfile`: build `bun run --filter @template/web build` → `nginx:alpine` with `nginx.conf` (SPA fallback, `/api` → `api:3000`, cache headers for assets, security headers).
- `docker-compose.yml`: `db` (postgres:17-alpine, healthcheck `pg_isready`, volume), `api` (depends_on db healthy, env from `.env`), `web` (depends_on api healthy, port 8080).
- `docker-compose.dev.yml`: just `db` on 5432 for local `bun dev`.
- `.dockerignore`.

## 7. CI (`.github/workflows/ci.yml`)
Triggers: `pull_request` + `push: main` + `workflow_dispatch`. **Not `pull_request_target`** (as in the reference): it checks out fork code with access to secrets — a vulnerability. `permissions: contents: read` by default, `concurrency` with cancel for PRs.
Jobs (in parallel, on a shared setup action with a node_modules cache, as in the reference):
1. `lint` — `bun lint` + `test -z "$(git status --porcelain)"` (catches both changed and new files).
2. `unit` — api `bun test src --coverage`, web `vitest run --coverage`.
3. `integration` — `bun test:integration` (Docker is available on ubuntu-latest → Testcontainers).
4. `e2e` — PG service container, `playwright test`, report artifact on failure.
5. `docker` — build images, `docker compose up --wait`, health smoke.
6. `audit` — `bun audit`.

## 8. Documentation
- `README.md`: what it is, stack, quickstart (`bun install`, `docker compose -f docker-compose.dev.yml up -d`, `cp .env.example .env`, `bun dev`), a table of commands, links to docs/.
- `docs/architecture.md`: the layer diagram, dependency rules (and that depcruise enforces them), **"How to add a feature"** — a step-by-step guide on `example-posts`: domain → port → use case → drizzle table → migration → repository → http routes + schemas → web queries → components → tests of every level.
- `docs/migrations.md`, `docs/testing.md`, `docs/linting.md` (why every non-obvious rule is enabled/disabled).
- **"Starting your own project" (README section)**: 1) delete everything containing `example` (`apps/api/src/features/example-posts`, `apps/web/src/features/example-posts`, `e2e/example-*.e2e.ts`, the route in `router.tsx`, the registration in `app.ts`/`schema.ts`); 2) `bun db:generate --name drop-example` (or reset migrations if the project is new — both options described); 3) `bun lint && bun test`; 4) rename `@template/*`. Command to check: `git grep -il example` must return nothing.
- `CLAUDE.md` (+ `AGENTS.md` symlink): rules for agents (Bun only, `bun lint` after changes, TDD, don't edit auth-schema/migrations by hand, architectural boundaries).

---

## 9. Implementation order (tasks; each = TDD cycle + `bun lint` green + commit)

0. **Spike (throwaway, not committed)**: minimal Elysia app + better-auth plugin at the root + one route with `t.Object` → `treaty<App>` in a web-like workspace under `@tsconfig/strictest` (`exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`) with TS 6.0.3 → `tsc -b` is green and the response types are not `any`. If it breaks — decide *before* scaffolding (options: narrow `// @ts-expect-error` with a link to the issue in one adapter file, or turning off `exactOptionalPropertyTypes` only in web's tsconfig with a documented reason), and I'll report back to you.
1. **Scaffolding and tooling**: root package.json/workspaces, tsconfig base/references, biome, eslint.config.ts (all plugins), knip, jscpd, depcruise, lefthook, editorconfig; empty apps with a trivial entry point. Verify: `bun lint` is green; a deliberately broken file → every tool catches its own class of error (floating promise, any, cycle, domain→drizzle import, duplicate, wrong file name).
2. **API base**: config (+ unit test for validation — non-trivial: secret, URL), Result, db client, migrate, health routes, main.ts with graceful shutdown. Integration harness on Testcontainers + `migrations.int.test.ts`, `health.int.test.ts`.
3. **Auth**: better-auth + drizzle adapter, CLI-generated schema, first migration `0000_auth`, auth-plugin with the macro. Integration: sign-up/in/out/get-session, 401.
4. **Example domain**: cursor (property tests), post validation (unit), errors, Result use cases with fake repositories (unit, only non-trivial branches).
5. **Example infrastructure + HTTP**: tables, migration `0001_example_posts`, repository, routes/schemas, OpenAPI. Integration tests for every scenario from §5. OpenAPI snapshot.
6. **Web base**: Vite/Tailwind/shadcn init (components brought to our lint rules), router, query client, api-client + unwrap, auth-client, sign-in/sign-up pages, guards. Component tests for auth-form.
7. **Web example-posts**: feed, composer, card, like button (optimistic), deletion. Component tests.
8. **E2E**: playwright.config (webServer), fixtures (unique user per test), scenarios + axe.
9. **Docker**: Dockerfiles, compose, nginx, smoke.
10. **CI**: workflow + setup action + dependabot.
11. **Docs**: README, docs/*, CLAUDE.md, the "Starting your own project" section; a trial run: in a temporary branch delete everything with `example` per the instructions → `bun lint && bun test:unit` are green (checks that the template actually separates cleanly).
12. **Final review** (superpowers:requesting-code-review — a fresh reviewer agent over the whole branch) + fixes.

## Review Focus (what's easy to break and not obvious from the spec — each item has its own test)
1. **Session cookie across origins/proxies**: sign-in via vite preview/nginx proxy → the cookie is set and sent on `/api/*` (e2e: reload after sign-in keeps the session; integration: `Set-Cookie` has `HttpOnly; SameSite=Lax; Path=/`).
2. **Unicode in posts**: 500 "characters" = grapheme clusters, not UTF-16 units (emoji/ZWJ); whitespace-only body → 400; consistent between client counter, server validation and the DB check (unit + component + integration).
3. **Feed pagination with identical `created_at`** (same-millisecond inserts): no duplicates/gaps on page boundaries — keyset on `(created_at, id)` (integration test with a fixed clock).
4. **Races on likes**: parallel PUT/DELETE of a like → no 500s, the count is correct (integration: `Promise.all` of 10 PUTs → 1 row).
5. **Invalid/tampered cursor, non-uuid `:id`** → 400, not 500 (property + integration).

## Defaults I'm choosing myself (easy to change during review)
- Mutation testing (Stryker): **the script and config exist, but not in mandatory CI** — a separate workflow on `workflow_dispatch` + a weekly cron.
- lefthook pre-commit = full `bun lint` (with eslint cache); pre-push = `bun test:unit`.
- Postgres 17 in compose/Testcontainers (the local verification here is on 16 — the schema doesn't use 17-only features).
- Post length limit 500, feed page 20 (max 50).
- Password ≥ 8 characters (better-auth default), email verification off (documented where to turn it on).

## 10. Verification (verification-before-completion)
In this cloud container there is **no Docker daemon**, but PostgreSQL 16 and Chromium are available. So here:
- `bun lint` — green; plus the "negative tests" of each tool from task 1.
- `bun test:unit`, `vitest run` — green, coverage above the thresholds.
- Integration: the harness supports `TEST_DATABASE_URL` as a fallback (if set, it uses an existing PG instead of Testcontainers, creating a fresh unique DB per run) → run against the local PG 16 here. Testcontainers mode will be checked in CI (the first push) — I'll say so honestly in the report.
- E2E: local PG + api + vite preview + Chromium from `/opt/pw-browsers` → `playwright test` green, axe with no violations.
- Docker: `docker compose config` (syntax); the image build itself — in CI.
- Manually: launch the app, walk through the scenario with Playwright screenshots.
- After push: watch CI to green (all 6 jobs).
