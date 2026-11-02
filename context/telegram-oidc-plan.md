# Sign in with Telegram's OpenID Connect (to do; owner asked for it 2026-11-02)

A brief for a new session. Read `CLAUDE.md`, `docs/architecture.md` ("Auth and sessions") and
`docs/self-hosting.md` first, then follow the usual working method (brainstorm → plan → tasks →
review → QA). The research below was done on 2026-11-02. Check the docs again before building:
the endpoints are stable, but the JS library's URL and the mobile details were not all published.

## Status (2026-11-02): not planned for the owner's audience

The owner and everyone who will use the app run third-party Telegram clients. The sources of the
clients were checked to see whether OIDC confirmations reach those clients. They do not:

- **A returning person is offered "confirm in the app"**, which is an `OAUTH_REQUEST` **push
  notification** (see core.telegram.org/api/url-authorization; "valid for 60 seconds").
  - In the official Android client it is handled only in `PushListenerController.processRemoteMessage`
    (`case "OAUTH_REQUEST"`, `TMessagesProj/.../messenger/PushListenerController.java`), and that
    method is fed only by FCM or HMS (`PUSH_TYPE_FIREBASE`, `PUSH_TYPE_HUAWEI`).
  - There is no MTProto update for it: `MessagesController` has no OAuth path.
  - So a client with no Google or Huawei push never sees it: F-Droid and FOSS builds, phones without
    Google services, forks without their own push.
  - A fork that has not merged that `case` never shows it either. `Telegram-FOSS`'s
    `PushListenerController` has no `OAUTH_REQUEST`.
- **The deep-link and QR way** (`tg://resolve?domain=oauth&startapp=<token>`) depends on native
  handling in the client.
  - The official `LaunchActivity` sends the OAuth URL to `messages.requestUrlAuth` and shows
    `OAuthSheet`.
  - `Telegram-FOSS`'s `LaunchActivity` has no OAuth handling at all, so the link is not confirmable
    there.

For this audience OIDC would fall back to the bot deep link every time. **Decision:** keep the bot
deep link as the way in. Revisit only if the legacy Login Widget is switched off, and then weigh
whether to drop the web widget instead of replacing it. The research below stays for that day.

## Why

Telegram now runs a standard OpenID Connect provider at `oauth.telegram.org`. It replaces the
hash-signed Login Widget, which is now archived at `core.telegram.org/widgets/login-legacy`. What it
gives us:
- A popup or redirect in which the person confirms in Telegram, ending in a signed JWT `id_token`.
  It is a standard flow with standard verification. We would no longer derive an HMAC from the bot
  token.
- An optional `telegram:bot_access` scope (the JS library calls it `write`): the bot may message
  the person after login. Today a web widget login gives the bot no chat, which is why the bot
  deep link exists. This scope removes that gap for notifications.
- Native SDKs for Android and iOS that hand off app-to-app to the Telegram app, with no web view.

What we have today: on the web, the archived Login Widget (`POST /api/auth/telegram`,
`auth/telegram-widget.ts`). On Android, and as a second way on the web, a bot deep link with a nonce
(`/start login_<nonce>`, polled through `GET /api/auth/nonce/:nonce`, `auth/bot-login.ts`). The
deep-link login also adopts the bot's reply as the sign-in notice. The owner wants to move to OIDC
in the next iteration.

## What Telegram provides (as researched)

- **Discovery:** `https://oauth.telegram.org/.well-known/openid-configuration`.
  - Authorization: `https://oauth.telegram.org/auth`.
  - Token: `https://oauth.telegram.org/token`.
  - JWKS: `https://oauth.telegram.org/.well-known/jwks.json`.
  - There is **no userinfo endpoint**: everything comes in the `id_token`.
