# QA round 18 — URLs kept on reload, first-sync cover, offline line, long/overnight Day blocks, second tab, share target

Tester: exploratory Playwright pass on a fresh `build:web` of HEAD `9c91fd5`, served on :4173 against a fresh Worker on :8818 (`--persist-to .cache/qa-state`, `ENVIRONMENT:test`, `LLM_PROVIDER:fake`, ids 7100–7139). Accounts: lived-in RU (`seedLivedIn`, 7101), fresh EN (7102, 7103, 7104, 7106, 7108-7111), EN with long/overnight/overlapping activities (7107). Scripts and screenshots: `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/` (below `S/`). The repository was not touched except this file; both servers were stopped at the end.

Matrix covered: 22 URLs (every route of `apps/app/app`, plus `/task/nope`, `/no-such-page`, `/review`, `/add`) × 1440×900 and 390×844 × light and dark × RU (lived-in) and EN = 176 loads (`S/sw/`, log in `S/sweep.out`): **0 console errors, 0 failed or 4xx/5xx requests, 0 raw message keys, 0 horizontal overflow**. axe (WCAG 2.2 AA, 14 routes × the same matrix, `S/ax.ts`): **0 violations** (the round-17 zero-length Week block finding L8 no longer fires; a 0-minute block is simply not drawn, see L7). Latin-text scan of every RU screen: only product names, user data and the dev session label. Interactive passes: composer (Send, typed + Enter, Approve by Enter, + over typed and empty line, N, To Inbox, paste of two lines, `/add?text=`), the edit and close sheets, time bar pickers (Calendar, Task, Chores, Rest), Day sheet (long, overnight, 30 h, short, retyped ends, garbage times), Week with overlapping short blocks, Projects (new, empty, duplicate, keyboard), Presets, Settings (each switch name, Add a computer, Connect an AI app, Wipe, Delete, Log out), time-zone card, theme matrix against the OS scheme, two tabs, first-sync delay, browser offline and a stopped Worker.

Not testable on the web: phone calendar, usage access, push, the Telegram half of Wipe/Delete, Mac shortcut labels (the OS here is Linux, so "Ctrl" is right). The LLM is the fake provider (a title keeps its time words: not counted).

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 5 |
| low | 12 |

Medium:
- **M1** Edit task and the pickers open with focus on the dim's "Close" button, not on the first field; Tab hits two "Close" stops before the Title.
- **M2** Enter in an empty composer inserts a newline and grows the box.
- **M3** A Day block's end typed before its start gets three different answers (two contradicting messages, or a silent 23 h block).
- **M4** With the Worker stopped, an open tab never shows the offline line until the person writes something.
- **M5** The first-sync cover is a lone skeleton with no label, and after 10 s the app shows a final English empty state for a Russian account.

## Round 17 findings re-tested

| Id | State | Evidence |
|---|---|---|
| M1 second tab stale | **fixed** | `S/h6.ts`: tab B sees tab A's new task after 258 ms, A sees B's edit after 258 ms (A in the background), B's Done removes it from A; no reload. |
| M2 URL lost on reload | **fixed** | `S/f1.ts`: `/day`, `/inbox`, `/add`, `/week`, `/projects`, `/settings` keep their address after load and after F5 at 1440 and 390; `/more` keeps it at 390 and goes to `/` at 1440 (by design). Titles "Day · Pace", "Inbox · Pace". |
| M3 share target | **fixed** (see L2) | `S/f2.ts`, `S/f3.ts`: `/add?text=…&title=…&url=…` fills the composer once ("T Buy milk … https://example.com/a"), the address becomes `/add`, reload leaves the line empty; adding it creates the task; a second share while open refills once. |
| M4 first sync empty states | **partly** | `S/f4.ts`, `S/f5.ts`: a skeleton cover for 10 s, then the app with "Still syncing your data…" (see M5). Under a 4 s delay the app goes straight to data (cover only). |
| M5 no offline indicator | **fixed for the browser being offline**, not for a dead server (M4 below) | `S/f6.ts`: setOffline → "You are offline. Changes will sync when you reconnect." within 1 s; a task created offline appears at once and is on the server 1 s after going online; the line goes. |
| M6 sidebar name | **fixed** | "Dev" is read in full beside the avatar (`S/t0.png`). |
| M7 icon-only tooltips | **fixed** | `S/h3.ts`: Edit details, Pause, Cancel or skip the task…, Delete the task, Close, Previous day all show a tooltip on hover (`S/tabs/tooltip-edit.png`). |
| L6 new project form | **fixed** | Focus goes to the name field, Enter on empty says "Give the project a name.", Escape closes, Tab runs name → swatches → Cancel → Create, Enter creates, a duplicate name is refused (`S/pr1.ts`, `S/pr/`). Focus after Escape goes to the sidebar bell (L9). |
| L9 theme and browser colour | **fixed** | `S/th1.ts`: in all six OS×app combinations `body`, `color-scheme`, `data-theme` and both `meta[name=theme-color]` follow the app theme; the page is already light before the bundle runs on a dark OS. |
| L10 time-zone card | **fixed** | "Keep Europe/Moscow" removes the card; it stays gone after reload (`S/tz2.ts`). |
| L14 overnight sheet start | **fixed** | "Night shift 22:30–06:00" opens with From 22:30, To 06:00 and the subtitle "Sat · Oct 31 – Sun · Nov 1"; a 30 h block opened on day 2 shows From 10:00 To 16:00 and "Fri · Oct 30 – Sat · Oct 31"; saving unchanged wrote 0 events in both (`S/g3.ts`, `S/g4.ts`). |
| Week short blocks | **fixed** | Four overlapping 5–60 min blocks sit side by side, none covers another (`S/wk/week-1440.png`, `week-390.png`). |
| Docked toast | **fixed** | "Created task “hello world” · Undo" keeps its whole text in the 200 px docked card (`S/toast/approve-1.png`). |
| Switch names | **fixed** | "Sign-ins: Telegram", "Deadline digest: Phone", RU "Входы: Веб" …, 12 switches all named "{kind}: {channel}" (`S/f7.ts`). |
| Short block's end later the same day | **fixed** | "Short block" 08:00–09:00 → To 21:30 wrote one `activity.adjusted`, Day shows "08:00 – 21:30, 13h 30m". Retyped end of a 30 h block (16:00 → 18:00) wrote one `activity.adjusted` with the right UTC time. |

