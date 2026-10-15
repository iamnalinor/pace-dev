# Task 8 — Part E: one notification pool (Login, Deadline Digest), a feed in the app

Owner's words: «Систему уведомлений тоже надо систематизировать. Хочется единый пул: чтобы было видно и в браузере, и в
аппке, и в тг. Виды уведомлений соответственно Login и Deadline Digest (назовем это так). Старых Digest-ов не будет. В
указанные слоты мы присылаем инфу по таскам, у которых осталось менее 24 часов до дедлайна (точнее останется меньше 24
часов после присылки следующего digest – т.е. присылаем когда более 24 часов остается, чтобы были минимум сутки). Бай
дефолт давай Deadline Digest слать ток в тг, в аппку и в веб не слать.»
Decisions: the pool holds exactly two kinds; Android keeps its LOCAL timers ("still doing this?" activity timer and
calendar-start reminders); "visible in the browser" = an in-app feed (no Web Push).

Today (read these): Telegram notifier in the user DO (apps/api/src/user-store/notifier.ts, user-store.ts alarm(),
notify-text.ts), rules in packages/core/src/notify/ (evaluate.ts: critical, long, digest, stuck; rules.ts;
schedule.ts; plan.ts for Android's local plan), Android local notifications apps/app/src/platform/notifications.ts
(syncLocalNotifications from GET /api/notify/plan, syncCalendarReminders, syncActivityTimers, showNow) and
apps/app/src/platform/phone-background.ts (sleep notice, calendar-ended notice), settings digestWindows / quietHours
(packages/core/src/model/settings.ts), the Settings UI apps/app/src/features/settings/notification-settings.tsx,
the decision log (DO `decisions` table, GET /api/decisions, the "Notification log" screen app/decisions.tsx).

## Model
- DO table `notifications`: id (ULID), kind (`login` | `deadline_digest`), createdAt, payload (JSON text, zod
  schema per kind in packages/core), readAt (nullable), telegram delivery state (`pending|sent|skipped|failed`
  + sentAt). `bun db:generate`, commit SQL (on top of Task 7's squashed DO migration).
- Core (packages/core/src/notify/): payload schemas — login: `{ sessionId, kind, name, ip, country, city? }`
  (Task 9 fills it; define the schema now); deadline_digest: `{ slot, tasks: [{ taskId, title, dueAt, dueTz }] }`.
- Settings: replace what is not needed. New setting `notificationChannels: { login: { telegram, app, web },
  deadline_digest: { telegram, app, web } }` with defaults login all true, deadline_digest telegram only.
  `digestWindows` stays (the digest slots; default keep ["09:00","21:00"]? — current default is 09:00/14:00/21:00;
  keep the current default). `quietHours` stays but only gates the Android local timers; Login is never held back.
  Follow how settings are added (settings.ts, reducer, settings.updated payload, tests).

## Deadline Digest (pure, core)
`deadlineDigest(state, { slot S, nextSlot N, reported })`: open tasks (isOpen; not inbox) with a `dueAt` such that
`dueAt > S` and `dueAt ≤ N + 24h`, excluding those already reported for that same dueAt (`reported` = set of
`taskId@dueAt` kept in DO storage; a changed deadline is announced again). Sorted by dueAt. Empty → no notification.
A slot more than 90 minutes late is skipped (keep the existing rule). Next slot N = the next digest window after S
(possibly tomorrow) in the account's zone (reuse schedule.ts). Property/unit tests: a task due in 30 h at a 09:00
slot with next slot 21:00 (N+24h = 45 h ahead) IS included; a task due in 50 h is not (it will be included at a later
slot while it still has > 24 h); a task created late with 10 h left is included at the next slot; each task@dueAt once.

## Delivery
- The DO alarm runs: digest slots → create a deadline_digest notification (if not empty) → deliver.
- `notify(kind, payload)` in the DO (also callable from Task 9's login flow through UserStoreApi in
  apps/api/src/shared/contract.ts): insert the row; if the kind's telegram channel is on and a chat is known, send the
  Telegram message (texts in apps/api/src/user-store/notify-text.ts, EN/RU by the account's language; the digest lists
  tasks with their due time "Fri 18:00 · 1d 6h left"; tasks link back into the app with the existing deep link
  pattern if there is one); record the delivery state.
- Remove: critical, long-run Telegram message, stuck, the old digest, their texts and tests, the Snooze/Done/Cancel
  buttons on those messages (callback codes z/d/x) if nothing else uses them, deadline crossings and digests in
  core's notify/plan.ts and Android's syncLocalNotifications (GET /api/notify/plan may go if nothing else needs it),
  the sleep notice and calendar-ended notice in phone-background.ts. KEEP syncActivityTimers ("still doing this?")
  and syncCalendarReminders, gated by quietHours.
- Endpoints (packages/core/src/api/endpoints.ts): `GET /api/notifications?before=&limit=` (newest first, with
  `unread` count), `POST /api/notifications/read { ids | all: true }`. Only kinds whose `app` or `web` channel is on
  are listed? — No: list every notification but let the client filter by channel (the client knows if it is the app
  or the web: app = Android, web = browser). Simpler rule: the server returns all; the client shows those whose
  channel for its platform is on. Unread count likewise computed client-side from the list it shows.
- Live: when a notification is created, the DO's WebSocket says "changed" (or a new message type
  `{"type":"notification"}`) so open clients refetch the feed.

## Feed in the app
- A bell icon with an unread badge: in the sidebar header (next to the name from Task 3) and in the phone header of
  Now (top right, where the Inbox counter used to be). Opens `/notifications`.
- `/notifications` screen: a list grouped by day; a login item: "Signed in from Chrome on macOS · 1.2.3.4 · Germany"
  with time; a digest item: "Deadlines in the next day" + the task rows (tap → task). Opening the screen marks
  everything shown as read. Empty state. This screen replaces Settings' "Notification log" link; the assistant's
  decision log stays reachable from this screen via a quiet link "Assistant log" (keep app/decisions.tsx).
- Android: when the app syncs (foreground or the background task) and finds unread notifications whose `app` channel
  is on and that were not shown yet, it raises a local notification for each (remember shown ids locally).
- Settings → Notifications section: for each kind a row with three toggles (Telegram, App, Web); Digest times as now;
  Quiet hours with a note "Only for timers on the phone". Narrow buttons (Task 9 does the general Settings layout —
  here just don't make new full-width buttons).

## Tests
Core: digest selection + settings reducer. API int: alarm at a slot creates a digest row and sends Telegram (stub
fetch to api.telegram.org as existing tests do), respects channel off, endpoints list/read, auth. App: bell badge
count, feed rendering both kinds, mark read on open, channel toggles write settings. Remove tests of removed kinds.
`bun lint`, `bun test:unit`, `bun test:api`, `bun test:app` green; update e2e specs touching Notification log.
# Task 8b — "Event starting" in the notification pool; resolving a notification everywhere; Firebase push

Owner (after a phone reminder «Посетите коллоквиум?»): «это кстати норм тема, надеюсь мы же оставим такой вид уведомлений?
мы их шлем локально или серверсайд? можно в целом включить их в систему единых уведомлений, по дефолту слать на тг. плюс нужно
придумать как отзывать уведомления, если мы с одного устройства согласились. т.е. юзер хочет видеть уведомления на теле и в тг,
мы с тг апрувнули участие в событии, на телефоне сообщение пропало. и наоборот». Decision: Firebase push (FCM) for instant
removal on the phone; the owner will create the Firebase project.

Builds on Task 8 (DO `notifications` table, kinds login + deadline_digest, `notify(kind, payload)`, per-kind channel settings,
the feed) and Task 9 (unified sessions; the app's session row). Today the calendar reminder is Android-local
(syncCalendarReminders) — it moves into the pool.

## New kind `event_start`
- Server-side: the DO already stores the phone's calendar copy (7 days back, 14 ahead; Task 5 added more fields). The DO alarm
  schedules one `event_start` notification per accepted/own event at its start (skip all-day events, events already attended or
  skipped, events whose series the person answered for good — find how series rules are stored today: phone-memory.ts
  `seriesRules` / dismissedKeys are LOCAL; move what is needed to the server as settings or events so all channels agree).
  Payload: `{ eventKey, title, start, end, location? }`.
- Default channels: telegram on, app off, web off (owner: «по дефолту слать на тг»); configurable like the other kinds.
- Actions: Attend / Skip on every channel. Telegram: inline buttons. Android: notification action buttons (expo-notifications
  categories with actions; tapping Attend runs the attend action in the background handler if possible, else opens the app on
  the event). Web feed: buttons on the item. Attend = the same client/server action Now's offer uses (Task 3c made attending an
  event before its start begin now); Skip = the same as today's skip.
- The old local calendar reminder (syncCalendarReminders and its memory) goes away once this works.

## Resolving everywhere
- A notification has `resolvedAt` + `resolution` (`attended | skipped | read | expired`). Any channel's action resolves it on the
  server (a new endpoint `POST /api/notifications/:id/resolve { resolution }`, and the bot callback does the same).
- On resolve: Telegram — if the answer came FROM Telegram, edit that message (remove buttons, append "✓ Attending" / "Skipped"); if it came from any other channel (phone, web, the app's own Now offer), DELETE the Telegram message (deleteMessage) — owner: «если ответили в тг, то да. иначе увед в тг просто удаляем»; an expired one is deleted too; Android — a silent FCM data push
  `{ type: "dismiss", notificationId }` makes the app cancel the shown notification at once; web/app feed — the live socket
  says changed, the item shows its resolution. Attending the event from anywhere else in the app (Now's offer) also resolves the
  matching event_start notification (by eventKey).
- Expired: an event_start not answered by the event's end resolves as expired (the Telegram message is deleted, the phone notification dismissed).

## Firebase Cloud Messaging
- App: expo-notifications `getDevicePushTokenAsync()` (native FCM token) after permission; send it with the session
  (`PUT /api/sessions/current/push-token`), stored on the D1 session row (`pushToken`). `app.config.ts`: `android.googleServicesFile`
  from an env var path (e.g. `GOOGLE_SERVICES_JSON` file written by CI) — when absent, the build works and push is simply off.
- Server: send via FCM HTTP v1 (`https://fcm.googleapis.com/v1/projects/<id>/messages:send`) with an OAuth2 access token minted
  from a service account (secret `FIREBASE_SERVICE_ACCOUNT`, the JSON key; sign the JWT RS256 with WebCrypto in the Worker; cache
  the token ~50 min in the DO or module scope per request rules — read bindings from c.env). Missing secret → push disabled,
  logged once. Data-only messages for dismiss; notification messages (title/body + data) for kinds whose `app` channel is on, so
  the phone shows them even when the app is closed (this replaces "raise a local notification when the app syncs" from Task 8
  for push-capable phones; keep the sync fallback when there is no token).
- Android handler: a background message handler (expo-notifications `registerTaskAsync` / `setNotificationHandler` + background
  notification task) that on `dismiss` calls `dismissNotificationAsync(id)`; shown notifications use the pool id as identifier.
- CI: release.yml writes `GOOGLE_SERVICES_JSON` (secret, raw JSON) to a file before prebuild if set; deploy.yml pushes
  `FIREBASE_SERVICE_ACCOUNT` as a Worker secret if set.
- Docs: README "Push notifications (Firebase)" with the owner's steps (create project, add Android app `dev.nalinor.pace`, download
  google-services.json → secret GOOGLE_SERVICES_JSON; Project settings → Service accounts → Generate new private key → secret
  FIREBASE_SERVICE_ACCOUNT; enable Firebase Cloud Messaging API v1).

## Tests
Core: event_start scheduling selection (accepted/own, not all-day, not answered, series rules). API int: alarm creates event_start at
start and sends Telegram with buttons; the bot's Attend resolves it, starts the activity and edits the message; resolve endpoint;
FCM send called with a dismiss data message (stub fetch for oauth2 + fcm; a test service-account key generated in the test);
no secret → no FCM call. Client/app: Attend from the feed resolves; the push handler dismisses by id (mock expo-notifications).
`bun lint`, `bun test:unit`, `bun test:api`, `bun test:app` green.

## Owner update (2026-10-14)
«новые нотификации начни делать, считай, что креды в CI уже есть. я добавлю их попозже» — assume the GitHub secrets
GOOGLE_SERVICES_JSON and FIREBASE_SERVICE_ACCOUNT exist: wire release.yml / deploy.yml to use them unconditionally where that
is simpler, but the Worker and the app must still run without them (local dev, tests, e2e): push off, everything else works.
Task 9 (unified sessions) is NOT done yet: store the push token on the current D1 session row yourself (a nullable `pushToken`
column on `sessions`, `PUT /api/push-token` for the current session) — Task 9 will fold it into its sessions model.

## Owner update: "Still doing X?" joins the pool
The Android-local "still doing this?" timer (syncActivityTimers, at REMIND_FACTOR × the expected length) becomes pool kind
`activity_overrun`, sent by the server (the DO knows the running activity and its expected length; schedule it with the alarm;
re-arm when the activity's expectation changes or "Yes, still" extends it as today). Default channels: **app only** (owner: «default
only phone»); Telegram and web can be turned on. Actions on every channel: "Yes, still" (as today's action) and "Stop". Resolved
everywhere (same rules: answered in Telegram → edit; elsewhere → delete the Telegram message; FCM dismiss on the phone) also when
the activity is stopped or changed from anywhere. Remove syncActivityTimers and its local scheduling once the push path covers it.
"Event ended — log it?" (the background-task notice) is removed as planned (not moved).
