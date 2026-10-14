# Task 3d — Now's calendar prompt on Android: "That time is in the future." and the card drawn over the task rows

The owner, on the Android app (release v0.9.0, built from 4cf543f — the code then is close to today's for these paths), sent a
screenshot (/home/user/pace-dev/.superpowers/sdd/root-claude-uploads-cb223545-7465-5720-iridescent-cat/now-attend-android.jpg — LOOK
AT IT) with «ui разьебался»: on Now, phone time 13:47 (the owner lives in Moscow, UTC+3), the calendar prompt for an event
«Коллоквиум по матанализу» (its time line reads like «12:15–15:20», i.e. an event already in progress) is drawn ON TOP of the first
two task rows (texts overlap, the Attend/Skip buttons sit over the second row), and pressing Attend shows the toast «That time is in
the future.». The previous fix (Task 3c, commit 23fae59) concluded Now's path (CalendarPrompt → actions.startCalendar, which starts
at min(event start, now)) could not produce retro/future — the owner's screenshot proves it can. So the root cause is still open.

1. Root cause of retro/future on Now's Attend (systematic debugging — reproduce before fixing):
   - Reproduce in a test with the device zone Europe/Moscow and the system clock 13:47 local, an event 12:15–15:20 local as
     expo-calendar returns it on Android (`startDate`/`endDate` may be strings without an offset, numbers, or Date — check
     apps/app/src/platform/phone-calendar.ts `new Date(event.startDate).toISOString()` and what expo-calendar's Android module returns;
     check calendar-source / calendar-today and the server's calendar copy for zone handling), and with an activity possibly already
     running. Hypotheses to test, not to assume: a local-time string parsed as UTC (3 h shift → "future"); `since` (the running
     activity's start) or another instant later than now; the device clock vs the event's instants; a series rule auto-log; the
     retro/future check in core (find every place returning "retro/future", incl. activity validation, and its FUTURE_TOLERANCE).
   - Fix the root cause (not by loosening the rule). Tests at the level that reproduces it, with fast-check offsets around now AND a
     non-UTC zone (bug class 9: add "zones other than UTC" to the class rule in context/bug-lessons.md if this turns out zone-related).
2. The prompt drawn over the rows (Android): find why the CalendarPrompt card overlaps the list rows on Android (absolute
   positioning, a negative margin, Reanimated layout/entering animations on Android, FlatList cell measurement, a key collision —
   reproduce in the web build at phone width first; if it only happens on Android, reason from the RN layout code and fix the
   construct that differs). Add a guard per bug class 5 (an e2e geometry check that the prompt's box and the first row's box do not
   intersect, phone width) and/or an app test of the structure.
3. Also fold in the Task 3c review follow-up: after attending an upcoming/ongoing event, Day's row must flip to "logged"/answered
   (apps/app/src/features/day/use-day-phone.ts `isCalendarLogged` compares row end with event start; a running activity started at now
   has end == now) — hide Attended/Skip once answered; a second tap must not restart it. Test.
4. Record both bugs in context/bug-lessons.md (why the previous fix and the tests missed them — note that the Task 3c sweep checked
   only offsets in UTC and never the real Android event shape — the class, the sweep, the guard).
`bun lint`, `bun test:unit`, `bun test:app` green; run the e2e you add/touch.
