# QA round 19 — sheet focus, composer Enter, Day sheet end rule, offline line, first-sync cover, share target, confirm Escape, second tab

Tester: exploratory Playwright pass. Stack: Worker on :8819 (fresh `.cache/qa-state`, `ENVIRONMENT:test`, `LLM_PROVIDER:fake`, ids 7200–7260), web build served on :4173. The first half of the pass ran on a `build:web` of HEAD `8e84369`; during the pass HEAD moved to `4661dd1` (+ uncommitted `packages/client` live/sync edits in the working tree), so the app was rebuilt and the second-tab, offline and server-down checks were repeated on that build (results below say which). Accounts: lived-in RU (`seedLivedIn`, 7201, 7214, 7216), fresh EN (7203–7228), EN with tasks and activities (7222), EN with overnight/long/week-old blocks (7207, 7208). Scripts and screenshots: `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/` (below `S/`). The repository was not touched except this file; both servers were stopped at the end.

Matrix covered: 22 URLs × 1440×900 and 390×844 × light and dark × RU (lived-in) and EN = 176 loads (`S/sw/`, log in `S/sweep.out`): **0 console errors, 0 failed or 4xx/5xx requests, 0 raw message keys, 0 horizontal overflow**. axe (WCAG 2.2 AA, 14 routes × the same matrix, `S/ax.ts`): **0 violations**. Phone sheets checked with an emulated touch device (hasTouch, isMobile): pickers, Edit task, give-up sheet, Day sheet, Log past, New project, in both themes (`S/mont/ph-dark-a.png`, `S/mont/ph-b.png`). Interactive passes: sheet focus and focus return (14 sheets, desktop and phone), composer Enter / Shift+Enter / blank lines / Send, Day sheet end rule (35 typed-end cases on edit and Log past), browser offline, Worker stopped (idle, with a write, 115 s outage), first sync delayed 13–16 s on 11 routes, share target (10 URL shapes, desktop and phone), confirm Escape (Wipe, Delete, preset delete, History undo), second and third tab, notification kind names.

Not testable on the web: phone calendar, usage access, push, the Telegram half of Wipe/Delete, Mac shortcut labels, a real on-screen keyboard. The LLM is the fake provider.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 2 |
| low | 7 |

Medium:
- **M1** While the first sync outlasts its cover, Day and the Assistant log still print final zeros and "Nothing in the log yet." (the QA 18 M5 rule holds only for Now).
- **M2** Closing a task at another time, or from the close sheet at all, is reachable only by a long press on Done, and nothing a sighted person can read says so.

Low: L1 Shift+Tab on a phone sheet lands on the invisible full-screen dim; L2 first-sync cover polish (dark skeleton invisible, "..." vs "…"); L3 "Undo this event? This cannot be undone."; L4 a share replaces the typed line, a blank share leaves `/add?text=%20%20%20`; L5 the date picker has a tab stop per day; L6 the Calendar picker on the web still offers the phone calendar; L7 "Start from Homework" looks selected before anything is chosen.

## Round 18 findings re-tested

