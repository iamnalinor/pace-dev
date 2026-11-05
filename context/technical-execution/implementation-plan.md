# Technical foundations implementation plan

> Recovery note (2026-11-05): the original record below is historical. Current authority,
> main-based integration status and remaining work are in
> [continuation-2026-11-05.md](continuation-2026-11-05.md).
> Push/checkpoint/PR work is authorized; exploratory QA and emulator execution are excluded.

> For agentic workers: use superpowers:subagent-driven-development task-by-task. Follow CLAUDE.md. The user authorized execution of the roadmap; do not pause for a new approval between tasks.

**Goal:** Implement the approved technical roadmap in independently reviewable changes, preserving the unfinished redesign.
**Architecture:** Retain core/client/API/app boundaries, event sourcing and the shared API contract. Ship additive interfaces before strict behavior; native release testing comes before changes to push initialization or OTA.
**Tech stack:** Bun 1.4.2, TypeScript, Expo/React Native, Hono, workerd/D1/DO, Kotlin, GitHub Actions, Maestro.
**Spec:** `context/technical-roadmap.md` and the five original technical briefs linked there. This file expands the first executable tasks; later tasks must be expanded before implementation, based on evidence from the preceding gates.

## Global Constraints

- Bun only; run `bun lint`, never weaken a lint rule to pass.
- Contract first; pure core returns Result, no provider secrets in public output.
- One Android/web UI; EN/RU through `t()`, existing redesign kit.
- No push, deploy, publish or production data mutation. No full exploratory QA (owner instruction this session); targeted feature E2E by a separate Sol reviewer when runnable.
- TDD for behavior; report RED and GREEN evidence and unavailable checks separately. No claims that an emulator, device or GitHub workflow ran without evidence.
- Keep code/comments in English. Schema migrations generated, not manually edited.
- Runtime source is the approved PR #54 snapshot; no automatic integration of concurrent redesign changes.

## Review Focus

1. Release-like Android hides dev login: test APK must explicitly enable it while production remains unreachable (Task 1).
2. Android HTTP restrictions differ from web: loopback test server must work without broadening production cleartext policy (Task 1).
3. Firebase bindings written after deploy: no strict guard until both live values are staged and validated (Task 2, later strict rollout).
4. Old clients and servers coexist: tolerant public field, unchanged baked-config APK behavior until native migration (Task 2).
5. Malformed or cross-project Firebase input: typed error, no leaked service-account fields, no silently substituted foreign package (Task 2).

### Task 1: Android CI harness and deterministic smoke

**Files:** create `.github/workflows/android-e2e.yml`, `e2e/android/` flows and runner support under `scripts/android/`; modify `docs/testing.md`, the existing Android config/login guard only as required. Tests alongside new script logic and existing config/login tests.

**Interfaces:** manual workflow (and reusable `workflow_call` for a later release gate), test-only x86_64 APK, API on host 8787 reached at `http://10.0.2.2:8787`, Maestro smoke with isolated dev account. Local runner produces explicit failure status and artifacts; production release remains arm64.

- [x] Read original Android brief, release workflow, app config, native login and API test environment.
- [x] Test-first: test-build-only login availability (release-like build), production remains hidden; test-only cleartext config, default build unchanged. Use existing explicit `EXPO_PUBLIC_DEV_LOGIN=1` signal rather than a second drifting flag.
- [x] Add pinned Maestro/emulator setup, x86_64 APK build, local D1 migrations/API startup and health wait. Configure test whitelist/bot values without real credentials. Never contact production from a flow. Fail test APK configuration unless its API is explicitly the emulator-local origin; never accept the default production fallback.
- [x] Add dev login → Now smoke; reset app state per run; capture logcat/Maestro output on failure. Add testable script guards for failure propagation, required build flags and deterministic readiness. A mock API path must not stand in for successful on-device execution.
- [x] Run focused tests RED → GREEN, `bun lint`, relevant unit/app checks. Inspect YAML and runner behavior; attempt available Android tooling and record exact constraints if KVM/SDK are absent.
- [x] Document exact local/CI command and coverage; leave release integration gated on a real successful emulator run, rather than silently blocking all releases with an unverified workflow. Extend to background/session/server flows in subsequent task once smoke runs.
- [x] Commit only owned changes; write task report with commands/output/limitations; independent review via Superpowers template + ECC test/security lenses.

### Task 2: Additive Firebase configuration contract

**Files:** core Firebase parser/schema and tests, `packages/core/src/api/schemas/instance.ts`, core exports; API instance route and tests, shared FCM/config helpers/env as needed; self-hosting docs. Do not remove baked APK config in this task.

