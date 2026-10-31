# Phase C (PR 3): self-hosting, sessions, WebSocket sync, background check, automatic sleep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the infrastructure part of feedback round 4: the app connects to any compatible Pace server (19), one session system with login notices and Devices inline in Settings (9), sync over the live WebSocket with HTTP as fallback (20), notifications on phones without Google through a periodic background check (8c), and sleep recorded automatically on the server (14).

**Architecture:** Contract first in `packages/core` (protocol constants, `/api/instance`, `/api/sessions`, the live-socket message schemas, the pure sleep rules), the Worker mounts it (`mount()`), `@pace/client` gets one sync code path with two transports, `apps/app` gets the server picker, the Settings list, the background task and the battery step. Everything builds on PR 1/PR 2 groundwork that already exists: the notification pool with its `login` kind, the `poll` transport and `GET /api/push/poll`, `pushMethods` + `fcmProject`, the app's `PushMethod`/picker, the hibernating live socket, `usage_sessions`, and the tuned sleep heuristic in `packages/core/src/tracking/phone.ts`.

**Tech Stack:** Bun workspaces, TypeScript, zod, Hono on Cloudflare Workers (D1, KV, Durable Objects with hibernating WebSockets), drizzle, Expo 57 / React Native 0.86 / react-native-web, expo-background-task + expo-task-manager, a local Kotlin module (`apps/app/modules/pace-native`), Vitest + fast-check, `@cloudflare/vitest-pool-workers`, jest-expo, Playwright + axe.

**Spec:** `context/stage-8/briefs/task-19-brief.md`, `task-9-brief.md`, `task-20-brief.md`, `task-8c-brief.md`, `task-14-brief.md`; rules every implementer got: `context/stage-8/global.md`; later owner decisions that override the briefs: `context/stage-8/ledger.md` (and `context/stage-8/README.md`); the tuned sleep heuristic: `context/stage-8/pr2-checkpoint-2026-10-16.md` ("Обновление 2026-10-31") and bug class 39. Executors read the brief of their part next to this plan; where they differ, the **Rulings** section below wins.

## Global Constraints

Every task's requirements include these (from `CLAUDE.md`, `docs/architecture.md`, `docs/testing.md`, `context/bug-lessons.md`):

