# Testing

Every level tests what the others cannot. Behaviour changes start with a failing test
(see [CONTRIBUTING.md](../CONTRIBUTING.md)).

| Level | Tool | Runs against | Where | Command |
|---|---|---|---|---|
| Core unit | Vitest, fast-check | pure functions: schemas, materializer, reducers, i18n, tokens | `packages/core/src/**/*.test.ts` | `bun test:unit` |
| Client unit | Vitest | API client, auth, app state and sync on memory adapters and the fake `fetch` from `@pace/client/testing` | `packages/client/src/**/*.test.ts` | `bun test:unit` |
| API | Vitest + `@cloudflare/vitest-plugin` | the Worker inside workerd with real D1, KV and Durable Object bindings | `apps/api/src/**/*.test.ts`, `apps/api/tests/*.int.test.ts` | `bun test:api` |
| App | jest-expo (Jest 29), React Native Testing Library 14 | React Native components and platform adapters | `apps/app/**/*.test.{ts,tsx}` | `bun test:app` |
| End-to-end | Playwright + axe | the production web build against `wrangler dev` in Chromium | `e2e/*.e2e.ts` | `bun test:e2e` |
| Mutation | Stryker | the core tests themselves | `packages/core` | `bun test:mutation` (on demand in CI) |
| LLM regression | own runner | the parsing prompt against real providers | planned for stage 2 | `bun test:llm` (script exists, runner does not yet) |

`bun test` runs unit → api → app → e2e. CI (`ci.yml`) runs lint, unit, app and api in one job (each job pays its own install, and minutes are rationed), then e2e once that passes.

## Unit tests (core, client)

`vitest run --coverage` in each package with thresholds (core: 90% lines/statements/
functions, 85% branches; client: 80% branches). Test only non-trivial logic; glue is
covered by the API and e2e levels.

What is tested in core today: `parseEvent` round-trips and rejections (unknown type,
bad id, missing `dueTz`), `sortEvents`, the materializer (corrections, revoked
revocations, amendments that would break the schema, `materializeAt`,
`shouldRematerialize`), the settings reducer, `t`/`plural`/`formatDuration`/
`formatRelativeDay`, catalog parity (`en` and `ru` have the same keys, placeholders and
no empty strings), palette contrast ratios, time-zone helpers, deterministic ids.
Order-insensitivity and similar invariants use **fast-check** properties.

## API tests (workerd)

`apps/api/vitest.config.ts` uses `cloudflareTest` with `wrangler.jsonc`, so the tests run
in the real runtime with real bindings: D1 (`DB`), KV (`OAUTH_KV`) and the `UserStore`
Durable Object. Nothing is mocked except the outside world:

- `tests/setup.ts` runs before every test file and applies the committed D1 migrations
  (`readD1Migrations("drizzle/d1")` in the config → `applyD1Migrations(env.DB, …)`), so
  each file starts from an empty, fully migrated database. The Durable Object migrates
  itself in its constructor.
- The config injects test bindings: `ENVIRONMENT=test` (so `/api/auth/dev` exists),
  whitelist `1001,1002`, a fake `TELEGRAM_BOT_TOKEN` the widget tests sign their own
  payloads with, `TELEGRAM_WEBHOOK_SECRET`, `BOT_INFO`, and
  `TELEGRAM_API_ROOT=https://telegram.test` so outgoing bot calls are intercepted with
  `fetchMock` instead of reaching Telegram.
- `tests/helpers.ts`: `call(path, { body, token })` sends a request to the Worker through
  `exports.default.fetch` (the Worker calls itself), `json()` parses, `loginAsDev(id)`
  returns a bearer.
- Unit-sized tests next to the code (`src/auth/*.test.ts`, `src/user-store/*.test.ts`)
  run in the same runtime, so they can use D1 directly where it is cheaper than HTTP.

Covered today: health and the JSON 404; widget signature (valid vector, tampered,
wrong bot, stale); whitelist; nonce lifecycle (pending → ready once, expiry, double
bind); sessions (token never stored, revoke, hourly touch); dev login 404 in production;
webhook secret check, login deep link, "Not allowed", expired link; sync push/pull
ordering, idempotent re-push, paging, `recordedAt` clamping, partial rejection, user
isolation; observations idempotency.

## App tests (jest-expo)

`bun run --cwd apps/app test` runs `jest` with the `jest-expo` preset (Jest 29, since
Vitest cannot render React Native). It runs under Node through the binary's shebang —
never with `bun --bun`. `jest.setup.ts` registers the RNTL matchers; `.bun` is in
`transformIgnorePatterns` so workspace packages are transformed. Native modules are
mocked at the Expo module boundary; the pure logic they drive lives in `@pace/client`
and is tested there. The same screens are the web app, so these tests cover both; jest
renders the native files, and the `.web.tsx` variants are covered by the e2e run. Query by
role and state the way a screen reader sees it: chips and segments are `radio`s
(`checked`), time-bar activities `switch`es, the row check a `checkbox`.

## End-to-end

`playwright.config.ts` starts two servers unless `E2E_BASE_URL` is set:

1. the API: `bun run --cwd apps/api dev -- --env dev --var ENVIRONMENT:test --var
   WEB_ORIGIN:<web url>` (wrangler dev, port 8787, local D1/KV/DO, dev login enabled);
2. the web: `bun run --cwd apps/app build:web` (Expo web export + service worker, with
   `EXPO_PUBLIC_API_URL=http://localhost:8787` and `EXPO_PUBLIC_DEV_LOGIN=1`), served as a
   single-page app by `scripts/serve-web.ts` (port 4173).

Tests are in `e2e/*.e2e.ts`; `e2e/support/fixtures.ts` adds `expectNoA11yViolations`
(axe, WCAG 2.2 AA, fails on serious/critical). Every page gets a scan. Failures keep a
trace and a screenshot; CI uploads `playwright-report/`.

- Browser: `bunx playwright install --with-deps chromium`, or set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` to use an installed one (sandboxes).
- `E2E_BASE_URL=https://pace.nalinor.dev bun test:e2e` runs the suite against a deployed
  stack without starting anything.
- Locally the servers are reused if already running (`reuseExistingServer`). A reused API
  keeps its data between runs (CI always starts clean), so a rerun can meet yesterday's
  tasks and settings: stop it, or delete `.cache/e2e-state`, for a clean run.

## Mutation testing

Coverage shows what ran, not what was checked. Stryker (`stryker.config.json` in
`packages/core`) mutates the code and expects the tests to fail. It is
slow, so `mutation.yml` runs it weekly and on demand; reports land in `reports/`.

## LLM regression (planned)

Stage 2 adds `packages/core/src/parse/regression/` with cases and `run.ts`;
`bun test:llm` will run them against Groq and Gemini and write `docs/llm.md`.
`llm-regression.yml` already exists for it (weekly, with the provider secrets).
