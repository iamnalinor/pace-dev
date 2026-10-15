# Task 5b — apps used during an activity; the day's screen time on Day

Owner: «в рамках каждого Day или Week (давай вернем название Calendar обратно в Week, я понял что это про активность а не про
календарь) мы можем тыкнуть на каждую из активностей и посмотреть какие аппки я юзал во время этой активности. в Day так же внизу
можно посмотреть статистику по экранному времени за этот день - списком приложений, отсортированно».
(The rename back to Week is done in Task 5.)

Data: usage sessions per device (app, start, end, device) in the user DO (`usage_sessions`), uploaded by the phone (~30 min) and
desktop agents (5 min); the client reads them through an existing endpoint (find how Day's "where I sat" and Week's usage strip
fetch them — packages/client view-models day/week and the cloud/usage endpoints) — reuse, don't duplicate.

1. Apps during an activity: tapping an activity row on Day, or a tracked block on Week, opens its details (Week: the details pane
   from Task 5 / a sheet on phones; Day: the same details component — pane on a wide window, sheet on a phone) with a section
   "Apps during this" (EN) / «Приложения за это время» (RU): apps used within the activity's span, summed per app across devices,
   sorted by time desc, each row: app name, device icon(s), duration, a thin proportional bar; "Nothing recorded" when empty; a
   note when a device's data is not uploaded up to the activity's end yet ("Phone data up to 14:30"). Replaces the old one-line
   "where I sat" if that becomes redundant (keep one place).
2. Screen time on Day (bottom of the Day list): "Screen time" section for the shown day: total per device (phone / each computer),
   then the app list sorted by time desc (app, devices, duration, bar), first and last use of the day; collapsible after the top 8
   ("Show all N"). Counts only active time (the agent/phone already send active sessions). Midnight-spanning sessions are split at
   the day boundary in the account's zone.
3. A pure view-model in packages/client (`appsDuring(usage, span)`, `screenTime(usage, day, zone)`) with edge-fixture tests (bug
   classes 4 and 9: zero sessions, one, overlapping sessions on two devices, a session crossing the span edges, crossing midnight,
   zone change). App tests for both UIs. Strings EN + RU.
`bun lint`, `bun test:unit`, `bun test:app` green.
