# QA round 18 — design overhaul, batch 1+2 (tokens v2, direction A · Тетрадь)

Tester: exploratory Playwright pass (Chromium) on a fresh export of branch HEAD `270cd88`, served on :4176 against a fresh Worker on :8790 (`--persist-to .cache/qa-state`, `ENVIRONMENT:test`, `LLM_PROVIDER:fake`, ids 4100–4110 plus 3300–3340 for the design-shots run). Accounts: lived-in RU (`seedLivedIn`, 4101/4107/4109), fresh EN (4102–4106, 4108, 4110). Scripts and screenshots: `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/qa18/` (below `S/`): `S/sw/` 128 route screenshots (16 routes × 1440/390 × light/dark × RU/EN), `S/shots/` the repo's own design-shots matrix (343+ PNGs, all 8 combos, 8 tests passed), `S/c/` single-case shots, `S/p/` montages. Both servers (:8790, :4176) are stopped at the end; the repository was not touched except this file (Playwright wrote only to git-ignored `test-results/` and `.cache/`).

Covered: every route at 1440×900 and 390×844, light/dark, RU/EN (console, failed requests, raw keys, horizontal overflow checked on each load: **0 console errors, 0 failed/4xx requests while signed in, 0 raw keys, 0 horizontal overflow**); axe WCAG 2.2 AA over 12 routes × 8 combos: **0 violations**; the design-shots states (composer form, assistant preview/question, pickers, sheets, toasts, offline, sessions, focus ring); composer (typed + Enter, Approve, To Inbox button and Alt+Enter, N, empty submit), task pane (slider drag, Done, repeating task, tooltips), Day (Log past sheet, empty submit, Escape), time-bar pickers (Calendar, Task, Chores, Rest, Escape), Inbox, Settings (Tab order, switches, chips), Projects form, log out (IndexedDB before/after), a refused local write (IndexedDB `add` forced to throw), theme-before-bundle with the bundle delayed 2.5 s (4 OS × app combos), theme-color under a sheet, guest login in RU/EN locales, Mac hotkey hints, long unbreakable titles and emoji, round 17 findings re-run, tap latency at 4× CPU with touch (23 cases).

Not testable here (stated, not guessed): Android-only flows; the service-worker "new version" bar; the Telegram login widget (it says "Bot domain invalid" on localhost, unstyled serif text inside the card, an environment effect, not rated); the MCP URL shown in "Connect an AI app" reads `http://localhost:8787/mcp` because the Worker's `API_ORIGIN` var is 8787 in this config (environment, not rated). The machine was shared (load average 6–14 during the latency run), so latency numbers are upper bounds.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 10 |
| low | 14 |
| cosmetic | 5 |

Medium: R18-01 the new "refused write" sentence is clipped in its toast; R18-02 log out leaves a 401 storm and a wrong "signed out on another device" notice after reload; R18-03 to R18-08 are round 17 mediums that are **still open** (cold URL of Inbox/More/Day, second tab stale, first-sync empty states, no offline indicator, share target drops text, no tooltips on icon buttons); R18-09 taps over 100 ms that are not on the team's known list; R18-10 wide controls on a computer (owner's "buttons too wide on PC").

What this batch got right is at the end; the new theme, formatter, switch, chip, badge and rollback work is clean apart from R18-01.

## Findings

### R18-01 medium — The new "refused write" sentence is cut off in its toast
Now, 1440 light RU (the toast column is the same on every width). Script `S/r1.ts`, screenshots `S/c/r1-1800.png`, crop `S/c/r1-toast.png`, montage `S/c/r1m.png`.
Steps: sign in on the lived-in RU account, open Now, make local writes fail (`IDBObjectStore.prototype.add` throws `QuotaExceededError`), tick the first task's check circle.
Happened: the row dissolves at once (optimistic, good), is back after about 0.5–0.9 s (rollback, good) and a toast appears in the sidebar column (about 200 px wide, bottom left): «Не удалось сохранить это на устройстве, поэтому ничего не изменилось. Попробуйте ... снова» is cut on the 4th line («Попробуйте ...» then «снова» sliced in half). Same box for every toast (the "Created task “Buy milk tomorrow 18:00 30m”" toast wraps to 3 lines, `S/c/b1-hover-edit.png`).
Should: the sentence that explains a rolled-back tap must be fully readable: let the toast grow (or take the content width on a computer, the bottom edge of the page on a phone), no mid-sentence ellipsis.
Class: bug-lessons 58 (text from data in a flex row without a shrink/size rule) for the toast; the refusal path has no test that reads the whole sentence. Guard: an app test that renders `actionError.persist_failed` in both languages in the toast and asserts no `numberOfLines` clipping; e2e with the IndexedDB stub above.

