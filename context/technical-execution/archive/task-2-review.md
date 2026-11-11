> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

### Spec Compliance

- ❌ Issues found: The new exported service-account parser returns bare `null` on a parse error, contrary to the task's global “pure core returns Result” rule (`packages/core/src/firebase/config.ts:113`, `packages/core/src/core.ts:97`).
- ✅ The requested Android parser, strict pair validator, tolerant instance schema, additive instance route, env declaration, integration tests and transition documentation are present (`packages/core/src/firebase/config.ts:69`, `packages/core/src/firebase/config.ts:119`, `packages/core/src/api/schemas/instance.ts:27`, `apps/api/src/app.ts:82`, `apps/api/src/shared/env.d.ts:34`, `apps/api/tests/instance.int.test.ts:78`, `docs/self-hosting.md:120`).
- ⚠️ Cannot verify from diff: the RED/GREEN run sequence and lint/build execution. The report records core/API RED and GREEN, focused client/app GREEN and post-format rechecks of 29/29 core and 13/13 instance tests (`.superpowers/sdd/implementation-plan/task-2-report.md:13`, `.superpowers/sdd/implementation-plan/task-2-report.md:32`); canonical lint and the exact reviewed/committed tree identity are controller checks. GitHub workflow or device execution was not claimed or inferred.

### Strengths

- The projection explicitly creates each public field; the service-account values only supply sender credentials and the project comparison. The metadata warning contains a fixed reason and no raw bindings or parse diagnostics. Raw HTTP assertions inspect the body before tolerant schema parsing could hide extra fields (`packages/core/src/firebase/config.ts:91`, `packages/core/src/firebase/config.ts:149`, `apps/api/src/shared/firebase-config.ts:18`, `apps/api/tests/instance.int.test.ts:84`).
- The API adapter deliberately returns `null` when no Android binding is provided, including legacy sender-only. The strict validator rejects that partial pair. The additive API tests check both the status and exact warning and exercise health, auth and legacy registration against the Worker rather than mocks (`apps/api/src/shared/firebase-config.ts:18`, `packages/core/src/firebase/config.ts:127`, `packages/core/src/firebase/config.test.ts:118`, `apps/api/tests/instance.int.test.ts:128`).
- Focused compatibility trace (risk: mixed client/server versions): `endpoints.instance` remains a public GET with the shared output schema. Current clients make one request, their compatibility decision uses only the two protocol fields, and the server store retains the parsed instance. Old responses without metadata and malformed new metadata read as `null`; the previous object shape strips the new key. Existing `loosen` preserves nested array checks while stripping unknown keys (`packages/core/src/api/endpoints.ts:65`, `packages/client/src/instance.ts:28`, `packages/core/src/api/protocol.ts:39`, `apps/app/src/platform/server-store.ts:47`, `packages/core/src/api/tolerant.ts:31`, `packages/core/src/api/loose.ts:16`, `packages/core/src/api/schemas/instance.test.ts:19`).
- Focused sender trace (risk: breaking account-only FCM on old APKs): legacy sender schema/default/fingerprint are preserved. Push method offers and registration still use only the sender account; a request without project ID is still allowed subject to method and token checks. Installed Android builds continue to get the baked project and obtain/register their device token as before (`apps/api/src/shared/fcm.ts:48`, `packages/core/src/firebase/config.ts:103`, `apps/api/src/shared/push/registry.ts:21`, `apps/api/src/shared/push/registry.ts:95`, `apps/app/src/platform/firebase-project.ts:7`, `apps/app/src/platform/notifications.ts:109`, `apps/app/src/platform/notifications.ts:338`). Deployment/release paths remain as documented for the transition (`.github/workflows/deploy.yml:181`, `.github/workflows/release.yml:80`, `docs/self-hosting.md:120`).
- Type design (encapsulation, invariant expression, usefulness, enforcement; /5): `FirebaseAndroidConfig` (`packages/core/src/firebase/config.ts:18`) 4/3/5/4: schema-derived type and runtime nonblank/nonempty/unique checks at both ingress boundaries; the structural type alone permits hand-built values that bypass checks, acceptable for this wire shape. `FirebaseConfigError` (`packages/core/src/firebase/config.ts:26`) 5/5/5/5: finite typed errors kept out of the public success payload and suitable for reason-only diagnostics. `FirebaseServiceAccount` (`packages/core/src/firebase/config.ts:103`) 3/4/4/4: schema models the existing sender shape, including normalized default token URL, and no credential values flow into the public payload; make the exported parser's failure explicit with a typed Result.

### Issues

#### Critical (Must Fix)

- None.

#### Important (Should Fix)

- `packages/core/src/firebase/config.ts:113`: The new exported `parseFirebaseServiceAccount` is a pure parser that erases an expected error into bare `null`. The fact that its caller adapts the outcome does not make the exported contract a Result. Return `Result<FirebaseServiceAccount, "invalid-service-account">`, propagate the failure from pair validation, and let `fcmTargetOf` translate it back to the existing log and `null` behavior without changing which legacy credentials are accepted (`apps/api/src/shared/fcm.ts:48`).

#### Minor (Nice to Have)

- `.superpowers/sdd/implementation-plan/task-2-report.md:19`: Reported GREEN runs emitted Wrangler proxy/missing sourcemap notices and React overlapping `act` warnings. The warnings are in existing runner/picker paths; clean up the test setup separately. No suite rerun was needed for this review.

### Declined to judge

- Strict API failure/client reason UI and deployment staging: scheduled for Task 3, including the operator-facing client error and global health/auth gate.
- Native runtime configuration, package selection and removal of baked configuration: scheduled for Task 4; the present review traced the preserved baked registration path.
- Whether structurally valid live credentials actually sign and send against Google: legacy structural shape was required; a device/production rehearsal is a separate gate.

### Assessment

**Task quality:** Needs fixes.

**Reasoning:** The wire behavior, operator diagnostics and legacy FCM compatibility meet the additive rollout requirements. Align the new exported service-account parser with the required Result convention while retaining its legacy caller behavior.