## Findings

### M1 medium — Edit task (and every picker) opens with focus on the dim, not on a field
Now, 1440 light EN. Script `S/h4.ts`, `S/h5.ts`; screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/tabs/B-edit-sheet.png`.
Steps: select a task, press the pencil (Edit details), look at `document.activeElement`, press Tab ×3.
Happened: focus is on a BUTTON "Close" (the click-away layer); the next Tab lands on a second BUTTON "Close" (the ✕), only the third on Title. Typing straight away types nothing (my "v2" went nowhere); Calendar, Task and Chores pickers do the same (focus "Close"), Rest picker focuses a DIV. New task (form) and New project do focus their first field.
Should: a dialog puts focus on its first field (Title; the search field in the Task picker) and the dim is not a tab stop (or is hidden from the keyboard).
Guard: an e2e that opens each sheet and asserts `document.activeElement` is in the dialog and is not a Close button.

### M2 medium — Enter in an empty composer types a newline
Now, 1440 light EN, composer "Add a task or paste text". Script `S/to4.ts`, screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/toast/enter-empty.png`.
Steps: click the empty line, press Enter. Then type "hello world" and Enter.
Happened: the field becomes 68 px high with value "\n" and nothing is said; after typing, the text is "\nhello world" (the assistant still reads it). A stray Enter while the shared-text or an N-hotkey flow is on screen leaves the same tall empty box (also seen after approving a task, `S/toast/created2-light.png`).
Should: Enter on an empty or whitespace-only line does nothing (or the old "Type something first." hint); only Shift+Enter makes a line break.
Guard: composer test "Enter on an empty line keeps the value empty".

### M3 medium — A Day block's end typed before its start: three different answers
Day sheet, 1440 light EN. Script `S/g5.ts`, `S/g6.ts`, `S/g7.ts`; screenshots `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/day/err-before.png`, `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/day/err-from-after-to.png`.
Steps: open "Long study 13h" (08:00–21:00, yesterday) and type To = 07:00; open another with From 22:00 To 21:00; open a block on Oct 29 (a week ago) 08:00–21:30 and type To = 07:00.
Happened: (a) To 07:00 on yesterday's block: "That is still ahead: log what already happened." (the end is not ahead, it is before the start; the sheet silently moved it to tomorrow 07:00); (b) From 22:00, To 21:00: "The end must be after the start."; (c) a block eight days ago, To 07:00: saved with no word as a 23 h block ending the next morning (`activity.adjusted endAt 2026-10-30T04:00Z`), Day then shows "08:00 – 00:00, 16h". The subtitle names both days only when the sheet is opened on an already overnight block; it does not change while the person types.
Should: one rule. Either an end before the start means "next day" and the subtitle and the row say so while typing ("Thu · Oct 29 – Fri · Oct 30"), or it is refused with the same words in all three cases.
Guard: activity-sheet test table: (start, typed end, now) → error or accepted with the subtitle.

