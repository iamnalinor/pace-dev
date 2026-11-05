# Task 1 report: Android CI harness and deterministic smoke

Status: implemented; **emulator evidence remains open**. Commit: bcf8d80bdbaf626e5241c1528b90aed1f001923c, based on a67cc50.

- The Android E2E workflow is manual and reusable. It pins Maestro 2.11.0 by release SHA-256, Android Emulator 36.5.11 build 15261927, and the emulator action's v2.38.0 commit. It uses an API 34 Google APIs x86_64 AVD and the repository's Expo/Gradle release configuration.
- The smoke APK has its own application ID and deep-link scheme, uses the debug key, drops production link verification and Firebase, and explicitly opts in to dev login. The existing flag alone cannot open release-like native dev login on a non-emulator URL. Its Network Security Config denies cleartext except to the emulator host alias. The production workflow and arm64 target were untouched.
- The runner checks both explicit build flags and the APK's packaged Expo config before installing on a booted x86_64 emulator. It applies real local D1 migrations to new state, starts Wrangler with an isolated test env, polls the health JSON, runs the one whitelisted account through the real app, and preserves the command status and diagnostics. The flow clears app data, signs in, skips the permissions walkthrough, and waits for the empty Now screen.

## Red and green

- RED: the config test expected `dev.nalinor.pace.e2e` and received `dev.nalinor.pace`; the old native screen showed the Telegram ID input even when the new release guard was disabled. The release config guard had no implementation.
- RED: runner tests failed before the runner existed. A later test supplied a correctly named APK with a production API origin in its embedded config; before the APK guard, the runner reached the Maestro stub and returned its 42 instead of refusing to install.
- GREEN: `bun test scripts/android/smoke.test.ts` — 5 passed. Tests exercise required flags, bounded readiness and a bad health body, failed Maestro exit and log files, the packaged origin guard, and rejecting a non-emulator.
- GREEN: `bun run --cwd apps/app test --runInBand --runTestsByPath app.config.test.ts src/platform/api-base.test.ts src/screens/login-screen.test.tsx` — 3 suites, 25 tests passed.
- `NODE_OPTIONS=--max-old-space-size=4096 bun lint` — exit 0. The 110 existing app design warnings match the repository's exact ratchets; no errors or new warnings. Dependency boundaries, workflow check, and migration check passed. The pre-commit hook reran the full lint and passed in 174.19 seconds.
- `bash -n scripts/android/smoke.sh`, PyYAML parsing of both YAML files and workflow/flow structure assertions, and `git diff --check` passed. The pinned emulator action inputs were checked against its exact action.yml; the Maestro options were checked against its pinned TestCommand source.
- Host-only check with the runner's bindings and Wrangler arguments: 9 D1 migrations applied, `GET /api/health` returned HTTP 200 and `{"status":"ok"}`, `POST /api/auth/dev` returned a session for test ID 844001 and HTTP 403 for 844002. The first default-inspector attempt hit the sandbox's `uv_interface_addresses` error. `--inspector-port 0` requests an OS-assigned debug port and avoids the unnecessary interface scan. No network shim was used in the successful check.
- Expo prebuild finished and generated the separate application ID, `pace-e2e` scheme and manifest reference to the network policy. The generated XML contained `base-config cleartextTrafficPermitted="false"` and a single exception for `10.0.2.2` without subdomains. The real Expo Constants config emitter separately emitted `dev.nalinor.pace.e2e`, emulator URL and `isDevLogin: true` for smoke, and `dev.nalinor.pace`, production URL and `isDevLogin: false` for ordinary configuration. These are source/native-generation checks, not APK inspection.

## Open evidence

- SDK build components and adb were installed under `/root/pace-android-sdk`; `adb devices -l` listed no devices. No `/dev/kvm`, CPU virtualization flags, or installed emulator binary.
- The documented build command completed Expo prebuild, then the Gradle wrapper could not download Gradle 9.3.1 (`java.net.SocketException: Network is unreachable`). A separate attempt with the local Gradle 9.3.1 distribution reached settings/plugin resolution, then could not resolve `org.gradle.toolchains.foojay-resolver-convention:1.0.0` from the configured repositories. No APK produced; no adb installation, on-device login, deliberately broken on-device negative control, or GitHub workflow execution took place.
- Optional full `bun test:app --runInBand` was interrupted (exit 130) after 12 suites passed, with no failed suite reported; the three changed app suites passed again in the focused run.
- Release gating stays unchanged pending the actual CI smoke and negative control. No full exploratory QA was performed.

## Review fix round 1

- Reproduced the review finding by giving the shell fixture a `PATH` with Bun, basic shell utilities, and its own Android/Worker stubs. `bun test scripts/android/smoke.test.ts` failed four tests before the fix. The runner reported `Android smoke requires jq on PATH`, and the expected Maestro exit 42 became exit 1.
- Both JSON checks now use the actual Bun runtime. The fixture keeps the restricted `PATH`, and the Android setup instructions list the remaining external tools. The jq sweep found other uses only in hosted deploy, release, and LLM workflows, outside the unit suite. See class 123 in `context/bug-lessons.md`.
- GREEN on the restricted `PATH`: `bun test scripts/android/smoke.test.ts` — 5 passed, 0 failed. `bash -n scripts/android/smoke.sh` and `git diff --cached --check` passed. The required pre-commit `bun lint` passed in 172.54 seconds. Commit `4e6caf97bad951ee1967d61c18ff0ce82662ec06` matches the reviewer-approved tree `18a872913a8bd4ad272b4afb10bffdf5fb9158aa`.