- Bun only: `bun install`, `bun add`, `bun run <script>`, `bunx <tool>`. Never npm/npx/yarn. `vitest`, `jest`, `expo`, `wrangler` run under Node through their shebang; never `--bun` on them.
- After every change run `bun lint` (it auto-fixes; it is format + ESLint + typecheck + Knip + jscpd + dependency-cruiser + `db:check`) and fix everything. Never run biome/eslint/tsc/knip separately. Never disable a rule inline without `-- <reason>`; never weaken a rule.
- TDD: the failing test first, at the level `docs/testing.md` names — `bun test:unit` (core, client), `bun test:api` (Worker in workerd with real D1/DO/KV), `bun test:app` (jest-expo), `bun test:e2e` (Playwright + axe, web build). Never skip or delete a failing test; deleting tests of removed behaviour is fine.
- e2e runs one file with `bunx playwright test e2e/<file>.e2e.ts`. If Playwright cannot find its browser, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at the Chrome under `/opt/pw-browsers/chromium-*/chrome-linux*/chrome`; never `playwright install`.
- Architecture (dependency-cruiser): `core` is pure and immutable and imports no workspace; `client` imports `core` and only the *types* of `api`; apps import `client`/`core`, never each other; API feature folders (`auth/`, `bot/`, `sync/`, `user-store/`, `oauth/`, `notify/`, `cloud/`…) share only through `apps/api/src/shared` or by composition in `app.ts`.
- Event sourcing: every change of user data is an immutable event; corrections are `event.amended` / `event.revoked`; projections are never written directly. Server-made events go through the store's system path (`source: "system"`, device `server`) with deterministic ids.
- Errors: pure code returns `Result<T, E>` with string-literal codes; HTTP maps them with an exhaustive `switch` (no `default`).
- Contract first: every route is a zod `endpoint()` in `packages/core/src/api/endpoints.ts` (or a group file it spreads, like `notification-endpoints.ts`), mounted with `mount(app, endpoint, handler)`. Read bindings from `c.env`, never at module scope. Request input strict, answers loose (`endpoint()` loosens outputs); lists a newer server can grow use `knownValues` / `knownValue` / `knownOrNull` (class 13).
- Database: change `apps/api/src/shared/db/d1-schema.ts` (D1) or `apps/api/src/user-store/schema.ts` (DO), then `bun db:generate`; review and commit the SQL. Never edit an applied migration or `apps/api/drizzle/**/meta/*` by hand.
- Every UI string through `t()` from `@pace/core`; EN in `packages/core/src/i18n/en/*.ts` is the source, RU in `packages/core/src/i18n/ru/*.ts` mirrors it key for key. User-entered content (task titles, device names, session names from the person) is never translated.
- App imports use `#app/*`; packages and API use relative imports.
- One UI for Android and the web: React Native screens in `apps/app`; web-only code in a `.web.tsx` sibling or `src/platform/web/` stand-ins (registered in `apps/app/metro.config.js` `WEB_SHIMS`); never `Platform.OS === "web"` for whole screens; never import a `.web.tsx` from its own base file. Phone-only UI checks `IS_PHONE`.
- Code, comments and identifiers in English; doc comments are full sentences explaining why, matching the surrounding density.
- Commits: clear messages, ending with exactly these two trailer lines (the controller's session attribution):
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_012GQdQQNa5JH2vQ1AuEs6Tx`
  Do not push. Implementers never dispatch subagents.
- Bug classes to write against (from `context/bug-lessons.md`; a reviewer checks each that applies): **1** one decision in one function read by UI and action; **2** every entry path tested; **9** time boundaries in Europe/Moscow, fast-check over offsets; **10** every phone control pressed in an app test; **12/13** server answers go through the endpoint's own output schema in tests, socket messages too; **15/16** provider refusals by body, identity handshakes compared on both sides; **17/18** a failed external action has a persisted retry, a permanent one does not loop; **19/24** progress and tokens carry the session (and now the server) they belong to, an account or server switch drops device state; **35/36** a confirmation owns its transition, a one-shot write has a synchronous latch; **38** deterministic ids from something that never repeats, test edit → undo → edit; **39** a platform signal is not the person's action, tune against real data, a day of frequent use never yields a sleep; **42** records shown to the person are worded through a view-model, no rule keys on screen.

## Review Focus

The failure modes the briefs imply but no brief test names, most likely first; each has its test in the owning task:

1. **A socket push that the server applied but whose `pushed` answer was lost** (the socket drops after the append): the HTTP fallback re-pushes the same events; the log must hold one copy and the outbox mark them synced once — Task 7 (server idempotence over the socket) and Task 8 (`drop after server applied → HTTP retry → one copy, outbox empty`).
2. **The app talking to a server that does not know the new contract** (production before the deploy, a self-hosted server on an older version: `/api/instance` answers 404) and an old client talking to the new server (no `X-Pace-Protocol` header, still calling the removed `/api/devices`): the new app must show the versions screen, not half-broken screens; the old client must keep working except its Devices screen's quiet error — Task 1 (no header accepted, 426 below the minimum) and Task 2 (404 instance → incompatible, network failure → not blocked).
3. **A token or queued work crossing a server switch** (a background check or upload in flight while the person changes server, a token stored for server A read for server B) — Task 2 (token stored with its origin; a different origin reads as signed out) and Task 9 (the background check builds its client from the stored server and token together).
4. **Automatic sleep at the boundaries of its windows and with late data**: a rest that starts at 20:59/21:00/05:00, a wake at 06:59/07:00, a phone whose last upload stops at 01:00, a computer upload arriving after a sleep was opened, Europe/Moscow and a DST zone — Task 12 (fixed scenarios plus fast-check properties: idempotent, never decides past `knownUntil`, a day of frequent use never yields a sleep).
5. **"Not me" pressed twice, or after the session already ended** (the person logged out on that device, or revoked it in Settings first): one revoke, the message ends as "Session ended", no error alert — Task 5.

---

## Rulings (conflicts between briefs, ledger and code)

1. **8c is mostly built.** The server `poll` transport, `poll_outbox`, `GET /api/push/poll`, `GET /api/push/methods` with `fcmProject`, the app's method choice (`registerPush`, `pushStore`, `setPushChoice`), the picker in Settings and the Firebase-project mismatch → poll with the reason shown (`settings.push.otherProject`) exist. Phase C adds only what is missing: the periodic background task (removed in PR 1 together with `expo-background-task`), the battery-optimization step and hint, and the copy. UnifiedPush and foreground-service placeholders: none found in code (`grep -ri unifiedpush apps packages` is empty); Task 10 re-checks.
2. **The background task runs on every signed-in phone, not only with `poll`.** It polls only when the method is `poll`, but it also uploads phone usage every ~15 minutes, which Task 14 needs at night on FCM phones as well. The battery step still shows only for `poll` (owner rule).
3. **Notifications already travel over the socket** (`notification`, `dismiss`, `read`, `push-methods-changed` on `pace.v1`). Task 20 moves only the sync hot path (push, proactive events, catch-up pull) and keeps the notices as they are on both subprotocols.
4. **Sleep constants: the tuned production numbers win** over the brief's (owner rules kept: a person's sleep start is respected; phone use ends a sleep and a short wake reopens it retroactively; a sleep opens even while a non-Rest activity runs; nothing is asked). Open after `REST_MIN_MINUTES = 45` minutes of known quiet (not 60); a short wake is the tuned wake-up: at most `WAKE_UP_MAX_MINUTES = 30`, starting before `WAKE_UP_UNTIL_HOUR = 7`, followed by `BACK_TO_SLEEP_MINUTES = 90` of known quiet (not 15/60); a sleep starts in 21:00–05:00 with the 21:00 floor (`bedtimeFloor`, not 20:00); the night is the noon-to-noon span (`NIGHT_UNTIL_HOUR = 12`). Because a 45-minute evening rest would otherwise leave a stray short sleep, an **automatic** sleep that ends with less than `SLEEP_MIN_MINUTES = 180` asleep is discarded (its start revoked), which frees the night for the next rest; a person's sleep is never discarded.
5. **What counts as use for sleep.** The server today only gets app foreground sessions, which include an alarm shown over the lock screen (class 39 says that is not use). The phone therefore also uploads its *use intervals* (the tuned `useIntervals`: unlocked spells and apps in front while unlocked) as `uses`, with `until` (how far it read). Use on any device counts (phone uses, computer agents' sessions, which are idle-aware), but decisions are bounded by the phones' `knownUntil` only: a computer that is switched off at night stops uploading, and the brief's "min over all devices" would then decide nothing until morning. No phone upload within 24 hours → nothing is decided.
6. **The phone-only sleep card goes** (`detectSleep`, `SleepCandidate`, the Day card, `sleepKey`), but its tuned pieces move to a shared module the server rules use; nothing is duplicated.
7. **Deterministic sleep ids** are built from the night and the start instant (`auto:sleep-<night>:start-<yyyyMMddTHHmm>`), not the night alone, because a discarded start may be followed by a new one the same night (class 38). Stops and reopens derive from the ids of the events they follow up.
8. **Login notice for the deep link, one message:** the bot replies at `/start` (as today, with "Return to Pace") and stores that message on the nonce row in the same write that binds it; when the app's poll creates the session, the pool's `login` notification *adopts* that message (edits it into the login text with [Return to Pace] [Not me]) instead of sending a second one. "Not me" is a pool answer (`revoked`) of the `login` kind, so it works the same from Telegram, the phone notification and the feed.
9. **Old clients:** a request without `X-Pace-Protocol` is accepted (cached web builds and v0.10 APKs keep working); the removed `GET/DELETE /api/devices` and `/api/oauth/grants` answer 404 to them (owner: breaking is fine). A new app that gets 404 from `/api/instance` treats the server as older than it supports.
10. **Change server is Android-only.** The web build is served by its own deployment, and the API's CORS admits only its own `WEB_ORIGIN`; letting a web page talk to another server would need every self-hoster to allow foreign origins. The login screen's server line lives in the native `login-screen.tsx` only (the `.web.tsx` sibling has none).
11. **Export data on Android stays hidden.** It would need `expo-file-system` + `expo-sharing` (new native modules after PR #41 slimmed the APK) for a secondary feature; the Settings row moves down as the brief asks and stays web-only. Reported to the owner in the PR text.
12. **Protocol numbers:** `PROTOCOL = 1`, `MIN_CLIENT_PROTOCOL = 1`, `MIN_SERVER_PROTOCOL = 1`. The `pace.v2` socket subprotocol is additive (v1 kept), so it does not bump `PROTOCOL`.
13. **"Add a computer does nothing on phones"** was fixed in PR 1 (class 10; `devices-screen.test.tsx` presses it). Task 6 keeps that test passing after the move into Settings instead of re-debugging it.

---

## Part 19 — self-hosting

### Task 1: Protocol constants, `GET /api/instance`, the `X-Pace-Protocol` header

**Files:**
- Create: `packages/core/src/api/protocol.ts`, `packages/core/src/api/protocol.test.ts`, `packages/core/src/api/schemas/instance.ts`
- Modify: `packages/core/src/api/endpoints.ts` (add `instance`), `packages/core/src/core.ts` (exports), `apps/api/src/app.ts` (protocol middleware, CORS `allowHeaders`, instance route), `apps/api/src/shared/config.ts` (`PACE_VERSION`, optional, default `"dev"`), `apps/api/wrangler.jsonc` (comment on `PACE_VERSION`), `.github/workflows/deploy.yml` (`--var PACE_VERSION:<tag or short sha>`), `apps/api/src/sync/sync-routes.ts` (the live route reads `?protocol=`), `packages/client/src/api-client.ts`, `packages/client/src/live.ts` (`liveUrl` adds `protocol`)
- Test: `apps/api/tests/instance.int.test.ts`, `packages/client/src/api-client.test.ts`, `packages/client/src/live.test.ts`

**Interfaces:**
- Produces (core):
  - `PROTOCOL = 1`, `MIN_CLIENT_PROTOCOL = 1`, `MIN_SERVER_PROTOCOL = 1`, `PROTOCOL_HEADER = "X-Pace-Protocol"`, `CLIENT_OUTDATED = "client/outdated"`.
  - `type Compatibility = "ok" | "server-outdated" | "client-outdated"`
  - `compatibility(server: { readonly protocol: number; readonly minClientProtocol: number }, client?: { readonly protocol: number; readonly minServerProtocol: number }): Compatibility` (client defaults to this build's constants).
  - `InstanceSchema` / `type Instance = { name: string; version: string; protocol: number; minClientProtocol: number; botUsername: string; webOrigin: string | null; apiOrigin: string; loginMethods: ("telegram-widget" | "telegram-deeplink")[]; features: { push: boolean; assistant: boolean } }` — `webOrigin` via `knownOrNull`, `loginMethods` via `knownValues`, `features` fields default `false` when absent.
  - `endpoints.instance`: `endpoint({ auth: false, method: "GET", path: "/api/instance", output: InstanceSchema })`.
- Produces (client): every `api.call` sends `X-Pace-Protocol: "1"`; a 426 surfaces as `ApiError { status: 426, code: "client/outdated" }`; `liveUrl(baseUrl, deviceId)` appends `&protocol=1`.

- [ ] **Step 1: Write the failing core test** — `protocol.test.ts`:
  - `compatibility({ protocol: 1, minClientProtocol: 1 })` → `"ok"`; `{ protocol: 0, minClientProtocol: 0 }` → `"server-outdated"`; `{ protocol: 3, minClientProtocol: 2 }` → `"client-outdated"`; a fast-check property: the result is `"ok"` iff `server.protocol >= client.minServerProtocol && client.protocol >= server.minClientProtocol`, and `server-outdated` wins when both fail.
- [ ] **Step 2: Run** `bun test:unit` → FAIL (module missing).
- [ ] **Step 3: Implement** `protocol.ts`, `schemas/instance.ts`, `endpoints.instance`, exports.
- [ ] **Step 4: Write the failing API test** — `instance.int.test.ts`:
  - `GET /api/instance` without a token → 200, parsed with `endpoints.instance.output` (class 12): `name === "Pace"`, `protocol === PROTOCOL`, `minClientProtocol === MIN_CLIENT_PROTOCOL`, `botUsername` = the test config's `TELEGRAM_BOT_USERNAME`, `webOrigin` = `WEB_ORIGIN`, `loginMethods` = `["telegram-widget", "telegram-deeplink"]`, `features.push === false` without FCM config, `features.assistant` follows the test LLM config, `version === "dev"` when `PACE_VERSION` is unset.
  - `GET /api/me` with a token and `X-Pace-Protocol: 0` → 426 `{ code: "client/outdated" }`; with `X-Pace-Protocol: 1` → 200; **without the header → 200** (Ruling 9); with `X-Pace-Protocol: abc` → 200 (unreadable = absent).
  - `GET /api/instance` and `GET /api/health` with `X-Pace-Protocol: 0` → 200 (never refused: the client must be able to learn why).
  - `OPTIONS /api/me` from `WEB_ORIGIN` lists `X-Pace-Protocol` in `Access-Control-Allow-Headers`.
  - `GET /api/sync/live?protocol=0` with a valid socket token → 426 `client/outdated`.
- [ ] **Step 5: Run** `bun test:api` → FAIL.
- [ ] **Step 6: Implement** the instance handler (`features.push` = `pushMethodsOf(...)` includes `fcm`; `features.assistant` = at least one LLM endpoint configured; `apiOrigin` = `API_ORIGIN` when set, else the request's origin), the `/api/*` middleware (exempt `/api/instance`, `/api/health`, `/api/bot/*`), the live route check, the config field and the deploy var.
- [ ] **Step 7: Write the failing client tests** — `api-client.test.ts`: the fake fetch sees `X-Pace-Protocol: "1"` on a GET and a POST; a 426 body `{ code: "client/outdated", message }` rejects with `ApiError` `status 426`, `code "client/outdated"`. `live.test.ts`: `liveUrl("https://a.dev", "d1")` → `wss://a.dev/api/sync/live?device=d1&protocol=1`.
- [ ] **Step 8: Implement**, then run `bun test:unit`, `bun test:api` → PASS; `bun lint` clean.
- [ ] **Step 9: Commit** — `git add` the files above; `git commit -m "Protocol version and /api/instance: the app and server can tell they fit"` (+ trailers).

### Task 2: The app picks its server; incompatible versions block with only Log out

**Files:**
- Create: `packages/core/src/server-url.ts` (+ `.test.ts`), `packages/client/src/instance.ts` (+ `.test.ts`), `apps/app/src/platform/server.ts` (+ `server.test.ts`), `apps/app/src/platform/server.web.ts`, `apps/app/src/features/server/change-server-sheet.tsx`, `apps/app/src/features/server/server-line.tsx`, `apps/app/src/features/server/incompatible-screen.tsx`, `apps/app/src/features/server/server.test.tsx`, `docs/self-hosting.md`
- Modify: `apps/app/src/platform/api-base.ts` (build defaults only), `apps/app/src/platform/secure-session.ts` (token stored with its origin), `apps/app/src/runtime.ts` and `apps/app/src/app-state.tsx` (runtime keyed by the server; instance checked on start and sign-in), `apps/app/src/screens/login-screen.tsx` (server line; refusal when incompatible), `apps/app/app/_layout.tsx` (the signed-in incompatible gate), `apps/app/src/screens/login-screen.web.tsx` (widget bot username from the current server) and `apps/app/src/features/devices/computer-steps.tsx` (web origin / API URL from the current server), `apps/app/src/platform/push-task.ts` (background API from the stored server, see Task 9), i18n `en/ru` (`server.*`), `README.md` ("Run your own server"), `docs/architecture.md` (Auth/"One UI" notes)
- Test: the files above

**Interfaces:**
- Consumes: Task 1's `endpoints.instance`, `Instance`, `compatibility`, `CLIENT_OUTDATED`.
- Produces:
  - core: `type ServerUrlError = "invalid-url" | "insecure"`; `normalizeServerUrl(text: string): Result<string, ServerUrlError>` → the origin (`https://host[:port]`), https only except `http://localhost`, `127.0.0.1`, `10.0.2.2` and private IPv4 (10/8, 172.16/12, 192.168/16).
  - client: `type InstanceError = "unreachable" | "not-pace" | "server-outdated" | "client-outdated"`; `checkInstance(baseUrl: string, fetch?: FetchLike): Promise<Result<Instance, InstanceError>>` (404 or a body that fails `InstanceSchema` → `not-pace` for a URL the person typed; network failure → `unreachable`; `compatibility` ≠ ok → that code).
  - app: `readServer(): Promise<string>` (stored origin or `API_BASE_URL`), `writeServer(origin: null | string): Promise<void>` (`null` = default), `serverStore` (zustand: `{ origin: string; instance: Instance | null; status: "unknown" | "ok" | "incompatible"; reason: null | "server-outdated" | "client-outdated" }`), `useServerInfo(): { apiOrigin: string; botUsername: string; webOrigin: string }` (instance values, build defaults while unknown). `server.web.ts`: always the build default, `writeServer` unused.
  - `createSecureSessionStore(origin: string): SessionStore` — stores `{ origin, token }` under `pace.session`; `get()` returns `null` when the stored origin differs (a token is never sent to another server).

- [ ] **Step 1: Failing tests, core + client** — `server-url.test.ts`: `"pace.example.dev"` → `ok("https://pace.example.dev")`; `"https://pace.example.dev/api/"` → `ok("https://pace.example.dev")`; `"http://pace.example.dev"` → `err("insecure")`; `"http://10.0.2.2:8787"`, `"http://192.168.1.5:8787"`, `"http://localhost:8787"` → ok; `"ftp://x"`, `""`, `"not a url"` → `err("invalid-url")`. `instance.test.ts`: fake fetch answering the instance → `ok`; 404 → `err("not-pace")`; thrown fetch → `err("unreachable")`; `protocol: 0` → `err("server-outdated")`; `minClientProtocol: 2` → `err("client-outdated")`.
- [ ] **Step 2: Run** `bun test:unit` → FAIL. **Step 3: Implement** both. **Step 4: Run** → PASS.
- [ ] **Step 5: Failing app tests** — `server.test.ts`: write server B, then the session store of origin A `get()` → `null`; switching server clears the stored token and the local event store (`resetLocalData` called) and the runtime's `baseUrl` becomes B. `server.test.tsx` (jest, phone layout):
  - Login screen shows "Server: pace-api.nalinor.dev · Change"; press Change → sheet; type `pace.example.dev`, press "Check" (fetch answers an instance named "Pace", version "1.2.3", bot `@MyPaceBot`) → shows name/version/bot → "Use this server" → `readServer()` resolves `https://pace.example.dev` and the line shows the new host.
  - Invalid URL → field error "Enter the server's address, like pace.example.dev"; `http://` public host → "Use an https:// address"; unreachable → "Can't reach this server"; 404 → "This is not a Pace server"; `protocol: 0` → "This server runs an older Pace. Update the server or use another one."; "Use this server" absent in every error state.
  - "Reset to default" → `readServer()` = `API_BASE_URL`.
  - Signed out with an incompatible current server → pressing the Telegram sign-in shows "Server and app versions don't match" with what to update and does not start a login; "Change" stays.
  - Signed in, instance check answers `client-outdated` (or any call fails with 426) → full screen "Server and app versions don't match", "Update the app"; exactly one button, "Log out"; pressing it signs out and lands on the login screen whose server line offers Change. No Change server on the blocking screen.
  - Instance check fails with `unreachable` while signed in → nothing blocks (the last known instance or none is kept).
- [ ] **Step 6: Run** `bun test:app` → FAIL.
- [ ] **Step 7: Implement.** The runtime is created for `serverStore.origin` and rebuilt when it changes (switching happens only signed out). Every former reader of `API_BASE_URL` / `WEB_ORIGIN` / `TELEGRAM_BOT` outside `api-base.ts` reads `useServerInfo()` (UI) or `readServer()` (background); grep proves none left. The instance is fetched on start and on each sign-in and cached in `serverStore` for the session; an `ApiError` with `CLIENT_OUTDATED` from any call sets `status: "incompatible"`.
- [ ] **Step 8: Docs** — `docs/self-hosting.md` per the brief's Docs section (Cloudflare account with Workers, D1, KV, Durable Objects; BotFather bot and its domain for the widget; optional OpenAI-compatible `LLM_*` keys; optional Firebase; fork/clone, wrangler ids, secrets, vars incl. `ALLOWED_TELEGRAM_IDS`, `PACE_VERSION`; deploy via `deploy.yml` or `wrangler deploy`; webhook; in the app: Change server). Plainly: the released APK is tied to the Pace Firebase project, so a self-hosted server gets no Google push with it — notifications arrive within ~15 minutes through the background check, instantly while the app is open, and in Telegram. README: a short "Run your own server" section linking to it.
- [ ] **Step 9: Run** `bun test:unit`, `bun test:app` → PASS; `bun lint` clean.
- [ ] **Step 10: Commit** — "Change server on the login screen; mismatched versions block with only Log out" (+ trailers).

---

## Part 9 — one session system

### Task 3: Sessions know their kind, name and place; nonces capture them

**Files:**
- Create: `apps/api/src/auth/user-agent.ts` (+ `.test.ts`), `apps/api/src/shared/request-place.ts` (+ `.test.ts`), `apps/api/src/shared/session-rows.ts`
- Modify: `apps/api/src/shared/db/d1-schema.ts`, generated `apps/api/drizzle/d1/0008_*.sql` (via `bun db:generate`), `apps/api/src/auth/sessions.ts`, `apps/api/src/auth/nonce.ts`, `apps/api/src/auth/auth-routes.ts`, `apps/api/src/auth/device-routes.ts` (agent kind; the route itself is replaced in Task 4), `packages/core/src/api/endpoints.ts` + schemas (`nonceCreate` gains an optional strict body), `apps/app/src/screens/use-bot-login.ts` / `packages/client/src/auth.ts` (send `deviceName`, `deviceId` from the app), `apps/api/tests/helpers.ts` (`call(path, { cf, headers })`), `docs/architecture.md` ("Auth and sessions")
- Test: `apps/api/tests/auth.int.test.ts`, `apps/api/src/auth/sessions.test.ts`, `apps/api/src/auth/nonce.test.ts`

**Interfaces:**
- Produces:
  - D1 `sessions`: drop `label`; add `kind text NOT NULL DEFAULT 'browser'` (`"browser" | "app" | "agent" | "dev"`), `name text NOT NULL DEFAULT ''`, `userAgent`, `ip`, `country`, `city`, `deviceId` (all nullable text). `login_nonces`: add `from` (`"app" | "web"`), `ip`, `country`, `city`, `userAgent`, `deviceName`, `deviceId`, `sessionId`, `replyChatId` (text), `replyMessageId` (integer) — nullable.
  - `type SessionKind = "browser" | "app" | "agent" | "dev"`; `type RequestPlace = { readonly ip: null | string; readonly country: null | string; readonly city: null | string; readonly userAgent: null | string }`.
  - `requestPlace(request: Request): RequestPlace` — ip from `CF-Connecting-IP`, country/city from `request.cf` (absent → null).
  - `clientName(userAgent: null | string): string` — "<Browser> on <OS>"; unknown → `"Browser"`.
  - `createSession(db, { userId, kind, name, now, place?, deviceId?, scope?, days? })` → `{ id, token, expiresAt }`. `NewSession.label` goes.
  - `session-rows.ts`: `deleteSession(db: Db, userId: string, sessionId: string): Promise<boolean>` (true when a row went) — the one revoke used by `auth/` and (Task 5) the pool.
  - `findSession` keeps returning `device: { id, name }` for `usage:write` sessions, with `id = deviceId ?? sessionId` and `name = name`.
  - `POST /api/auth/nonce?from=app|web` body (optional, strict): `{ deviceName?: string (1..80), deviceId?: string (1..64) }`.

- [ ] **Step 1: Failing unit tests** — `user-agent.test.ts` over real UA strings: desktop Chrome on macOS → "Chrome on macOS"; Android Chrome → "Chrome on Android"; iPhone Safari → "Safari on iPhone"; iPad Safari → "Safari on iPad"; Edge on Windows → "Edge on Windows"; Yandex Browser on Windows → "Yandex Browser on Windows"; Firefox on Linux → "Firefox on Linux"; Opera, Samsung Internet; `null` and `"curl/8"` → "Browser". `request-place.test.ts`: headers + `cf: { country: "DE", city: "Berlin" }` → `{ ip: "1.2.3.4", country: "DE", city: "Berlin", userAgent }`; no cf → nulls.
- [ ] **Step 2: Run** `bun test:api` → FAIL. **Step 3: Implement** both.
- [ ] **Step 4: Failing integration tests** (`auth.int.test.ts`, requests with `cf` and `CF-Connecting-IP`): widget login → the session row has `kind "browser"`, `name "Chrome on macOS"`, ip/country/city/userAgent stored; dev login → `kind "dev"`, `name "Dev login"`; `POST /api/auth/nonce?from=app` with `{ deviceName: "Pixel 9a", deviceId: "dev-1" }` then bind + poll → session `kind "app"`, `name "Pixel 9a"`, `deviceId "dev-1"`, place from the nonce request, and the nonce row's `sessionId` = the new session; `from=web` without a body → `kind "browser"`, name from the nonce request's UA; an agent created through `POST /api/devices` → `kind "agent"`, `scope "usage:write"`, name as typed; the body `{ extra: 1 }` → 400 (strict input).
- [ ] **Step 5: Run** → FAIL. **Step 6: Implement** schema changes, `bun db:generate` (review the SQL: added columns with defaults, `label` dropped), the route changes and the client sending `deviceName`/`deviceId` (`Constants.deviceName`, `loadDeviceId()`; the web sends none).
- [ ] **Step 7: Run** `bun test:api`, `bun test:unit`, `bun test:app` → PASS; `bun lint` clean (incl. `db:check`).
- [ ] **Step 8: Commit** — "Sessions record their kind, a readable name and where they signed in from" (+ trailers).

### Task 4: `GET/DELETE /api/sessions`, agents under `/api/sessions/agents`, the old lists removed

**Files:**
- Create: `packages/core/src/api/schemas/sessions.ts`, `apps/api/src/auth/session-routes.ts`, `apps/api/src/shared/oauth-grants.ts`, `packages/client/src/react/sessions.ts`, `packages/client/src/view-models/sessions.ts` (+ `.test.ts`), `apps/api/tests/sessions.int.test.ts`
- Modify: `packages/core/src/api/endpoints.ts` (add `sessions`; remove `devices` and `oauth.grants`), `packages/core/src/api/endpoints.test.ts`, `apps/api/src/auth/auth-routes.ts` (mount session routes instead of device routes), `apps/api/src/oauth/oauth-routes.ts` (grants helpers from shared; list/revoke routes removed), `apps/api/src/user-store/cloud-data.ts` (`usageDevices` reused for `lastDataAt`), `packages/client/src/react/devices.ts` and `react/oauth.ts` (list/revoke code removed; agent creation moves to `useSessions`), `packages/client/src/view-models/devices.ts` (keeps `agentCommand`), `docs/mcp.md`, `docs/desktop.md`, `tools/pace-agent` docs strings that name `/api/devices`
- Delete: `apps/api/src/auth/device-routes.ts`; tests of the removed endpoints (`cloud.int.test.ts` device parts move to `sessions.int.test.ts`, `oauth.int.test.ts` grants parts)
- Test: as listed

**Interfaces:**
- Consumes: Task 3's columns, `deleteSession`.
- Produces:
  - `SessionSchema` (answer, loose): `{ id: string; kind: knownValue(["browser","app","agent","dev","mcp"], "browser"); name: string; ip: string | null; country: string | null; city: string | null; createdAt: number; lastSeenAt: number | null; lastDataAt: string | null; current: boolean; scopes?: string[] }`; `SessionsOutputSchema = { sessions: knownValues(SessionSchema) }`.
  - `endpoints.sessions.list` (`GET /api/sessions`, auth), `endpoints.sessions.revoke` (`DELETE /api/sessions/:id`, `id` 1..128, output `DoneSchema`, 404 `session/not-found`), `endpoints.sessions.createAgent` (`POST /api/sessions/agents`, body `DeviceCreateSchema`, output `DeviceCreatedSchema`).
  - MCP grants appear with `id = "mcp:" + grantId`, `kind "mcp"`, `name` = the client's name, `createdAt` from the grant, `scopes`, `lastSeenAt: null`, `lastDataAt: null`.
  - `oauth-grants.ts`: `listGrants(kv: KVNamespace, userId: string): Promise<readonly Grant[]>`, `revokeGrant(kv, userId, grantId): Promise<boolean>`.
  - client: `useSessions(): { readonly status: "loading" | "ready" | "error"; readonly sessions: readonly Session[]; readonly reload: () => void; readonly revoke: (id: string) => Promise<void>; readonly createAgent: (name: string) => Promise<{ id: string; name: string; token: string }> }`.
  - view-model: `LAST_DATA_EXACT_AFTER_HOURS = 8`; `type SessionRow = { id; kind; name; meta: readonly string[]; action: "revoke" | "disconnect"; isCurrent: boolean }`; `sessionRows(sessions, { now, zone, language }): readonly SessionRow[]` — current first, then by `lastSeenAt` desc; meta: current → "This device"; `country · ip` (country name through `Intl.DisplayNames`); app/agent: "Last data 2h 10m ago", or the exact time ("Last data Oct 12, 23:10", existing date helpers) when older than 8 hours, or "Nothing sent yet"; `action` = `"disconnect"` for agents, else `"revoke"`.

- [ ] **Step 1: Failing view-model tests** — `sessions.test.ts` (zone Europe/Moscow, now fixed): last data 7h 59m ago → relative text; exactly 8h → still relative; 8h 1m → "Last data Oct 12, 23:10"; null → "Nothing sent yet"; the current session first with "This device"; RU strings mirrored; country "DE" in RU → "Германия".
- [ ] **Step 2: Run** `bun test:unit` → FAIL. **Step 3: Implement** schemas, endpoints, view-model, `useSessions`.
- [ ] **Step 4: Failing API tests** — `sessions.int.test.ts` (answers parsed with `endpoints.sessions.list.output`): two logins + one agent + one MCP grant → four entries, the caller's own `current: true`; the agent's `lastDataAt` = the end of its newest usage upload, the app session's `lastDataAt` from usage under its `deviceId`; cf fields come back; `DELETE` an agent → its token gets 401 on `POST /api/usage/sessions`; `DELETE mcp:<grant>` → the grant is gone from KV and `/mcp` with its token → 401; `DELETE` another user's session id → 404 `session/not-found`; `DELETE` the current session → 200 and the same token → 401; `GET /api/devices` → 404, `GET /api/oauth/grants` → 404; `POST /api/sessions/agents` → token shown once, row `kind "agent"`.
- [ ] **Step 5: Run** `bun test:api` → FAIL. **Step 6: Implement** `session-routes.ts`, `oauth-grants.ts` (oauth-routes reuses it), removals; docs mention `/api/sessions` and Settings → Devices and sessions.
- [ ] **Step 7: Run** `bun test:unit`, `bun test:api`, `bun test:app` (the old Devices screen tests are rewired in Task 6; until then keep them compiling against `useSessions`) → PASS; `bun lint` clean (Knip catches leftovers).
- [ ] **Step 8: Commit** — "One session list: browsers, the app, agents and MCP grants, each revocable" (+ trailers).

### Task 5: Login notices in Telegram with "Not me — end this session"

**Files:**
- Modify: `packages/core/src/notify/pool.ts` (`RESOLUTIONS` + `"revoked"`, `ANSWERS.login = ["revoked"]`, `LoginPayloadSchema` gains optional `returnUrl`), `packages/core/src/i18n/{en,ru}/notify.ts`, `apps/api/src/user-store/notify-text.ts` (login text, country name, return button), `apps/api/src/user-store/pool-answers.ts` (`revoked` → `deleteSession`), `apps/api/src/user-store/notification-pool.ts` + `pool-service.ts` + `apps/api/src/shared/contract.ts` (`notify(created, now, options?)` with `adoptTelegramMessage`), `apps/api/src/auth/auth-routes.ts` (notify after browser/app/dev sessions), `apps/api/src/auth/bot-login.ts` + `apps/api/src/auth/nonce.ts` + `apps/api/src/bot/bot.ts` (reply first, bind with the reply's ids), `apps/app/src/platform/notifications.ts` (the `revoked` button on the phone category), feed rendering of the new answer (client `view-models/notifications.ts`)
- Test: `apps/api/tests/login-notice.int.test.ts`, `packages/core/src/notify/pool.test.ts`, `apps/app/src/platform/notifications.test.ts`

**Interfaces:**
- Consumes: Task 3 (`createSession` kinds, nonce `replyChatId`/`replyMessageId`/`sessionId`, `deleteSession`).
- Produces:
  - `notify(created: NewNotification, now: string, options?: { readonly adoptTelegramMessage?: { readonly chatId: string; readonly messageId: number } }): Promise<Result<PoolNotification, NotifyError>>` — with `adoptTelegramMessage`, the Telegram copy is that message, edited (`editMessageText`) into the notification's text and buttons, and recorded as `sent` with that id; without, unchanged behaviour.
  - Copy (EN source, RU mirror): `notify.login` → "🔐 You signed in from {name} · IP {ip} · {place}" / "🔐 Вход с {name} · IP {ip} · {place}" (place = "Germany, Berlin" / "Германия, Берлин", country via `Intl.DisplayNames([language], { type: "region" })`, parts absent are left out); `notify.action.revoked` → "Not me — end this session" / "Это не я — завершить сеанс"; the answered text → "Session ended" / "Сеанс завершён".
  - Bot `/start login_<nonce>`: peek the nonce (exists, unbound, unexpired) → reply "Logged in. Return to Pace." with the Return button → bind with `{ replyChatId, replyMessageId }` in the same write; a failed bind edits the reply to the expired text.

- [ ] **Step 1: Failing core test** — `pool.test.ts`: `canResolveAs("login", "revoked") === true`, `canResolveAs("event_start", "revoked") === false`, `isAnswer("revoked") === true`; the catalogs have the new keys in both languages (parity test already enforces).
- [ ] **Step 2: Run** `bun test:unit` → FAIL. **Step 3: Implement.**
- [ ] **Step 4: Failing API tests** — `login-notice.int.test.ts` (Telegram stubbed via `fetchMock` on `https://telegram.test`; requests carry `cf: { country: "DE", city: "Berlin" }`, `CF-Connecting-IP: 1.2.3.4`):
  - Widget login with a Chrome-on-macOS UA → exactly one `sendMessage` whose text contains "Chrome on macOS · IP 1.2.3.4 · Germany, Berlin" and one callback button "Not me — end this session"; with the account language RU → "Германия, Берлин".
  - Deep link: `POST /api/auth/nonce?from=app` → webhook `/start login_<nonce>` → one `sendMessage` (the Return button); the app's poll → **no second `sendMessage`**, one `editMessageText` on that `message_id` with the login text and both buttons [Return to Pace (url)] [Not me]; the pool's Telegram copy has that message id.
  - The Not-me callback on that message → the session row is gone, its bearer → 401, the message is edited to "Session ended", the notification resolved `revoked`; pressing it again → no error alert, no second revoke, the message stays "Session ended" (Review Focus 5); pressing it after the person revoked that session in Settings → same.
  - `POST /api/notifications/:id/resolve` with `revoked` from the feed → same revoke.
  - Agent creation and MCP consent → no Telegram message.
  - Webhook `/start` with an expired nonce → the reply says the link expired; no bind.
- [ ] **Step 5: Run** `bun test:api` → FAIL. **Step 6: Implement.** Telegram sending stays in the pool (one place); the bot only stores its reply. `pool-answers.ts` reaches D1 through `deleteSession` from `shared/session-rows.ts` (no `auth/` import).
- [ ] **Step 7: Failing app test** — `notifications.test.ts`: the `login` category registers one action `revoked` labelled "Not me — end this session"; pressing it in the background resolves through `endpoints.notifications.resolve` with `resolution: "revoked"`.
- [ ] **Step 8: Implement**, run `bun test:unit`, `bun test:api`, `bun test:app` → PASS; `bun lint` clean.
- [ ] **Step 9: Commit** — "Sign-in notices in Telegram with Not me; the deep link's reply becomes that notice" (+ trailers).

### Task 6: Settings — Devices and sessions inline, Connect an AI app, the new order

**Files:**
- Create: `apps/app/src/ui/skeleton.tsx`, `apps/app/src/features/sessions/sessions-section.tsx`, `apps/app/src/features/sessions/session-row.tsx`, `apps/app/src/features/sessions/connect-ai-sheet.tsx`, `apps/app/src/features/sessions/sessions.test.tsx`, `e2e/sessions.e2e.ts`
- Modify: `apps/app/src/screens/settings-screen.tsx` (order), `apps/app/src/ui/button.tsx` (`width` prop), `apps/app/src/ui/sidebar.tsx` (no Devices entry; Settings `owns` list), `apps/app/src/features/devices/add-computer.tsx` + `computer-steps.tsx` (reused from the section; server values from `useServerInfo()`), `apps/app/src/screens/more-screen.tsx` if it links Devices, i18n `en/ru` (`sessions.*`, `connectAi.*`), `docs/architecture.md` (sidebar list)
- Delete: `apps/app/app/devices.tsx`, `apps/app/src/features/devices/devices-screen.tsx` (+ its test, whose add-computer cases move to `sessions.test.tsx`), `apps/app/src/features/devices/device-row.tsx`, `apps/app/src/features/oauth/connected-apps.tsx`, `apps/app/src/features/oauth/grant-row.tsx` (if unused after), `e2e/devices.e2e.ts` (replaced)
- Test: as listed, plus `apps/app/src/screens/phone-controls.test.tsx` (Settings joins it if not there)

**Interfaces:**
- Consumes: Task 4's `useSessions`, `sessionRows`; Task 2's `useServerInfo()` (MCP URL = `${apiOrigin}/mcp`).
- Produces: `Skeleton({ rows?: number; label: string })` (grey bars, pulsing unless reduced motion via `ui/motion.ts`, `accessibilityLabel` = label); `Button` prop `width?: "auto" | "fill"` — `"auto"` (default) sizes to content from 1024 px and fills below, `"fill"` always fills (sheets); `SessionsSection`, `ConnectAiSheet({ open; onClose })`.

- [ ] **Step 1: Failing app tests** — `sessions.test.tsx`:
  - While `GET /api/sessions` is pending → skeleton rows (by label "Loading devices"), no "Loading…" text; then rows: "Chrome on macOS" with "This device"; "Pixel 9a" with "Last data 2h 10m ago"; an agent with data 11h 29m ago → "Last data Oct 12, 23:10"; an MCP row "Claude".
  - Revoke: press "Revoke" on a browser row → inline confirm ("End this session?" with Revoke/Cancel) → Cancel leaves it; confirm → `DELETE /api/sessions/<id>` once (two presses in one batch → one request, class 36) and the row goes; "Disconnect" on agents; revoking the row marked "This device" signs out and lands on `/login`.
  - Error → a quiet line "Couldn't load devices" with "Try again" that reloads.
  - Phone layout: "Add a computer" opens the add-computer sheet (name → token → commands without the token, as the old test asserted); "Connect an AI app" opens a sheet showing `https://<apiOrigin>/mcp` with a Copy button and steps for Claude (Settings → Connectors → Add custom connector → paste the URL), ChatGPT (developer mode connectors) and any MCP client with OAuth.
  - Settings order (by section headings, top to bottom): look rows, time zone, permissions (phone), Notifications, digest, quiet hours, category estimates, more links, **Devices and sessions**, Export data (web only, no description), Log out, Danger zone.
  - Desktop width (1440): the Revoke, Add a computer and Log out buttons are not stretched (`width` style not `100%`/`alignSelf: stretch`); phone width: Log out fills.
  - `deadControls()` on Settings at phone width finds none (class 10).
- [ ] **Step 2: Run** `bun test:app` → FAIL. **Step 3: Implement**; delete the screens and route; fix every import Knip reports.
- [ ] **Step 4: Run** `bun test:app` → PASS.
- [ ] **Step 5: Failing e2e** — `e2e/sessions.e2e.ts` (replaces devices.e2e): Settings shows this browser's row with "This device"; create an agent through Add a computer, see it listed, Disconnect it with the inline confirm, it disappears; Connect an AI app shows the MCP URL of the local API (`http://localhost:8787/mcp`); `/devices` → the not-found screen; `expectNoA11yViolations` on Settings with a session list and with each sheet open; 390 px and 1440 px.
- [ ] **Step 6: Run** `bunx playwright test e2e/sessions.e2e.ts e2e/route-sweep.e2e.ts` → PASS (after the implementation; the web build rebuilds when no server is reused).
- [ ] **Step 7:** `bun lint`, `bun test:unit`, `bun test:app` → PASS.
- [ ] **Step 8: Commit** — "Settings: devices and sessions inline, Connect an AI app, export and log out at the bottom" (+ trailers).

Not verifiable here: screenshots of Settings in both themes, phone and desktop, Russian — the controller takes them for the design pass (CLAUDE.md "Design").

---

## Part 20 — sync over the WebSocket

### Task 7: `pace.v2` on the live socket — push, proactive events, catch-up pull

**Files:**
- Create: `packages/core/src/api/live-protocol.ts` (+ `.test.ts`), `apps/api/src/user-store/live-messages.ts`
- Modify: `apps/api/src/shared/socket-auth.ts` (protocol constants move to core; negotiation), `apps/api/src/user-store/live-sockets.ts` (tags carry the protocol; `announceChange` sends `events` to v2), `apps/api/src/user-store/user-store.ts` (`webSocketMessage`), `apps/api/src/sync/sync-routes.ts` (shared push body schema), `packages/core/src/api/endpoints.ts` (the push body as a named schema reused by the socket), `docs/architecture.md` (Sync protocol table)
- Test: `apps/api/tests/live.int.test.ts`

**Interfaces:**
- Produces (core):
  - `LIVE_V1 = "pace.v1"`, `LIVE_V2 = "pace.v2"`, `LIVE_PAGE = 200`, `LIVE_REQUEST_TIMEOUT_MS = 10_000`, `LIVE_MAX_IN_FLIGHT = 4`.
  - `SyncPushBodySchema` — the exact object `endpoints.sync.push.body` uses (one schema, not a copy).
  - `LiveClientMessageSchema` (strict input): `{ type: "push"; id: string (1..64); storeId: string; events: (as SyncPushBodySchema) } | { type: "pull"; id: string; since: number (int ≥ 0); limit?: number (1..500) }`.
  - `LiveServerMessageSchema` (loose answer; unknown `type` tolerated): `hello { protocol: "pace.v2" }`; `pushed { id; accepted: string[]; rejected: { id; reason }[]; seq }` (the shape of the HTTP push answer); `events { id?: string; since: number; seq: number; storeId: string; events: unknown[]; more: boolean }`; `error { id: string; code: "store/changed" | "bad-request" | string }`; `changed { seq }` (v1); the pool notices unchanged.
  - `parseLiveClientMessage(data: string): Result<LiveClientMessage, "bad-request">`.
- Produces (server): a socket offering `pace.v2` gets `Sec-WebSocket-Protocol: pace.v2` and a `hello` as its first message; one offering only `pace.v1` behaves exactly as today. v2 sockets: after any append, every v2 socket except the writing device gets `events { since: <seq before>, seq, storeId, events: <inserted>, more: false }`; more than `LIVE_PAGE` inserted → `events: []`, `more: true` (pull). A `push` runs the store's `push(storeId, events, { now })` — the same method the HTTP route calls; a `pull` runs `list(since, limit)` and answers `events` with the request's `id`.

- [ ] **Step 1: Failing core test** — `live-protocol.test.ts`: a valid push parses; a push with an event the HTTP body refuses also fails here (same schema: feed the HTTP fixtures of `sync.int.test.ts`'s refused batch); unknown `type` / invalid JSON → `err("bad-request")`; every `LiveServerMessageSchema` variant tolerates an extra key (class 13 sweep in `endpoints.test.ts` extended to socket schemas).
- [ ] **Step 2: Run** `bun test:unit` → FAIL. **Step 3: Implement.**
- [ ] **Step 4: Failing API tests** — `live.int.test.ts` (upgrade through `exports.default.fetch`, `response.webSocket.accept()`):
  - Offering `pace.v2, pace.v1, pace.auth.<token>` → answered `pace.v2`, first message `hello`.
  - v2 push → `pushed` with `accepted` ids and `seq`; the log has the events; a second socket of another device gets `events` with `since` = the seq before and the events; the writer's socket gets no `events` for its own batch, but does get one for the derived system events that follow it.
  - The same push sent twice (the answer "lost") → the second `pushed` accepts the same ids, `countEvents` unchanged (Review Focus 1).
  - Push with a stale `storeId` → `error { id, code: "store/changed" }`, nothing written.
  - `pull { since: 0 }` → `events` pages with `more` until the end; `id` echoed.
  - Malformed message → `error { code: "bad-request" }`, the socket stays open.
  - An HTTP `POST /api/sync/push` → v2 sockets get `events`, a v1 socket gets `changed` (v1 kept).
  - A batch of 250 events → v2 sockets get `events: [], more: true`.
  - Every server message parsed with `LiveServerMessageSchema` (class 12).
- [ ] **Step 5: Run** `bun test:api` → FAIL. **Step 6: Implement**; no per-socket in-memory state beyond tags (hibernation); `ping`/`pong` auto-response unchanged.
- [ ] **Step 7: Run** `bun test:unit`, `bun test:api` → PASS; `bun lint` clean.
- [ ] **Step 8: Commit** — "Live socket v2: pushes and new events travel over the socket; v1 unchanged" (+ trailers).

### Task 8: The client syncs over the socket, HTTP when it is closed or slow — one code path

**Files:**
- Create: `packages/client/src/sync-transport.ts` (+ `.test.ts`)
- Modify: `packages/client/src/sync-client.ts` (pull/push through a transport; `applyPage` shared), `packages/client/src/live.ts` (offers v2 then v1; `request()` with ids, timeout, in-flight window; `onEvents`), `packages/client/src/create-client.ts` (wiring), `packages/client/src/sync-client.test.ts`, `packages/client/src/live.test.ts`, `e2e/live.e2e.ts`, `docs/architecture.md` (client sync paragraph)
- Test: as listed

**Interfaces:**
- Consumes: Task 7's schemas and constants.
- Produces:
  - `type PullPage = { since: number; seq: number; storeId: string; events: readonly unknown[]; more: boolean }`; `type PushAnswer = EndpointOutput<typeof endpoints.sync.push>`.
  - `type SyncTransport = { readonly push: (events: readonly Event[], storeId: string) => Promise<PushAnswer | typeof STORE_CHANGED>; readonly pull: (since: number, limit: number) => Promise<PullPage> }`.
  - `httpTransport(api: ApiClient): SyncTransport`; `socketTransport(live: LiveChannel): SyncTransport` (rejects with `LiveUnavailable` when closed, timed out after `LIVE_REQUEST_TIMEOUT_MS`, or `LIVE_MAX_IN_FLIGHT` is reached); `preferSocket(socket: SyncTransport, http: SyncTransport): SyncTransport` (per call: socket, then HTTP on `LiveUnavailable`).
  - `LiveChannel` gains `readonly request: (message: LiveClientMessage) => Promise<LiveServerMessage>`, `readonly isV2: () => boolean`, option `onEvents?: (page: PullPage) => void`.
  - `SyncClient` gains `readonly ingestLive: (page: PullPage) => Promise<void>` — applies the page through the same `applyPage` the pull uses when `page.since` equals the cursor and the store id matches; otherwise (a gap, `more`, another store) it schedules `soon()`.

- [ ] **Step 1: Failing client tests** — with the fake socket (`createSocket` option) and the fake fetch:
  - Socket open (v2 hello) → `syncNow()` pushes and pulls over the socket; the fake fetch sees no `/api/sync/*` call.
  - The socket drops mid-push (no answer) → after the timeout the same events go over HTTP; the fake server, which already applied the socket push, accepts them again; the local log has one copy, the outbox is empty, `markSynced` covered every id (Review Focus 1).
  - `error { code: "store/changed" }` over the socket → the same reset as an HTTP 409 (local log cleared, next run pulls from 0) — one assertion helper shared by both transport cases (class 2: both entry paths).
  - A server `events` page contiguous with the cursor → applied, cursor = `seq`, no pull; a page with a gap or `more: true` → a pull follows within `SOON_MS`.
  - A v1-only server (answers `pace.v1`, no hello) → everything over HTTP, `changed` still triggers `soon()`.
  - Five concurrent requests → at most four in flight on the socket; the fifth goes over HTTP.
- [ ] **Step 2: Run** `bun test:unit` → FAIL. **Step 3: Implement**; `sync-client.ts` keeps one `pullSince`/`pushOutbox`/`isSameStore` taking a `SyncTransport`; nothing in it knows which transport is used.
- [ ] **Step 4: Run** `bun test:unit` → PASS.
- [ ] **Step 5: Failing e2e** — `e2e/live.e2e.ts`: two browser contexts on the same account; after both show the seed, `page.route("**/api/sync/{push,pull}", route => route.abort())` on both; create a task in A → it appears in B within 1500 ms (`expect(...).toBeVisible({ timeout: 1500 })`); A's task survives a reload of A after unblocking (it really reached the server).
- [ ] **Step 6: Run** `bunx playwright test e2e/live.e2e.ts` → PASS after implementation.
- [ ] **Step 7:** `bun lint`, `bun test:app` (the app wires the client unchanged) → PASS.
- [ ] **Step 8: Commit** — "Sync over the live socket, HTTP when it is closed or slow, through one code path" (+ trailers).

Not verifiable here: Android's WebSocket under real network changes (the controller lists it for the device check after the APK release).

---

## Part 8c — notifications without Google

### Task 9: The periodic background check

**Files:**
- Create: `apps/app/src/platform/background-check.ts` (+ `.test.ts`), `apps/app/src/platform/background-api.ts`
- Modify: `apps/app/package.json` (`bun add expo-background-task@57.0.21` in `apps/app` — the version PR 1 removed), `apps/app/metro.config.js` (`WEB_SHIMS["expo-background-task"]`), `apps/app/src/platform/web/phone-only.ts` (stand-ins `registerTaskAsync`, `unregisterTaskAsync`, `BackgroundTaskResult`), `apps/app/src/testing/background-task.fake.ts`, `apps/app/src/platform/push-task.ts` (uses `backgroundApi()`), `apps/app/src/app-state.tsx` (start on sign-in, stop on logout), i18n `en/ru` (`settings.push.option.*`, `settings.push.poll`), `README.md` (notifications without Firebase), `docs/architecture.md` (background check)
- Test: `apps/app/src/platform/background-check.test.ts`, `apps/app/src/features/settings/settings.test.tsx`

**Interfaces:**
- Consumes: Task 2's `readServer()` and origin-bound `createSecureSessionStore(origin)`; existing `pollNow(api)`, `pushMethodOf()`, `uploadPhoneData(api, now)`.
- Produces:
  - `backgroundApi(): Promise<ApiClient | null>` — the client for the stored server with the token stored for that server; `null` when signed out (one helper for the push task and the check).
  - `BACKGROUND_CHECK_TASK = "pace.background-check"`, `BACKGROUND_INTERVAL_MINUTES = 15`.
  - `runBackgroundCheck(deps?: { api?: ApiClient | null; now?: () => string }): Promise<"done" | "signed-out" | "failed">` — signed in: `pollNow` when `pushMethodOf()` is `"poll"`, then `uploadPhoneData`; each step's failure is caught alone (a failed poll never stops the upload).
  - `startBackgroundCheck(): Promise<void>` (registers once, `minimumInterval: 15`), `stopBackgroundCheck(): Promise<void>`.
  - Copy: picker options "Automatic", "Google", "Background check (every ~15 min)", "Only while the app is open" (RU mirrored); `settings.push.poll` → "Pace checks for notifications in the background about every 15 minutes, and at once while it is open."

- [ ] **Step 1: Failing tests** — `background-check.test.ts` (fake task manager, mocked `expo-background-task`, fake fetch):
  - Defining the module registers `pace.background-check`; `startBackgroundCheck()` calls `registerTaskAsync` with `{ minimumInterval: 15 }` once even when called twice.
  - Method `poll`: a run calls `GET /api/push/poll`, shows each `show` entry with the pool id as the notification identifier, dismisses each `dismiss` entry, sends the cursor back on the next poll; then uploads usage.
  - Method `fcm`: no poll call, the usage upload still runs (Ruling 2).
  - Signed out → `"signed-out"`, no request at all.
  - Stored token for server A while the stored server is B → treated as signed out, nothing sent to B (Review Focus 3).
  - The poll fails → the upload still runs; result `"failed"`.
  - Logout calls `stopBackgroundCheck()`.
  - `settings.test.tsx`: the picker's options read "Automatic / Google / Background check (every ~15 min) / Only while the app is open"; with `poll` the status line reads the new copy.
- [ ] **Step 2: Run** `bun test:app` → FAIL. **Step 3: Implement.** Check the server records a poll fetch in the delivery log with method `poll` (`GET /api/push/poll`); if it does not, add it with an API test in `notify.int.test.ts` ("a polled entry is logged delivered via poll").
- [ ] **Step 4: Run** `bun test:app` (and `bun test:api` if the server changed) → PASS; `bun lint` clean (Knip sees the new dependency used).
- [ ] **Step 5: Commit** — "Background check every ~15 minutes: polling phones get notifications, every phone uploads its usage" (+ trailers).

Not verifiable here: that WorkManager really runs the task about every 15 minutes on a phone without Google services, with Doze and vendor battery savers. Verifiable instead: the task definition, registration options and the run's behaviour in jest; the owner checks on a device after the APK release.

### Task 10: The battery-optimization step, only when the method is `poll`

**Files:**
- Modify: `apps/app/modules/pace-native/android/src/main/java/expo/modules/pacenative/PaceNativeModule.kt` (+ a small `Battery.kt`), `apps/app/modules/pace-native/android/src/main/AndroidManifest.xml` (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`), `apps/app/modules/pace-native/src/pace-native.ts` (types + fallback), `apps/app/src/platform/permissions.ts` (`"background"`), `apps/app/src/features/permissions/*` (the step), `apps/app/src/features/settings/notification-settings.tsx` (the hint), `apps/app/src/platform/notifications.ts` (`needsBackgroundStep`), i18n `en/ru`
- Test: `apps/app/src/features/permissions/permissions.test.tsx`, `apps/app/src/features/settings/settings.test.tsx`, `apps/app/modules/pace-native/src/pace-native.test.ts`

**Interfaces:**
- Produces:
  - `PaceNative` gains `isIgnoringBatteryOptimizations: () => boolean`, `requestIgnoreBatteryOptimizations: () => void` (`Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` with `package:<id>`), `openAutostartSettings: () => boolean` (the vendor autostart page when one of the known components resolves — Xiaomi, Huawei/Honor, Oppo/Realme, Vivo, OnePlus, Asus, Samsung — else `false`); fallback: `true`, no-op, `false`.
  - `PERMISSION_IDS` gains `"background"`; granted = `isIgnoringBatteryOptimizations()`; requesting opens the exemption, then the autostart page when there is one.
  - `needsBackgroundStep(state: Pick<PushState, "method">): boolean` — `method === "poll"`; the one predicate the walk-through and the Settings hint read (class 1).
  - Copy: title "Let Pace check in the background", why "Notifications arrive within ~15 minutes instead of hours.", button "Allow" (RU mirrored).

- [ ] **Step 1: Failing tests** — `permissions.test.tsx`: with `pushStore.method = "poll"` and the exemption missing, the walk-through lists "Let Pace check in the background" with its one-line reason; pressing Allow calls `requestIgnoreBatteryOptimizations`; with `"fcm"` or `"none"` or `null` the step is absent; once granted (re-read on return to the foreground) it shows as done. `settings.test.tsx`: under the picker, the hint and Allow show only while `poll` is in use and the exemption is missing; they disappear when the method becomes `fcm`. `pace-native.test.ts`: the fallback answers `true`/no-op/`false`.
- [ ] **Step 2: Run** `bun test:app` → FAIL. **Step 3: Implement** (Kotlin: `PowerManager.isIgnoringBatteryOptimizations(packageName)`; intents with `FLAG_ACTIVITY_NEW_TASK`, each vendor component tried with `resolveActivity`). Re-check for UnifiedPush / foreground-service placeholders (`grep -rni "unifiedpush\|foreground service\|FOREGROUND_SERVICE" apps packages docs`) and remove any.
- [ ] **Step 4: Run** `bun test:app` → PASS; `bun lint` clean.
- [ ] **Step 5: Commit** — "Ask for the battery exemption only when the phone polls" (+ trailers).

Not verifiable here: the Kotlin code compiles and the intents open the right pages (no Android build in this container; CI's APK build and the owner's device check cover it). Verifiable: types, fallback and the UI logic in jest.

---

## Part 14 — automatic sleep on the server

### Task 11: The phone uploads its use intervals and how far it read

**Files:**
- Create: `packages/core/src/tracking/phone-use.ts` (moved from `phone.ts`: `useIntervals` → exported `phoneUses`, `awakeSpells`, `isWakeUp`, `bedtimeFloor`, `isBedtime`, and the tuned constants `REST_MIN_MINUTES`, `WAKE_UP_MAX_MINUTES`, `BACK_TO_SLEEP_MINUTES`, `WAKE_UP_UNTIL_HOUR`, `NIGHT_UNTIL_HOUR`, `BEDTIME_FROM_HOUR`, `BEDTIME_UNTIL_HOUR`, `SLEEP_MIN_MINUTES`)
- Modify: `packages/core/src/tracking/phone.ts` (imports them; behaviour unchanged), `packages/core/src/time-tracking.ts` (exports), `packages/core/src/api/schemas/cloud.ts` (`UsageUploadSchema` gains `uses?`, `until?`), `apps/api/src/user-store/schema.ts` (`phone_uses` table) + `bun db:generate` (DO migration), `apps/api/src/user-store/cloud-data.ts` (`addUsage` stores uses and the device's known-until), `apps/api/src/user-store/user-store.ts`, `apps/api/src/cloud/cloud-routes.ts` (whether the uploader is a phone: no `device` on the context = a full session), `apps/app/src/platform/phone-upload.ts`
- Test: `packages/core/src/tracking/phone.test.ts` (unchanged results), `apps/api/tests/cloud.int.test.ts`, `apps/app/src/platform/phone-upload.test.ts`

**Interfaces:**
- Produces:
  - core: `phoneUses(events: readonly PhoneEvent[], now: string): readonly Interval[]`; `awakeSpells(uses: readonly Interval[]): readonly Interval[]`; `isWakeUp(spell: Interval, restAfter: Interval, zone: string): boolean`; `bedtimeFloor(atIso: string, zone: string): string`; `isBedtime(atIso: string, zone: string): boolean`.
  - `UsageUploadSchema` (strict input): `+ uses?: { startAt; endAt }[] (≤ 1000)`, `+ until?: iso datetime` (the end of what the phone read).
  - DO table `phone_uses (device_id text, start_at text, end_at text, PRIMARY KEY (device_id, start_at))` — upserted, `end_at` may grow; storage key `usage:known:<deviceId>` → `{ until: string; isPhone: boolean; uploadedAt: string }` (`until` = body `until` or the receive time).
  - `UserStore.usageForSleep(from: string): Promise<{ uses: readonly DeviceUse[]; knownUntil: null | string }>` with `type DeviceUse = { deviceId: string; startAt: string; endAt: string }` — phone uses plus computer usage sessions overlapping `[from, ∞)`; `knownUntil` = the earliest `until` among phones whose `uploadedAt` is within 24 h of now, `null` when none (Ruling 5).

- [ ] **Step 1: Failing tests** — `phone.test.ts` stays green after the move (run it first, then move); `cloud.int.test.ts`: an upload with `uses` and `until` from a signed-in phone stores both and `usageForSleep` returns them with `knownUntil = until`; a computer token's upload counts its sessions as uses and does not set `knownUntil`; a phone upload older than 24 h → `knownUntil: null`; re-uploading a use with a later `endAt` grows it (one row); the answer still parses with `endpoints.usage.upload.output`. `phone-upload.test.ts`: the upload sends `uses` = `phoneUses(events, now)` since the cursor and `until: now`; an alarm app in front over the lock screen is not in `uses` (class 39); the cursor moves to the earliest start of the last app session and the last use.
- [ ] **Step 2: Run** `bun test:unit`, `bun test:api`, `bun test:app` → FAIL.
- [ ] **Step 3: Implement**; `bun db:generate`, review the DO SQL.
- [ ] **Step 4: Run** the three suites → PASS; `bun lint` clean.
- [ ] **Step 5: Commit** — "The phone sends when it was really in use, and how far it has read" (+ trailers).

### Task 12: Pure sleep rules (`sleep-auto.ts`)

**Files:**
- Create: `packages/core/src/tracking/sleep-auto.ts`, `packages/core/src/tracking/sleep-auto.test.ts`, `packages/core/src/tracking/sleep-auto.fake.ts` (fixtures: the brief's nights plus notification-noise and sparse evenings)
- Modify: `packages/core/src/tracking/categories.ts` (`REST_CLASS`), `packages/core/src/ids.ts` (sleep ids), `packages/core/src/time-tracking.ts` (exports)
- Test: `sleep-auto.test.ts`

**Interfaces:**
- Consumes: Task 11's `awakeSpells`, `isWakeUp`, `bedtimeFloor`, `isBedtime`, constants; `DeviceUse`.
- Produces:
  - `REST_CLASS: readonly Category[] = ["rest", "sleep"]`; `isRestClass(category): boolean`.
  - ids: `sleepNightOf(atIso: string, zone: string): string` (the `yyyy-MM-dd` of the noon-to-noon night the instant falls in); `sleepStartId(night: string, at: string): string` → `auto:sleep-<night>:start-<yyyyMMddTHHmm UTC>` (also the activity id); `sleepStopId(activityId: string, at: string)` → `auto:<activityId>:stop-<yyyyMMddTHHmm>`; `sleepReopenId(stopEventId: string)` → `auto:<stopEventId>:reopen`; `sleepDiscardId(startEventId: string)` → `auto:<startEventId>:discard`; `isAutoSleepId(id: string): boolean`. All match `EventIdSchema`.
  - Input: `type SleepActivity = { id: string; category: Category; startAt: string; endAt: null | string; startEventId: string; stopEventId: null | string; isAutoStart: boolean; isAutoStop: boolean; personRevokedStopsAt: readonly string[] }` (effective state: revoked events already gone; `personRevokedStopsAt` = instants of automatic stops a non-system `event.revoked` undid — the person said they were still asleep); `type SleepInput = { uses: readonly DeviceUse[]; knownUntil: null | string; activities: readonly SleepActivity[]; now: string; zone: string }`.
  - Output: `type SleepDecision = { kind: "open"; at: string; night: string } | { kind: "stop"; activityId: string; at: string } | { kind: "reopen"; activityId: string; stopEventId: string } | { kind: "discard"; activityId: string; startEventId: string }`; `decideSleep(input: SleepInput): readonly SleepDecision[]`; `sleepEvents(decisions, input): readonly EventInput[]` (`activity.started` category `sleep`, label `"Sleep"`, occurredAt = `at`; `activity.stopped` at `at`; `event.revoked` for reopen and discard; ids as above, `source: "system"`).
- Algorithm (the part signatures do not determine): uses after `knownUntil` are ignored and quiet is only counted up to `knownUntil`; `knownUntil === null` → `[]`. Spells = `awakeSpells` over all uses.
  - **open:** take the last spell end `L` before `knownUntil`; `at = bedtimeFloor(L)`; open when `isBedtime(at)`, known quiet from `at` ≥ `REST_MIN_MINUTES`, no sleep activity in `at`'s night (any source, not revoked), and no Rest-class activity running at `now`. Another category running does not block.
  - **stop / reopen:** for each running or auto-stopped sleep, walk the spells after its start: a spell starting at one of `personRevokedStopsAt` is inside the sleep (the person's undo is respected); a spell that `isWakeUp` with its known rest after (≥ `BACK_TO_SLEEP_MINUTES`) is inside the sleep — if an auto stop sits at its start and is not revoked → `reopen`; a spell whose rest after is not yet known to be long enough, or that is not a wake-up → the sleep ends at that spell's start: `stop` there unless a stop at that instant exists; stop walking. A stop the person made is never reopened or moved; a sleep the person started is never moved or discarded.
  - **discard:** an auto-started sleep whose final end is decided (a long wake) with asleep minutes (`end − start − short wakes`) < `SLEEP_MIN_MINUTES` → `discard` (revoke the start); its night is free again.

- [ ] **Step 1: Write the failing tests** (`sleep-auto.test.ts`, zone Europe/Moscow unless said; apply the produced events to a materialized state in a helper and assert the effective activities, then re-run on the result):
  1. Last use 23:40, quiet till 07:10 (known through 07:30) → open at 23:40, stop at 07:10; effective: one sleep 23:40→07:10.
  2. Wake 03:00–03:06 then quiet till 07:10 → at 03:20 knowledge: stop at 03:00; at 04:40 knowledge (≥ 90 min quiet after 03:06): reopen (the stop revoked); final effective state one sleep 23:40→07:10.
  3. Wake 03:00–03:40 (longer than 30) → stopped at 03:00 for good, no new open that night (the night has a sleep ≥ 180 min).
  4. A sleep the person started at 23:00 → no open; use at 02:10 for 4 min → stop at 02:10; quiet 90 min → reopen; its start stays 23:00; never discarded even if short.
  5. A `rest` activity running at `now` → no open; a `task` focus left running → open anyway.
  6. Phone known only until 01:00, last use 00:30 → open at 00:30 only if quiet 00:30→01:00 ≥ 45 (no: 30 min) → nothing; known until 01:20 → open at 00:30; nothing decided from uses after `knownUntil`.
  7. Idempotence: `decideSleep` on the state after applying its own events → `[]`; and re-running with the same input yields the same ids.
  8. Short evening rest: last use 21:10, next use 22:05 (55 min) → open at 21:10, stop at 22:05, discard; a later real night 23:30→07:00 → opens again at 23:30 with a different start id (class 38).
  9. Boundaries: last use at 20:59 with quiet till 23:00 → open at 21:00 (floor); last use at 05:00 → no open (not bedtime); a wake starting 06:59 (≤ 30 min, 90 quiet after) → reopen; starting 07:00 → final stop.
  10. A computer use at 23:20 arriving after a sleep was opened at 23:00 → stop at 23:20 and discard (late data corrects itself).
  11. The person revokes the automatic stop at 03:00 (a 40-minute wake) → no stop at 03:00 is written again; the next use at 07:10 → a stop at 07:10 with its own id.
  12. Properties (fast-check, offsets from a fixed night, zones Europe/Moscow and America/New_York across a DST night): idempotent; no decision's instant is after `knownUntil`; at most one effective sleep per night; uses no more than 44 minutes apart from 08:00 to 02:00 never yield a sleep (class 39: a day of frequent use).
- [ ] **Step 2: Run** `bun test:unit` → FAIL.
- [ ] **Step 3: Implement** `decideSleep`, `sleepEvents`, ids, `REST_CLASS`.
- [ ] **Step 4: Run** `bun test:unit` → PASS (coverage thresholds hold); `bun lint` clean.
- [ ] **Step 5: Commit** — "Sleep decided from use on every device: open, stop, reopen after a short wake, discard a short one" (+ trailers).

### Task 13: Sleep runs in the user's store; the phone-only card goes

**Files:**
- Create: `apps/api/src/user-store/sleep-pass.ts`, `apps/api/src/user-store/alarm.ts`
- Modify: `apps/api/src/user-store/user-store.ts` (after `addUsage` and in `alarm()`), `apps/api/src/user-store/pool-retry-alarm.ts` and `parse-queue.ts` (arm through `alarm.ts`), `packages/client/src/view-models/decisions.ts` + i18n (sleep decisions worded, class 42), `docs/architecture.md` (DO section)
- Delete: `detectSleep`, `SleepCandidate` and the code only they use in `packages/core/src/tracking/phone.ts` (+ their tests), the sleep card in `apps/app/src/features/day/phone-section.tsx` and `sleepOf` in `use-day-phone.ts`, `sleepKey` in `apps/app/src/platform/phone-memory.ts`, the `phone.sleep*` / `phone.wakeUps` strings, `day-phone.test.tsx` sleep cases
- Test: `apps/api/tests/sleep.int.test.ts`, `packages/client/src/view-models/decisions.test.ts`, `apps/app/src/features/day/day-phone.test.tsx`

**Interfaces:**
- Consumes: Task 11's `usageForSleep`, Task 12's `decideSleep`, `sleepEvents`.
- Produces:
  - `runSleepPass(store, now): Promise<readonly string[]>` — builds `SleepInput` from the state (sleep-category activities with their start/stop event ids; `isAutoSleepId`) and `usageForSleep(now − 36 h)`, appends `sleepEvents` through the store's system insert, logs each decision in `decisions` with `kind "sleep"`, `rule` = `sleep.open | sleep.stop | sleep.reopen | sleep.discard`, `inputs` = the spells and `knownUntil` it relied on.
  - `alarm.ts`: `armEarliest(storage: DurableObjectStorage, at: number): Promise<void>` (moves the alarm only earlier) and `nextSleepCheckAt(now: string, zone: string): number` — `now + 15 min` while the local time is in 21:00–12:00, else the next 21:00. The pool's `scheduleNextPass` no longer deletes or overwrites an earlier alarm (it, the parse queue and the sleep pass all arm through `armEarliest`; `alarm()` re-arms every due time it still has).
  - Decisions view: "Sleep started at 23:40 (no phone use since)", "Sleep ended at 07:10 (the phone was picked up)", "Sleep continued: a short wake at 03:00", "A short rest at 21:10 was not sleep" (RU mirrored); no rule keys on screen.

- [ ] **Step 1: Failing API tests** — `sleep.int.test.ts` (account zone Europe/Moscow; upload fixtures through `POST /api/usage/sessions` with `uses` and `until` as a phone; run the alarm with `runDurableObjectAlarm` as the notifier tests do; read `GET /api/sync/pull` events parsed with the endpoint's output schema):
  - Scenario 1 (23:40 → 07:10) → one `activity.started` id `auto:sleep-<night>:start-…` occurredAt 23:40 `source "system"`, then `activity.stopped` at 07:10 after the morning upload.
  - Scenario 2 → stop, then `event.revoked` of that stop after the quiet upload; effective state one sleep.
  - Uploading the same fixtures again and running the alarm twice → no new events (idempotent).
  - The alarm is armed at most 15 min ahead during the night, at the next 21:00 by day; a pending parse-queue retry earlier than that keeps its earlier alarm (no overwrite).
  - Each decision is in `decisions` with its rule and inputs.
  - Undo in History: revoking the automatic stop by hand, then a new use → a new stop with a different id is written (class 38: edit → undo → edit).
- [ ] **Step 2: Run** `bun test:api` → FAIL. **Step 3: Implement.**
- [ ] **Step 4: Failing client/app tests** — `decisions.test.ts`: a `sleep.open` decision renders "Sleep started at 23:40 (no phone use since)" in EN and RU and contains no `sleep.open` text; `day-phone.test.tsx`: Day shows no "Last night" card and no Log sleep / Not sleep buttons, the screen-time list still renders.
- [ ] **Step 5: Implement** the wording and the removals (grep `detectSleep|SleepCandidate|sleepKey|phone.sleep` → only history in `context/`).
- [ ] **Step 6: Run** `bun test:unit`, `bun test:api`, `bun test:app` → PASS; `bun lint` clean (Knip finds leftovers).
- [ ] **Step 7: Commit** — "Sleep is recorded on the server without asking; the phone's sleep card is gone" (+ trailers).

Not verifiable here: tuning against the owner's production `usage_sessions` with the new `uses` data (class 39 asks for it). Verifiable: the fixtures above, including the phase B nights. After release the controller asks the owner for a week of production data (`phone_uses` + confirmed sleeps) and replays it through `decideSleep` in a scratch script before any constant changes.

---

## Part QA14 — leftovers of QA round 14 (owner: "все что нужно сделать — сделай")

Source: `context/qa-round-14.md` (L1–L10, each with steps, what happened and what is expected — that text is the
requirement). Every fix is TDD at the level `docs/testing.md` names, with an e2e or app test that reproduces the
tester's steps first. Each finding gets a bug-lessons check (is it a known class? if not, a new class with the guard).

### Task 14: Task form and composer leftovers (L3, L4, L5, L6 incl. the red title on a fresh form, L7, L8)

**Files:** the task form / composer under `apps/app/src/features/` (find with `grep -rn "Give the task a title" packages apps`),
the series/deadline validation in `packages/core` (one decision function read by both the form and the action — class 1),
`packages/core/src/i18n/{en,ru}/*.ts`, tests next to them, `e2e/` for the form flows.

- [ ] L3: in Edit, when the start is the automatic one or earlier than now, the refusal is the same "The deadline has already passed … Pick a later deadline." as in New task; the other refusal names what to change.
- [ ] L4: "On a date" final deadline missing or not after the main due → "Pick a final deadline after <main due>." (formatted like the chip).
- [ ] L5: the refusal under Repeat is `role="alert"` (live) and linked from the field with `aria-describedby`; on a phone, the refusal is scrolled into view with the Create button reachable.
- [ ] L6: ✕ discards the New task draft (a fresh form next time); the title is not red on a fresh, untouched form (error only after a submit attempt or blur with content removed).
- [ ] L7: a plain task whose start is after its deadline shows the same sentence under Due ("The deadline is before the start") through the same core function as the series refusal; Create stays allowed (it is a warning for a plain task).
- [ ] L8: Escape in the correction field returns focus to the composer line.
- [ ] Run `bun test:unit`, `bun test:app`, the touched e2e files, `bun lint`; commit.

### Task 15: Log, rows, toasts and titles leftovers (L1, L2, L9, L10)

**Files:** the decisions-log view-model (M4, `packages/client` / `apps/app/src/features/decisions*`), row repeat mark (M2 code),
toast copy, route titles (`apps/app/src/app/**` — expo-router `Stack.Screen options.title` or the web `document.title` helper),
Insights screen, the series next-instance computation in `packages/core`.

- [ ] L1: a superseded reading folds into its conversation's row; an abandoned one (line edited instead of Approve/Cancel) ends "You changed the text instead" (RU mirrored) — never "Shown to you for approval" forever.
- [ ] L2: drop "(model not recorded)" when there is no model; keep "via local rules".
- [ ] L9: the last instance of a series carries no repeat mark on rows (one predicate shared with the task screen's "this one is the last" — class 1).
- [ ] L10a: the toast after Approve says what was done ("Created “<title>”" / RU), not a bare "Done".
- [ ] L10b: "To Inbox" (Alt+Enter and the button) shows a toast "Sent to Inbox" with Undo, like other adds.
- [ ] L10c: every route has its own `document.title` on the web ("Now · Pace", "Settings · Pace", … through `t()`); an e2e sweep over all routes asserts distinct titles.
- [ ] L10d: Insights RU 390 `scrollable-region-focusable` axe violation fixed (focusable scroll region with a label) and the e2e axe sweep covers Insights at 390 in RU.
- [ ] L10e: the next instance of a daily/monthly series starts at the series' own start time of day (or the start of the day when the series has no explicit start time), not the creation time of day; a fast-check property over creation times.
- [ ] Run `bun test:unit`, `bun test:app`, the touched e2e files, `bun lint`; commit.

## Final part — run by the controller (no implementer task)

- [ ] **Docs pass:** `docs/architecture.md` (protocol and `/api/instance`, sessions and login notices, `pace.v2`, background check, automatic sleep, sidebar list), `docs/testing.md` (new int test files, the socket tests, the sleep properties), `docs/mcp.md` / `docs/desktop.md` (sessions list), `docs/self-hosting.md` and README checked against the code, `context/stage-8/README.md` updated for PR 3. Each task already wrote its part; this pass checks they agree.
- [ ] **Bug-lessons sweep:** for every bug found during the phase (reviews, QA), an entry in `context/bug-lessons.md` with why the tests missed it, its class, the sweep and the guard (CLAUDE.md rule).
- [ ] **Exploratory QA** (`docs/qa.md`): a Sonnet agent clicks through the web build and writes `context/qa-round-15.md` (Settings sessions and sheets, login notice flow with the dev login, live sync between two tabs, the decisions log with sleep entries, both themes, 390 and 1440 px, Russian); in parallel the whole-branch review through `superpowers:requesting-code-review` with this plan and the range `origin/main...HEAD`. Fix findings with TDD; repeat until only cosmetic findings remain.
- [ ] **Design pass** (CLAUDE.md "Design"): `design-critique`, `accessibility-review`, `ux-copy` on screenshots of Settings (sessions list, Connect an AI app, Change server sheet, the versions screen, the battery hint) in both themes, phone and desktop, Russian.
- [ ] **Needs the owner (not verifiable here):** an Android device without Google services (background check delivery within ~15 min, the battery exemption and vendor autostart page, Change server against a self-hosted URL, the versions screen with an older server), a real Telegram login from a phone and from a browser (one message each, Not me), `PACE_VERSION` showing the tag after `deploy.yml`, and a week of production data replayed through the sleep rules.