### R18-02 medium — Log out: a 401 storm, then a wrong notice after reload
Settings, 1440 light, account in EN browser. Script `S/l1.ts`, screenshots `S/c/l1-before.png`, `S/c/l1-after.png`.
Steps: Settings → Log out (no confirm), watch console; then reload.
Happened: the wipe itself is right (IndexedDB `events` 44 → 0, `meta` 3 → 0, `pace.session` removed, `/login` after about 0.3 s). But the revoked token is still used afterwards: `GET /api/me` 401, `GET /api/calendar` 401 ×4, `GET /api/sync/pull?since=0` 401, `GET /api/notifications` 401, each with a console error. After a reload the login page prints «You were signed out: this session was ended on another device, or it expired.» although the person logged out on purpose.
Should: after a deliberate log out nothing calls the API with the old token and no "ended elsewhere" notice is stored (the notice is for a remote revoke only).
Class: bug-lessons 1 / 24 (device state survives an account switch): the 401 handler cannot tell a sign-out it caused from one it suffered. Guard: an e2e that logs out, waits 2 s, asserts zero 4xx and that a reload shows no notice.

### R18-03 medium — Still open (R17 M2): a cold URL of a tab screen is rewritten to `/`
`/inbox`, `/more`, and (fresh browser context) `/day`, 1440 and 390, every theme and language. Script `S/b2.ts`, sweep `S/sweep.out`.
Steps: sign in, open `http://localhost:4176/inbox` directly (or press F5 on Inbox).
Happened: Inbox shows (title «Inbox · Pace») but `location` is `/`; the next reload lands on Now. `/more` shows Now's title on desktop and `/`. In the sweep (same tab, already warm) `/day` kept its URL, a cold `/day` did not (`direct /day -> http://localhost:4176/`).
Should: the address stays and a reload returns to the same screen. Guard as in round 17: `route-sweep.e2e.ts` asserts `page.url()` after a cold load of every tab screen.

### R18-04 medium — Still open (R17 M1): a second tab of the same profile is stale
Now, 1440 RU. Script `S/r17b.ts`. Tab A adds a note with Alt+Enter (A shows «Входящие 1»); tab B (same context, opened before) stays without the badge after 3.5 s and after being brought to the front. Same cause as round 17 (one device id, one IndexedDB, in-memory state not rebuilt). Guard: a two-page test in `live.e2e.ts`.

### R18-05 medium — Still open (R17 M4): the first sync shows definitive empty states in the browser's language
Now, 1440 light, RU account in an EN browser, empty IndexedDB, `GET /api/sync/pull` delayed 3 s. Script `S/r17b.ts`, shots `S/c/m4-500.png` … `m4-4200.png`.
Happened: for the whole wait (and for the second delayed page) the screen reads «Nothing to do right now.» in English, with the sidebar in English, then switches to Russian with the tasks. No skeleton, no "Syncing…". The owner asked for skeletons while loading (feedback 4).
Should: no empty copy while the store has never completed a pull; the account's language only once known.

### R18-06 medium — Still open (R17 M5): nothing says "offline" or "not synced yet"
Now, 1440 EN. Script `S/r17.ts`, shots `S/c/r17-offline.png`, `r17-offline2.png`. With the network off for 1.5 s and after adding a note offline there is no banner, dot or toast about connection or the outbox (only the local «Added to Inbox»); `errors.offline` still exists and is used nowhere in `apps/app`.

### R18-07 medium — Still open (R17 M3): the PWA share target drops the shared text
`/add?title=Article&text=look%20at%20this…&url=https://example.com/a`, 1440. Script `S/r17.ts`, shot `S/c/r17-share.png`. Result: New task form open, every field empty, location `/`. The manifest still declares `share_target`; the web build never reads the query. (Owner, feedback 4: "share a text to Pace like a new task".)

### R18-08 medium — Still open (R17 M7): icon-only buttons have no tooltip and no visible name on a computer
Task pane header (Edit details, Pause, Cancel or skip the task…, Delete the task), 1440 light EN. Script `S/b1.ts`, shot `S/c/b1-hover-edit.png`. Hovering each for 0.7 s: the page holds four `[role=tooltip]` nodes but all are empty and nothing is drawn. The ⏸-like glyph still reads as "columns" and sits next to "Focus" in the footer (a stopwatch), so a mouse user cannot tell which is Pause. The owner's own rule (feedback 3/4): hint instantly on hover.