- **Flow:** authorization code with PKCE (`S256`; `plain` is also listed, don't use it).
  - Request parameters: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`,
    `code_challenge`, `code_challenge_method=S256`.
  - Token request: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`,
    `code_verifier`, with HTTP Basic `client_id:client_secret` (or the secret in the body).
  - The answer holds `access_token`, `token_type`, `expires_in` (3600 in the example) and
    `id_token`. No refresh token.
- **Credentials:** @BotFather → the bot → Login Widget shows the **Client ID** and **Client
  Secret**, and holds the **Allowed URLs**. Every widget origin and every OIDC `redirect_uri` must be
  registered there, because Telegram refuses any other.
  - Login Widget → Advanced chooses the signing algorithm: RS256 (default), ES256, EdDSA or ES256K.
  - **EdDSA and ES256K allow only `openid`, and refuse `profile` and `phone`. We need `profile`,
    so use RS256 or ES256.**
- **Scopes:**
  - `openid` (required) gives `sub`, `iss`, `iat`, `exp`.
  - `profile` gives `id`, `name`, `given_name`, `family_name`, `preferred_username` and `picture`.
  - `phone` gives `phone_number` and `phone_number_verified`, after the person consents. We don't
    need it.
  - `telegram:bot_access` is explained above.
  - Discovery also lists `ton:wallet`. Ignore it.
- **The Telegram user id is the `id` claim (`profile`), not `sub`.** The example has `sub`
  "1234123412341234123" next to `id` 987654321. Our identity, `ALLOWED_TELEGRAM_IDS` and the
  `users` table all key on the Telegram id, so read `id` and keep `sub` only for reference. Check on
  a real login whether `sub` is per bot (pairwise) or global, and write the answer down.
- **Verification:**
  - Check the signature against the JWKS keys (pick the key by `kid`, cache the JWKS, fetch it
    again once on an unknown `kid`).
  - Check `iss == "https://oauth.telegram.org"`, `aud ==` our bot's Client ID (the bot id),
    `exp`/`iat` with a small clock skew, and the `nonce` when we sent one.
  - Refuse `alg: none`, and any algorithm other than the one configured.
- **JS library `telegram-login.js`** (its URL was not on the docs page; find it):
  - API: `Telegram.Login.init({ client_id, scope: ["profile", "write"], lang, nonce }, cb)`,
    `Telegram.Login.open()` and `Telegram.Login.auth(options, cb)`.
  - The callback gets `{ id_token, user, error }` **in the page**: no code, no secret, the
    `id_token` is checked on the server. A server-made `nonce` inside the token guards against
    replay.
  - The popup needs the page **not** to send `Cross-Origin-Opener-Policy: same-origin`. Allow
    `same-origin-allow-popups` or no header. Check `apps/app/public/_headers` and the CSP: the
    script host, the popup, and `connect-src` if the library calls out.
- **Android SDK** (`github.com/TelegramMessenger/telegram-login-android`, MIT, API 23+):
  - Dependency `org.telegram:login-sdk:1.0.0` from **GitHub Packages**. That needs a GitHub token
    with `read:packages` at build time: a CI secret, never in chat.
  - Calls: `TelegramLogin.init(clientId, redirectUri, scopes)`, `startLogin(activity)` and
    `handleLoginResponse(uri, onSuccess = { it.idToken }, onError)`.
  - It returns an `idToken` and opens the Telegram app itself.
  - The redirect is an App Link `https://app{appid}-login.tg.dev/tglogin`, with an
    `autoVerify` intent filter on a `singleTask` activity, or a custom scheme
    (`yourapp://telegram-login`).
  - The package name and the **SHA-256 signing fingerprint** are registered in @BotFather, and
    Telegram checks the app's signature.
  - What happens when the Telegram app is not installed is not documented.
  - There is no React Native or Expo wrapper: we would write a config plugin and a native module.
- **Known friction** (community, 2026): some logins fell back to the legacy widget, and libraries
  that expect a userinfo endpoint must be told to skip it.

## How the person confirms (checked 2026-11-02 in a browser against Telegram's live demo)

The popup (`oauth.telegram.org/auth?...`) offers three ways:
- **"Continue with Telegram"** opens `tg://resolve?domain=oauth&startapp=<token>`, the **Mini App
  of the `@oauth` bot**. The page then polls `POST /auth/login?...&qtoken=<token>` until the person
  confirms inside that Mini App.
- **"Log in with a QR"** encodes the same link (`https://t.me/oauth?startapp=<token>`), to scan with
  a phone that has Telegram.
- **"Log in with a phone number"** asks for the number and sends a confirmation to the account.
  This is the old widget's way. It is reported never to arrive in some setups (TelegramMessenger/
  telegram-login-android#15). The owner saw such confirmations not arrive in another service, while
  using third-party clients.

So the main way works in **any client that opens a bot's Mini App from a `startapp` link**. Forks
of the official apps generally do; minimal clients may not. **Check on the owner's own clients**
(the live demo button at https://core.telegram.org/bots/telegram-login) before building anything.
If their clients don't open it, OIDC brings them nothing, and the bot deep link stays the only way
in.

## Design to start from

Self-hosting shapes this design: every instance has **its own bot**, so its own Client ID, secret
and Allowed URLs. Owners may also ship their own APK under their own package. Nothing may hard-code
our bot, our domain or our package.

1. **Server: one verifier for the web and the app.**
   - New env: `TELEGRAM_CLIENT_ID` (the bot id, the `aud`), read from `c.env`.
   - **No client secret is needed**: both ways in hand the server an `id_token`, which is checked
     against the public JWKS. The secret only matters for the code exchange, and no code flow is
     built.
   - **Misconfiguration fails loudly** (owner's rule, see `context/firebase-from-server-plan.md`),
     through a deploy-time check and `500 server/misconfigured` with a reason code:
     - a Client ID that is not the bot's id (compare it with the bot token's numeric prefix);
     - a Client ID that is not a number.

     When it is unset, OIDC is simply not offered and the deep link is the way in.
   - **JWT verification:** a pure function in core (claims checks, Result with string-literal error
     codes), with WebCrypto in the Worker for RS256 and ES256. The JWKS is cached in the isolate and
     in KV with a TTL, and fetched again on an unknown `kid`.
   - Tests sign tokens with local keys and inject the JWKS: no network.
   - The resulting identity goes through the existing path: `ALLOWED_TELEGRAM_IDS`, the user
     upsert, session kind and name, place, the sign-in notice, "Not me".
2. **Web.**
   - The page asks the server for a nonce (reuse `login_nonces` or make a short-lived one), opens
     the JS library popup with `scope: ["profile", "write"]` and that `nonce`, and posts the
     `id_token` to `POST /api/auth/telegram/oidc`.
   - The server verifies the token, checks that the nonce is its own and unused (one conditional
     UPDATE), and opens a `browser` session.
   - The web's fallback is the same deep link as today's, for a blocked popup or a missing
     configuration. There is no redirect code flow.
   - Contract first: a zod `endpoint()` in `packages/core/src/api/endpoints.ts`.
3. **Android: the native SDK, configured by the server before sign-in** (owner, 2026-11-02).
   - Everything bot-specific is a run-time value. `TelegramLogin.init(clientId, redirectUri,
     scopes)` takes the Client ID at run time, so the app reads it from `GET /api/instance` (new
     field `telegram: { clientId, botUsername }`, read tolerantly) before it shows the sign-in
     button. Changing the server re-reads it, and the app restarts on a server change anyway (see
     the Firebase brief).
   - Only the **redirect** cannot come from the server **as an App Link**. Its host
     `app{appid}-login.tg.dev` would have to sit in the APK's manifest, and Android verifies App
     Links against that host's `assetlinks.json` at install time. A manifest cannot gain intent
     filters at run time, and a wildcard host does not verify.
   - So use the SDK's documented **custom-scheme redirect**: `pace://telegram-login` (the scheme
     comes from a build variable for owners' own builds). It is the same for every bot, so one APK
     serves every instance.
     - Each instance's owner registers that redirect in their bot's Allowed URLs.
     - Each owner also registers the app's package name and **signing SHA-256** in BotFather, since
       Telegram checks the app's signature. The docs publish the official APK's fingerprint, and an
       own build registers its own. This is a one-time setup step, like the Firebase app.
   - Flow: the app asks the server for a nonce, runs `TelegramLogin.startLogin`, gets `idToken` in
     `handleLoginResponse`, and posts it with the nonce to `POST /api/auth/telegram/oidc` (the same
     route as the web). The server verifies the token and opens an `app` session.
     - Check whether the SDK can carry a `nonce` (its README shows none). If not, bind the login to
       the server's short-lived nonce row some other way (e.g. `state`) or accept the token's
       one-hour life. Record the decision.
   - The SDK comes from GitHub Packages (`org.telegram:login-sdk`) and needs a `read:packages` token
     in CI secrets for the APK build. It needs an Expo config plugin (repository, dependency, the
     `singleTask` activity with the scheme's intent filter) and a small native module in
     `apps/app/modules/pace-native` (`init`, `startLogin`, the result as a promise).
   - **One fallback: today's bot deep link** (owner, 2026-11-02: two fallbacks are bad). When the SDK
     cannot sign in, the login screen offers the existing deep-link login (`/start login_<nonce>`).
     That covers:
     - the official Telegram app missing (a third-party or F-Droid client: the SDK hands off to the
       official app and checks its signature; check which clients it supports);
     - the owner not having registered this package or fingerprint with their bot;
     - an old Telegram version;
     - the SDK failing.

     The deep link works with any Telegram client, needs no registration, and already opens the
     bot's chat. **No server code-flow and no Custom Tab are built.**
   - Confirm on a phone: app-to-app with the Telegram app; the deep-link fallback without it and with
     the registration missing; a self-hosted bot with the released APK.
4. **Bot access.** Request `telegram:bot_access` / `write` so the pool can message the person
   without a `/start`.
   - Today's deep-link login adopts the bot's reply as the sign-in notice. With OIDC there is no
     such reply, so the notice is a fresh message, sent only if bot access was granted. Otherwise
     it arrives on the person's other channels.
   - Trace the client side (class 1): the sign-in notice, "Not me", the feed.
5. **Expand, then contract** (class 50).
   - `loginMethods` in `InstanceSchema` grows `telegram-oidc`; the schema already tolerates
     unknown methods.
   - A new app prefers OIDC when the server offers it. An old app keeps the widget or the deep
     link.
   - Only the legacy widget route goes, in a **later** release, once a release has served without it
     being needed.
   - The deep link stays for good as the single fallback, and as the only way when OIDC is not
     configured.
6. **Docs.** `docs/self-hosting.md`:
   - In BotFather → Login Widget, copy the Client ID into the env (the secret is not needed), add the Allowed
     URLs (the web origin and `pace://telegram-login`), register the app package and signing SHA-256 (the official fingerprint is given), and pick RS256 or ES256, not
     EdDSA or ES256K, because we need `profile`.
   - Also update the README and `docs/architecture.md` ("Auth and sessions").

## Tests that must exist

- **core:** verification, covering:
  - a good token;
  - an expired token, `iat` in the future beyond the skew, and a wrong `iss` or `aud`;
  - a bad signature, `alg: none`, an unexpected `alg`, and an unknown `kid`, which fetches the
    JWKS once and then refuses;
  - a missing `id` (only `openid` granted);
  - a nonce mismatch.
- **workerd** (`bun test:api`), with a **fake OIDC provider** in test env (like the fake LLM: a
  local key pair and `/jwks.json` behind a test-only base URL, minting tokens):
  - the `id_token` route (web and app);
  - a replayed token or nonce;
  - a Telegram id not on the whitelist;
  - a missing or partial config, which must return a loud 500.
- **e2e:** the web login through the fake provider (the popup stubbed to return its token), the
  deep-link fallback, with axe.
  The login sweep still passes.
- **Device checklist:** sign in on the phone through the native SDK (Telegram app installed) and
  through the deep-link fallback (without it, and with the owner's registration missing); a sign-in notice arrives; "Not me" ends the session; a self-hosted instance with its
  own bot works with the released APK.

## Open questions to settle at the start (record the answers)

- The JS library's script URL and version, and whether its popup opens the Telegram app on mobile
  web.
- Whether `sub` is pairwise per bot. Whether `id` always comes with `profile`.
- Whether the token endpoint takes a `nonce`, or only the library path carries it. In the code flow,
  bind `state` to the session either way.
- Whether the Android SDK accepts the custom-scheme redirect for any bot, and whether it can carry a
  nonce. Which Telegram clients the SDK hands off to (official only, or forks too).

## Sources

- https://core.telegram.org/widgets/login (OIDC, endpoints, scopes, library API, BotFather setup,
  COOP note)
- https://oauth.telegram.org/.well-known/openid-configuration
- https://github.com/TelegramMessenger/telegram-login-android (Android SDK README)
- https://github.com/TelegramMessenger/telegram-login-ios
- Community notes: https://github.com/WatWowMap/ReactMap/pull/1251,
  https://github.com/immich-app/immich/discussions/26620,
  https://www.npmjs.com/package/better-auth-telegram