| Id | State | Evidence |
|---|---|---|
| M1 sheets open on the dim | **fixed** | `S/a2.ts`, `S/k1.ts`: Calendar → "Start a meeting without an event", Task → "Find a task", Chores/Rest → first row, Edit task → Title, Log past / block edit / gap Log → What, close sheet (long press Done) → "Now", give-up → Reason, Project sheet → first option, date picker → Previous month. Focus is in the dialog every time; the dim has `tabIndex=-1`; Escape closes all of them and focus returns to the opener (Calendar, Task, Chores, Rest, Edit details, Cancel or skip…, Done, Project chip, Log past, the block row, the gap row, Pick a day, New project). Phone viewport and touch device behave the same (but see L1). One run returned focus to BODY after Escape on the Calendar picker with an assistant preview open; six later tries (with and without a preview) all returned to the button, so it is not counted. |
| M2 Enter in empty composer | **fixed** | `S/a4.ts`: empty + Enter keeps value "" and height 44; "   " + Enter keeps "   "; Shift+Enter breaks the line (value "line one\nline two", height 68); Enter on the two-line text opens the preview once; Send is disabled on an empty line. |
| M3 Day block end before start | **fixed** | `S/d2.ts`, `S/d2b.ts`, `S/l1.ts` (outputs in `S/day/`). Yesterday 08:00–21:00 (13 h) To 07:00 → "The end must be after the start."; 22:00–23:00 To 21:00 → same; 10:00–12:00 To 09:00 → same; 14:00–18:00 To 02:00 (exactly 12 h) saved, To 02:30 → refused; week-old 08:00–09:00 To 07:00 and To 03:00 → refused, 20:00–21:00 To 02:00 → saved; 22:30–06:00 To 22:00 → refused, To 05:00 saved; today 01:00–02:00 To 00:30 → refused. 30 h blocks opened on their end's day take a new end (18:00, 09:00, 10:00, 20:00) and a new start; From+To together saved as one `activity.adjusted`. The subtitle follows the typed times ("Sun · Nov 1 – Mon · Nov 2" after To 02:00; back to "Sunday · Nov 1" for 22:00–23:59; "Saturday · Oct 31" after shortening a night block). Log past gives the same answers (today 22:00–02:00 "That is still ahead…", yesterday 22:00–02:00 saved with the two-day subtitle, week-old 20:00–03:00 saved, 20:00–12:00 refused). |
| M4 dead server not announced | **fixed** | `S/o5.ts`: Worker killed with the tab idle → "You are offline…" within the 1 s the kill took; pull retries back off 1, 2, 4, 8, 11, 5, 32 s (8 requests in 115 s, `S/o6.ts`), no storm. A task typed while down is on the server 7.4 s (after a 33 s outage) and 4.0 s (after 115 s) after the Worker answers `/api/health`; the line clears with it. |
| Browser offline | **fixed** | `S/o1.ts`: `setOffline(true)` → line after 9 ms; write offline; `setOffline(false)` → line gone 8–23 ms, task on the server after 56–285 ms. (A first run of mine misread this because the task title contained "offline".) |
| M5 first-sync cover | **mostly fixed** | `S/f1.ts`, `S/f2.ts`: cover reads "Syncing your data…" (progressbar with that name) for 10 s on a RU, an EN-new account, at 1440 and 390, both themes; after 10 s the app shows "Still syncing your data…" and grey rows. 0 texts containing "Nothing to do right now" / "Сейчас дел нет" were ever on screen (MutationObserver over every text, 4 runs); a brand-new account with the pull delayed reaches "Nothing to do right now." at the end, and "Nothing recorded on this day." on Day. Leftovers: M1, L2. |
| L1 Escape in confirms | **fixed** | `S/c1.ts`, `S/c4.ts`, `S/c6.ts`: Wipe data, Delete account, preset Delete and History Undo all close on Escape and return focus to the button that opened them. |
| L2 share focus | **fixed** | `S/s1.ts`: `/add?text=Buy oat milk` lands at `/` with the line filled and focused (desktop and touch phone); Enter opens the preview; sharing the same text again (reload or in-app) fills it again; title + text + url, title only, url only, special characters, 3000 characters all fill once and focus. See L4. |
| L3 other-tab sign-out | **fixed** | `S/t1.ts`, `S/t2.ts`: sign out in tab B → tab A (EN and RU) goes to /login in 260 ms with "You signed out in another tab." / «Вы вышли в другой вкладке.»; tab B itself shows no note; with three tabs the two others both say it and it survives a reload. On the earlier `8e84369` build the same three-tab run said "ended on another device" in tab A (the note was written after the other tab had already noticed) — that is the race `4661dd1` closes; confirmed fixed on the rebuilt app. One 401 `GET /api/me` is logged in tab A (expected). |
| L9 focus after New project | **fixed** | Escape returns to the "New project" button. |
| L12 kind name | **fixed** | Settings switches read "Activity check: Telegram / Phone / Web" and «Проверка занятия: Telegram / Телефон / Веб». |
| QA18 L5 keyboard hints on phone | held | The touch phone shows no "Ctrl+Enter" / "Escape" hints. |

## Findings

### M1 medium — During a slow first sync, Day and the Assistant log print final empty and zero copy
Day (390 and 1440, light, EN and RU account) and Assistant log (`/decisions`, 1440 and 390), RU lived-in account, pull delayed 13 s. Script `S/f2.ts`; screenshots `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/fs/overdue390-day.png`, `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/fs/ru-390-light-11.5.png` (Now, correct, for contrast).
Steps: sign in on an empty store with the sync pull held for 13 s; open `/day` (and `/decisions`); wait 11.5 s (past the 10 s cover).
Happened: under "Still syncing your data…" Day says "Tracked 0m", one grey row, and below "Screen time · 0m · Nothing recorded" as if they were facts (the account has about 3 h of activities today). The Assistant log says "Nothing in the log yet." with no placeholder. Week, Projects, Insights and History show only their header (no placeholder, no label). Now alone follows the QA 18 M5 rule.
Should: the same rule on every screen: while the store has no cursor no screen prints a zero or an empty sentence; Day's totals show a placeholder, Assistant log shows grey rows.
Guard: an app test per screen "store without cursor renders no empty copy" (a table over the route list), and the e2e's `EMPTY_COPY` regexp extended to "Nothing in the log yet", "Nothing recorded", "Tracked 0m".

