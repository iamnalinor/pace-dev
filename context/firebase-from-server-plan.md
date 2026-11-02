# Firebase config from the server, not the APK (to do; owner asked for it 2026-11-02)

A brief for a new session. Read `CLAUDE.md`, `docs/architecture.md` and `docs/self-hosting.md`
first, then follow the usual working method (brainstorm → plan → tasks → review → QA). The owner
has already decided the shape described here; the details are yours.

## Why

Today the release APK carries the Pace project's `google-services.json`. `release.yml` writes it
from the `GOOGLE_SERVICES_JSON` secret, and `app.config.ts` passes it in as `googleServicesFile`
and as `extra.firebaseProject`.

FCM delivers only to tokens of the project the sender uses. If the server sends with another
project, FCM answers `SENDER_ID_MISMATCH` (see `apps/api/src/shared/fcm.ts`, `mismatch`). So a phone
signed in to a self-hosted server with its own Firebase project gets no instant push. It falls back
to polling, and `docs/self-hosting.md` tells the server's owner to build their own APK.

The owner's decision:
- The APK carries no Firebase keys at all.
- The app reads them only from the server it talks to (`GET /api/instance`).
- When the person changes the server on the sign-in screen, the app restarts at once. That way the
  right project is already in place when they sign in, and no restart is needed after.

The client config is not a secret. The same four values sit in every APK that has them today. The
secret part is the service-account key, which stays on the server (`FIREBASE_SERVICE_ACCOUNT`).

## Design to start from

### Server