**Interfaces:** public Firebase config `{projectId, senderId, apps: [{packageName, appId, apiKey}]}` or null; pure Result parser from unknown raw JSON, typed reasons. `FIREBASE_ANDROID_CONFIG` optional. Separate pure pair-validation result for later rollout; existing FCM sender behavior retained in this additive step. Export `parseFirebaseAndroidConfig(raw: string): Result<FirebaseAndroidConfig, FirebaseConfigError>` and `validateFirebaseConfig(env: { readonly FIREBASE_ANDROID_CONFIG?: string; readonly FIREBASE_SERVICE_ACCOUNT?: string }): Result<FirebaseAndroidConfig | null, FirebaseConfigError>` from core. Public schema/types live with the pure Firebase parser. Validation keeps the existing sender account shape, compares project IDs, rejects blank required fields and ambiguous duplicate package entries; empty strings count as unset. `validateFirebaseConfig` is strict for partial pairs, while the API additive adapter explicitly treats service-account-only as legacy metadata-null. Tests pin that distinction.

- [x] Read original Firebase brief and current sender/config/deploy path; settle exact exported names before code.
- [x] Write failing tests for valid multi-package JSON, missing fields, no Android clients, bad JSON, both absent, one absent, mismatched projects; public output excludes secret fields.
- [x] Implement pure parsing/validation and tolerant InstanceSchema field; test old payload without field and unknown malformed field behavior.
- [x] Add API public output for configured matching pair; retain current baked-config behavior for service-account-only servers during this migration phase. Explain transitional behavior in docs; malformed new config must produce a typed validator failure and sanitized operator log. During this additive phase /api/instance remains HTTP 200 with firebase:null, and health/auth/legacy FCM remain unchanged; outward server/misconfigured plus client error interpretation belong together to pending Task 3b.
- [x] Trace consumers and old clients; integration tests exercise /api/instance, health and unchanged push registration. Stage strict global guard/deploy changes as next task, not hidden in this additive commit.
- [x] Run focused RED → GREEN, `bun lint`, unit/API/app suites as relevant; independent review and commit.

### Task 3: Local Firebase preflight command

**Files:** `scripts/check-config.ts`, `scripts/check-config.test.ts`, root package scripts, self-hosting documentation. Read `firebase-rollout-design.md` for subsequent deployment design; this task implements only its local CLI boundary.

**Interfaces:** `bun run check:config`, reads the exact two Firebase environment bindings and calls Task 2's strict `validateFirebaseConfig`. Optional `--expect=configured` or `--expect=disabled`; absent means validate either complete configuration or deliberate absence. Unknown arguments fail. Output contains fixed reason codes only, never configuration values. Invocation in CI must disable implicit dotenv loading at both Bun levels: package script uses `bun --no-env-file scripts/check-config.ts`, and the documented fixed-output invocation is `bun --no-env-file --silent run check:config`. The outer runner does not forward `--no-env-file`; without `--silent` it may echo arguments before the CLI runs. Config values are supported only through environment variables, never argv. Do not change global bunfig behavior.

- [x] Test subprocess exit/output for valid pair, absent pair, each malformed/partial/mismatched pair, invalid arguments, expected-state mismatch and secret-fragment non-disclosure.
- [x] Implement CLI using shared parser, no duplicate schema or runtime guard. Document that locally absent env does not prove an existing Worker's secret values are absent.
- [x] Document preflight command and safe staged rollout design. Do not wire strict activation or move production traffic; exact candidate verification and nonproduction rehearsal remain external prerequisites.
- [x] Run tests RED/GREEN and `bun lint`; independent review; commit.

## Subsequent tasks and prerequisites

- Task 3b: reason-preserving client error, opt-in strict guard and exact-version deploy staging, per firebase-rollout-design.md. Requires nonproduction Cloudflare rehearsal before activation and stabilized redesign status surfaces.
- Task 4: native runtime Firebase, server-switch persistence/restart, initialized-project registration and Settings reason; tests + emulator/device evidence before removing baked config.
- Task 5: expand Android real flows, release gate only after a real successful run.
- Task 6: OTA protocol spike, runtime/signature tests, then publisher/app integration; APK signing material and real-device rollback evidence remain external gates.
- Task 7: synthetic cold-start baseline; production quota measurement remains unavailable until operator supplies read-only metrics.
- Task 8: minimal ports and dependency guards, before actor/cold-storage changes.
- Task 9: checkpoint shadow mode, then archive verification, then client sync/protocol + restore; pruning activation last and never performed against production here.
- Task 10: conditional workerd/alternative-host spike per measurement; no production migration.

Every subsequent task gets concrete files/interfaces/tests and a preflight check before dispatch. This is not a claim that those tasks are implemented.
