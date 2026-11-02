# QA round 17 — phase C part 2 (automatic sleep on the server, sessions, versions screen, re-pull)

Tester: exploratory Playwright pass on a freshly built web build of branch `ccr-412ef4ac-0q2r7c` (HEAD `4140eb6`, PR #48), served on :4191 against a fresh Worker on :8791 (`--persist-to .cache/qa-state`, `ENVIRONMENT:test`, `LLM_PROVIDER:fake`, own `ALLOWED_TELEGRAM_IDS` 7000–7039). Accounts: lived-in RU (`seedLivedIn`, id 7001), fresh EN (7002), EN with an automatic night plus tasks (7003), EN with a running night sleep and an own live start at 01:00 (7004), 7005 for session revocation. Scripts and screenshots: `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa17/` (below `S/`). Both servers were stopped at the end; the repository was not touched except this file.

Matrix covered: every route of `apps/app/app` (16 URLs) at 1440×900 and 390×844, light and dark, RU (lived-in) and EN (fresh) = 128 screenshots (`S/sw/`), with console errors, failed requests, raw message keys and horizontal overflow checked on each load: **0 console errors, 0 failed or 4xx/5xx requests online, 0 raw keys, 0 horizontal overflow**. axe (WCAG 2.2 AA) over 13 routes in the same matrix: only one rule fires (low L8). Interactive passes: composer (typed + Enter, send, + over a typed line, + over an empty line, N, paste, To Inbox, `/add`), the form, edit sheet, close sheet, time bar (Calendar, Task, Chores, Rest pickers, typed line, approve, Stop), Day (gap Log, Log past, edit, sleep block), Week, Insights, Projects (new, duplicate), Presets, Inbox, History, Settings (theme, language, switches, digest times, sessions, Add a computer, Connect an AI app, revoke confirm), notification feed, 404s, login, versions screen, offline, second tab and cold-load behaviour.

Not testable on the web (stated, not guessed): the server's sleep pass itself. The dev login makes a `dev` session, never an `app` session, so a web test cannot upload phone `uses` that the server accepts as a phone's (`isPhone` is false; the upload is stored but no pass runs). I therefore wrote the events the pass writes (system-sourced `activity.started` / `activity.stopped` with the real `sleepStartId` / `sleepStopId` ids) and checked what the screens do with them. Also Android-only: the notification method picker, "Background check", the battery step, "Change server" (the web login has no such line, correct by design).

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 7 |
| low | 16 |

Medium:
- **M1** A second tab of the same browser profile never receives the first tab's changes (until reload).
- **M2** A tab screen opened by URL (`/day`, `/inbox`) rewrites the address to `/`; the next reload lands on Now.
- **M3** The PWA share target (`/add?text=&title=&url=`) throws the shared text away.
- **M4** The first sync of an empty local store shows final empty states ("Nothing to do right now", "No projects yet", …) for as long as the pull takes, and in the browser's language, not the account's.
- **M5** No offline / not-yet-synced indicator anywhere (the key `errors.offline` exists and is never used).
- **M6** The signed-in name in the sidebar is cut to one letter ("D…", a 23 px box, no tooltip).
- **M7** The task header's icon-only actions (Edit, Pause, Cancel or skip, Delete, Close) have no tooltip and no visible name on a computer.

Round 16 findings re-tested: L2 (remote revoke), L3 (Escape on the confirm) and L4 (list not live) are **fixed**; the feed stays quiet; M1 (focus after "Not me") and L1 (half-open socket) were not re-run (table below).

## Round 16 findings: state

| Id | State | Evidence |
|---|---|---|
| M1 "Not me" drops focus to `<body>` | not re-run (feed re-checked for requests only) | The feed is quiet: 15 s open with 3 unread = 1 `POST /notifications/read`, 2 `GET /notifications`, 1 `GET /sessions`, then silence; the bell goes "Notifications, 3 unread" → "Notifications". A live sign-in while open adds one POST + one GET + one `GET /sessions`, the 5th row appears. |
| L2 a remote revoke signs out without a word | **fixed** | `S/revoke1.ts`: the session ended from another one → 509 ms later `/login` with the line "You were signed out: this session was ended on another device, or it expired." The local store stays until the next sign-in (log out proper empties it: events 9 → 0, `S/logout1.ts`). |
| L3 Escape does not cancel the inline confirm | **fixed** | `S/conf1.ts`: clicking Revoke on two rows leaves one confirm open; Escape closes it and focus returns to the row's Revoke. The confirm now prints the key ("Cancel Escape"). |
| L4 devices list is not live | **fixed** | `S/live2.ts`: a computer created through the API appears 504 ms later with no reload (`GET /api/sessions` ×2 in total). |
| L11 versions screen with a 404 blocks | unchanged | JSON 404, a protocol below the app's and a `minClientProtocol` above it all block; see L1 below for wording on the web. |
| L1 half-open socket | not re-run | |

## Findings

### M1 medium — A second tab in the same browser profile stays stale, for good
Now and Day, 1440 light EN. Script `S/tabs3.ts`, `S/tabs4.ts`.
Steps: sign in, open the app in tab A and in a second tab A2 of the same browser profile (a normal window plus an installed PWA window does the same). In A change a task's title in the edit sheet (Ctrl+Enter). Wait. Also bring A2 to the front (hidden → visible).
Happened: A shows "Third edit" at once; A2 shows "Second edit" for as long as I watched (35 s, and after a hidden→visible return that did send two `GET /api/sync/pull?since=…`); only a reload shows "Third edit". Another browser (different profile, same account) got the same edit over the socket in about 2 s. Both tabs open `…/api/sync/live?device=<one id>`: they share one device id and the server never tells a device about its own writes (`live-sockets.ts`); both share one IndexedDB, so tab A's sync already moved the shared cursor and A2's pull returns nothing; and A2's in-memory state is not rebuilt from the store it shares.
Should: a tab sees what another tab of the same profile wrote within a second (a `BroadcastChannel` / `storage` event that re-reads the local log, or a device id per tab), and a return to the tab must not leave it with a copy that a reload would change. Danger: the stale tab shows a done task as open, a renamed title as the old one, and a person acts on it.
Class: bug-lessons class 1 (the other side of a contract: "do not tell the writer" assumes one writer per device id).
Guard: a Playwright test with two pages in one context (one edit, assert on the other page) in `e2e/live.e2e.ts`.

### M2 medium — A tab screen opened by URL loses its address; a reload then lands on Now
`/day`, `/inbox` (also `/more`), 1440 and 390, every theme and language. Scripts `S/url1.ts`–`S/url3.ts`.
Steps: sign in, open `http://…/day` directly (or press F5 on Day).
Happened: Day shows, and 80 ms after load the app calls `history.replaceState` twice (`/day`, then `/`); the address bar reads `/`. F5 now shows Now ("Now · Pace"); the same for `/inbox`. `/week`, `/projects`, `/settings`, `/task/…` keep their URL. Clicking the sidebar entries does write `/day`, `/inbox` correctly. In the sweep the cold URL of the Day and Inbox screens came back as `/` in all 16 combinations (`S/sweep.out`: `ru-1440-light /day -> /`).
Should: the URL stays `/day` and reload returns to the same screen. This is what a refresh does after "A new version is ready · Refresh", on a PWA reload, after the one-time re-pull, and for any bookmark or link a person sends to herself.
Guard: `route-sweep.e2e.ts` asserts `page.url()` after load for every tab screen.

### M3 medium — The PWA share target drops the shared text
`/add?title=Article&text=https://example.com/a%20look%20at%20this&url=https://example.com/a`, 1440 and 390. Script `S/add2.ts`, screenshot `S/x/share-add.png`.
Steps: `public/manifest.webmanifest` declares `"share_target": {"action": "/add", "method": "GET", "params": {"text","title","url"}}`; open that URL signed in.
Happened: the New task form opens (focus in Title), `location` becomes `/`, and every field is empty (Title, Description, Link, the composer line): the text and link the person shared are gone without a word. `app/(tabs)/add.tsx` reads only the native `useShareIntentContext()`, which the web build never fills.
Should: on the web read `text`, `title`, `url` from the query (or remove `share_target` so Pace is not offered in the system share sheet). The docs/qa.md row "a share (`/add`)" for the composer has no web test.
Guard: a web test that opens `/add?text=…` and asserts the assistant's preview or the form's fields.

### M4 medium — The first sync shows definitive empty states, in the wrong language
Cold load (empty IndexedDB: new browser, new device, after "Log out"), `/`, `/day`, `/projects`, `/inbox`, `/week`, `/insights`, `/history`, 1440 and 390, RU. Script `S/slow.ts`, flicker trace `S/flick.ts`, screenshot `S/ld/_-390-cold.png`.
Steps: sign in on a browser with no local data; delay `GET /api/sync/pull` by 3 s (or use a long log: a pull page is 200 events).
Happened: for the whole wait the screens say "Сейчас дел нет." / "Nothing to do right now.", "За этот день ничего не записано.", "Проектов пока нет.", "Нечего разбирать.", "На этой неделе пока ничего не учтено.", "На тот момент в Pace ещё ничего не было." — no skeleton, no "loading". With the fake 3 s delay it is 3 s; on an undelayed local pull the empty copy still shows for about 0.3–0.5 s (`flick.ts`: first paint 643 ms empty, data at 810–1007 ms) and, for an RU account in an EN browser, in English first and then RU. A warm reload does not do this (data is local). The owner asked for skeletons while loading in feedback 4; the Devices list has them, the rest of the app does not.
Should: while the store has never completed a pull (no cursor), show the skeleton or a quiet "Syncing…" in place of every empty state, and take the language from the account only once known without flashing the other one.
Guard: a unit/app test: "a store with no cursor renders no empty copy"; an e2e with the pull delayed.

### M5 medium — Nothing says "offline" or "not synced yet"
Now, 1440 light EN. Script `S/off1.ts`, screenshots `S/r/offline-now.png`, `S/r/offline-created.png`.
Steps: sign in, go offline (`context.setOffline(true)`), create a task by hand (+ → Create), open Settings, go back online.
Happened: the task appears at once (good: it is local), but there is no banner, badge, toast or dot anywhere to say the device is offline or that the change has not reached the server; the form's Create gives no toast at all. After reconnecting the task reaches the server (1 event, no duplicate). Console: ~7 `ERR_INTERNET_DISCONNECTED` errors and a refused socket while offline (browser noise). `errors.offline` ("You are offline. Changes will sync when you reconnect.") exists in `packages/core/src/i18n/en/shell.ts` and is used nowhere in `apps/app`. In Settings, "Add a computer" offline does say "Could not create the token. Check the connection."
Should: a calm persistent status (sidebar bottom / header) when offline or when the outbox is not empty, using the existing string.

### M6 medium — The name of the signed-in person is unreadable
Sidebar header, 1440 light and dark. Script `S/name1.ts`, screenshot `S/x/sidebar-name.png` and any `S/sw/*1440*_.png` (it reads "Pace [D7] D…").
Happened: next to the logo the avatar chip and a name box 23 px wide: "Dev 7003" is cut to "D…", with no `title`, `aria-label` or tooltip, and on a phone More shows the name. The owner (feedback 4): "in the sidebar at the top Pace, to the right the name from the Telegram profile, Albert". A name like "Albert" would read "A…".
Should: give the name room (drop the bell below, or put the name under the logo), or show it in a tooltip and the account block.

### M7 medium — Icon-only actions have no tooltip or visible name on a computer
Task pane header (Edit details, Pause, Cancel or skip the task…, Delete the task, ✕ Close), project chip, Day's pencils, Week's switch, 1440 light. Script `S/tip1.ts`/`S/tip2.ts`, screenshot `S/x/tooltip-edit.png`.
Happened: hovering for 1.5 s shows nothing for any of them (`[role=tooltip]` exists only for the composer's New task, To Inbox, Send and the Calendar button). They have `aria-label` only (no `title`), so a mouse user must guess that ⏸ is "Pause the task" (and not "Focus", which sits in the footer with a stopwatch) and that ⊘ is "Cancel or skip".
Should: the same tooltip primitive on every icon-only button (the stage-8 plan: "icon buttons use it for their hotkey hint").

### L1 low — The versions screen on the web offers only "Log out"
`/api/instance` stubbed as 404, `protocol: 0`, `minClientProtocol: 99`; 1440 EN and 390 RU. Script `S/ver1.ts`, `S/v/`.
Happened: "Server and app versions don't match / Update the app to keep using this server. / Server: localhost:8791 / Log out" (and RU). On the web "Update the app" means "reload" (the app is the page) but there is no Reload button, and the server-outdated text says "log out and sign in on another one", which a web build cannot do (no Change server). `document.title` stays "Now · Pace" / "Сейчас · Pace" (already known). Another URL while blocked shows the same screen (good).
Should: on the web a "Reload" button for `client-outdated`; drop "sign in on another one" where there is no server switch.

### L2 low — Devices and sessions rows (phone)
390 dark EN, `S/a/sessions-en-390-dark.png`. A wrapped row ends its first line with a dangling separator ("Developer sign-in ·" / "United States · 203.0.113.7 ·"); the "this device" row has no time or place while every other row has ("Signed in Nov 1, 20:13"); the country is spelled out in Settings ("United States") and shown as a code in the feed notice ("Columbus · US").

### L3 low — The Calendar picker points to a section that no longer has that name
Calendar button on Now (web), EN: "Nothing on today in the calendar your phone sends (Pace on Android, with the calendar on in Settings → Devices)". The section is "Devices and sessions" now.

### L4 low — Time bar: the Task picker lists a task that has not started and a paused one
`S/t/pick-task.png` (account 7002): "Fourth edit … Paused" and "Weekly review … Starts Nov 8" (a future series instance). A task that starts in a week is not something a person is working on now.

### L5 low — Feedback of starting an activity differs by path, the toast is narrow
Typed line + Approve → toast "Started “played chess” · Undo" (5.2 s); Rest → Walk (picker) → no toast at all; the form's Create → no toast, the assistant's Approve → toast. The toast sits at the bottom-left in the sidebar column (≈200 px wide): "Created task “Buy milk tomorrow 18:… 30m”" is clipped on its third line (`S/c/p1-approve-enter.png`, `S/t/toast-crop.png`).

### L6 low — New project form: no focus on open, Escape does not close it
Projects, 1440 EN. `S/proj2.ts`. After "New project" the focus is on `<body>` (the name field is not focused), Enter on the empty field does nothing and says nothing, Escape leaves the form open. The colour swatches have names (Blue, Violet, …) but are 20 px dots. A duplicate name is refused with "A project with this name already exists." (good).

### L7 low — "Deadline type" is shown while there is no deadline
New task form (desktop pane and phone card): with "No deadline" chosen the form still offers "Deadline type: Hard due date / Main due + final deadline" (`S/c/form-repeat.png`). A control with nothing to act on until a deadline exists.

### L8 low — Week: a 0-minute activity is a 0 px target
axe `target-size` (serious) on `/week` after "played chess 20:22–20:22" in the EN/390 and EN/1440 runs, light and dark; also a partially covered block in RU 390 ("Дорога в вуз 23:04–23:44"). A zero-length block should have a minimum height (and be reachable by keyboard). Only axe finding of the whole matrix.

### L9 low — The in-app theme does not set the browser's colours
`S/theme2.ts`, `S/theme1.ts`. With the OS dark and the app set to Light (or the reverse) `body` stays the OS colour (rgb(11,11,12) / rgb(244,245,247)), `meta[name=theme-color]` has two `prefers-color-scheme` entries (the tab/status-bar colour follows the OS, not the app), and the manifest's `background_color` / `theme_color` are dark only. Visible effect: a dark flash before the first paint for a light-theme person on a dark OS, and a mismatching status bar on Android Chrome.

### L10 low — The time-zone card on Now cannot be dismissed
RU/EN, `S/tz1.ts`: "This device is in UTC; the account uses Europe/Moscow. [Use UTC]" is shown above the list on every visit (a card of two lines and a button; on a phone it pushes the first task below the fold) with no "Keep" / ✕. A traveller on purpose must either change the account's zone or look at it forever.

### L11 low — Unknown task and unknown route
`/task/doesnotexist`: header still shows a "No project" picker above "This task does not exist." (`S/x/nf_task_doesnotexist.png`); `/no-such-page` has `document.title` "Pace" only; `/presets/zzz` and `/project/…` are fine.

### L12 low — RU Insights wraps mid-word at 390
"Насколько дробилось время" card: "Переключени / й в день" (the stat box is too narrow for the word). `S/m/ru-390-light-a.jpg`.

### L13 low — The notification matrix says "App" in English and "Телефон" in Russian
Settings → Notifications column header: EN "App", RU "Телефон" (`S/set1.ts` text dump); the sheet/notice copy uses "phone" elsewhere in RU and "app" in EN.

### L14 low — Overnight activities show a fake start in their sheet
Day, 1440 EN, `S/sleep5.ts`, `S/sleep7.ts`, screenshot `S/d/edit-sleep.png`. The automatic sleep that began Saturday 23:25 opens with "From 00:00 To 07:40" on Sunday (clamped to the day shown), while the real start is 23:25 the day before. Saving unchanged writes nothing (good) and changing To writes only `activity.adjusted {endAt}` (good), but the sheet says the start is 00:00.

### L15 low — Dead second control for the same job
The Week screen has a "Ночные часы / Night hours" switch (a real `role=switch`, `aria-checked`) and Settings → Week has "Show night hours": same setting, two entry points; the Week one has no visible label or tooltip (see M7).

### L16 low — The assistant log still says "Suggested … Shown to you for approval" for a preview that was never answered
`/decisions`, 1440 EN: "Suggested a new task “call mom tomorrow 19:00” · You wrote: … · Shown to you for approval" stays as the final state of a preview that the person closed by leaving the page; the stage-8 ruling is that the UI speaks as the assistant's pending action, not "Suggested by the assistant". (The new automatic-sleep rows could not be read on the web at all: with no real phone session the log has no sleep entries, so their screen wording needs a device check.)

## Owner requests: still not met or only partly met

Re-read `context/feedback-2.md`, `-3.md`, `-4.md` against the build (the stage-8 rename Week → Calendar and the sidebar order were reversed by the owner later, commit `8db98c4`, so they are not counted).
- Feedback 4, "the name from the Telegram profile at the top of the sidebar, to the right of Pace": partly (M6; one letter is visible).
- Feedback 4, "when loading show skeletons": met on Devices and sessions only; the rest of the app shows final empty states (M4).
- Feedback 3/stage-8, "icon buttons get a tooltip on hover, instant": only the composer and the Calendar button (M7).
- Feedback 4, "share a text to Pace like a new task" (the share path, plan T3 and docs/qa.md "a share (`/add`)"): the PWA's share target does nothing with the text (M3).
- Feedback 4, "Wipe data / Delete account confirmed on the site and then in the Telegram bot": the web half exists (Settings → Danger zone); the bot half cannot be exercised here.
- Everything else I could check holds: Export data is at the bottom, "Connect an AI app" instruction sheet exists, Add a computer has the OS picker, the revoke confirm, the Week does not scroll the page and has a night-hours switch and "Back to today" off the current week, Day has "Back to today", "Previous day / Pick a day / Next day", Projects rows say "1 task", the update/lime-vs-indigo accent split is in place.

## Regression pass over this PR's changes (all OK unless listed above)

- **Sleep on the web**: with a Saturday-night automatic sleep written as the server writes it (23:25 → 07:40, system source, `precision: approx`), Day shows "Sleep · 7h 40m, 00:00 – 07:40" today and "Sleep · 35m, 23:25 – 00:00" yesterday, "Tracked 8h 20m", the sleep chip in the summary, EN "Sleep" and RU "Сон" (the stored label "Sleep" is worded by the screen, also in the edit sheet's What field: "Сон"), Week shows both pieces (grid widens to 00–23 on its own), Insights counts 8h 15m on "Night before" (35 m + 7 h 40 m) with no phantom Saturday. Account with a running automatic sleep (23:25, open) and the person's own live start at 01:00 ("Reading at night"): the sleep ends at 01:00 ("Sleep · 1h", "00:00 – 01:00"), the own activity runs "01:00 – now" ("19h 15m" in the bar), nothing is cut and a 7 s trace of the text shows 3–4 distinct states in the first second (load) and none afterwards: no flicker (`S/flick.ts`). Screen time on Day lists the phone ("Pixel QA · 4h 35m, First use 07:40 · last use 19:30"), and "Screen time 0m / Nothing recorded" on web-only accounts.
- **Re-pull after an update** (`S/repull.ts`): lived-in account, `syncVersion` removed from IndexedDB, reload: `GET /api/me`, `GET /api/sync/pull?limit=200&since=0`, `…&since=43`, then silence; the store keeps 43 events with 43 distinct ids (no duplicates), the three task rows render at the first sample (no flicker, no spinner at 250 ms steps for 3 s), `syncVersion` is 1 again and the next reload re-pulls nothing.
- **Server cold wake** (`S/wake1.ts`): 7 read endpoints (`/me`, `/sessions`, `/notifications`, `/decisions`, `/usage`, `/calendar`, `/sync/pull?since=0`) compared before and after 100 s without any connection: 0 differences. An edit followed by reload and a second browser (other profile) shows the same title within about 2 s (only the same-profile second tab is stale, M1).
- **Series**: weekly "Weekly review" without a deadline: the first instance is due now, the next shows "Starts Nov 8 00:00" (start of its day, as `seriesAnchor` says), "Repeats Every Sunday"; closing the first leaves exactly one next instance under "In future"; the seeded monthly rent: after Done the next instance reads "Начало 28 нояб. … Срок 11 дек. … Повтор: Каждый месяц, 11-го числа … Окончательный срок 18 дек.".
- **Devices and sessions**: kinds and names show ("Developer sign-in", "Computer · Nothing sent yet · Added Nov 1, 20:14"), the list is live, confirm and error states ("Couldn't load devices · Try again") are in place; Add a computer: Name focused on open, Enter creates one token, the command quotes the name, Escape returns; Connect an AI app text unchanged.
- **Sign-in notices**: each dev sign-in produces one notice with the address and "Not me — end this session"; the own notice has no button and "This device"; the feed does not loop (above).

## Design pass against docs/qa.md heuristics

Breaches (each is a finding above): control with no meaning (L7), state not visible (M5, M6), one way per job (L15), platform conventions (M2, M7, L6 keyboard), feedback and motion (M4, L5), copy (L1, L3, L13), overlays in context (L5), guest language / document language (login `lang` follows the browser, RU locale gives "Вход в Pace · Pace", fine), forms keep their promise (M3: the manifest promises a share path; L6 Enter on an empty project name gives no message).
Passes: lime used for the one primary action per screen; tags use distinct colours (Personal orange, Normal green, Not started grey, Paused grey but never both at once); phone sheets slide from the bottom and close on the dim, desktop sheets are centred with ✕ and Escape; "Not me" is outlined in the danger colour; axe finds no contrast problem in 13 routes × 8 combinations.

## What works well
- Sleep, own live starts and overnight blocks are consistent across Day, Week, Insights and the edit sheet in EN and RU, and do not flicker.
- Sessions: kind and age per row, a live list, one confirm at a time that Escape closes, a clear signed-out line after a remote revoke, local data emptied on log out.
- The re-pull, the cold-wake comparison and offline creation (one event after reconnect) are clean: no duplicates, no loop, no console error online on any of 128 screens.
- The notification feed is quiet and its unread count clears; a sign-in arrives live.
- The versions screen is centred, bilingual, keyboard-reachable and recovers on return.
