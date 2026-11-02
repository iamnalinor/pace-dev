# QA round 21 — sessions and sign-out, share target, close sheet, first sync, offline pill, day sheet, presets, Week, assistant's reasons

Tester: exploratory Playwright pass (intermediate round). Stack: Worker on :8821 (fresh `.cache/qa-state`, `ENVIRONMENT:test`, `LLM_PROVIDER:fake`, ids 9000–9199), web build of HEAD `a76bf6e` (`build:web` against :8821) served on :4173. Accounts: lived-in RU (`seedLivedIn`, 9001 and 9003), fresh EN accounts (9010, 9020–9028, 9040, 9041, 9060, 9061), EN with a runaway block (9030), EN with parallel and zero-minute blocks (9050, 9051, 9052). Scripts and screenshots: `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa21/` (screenshots in `sh/`). The repository was not touched except this file; both servers were stopped at the end by their PIDs.

Method: 1440×900 and 390×844 (plain and an emulated touch phone), light everywhere, one dark screenshot of each changed screen (`sh/dk-*.png`), Russian on the lived-in account, English on fresh accounts and for the Russian account in an English browser. The network log was open on every run (duplicates counted by `nw1.ts`). I did not script the route/axe/overflow matrix (`e2e/route-sweep.e2e.ts` does that). Not testable on the web: the phone calendar, push, the Telegram half of Wipe/Delete, Mac shortcut labels, a real on-screen keyboard (touch focus judged by `document.activeElement` on an emulated touch device), a truly hidden tab (simulated by overriding `visibilityState`), and a real "no model can read it" server (the fake provider always answers: I answered `/api/parse` with the documented `unavailable`/`queued` shapes through `page.route`, so M3 and L7 rest on that mock).

## Summary

| Severity | Count |
| -------- | ----- |
| blocker  | 0     |
| high     | 0     |
| medium   | 4     |
| low      | 10    |

