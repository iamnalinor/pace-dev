# Android end-to-end on an emulator in CI (to do; owner asked for it 2026-11-01)

A brief for a new session. Read `CLAUDE.md` and `docs/testing.md` first.

## Why

Exploratory QA (`docs/qa.md`) and the Playwright e2e run only on the web build, so the
Android-only parts of phase C have no automatic check: the periodic background check
(expo-background-task / WorkManager), the battery-optimization step and the vendor autostart
page (Kotlin in `apps/app/modules/pace-native`), the phone usage upload that automatic sleep
reads, push notifications and opening a task from one, and Change server on the login screen.
Until now the owner checked these by hand on a device after each release.

## Constraints found

- The Claude Code cloud container has no `/dev/kvm` and no CPU virtualization flags, so an
  emulator there runs in pure software emulation: unusable. Run it on GitHub Actions instead —
  standard Linux runners have KVM (e.g. `reactivecircus/android-emulator-runner`).
- The release APK is arm64 only (`.github/workflows/ci.yml`, job "Android release APK").
  The emulator needs an x86_64 build: a separate test build/ABI, the release build unchanged.
- CI minutes are rationed (private repo; see the comment at the top of `ci.yml`). The emulator
  job runs on `workflow_dispatch` and before a release (`release.yml`), not on every PR.
- What an emulator cannot show: vendor ROMs without Google services and their battery
  savers, real Doze over a night, a week of real usage. Those stay on the owner's device.

## What to build

1. A workflow job: build an x86_64 test APK, boot an emulator (API 34+, Google APIs image so
   FCM can be exercised, and optionally a second image without Google APIs for the `poll`
   path), start the local API (`wrangler dev`, as the e2e stack does) reachable from the
   emulator (`10.0.2.2`), install the APK, run the flows, upload screenshots/recordings and
   logcat as artifacts on failure.
2. Flows in **Maestro** (YAML; add it as a dev tool, Bun only for anything in the repo):
   - dev login → Now shows; the versions screen when `/api/instance` answers 404 (point the app
     at a stub server via Change server);
   - Change server on the login screen: a reachable compatible server, then an unreachable one
     (no block), then back;
   - Settings → Devices and sessions: this device listed, Add a computer sheet, revoke a second
     session;
   - notifications method picker: switch to "Background check"; the battery step appears in
     Permissions and opens the system exemption dialog; it disappears with "Google";
   - background check: force the WorkManager job (`adb shell cmd jobscheduler run -f <pkg> <id>`
     or WorkManager's test hooks) with a pending notification on the server → a system
     notification appears; tapping it opens the task;
   - usage upload for automatic sleep: grant usage access (`adb shell appops set <pkg>
     GET_USAGE_STATS allow`), force the background run, check `phone_uses` / `knownUntil` on the
     server through a test endpoint or the API test helpers.
3. Docs: `docs/testing.md` gets an "Android e2e" section (how to run it, what it covers, what
   still needs a device); `CLAUDE.md`'s testing line names the new level.

Follow the usual working method (plan → tasks → review → QA). Every flow must fail first
against a deliberately broken build (e.g. the background task not registered) to prove it
tests something.