### M2 medium — Done's other-time sheet is reachable only by a long press nobody is told about
Task pane, Now, 1440 light EN (also phone). Script `S/k4.ts`; screenshots `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/sh/k4-hover-done.png`, `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/sh/k4-close-sheet.png`.
Steps: open a task, hover Done for 1.2 s, then click it; then mouse-down on it for 1 s.
Happened: a click finishes the task at once (no sheet, no confirmation); hovering shows no tooltip. The only way to say "I finished it an hour ago", "about then", or to reach Cancelled/Skipped with a time is a 1 s press-and-hold; the sentence that explains it ("Long press: another time, or close it as cancelled or skipped.", `task.doneHint`) is passed as an accessibility hint and is read nowhere on screen. The task's own "Cancel or skip the task…" button opens the same sheet but only in the Cancelled/Skipped mode, with no Done outcome. Inside the sheet "Close task as… Cancelled · Skipped" is a plain grey caption between two rules, not recognisably a control. A person who forgot to tick a task yesterday has to guess a gesture.
Should: show the hint as a tooltip on hover/focus (the way the icon buttons got theirs) and give the sheet a visible way in (a small "At another time…" link or chevron next to Done), and style "Close task as…" as a button.
Guard: e2e that the Done button has a visible way to the sheet without a long press; tooltip test for Done.

### L1 low — Shift+Tab on a phone sheet lands on the invisible full-screen dim
Phone sheets (Rest picker shown), 390×844, non-touch and touch, light EN. Script `S/z1.ts`, screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/sh/z1-shifttab-true.png`.
Steps: open Rest from the time bar (focus on "Short break"), press Shift+Tab.
Happened: focus moves to the dim, a BUTTON "Close" of 390×844 (`tabIndex=-1`) — the focus trap wraps to it; a second Shift+Tab goes to the last row. Tab order itself is right (the dim is not a stop), but a keyboard or switch user can land on a full-screen "Close" with no visible focus ring, and a screen reader would announce a "Close" button that covers the whole page. On a desktop dialog Shift+Tab correctly goes to the ✕.
Should: the trap wraps from the first to the last control inside the sheet and never to the dim.
Guard: extend `e2e/sheet-focus.e2e.ts`: from the first field press Shift+Tab and assert `document.activeElement` is not the dim.

### L2 low — First-sync cover: invisible skeleton in dark, two different ellipses
Cover, 1440 and 390, dark, RU account, pull delayed. Screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/fs/ru-1440-dark-5.png`.
Happened: the grey rows are #181819 on #0B0B0C (about 1.1:1): in dark the cover is a black page with a faint "Syncing your data..." and bars you cannot see. The cover's words end in three full stops ("..."), the strip after 10 s in a real ellipsis ("Still syncing your data…"). At 11.5 s a Russian account still shows English headings ("MONDAY · NOV 2", "Now", "Calendar / Task / Chores / Rest") because the language is read from the data, then flips in one frame when the pull lands (by design since QA 17 M4, noted because the line itself cannot be told apart from the rest).
Should: skeleton bars a step lighter than the surface in dark, one ellipsis character in both lines.

### L3 low — "Undo this event? This cannot be undone."
History → Events → Undo, 1440 light EN. Script `S/c6.ts`, screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/cf/history-undo-open.png`.
The confirm asks to undo and says the undo cannot be undone: it reads as a contradiction and gives no hint of what happens (the event is revoked, the state is rebuilt). The rule under the question is also drawn tight against the text. Should: "Revoke this event? The tasks are recalculated without it." (or say what will change).

### L4 low — A share replaces what was typed; a blank share leaves a dead address
`/add?text=…`, 1440 light EN. Script `S/s3.ts`.
Steps: type "half typed" in Now's line, then open the share URL in the same page (in-app navigation); and open `/add?text=%20%20%20`.
Happened: the line now holds only "Shared over typing" — the typed text is gone, no undo. A whitespace-only (or empty) share stays at `/add?text=%20%20%20` / `/add?text=`, fills nothing, focuses nothing and (on a phone) opens the New task form under Now — the same screen as a bare `/add`.
Should: append the shared text on a new line (or ask), and send a blank share to `/` with the line focused like the others.

### L5 low — The date picker has a tab stop per day
Day → "Pick a day", 1440 light EN. Script `S/k1.ts`.
Focus starts on "Previous month"; Tab then walks Monday, Tuesday, … every day button (30+ stops) before reaching "Next month". Should: one stop for the grid (roving tabindex, arrows move, Enter picks).

### L6 low — The Calendar picker offers the phone calendar on the web
Time bar → Calendar, 390 and 1440, dark/light, RU and EN. Screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/mont/ph-dark-a.png` (first panel). Already named in the round-18 walk and still there: "Calendar from the phone" plus a paragraph about Android settings on a build that has no phone calendar. The sheet now gets the focus (M1 fixed) but the first real choice on the web is "Start a meeting without an event"; the second button does nothing useful. Should: hide it where there is no phone calendar.

