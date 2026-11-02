# Task 3 — Part B: navigation (order, Week → Calendar, phone tabs with More, Inbox badge, the owner's name)

Owner's words: «Порядок странный. Го так: Tasks (rename Now) -> Activity (rename Day) -> Calendar (rename Week) ->
Inbox -> Projects -> Insights -> History -> Settings», later decided: **Now and Day keep their names**; only Week
becomes **Calendar**. Phone tabs decided: **Now · Day · Calendar · Inbox · More**.
«У нас две кнопки в Inbox. Давай с Now уберем, оставим ток в сайдбаре. Там еще будет круто каунтер показывать для
количества неразобранных задач». «Еще можно брать имя из профиля тг, хранить его в профиле и показывать в статусе.
Типа в сайдбаре сверху Pace, а справа имя из профиля – Albert».

## Sidebar (apps/app/src/ui/sidebar.tsx DESTINATIONS)
Order: Now, Day, Calendar, Inbox, Projects, Insights, History, Settings. Calendar: href `/calendar`, label
`nav.calendar` (EN "Calendar", RU "Календарь"), icon CalendarRange. Remove `nav.week` key if unused after.
Inbox row shows a count badge (unsorted Inbox items: the same number Now's counter showed — see
apps/app/src/features/now/now-header.tsx `CounterButton` and what it adds up (inbox + review decisions); keep
that definition) — a small pill on the right of the row, hidden when 0; accessibility label includes the count.
Header: `PaceMark` + "Pace" on the left, the owner's first name on the right (muted, truncated with ellipsis).

## Rename Week → Calendar (code too)
Route `app/week.tsx` → the Calendar tab (see below), path `/calendar`; `features/week/*` → `features/calendar/*`
(git mv; rename components WeekScreen→CalendarScreen etc. where they name the screen; the week *grid* can keep
"week" names where it really is a week). i18n `week.title` → "Calendar" title (keep the eyebrow with the date
range). packages/client/src/view-models/week.ts may keep its name (it models a week) — your call, say which.
Update every link to `/week` (Day's week icon in features/day/day-nav.tsx, e2e specs, route-sweep e2e list,
readme-shots). Keep an expo-router redirect from `/week` to `/calendar`? No — breaking changes are allowed; no
redirect.

## Phone tabs (apps/app/app/(tabs)/_layout.tsx, apps/app/src/ui/tab-bar.tsx ICONS)
Tabs: index (Now), day (Day), calendar (Calendar), inbox (Inbox, with the same badge on its icon), more (More).
Move `app/inbox.tsx` into `(tabs)/inbox.tsx`; create `(tabs)/calendar.tsx`; create `(tabs)/more.tsx` + a
`MoreScreen` (apps/app/src/screens/more-screen.tsx): the owner's first name at the top, then a list of rows
(icon, label, chevron) to Projects, Insights, History, Settings. Projects, Insights, Settings stop being tabs:
move `(tabs)/projects.tsx`, `(tabs)/insights.tsx`, `(tabs)/settings.tsx` to stack routes `app/projects.tsx`,
`app/insights.tsx`, `app/settings.tsx` (same URLs). On a wide window (≥1024) the sidebar is the navigation and
More is never shown (the tab bar is replaced by the sidebar — check how `tabBarPosition: "left"` + TabBar
behave now and make sure Projects/Insights/Settings/History are still top-level sidebar destinations without a
back chevron: see `isSidebarPath`). Settings' "More" links (features/settings/settings-links.tsx: History on
narrow screens only) — History now lives in More, so drop it from Settings.

## Inbox counter off Now
Remove `CounterButton` from apps/app/src/features/now/now-header.tsx (and delete now-header if empty); the
review decisions it also counted must stay reachable: check where `/review` is linked from; if only from that
counter, add a row at the top of the Inbox screen ("N to review →") — say what you did.

## The owner's name
D1 `users` has `name` (first + last) — add `firstName` (text, nullable) in apps/api/src/shared/db/d1-schema.ts,
`bun db:generate`, commit the SQL. Set it from the Telegram Login Widget payload `first_name` and from the bot's
`ctx.from.first_name` on /start login (apps/api/src/auth/bot-login.ts, the widget sign-in path). `/api/me`
(find it in packages/core/src/api/endpoints.ts + its schema) returns `firstName` (nullable). The client already
fetches me somewhere (packages/client auth) — expose it to the app (a hook) and show it in the sidebar header and
on More. Tests: api int test that /api/me returns firstName after a widget login and a bot login; app test for
the sidebar header showing it.

## Tests
Update app tests and e2e specs that navigate (route-sweep, journeys, readme-shots, time/week). New app tests:
sidebar order (labels in order), Inbox badge shows the count and hides at 0, the phone tab bar shows exactly
Now, Day, Calendar, Inbox, More, More lists its four rows. `bun lint`, `bun test:unit`, `bun test:api`,
`bun test:app` green; run the e2e specs you changed (`bunx playwright test <files>`).
