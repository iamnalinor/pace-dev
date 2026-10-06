# Testing

A test pyramid in which **every level tests what the others cannot**, and nothing is
tested twice for the sake of numbers.

| Level | Tool | Runs against | Where | Command |
|---|---|---|---|---|
| Unit | `bun test`, fast-check | pure functions, use cases with fakes | `apps/api/src/**/*.test.ts` | `bun test:unit` |
| Component | Vitest, React Testing Library | components with logic, jsdom | `apps/web/src/**/*.test.tsx` | `bun test:unit` |
| Integration | `bun test`, Testcontainers | real HTTP server + real PostgreSQL + real migrations, via the Eden client | `apps/api/tests/integration/` | `bun test:integration` |
| End-to-end | Playwright, axe | production web build + API + PostgreSQL in Chromium | `e2e/` | `bun test:e2e` |
| Mutation | Stryker | the component tests themselves | — | `bun test:mutation` |

## Unit tests: only the non-trivial

Unit-test logic with real branches or tricky inputs; do **not** unit-test glue.

Tested here:
- `example-feed-cursor` — property-based (fast-check): `decode(encode(x)) = x` for any
  cursor; arbitrary strings never throw.
- `example-post` validation — Unicode: an emoji is one character (not two UTF-16 units),
  NFC normalization, whitespace-only bodies.
- use cases with real branching — delete by a non-author is `forbidden`, a missing post
  is `not-found` (not `forbidden`, which would leak existence); feed pagination's
  "one extra row" logic.
- `safeRedirectPath` — open-redirect protection (`//evil.com`, `/\evil.com`, `javascript:`).

Deliberately **not** unit-tested: DTO mappers, Drizzle queries, route wiring, shadcn/ui
components, pages that only compose other components. Integration and e2e tests cover
them in their real environment, where mocks cannot lie.

## Component tests (React Testing Library)

RTL renders a component in a simulated DOM (jsdom) and interacts with it **the way a
user would** — by role and label, not by CSS classes or internal state. Use it for
components with behaviour: the composer's character counter and validation, the
optimistic like with rollback, the sign-in redirect. Network calls are replaced by
mocking the Eden client module (`vi.mock("#web/shared/api/api-client.ts", ...)`).

`renderWithProviders()` (`src/test/render.tsx`) gives each test a fresh QueryClient and
a memory router.

## Integration tests (the API for real)

`tests/integration/preload.ts` runs once per test run:

1. starts PostgreSQL in a container (Testcontainers, `postgres:17-alpine`) — or, if
   `TEST_DATABASE_URL` is set, creates a fresh uniquely named database on that server
   (useful without Docker);
2. applies the real migrations.

Each test file starts the real app on a random port (`startTestApp()`) and calls it
**over HTTP through the same Eden client the web app uses**, so the SDK is tested too.
`beforeEach(app.truncate)` isolates tests. They cover what only a real database can
show: keyset pagination with identical timestamps, 10 concurrent likes, cascades,
constraint/validation agreement, sessions and cookies, 500s that do not leak SQL.

`openapi.int.test.ts` snapshots the OpenAPI document — any change to the public API
shows up in review; after an **intended** change run
`bun test:integration --update-snapshots` — and asserts at compile time that the Eden
client is precisely typed (not `any`).

## End-to-end tests

`playwright.config.ts` starts the API (migrating a dedicated `template_e2e` database)
and `vite preview` of the production build with the `/api` proxy — the same topology
as docker compose. Tests create a unique user each, so they run in parallel on a shared
database. Every page gets an axe scan (no serious or critical WCAG 2.2 AA violations).

Against an already running stack (skips starting servers):
`E2E_BASE_URL=http://localhost:8080 bun test:e2e` — CI does this against the docker
compose stack, so nginx, its CSP and headers are exercised in a real browser too.

Locally: `docker compose up -d db` first. In a sandbox without Playwright's own browser
build, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at an installed Chromium.

## Coverage and mutation testing

- API (`bun run --cwd apps/api test:coverage`, unit + integration): ≥ 90% of lines
  **per file** (Bun enforces thresholds per file).
- Web (`vitest --coverage`): ≥ 90% lines/statements, 85% functions, 75% branches —
  measured on **logic** only (components, hooks, helpers). Pages, layout, route guards
  and client setup are excluded because Playwright covers them.
- Coverage shows what ran, not what was checked. **Stryker** (`bun test:mutation`)
  mutates the web code and verifies the tests notice. It is slow, so CI runs it
  weekly (`.github/workflows/mutation.yml`), not on every push.
