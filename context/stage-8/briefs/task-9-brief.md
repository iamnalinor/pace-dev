# Task 9 — Part D: one sessions system, login notices, Devices inline in Settings, Settings layout, MCP instructions

Owner's words (Settings/Devices screenshots):
- «Тут на этапе загрузки показываем скелетоны. Если последние данные слишком давно (давай поставим как порог 8 часов), то
  показываем точное время, а не продолжительность» (Devices: «Pixel 9a · Phone · Last data 11h 29m ago»).
- «Кнопка disconnect слишком широкая». «Кнопка добавления девайса на телефонах ничего не делает вроде».
- «На пк чето кнопки слишком широкие. Плюс в Connected apps ваще ничего не сказано как добавить MCP – добавь кнопку по
  которой мы показываем инструкцию. Отдельный раздел Devices с переходом по кнопке мб странно, можно просто показывать
  устройства опрятным списком прямо здесь. Внизу у нас кнопки: Export data (переезжает сверху), по нажатию на нее скачиваем
  эксель табличку, доп описание на сайте можно не делать; Log out; И подраздел danger: Wipe data (как factory reset…),
  Delete account. Оба подтверждаем сначала на сайте, а потом в тг боте – этакое 2fa.» (wipe/delete = Task 10)
- «О кста го в тг бота присылать уведы о входах (если вход через веб тг – присылаем уведомление вида «Вы вошли с
  такого-то устройства с IP <>, Germany”, если через диплинк – присылаем аналогично но с кнопкой, а еще в Devices
  показывать все активные сессии (втч браузерные – т.е. классифицируем браузер / приложение / агент активности или как-то
  так) с возможностью ревокнуть каждый. Да и MCP можно сюда же перенести. Круто же? Единая система сессий.»

Current code: D1 sessions (apps/api/src/shared/db/d1-schema.ts: label, scope null|"usage:write"), auth/sessions.ts,
auth/auth-routes.ts (labels web/android/dev; the `android` label is used for every bot-nonce login, also browser ones
through the bot — `POST /api/auth/nonce?from=app|web`), auth/device-routes.ts (POST/GET/DELETE /api/devices; computers =
usage:write tokens, phones = other device ids that sent usage via `devicesOf`), oauth/oauth-routes.ts (GET/DELETE
/api/oauth/grants, grants in KV OAUTH_KV), bot/bot.ts `/start login_…` + `bindBotLogin` (auth/bot-login.ts; the bot
replies with a "Back to Pace" button after a deep-link login — find it), apps/app/src/features/devices/* (DevicesScreen,
DeviceRow, AddComputer sheet), features/oauth/connected-apps.tsx, screens/settings-screen.tsx, features/settings/*.
The notification pool from Task 8 (`notify(kind, payload)` on the user DO via UserStoreApi) exists.

## Sessions model (D1, then `bun db:generate`)
`sessions` gains: `kind` (`browser | app | agent | dev`), `name` (display name), `userAgent`, `ip`, `country`,
`city`, `deviceId` (nullable; links a phone or an agent to its usage data). `label` goes (breaking is fine) — derive
`name` instead. `scope` stays (`usage:write` for agents).
- Widget login (`POST /api/auth/telegram`): kind `browser`, name from the User-Agent ("Chrome on macOS", "Safari on
  iPhone", "Firefox on Linux"… — a small pure parser in apps/api/src/auth (or core if the client also needs it); unit
  tests over real UA strings incl. Android Chrome, iOS Safari, Edge, Yandex Browser → "Yandex Browser on Windows").
- Deep-link login: `POST /api/auth/nonce` captures ip/country/city/UA and `from` on the nonce row (add columns to
  login_nonces); when the app/web consumes the nonce the session gets kind `app` when from=app (name: the phone model
  sent by the app — add an optional `deviceName` + `deviceId` to the nonce request body; the app sends
  expo-constants/expo-device name and its device id), or `browser` when from=web (name from UA).
- Agents (`POST /api/devices` today): kind `agent`, name = the computer name the person typed, scope usage:write,
  deviceId = generated. Dev login: kind `dev`.
- ip from `CF-Connecting-IP`, country/city from `c.req.raw.cf` (`cf.country`, `cf.city`; absent in tests — make it
  injectable/mocked in tests via the request's cf property, see how cloudflare:test lets you pass `cf`).
- `lastSeenAt` as today.

## Endpoints (contract first)
- `GET /api/sessions` → `{ sessions: [{ id, kind: browser|app|agent|dev|mcp, name, ip, country, city, createdAt,
  lastSeenAt, lastDataAt (agents/app: the latest usage upload for its deviceId; null otherwise), current: boolean,
  scopes? (mcp) }] }` = D1 sessions of the user + MCP grants from OAUTH_KV (kind `mcp`, name = client name, createdAt
  from the grant; ids prefixed `mcp:`). Phones that sent usage but have no session (old data) don't matter (data dropped).
- `DELETE /api/sessions/:id` → revokes a D1 session or (for `mcp:`) the grant. Revoking the current session = log out
  (allowed; client handles it by signing out).
- `POST /api/devices` stays as "create an agent token" (rename to `POST /api/sessions/agents` if cleaner — your call;
  keep the client in sync). Remove `GET/DELETE /api/devices`, `GET/DELETE /api/oauth/grants` (replaced), and their
  client code. Update docs/mcp.md / docs/desktop.md mentions.

## Login notices
On every new session of kind browser/app/dev (not agents — an agent token is created by the person in Settings; not
mcp), call the DO's `notify("login", { sessionId, kind, name, ip, country, city })` (Task 8). Telegram text (EN/RU by
language): "You signed in from Chrome on macOS · IP 1.2.3.4 · Germany, Berlin" / RU "Вход с Chrome on macOS · IP 1.2.3.4 ·
Германия, Берлин" (country name via `Intl.DisplayNames([lang], { type: "region" })`). Buttons: "Not me — end this
session" (callback revokes that session and edits the message to "Session ended"). For a deep-link login the bot's
existing reply after /start login (with "Back to Pace") is replaced by this same login message, keeping the "Back to
Pace" button next to "Not me" — so the person gets one message, not two. Careful: at /start time the session does not
exist yet (it is created when the app polls the nonce) — so either create the notice when the session is created and
edit/send then, or send at /start with the nonce's captured ip/UA and attach the session id later; choose the simpler
correct one and explain. Tests: api int tests for both login paths producing one Telegram message with the right
text and buttons (stubbed fetch), and the Not-me callback revoking the session.

## Settings (apps/app/src/screens/settings-screen.tsx and features/*)
- Buttons size to content on a computer (no full-width buttons ≥1024 except inside sheets); on phones full-width is fine
  where it is the main action. Check ui/button.tsx for a `fit`/`block` prop or add one.
- Order: preferences (theme, language, zone, permissions on phone, night hours if Task 5 added it), Notifications
  (Task 8's section), **Devices and sessions**, Export data, Log out, Danger zone (Task 10 fills it; for now keep Delete
  account there).
- **Devices and sessions** inline (delete the /devices screen, app/devices.tsx, PushedScreen usage; update the sidebar's
  Settings `owns` list): a tidy list from GET /api/sessions — icon by kind (globe/browser, phone, laptop/agent, plug/mcp,
  terminal/dev), name, a meta line ("This device" for current; "Germany · 1.2.3.4"; for agents/app "Last data 2h 10m ago"
  or, when older than 8 hours, the exact time "Last data Oct 12, 23:10" (use the existing date formatting helpers; the 8 h
  threshold a named constant); "Nothing sent yet"), and a compact "Revoke" (sessions) / "Disconnect" (agents) ghost button
  sized to its text with an inline confirm. Skeleton rows while loading (a new ui/skeleton.tsx: grey pulsing bars;
  respects reduced motion) instead of "Loading…". Errors: a quiet retry line.
- Two buttons under the list: "Add a computer" (opens the existing add-computer sheet for now — Task 15 rewrites its
  steps; FIX the bug that it does nothing on phones: find the root cause first (systematic debugging) and add a test) and
  "Connect an AI app" → a sheet with the MCP server URL (copy button) and short steps for Claude (Settings → Connectors →
  Add custom connector → paste URL), ChatGPT (developer mode connectors) and others (any MCP client with OAuth) — derive
  from docs/mcp.md; strings via t().
- Export data: moved down, a single button "Export data" (no description) that downloads the .xlsx on the web; on Android
  build the same workbook and hand it to the share sheet if write-excel-file works under RN (try; if it does not, hide it on
  Android and say so in the report).
- Delete apps/app/src/features/oauth/connected-apps.tsx and the devices screen; keep shared bits that are reused.

## Tests
API int: sessions list (D1 + mcp grant), revoke both kinds, current flag, cf fields stored, UA naming; login notices
(above). Client: hooks for sessions. App: Settings renders the list with skeletons then rows, the 8 h rule, revoke flow,
Add a computer opens on phone, Connect an AI app shows the URL. Update/replace e2e/devices.e2e.ts. `bun lint`,
`bun test:unit`, `bun test:api`, `bun test:app` green; run touched e2e specs. Screenshots of Settings (desktop light+dark,
phone) into /tmp/claude-0/-home-user-pace-dev/cb223545-7465-5720-b7e6-b3fd375d3413/scratchpad/task9/.
