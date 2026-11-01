# Testing

Every level tests what the others cannot. Behaviour changes start with a failing test
(see [CONTRIBUTING.md](../CONTRIBUTING.md)).
The composer's `canAdd` is one predicate shared by button enablement and the action;
action-level tests check that every enabled draft is accepted from each entry path.

| Level | Tool | Runs against | Where | Command |
|---|---|---|---|---|
| Core unit | Vitest, fast-check | pure functions: schemas, materializer, reducers, i18n, tokens | `packages/core/src/**/*.test.ts` | `bun test:unit` |
| Client unit | Vitest | API client, auth, app state and sync on memory adapters and the fake `fetch` from `@pace/client/testing` | `packages/client/src/**/*.test.ts` | `bun test:unit` |
| API | Vitest + `@cloudflare/vitest-plugin` | the Worker inside workerd with real D1, KV and Durable Object bindings | `apps/api/src/**/*.test.ts`, `apps/api/tests/*.int.test.ts` | `bun test:api` |
| App | jest-expo (Jest 29), React Native Testing Library 14 | React Native components and platform adapters | `apps/app/**/*.test.{ts,tsx}` | `bun test:app` |
| End-to-end | Playwright + axe | the production web build against `wrangler dev` in Chromium | `e2e/*.e2e.ts` | `bun test:e2e` |
| Mutation | Stryker | the core tests themselves | `packages/core` | `bun test:mutation` (on demand in CI) |
| LLM regression | own runner | the parsing prompt against real providers | planned for stage 2 | `bun test:llm` (script exists, runner does not yet) |

`bun run test` runs unit → api → app → e2e. CI (`ci.yml`) runs lint, unit, app and api in one job (each job pays its own install, and minutes are rationed), then e2e once that passes.

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
Order-insensitivity and similar invariants use **fast-check** properties. Among them:
every deterministic id builder at its longest fits the sync's `EVENT_ID_MAX` (`ids.test.ts`);
the automatic sleep rules (`tracking/sleep-auto.test.ts`) reach the same answer whether a night is
decided once or pass by pass under late and shrinking uploads, never walk an end the person set
and never undo on less knowledge; a series made at any minute starts its next instance at 00:00
of a later day, or at the start's own time of day when the person chose one
(`recurrence/series-instances.test.ts`, Europe/Moscow).

The client's sync tests (`sync-client.test.ts`) run one code path over both transports: HTTP
through the fake `fetch`, the live socket's `pace.v2` through `fake-socket.fake.ts`; they pin the
store id resets, a page the socket sends unasked, a lost `pushed` answer, and the one-time re-pull
from 0 after an update that reads more of the log (outbox kept, no second re-pull).

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
isolation; the store id (stable, new after a wipe, an old epoch emptied on start).
Phase C added: `instance.int.test.ts` (`GET /api/instance` without a token, the protocol header
and `426 client/outdated`); `sessions.int.test.ts` (the one sessions list with agents and MCP
grants, revoke by id, an agent's token may not list); `login-notice.int.test.ts` (the sign-in
notice's text from what Cloudflare reported, the deep link's one edited message, Not me from
Telegram, the phone and the feed, double presses and polls at once, groups refused);
`live.int.test.ts` (v1 `changed` and `pace.v2` push, pull, unasked events, `more` for a big
batch, bad requests; every revoke path closing the session's sockets, late upgrades refused);
`sleep.int.test.ts` and `user-store/sleep-pass.test.ts` (automatic sleep opened, stopped,
reopened and discarded from the system path, idempotent across uploads and alarms, each decision
logged); `cloud.int.test.ts` (use intervals and how far each phone read); `alarm.test.ts` (one
shared alarm only moved earlier); `migrations.int.test.ts` (no migration drops what the previous
release still reads).

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

Every test starts on an account of its own: `loginViaApi` (`e2e/support/login.ts`) takes the
next id of the worker's whitelisted block and deletes that account first (`DELETE /api/test/account`),
so parallel tests, `--repeat-each` and reruns against a reused server never share state.

### Every screen, on real-looking data

Feature tests start from an empty account, so they never see what months of use put in the
log. `e2e/route-sweep.e2e.ts` closes that gap: `seedLivedIn` (`e2e/support/seed.ts`) pushes a
log with Russian text, projects, open, future and closed tasks, a monthly series, activities, preset edits,
corrections and every event type at least once (it fails if `EVENT_TYPES` grows a type the
seed lacks), then the sweep opens every route file under `apps/app/app` by a direct load, at
390 and 1440 px. It fails on a thrown error or a `console.error`, a blank page, the crash
screen, or a desktop screen without the sidebar. Rules that follow from it:

- a new screen needs no test entry, but a new event type needs a line in the seed;
- a dynamic translation key is never built with `as MessageKey` (a lint rule forbids it):
  map the value with a typed `Record` (as `EVENT_LABEL_KEYS` does), so a missing label
  fails the type check, and `i18n.test.ts` checks every event type has one;
- a render error never blanks the app: `app/_layout.tsx` exports the `ErrorBoundary` that
  shows the crash screen, and `t()` answers a missing key with the key itself.

Tests are in `e2e/*.e2e.ts`; `e2e/support/fixtures.ts` adds `expectNoA11yViolations`
(axe, WCAG 2.2 AA, fails on serious/critical). Every page gets a scan. Failures keep a
trace and a screenshot; CI uploads `playwright-report/`.

### The design review matrix

`e2e/design-shots.e2e.ts` is not a test of behaviour: it shoots every route plus the sheets,
dialogs, pickers, toasts, empty, loading, error and offline states and a keyboard-focus pass at
1440×900 and 390×844, light and dark, English and Russian (8 combos, Telegram ids 3300–3315).
It is off by default (the regular run skips it); `DESIGN_SHOTS=<dir>` turns it on, and
`DESIGN_SHOTS_ONLY=<groups>` / `DESIGN_SHOTS_STATES=<names>` narrow it. A control it cannot find
is listed in `<dir>/manifest-<combo>.json` instead of failing the run. See
[qa.md](qa.md#the-design-review-matrix) for when to re-shoot it.

- Browser: `bunx playwright install --with-deps chromium`, or set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` to use an installed one (sandboxes).
- `E2E_BASE_URL=https://pace.nalinor.dev bun test:e2e` runs the suite against a deployed
  stack without starting anything.
- Locally the servers are reused if already running (`reuseExistingServer`); the accounts
  are reset at each login, so a reused API is fine. A reused web build is not rebuilt: stop
  the server (or `bun run build`) after changing the app.

## Mutation testing

Coverage shows what ran, not what was checked. Stryker (`stryker.config.json` in
`packages/core`) mutates the code and expects the tests to fail. It is
slow, so `mutation.yml` runs it weekly and on demand; reports land in `reports/`.

## LLM regression (planned)

The cases are in `packages/core/src/parse/regression/cases.fake.ts`: a message, the field it was
typed into (`task`, `activity` or `auto`), the instant over the artboard world, and the
proposals expected (kinds in order, fields of the first, the domain and how sure for `auto`).
`cases.test.ts` keeps them well-formed in `bun test:unit`. The runner (`run.ts`) is still to
come: `bun test:llm` will run them against the configured OpenAI-compatible endpoint and write
`docs/llm.md`. `llm-regression.yml` is on demand and reads the same endpoint variables.