1. **New optional variable `FIREBASE_ANDROID_CONFIG`.**
   - It takes the raw `google-services.json` downloaded from the Firebase console, so the owner
     only pastes a file.
   - **No package is hard-coded on the server** (owner, 2026-11-02: an instance's owner may build
     and distribute their own APK under their own package name and server). The file may hold
     several Android apps (e.g. the official `dev.nalinor.pace` and the owner's own build); the
     Worker takes **every** `client` entry: per `android_client_info.package_name`, its `appId`
     (`mobilesdk_app_id`) and `apiKey` (`api_key[0].current_key`), plus the shared `projectId`
     (`project_info.project_id`) and `senderId` (`project_info.project_number`).
   - Parsing is pure and lives in `packages/core`. It returns a `Result` with string-literal error
     codes: not JSON, no Android client at all, a client missing a field.
   - Read it from `c.env`, never at module scope.
2. **A broken config fails loudly, never quietly** (owner, 2026-11-02: «лучше громко падать чем
   тихо ломать»). Push is off only when **both** variables are unset: that is a deliberate choice.
   Every other case is a misconfiguration:
   - only one of the two variables is set;
   - either one does not parse;
   - no Android client at all in the file;
   - the two name different projects (`FIREBASE_SERVICE_ACCOUNT.project_id` ≠ the client config's
     `projectId`).

   A misconfiguration stops the server from pretending all is well:
   - **At deploy.** `scripts/check-config.ts` (run by `deploy.yml` before `wrangler deploy`, and
     documented for self-hosters as `bun run check:config`) fails the deploy and names the problem.
     It never prints a secret's value.
   - **At run time.** The same pure check runs on the request path, cached per isolate. While it
     fails, every `/api/*` answer is `500 server/misconfigured` with the reason code (no values),
     and `/api/health` says the same. The app shows it as a server error with the reason, so the
     owner sees it at once instead of phones quietly polling.
   - **Sweep, same change.** The existing "Push is off: FIREBASE_SERVICE_ACCOUNT is not set or not
     readable" in `apps/api/src/shared/fcm.ts` is such a quiet fallback. An unreadable account
     becomes a misconfiguration; an unset one together with an unset client config stays "push
     off". Look for other env variables that degrade quietly (LLM slots, Telegram, origins) and
     either make them loud the same way or write down why a quiet fallback is right there. Add a
     bug-lessons row for the class ("a misconfiguration answered with a quiet fallback").
3. **`GET /api/instance` grows `firebase`.**
   - Value: `{ projectId, senderId, apps: [{ packageName, appId, apiKey }, …] }`, or `null` when
     push is off.
   - **The app picks its own entry by its real package name** (read at run time from the native
     side, `context.packageName`, not from a constant). No entry for this package is not a server
     misconfiguration (the server may serve other builds), and it does not break anything on the
     phone either (owner, 2026-11-02): push quietly works the way it can, through polling, and
     Settings' push status says which method is in use and why ("Pace checks: this server has no
     Firebase app for this build"). An informational line, not an error state.
   - In `InstanceSchema` (`packages/core/src/api/schemas/instance.ts`) read it with
     `knownOrNull(...)`. The field is additive, so older clients ignore it and no protocol bump is
     needed. Confirm that against `minClientProtocol` and the versions screen.
   - Contract first: change the schema in `endpoints.ts`'s endpoint, then the Worker, then the client.
4. **Pace's own deploy.**
   - `deploy.yml` sets `FIREBASE_ANDROID_CONFIG` from the existing `GOOGLE_SERVICES_JSON` secret.
   - `release.yml` stops writing `google-services.json`, and `app.config.ts` loses
     `googleServicesFile` and `extra.firebaseProject`.
   - Watch bug-lessons class 46 (`toJSON(secrets)`) and class 50: ship the server side first, and
     drop the APK's file in the release that no longer reads it.

### App (Android)

5. **Native side (`apps/app/modules/pace-native`, Kotlin).**
   - `setFirebaseConfig(json | null)` stores the four values in `SharedPreferences`. Native code
     must read them before JS runs.
   - In `PaceNativePackage`'s `ApplicationLifecycleListener.onCreate` (where `CrashCatcher` already
     installs), stored values call `FirebaseApp.initializeApp(context, FirebaseOptions.Builder()
     .setProjectId(...).setApplicationId(...).setApiKey(...).setGcmSenderId(...).build())` for
     the default app.
     - With no `google-services.json`, `FirebaseInitProvider` initializes nothing, so this is the
       only initialization.
     - The server has already checked the values, so a failure here is a real bug, and it is shown,
       not swallowed. Catch it only so the app still starts, record it, and show it in Settings'
       push status ("Firebase could not start: <reason>") and in the debug info. Never let it read
       as plain "polling".
   - `ensureFirebase(json)`: when no default app exists yet in this process, initialize it on
     demand. A fresh install learns the config from `/api/instance` without needing a restart.
     When a default app with **another** project exists, answer "restart needed".
   - `restartApp()`: a real process restart (launch intent with `FLAG_ACTIVITY_NEW_TASK |
     FLAG_ACTIVITY_CLEAR_TASK`, then end the process, the ProcessPhoenix pattern).
     `expo.reloadAppAsync()` is not enough: it reloads JS, and Firebase stays initialized with the
     old project.
   - Check on a device that `expo-notifications` touches `FirebaseMessaging` only when asked for a
     token (`getDevicePushTokenAsync`), and not at its own start before our `onCreate` has run.
     Otherwise initialize earlier (a `ContentProvider` with a high `initOrder`).
6. **Changing the server on the sign-in screen** (`features/server/change-server-sheet.tsx`,
   `platform/server-store.ts`).
   - When the person confirms another server, persist the new origin and that server's entry for
     this app's package (or `null`, with the reason) through `setFirebaseConfig`, then call `restartApp()` straight away on Android.
     This is the owner's choice: always restart, even when the project happens to match. The
     restart is predictable, and the sign-in screen holds nothing to lose.
   - After the restart the app opens on the sign-in screen of the new server, with Firebase already
     initialized for it.
   - Back to the build's server works the same way.
   - On the web there is nothing to restart: no Firebase. Keep today's behaviour there.
