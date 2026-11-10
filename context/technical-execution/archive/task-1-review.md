> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

### Spec Compliance

- ❌ Issues found: the harness unintentionally adds host `jq` to the ordinary unit suite, outside the Android tool setup (`scripts/android/smoke.test.ts:133`, `scripts/android/smoke.sh:67`, `package.json:42`).
- ✅ The requested workflow, smoke flow, runner, config/login guard, tests and documentation are present (`.github/workflows/android-e2e.yml:4`, `e2e/android/smoke.yaml:1`, `scripts/android/smoke.sh:19`, `apps/app/app.config.ts:52`, `apps/app/src/screens/login-screen.tsx:135`, `scripts/android/smoke.test.ts:11`, `docs/testing.md:205`).
- ⚠️ Cannot verify actual x86_64 APK packaging, emulator login and negative control, or hosted workflow success: the implementer produced no APK and reported no running emulator or hosted workflow (`task-1-report.md:20`–`25`). On a capable runner, verify an actual built APK passes the package guard and reaches Now; verify a deliberately broken flow/build fails before wiring the release gate (`context/android-e2e-plan.md:51`, `.github/workflows/android-e2e.yml:3`).

### Strengths

- The workflow supports both manual dispatch and later reuse, installs a checksum-verified Maestro and a commit-pinned emulator action with a pinned emulator build, and always uploads available diagnostics (`.github/workflows/android-e2e.yml:3`–`9`, `:50`–`79`). I checked the unchanged release workflow for the ABI isolation risk: release still assembles arm64 (`.github/workflows/release.yml:125`).
- APK checks precede installation and reject either a wrong application ID or missing/wrong embedded origin or dev flag (`scripts/android/smoke.sh:73`–`80`). The build config requires the existing opt-in and exact emulator URL to enable its separate identity and manifest plugin; the plugin denies cleartext outside the emulator host (`apps/app/app.config.ts:50`–`54`, `:69`, `:188`, `apps/app/plugins/with-emulator-network.js:6`–`13`).
- Security trace, checked for unintended production login or production traffic: the native gate requires the embedded emulator origin and opt-in in release mode (`apps/app/src/platform/api-base.ts:19`–`32`, `apps/app/src/screens/login-screen.tsx:135`). The flow clears state before interacting (`e2e/android/smoke.yaml:4`–`7`); the unchanged origin loader then falls back to the embedded API origin (`apps/app/src/platform/server.ts:11`–`17`), and the runtime passes it to the real client (`apps/app/src/runtime.ts:95`–`103`). The form calls `auth.loginWithDev` (`apps/app/src/screens/login-parts.tsx:53`–`63`), whose client posts the auth dev contract (`packages/client/src/auth.ts:323`–`324`). The fresh local Worker sets a single fake ID and fake provider/bot values (`scripts/android/smoke.sh:108`–`127`, `apps/api/wrangler.jsonc:52`–`78`); the unchanged endpoint returns 404 in production and the shared sign-in rejects nonmembers before writing a user or session (`apps/api/src/auth/auth-routes.ts:142`–`159`, `:274`–`294`; `apps/api/src/auth/whitelist.ts:6`–`7`). The host-only check reported allowed ID 844001 and HTTP 403 for 844002 (`task-1-report.md:17`).
- Release-mode config tests cover absent opt-in and alternate origins; the screen test covers the hidden form and submission wiring. The shell tests execute real runner control flow with process-boundary stubs, distinguish a bad health body from readiness, and verify that the Maestro status and diagnostics survive failure (`apps/app/app.config.test.ts:63`–`85`, `apps/app/src/platform/api-base.test.ts:31`–`53`, `apps/app/src/screens/login-screen.test.tsx:131`–`143`, `scripts/android/smoke.test.ts:27`–`58`). They do not replace the unavailable on-device run.

### Issues

#### Critical (Must Fix)

- None identified.

#### Important (Should Fix)

- `scripts/android/smoke.test.ts:133`, `scripts/android/smoke.sh:67`, `package.json:42`: the script fixtures supply fake adb, apkanalyzer, curl, Maestro, sleep and Wrangler, but use the host's real `jq`. A developer running the normal unit suite without `jq` therefore fails Android fixture tests before the exercised behavior begins. Android documentation mentions `jq` for the optional emulator command only (`docs/testing.md:216`). Use the already-required Bun runtime for the two JSON predicates, or otherwise keep the standard unit suite independent of this Android prerequisite while preserving assertions against the real predicates.
- Focused check for the named dependency risk: ran only `bun test scripts/android/smoke.test.ts -t 'propagates Maestro failure'` with standard shell utilities on a temporary PATH and no `jq`. The test expected Maestro status 42 and received 1; four unrelated tests were filtered out (`scripts/android/smoke.test.ts:27`–`29`). No broad suite was rerun.

#### Minor (Nice to Have)

- `task-1-report.md:15`: the reported lint check is green but noisy (110 existing design warnings). The implementer reports no new warning; treat existing warning removal as repository follow-up and do not weaken lint.

### Declined to judge

- Later Android workflows for Change server, sessions, notifications, usage and background work: this task covers dev sign-in to Now (`task-1-brief.md:13`, `context/android-e2e-plan.md:34`–`47`).
- End-to-end Telegram/browser fallback behavior in the smoke APK: the smoke never takes it; docs scope it to dev login (`e2e/android/smoke.yaml:8`–`23`, `docs/testing.md:230`–`232`).
- Production release integration and full exploratory QA: intentionally outside this gate until Android smoke and its negative control have run (`task-1-brief.md:13`, `task-1-report.md:25`).

### Assessment

**Task quality:** Needs fixes.

**Reasoning:** The isolation and harness design are sound in source, but the newly required system binary breaks a normal unit-suite invocation. Fix that dependency regression and keep the emulator evidence open until a real run.

**Reviewed range:** a67cc504dac7f4569a8cbc5da91c8ed4350bc5a3..bcf8d80bdbaf626e5241c1528b90aed1f001923c, tree 31fb5df0b62693077f1e052276ed04c0a5dff820 as verified by the controller.
