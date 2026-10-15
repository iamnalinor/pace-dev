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