7. **Every start.** `/api/instance` is read as today.
   - If its `firebase` differs from what is stored (the server's owner rotated or added a project),
     store the new value. If this process already has the old project, push waits for the next
     cold start, and the phone polls meanwhile (the server refuses the mismatched token as today).
     Optionally restart quietly the next time the app goes to the background. Pick one and justify
     it.
   - If no Firebase is stored and the server offers one, `ensureFirebase` and register, with no
     restart.
8. **Registering a token.** `registerPush` (`platform/notifications.ts`) sends the `projectId` of
   the **initialized** config. Today that is `appFirebaseProject()` from the build; remove that
   helper and `firebase-project.ts`. The server's mismatch check stays as a safety net.
   - The Settings copy about "another Firebase project" (the push picker) changes: the cause is now
     "this server has no Firebase" or "the app has not restarted since the server changed it", not
     "build your own APK".
9. **Upgrade path.**
   - An old APK (baked config) on the Pace server keeps working: same project.
   - The first start of the new APK finds nothing stored, reads `/api/instance`, initializes on
     demand, and registers. The FCM token of the same project and app normally stays the same.
     Verify on a device that push keeps working across the update, with no second sign-in.

### Docs

10. **`docs/self-hosting.md`.**
    - Push needs two things from the same Firebase project: the service-account JSON
      (`FIREBASE_SERVICE_ACCOUNT`) and `google-services.json` (`FIREBASE_ANDROID_CONFIG`), with an
      Android app registered for each package that should get push from this server: the official
      APK's `dev.nalinor.pace` (so the released app works with no build of their own) and/or the
      owner's own package if they build and distribute their own APK.
    - **Own builds:** the package name must not be hard-coded in the app either. `app.config.ts`
      takes it (and the deep-link host and app name, where they name Pace's own domain) from build
      variables with today's values as defaults, and the docs say which variables to set for an own
      build. Sweep the app and the server for other places that assume `dev.nalinor.pace` or
      `pace.nalinor.dev` (deep links, intent filters, OAuth/Telegram redirects, the share target,
      notification channels) and either make them configurable or write down why not.
    - FCM does not need the signing certificate. If the API key is restricted to Android apps, the
      restriction must allow the Pace release certificate's SHA-1 (give it), or the key must be left
      unrestricted.
    - No own APK needed any more.
    - Also update the README's push section and `docs/architecture.md`.

## Tests that must exist

- **core:** parsing `google-services.json`: the real file shape, several Android clients (all kept,
  each with its own appId and key), no Android client, missing fields, not JSON. Every error code.
  No test or code names `dev.nalinor.pace` as the only allowed package.
- **workerd** (`bun test:api`), `/api/instance` in these cases:
  - with both variables of one project, `firebase` filled and `features.push` true;
  - with projects that differ, with only one variable, or with an unparsable one: every `/api/*`
    answer is `500 server/misconfigured` with the right reason code, and so is `/api/health`;
  - with neither variable: push off, as today;
  - `scripts/check-config.ts` fails for each misconfiguration and passes for both-set and
    neither-set; no secret value appears in its output.
- **client/app (jest, fake native module):**
  - Changing the server persists that server's config and asks for a restart once. Back to the build
    server does the same.
  - A server without Firebase stores `null`.
  - A server whose config has no entry for this app's package stores `null` with that reason: push
    goes through polling, Settings' status names the method and the reason, and an entry for
    another package is never used.
  - A fresh start with nothing stored initializes on demand and registers with the server's project.
  - A stored project that differs from the server's new one stores the new value and does not
    restart in the foreground.
  - `registerPush` sends the initialized project.
- **Kotlin:** builds in CI (`assembleRelease` in `release.yml` / the APK job). Behaviour is checked
  on a device (below) or by the Android e2e on an emulator once `context/android-e2e-plan.md` exists.
- **Device checklist** (add to the release checklist in `context/`):
  - Fresh install against the Pace server: push arrives.
  - Change to a self-hosted server with its own project: the app restarts, sign in, push arrives.
  - Back to Pace: restart, push arrives.
  - A server without Firebase: polling, and Settings says why.
  - Update from the previous APK: push keeps working without signing in again.

## Out of scope

- iOS (not a target).
- Web push.
- Choosing among several Firebase projects on one server.