### R18-09 medium — Taps over 100 ms that are not on the team's known list (4× CPU, touch, 390×844, Event Timing, p75 of n taps)
Script `S/lat.ts`, raw numbers `S/lat.out`. Shared machine, so treat as upper bounds.
| tap | p75 / max ms |
|---|---|
| Day previous / next day | 224 / 200 (max 224) |
| Week previous / next week | 208 / 176 |
| Day "Log past activity" (sheet opens) | 216 |
| Settings theme chip (Light / Dark) | 160 / 168 |
| Time bar "Start something else" / Rest picker opens | 152 / 152 |
| New task button (form opens) / form close | 144 / 120 |
| Inbox tab / More tab | 128 / 128 (inside known range) |
| open row | 208 (max 264; known 150–190) |
| back from task | 176 |
| chip Алгебра / Все | 192 / 200 (first tap 304) |
| check-off | 232 (max 256) |
| switch toggle | 104 |
Everything above 100 ms is a finding by rule; the day/week stepping, the sheet and picker opens, the theme chip and the form open/close are not on the owned list. The switch (104 ms) is the only new-kit control and is within noise of the budget.

### R18-10 medium — Wide controls on a computer (owner: "buttons too wide on PC", feedback 4)
Inbox at 1440 (`S/c/b2-inbox.png`, `S/c/b2pair.png`): the content column is about 1000 px, the two rows' Accept and Delete are about 480 px each. Settings at 1440 (`S/sw/ru-1440-light-settings.png`): digest time fields are 868 px wide for «09:00», Quiet hours From/To 454 px each, the notifications matrix is pinned right while labels sit far left. Should: cap action buttons and time fields to their content (a kit width rule), not the column.

### R18-11 low — Phone Now: two running activities plus the time bar eat a third of the screen
Now, 390 light/dark RU (lived-in, `S/sw/ru-390-light-now.png`, `S/shots/states/now-composer-form--phone-light-ru.png`). With "Still doing this?" and a parallel activity the running tray, the Start-something-else row and the tab bar take about 270 of 844 px, so an open New task form shows three fields and the list shows two rows. The form cannot be seen whole without scrolling inside a 250 px window.

### R18-12 low — Week and Insights headers on a phone: three chevrons that look the same; clipped day column
Week 390 EN/RU (`S/sw/en-390-light-week.png`, `S/sw/ru-390-light-week.png`), Insights (`S/sw/en-390-light-insights.png`): a Back chevron, then Previous/Next period chevrons in the same style, so "back" and "previous week" are indistinguishable; the sixth day column is cut («6 Fr», «пт, 6») and Saturday/Sunday exist only sideways, shown by the small hint «Swipe to see all days» at the very bottom of the screen, 700 px away from the columns. Needs a visible cue next to the grid and a focus target for keyboard users.

### R18-13 low — Screen titles differ in size and position between phone screens
390 EN (`S/p/en-390-b.png`): Projects uses a 32 px title at y≈48 with a back chevron, History and Notifications a 24 px title at y≈37, Day/Week/Insights a 32 px title below an eyebrow, Inbox a 32 px title with no eyebrow and different left margin. One header component should decide.

### R18-14 low — History keeps a "Now" button while already at now
History, 390 and 1440 (`S/p/en-390-b.png`, `S/sw/ru-1440-light-history.png`): a bordered pill «Now»/«Сейчас» sits left of the arrows when the shown moment is now. The owner asked (feedback 4) for a reset button only when away from today (Day and Week already do this).

### R18-15 low — Forms: the Projects form gives no focus, no message and no Escape; the New task form is silent on an empty title
Projects → New project, 1440 and 390 (`S/w1.ts`, `S/c/w1-proj-390.png`): focus stays on `<body>`, Enter on the empty name does nothing, Escape does not close it (R17 L6, unchanged). New task form: Ctrl+Enter or Create with an empty Title does nothing and says nothing (the Create button only looks faded), while the Day sheet says «Say what it was.» for the same situation.

### R18-16 low — Calendar picker still points to «Settings → Devices»
Time bar → Calendar, 1440 EN (`S/c/tb1-pick-Calendar.png`): "Nothing on today in the calendar your phone sends (Pace on Android, with the calendar on in Settings → Devices)". The section is «Devices and sessions» (R17 L3). The text is also long for a "nothing here" line; the owner asked for "just that there are no events nearby" (feedback 4).

### R18-17 low — Unknown task and unknown route (R17 L11)
Dark RU focus shot `S/shots/focus/task-tab10--desktop-dark-ru.png`: «Такой задачи нет.» under a «Без проекта» back header (a project picker context for a task that does not exist); `/no-such-page` has `document.title` «Pace» only (sweep, `S/sweep.out`).

