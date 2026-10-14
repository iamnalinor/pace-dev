# Task 8c — notifications on phones without Google: a periodic background check (no foreground service)

Owner: FCM where possible; otherwise no persistent connection and no ongoing notification («отдельное уведомление это противно.
давай без него») — a periodic background check: «ок, делаем так. плюс юзер и так часто в аппку заходит, так что почему нет».
Show the battery-optimization step only when FCM is not used. UnifiedPush is dropped.

Builds on Task 8/8b (pool, `PushTransport` registry, one push method per device, server-advertised `pushMethods`, delivery log).
- Methods: `fcm` | `poll` | `none`. The app picks `fcm` when the server lists it and Google Play services give a token, else `poll`.
  Settings → Notifications picker: Google / Background check (every ~15 min) / Only while the app is open.
- `poll` on Android: the existing background task (expo-background-task / WorkManager, minimum interval ~15 min; see
  apps/app/src/platform/phone-background.ts) asks the server for undelivered pool items for this device
  (`GET /api/notifications/pending?device=…` — or reuse the feed endpoint with a since-cursor) and dismissals since the last check,
  shows them as system notifications (pool id as identifier) and cancels resolved ones; the server marks them delivered via `poll`
  in the delivery log. While the app is open, the live socket delivers instantly (as Task 8 built). Nothing is computed or scheduled
  locally — the phone only displays what the server already created.
- Server: `poll` is a transport whose `send` just records the item as pending for that device (no network push), and `dismiss` records
  the dismissal; `pushMethods` lists `poll` always and `fcm` when configured.
- Permissions walk-through: only when the method is `poll`, a step "Let Pace check in the background" → the battery-optimization
  exemption (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS; vendor autostart page when detectable), one line why: "notifications arrive
  within ~15 minutes instead of hours". With `fcm` working, the step is not shown. Settings shows the same hint under the picker while
  `poll` is chosen and the exemption is missing.
- No foreground service, no ongoing notification, no UnifiedPush (remove any placeholders).
Tests: method selection, the pending/dismissed fetch and display by pool id (mocked expo-notifications + background task), server
records for poll deliveries, the permissions step only for `poll`. Docs: README/self-hosting — without Firebase, notifications arrive
within ~15 minutes via the background check, instantly while the app is open, and in Telegram.
