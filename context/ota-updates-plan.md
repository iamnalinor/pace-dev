# Over-the-air updates for the Android app (to do; owner asked for it 2026-11-02)

A brief for a new session. Read `CLAUDE.md`, `docs/architecture.md`, `docs/self-hosting.md` and
`.github/workflows/release.yml` first, then follow the usual working method (brainstorm → plan →
tasks → review → QA).

## Why

Today every app change ships as a new APK on GitHub Releases. `app.config.ts` says
`updates: { enabled: false }`. A fix to a screen means building, publishing and installing an APK by
hand. The web build already updates itself on reload (versions screen, "A new version is ready ·
Refresh").

The owner wants JS/asset fixes to reach phones without a new APK.

## Constraints that shape it

- **Self-hosting and one APK.** OTA updates belong to whoever **publishes the app**, not to the
  server a person signs in to.
  - The official APK takes updates from the Pace publisher's update source, whatever server it talks
    to.
  - An owner's own build (own package, see `context/firebase-from-server-plan.md`) points at its own
    source through a build variable, with today's value as the default.
  - The server never pushes code to the app.
- **Runtime version.** An update may only reach APKs whose native side it fits: Expo modules, the
  Kotlin `pace-native` module, permissions. Use a `runtimeVersion` policy that changes whenever the
  native side changes (`fingerprint`, or an explicit version bumped by CI when native files change),
  so a JS bundle never lands on a native layer it doesn't match. A native change still ships as an
  APK.
- **Protocol compatibility** (the versions screen, `compatibility` in core). An OTA bundle carries a
  client protocol like an APK does. A server too old for it must still be caught by the versions
  screen. Never ship an OTA update that needs a newer server than the ones in use; the same
  expand/contract rules apply (bug-lessons class 50).
- **No silent breakage** (owner's rule). A downloaded update that crashes on start must roll back to
  the embedded bundle (expo-updates does this when the launch fails). That must be checked on a
  device, and a rolled-back update must be reported (crash catcher / debug info), never left looping.
- **Security.** Updates are **code-signed** (expo-updates code signing: the private key in GitHub
  secrets, the certificate embedded in the APK). An unsigned or wrongly signed update is refused.
  Never paste keys into chat.

## Design to start from

1. **Where updates come from.** Pick one and justify it:
   - **(a) EAS Update** (Expo's hosted service). Least work, but a third-party account and service in
     the release path.
   - **(b) Self-hosted, following the open Expo Updates protocol.**
     - A small route on the Pace Worker, or a separate static Worker, serves the manifest.
     - The bundles and assets live in R2 (free tier is plenty).
     - CI (`release.yml`, or a new `ota.yml` dispatched with a channel) runs `expo export`, uploads
       to R2, writes the signed manifest and keeps the last N updates for rollback.
     - No new outside service, and it fits a self-hoster's own build too.

   Lean towards (b) if the protocol work is small; measure it in the plan.
2. **Channels.** `production` (the released APK) and `preview` (a dev build or the owner's phone).
   CI publishes to `preview` first; promoting to `production` is a deliberate dispatch. Rolling back
   = republishing the previous update id.
3. **When the app applies an update.** Check on launch and on return to the foreground, at most once
   an hour. Download in the background and apply on the next cold start. Offer a small, quiet
   "Update ready · Restart" in Settings / the versions area, never a modal. Respect metered data:
   no big download on cellular without Wi-Fi, if expo-updates can tell.
4. **What the person sees.** Settings → About shows the APK version, the runtime version and the
   OTA update id and date. A failed or rolled-back update says so there.
5. **Release flow.**
   - A native change (Kotlin, an Expo module bump, permissions, `app.config.ts` native fields) →
     APK release, as today. The runtime version changes, so old OTA updates no longer apply.
   - A JS-only change → OTA to `preview`, then to `production`.
   - CI decides which by the fingerprint and refuses an OTA publish whose fingerprint doesn't match
     the latest APK's.
6. **Docs.** `docs/self-hosting.md`: own builds and their update source (variable, R2 bucket, signing
   key). The release checklist in `context/`: the OTA path and the device checks.

## Tests that must exist

- **Unit:** the runtime-version / fingerprint guard (a native-file change bumps it; a JS change does
  not). The manifest builder and signing, if self-hosted: a wrong signature is refused, as is a
  manifest for another runtime.
- **workerd** (`bun test:api`), if the manifest route lives in the Worker: the right update for a
  runtime and channel, none for an unknown runtime, headers per the protocol, R2 read failure →
  a loud error, not an empty manifest.
- **App** (jest, fake `expo-updates`): the check runs at most hourly; "Update ready" appears after a
  download; About shows the ids; a reported rollback shows up.
- **Device checklist:**
  - JS-only change: publish to preview → the phone shows "Update ready" → restart → new code.
  - Bad update (throws on start): rolls back to the embedded bundle and reports it.
  - Native change: an OTA for the old runtime does not apply to the new APK.
  - Airplane mode: no errors; the update comes later.
  - Server too old for the update's protocol: the versions screen.

## Out of scope

- iOS.
- Updating the server.
- Pushing updates from a self-hosted server to the official APK.