### R18-18 low — RU Insights wraps mid-word at 390 (R17 L12)
`S/p/ru-390-dark-b.png`: «Переключени / й в день»; the "Насколько дробилось время" stat boxes also wrap «Блоки фокуса короче 15 мин» to four lines. "Focus by hour" renders an empty plot with only the axis and no empty message.

### R18-19 low — Notification matrix: «Телефон» in RU, «App» in EN (R17 L13)
Settings → Notifications, headers EN "App" / RU «Телефон» while the switches' names use "App" in EN (`Sign-ins in App`).

### R18-20 low — Settings: two ways to end this session, and switches with identical names
Settings, 1440 EN (`S/p/settings-en.png`, `S/k1.ts` output): "Dev login · Developer sign-in · This device" has a Revoke button and the page has Log out below it (one way per job; revoking the current session is also a footgun that Log out explains better). The three consecutive per-category estimate radios all have the accessible name "Estimate: No estimate" (the category is not in the name), and "Show night hours" has a hint ("Week shows the whole day, from 00 to 24.") that describes only the ON state.

### R18-21 low — Toast copy and position (R17 L5)
Toasts sit in the sidebar column (about 200 px), wrap to 3 lines and cover the end of the nav on a computer; on a phone the delete toast («Удалено: …Отменить», `S/c/ph1m.png`) sits over the list right above the running tray. Different paths still give different feedback: the form's Create and a picker's start show nothing in some paths (round 17).

### R18-22 low — Time-bar picker copy
Rest list in RU: «Дрёма» for Nap (archaic; «Дневной сон» reads as the activity), a picker titled «Отдых» whose second item is «Отдых». Close sheet button «Закрыть как «Отменена»» (agrees with «задача», but reads as a status, not an action).

### R18-23 low — Blank page until the bundle loads; the manifest is dark only
`S/t1.ts`: with the bundle held back 2.5 s the page is a flat ground colour (correct colour, no logo or progress mark). `manifest.webmanifest` has `theme_color` and `background_color` `#0d0f15` only: a light-theme person installing the PWA gets a dark splash and a dark Android status bar until React mounts (R17 L9 is fixed for the browser tab, not for the installed app).

### R18-24 low — The notification bell is reachable from Now only on a phone
Phone tabs hold Now, Day, Inbox, More; the bordered bell exists in Now's header only (`S/sw/en-390-light-*.png`). Notifications has no entry in More, so a sign-in notice cannot be reached from any other screen.

### R18-25 cosmetic — Visual misalignments
- The selected task row's fill is 8 px wider than the composer above it (`S/c/b1-hover-edit.png`: row 256–799, composer 264–791).
- Task pane: the Progress card is 4 px wider on each side than the Start/Due card above it.
- With the assistant preview open the composer is a card inside a card (outer focus ring plus inner border) — F-LAY-05 in the spec says not a card in a card (`S/c/a1-after-enter.png`).
- Sidebar header: avatar chip «D» followed by the name «Dev», so the initial is shown twice; gap between logo, chip and name is uneven.
- Inbox explanation is 11 px, three lines on a phone, and mixes quote styles («“Принять” … «Удалить»»).

## Round 17 findings: state

| Id | State |
|---|---|
| M1 second tab stale | **open** (R18-04) |
| M2 URL rewritten to `/` | **open** for Inbox/More and cold Day (R18-03); `/week`, `/projects`, `/settings` keep theirs |
| M3 share target | **open** (R18-07) |
| M4 first-sync empty states | **open** (R18-05) |
| M5 no offline indicator | **open** (R18-06) |
| M6 name cut to one letter | **fixed** (sidebar shows «Dev» in full; avatar duplicates the initial, R18-25) |
| M7 no tooltips | **open** (R18-08) |
| L1 versions screen "Reload" | not re-run |
| L3 stale «Settings → Devices» | **open** (R18-16) |
| L5 toast narrow | **open** (R18-01, R18-21) |
| L6 projects form focus/Escape | **open** (R18-15) |
| L7 deadline type with no deadline | **open** (the New task form still shows "Deadline type" with "No deadline", `S/c/tb1-n-empty-submit.png`) |
| L9 browser colours follow the in-app theme | **fixed** for page ground, `color-scheme`, `theme-color` (all four OS × app combos, `S/t1.ts`); the manifest stays dark (R18-23) |
| L10 time-zone card cannot be dismissed | not re-run (the lived-in account did not show it in this zone) |
| L11 unknown task | **open** (R18-17) |
| L12 RU Insights wrap | **open** (R18-18) |
| L13 App/Телефон | **open** (R18-19) |
| L8 axe target-size on Week | **fixed** (axe: 0 violations in 96 route loads) |

