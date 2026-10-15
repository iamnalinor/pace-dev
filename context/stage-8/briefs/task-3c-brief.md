# Task 3c — bug: "Attend" on a calendar event refuses with "That time is in the future."

Owner: «пришел пуш "посетите коллоквиум?" а приложение не хочет отмечать что я посещу: "that time is in the future"».
The Android local reminder fires as a calendar event starts (apps/app/src/platform/notifications.ts syncCalendarReminders,
apps/app/src/shared/tracking/calendar-reminders.ts); a tap opens Now where the event waits with Attend / Skip (find the
"attend" action in packages/client/src/actions and the UI offering it, and the Calendar time-bar button which starts "the
event on now or within 15 minutes"). Attend fails with `retro/future` (core retro rules).
Root cause first (systematic debugging): find which instant is in the future (likely the activity is started at the event's
start when the event starts a few seconds/minutes after now — the reminder can fire slightly early, and the Calendar button
offers events up to 15 minutes ahead). Fix in the client action (not by loosening core's retro rule): an event attended
before its start starts the activity now (and keeps the event link / expected end at the event's end); attended after its
start keeps the event's start (as today). Same for every path that attends an event (Now's offer, the Calendar button,
the picker). Tests (TDD): client unit test attending an event starting in 2 minutes succeeds and starts at now; starting
10 minutes ago starts at the event's start. `bun lint`, `bun test:unit`, `bun test:app` green. Commit "Attending an event
that has not started yet starts it now instead of refusing".