Medium:
- **M1** Enter in a single-line field of a sheet (close sheet's Reason and typed time, Day's activity sheets, Edit task's Title) nothing submits and focus falls to the page body behind the sheet.
- **M2** Opening `/add` (the manifest's share and shortcut URL) shows New task, but no field has the focus; what is typed is lost.
- **M3** When no model can read a text and the rules find nothing (time bar), the line says "The assistant could not read this. Try again." for every reason, including "off" and "out of requests".
- **M4** A first pull that the server answers with HTTP 500 on an empty copy leaves Now saying "Nothing to do right now." for as long as it fails, with no strip, no retry and no word about it.

Low: L1 radio groups are still one tab stop per chip nearly everywhere outside the close sheet (the class of round 20 L7); L2 the close sheet changes height in one frame on an outcome switch; L3 Day's activity sheet offers an end day (tomorrow) that is always refused; L4 preset names are not unique (a second "Work" is accepted and the Category chips read the same twice); L5 two identical `GET /api/usage` on Day's first load; L6 the "public address differs" line under the MCP URL names neither address; L7 the rules' preview card says only "Assistant unavailable" for out of requests, unreachable and off, where the form's line has a sentence for each; L8 close sheet copy (the "Outcome" label twice, the summary says "Done" under a "Submit" outcome); L9 the offline pill is three lines (62 px) in Russian at 390 px and covers list rows; L10 ⊘ and "Other time…" are two buttons for one sheet.

## Round 20 fixes, re-checked

| Id                                                   | State                                                              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 Settings/Presets print defaults during first sync | **fixed**, also after a failed first pull                          | `f1.ts`/`f4.ts`, `sh/f1-desk-light-_settings-during.png` (held pull, after the 10 s cover): grey rows for language, week, time zone, notifications, digest times, quiet hours; only the theme chips are real. Presets and Week the same; Week has no night switch until a pull succeeded. Failed first pull, both a refused connection and an HTTP 500: Settings stays grey (`sh/f4-abort-_settings-16.png`, `f4-500-_settings-16.png`); Week draws a bare grid with no moon button (`f4-abort-_week-16.png`). A returning copy (store on the device) shows its stored values at once, by design. Every other data route at 390 after the cover: grey rows under the pill (`sh/m-f1-phone.png`). See M4 for what the rest of the app says after a failed pull. |
| M2 close sheet focus on Cancelled/Skipped            | **fixed**                                                          | `c2.ts`: ArrowRight/ArrowLeft move the choice and keep the focus on the chip; a mouse press on Cancelled puts the cursor in Reason (and keeps it there on Skipped); on touch no field is focused (`c7.ts`). Shift+Tab/Tab stay inside. Escape returns focus to the opener. See M1 for Enter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| M3 share replaces the typed line                     | **fixed**                                                          | `sh1.ts` (desktop and touch): in-page share after typing → "half typed⏎Shared over typing"; a blank share changes nothing; a load share appends after the restored draft; title + text + url join in one line; the line is focused, and a bare `/add` opens New task. The draft is gone after sign-out and sign-in (`sh4.ts`). See M2 for the bare `/add` focus.                                                                                                                                                                                                                                                                                                                                                                                               |
| L1 Add a computer focuses a text field on touch      | **fixed**                                                          | `sf1.ts touch`: first focus is the "Create token" button. All 11 sheets I could open on touch focus a non-text control; on desktop a text field (Name, What) or the first control.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| L2 offline line lingers, no Retry                    | **fixed**                                                          | `o1.ts`–`o3.ts`: pill after ~0.5 s, "Retry" is a 44 px button, an `online` event pulls at once and the pill goes; the pill sits low (y≈608 at 1440×900, above the running panel at 390) and covers no header control (`o3.ts` header list); a sheet draws above it. See L9.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| L3 bare chevron, Done tooltip                        | **fixed**                                                          | Done's tooltip is "Closes the task now." («Закрывает задачу сейчас.»); the way into the sheet is a labelled "Other time…" button on the desktop pane and an icon button with a tooltip and an accessible name on the phone (`tp1.ts`, `sh/c6-touch-task.png`). See L10.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| L4 default time rejected in the first minute         | **fixed**                                                          | `c5.ts`: new task, within seconds "Pick a time" → Done is enabled with the pre-filled time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| L5 typed-time wording                                | **fixed for (a) and (b); (c) still open**                          | The chip is "Pick a time"; the summary reads "22:08 · happened yesterday 18:00", "happened Oct 31 09:30", "happened tomorrow 08:00" (`c4.ts`). The date and time are still plain `YYYY-MM-DD` / `HH:MM` text boxes (the app has a calendar sheet and does not use it here).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| L6 no way back to Done, sheet jumps in height        | **half fixed**                                                     | One outcome row (Done/Submit · Cancelled · Skipped) lets you go back (`c2.ts`). The height still changes in one frame, see L2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| L7 chips one tab stop each                           | **fixed in the close sheet, class not swept**                      | Close sheet: one stop per group, arrows move. Elsewhere not, see L1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| L8 History says "Task closed"                        | **fixed**                                                          | `h1.ts`: "Task skipped · Gamma task", "Task cancelled · Beta task".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| L9 duplicate first-load requests                     | **fixed for Now, Settings, Week, Presets, Assistant log; not Day** | `nw1.ts`: one of each on Now (`me`, `instance`, `calendar`, one `pull?since=0`, `notifications`, one socket). Day sends `GET /api/usage?…` twice within 0.2 s, see L5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

New in this round and checked without finding anything: logout in one tab → the other tab goes to /login with "You signed out in another tab." and the tab that logged out shows no note; a frozen (stale) tab thawed after the person signed in again lands on /login and leaves the new session alone (token in storage unchanged, A still signed in after a reload; `so1.ts`, `so2.ts`); revoking a session from another device signs the tab out in <1 s with "this session was ended on another device" (`so4.ts`), a simulated hidden tab signs out when it is shown again within 2.5 s; Settings → Devices → this device with a DELETE that never answers: a spinner for 15 s, then "Couldn't end the session. Try again." with the confirm still open and the app still usable (`so3.ts`, `sh/so3-desk-hang-t5.png`, `-t17.png`); presets: no Id field, "New preset" title in the tab, tab titles name the task, project and preset (`t1.ts`); the Day date picker has one tab stop, arrows, Home/End, PageUp/PageDown, Enter (`dp1.ts`); Day's start/end day chips (`d6.ts`) cut a runaway block back (Sat 07:31 → Mon 19:32 became Sat 07:31–12:00, Mon shows nothing, `d8.ts`); Week: tooltips on narrow blocks (hover and keyboard focus), 0-minute blocks drawn (`w4.ts`), seven lanes on a phone drawn in a widened column with a "Swipe to see all days" cue and a focusable scroller (`sh/w5-touch-prev-right.png`); switches have a 44 px hit area (taps 8 px above and below toggle, `tt2.ts`); the account's language arrives with no English navigation flash for a Russian account in an English browser (`ln1.ts`); the reasons "couldn't read this one" for `unreadable` and "Read it when it's back" for `limited`/`unreachable` only (one press → one `defer` request, a toast "Saved: the assistant reads it when it is back (about 20:06)", no repeats, `as1.ts`).

## Findings

### M1 medium — Enter in a single-line field of a sheet drops the focus to the page body and submits nothing

Close sheet (Reason; typed Date/Time), Day → activity sheet and Log past (What, From), Task → Edit (Title): 1440×900, light, RU. Scripts `c11.ts`, `en1.ts` (output below).
Steps: open "Other time or outcome…" → Cancelled, type a reason, press Enter (or pick "Pick a time", type 08:00, press Enter). Same with Day → Log past → What → type → Enter, and Task → Edit → Title → Enter.
Happened: the dialog stays open, nothing is submitted, and `document.activeElement` becomes `BODY` outside the dialog (`INPUT "Причина"` → `BODY`; `INPUT "Время"` → `BODY`; Day's What and From → `BODY`; Edit task's Title → `BODY`). The next letters typed go to the page behind the dim (the app has one-key shortcuts, N and F); a following Tab re-enters the sheet at its first stop. The button reads "Ctrl+Enter", so Enter is meant to do nothing, but it also takes the cursor away. "Add a computer"'s Name behaves: Enter moves on to the next control.
Should: Enter in these fields keeps the focus where it is (or moves to the next control as Add a computer does); nothing leaves the sheet.
Guard: extend `e2e/sheet-focus.e2e.ts`: for every sheet with a text field, type and press Enter; assert the focus is still inside the dialog. Same class as round 20 M2 (a key press in a sheet drops the focus to the body).

### M2 medium — A direct load of `/add` opens New task with no field focused; typed text is lost

`/add` loaded by URL, 1440×900, light, EN. Scripts `sh2.ts`, `sh3.ts`, screenshot `sh/sh3-add-typed.png`.
Steps: load `http://localhost:4173/add` (it is the manifest's share-target action and the way a PWA shortcut or a bookmark opens New task); wait 3 s; type "Water plants".
Happened: the form is open in the right pane, `document.activeElement` is `BODY` at 0.5, 1.5 and 3 s, and the Title stays empty (the typed text goes nowhere). Opened in the page (history push of `/add`), by the N key or by the sidebar's New task, the Title is focused. On a touch phone no field is focused by design. Round 20 found the Title focused on desktop for this URL.
Should: the same Title focus on a load as on every other way in.
Guard: add `/add` loaded by URL to the focus e2e (the "every way in" table row for the composer has "a share (`/add`)").

### M3 medium — The time bar says "The assistant could not read this. Try again." for every reason when the rules find nothing

Now → time bar ("What are you doing?"), 1440×900, light, EN; composer line when the answer has no actions. Scripts `as3.ts`, `as1e.ts`, screenshots `sh/as3-desk-limited.png`, `sh/as3-desk-off.png`, `sh/as1e-desk-off-soon.png` (answers mocked with `page.route` to `/api/parse`: `{status:"unavailable", reason:"limited"|"off", retryAt, actions:[]}`).
Steps: answer the parse with an `unavailable` answer that has no actions (the rules found no span in "Reading a book for an hour"); type that text in the time bar and press Enter.
Happened: the line under the bar says "The assistant could not read this. Try again." for `limited` (out of requests) and `off` (this server has no assistant), no "Read it when it's back" for `limited`. "Try again" cannot help for `off`; for `limited` the retry time is known. `readingIssue` (`apps/app/src/shared/assistant/reading-issue.ts`) treats every `status !== "parsed"` as `couldNotRead` and never reads `reason`.
Should: the same sentences as the form's line (`composer.aiUnavailable`, `aiOff`, `aiFailed`, `aiUnreadable`) and "Read it when it's back" for `limited`/`unreachable`.
Guard: an app test of the time bar and the composer line per `reason` with an empty `actions`. Class 99 (say why no model read it), one more entry path.

### M4 medium — A first pull answered with HTTP 500 on an empty copy shows "Nothing to do right now." and nothing says why

Now, 1440×900, light, RU lived-in account in a new browser profile; pulls and the socket held back by `page.route` (`f4.ts 500 /`, `sh/f4-500-_-16.png`).
Steps: sign in on an empty copy while `GET /api/sync/pull` answers 500 (a failing deploy, an overloaded Worker); wait 16 s.
Happened: the cover ends at the first failure, Now draws its final empty state "Сейчас дел нет." for an account with seven tasks and stays that way (the pull retries at 3.7, 7.7, 15.7 s). No pill, no strip, no Retry: the strip appears only when the server cannot be reached (`f4.ts abort /` gives the pill with "Retry"). The other routes behave alike (Day "Nothing recorded", Projects "No projects yet", and so on); Settings, Presets and Week's night switch stay grey, so the same account is both unknown and empty on one screen. The code comment says "a failed sync ends it too (the offline strip says why)"; with a 500 no strip says anything.
Should: a failed first sync keeps rows grey or shows one line ("Couldn't load your data. Trying again…" with Retry) instead of the final empty copy; at least the pill for any failed first pull.
Guard: extend `e2e/sync-state.e2e.ts` with a first pull that answers 500: no `EMPTY_COPY` text, a visible line.

### L1 low — Radio groups outside the close sheet are still one tab stop per chip

1440×900, light, RU. Script `r1.ts` (output: group, size, tab stops).
Happened: Settings Theme (3 stops) and Language (2); Now's project filter (3); the New task form's Start (3) and Repeat (6); Day's activity sheets' category (12 chips, 12 stops, `d2.ts`); Preset editor: Inherits 4, Default importance 4, Due 2, Handing in 2, Progress 3, Colour 10 (25 stops). Only the close sheet, the New task form's Category/Importance/Project, the date picker and the day chips are one stop per group with arrows.
Should: one stop per group, arrows move (round 20 L7's class). Several of these are `role=radio` without a `radiogroup` around them.
Guard: a unit or e2e check over every `[role=radio]` group: exactly one `tabindex=0`; fail on a radio without a group.

### L2 low — The close sheet changes height in one frame on an outcome switch

Close sheet, 1440×900 and 390×844, light, RU. Script `an1.ts`.
Steps: open the sheet, press Cancelled.
Happened: the sheet's height goes 462 → 545 px between two frames and its top moves 219 → 178 px (desktop; 517 → 600 on a phone): Reason appears with no animation, the title jumps 41 px.
Should: a height animation (a form unfolding is animated, docs/qa.md "Feedback and motion"); round 20 L6 asked for it.

### L3 low — Day's activity sheet offers an end day that is always refused

Day → a block that spans days (stopped runaway), 1440×900, light, EN. Script `d8.ts`, screenshot `sh/d8-desk-future_end.png`.
Steps: open the block (Sat Oct 31 07:31 – Mon Nov 2 19:32), pick "Ends Tue · Nov 3", set To 10:00, Save.
Happened: the chip "Tue · Nov 3" (tomorrow) is offered next to the past days; any choice there is answered "That is still ahead: log what already happened." The sheet stays open. (A start after the end is also refused with a sentence, which is fine.)
Should: offer only end days that can be accepted.

### L4 low — Preset names are not unique

Presets → new, 1440×900, light, EN. Scripts `p3.ts`, `p4.ts`, `p5.ts`, screenshots `sh/p4-list.png`, `sh/p5-newtask-dupes.png`.
Steps: Start from "Homework" → Name "Gym" → Save, twice; then "Work" and "Personal".
Happened: all are accepted. The list shows two "Gym" rows and a "Work" (Yours) beside the built-in "Work" (Default); the New task form's Category chips read "Homework, Work, Personal, Deferred, homework, Personal, Ünïcode ✓ name, Work": two chips named "Work", two "Personal".
Should: refuse a name that is already used (the id is now made from it) with one sentence, or tell the chips apart.

### L5 low — Two identical `GET /api/usage` on Day's first load

Day, 1440×900 and 390×844, RU. Script `nw1.ts /day` (0.9 s and 1.1 s, same `from`/`to`). Class of round 20 L9; the route sweep's two-second window saw it settle, not the doubled start. Should: one request shared by both callers.

### L6 low — The "public address differs" line says neither address nor what to do

Settings → Connect an AI app, 1440×900 and a touch phone, EN and RU. Screenshot `sh/g1-desk-en-GB.png`. The Worker's public URL here is `http://localhost:8787/mcp` (the default) while the device uses :8821. The line under the field reads "This server's public address differs from the one this device uses." («Публичный адрес этого сервера отличается от того, что использует это устройство.»). Should: say which address the device uses and that an app outside this computer must use the one shown (or that the shown one may not be reachable).

### L7 low — The rules' preview card says "Assistant unavailable" for three different reasons

Composer line, Enter, 1440×900, light, EN. Screenshots `sh/as1-desk-limited-soon.png`, `sh/as1-desk-off-soon.png` (mocked answers). `unreadable` → "The assistant couldn't read this one. These actions come from local rules"; `limited`, `unreachable` and `off` → the same "Assistant unavailable. These actions come from local rules; check them before approving." The form's line (`composer.aiUnavailable`, `aiFailed`, `aiOff`) has its own sentence for each ("out of requests until about 20:06", "could not be reached", "This server has no assistant"). "Unavailable" for a server with no assistant at all is wrong. Should: the card (`RulesNote` in `action-cards.tsx`) uses the same four sentences.

### L8 low — Close sheet copy

Close sheet, 390×844 and 1440×900, RU. Screenshots `sh/c8-phone-typed.png`, `sh/c2-cancel-click.png`.
(a) "Outcome" («Итог») is the label of the segment row and again the first row of the summary box under it, which says "Outcome: Done · before the due date". (b) On a task handed in by subtasks the segment says "Submit" («Сдать»), the sheet title "Submit 290" and the summary "Done · before the due date" («Сделано · до срока»). (c) The grey summary box still has a rule under it that touches its bottom edge (round 20's cosmetic list, the same look). Should: one word per outcome in both places; drop the second "Outcome".

### L9 low — The offline pill is three lines in Russian at 390 px and covers list rows

Now, 390×844 (plain and touch), RU, offline. Screenshot `sh/o3-touch-pill.png`; `o5.ts` (pill 358×62 at y=505, over the "Без срока" header or the last task row; a task's tap target 34 px under it). The text "Нет сети. Изменения синхронизируются при подключении." plus "Повторить" wraps to three lines; the icon sits on the first line. Not a blocker (it floats where the toast sits, never over the header, the sheets draw above it). Should: a shorter sentence ("Нет сети. Синхронизируем при подключении."), or a two-line pill.

### L10 low — ⊘ and "Other time…" are two buttons for one sheet

Task pane (1440) and task screen (390). The ⊘ "Cancel or skip task…" in the header and "Other time or outcome…" next to Done open the same sheet; ⊘ preselects Cancelled, the other Done. The sheet now holds the three outcomes in one row, so the two entry points are one job twice (docs/qa.md "One way per job"). Should: keep one, or keep ⊘ only where it saves the person a press and say so in its tooltip.

## Round 20's open lows (cosmetic list), one line each

- Settings → Devices: with one row's "End this session?" confirm open, another row's plain "Revoke" is 8 px under the confirm's red "Revoke" (`sh/dv1-confirm.png`, `dv1.ts`: y 482+48 and 538+48): **still there**.
- The close sheet's rule touching the buttons' bottom edge: the old "Close task as…" block is gone; the same tight rule remains under the summary box (L8c): **still there, moved**.
- Presets' "Start from" row has no verb: **still there**.
- The bell counts "Signed in from Dev login" entries with "United States, Columbus" for 127.0.0.1: **still there** (a dev-login artefact; not a product issue).

## Owner requests not met

Re-read against this build (`context/feedback-2.md` to `-4.md`):
- "When loading show skeletons": met on every data route in the first-sync state and for the first pull that never answers; not met for a first pull that fails (M4).
- "Tooltip at once on hover": met for Done, Other time, the header actions, the Week blocks and the week arrows.
- "Hotkeys shown on the buttons": met on desktop (Ctrl+Enter, Enter, Escape, N, F); absent on a touch phone; the 390 px non-touch window shows them (known).
- "Share a text to Pace like a new task": met in the page and by load; the bare `/add` focus is M2.
- "Wipe data / Delete account confirmed on the site, then in the Telegram bot": the web half unchanged; the bot half cannot be run here.

## UX heuristics walk (docs/qa.md), breaches beyond the findings above

- Every control earns its place: "Other time…" and ⊘ (L10); the Previous-week arrow's tooltip sits over the "1 Sun" header while the pointer stays on the arrow (cosmetic).
- One way per job: see L10.
- Platform conventions: every sheet closes on Escape, on the dim (touch) and on ✕ (desktop); focus returns to the opener; Shift+Tab never lands on the dim (`sf1.ts`: the picker sheets on desktop, and on touch Day's three sheets, the date picker, Edit task, the close sheet in both modes, Add a computer and Connect an AI app). The exception is a key press inside a sheet (M1).
- The keyboard on a computer: Ctrl+Enter submits, Enter does not and drops the focus (M1); radio groups cost a stop per chip (L1); `/add` by URL (M2).
- State you can see: Settings, Presets and Week's night switch are grey until the account is known; the offline pill says why; a failed first pull says nothing (M4).
- Feedback and motion: the close sheet jumps (L2).
- Copy: "Pick a time", "happened yesterday 18:00" and the reasons in the form's line are clear; the card's wording (L7), the time bar's "Try again" (M3) and the "differs" line (L6) are not.
- Forms keep their promise: Day's end-day chip for tomorrow (L3); a preset named like another (L4); Done accepted with the sheet's own default in a task's first minute.
- Overlays in context: the pill never covers a header control or a sheet's actions (the sheet is above it); at 390 px in Russian it covers list rows (L9).
- Visual matrix: Russian at 390 and 1440 in light, and the changed screens in dark (`sh/dk-*.png`, `sh/m-dk-*.png`): no wrapping, contrast or clipping problem beyond L8 and L9. The Day activity sheet with the day chips is taller than 900 px at 1440×900 and scrolls inside (Save is cut at the bottom edge until scrolled, `sh/d6-desk-stopped-edit.png`), without a cue; cosmetic.
- Guest language: `/login` follows the browser (`lang=ru`, title «Вход в Pace»); the Telegram widget's white "Bot domain invalid" box on localhost is the widget's own (dev origin), not the app.

## What works well

- First sync: the cover, the "Still syncing" pill after 10 s and grey rows on every data route; Settings, Presets and Week keep their account values grey after a failed pull; the account's language arrives without an English flash.
- The close sheet: one outcome row with one tab stop and arrows, Reason gets the cursor on a mouse press only, "Other time…" button, the typed-time preview names the day, History names the outcome, the first-minute default is accepted.
- The offline pill: low, 44 px Retry, a pull on `online`, nothing covered in the header, hidden under sheets.
- Sessions: a stale tab never ends a newer session, "another tab" shown only where it is true, a never-answered end of this device recovers with a sentence after 15 s and keeps the app working.
- Share target: appends after the half-typed line on desktop and touch, blank share changes nothing, the draft is forgotten at sign-out.
- Day's day chips, the date picker with arrows, Week's tooltips, 0-minute blocks and the six-lane phone columns; 44 px switches; tab titles that name the task, project and preset.
- The runs I read the log of (Now, Settings, Day, Week, Presets, sheets) showed no console error or failed request except the ones I caused on purpose (offline, aborted, 500, a held DELETE).
