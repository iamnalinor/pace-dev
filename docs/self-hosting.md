# Run your own Pace server

Pace's API is one Cloudflare Worker. You can deploy it on your own account and point the released
Android app at it: **Change server** on the login screen. Your data then lives only on your server;
servers are independent and never talk to each other (self-hosting, not federation).

The app and the server each carry an API protocol number (`PROTOCOL` in `packages/core`). When they
do not fit, the app says "Server and app versions don't match" and what to update: on the login
screen it refuses to sign in (Change server stays there), and a signed-in app shows only **Log out**.
A server that does not answer `GET /api/instance` at all is older than the app supports. Keep the
server at the latest release.

## What you need

- A **Cloudflare account**. The free plan is enough: Workers, D1, KV and Durable Objects (SQLite).
- A **Telegram bot** from [@BotFather](https://t.me/BotFather): it signs you in and sends
  notifications. For the web app's Telegram button the bot's domain must be your web origin.
- Optional: an **OpenAI-compatible LLM** for the assistant (free-text input, the bot's reading of
  messages): any number of `LLM_BASE_URL_N` / `LLM_API_KEY_N` / `LLM_MODEL_N` slots. Without them
  everything else works and text goes to the Inbox.
- Optional: a **Firebase** project for Google push (see [Notifications](#notifications) for what
  that means with the released APK).
- Bun, and a fork or clone of this repository.

## Step by step

1. **Fork or clone** the repository and run `bun install`.
2. **Create the Cloudflare resources** (once), in `apps/api`:
   ```sh
   bunx wrangler login
   bunx wrangler d1 create pace
   bunx wrangler kv namespace create OAUTH_KV
   ```
   The assistant's memory of which LLM provider is down is a small Durable Object (`LlmHealth`)
   declared in `wrangler.jsonc`; the first deploy creates it, nothing to create by hand.
3. **Edit `apps/api/wrangler.jsonc`**: the D1 `database_id` and the KV `id` from step 2, the
   `routes` custom domain (your API host, or remove `routes` to use `*.workers.dev`), and the
   `vars`:
   - `ALLOWED_TELEGRAM_IDS`: your own Telegram user id (comma separated for more people). Empty
     lets any Telegram account sign in on your server, so set it.
   - `TELEGRAM_BOT_USERNAME`: your bot's username, without `@`.
   - `WEB_ORIGIN`: where your web app is served (`https://pace.example.dev`), the only origin the
     API's CORS admits.
   - `API_ORIGIN`: your API's own origin (`https://pace-api.example.dev`): the OAuth issuer and the
     MCP resource, normalised (case, a trailing slash and a default port do not matter). It must be
     https, or plain http on `localhost`/`127.x`/`[::1]`; a blank, malformed or other plain-http
     value is ignored (and logged), and the origin requests arrive at is used instead. A server
     reached only over plain http on a LAN (`http://192.168.…`) works for the app, but its OAuth and
     MCP routes answer 503: AI apps need https. AI apps must reach the MCP endpoint at exactly `<API_ORIGIN>/mcp` (their
     tokens are bound to it, and Settings → Connect an AI app shows that URL), so set it to the
     address those apps can reach. The computer agent's `--api` uses bearer tokens and works at any
     address the Worker answers on, so "Add a computer" gives the address the device uses.

   For the web app, change the custom domain in `apps/app/wrangler.web.jsonc` too.
4. **Secrets** (in `apps/api`, `bunx wrangler secret put <NAME>`):
   - `TELEGRAM_BOT_TOKEN`: the token from BotFather.
   - `TELEGRAM_WEBHOOK_SECRET`: any random string; Telegram echoes it on every webhook call.
   - Optional `LLM_BASE_URL_1`, `LLM_API_KEY_1`, `LLM_MODEL_1` (and `_2`… for fallbacks).
   - Optional `FIREBASE_SERVICE_ACCOUNT`: the Firebase service account's JSON key.
   - Optional `FIREBASE_ANDROID_CONFIG`: the raw `google-services.json` from the same Firebase
     project, with an Android app for each package you intend to support. See
     [Notifications](#notifications) for what this enables during the rollout.
5. **Deploy**, either way:
   - **GitHub Actions**: in your fork, set the secrets and variables `deploy.yml` reads
     (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TELEGRAM_BOT_TOKEN`,
     `TELEGRAM_BOT_USERNAME`, optional `TELEGRAM_WEBHOOK_SECRET`, `LLM_*_N`,
     `FIREBASE_SERVICE_ACCOUNT`; see the README's
     [GitHub Actions](../README.md#github-actions) table) and replace `pace-api.nalinor.dev` /
     `pace.nalinor.dev` in the workflow with your hosts. After a green CI on `main` (or by hand)
     it builds the web app, applies the D1 migrations, deploys both Workers with
     `PACE_VERSION` set to the release tag or commit, pushes the secrets, stores `BOT_INFO` and
     sets the webhook.
   - **By hand**, in `apps/api`:
     ```sh
     bunx wrangler d1 migrations apply pace --remote
     bunx wrangler deploy --var PACE_VERSION:"$(git describe --tags --always)"
     ```
     and for the web app, `EXPO_PUBLIC_API_URL=https://<your api> EXPO_PUBLIC_TELEGRAM_BOT=<bot>
     bun run --cwd apps/app build:web && bun run --cwd apps/app deploy:web`. `PACE_VERSION` is
     what `GET /api/instance` reports (`dev` when unset). Set it on every deploy, and make it
     change with the code: the release tag or the commit, as the workflow and the command above
     do. The server keeps its SQL projection rows while the version stays the same, so a fixed
     value (`PACE_VERSION=mine`) would keep rows that older code wrote after an upgrade. A
     server without it rewrites its SQL projections on every cold start (as often as every
     alarm).
6. **Telegram**: in BotFather, `/setdomain` → your web origin's host, so the Login Widget may run
   there (a bot has one widget domain). The deploy workflow sets the webhook; by hand, call
   `https://api.telegram.org/bot<token>/setWebhook` with
   `url=https://<your api>/telegram/webhook`, `secret_token=<TELEGRAM_WEBHOOK_SECRET>` and
   `allowed_updates=["message","callback_query"]`, then store `getMe`'s `result` with
   `bunx wrangler secret put BOT_INFO`.
7. **Check it**: `https://<your api>/api/instance` answers your server's name, version, protocol,
   bot, origins and features.
   `https://<your api>/api/deployment-readiness` is a **public**, read-only operator diagnostic
   (no sign-in, no database access, answered even when the configuration blocks other routes).
   It returns the deployed version's id (`CF_VERSION_METADATA.id`) together with the deploy
   marker `PACE_DEPLOY_ATTEMPT` (a plain Worker var; `identity` reads `unavailable` unless both
   are present, and neither the workflow nor the commands above set the marker, so pass
   `--var PACE_DEPLOY_ATTEMPT:<any id>` on deploy if you want it), the Firebase policy
   (`additive`, `strict` or `invalid`) and the Firebase verdict: `disabled`, `configured` with the
   Firebase project id, or `invalid` with a reason code. It never returns credentials or Android
   API keys. A 200 only means the diagnostic was read, not that the deploy is healthy.
8. **In the app**: on the login screen press **Change** next to "Server: …", type your API's
   address (`pace-api.example.dev`; https only, plain http only for `localhost`, `10.0.2.2` and
   private networks during development), press **Check**, then **Use this server**, and sign in.
   **Reset to default** goes back to the server the app was built for. Switching servers signs
   out and clears the phone's local copy; a token is only ever sent to the server that issued it.

The web build always talks to the server it was deployed with (CORS admits only that origin), so
Change server is on Android only; your web app is your own deployment from step 5.

## Notifications

The released APK is tied to the Pace Firebase project, and Google delivers a push only to apps of
the project that sends it. So a self-hosted server gets **no Google push** with the released APK,
even with a Firebase project of its own (Settings says why). Everything else works:

- while the app is open, notifications arrive instantly over the live connection;
- in the background, the phone checks your server about every 15 minutes (the permissions
  walk-through then asks to leave Pace out of battery optimization, or Android defers the check
  for hours; on phones that have one it also opens the maker's autostart page);
- reminders and alerts also come from your bot in Telegram.

Instant push needs your own build of the app with your Firebase project
(`GOOGLE_SERVICES_JSON`; see the README's
[Push notifications](../README.md#push-notifications-firebase)).

The server can also advertise Android initialization metadata ahead of the app rollout. To
enable it, set `FIREBASE_ANDROID_CONFIG` on the Worker alongside `FIREBASE_SERVICE_ACCOUNT` from
the same project. The current GitHub Actions workflow only sets the service account. The
public `GET /api/instance` response lists the project ID, sender ID, and the package name,
app ID and client API key for each Android app in `google-services.json`. Keep the service
account key on the server.

An existing service account alone still sends pushes as before and reports `firebase: null`.
If the Android config is set but invalid or does not match the sender, the Worker reports
`firebase: null` and logs a reason code without logging either binding. Server discovery,
health checks and existing push registration keep working as before. Released APKs still
use the Firebase project they were built with.

#### Check the Firebase pair before rollout

From the repository root, run `bun run check:config` with the two Firebase values supplied
through the process environment. `FIREBASE_ANDROID_CONFIG` takes the raw contents of
`google-services.json` (called `GOOGLE_SERVICES_JSON` in release CI);
`FIREBASE_SERVICE_ACCOUNT` takes the raw service account JSON. Never put either value in a
command argument.

By default Bun's package runner can load dotenv files and echo the command. In CI or when
you need only the verdict in the output, disable dotenv loading and silence the runner.
Pass the intended state explicitly:

```sh
bun --no-env-file --silent run check:config --expect=configured
bun --no-env-file --silent run check:config --expect=disabled
```

With no expectation, either a complete, matching pair or two absent bindings passes. Empty
strings count as absent. The command prints `configured` or `disabled` on success. It exits
with status 1 and a fixed reason code on stderr for invalid input:
`missing-android-config`, `missing-service-account`, `android-config-not-json`,
`android-config-invalid`, `no-android-clients`, `duplicate-android-package`,
`invalid-service-account`, `project-mismatch`, `invalid-config-policy`, `invalid-arguments`,
`expected-configured`, or `expected-disabled`. The preflight checks the supplied JSON and
project match; it does not authenticate to Google or verify push delivery. A local
`disabled` verdict only describes the inputs to this invocation. An existing Worker can
have a pair stored only in its own secrets.

The Worker stays additive, including for hosts with only a service account. Validate both
values with `check:config` before configuring or rotating them, and set or remove them together:
omitting local values does not remove secrets already stored on the Worker. To see the state a
deployed Worker actually runs with, read `GET /api/deployment-readiness` (see
[Step by step](#step-by-step), step 7).

## Android OTA build configuration

OTA remains disabled in default builds. The account server cannot choose the code publisher.
An explicitly configured native build requires all three build inputs:

- `PACE_OTA_URL`: canonical HTTPS publisher URL ending in `/manifest`, without credentials,
  query parameters or a fragment.
- `PACE_OTA_CHANNEL`: a lowercase channel such as `preview` or `production`.
- `PACE_OTA_CERTIFICATE`: exactly `./ota/publisher-certificate.pem`, relative to `apps/app`.
  Supply a valid public RSA certificate (at least 2048 bits), never the private signing key.

`PACE_OTA_KEY_ID` optionally selects the signature key identifier (default `root`). Partial
or invalid configuration fails the build. The certificate contents are added to Expo's
default fingerprint sources; changing trust requires a new compatible APK. This is not a
replacement for checking the publisher fingerprint against the released APK's metadata.

The app checks on launch and foreground, coalesces concurrent requests, and limits manifest
checks to once per hour during its lifetime. Account/server switches do not reset this policy.
Downloads require Android to report an unmetered Wi-Fi network; unknown networks cannot
authorize a download. Settings and the incompatible-server screen show update status and
running APK/runtime/update identifiers, with a deliberate restart when an update is ready.
The web retains its existing service-worker update path.

Expo's automatic checks are set to `NEVER`, including recovery network fetching, so native
startup does not bypass this download policy. Cached recovery remains Expo's responsibility;
this does not promise recovery from every post-startup JavaScript failure. Native recovery,
signature rejection and offline behavior still require the device acceptance scenarios.

The isolated `apps/updates` Worker serves signed immutable manifests/assets from R2. It has
no private signing key and cannot create signatures. Publication/promotion automation,
released-APK fingerprint matching and device acceptance remain unfinished; no publisher
resource or production signing material is provisioned by these changes.
