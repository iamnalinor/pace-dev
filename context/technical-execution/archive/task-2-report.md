> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Task 2: Additive Firebase configuration contract

## Implementation

- Exported `FirebaseAndroidConfigSchema`, `FirebaseAndroidConfig`, `FirebaseConfigError`, `parseFirebaseAndroidConfig` and `validateFirebaseConfig` from core. The parser reads the raw Google file and keeps only `projectId`, `senderId`, and each Android package's `packageName`, `appId` and first `apiKey`. It handles multiple packages, strips unrelated fields, rejects missing or blank required fields and refuses ambiguous duplicates.
- The strict validator distinguishes deliberate no-Firebase (both bindings undefined/empty) from partial, invalid and mismatched pairs. Its stable reason codes are `android-config-invalid`, `android-config-not-json`, `duplicate-android-package`, `invalid-service-account`, `missing-android-config`, `missing-service-account`, `no-android-clients`, and `project-mismatch`. It shares the existing service-account decoder with the FCM sender while performing its own blank-field checks.
- The public endpoint uses the strict validator only when Android metadata is configured. It returns `firebase: null` with HTTP 200 for absent or invalid metadata. An invalid pair emits one sanitized warning per reason per isolate; the only diagnostic detail is its fixed code. Sender-only remains valid for legacy FCM and does not emit an Android metadata warning. The API keeps deriving `features.push` from the legacy sender and method availability. Health, auth, push methods and push registration have no strict pair gate.
- The shared endpoint schema reads an older response or a malformed Firebase field as `null`, leaving the rest of the instance readable. No protocol bump.
- Traced `packages/client/src/instance.ts` (one discovery call; compatibility still only uses protocol fields), `apps/app/src/platform/server-store.ts` (stores the instance as before), and the Android notification registration path in `apps/app/src/platform/notifications.ts` (compares and sends the baked project as before). `release.yml`, `app.config.ts`, native code and deploy workflow remain as they were. The self-hosting instructions explain the transitional behavior.

## TDD evidence

- RED from `packages/core`: `bun x vitest run src/firebase/config.test.ts src/api/schemas/instance.test.ts`. The parser tests could not import the unimplemented module. Both new instance tests failed with missing metadata (`expected undefined to be null` / missing `firebase: null`); the four existing instance assertions passed.
- RED from `apps/api`: `bun run test --maxWorkers=1 tests/instance.int.test.ts`. The seven metadata assertions failed for the absent field, including the raw HTTP matching-pair assertion (`expected undefined to deeply equal` the public metadata); the six existing assertions passed.
- GREEN from `packages/core`: `bun x vitest run src/firebase/config.test.ts src/api/schemas/instance.test.ts` — 29/29.
- GREEN from `apps/api`: `bun run test --maxWorkers=1 tests/instance.int.test.ts tests/health.int.test.ts tests/notify.int.test.ts` — 55/55. The instance tests assert raw wire projection, exact sanitized logs, health, authenticated /api/me and registration by an older APK (no project field). The notification suite includes simulated FCM sends with real signing in workerd.
- GREEN from `packages/client`: `bun x vitest run src/instance.test.ts` — 12/12, including the single discovery request and old response fixture.
- GREEN from `apps/app`: `bun run test --runInBand --runTestsByPath src/platform/server-store.test.ts src/platform/server.test.ts src/features/server/server.test.tsx` — 29/29.
- API runs emitted existing Wrangler proxy and missing dependency sourcemap notices. The focused app run emitted React overlapping act warnings in the existing picker tests. None affected assertions.

## Files changed

- `packages/core/src/firebase/config.ts`, `packages/core/src/firebase/config.test.ts`
- `packages/core/src/api/schemas/instance.ts`, `packages/core/src/api/schemas/instance.test.ts`, `packages/core/src/core.ts`
- `apps/api/src/app.ts`, `apps/api/src/shared/env.d.ts`, `apps/api/src/shared/fcm.ts`, `apps/api/src/shared/firebase-config.ts`, `apps/api/tests/instance.int.test.ts`
- `apps/app/src/platform/server-store.test.ts`, `docs/self-hosting.md`

## Self-review

The only public values come from explicit Android field projection; the service-account parser is used for sender construction and project equality and is never serialized. The diagnostic does not report JSON, Zod errors, field values or credentials. The FCM sender still parses the same shape and uses the same default token URI, fingerprint, auth and fallback behavior. Full suites and independent review are controller-owned. No production action or Android device validation was part of this task.

The first normal pre-commit run found deeply nested Zod calls and two readability rules in the new parser. Factored those schema declarations and rewrote the callback/destructuring without changing validation. The recheck of the two core files passed 29/29; the recheck of `tests/instance.int.test.ts` passed 13/13. Formatted staged tree for review: `87aa3a37c2fb3071d95b059d5347d8622d1fbba6`.

## Review round 1

- The core service-account decoder now returns `Result<FirebaseServiceAccount, "invalid-service-account">`. The FCM sender unwraps a successful result and keeps its old generic fallback for absent/invalid credentials. Strict pair validation propagates the typed parse failure, then checks the three required fields for blank values and compares projects.
- RED from `packages/core`: `bun x vitest run src/firebase/config.test.ts` — 2 new tests failed (the decoder returned a bare account instead of `ok`, and `null` instead of the typed error). The other 23 tests passed.
- GREEN from `packages/core`: `bun x vitest run src/firebase/config.test.ts src/api/schemas/instance.test.ts` — 31/31, including the default token endpoint and error sanitization.
- The integration test expectations now compare the complete sanitized log records in one assertion per scenario and verify the registration refusal code when there is no sender. The direct instance suite passed 13/13 after this test cleanup and before the decoder review fix; the three covering workerd suites were run again after the review fix.
- GREEN from `apps/api`: `bun run test --maxWorkers=1 tests/instance.int.test.ts tests/health.int.test.ts tests/notify.int.test.ts` — 55/55 after the Result change. A subsequent layout-only lint cleanup moved the required-field predicate out of the validator; the focused core recheck passed 31/31.

## Commit and lint

Commit `2fc8702c3d3339e66ae281456f94efdebb5226f6` — Expose additive Firebase Android configuration metadata. The normal Lefthook pre-commit hook ran the full `bun lint` in 248.9 seconds and passed design generation, formatting, ESLint, all TypeScript projects, Knip, duplication (0 clones), dependency architecture, workflow checks, and migration sync. `git diff --check HEAD^ HEAD` was clean. The final tree `3425f58ec1f107287dd2ecd7f6b4e4ea738049bc` differs from the approved review tree only by wrapping the account predicate for formatting and hoisting the test's time matcher out of a conditional expression. The working tree has no task-owned changes left.
