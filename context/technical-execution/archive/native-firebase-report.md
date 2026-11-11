> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Native runtime Firebase slice1

## Implemented boundary

The default APK remains in baked mode. Explicit `EXPO_PUBLIC_FIREBASE_MODE=runtime` omits
`googleServicesFile` and `extra.firebaseProject`, adds runtime application metadata and removes
`FirebaseInitProvider` through an Android manifest merger directive. An unknown mode fails with
a fixed build error. No release workflow was changed, and runtime candidates are not approved
for production release by this slice.

The native bridge is synchronous. It exposes `packageName`, `firebaseStatus`,
`stageFirebaseConfig(origin,json)`, `commitFirebaseConfig(origin)`,
`reconcileFirebaseOrigin(origin)`, `ensureFirebase(origin,json)` and boolean `restartApp`.
Config JSON is either null or four nonblank strings: projectId, senderId, appId, apiKey.
Status is `{status,projectId,reason}`; status is ready, disabled, restart-needed, error or
unsupported. Reasons are fixed invalid-config, storage-failed or initialization-failed.
The reported project is the actual initialized default Firebase app, including while a different
configuration is pending. Client keys and exception messages are never added to status/debug text.
The web/Expo Go fallback returns unsupported, no package identity and false for restart.

`FirebaseController` is Android-free and owns the state machine. A single version1
SharedPreferences value stores nullable committed and staged `{origin,config}` selections.
Writes use synchronous commit before reporting success. On a failed disk commit the adapter
restores the previous preference value because Android changes its memory view even when disk
commit fails; failure remains visible rather than being converted to success.

Stage writes pending only and revokes in-process ensure authority after the write succeeds. A failed
stage retains the current origin's authority. After JavaScript persists the selected server origin, commit promotes
only a matching staged selection. At startup, JavaScript must read the actual persisted server
origin and reconcile: a matching stage is promoted, otherwise stage is discarded and committed
is retained only for that origin. Lifecycle initialization reads committed only. This recovers a
crash before the origin write, after origin but before promotion, and after promotion but before
restart. Pending configuration is never trusted during lifecycle initialization.

Ensure requires an origin reconciled in this process, preventing a stale response from another
server from replacing the selected config. It persists authoritative config before initialization.
All four options participate in comparison. An existing live default app is never deleted or
recreated; differences, including deliberate disable, report restart-needed. Fresh installs can
initialize on demand without restarting. Baked builds reject runtime mutation as unsupported;
status may still identify their live baked default app.

Cold restart uses a private activity in the separate `:pace_restart` process. The bridge verifies
a launch component first; the helper verifies it again before killing the old PID, launching a
fresh task and terminating its own process. Missing or rejected launch setup returns false without
killing the old process. This is a process restart, not a JavaScript reload.

## Verification evidence

- Superpowers writing-plans, executing-plans, test-driven-development and verification-before-completion
  were read. Plan: `native-firebase-implementation-plan.md`.
- Observed RED: four intended Jest failures for missing bridge fallback/build mode behavior.
- Observed RED: manifest transformer lacked the tools namespace/removal directive.
- Latest targeted Jest command:
  `PATH=/tmp/pace-tools/node-v24.22.2-linux-x64/bin:$PATH bun test:app --runInBand --runTestsByPath app.config.test.ts modules/pace-native/src/pace-native.test.ts modules/pace-native/runtime-firebase-plugin.test.ts`
  passed 3 suites /15 tests with normal exit.
- Root provisioned vendor-verified temporary JDK21.0.13 and Kotlin2.4.21 without an Android SDK.
  The original17 controller tests compiled and passed. Independent review then found an origin
  handoff race: after stage(B), a delayed ensure(A) could clear B while A retained authority.
  Test18 reproduced it on the real JVM:18 run,1 failure (expected invalid-config, got no error).
  Invalidating authority only after successful stage persistence gives GREEN:18/18, normal exit.
  The test also proves a failed stage preserves usable A and that commit(B) still succeeds.
- Pure JVM reproduction commands (temporary toolchain paths):
  `JAVA_HOME=/tmp/pace-tools/jvm/jdk/jdk-21.0.13+9 /tmp/pace-tools/jvm/kotlinc/bin/kotlinc apps/app/modules/pace-native/android/src/main/java/expo/modules/pacenative/FirebaseController.kt apps/app/modules/pace-native/android/src/test/java/expo/modules/pacenative/FirebaseControllerTest.kt -cp /tmp/pace-tools/jvm/junit.jar:/tmp/pace-tools/jvm/hamcrest.jar -include-runtime -d /tmp/pace-tools/jvm/firebase-tests.jar`
  followed by
  `/tmp/pace-tools/jvm/jdk/jdk-21.0.13+9/bin/java -cp /tmp/pace-tools/jvm/firebase-tests.jar:/tmp/pace-tools/jvm/junit.jar:/tmp/pace-tools/jvm/hamcrest.jar org.junit.runner.JUnitCore expo.modules.pacenative.FirebaseControllerTest`.
  This compiles/exercises the Android-free controller only; Android adapters and device behavior
  remain outside this evidence.
- Installed expo-notifications57.0.24 pins firebase-messaging25.0.1; the module adds the same direct
  dependency. Source inspection found token module initialization only registers a listener;
  FirebaseMessaging acquisition occurs on explicit token/unregister operations. Topic subscription
  also acquires Firebase only on explicit calls. This is source evidence, not device ordering proof.
- Worker did not run unified lint or make git mutations; root owns lint, review and checkpointing.

## Dependent integration and release gates

This slice does not change platform server persistence, notification registration, screens or
release automation. A dependent platform slice must run reconciliation after `readServer()`,
stage before the SecureStore origin write, commit after successful origin persistence, and restart
only after durable success. It must stop token registration for every status except ready and
send the native actual projectId. Web retains its existing behavior. Baked builds retain their
existing registration path until rollout approval.

Actual Android compilation/manifest merge, lifecycle ordering, cold restart, first install,
project/option rotation, disabled/no-matching-package behavior, real token registration/delivery
and baked-to-runtime upgrade preserving session remain pending. No emulator or exploratory QA
was launched. Root must retain the opt-in candidate gate and record device proof before changing
the release default or removing baked release secrets.