## Owner requests: not met or only partly met

- Feedback 4 "buttons are too wide on a computer": Inbox Accept/Delete and Settings time fields (R18-10). Disconnect/Revoke and Export are fine.
- Feedback 4 "icon hints instantly on hover" for the icon buttons: only the composer buttons and the Calendar button have them (R18-08).
- Feedback 4 "skeletons while loading": only Devices and sessions has them (R18-05).
- Feedback 4 "share a text to Pace as a new task": the PWA share path drops the text (R18-07).
- Feedback 4 "the reset-to-today button only on weeks/days that are not ours": History still shows «Now» at now (R18-14).
- Feedback 4 "the message that popped up in an unclear place and late": toasts are still 200 px boxes in the sidebar column with clipped text (R18-01, R18-21).
- Feedback 3 "the filter «All» that filters nothing": with one project the chips are «All + Work», fine; with none the chip row is absent (checked, met).
- Met in this build: name from the Telegram profile in the sidebar; Inbox only in the sidebar with a counter (now a red badge); week does not scroll the page on a computer and has a night-hours switch; slider follows the finger live in percent; sheets are centred on a computer and slide from the bottom on a phone (closing on the dim and Escape); Export data/Log out/Danger zone order; Telegram sign-in notice in the notification feed; the sidebar order Now, Day, Week, Inbox, Projects, Insights, History, Settings.
- Direction A (ink-blue accent) was chosen by the owner (spec STOP 1): the earlier "bring the green back for the one important action" is superseded, not a gap.

## Heuristics walk (docs/qa.md "The prompt")

Breaches, each already a finding above: every control earns its place (R18-20 Revoke vs Log out; R18-24); one way per job (R18-20); platform conventions (R18-03 URL, R18-08 hints, R18-15 Escape); keyboard on a computer (Tab order is sound: bell, New task, nav, theme, language, switches, inputs, estimates; Space and Enter both toggle a switch, Space toggles a chip radio; focus ring is solid 2 px in the focus colour on every button, switch, chip and link — **text inputs show no outline** (`outline: none`, a darker border only, `S/k1.ts`: `Digest time 1`, `From`, `To`) which is acceptable only if the border change passes 3:1; not measured); state you can see (R18-05, R18-06, R18-14, R18-20); feedback and motion (R18-01: the sentence you need after a rollback is unreadable; the dissolve and the rollback themselves are smooth and nothing snaps back for more than a frame); copy (R18-16, R18-22, R18-20 hint); color (the 13-hue chips: unselected chips keep their hue border, a selected chip becomes the one solid accent, so a selected «Sleep» loses its category colour; two greens next to each other in the time bar — Task and Rest — mean different things); forms keep their promise (R18-15; composer typed+Enter, Approve, To Inbox button, Alt+Enter, N, Day Log past, Close-as sheet all accepted what the enabled button offered); overlays in context (R18-21); visual matrix (R18-18 the only wrap/contrast issue in 128 shots; axe clean); responsiveness (R18-09); guest language and sideways content (login `lang` follows the browser: «Вход в Pace · Pace», `ru`; Week's sideways region on a phone has a hint but it sits at the bottom, R18-12).

## What works well
- The theme is set before the bundle: with the bundle delayed 2.5 s all four OS × app combinations paint the right ground, `color-scheme` and `theme-color` at once; under a sheet `theme-color` dims (#f4f5f9 → #a9aab1, #0d0f15 → #060709) and returns on close.
- 128 route loads, 0 console errors online, 0 raw keys, 0 horizontal overflow, axe clean over 96 loads; long unbreakable titles and emoji clip with an ellipsis on Now and wrap on the task screen without overflow.
- A refused local write is handled in the right order: the row dissolves immediately, comes back, a sentence says nothing changed (only its box is wrong, R18-01); sign-out empties IndexedDB (44 → 0 events) through the queue.
- The kit switch (52 wide, 48 tall hit area): visible knob in both states, Space and Enter toggle, focus ring in the focus colour; selected chips (solid accent, white text in light, dark text on lavender in dark) read clearly; the Inbox badge is a red numeral badge in both themes.
- RU numbers and durations read natively: «2 ч 01 мин», «осталось 23 ч 59 мин», «2 дн 23 ч», «4 дн назад», «1,0», «1 задача»; plural forms on Projects are right.
- Phone sheets slide from the bottom and close on the dim; desktop dialogs are centred with ✕ and Escape; the progress slider follows the finger and shows a live percent.
