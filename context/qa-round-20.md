# QA round 20 — first-sync placeholders, Done's other time, sheet focus, sign-out reasons, connection, share target

Tester: exploratory Playwright pass. Stack: Worker on :8820 (fresh `.cache/qa-state`, `ENVIRONMENT:test`, `LLM_PROVIDER:fake`, ids 8000–8099), web build of HEAD `09f421d` (`build:web` against :8820) served on :4173. Accounts: lived-in RU (`seedLivedIn`, 8001, 8050, 8070), EN with tasks and activities (8002, 8010, 8012, 8060, 8061), EN with three-day-old tasks (8011, 8062, 8063), brand-new EN (8003, 8040, 8041). Scripts and screenshots: `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa20/` (below `S/`; screenshots in `S/sh/`, `S/fs/`, `S/sw/`, `S/shots/`). The repository was not touched except this file; both servers were stopped at the end by their PIDs.

Matrix covered: 22 URLs × 1440×900 and 390×844 × light and dark × RU (lived-in) and EN (task and project pages RU only) = 156 loads (`S/sweep.ts`, log `S/sweep.out`): **0 console errors, 0 failed or 4xx/5xx requests, 0 raw message keys, 0 horizontal overflow, 0 axe violations** (WCAG 2.2 AA, run on every load). Interactive passes: Done on a task (tooltip, the new icon button, Cancelled/Skipped, three outcomes with typed times, bad times, keyboard), 14 sheets × (desktop, phone, emulated touch phone) with Shift+Tab/Tab, sign-out reasons (logout in one tab EN and RU, revoke through the API, revoke through Settings → Devices from a second browser context, a frozen tab), connection (Worker stopped idle with a write, 45 s outage, flapping socket in two shapes), share target (12 URL shapes, desktop and touch phone, in-page and by load), History undo confirm (both themes), Calendar picker and Presets, first sync held for 14–15 s on 13 routes (RU lived-in at 1440 light and 390 dark, EN, brand-new account).

Not testable on the web: phone calendar, usage access, push, the Telegram half of Wipe/Delete, Mac shortcut labels, a real on-screen keyboard (touch focus was judged by `document.activeElement` on an emulated touch device). The LLM is the fake provider.

## Summary

| Severity | Count |
| -------- | ----- |
| blocker  | 0     |
| high     | 0     |
| medium   | 3     |
| low      | 9     |

Medium:
- **M1** During the first sync Settings and Presets print the built-in defaults as the account's state (a Russian account shows "English" selected, only the four built-in presets).
- **M2** Activating Cancelled or Skipped in the close sheet with the keyboard drops focus to the page body; the Reason field is not focused and what is typed goes to the page.
- **M3** A share arriving in the same page does not append to the half-typed line (it replaces it), and a blank share wipes it.

Low: L1 "Add a computer" sheet focuses its Name field on a touch phone; L2 the offline line stays up to ~27 s after the server is back, with no retry; L3 "Another time or outcome…" is a bare up-chevron and Done's tooltip still teaches the long press; L4 the close sheet's default typed time is rejected within the task's first minute; L5 typed-time wording in the close sheet ("Date" chip, "happened 18:00" with no day, text date fields); L6 no way back to Done once Cancelled/Skipped is picked, and the sheet jumps in height; L7 the close sheet's chips are one tab stop each; L8 History says "Task closed" for a cancelled or skipped task; L9 duplicate requests on the first load.

## Round 19 findings re-tested

