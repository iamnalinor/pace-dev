# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private
vulnerability reporting on this repository (**Security → Report a vulnerability**); if
that is not available, contact the repository owner directly through their GitHub
profile. Expect an acknowledgement within a few days; this is a personal project, so
fixes land as time allows, and credit is given in the release notes unless you prefer
otherwise.

## What the design relies on

- **Identity** is Telegram. The web login verifies the Login Widget payload with
  HMAC-SHA-256 over the bot token (constant-time compare, `auth_date` within five
  minutes). The Android login binds a short-lived random nonce to the Telegram user who
  opened the bot deep link; the nonce is handed out once and expires after five minutes.
- **Access** is a whitelist (`ALLOWED_TELEGRAM_IDS`). Anyone else is refused before a user
  row exists.
- **Sessions** are opaque bearer tokens (32 random bytes); the database stores only
  their SHA-256. They expire after 90 days and `POST /api/auth/logout` revokes them.
- **Data isolation**: each user's events live in their own Durable Object, addressed by
  the user id taken from the session — never from the request.
- **Bot webhook**: every call must carry the `X-Telegram-Bot-Api-Secret-Token` header
  matching `TELEGRAM_WEBHOOK_SECRET` (checked by grammY, 401 otherwise).
- **Web headers** (`apps/web/public/_headers`): a CSP that only allows scripts from the
  app and `telegram.org`, frames from `oauth.telegram.org`, connections to the API host;
  `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy.
- **Errors** never leak internals: unhandled exceptions become `{ code: "internal" }`
  and are logged server-side.
- **Secrets** are never committed. Worker secrets are set with `wrangler secret put` (by
  the deploy workflow from GitHub secrets); local ones live in the gitignored
  `apps/api/.dev.vars`. `wrangler.jsonc` holds only resource ids and non-secret vars.
- **Dependencies**: exact versions, `bun audit --audit-level=high` in CI, weekly
  Dependabot updates.

## Known limitations

- **The Android APK is signed with the public debug keystore** (see
  [README → Android release](README.md#android-release)). Anyone can produce an APK with
  the same signature, so the signature does not prove the build came from this
  repository, and App Links verified against that fingerprint could be claimed by another
  debug-signed app with the package name `dev.nalinor.pace` on the same device. Install
  APKs only from this repository's GitHub Releases, and switch to a private keystore
  before distributing the app more widely.
- The dev login route (`POST /api/auth/dev`) exists whenever `ENVIRONMENT` is not
  `production`. Never deploy a non-production environment to a public host.
- Telegram bot tokens grant full control of the bot: rotate the token in BotFather if it
  leaks, then update the `TELEGRAM_BOT_TOKEN` secret and redeploy (the workflow re-sets
  the webhook).
