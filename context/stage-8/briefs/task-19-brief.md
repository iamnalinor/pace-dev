# Task 19 — self-hosting: the app connects to any Pace server

Owner: «мультитенантность / федеративность / подбери корректный термин для апк. юзер может уже задеплоить наш бэк на свой URL, затем
отдельной кнопочкой (например Change server) при логине ввести base url своего API и мобилка будет юзать уже его. соответственно бэк
должен уметь отдавать версию и адрес тг бота, ну видимо и линк на фронт тоже, если потребуется, при несовместимости версий (аппка
новее бэка) мы не даем логинится или заходить если мы уже залогинены. цель: любой юзер может поставить наш апк, не собирая
самостоятельно, поднять свою инфру и пользоваться сервисом вообще не завися от нас».
Term: **self-hosting** with a configurable server (not multitenancy or federation: each server is a separate, independent
instance; servers do not talk to each other).

## Server: instance info
- Public `GET /api/instance` (contract first, no auth): `{ name: "Pace", version (the server's app version, e.g. from package.json /
  a build-time constant), protocol: integer (API protocol version — bump on breaking API changes), minClientProtocol: integer,
  botUsername (from TELEGRAM_BOT_USERNAME / BOT_INFO), webOrigin (WEB_ORIGIN or null), apiOrigin, loginMethods: ["telegram-widget",
  "telegram-deeplink"], features: { push: boolean (FCM configured), assistant: boolean (LLM keys present) } }`.
- A shared `PROTOCOL` constant in packages/core (the client is built with it). Rules: the client refuses a server whose `protocol` <
  the client's `minServerProtocol` ("This server runs an older Pace. Update the server to vX or use another one.") and the server
  refuses (426 `client/outdated`) requests from clients whose protocol < `minClientProtocol` (the client sends `X-Pace-Protocol` on
  every call — add it in packages/client api-client) ("Update the app"). Set the initial values so today's app and server match.

## App: Change server
- Login screen: a quiet "Server: pace.example.dev · Change" line; "Change server" opens a sheet: a URL field (https only, except
  http://localhost / 10.0.2.2 / private IPs for development), "Check" → calls `/api/instance`, shows name/version/bot, then "Use this
  server". "Reset to default" returns to the build's default (EXPO_PUBLIC_API_URL). Persist the chosen server (SecureStore on Android
  — a plain key is fine; localStorage on web).
- On the web build the server is the page's own deployment by default; allow Change server on the web too only if it is simple and
  CORS allows it (the API's CORS must then accept that web origin — check apps/api CORS config); otherwise hide it on the web and say
  why in the report.
- Everything that used the build-time API URL / bot username / web origin reads the current server's values instead: the api client
  base URL, the Telegram deep-link login (bot username), the Telegram Login Widget (bot username — the widget also requires the
  bot's domain to be set to the web origin in BotFather; document), MCP URL shown in Settings, the desktop agent install command's
  API URL, links to the web.
- Switching server signs out and clears the local store (different storeId anyway); a different server's session tokens are never sent
  to another server (tokens stored per server origin).
- Incompatible versions: on start and on each sign-in, fetch `/api/instance` (cache for the session); if incompatible → on the login
  screen, sign-in is refused with "Server and app versions don't match" and what to update (Change server stays available there);
  a signed-in user gets a full-screen "Server and app versions don't match" with what to update and ONE action: "Log out" (owner:
  «лучше просто выход сделать. вход у нас завязан на сервер, выходишь и тогда уже можешь менять сервер») — no Change server on that
  screen; after logging out the login screen offers Change server.

## Docs
- docs/self-hosting.md: what you need (a Cloudflare account — Workers, D1, KV, Durable Objects on the free plan; a Telegram bot from
  BotFather; optional Groq/Gemini keys; optional Firebase), step by step: fork or clone, wrangler config (account id, D1 database id,
  KV namespace id), secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, GROQ_API_KEY…, FIREBASE_SERVICE_ACCOUNT), vars
  (ALLOWED_TELEGRAM_IDS — your own id so nobody else can sign in, TELEGRAM_BOT_USERNAME, WEB_ORIGIN, API_ORIGIN), deploy (the
  existing deploy.yml in a fork with its secrets, or `wrangler deploy` by hand), set the bot's domain in BotFather for the widget, set
  the webhook (the deploy does it), then in the app: Change server → your API URL. Push notifications on a self-hosted server: the
  released APK is tied to our Firebase project, so self-hosters get push only with their own build — say so plainly (everything
  else works; reminders arrive in Telegram).
- README: a short "Run your own server" section linking to it.

## Tests
Core: protocol compatibility function (both directions). API int: /api/instance shape (no auth), 426 for an old X-Pace-Protocol, no
header → accepted (web build loaded before the change) — decide and test. Client: the api client sends the header; switching servers
clears the store and tokens. App: Change server sheet (check → use → persisted; invalid URL; unreachable; incompatible); the blocking
screen with only Log out. `bun lint`, `bun test:unit`, `bun test:api`, `bun test:app` green.