### L7 low — "Start from: Homework" looks selected before anything is chosen
Presets, 1440 light EN. Screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa19/cf/presets.png`. The first chip is drawn with the selected style (dark outline, grey fill) although it is a button that opens New preset; all the others are plain. A radio-looking row that is not a choice, and the first one is not a default. Should: the same style for all chips (they are actions), or a visible "New preset from…" label.

## Owner requests: still not met or only partly met

Re-read `context/feedback-2.md`, `-3.md`, `-4.md` against this build.
- Feedback 4, "when loading show skeletons": met on Now and Devices; Day and the Assistant log print zeros and empty sentences while the first sync runs (M1), and the dark skeleton cannot be seen (L2).
- Feedback 4, "Wipe data / Delete account confirmed on the site, then in the Telegram bot": the web half works and Escape cancels it (QA18 L1 fixed); the bot half cannot be run here.
- Feedback 3, "hotkeys shown on the buttons, per OS": shown on desktop (Ctrl+Enter, Enter, Escape, N, F) and absent on a touch phone (QA18 L5 fixed). The one hint a mouse user needs most, Done's long press, is not shown (M2).
- Feedback 4, "tooltip at once on hover": met for the icon-only task actions and Day's arrows; Done's hint is not a tooltip (M2).
- Feedback 4, "share a text to Pace like a new task": met (L4 only about what happens to typed text and blank shares).
- Everything else I could check holds: "Back to today" on Day and Week; Projects "1 task"; Export data; the "Connect an AI app" and "Add a computer" sheets; the per-kind × channel notification matrix with the new "Activity check" name.

## UX heuristics walk (docs/qa.md), breaches beyond the findings above

- Every control earns its place: "Calendar from the phone" on the web (L6); Done and the "Close task as…" caption (M2).
- One way per job: Done (click) and Done at another time (hold) are two ways to one job with only one visible (M2); the New task form is reachable from the sidebar, the composer's + and N — kept by decision.
- Platform conventions: all sheets close on Escape, on the dim (touch) and on ✕ (desktop); focus moves in and returns. The dim is reachable by Shift+Tab on a phone (L1). Autofocusing Title in Edit task on a touch phone will raise the keyboard over a half-height sheet; not checkable here, worth one look on a device.
- The keyboard on a computer: Enter submits, Shift+Enter breaks the line, blank Enter does nothing, Ctrl+Enter saves sheets, Escape closes sheets and confirms; the date picker is the exception (L5).
- State you can see: a task written offline has no per-row "not synced" mark (only the page line — kept since QA18); the preset chip row (L7).
- Feedback and motion: the offline line still pushes the page 37 px (QA18 L11, left); the cover → app switch at 10 s is one frame.
- Copy: "Undo this event? This cannot be undone." (L3); three dots vs ellipsis (L2); "Close task as…" reads as a caption (M2).
- Forms keep their promise: every Day-sheet case above is either saved with the subtitle's days, or refused with the one sentence; every composer path (typed + Enter, Send, + over text, N, share) created or previewed exactly once.
- Overlays in context: the docked toast and the offline strip do not cover the next action; "Still syncing your data…" strip sits above the page and does not cover the sidebar.
- Visual matrix: 22 URLs × 4 combinations plus phone sheets in dark and light with Russian text, no wrapping or contrast problem beyond L2.

## What works well

- Every sheet and picker takes the keyboard to its first field, Escape closes it and the opener gets focus back, on desktop and on an emulated touch phone; the dim closes a phone sheet with a tap.
- The Day sheet has one rule for an end before the start, on yesterday's block, a week-old block, an overnight block, a 30 h block and Log past; the subtitle follows the typed times and the error is the same sentence everywhere.
- Offline: the line shows at once for the browser being offline and within a second for a stopped Worker, without a write; backs off without a storm (8 requests in 115 s); a task typed offline reaches the server within 0.3 s (browser) or 4–7 s (Worker restart) of the connection returning, once, and the line clears with it.
- First-sync cover says "Syncing your data…" with an accessible name; the app after 10 s never prints "Nothing to do right now" in either language; a brand-new account reaches its real empty states.
- Share target: fills, focuses and lands at `/`, repeats for the same text, handles title/url/text combinations, special characters and 3000 characters.
- A sign-out in another tab says "You signed out in another tab." in EN and RU on every other tab, also after a reload, and not on the tab that signed out.
- 0 console errors, 0 failed requests, 0 raw keys, 0 overflow and 0 axe violations across the 176-load matrix.
