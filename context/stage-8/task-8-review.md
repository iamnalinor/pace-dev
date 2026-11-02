# Task 8+8b review (f2271a0..41f1aea) — Needs fixes
(Full reviewer text was delivered to the controller; this is the actionable digest.)

## Important
1. Strict payload schemas the client parses (core notify/pool.ts:10-52: LoginPayload, DigestTask, DeadlineDigestPayload, EventStartPayload, ActivityOverrunPayload are z.strictObject; NotificationSchema :102-111 nests them; used by NotificationsOutputSchema, ResolvedNotificationSchema, PollShowSchema, LiveNoticeSchema). Closed response enums brittle too: PushMethodsSchema, DeliveryEntrySchema.result, RESOLUTIONS. Fix: loose z.object for outputs (strict only for input), tolerant enums / client filters unknown values; API tests parse via endpoints.notifications.*.output (notify.int.test.ts:345,384,394,621,629,640,650 use json<T>() casts); client test with extra keys.
2. "Attended?" decided differently: server isEventTracked (pool-pass.ts:85-95) 10-min lead + raw event.title vs label; app isAttendableNow/Calendar button 15 min; client cuts label to 80. Failures: attend 11-15 min ahead → server still announces event_start; title 81-200 chars never matches. Fix: ONE predicate in core (the branch now has client `isCalendarRun` + `activityLabel` + `CALENDAR_LEAD_MINUTES` in packages/client/src/actions/calendar-run.ts — move them to core and use them from client, app and poolPass). Boundary tests −16,−15,−11,−10,0 min + title > 80.
3. Server Attend writes unclamped label (notification-pool.ts:241-271) and Expect can exceed 1440 → prepareBatch refuses event/invalid; Telegram buttons removed, no retry. Fix: same shared helpers; fast-check over title length and event length.
4. Any 401/403 from FCM messages:send → 'auth' → markBroken for everyone until key changes (fcm.ts:199-203, registry.ts:66-82). SENDER_ID_MISMATCH / INVALID_ARGUMENT on one token = dead device (gone). 401 → retry once with fresh token. Broken mark gets an expiry/re-check. Test each path.
5. Day's Skip (phone-section.tsx:215-219) only dismisses locally; only Now calls POST /api/calendar/skip; Day ignores answeredEventKeys. Fix: Day's Skip via notifications.skipEvent; Day filters with answeredEventKeys; test every entry path.
6. Phone answer button dismisses before resolve is saved (push-task.ts:216-221, app-state.tsx listener ignores false from feed.resolve). Fix: dismiss after success; on failure keep/re-show with "did not go through"; test with rejected resolve.
7. Settings push-method picker missing: stored manual choice fcm|poll|none (only methods server accepts + none); registerPush honours it, falls back only when refused.

## Minor
- Delivery log: include Telegram attempts; keep sent time on dismissal (delivery-rows.ts:103-108); log skipped/broken pushes (notification-pool.ts:147-153).
- settings.push.poll copy promises ~15 min while 8c doesn't exist — reword until then.
- insertNotification (pool-rows.ts:59-82) doesn't validate against PAYLOAD_SCHEMAS → notify() throws; clamp/validate → Result.
- Size limits: digest Telegram text (4096) and FCM data (4 KB) unbounded (notify-text.ts:55-66).
- pool-service.ts:161-162 settles before inserting events → insert first.
- run() saves memory before inserting; mid-loop throw loses items and skips drainParses in alarm().
- No unique index on push_subscriptions.session_id; subscribe deletes matching (transport, endpoint) across users.
- reported prune (pool-pass.ts:245-248) keeps keys for closed tasks.
- Feed groups days in settings.timezone but screen formats in clock.deviceTz — one zone.
- PushStatus reads method once on mount (class 8).
- ANSWER_IDS duplicates ANSWERS/RESOLUTIONS (notifications.ts:173).
- Orphaned doc comment push-task.ts:202-206.
- calendar.skip hard-codes origin "app" (notify-routes.ts:116-121).
- Dead preset fields criticalHours/criticalProgress/inProgressIdleDays still in the preset editor.