| Id                                                      | State                                                                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 first sync prints zeros / empty sentences            | **fixed for Day, Week, Assistant log, Projects, Insights, History, Inbox, task and project pages; not for Settings and Presets (see M1 below)** | `S/fs1.ts`, `S/fs2.ts`, `S/fs/*`: pull held 14–15 s, text sampled every 150 ms, 0 snapshots with "Nothing in the log", "Nothing recorded", "Tracked 0m", "No projects yet", "Nothing to do", "Нет данных" before the pull returns (RU 1440 light, RU 390 dark, EN, brand-new account). Grey rows on every screen in both themes (`S/shots/fs-a.png`, `fs-b.png`, `fs-c.png`); the dark rows are clearly visible. A brand-new account (8003) reaches real empty states at the end ("Nothing to sort.", "Nothing recorded on this day."). Strip and cover use one ellipsis character in both languages (`sync.stillSyncing`, `sync.firstSyncLine`).                                                                                                                                                                                                               |
| M2 Done's other-time sheet                              | **fixed**                                                                                                                                       | `S/d2.ts`: hover on Done shows the tooltip at once; the new 44×44 icon button "Another time or outcome…" beside it has its own tooltip, opens the sheet in Done mode (Now, 1h ago, Yesterday evening, Date; Exactly/About then; Outcome; "Close task as…" with Cancelled and Skipped as real buttons). `S/d5.ts`: Done at yesterday 18:00, Skipped at 20:15, Cancelled with a reason at Oct 31 09:30 "About then", Done typed 08:05 closed by Ctrl+Enter all reach the log with those times (History: "Task closed · Old E Nov 2, 08:05", B Nov 1 20:15, A Nov 1 18:00, C Oct 31 09:30). Refused: a future time ("That time is in the future."), "25:99", a garbage date, an empty time ("Use the date as YYYY-MM-DD and the time as HH:MM."), a time before creation ("That is before the task was created."); Done is disabled for each. See M2, L3–L7 below. |
| L1 Shift+Tab on a phone sheet                           | **fixed**                                                                                                                                       | `S/sf.ts`: 11 sheets (Calendar, Task, Chores, Rest, Edit task, Cancel or skip, Another time or outcome, Log past, Pick a day, Add a computer, Connect an AI app) × 4 Shift+Tab + 3 Tab at 1440 and at 390: focus is always inside the dialog and never on a full-screen element. Escape closes all and returns focus to the opener.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| (new) touch phone: no text field focused by a sheet     | **mostly fixed**                                                                                                                                | Same script on a touch device (`hasTouch`, `isMobile`): picker, Edit task (focus on the "Homework" chip), Cancel or skip (on "Cancelled"), Day Log past (on "Work"), Another time (on "Now") focus a non-text control. Exception: Add a computer (L1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| L2 skeleton in dark, ellipsis                           | **fixed**                                                                                                                                       | See M1 row: rows visible in dark (`S/shots/fs-b.png`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| L3 undo confirm copy                                    | **fixed**                                                                                                                                       | `S/h1.ts`, `S/sh/h1-dark.png`: "Undo this event? Everything it changed is recalculated without it." with room above the buttons; Escape closes and focus returns to Undo (light 1440, dark 390).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| L4 share target                                         | **partly fixed**                                                                                                                                | Blank shares (`?text=%20%20%20`, `?text=`, `?title=&text=&url=`, `?title=%20`) land at `/` with the line focused and empty, desktop and touch; only a bare `/add` opens New task (Title focused on desktop; on the touch phone the form shows with no field focused, `S/sh/sh1-touch-_add.png`). Append to a half-typed line does not work in the page (M3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| L5 date picker tab stop per day                         | left (known)                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| L6 Calendar picker offers the phone calendar on the web | **fixed**                                                                                                                                       | `S/m1.ts`: the sheet holds "Nothing on in your calendar right now." and "Start a meeting without an event" only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| L7 Presets "Start from" chips                           | **fixed**                                                                                                                                       | `S/sh/m1-presets.png`: Homework, Work, Personal, Deferred are all drawn the same.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Sign-out reasons, connection and share target (the "changed since round 19" list):
- **Logout in one tab** (`S/so1.ts`, `S/so3.ts`): the other tab goes to /login in under 1 s with "You signed out in another tab." / «Вы вышли в другой вкладке.»; the tab that logged out shows no note. One 401 `GET /api/me` in the other tab, then nothing.
- **Revoke from another device**: through the API with a second session's token (`S/so2.ts`) and through Settings → Devices from a second browser context (`S/so4.ts`): both of two open tabs go to /login with "You were signed out: this session was ended on another device, or it expired." (EN). 401 count: one per tab. A tab frozen (`Page.setWebLifecycleState frozen`) while the session was revoked signs out as soon as it is resumed. (Headless Chromium reports every tab `visible`; a real hidden tab was approximated by freezing.)
- **Connection** (`S/cn1.ts`, `S/cn2.ts`): Worker stopped with the tab idle for ≥15 s → "You are offline. Changes will sync when you reconnect." after 13 ms; retries back off 0, 1, 3, 5, 13, 29 s (6 pulls in 45 s, no storm); a task typed while down is on the server after the Worker is back (see L2 for how long it takes) and the line clears with it. Flapping socket (a socket closed 50 ms after it opens: 6 attempts in 60 s at 1, 3, 5, 9, 17, 33 s; a socket closed after 3 s: 6 attempts at 1, 5, 10, 17, 28, 47 s): only a doubling `GET /api/notifications` per attempt, no pulls, no offline line, no storm. When the Worker is killed less than ~5 s after the socket opened (an artefact of my first run, `S/cn1.out`) no line appears for 20 s+: the "flapping" rule treats that drop as a flap; only reachable in the first seconds after a load, not counted.
- **Share target** (`S/sh1.ts`, `S/sh2.ts`): see the table row above and M3.

## Findings

### M1 medium — During the first sync Settings and Presets print the built-in defaults as the account's state

Settings and Presets, 1440×900, light, RU lived-in account, pull held 14 s (after the 10 s cover, "Still syncing your data…" strip). Scripts `S/fs1.ts`, `S/fs3.ts`; screenshots `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa20/shots/fs-settings.png` (left: during, right: after), `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa20/shots/fs-c.png` (Presets, top left).
Steps: sign in on an empty browser store as the lived-in RU account with the sync pull held; open `/settings` (and `/presets`); look at 11 s.
Happened: Settings is fully drawn and interactive: LANGUAGE shows "English" selected on a Russian account (the text itself is Russian because of the device), "Show night hours" off, notification switches, DIGEST TIMES 09:00/14:00 are the defaults, not the account's. Tapping a switch during the sync writes an event at once (`settings.updated {"nightHours":true}` reached the server while the strip was still up; it is a partial patch, nothing else is overwritten). Presets lists only Homework, Work, Personal, Deferred plus "Add example course presets" (the account's own «Матанализ» preset arrives after the pull). Every other screen got grey rows in QA 19 M1's fix; these two did not.
Should: the same rule as the other screens: while the store has no cursor, no control shows a value that is not known yet. Grey rows (or disabled grey switches and chips) on Settings' account-bound sections (language, week, digest times, quiet hours, notification matrix, estimates) and on the Presets list.
Guard: add `/settings` and `/presets` to the "store without cursor" app test and to the e2e `EMPTY_COPY` sweep; assert the language chips are not rendered selected before the pull.

### M2 medium — Keyboard: activating Cancelled or Skipped in the close sheet drops focus to the page body

Close sheet (task → "Another time or outcome…" → Cancelled), 1440×900, light, EN. Scripts `S/d8.ts`, `S/d9.ts`.
Steps: open the sheet with the keyboard (focus the icon button, Enter); Tab to "Cancelled" (or focus it) and press Space or Enter; then type a reason and press Enter.
Happened: the sheet switches to Cancelled mode (Reason field appears) but `document.activeElement` becomes `BODY` (outside the dialog) because the button that had focus is removed. The letters typed go to the page behind the dim (the app has one-key shortcuts, e.g. N and F), Enter does nothing, and the reason stays empty; a following Tab lands on "Close as Cancelled", skipping the Reason field; Ctrl+Enter then closes the task with no reason. A screen-reader user hears nothing after the switch.
Should: after the switch focus goes to the Reason field (or at least stays inside the dialog on the segment that was activated).
Guard: extend `e2e/sheet-focus.e2e.ts`: after any in-sheet mode switch `document.activeElement` is inside the dialog; add an app test for the close sheet's Cancelled path with `userEvent.keyboard`.

### M3 medium — A share arriving in the same page does not append to the half-typed line; a blank one wipes it

Now, 1440×900 light EN (the touch phone gives the same). Scripts `S/sh2.ts`, `S/sh1.ts` (same method as QA 19: type, then `history.pushState` to the share URL and dispatch `popstate`).
Steps: type "half typed" into Now's line (by keyboard or `fill`, with or without a 1.5 s wait); navigate in the page to `/add?text=Shared%20over%20typing`.
Happened: the line now holds only "Shared over typing" (expected "half typed⏎Shared over typing"). The same navigation with a blank share (`/add?text=%20`) leaves the line empty: "typed X" is gone, with no undo. By a fresh load the typed text is gone as well (no persisted draft), so in practice the append never happens. The unit test passes because it calls `noteLineDraft("half typed")` directly; in the real route the typed text is not in the hand-off when `useSharedIn` reads it (hypothesis: leaving `/` runs `forgetLineDraft` before the Add route's effect reads `handoff.draft`, or the Add route's own Now notes an empty draft first).
Should: the typed text stays and the share goes after it on a new line; a blank share changes nothing.
Guard: an app test that mounts the whole tab layout (not the hook alone), types into Now's line and navigates to `/add?text=…`; and an e2e that types then navigates in-page.

### L1 low — "Add a computer" focuses its Name field on a touch phone

Settings → Add a computer, 390×844 emulated touch phone (`hasTouch`, `isMobile`), light, EN. Script `S/sf.ts`, `S/t2.ts`.
Steps: tap "Add a computer".
Happened: `document.activeElement` is `INPUT:Name`, which raises the on-screen keyboard over a half-height sheet (the rule the QA 19 fix introduced: no text field focused on a touch browser). Picker sheets, Edit task, Cancel or skip, Log past, the gap Log, Another time and Connect an AI app are fine.
Should: the sheet takes the focus on its first non-text control (or the dialog itself) on touch, like the others.
Guard: put Add a computer into the touch row of `e2e/sheet-focus.e2e.ts`.

### L2 low — The offline line stays up to ~27 s after the server is back, with no way to retry

Now, 1440×900, light, EN. Script `S/cn1.ts` (outputs `S/cn1b.out`).
Steps: open the app, wait 15 s, stop the Worker, type a task with N … Ctrl+Enter, wait 25 s, restart the Worker.
Happened: the line appeared after 13 ms and the retries backed off 0, 1, 3, 5, 13, 29 s (good); after the Worker answered `/api/health` the line cleared and the task reached the server **26.9 s** later (4–7 s in round 19, same outage lengths of 33 and 115 s). The next retry simply waits out its back-off; the line has no "Try again" action and a click or a focus on the window does not trigger a retry.
Should: a retry on window focus / tab becoming visible / any tap on the line, or a back-off capped at ~10 s while the line is showing, so a person who sees "Changes will sync when you reconnect" sees it clear soon after the server is back.
Guard: e2e: server restarted → line gone within N seconds.

### L3 low — "Another time or outcome…" is a bare up-chevron, and Done's tooltip still teaches the long press

Task pane (1440) and task screen (390), light/dark, EN/RU. Screenshots `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa20/sh/d2-hover-done.png`, `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa20/shots/d6.png`.
Happened: the way into the sheet is a 44×44 button with a "⌃" glyph; it has an accessible name and a hover tooltip, but nothing visible says what it is, and on a phone no tooltip exists. An up-chevron reads as "expand/more". Done's tooltip still reads "Finishes the task now. Long press: another time, or close it as cancelled or skipped.", so there are two ways to one job and the tooltip points at the hidden one. In RU the phone's Done reads «Сдать 290» on two lines next to it.
Should: a clock/calendar glyph (or a visible short label such as "Other time…" on desktop), and the tooltip shortened to what the button does ("Finishes the task now"). Keep the long press as a shortcut without advertising it.

### L4 low — The close sheet's default typed time is rejected inside the task's first minute

Close sheet → "Date", 1440×900 light EN. Script `S/d3.ts`/`S/d4.ts`, screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa20/sh/d4-a.png`.
Steps: add a task; within the same minute open "Another time or outcome…" and pick "Date" without typing anything.
Happened: the pre-filled time is the current minute rounded down (12:39), earlier than the task's creation second (12:39:5x), so the untouched default shows "That is before the task was created." and Done is disabled. Only in the first minute of a task's life, but it is the default the sheet itself offers.
Should: default to the current time with seconds kept, or clamp to the task's creation.

### L5 low — Typed-time wording in the close sheet

Same sheet, 1440 light EN (and RU). Screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa20/sh/d5-A.png`.
Happened: (a) the chip that opens the date and time fields is labelled "Date" (accessible name "Pick exact time"); (b) the summary reads "Recorded 12:40 · happened 18:00" for a time that is yesterday, and "happened 09:30" for Oct 31: no day when it is not today; (c) the fields are plain text boxes needing `YYYY-MM-DD` and `HH:MM` on a phone, while Day's "Pick a day" has a real calendar.
Should: label "Pick a time" (or "Other…"), write "happened yesterday 18:00" / "Oct 31 09:30", and use the date picker the app already has.

### L6 low — No way back to Done from Cancelled/Skipped mode; the sheet jumps in height

Close sheet, 1440 light EN. Screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa20/sh/d3-typed.png`.
Happened: after tapping Cancelled the segment row offers only Cancelled · Skipped; a person who tapped it by mistake has to close the sheet and reopen it (the ⊘ icon opens this same mode, so both entries lead to it). The sheet's top edge moves (212 → 190 px) in one frame as the content changes.
Should: a "Done" segment in the same row (so the sheet is one thing with three outcomes), and a height animation.

### L7 low — The close sheet's choice chips are one tab stop each

Close sheet, 1440 light EN. Script `S/d8.ts`.
Happened: Tab order is Now → 1h ago → Yesterday evening → Date → Exactly then → About then → Cancelled → Skipped → Done → Close: six stops for two radio groups (`role=radio` divs). Same class as QA 19 L5 (one tab stop per day in the date picker).
Should: one tab stop per radio group, arrows move inside it.

### L8 low — History says "Task closed" for a cancelled or skipped task

History → Events, 1440 light EN. Script `S/d5.ts`, `S/sh/d5-history.png`.
Happened: after Skipped (Old B) and Cancelled (Old C) the event rows read "Task closed · Old B" and "Task closed · Old C", the same as a done task. The outcome, which the close sheet had just asked for, is not readable there.
Should: "Task skipped · Old B", "Task cancelled · Old C".

### L9 low — Duplicate requests on the first load

First load on an empty store, 1440 light EN. Script `S/cn2.ts` (list at the top of `S/cn2a.out`).
Happened: in 1.0–1.6 s the app sends two `GET /api/calendar?from=…`, two `GET /api/sync/pull?limit=200&since=0`, two `GET /api/notifications?limit=50` and one `POST /api/sync/push`, then a third pull with `since=1`. The doubles are identical.
Should: one of each (a single in-flight request shared by both callers).
Guard: `e2e/support/sync-traffic.ts` already counts requests; assert at most one pull with `since=0` per load.

### Cosmetic (not counted)

- Settings → Devices: with one row's "End this session?" confirm open, the other row's plain "Revoke" button sits 8 px under the confirm's red "Revoke" (`/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa20/sh/so4-confirm.png`): easy to hit the wrong one; other rows could be disabled while one confirms.
- The close sheet's rule under "Close task as… Cancelled · Skipped" touches the buttons' bottom edge at 1440 and 390 (`sh/d5-A.png`, `shots/d6.png`): the same tight-rule look that QA 19 L3 fixed in the History confirm.
- Presets' "Start from" row has no verb: the chips are actions but read as filter chips; "New preset from…" would say what a tap does.
- The notification bell shows a count for "Signed in from Dev login" entries with country "United States, Columbus" for 127.0.0.1 (a dev-login artefact, not a product issue).

## Owner requests: still not met or only partly met

Re-read `context/feedback-2.md`, `-3.md`, `-4.md` against this build.
- Feedback 4, "when loading show skeletons": met on Now, Day, Week, Inbox, Projects, Insights, History, Assistant log, task and project pages (both themes); not on Settings and Presets (M1).
- Feedback 4, "Wipe data / Delete account confirmed on the site, then in the Telegram bot": web half unchanged; the bot half cannot be run here.
- Feedback 3, "hotkeys shown on the buttons per OS": shown on desktop (Ctrl+Enter, Enter, Escape, N, F), absent on a touch phone. The 390 px non-touch window still shows them (known).
- Feedback 4, "tooltip at once on hover": met for Done, the new icon button, the Day arrows.
- Feedback 4, "share a text to Pace like a new task": met by load; the half-typed append is not (M3).
- Everything else I could check holds: "Back to today" on Day and Week; Projects "1 task"; Export data; "Connect an AI app" and "Add a computer"; the per-kind × channel notification matrix; Devices with revoke.

## UX heuristics walk (docs/qa.md), breaches beyond the findings above

- Every control earns its place: the Done chevron (L3) and the ⊘ icon + chevron both reach the Cancelled/Skipped sheet (a second way to one job; kept, but the sheet's mode switch should unify them, L6).
- One way per job: Done (click), the chevron and the long press are three ways to the outcome sheet; only the first two are visible (L3).
- Platform conventions: every sheet closes on Escape, on the dim (touch) and on ✕ (desktop); focus returns to the opener (including the new chevron); Shift+Tab stays inside. The exception is the in-sheet mode switch (M2).
- The keyboard on a computer: Enter in the typed-time field does not submit but Ctrl+Enter does (the button shows "Ctrl+Enter"); radio groups cost one tab stop per chip (L7).
- State you can see: Settings and Presets draw defaults while the account's values are unknown (M1); the offline line has no retry (L2).
- Feedback and motion: the close sheet changes height in one frame on a mode switch (L6); the cover → app switch at 10 s is one frame (left).
- Copy: "Undo this event? Everything it changed is recalculated without it." is clear; "Date" for a date-and-time chip, "happened 18:00" without a day (L5), "Task closed" for a skipped task (L8).
- Forms keep their promise: all three outcomes accepted with a typed time from the chevron; every refusal shows one sentence and disables the button; the default typed time can be refused (L4).
- Overlays in context: the Done toast ("Done: Buy milk · Undo") docks bottom-left above nothing important; the offline strip and the syncing strip do not cover actions.
- Visual matrix: 22 URLs × 4 combinations plus the sheets in both themes with Russian text; no wrapping or contrast problem beyond the RU «Сдать 290» two-line Done at 390 px (a subtask count in the verb; acceptable).

## What works well

- The first-sync rule now holds on every data screen: 0 zero totals or empty sentences in 100+ sampled snapshots per route; skeleton rows are visible in dark; the cover and strip use one ellipsis; a brand-new account reaches its real empty states.
- Done's other times: tooltip, icon button, Cancelled/Skipped as buttons, three outcomes with a typed time, six refusals each with one sentence, Ctrl+Enter, Escape, focus back on the chevron.
- Shift+Tab stays inside every sheet at phone and desktop width; a touch phone no longer raises the keyboard for pickers, Edit task, Cancel or skip, Log past.
- Sign-out reasons are right in every case I could build: logout elsewhere → "another tab" (EN and RU, not on the tab that logged out); revoke from another device or from Settings → Devices → "another device" on both tabs; a resumed frozen tab signs out; one 401 per tab, no loop.
- Connection: offline line in 13 ms, retries back off (0, 1, 3, 5, 13, 29 s), flapping sockets cost one request per attempt with doubling gaps and no storm, a task written offline reaches the server once and the line clears.
- Share target: blank shares land at `/` with the line focused; only a bare `/add` opens New task; title + text + url join into one line.
- History's undo confirm says what happens; Presets' chips are alike; the Calendar picker offers only what the web has.
- 0 console errors, 0 failed requests, 0 raw keys, 0 overflow and 0 axe violations across the 156-load matrix.