### M4 medium — A dead server is not announced until the person writes
Now, 1440 light EN. Script `S/ws2.ts`; screenshots `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/off/worker-down.png`, `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/off/worker-down-write.png`.
Steps: sign in, keep the tab open and idle, stop the Worker (not the browser's network). Watch 30 s. Then create a task.
Happened: no line at +5 s, +15 s, +30 s (the live socket is gone, the state still reads "online"); the offline line appears 2 s after the first write. After the Worker came back the line went by itself within 4 s and the task was on the server (no loss). Reload with the Worker down shows the line at once; browser-offline (`setOffline`) shows it within 1 s.
Should: the line follows the socket/heartbeat, so a person looking at a stale screen is told it is stale.
Guard: e2e that stops the proxy to the Worker (or a `page.route` abort on `/api/sync/live`) and waits for the line without a write.

### M5 medium — First-sync cover: no label, odd place, wrong-language empty state afterwards
Now, 1440 dark RU account on an empty browser store, pull delayed 16 s (`S/f5.ts`); screenshots `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/fs/cover-1440.png`, `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/fs/syncing-390.png`.
Happened: for the first 10 s a bare skeleton of six rows sits at x≈430–640, y≈45–380 of a black page: no sidebar, no title, no "Syncing" text, no way out (Log out is unreachable for 10 s, and the page text is empty for a screen reader). At 10 s the app appears under a thin grey "Still syncing your data…" line, but it shows the final "Nothing to do right now." in **English** (the account is Russian; the language is read only after the pull), and the sidebar reads "New task / Now" too, then flips to Russian when the data comes. At 390 the line is a 13 px grey strip above the title.
Should: the cover carries a visible "Syncing…" (and an accessible name), is laid out like the screen it stands for, and the app shown after 10 s must not print "Nothing to do" while the store has no cursor (a skeleton or a short "Loading your tasks…").
Guard: app test "store without cursor renders no empty copy"; e2e with the pull delayed 12 s asserting no "Nothing to do right now" in either language.

### L1 low — Escape does not close the Wipe / Delete confirmation
Settings → Danger zone, 1440 light EN. Script `S/st2.ts`, screenshot `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/st/wipe-open.png`.
Wipe data → "Cancel / Wipe — confirm in Telegram" with focus on Cancel; Escape leaves it open (Cancel works). The Devices revoke confirm closes on Escape (fixed in round 17). Same keyboard rule, two behaviours.

### L2 low — After a share the line is not focused; the address stays `/add`
`/add?text=…`, 1440 and 390. `S/f3.ts`, `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/share-1440.png`. After the fill `document.activeElement` is BODY, so the Enter a person presses next does nothing (I had to click the line first). After adding, the address stays `/add` while the screen is Now, and a reload on a computer opens the empty New task form in the right pane. Should: focus the line (the way N focuses Title) and replace the address with `/` once the line has been taken.

### L3 low — A sign-out in another tab of the same browser says "another device"
Two tabs, 1440 EN. `S/h1.ts`: Log out in tab B; tab A goes to /login within 2.5 s with "You were signed out: this session was ended on another device, or it expired." It is the same device and the same session. Also one 401 `GET /api/me` is logged in tab A (expected). Should: no message or "You signed out in another tab."

### L4 low — New preset shows a bare "Id" field
Presets → Start from Homework, 1440 light EN. `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/pz/preset-open.png`. "Name", "Id" (empty, no hint what it is for or that it is filled by itself), nothing focused on open, the sidebar keeps "Settings" selected, `document.title` "Presets · Pace" (not "New preset"). A person should never type an id.

### L5 low — Keyboard hints on a phone-width layout
390 light EN, New project (`/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/pr/new-390.png`): "Cancel Escape"; New task sheet "Save Ctrl+Enter", the task pane "Done Ctrl+Enter". A 390 px web page is touch-first; the hints cost width and mean nothing there. Show them when a fine pointer exists (`(hover: hover)`).

### L6 low — Small tap targets at 390
`S/tap.ts` (RU, light): the composer's three icons are 36×36 on Now; the task's link row is 15 px high on the task screen; Week blocks "Пошёл в ЦСС 04:06–06:28" and "Музыка" are 31 px wide; switches are 48×24 (meets the 24 px floor, below 44). Everything else on Day, Inbox, More, Projects, History, Notifications is ≥40.

### L7 low — Week: four narrow side-by-side blocks show one letter; a 0-minute block is not drawn
`/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/wk/week-1440.png`: "E", "C", "S", "W" (Email, Call, Snack, Walk), 24 px wide each at 1440 and 14 px at 390, with only the click to learn what each is. "Zero" (16:00–16:00) has no block at all, so it cannot be opened from Week (Day lists it).

### L8 low — Page titles on detail screens
`S/sweep.out`: every `/task/<id>` is "Task · Pace" (not the task's title), `/presets/new` is "Presets · Pace", `/project/<id>` "Projects · Pace". A browser history and the PWA switcher show eight identical "Task · Pace".

### L9 low — Focus after closing the New project form
Projects, 1440. After Escape the focus moves to the sidebar bell ("Notifications"), not to the "New project" button that opened the form; the next Tab starts from the top of the page. Same on Edit task (there it returns correctly to the pencil).

### L10 low — "Connect an AI app" prints the server's configured origin
Settings, 1440 EN. `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/st/1440-ConnectanAIapp.png`: "SERVER URL http://localhost:8787/mcp" while the app talks to :8818 (the origin comes from `/api/instance`). In this stack the Worker was started without that variable, so the copied URL is a dead one; the app itself knows the origin it is using and could fall back to it (also for the "Add a computer" command).

### L11 low — The offline line pushes the whole page down 37 px
`/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa18/off/offline-created.png`: a white strip at the very top with plain grey text (no icon, no colour, no "Retry"); the page content jumps 37 px down on offline and up on return, mid-typing. Prefer an overlay or a reserved row.

### L12 low — "Still doing…?" as a notification kind
Settings → Notifications: the row and the switch names read "Still doing…?: Telegram" / "Всё ещё…?: Телефон" — a question with an ellipsis as a name of a setting. Name the kind ("Activity check") and keep the question for the notification itself.

## Owner requests: still not met or only partly met

Re-read `context/feedback-2.md`, `-3.md`, `-4.md` against this build.
- Feedback 4, "when loading show skeletons": met on the first-sync cover and on Devices; the cover has no label, and after 10 s final empty copy in the browser's language is shown (M5).
- Feedback 4, "Wipe data / Delete account confirmed on the site, then in the Telegram bot": the web half is there ("Wipe — confirm in Telegram"), Escape does not close it (L1); the bot half cannot be run on the web.
- Feedback 3, "hotkeys shown on the buttons, per OS": shown (Ctrl+Enter, Enter, Escape, N); on a Mac untested; on a phone-width layout they are noise (L5).
- Feedback 4, "the name from the Telegram profile at the top of the sidebar": met. "Tooltip at once on hover": met for the icon-only task actions and Day's arrows. "Share a text to Pace like a new task": met (L2 only about focus).
- Everything else I could check holds: the Week does not scroll the page and has night hours and "Back to today"; Day has "Back to today", Previous/Pick/Next; Projects say "1 task"/"No open tasks"; Export data, the Connect an AI app instruction sheet (Claude, ChatGPT, others), the OS picker of Add a computer; notification matrix per kind × channel.

## UX heuristics walk (docs/qa.md), breaches beyond the findings above

- Every control earns its place: the Calendar picker offers "Calendar from the phone" on the web (no phone calendar here) and its text names a path through Android setup; on the web it should say there is nothing to pick.
- One way per job: Inbox is reachable from the sidebar and from the composer's tray icon (kept by decision); Task pane has Edit and a second edit pencil beside the description ("Add description" pencil) — two pencils within 250 px.
- Platform conventions: sheets and pickers close on Escape and on the dim (good); they do not move focus (M1); the danger confirm ignores Escape (L1).
- State you can see: a row created offline carries no "not synced" mark; only the page-level line (M4/L11).
- Forms keep their promise: the Day sheet's Save is enabled with an end that the action refuses in two different words (M3); every composer path (Send, Enter, +, N, paste, To Inbox, share) created exactly one task or inbox note.
- Feedback and motion: the task row disappears after Done with no flicker; the offline strip is a jump (L11).
- Copy: "That is still ahead: log what already happened." for an end before the start (M3); "Id" (L4); "Still doing…?" as a setting name (L12).
- Overlays in context: the docked toast sits over the sidebar's bottom and keeps its text; "Undo" has the accent colour and is reachable; no toast covers the time bar.
- Visual matrix: all four combinations at 390 and 1440 checked on 22 URLs; no wrapping or contrast problem found beyond L7; RU Insights "Переключений в день" no longer breaks mid-word.

## What works well

- Direct URLs and reloads are stable for every tab screen; `/add?text=` fills once and is never refilled.
- A second tab follows the first within about 250 ms and a sign-out in one tab ends both.
- The Day sheet keeps real start and end for overnight and 30 h blocks, saves nothing when unchanged and writes a single `activity.adjusted` when one end is edited.
- Theme reaches `body`, `color-scheme` and both theme-colour metas in every OS/app combination, before the first paint.
- Offline use is lossless: a task made while offline or with the Worker stopped reached the server once the connection returned, with no duplicate.
- 0 console errors, 0 failed requests, 0 raw keys, 0 overflow and 0 axe violations over the whole 176-load matrix.
