# Native Firebase implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Supply an opt-in Android runtime Firebase bridge while preserving baked release builds until device evidence exists.

**Architecture:** An Android-free controller owns origin reconciliation and immutable configuration records. Android adapters own Firebase, one synchronously committed SharedPreferences record, metadata and process restart. JavaScript supplies the authoritative origin read from SecureStore before on-demand initialization.

**Tech Stack:** Expo native module, Kotlin, Firebase Messaging25.0.1, JUnit4.13.2, Jest.

**Spec:** `context/firebase-from-server-plan.md`, refined by this checkpoint's crash-safe origin protocol.

## Global constraints

- Default `EXPO_PUBLIC_FIREBASE_MODE=baked`; only explicit `runtime` removes baked config and FirebaseInitProvider. Unknown supplied mode fails the build.
- No Android emulator, exploratory QA, production deployment or release workflow change.
- No deletion/recreation of an initialized default Firebase app. Compare projectId, senderId, appId and apiKey exactly.
- Never include configuration values in errors or diagnostics. Status projectId comes from the actual default app.
- One versioned record stores committed and staged `{origin,config}` values. Successful writes use synchronous commit.
- Lifecycle initializes committed only; staged becomes authoritative only after JS reads persisted origin and calls reconcile, or explicitly commits after the origin write.

## Task1: Bridge fallback and candidate gate

Files: `apps/app/app.config.ts`, `apps/app/app.config.test.ts`, `apps/app/modules/pace-native/src/pace-native.ts`, `index.ts`, `runtime-firebase-plugin.ts` and its test.

- [x] Add failing Jest cases: missing module returns `{status:"unsupported",projectId:null,reason:null}` for all Firebase operations, packageName null, restart false; runtime build omits googleServicesFile and firebaseProject; default baked retains them; invalid mode throws a fixed message.
- [x] Run `bun test:app --runInBand --runTestsByPath app.config.test.ts modules/pace-native/src/pace-native.test.ts`; observe four intended failures.
- [x] Implement sync bridge `stageFirebaseConfig(origin,json)`, `commitFirebaseConfig(origin)`, `reconcileFirebaseOrigin(origin)`, `ensureFirebase(origin,json)`, `firebaseStatus()`, `packageName()`, `restartApp()`.
- [x] Test actual manifest mutation: remove provider through merger directive and add runtime metadata; preserve unrelated entries and idempotence.
- [x] Run targeted Jest again and report actual output.

## Task2: Crash-safe native controller

Files: `android/src/main/java/expo/modules/pacenative/FirebaseController.kt`, `android/src/test/java/expo/modules/pacenative/FirebaseControllerTest.kt`.

Interfaces: storage `read():FirebaseRecord?`, `write(record):Boolean`; runtime `current():FirebaseConfig?`, `initialize(config):Unit`. `FirebaseStatus` carries status, actual projectId and fixed nullable reason.

- [x] Write behavior tests for fresh initialization, all-four-option mismatch, no live app replacement, stage-before-origin crash, origin-before-promote crash, promoted-before-restart, disabled selection, failed writes, stale-origin ensure and baked rejection.
- [x] Compile and run pure JVM controller tests with the verified temporary JDK/Kotlin toolchain: original17 passed; review regression18 observed RED then GREEN18/18. Android adapters/device behavior remain unverified.
- [x] Implement one record with `version=1`, nullable committed selection and nullable staged selection. Stage changes only pending. Commit promotes matching stage after JS origin write. Reconcile promotes matching pending, otherwise drops pending and retains only committed matching authoritative origin.
- [x] Require successful reconcile before ensure and reject stale origin. Ensure persists authoritative server config before touching Firebase; initialize only an absent default app.

## Task3: Android adapters and evidence

Files: `FirebaseRuntime.kt`, `FirebaseStorage.kt`, `PaceNativeModule.kt`, `PaceNativePackage.kt`, `DebugInfo.kt`, `android/build.gradle`.

- [x] Add matching Firebase dependency and JUnit test dependency.
- [x] Validate four nonblank string values and record shape/version; catch storage and initialization failures into fixed reason codes.
- [x] Activate lifecycle only with runtime application metadata. Baked mutators return unsupported.
- [x] Implement restart using a verified launch component and fresh task; schedule it before killing the old process. Missing/failed launch returns false without process death.
- [x] Record source inspection: Expo token module acquires Firebase only on explicit token/unregister calls; topics only on explicit subscription calls. This is not device evidence.
- [ ] Root runs unified `bun lint`, reviews and checkpoints; worker does not run git/lint.

## Release gates

Pending actual Android compile, manifest merge, cold restart, real push delivery, baked-to-runtime upgrade preserving session/token, and Expo lifecycle ordering on device. Candidate mode is opt-in until these pass. Platform integration and Settings explanations are a dependent slice, not part of this native bridge checkpoint.
