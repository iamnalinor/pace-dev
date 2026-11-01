# QA round 15 — phase C (devices and sessions, sign-in notices, live sync, versions screen)

Tester: exploratory Playwright pass on the web build (fresh `--persist-to .cache/qa-state`, dev login, `ENVIRONMENT:test`, fake LLM), HEAD `4b6bb43`. Accounts: fresh EN accounts, a fresh RU account and the lived-in RU account (`seedLivedIn`). Scripts and screenshots: `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa15/` (below `S/` = that folder). Matrix covered: 390 and 1440, light and dark, EN and RU (Settings list, both sheets, inline confirm, skeleton, error, versions screen, feed: 0 axe violations, 0 overflow in all of them; a 15-route sweep on EN and RU, both widths and themes, found only the known Insights RU 390 axe item).

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 1 |
| medium | 4 |
| low | 16 |

High and medium:
- **H1** The notification feed fires ~70 `POST /api/notifications/read` (+ `GET`) per second, forever, and the bell never clears (own sign-in notice).
- **M1** Revoking a session that is already gone shows "Couldn't end the session. Try again." forever; the list never refreshes.
- **M2** Enter in the Add-a-computer name field does nothing; no shortcut on "Create the token"; initial focus is not on the field.
- **M3** Phone inline confirm: Cancel jumps up beside the question and the red action wraps below it (order reversed against desktop).
- **M4** Focus falls to `<body>` after a successful and after a failed revoke / disconnect (bug class 5).

---

## Findings

### H1 high — Notifications screen hammers the server in a loop; own sign-in notice can never be read
Notifications feed (`/notifications`), 1440 light EN (same at 390 and RU), any account with an unread sign-in notice for the current session (every dev login creates one). Scripts `r3.js`, `r4.js`, `r5.js`.
Steps: sign in, wait on Now (bell says "Notifications, 2 unread"), open the bell. Count requests for 4–5 s.
Happened: 272 `POST /api/notifications/read` in 4 s on the feed (154 in 5 s on one account, 77 on another); the same count of `GET /api/notifications?limit=50`; it does not stop while the page stays open (193 more in the next 5 s). Every POST answers `{"ok":true}` but the newest sign-in notice (about this very session) stays `readAt: null`; the POST body shrinks from `[own, older]` to `[own]` and repeats. After leaving the feed the bell still says "1 unread". Verified by the API alone: `POST /api/notifications/read {ids:[own, older]}` marks `older` and leaves `own` unread.
Should: no request loop; either the own-session notice is read like any other (it only cannot be *answered*), or the feed stops asking for what the server will not mark and does not count it as unread.
Probable cause (read-only look): `markRead` in `apps/api/src/user-store/pool-rows.ts` deliberately skips a login notice whose `ref` is the reader's own session (`ownSignIn` filter), while `NotificationsScreen`'s effect in `apps/app/src/features/notifications/notifications-screen.tsx` keeps re-marking every id the model calls unread after each refresh/`read` broadcast. A request storm on a Worker also costs quota. Class: a client "make it so" effect against a server that silently refuses part of the request (no test with a notice the server will not mark). Guard idea: a client test that the feed marks at most once per id set, plus an API test that the unread count excludes what `read` skips.
Screenshots: `S/g1-feed.png`, `S/en-1440-light-bell.png`.

### M1 medium — Ending an already-ended session fails forever; the list is not live
Settings → Devices and sessions, 1440 EN. Script `o1.js`.
Steps: open Settings, then end a computer's session from elsewhere (`DELETE /api/sessions/:id` from another token), then press Disconnect → Disconnect in the row.
Happened: `DELETE` answers 404, the row stays with its confirm open and the line "Couldn't end the session. Try again." appears below the list; pressing again repeats the same 404. The list is also not live: a computer added elsewhere (`Live Agent` via the API, waited 6 s) and a session revoked elsewhere do not appear/disappear until reload.
Should: a 404 on revoke means "already ended": drop the row and refresh the list (the goal is reached); the list reloads on focus/return, or on the live "session changed" notice.
Screenshot: `S/o1-failed-1440.png`.

### M2 medium — "Add a computer": Enter does not submit; no shortcut shown; focus not on the field
Add a computer sheet, 1440 and 390, EN. Scripts `d1.js`, `d2.js`.
Steps: Add a computer, type a name, press Enter.
Happened: nothing (no token, no message); afterwards focus is on `<body>`. "Create the token" shows no Enter hint (every other primary form button does: Create, Save, Done, Approve). On open, focus lands on the dialog container ("DIV Add a computer / Name / Create the token") at 1440 and on "Close" at 390 and in other runs, not on the Name field. The name field is prefilled "My computer", so an empty-by-hand submit is never tested, and several identical "My computer" rows can be created.
Should: the name field is focused and selected on open, Enter creates the token, the button reads "Create the token  Enter".
Screenshot: `S/d2-after-enter.png`, `S/d1-add-step1-1440.png`.

### M3 medium — Phone: the inline confirm's actions come out in the wrong order
Settings, 390, EN and RU, light and dark (`S/o2-s.png`, `S/o2-confirm-en-light.png`, `S/o2-confirm-ru-dark.png`).
Steps: tap Revoke on a browser or app row.
Happened: the question and "Cancel" share one line (Cancel right-aligned text), and the red-outlined "Revoke" wraps onto a second line, left-aligned, under them: the main action sits below its own Cancel, left, while at 1440 they are on one line (Cancel, then Revoke on the right). RU "Завершить этот сеанс?" does the same.
Should: one stable order (question above, then Cancel + the action side by side, or both full-width halves), the same on every width.

### M4 medium — Focus is dropped after ending a session (bug class 5)
Settings, 1440 EN, keyboard and mouse. Script `o1.js`.
Happened: after a successful Revoke/Disconnect `document.activeElement` is `<body>` (the row and its confirm disappear); after a failed attempt (network aborted) it is `<body>` too, while the confirm is still open. The e2e only covers Cancel returning focus.
Should: success: focus moves to the next row's action, or the list heading/Add a computer; failure: back onto the confirm's action (or the alert).

### L1 low — Escape does not cancel the inline confirm
Settings 1440: open a confirm, focus stays on Cancel, press Escape: the confirm stays. Desktop convention (Escape closes) is met by both sheets but not by the confirm. Several confirms can also be open at once (computer and app rows together, `S/c1-confirm-mcp-1440.png`).

### L2 low — A remote revoke signs this browser out without a word
Script `h2.js`: ending A's session from B signs A out in 269 ms, even with HTTP sync blocked (good), but A lands on the login card with no "You were signed out" line; the console gets 401s (`/api/me`, `/api/sync/pull`, `/api/notifications`, 4× `/api/calendar`) and revoking "This device" from the list additionally sends a `POST /api/auth/logout` that answers 401 (script `c2.js`). Screenshot `S/h2-after-revoked.png`.

### L3 low — Versions screen on a computer is pinned to the left edge
1440, light and dark, EN and RU (`S/j2-versions-en-1440-light.png`, `S/j2-versions-ru-1440-dark.png`): heading, text and a small "Log out" sit in the left gutter of a full-bleed page (no logo, no centred card, no max width), while the login card is centred. At 390 it is fine (`S/j2-combo.png`). Works as specified: 404 JSON and 404 HTML block, 429, 500, 503, abort and a 200 HTML page do NOT; a protocol mismatch gives the "Update the app" text; Log out is the only control (first Tab lands on it); `/settings` while blocked shows the same screen; with the route fixed and a focus/visibility event the app comes back by itself; Log out reaches the login card.

### L4 low — Revoke / Disconnect look like labels, and sit 16 px off the right edge
Settings 1440 and 390: the row action is plain grey text, no border (the page's other actions are outlined), its right edge is at x=1236 while the switches and chips above end at 1252. Tap target is 84×48, fine. The inline confirm's red outlined button is the first moment it looks like a button.

### L5 low — Rows say little: kind, last use, full names
- Browsers, phones and AI apps have an icon only; the strings `sessions.kind.*` ("Browser", "Phone app", "AI app") are not shown. The owner asked to classify browser / app / agent. An AI app row ("Claude (QA)") has no second line at all (no scope, no "last used").
- Long names are cut with an ellipsis at 390 with no way to read them (no title, no wrap): `S/f1-combo.png` (an unbroken 90-character computer name, an AI app with a long name).
- Exact time for data older than 8 h works ("Last data Oct 31, 19:09", with the year when it is not this one); a time ahead of now reads "Last data just now".
- IPv6 addresses wrap over three lines at 390.

### L6 low — Settings bottom: Export data, Log out and Danger zone
- 390: Export data and Log out fill the width, but "Wipe data" and "Delete account" are content-width (inconsistent, `S/m1-sess-en-390-light.png`).
- 1440: Export data and Log out are two separate content-width buttons stacked in a column; "Danger zone" has no divider or space above it (8 px under Log out); "Delete account" is a bare text link beside a bordered "Wipe data". The owner's complaint "buttons too wide on PC" is met, but this stack looks unplanned.
- Export data downloads `pace-2026-11-01.xlsx` but gives no feedback at all (no toast/"Downloaded").

### L7 low — Sheets: small inconsistencies
- "Copy the command" is the lime primary, "Copy the URL" / "Copy the token" are white secondary: two different looks for one job.
- The token warning ("shown only now… Lost it?") is a paragraph of alarm red; "Done" is below the fold and the sheet has to be scrolled at 1440×900 (Windows) and at 390.
- The OS picker always starts on Windows, whatever the browser's OS.
- Connect an AI app: first focus is "Close", not Copy; the URL field is read-only text with a separate button (fine).

### L8 low — Web Interface Guidelines checks on the sessions sheets (DOM)
Both sheets have `role="dialog" aria-modal="true"` but no `aria-label` / `aria-labelledby` (no accessible name; axe does not flag it); the Name input has `name=""`, `autocomplete="on"`, `spellcheck=true`, no `enterkeyhint`, no placeholder; `html` `color-scheme: normal` also in the dark theme (native scrollbars/inputs/`select`); sheets have `overscroll-behavior: auto`. Focus rings are fine (browser `auto` ring visible in both themes, `S/u2-s.png`).

### L9 low — Duplicate requests on every load
Now, 1440: `GET /api/calendar?from=…` twice and `GET /api/notifications?limit=50` twice within 20 ms; `/api/sync/pull` twice on a signed-in start (script `q2.js`, counts over the sweep in `q1.js`).

### L10 low — Wording and locale
EN "End anything you do not recognise" (British; the app is US everywhere else: "Color"); RU country names come from the browser and read «Соединенные Штаты» (ё missing: «Соединённые»); RU session rows keep the English "Dev login" (dev only); RU error-state "Попробовать снова" is a ghost button indented by its padding under a flush-left line (`S/f1-combo.png`).

### L11 low — Sign-in notice rows
Feed 390/1440, EN/RU (`S/r1-feed-*.png`): the notice about this session correctly has no "Not me" and the other ones do (live: the badge changes within ~30 ms of a new sign-in, a new row appears live, "Not me" ends the other session at once: `/api/me` 401 for it, A stays 200, the row turns into "Session ended"). But: the own notice is not marked "this device" (same words as the others); "Not me — end this session" is the lime primary with no confirm for an irreversible act (RU «Это не я — завершить сеанс»); a notice about a session already ended in Settings still offers "Not me" after reload (8 buttons, 0 "Session ended"), and pressing it does answer "Session ended".

### L12 low — Web notification settings (what the web shows of the picker)
The method picker ("Automatic / Google / Background check (every ~15 min) / Only in the app") is phone-only (`IS_PHONE`), so on the web nothing is rendered: no picker, no hint, no line saying how the web gets notifications. The channel matrix (Telegram | App | Web; RU Telegram | Телефон | Веб) still offers a "Web" column with no explanation of what it does in a browser. Not screenshotted: it cannot be shown on the web build; check on a device (release checklist).

### L13 low — Information for the next round (not defects)
- Live sync works: a task added in a 1440 tab shows in a 390 tab in 865 ms with `**/api/sync/{push,pull}` aborted in both (script `i1.js`); with the socket refused and HTTP open the other tab needed 24 s (`i2.js`, 5 socket attempts; documented 30 s safety poll).
- A 404 with an HTML body on `/api/instance` (a proxy that does not route `/api`) blocks like the JSON 404; the brief only exempted 429 and a 200 HTML page.
- The sign-in screen at 1440 shows the Telegram widget's own error "Bot domain invalid" in a serif font on localhost (environment, not product).
- "Wipe data → Confirm in Telegram" answers 503 here (no bot token): the message "Не удалось создать запрос. Попробуйте ещё раз." is plain; the second factor itself cannot be checked in this environment.

### L14 low — Insights RU 390 `scrollable-region-focusable` (round 11 L8), unchanged
Also unchanged: `document.title` is "Pace" on every route (L11/round 11) and the toast/To Inbox items of round 14 L10.

### L15 low — A same-name pile
The list can hold many rows with the same name and no distinguishing line (dev logins; several "My computer"), so "End anything you do not recognise" cannot be acted on from the row alone; browsers carry a place and IP (good), computers do not carry their created time.

### L16 low — Order of the list
Rows are in creation order with AI apps last (no last-seen); computers and browsers are interleaved, so a person looking for "my computers" scans every row. Consider kind groups or a last-used order.

---

## Design pass (`dev-core:web-design-guidelines`; `dev-core:impeccable` critique)

Method: the web-design-guidelines rules were checked against the rendered DOM and the screenshots below. `dev-core:impeccable` critique could not run as specified here: its method requires two sub-agents and persists a snapshot under `.impeccable/` in the repo, which this round must not touch; what follows is the in-context critique in its Operate mode (settings/admin: scanability, consistency, native expectations), so treat it as a degraded run.

Screens and paths (all light/dark × EN/RU where listed):
- Sessions list: `S/m1-sess-en-390-light.png`, `S/m1-sess-ru-390-dark.png`, `S/m1-sess-en-1440-light.png`, `S/m1-sess-ru-1440-dark.png` (the other four combinations are `S/m1-settings-*.png`, full-length pages).
- Skeleton and error: `S/f1-combo.png`, `S/f1-skeleton-{en,ru}-{light,dark}.png`, `S/f1-error-{en,ru}.png`; odd data (long names, dates, IPv6): `S/f1-odd-en-US.png`.
- Inline confirm: `S/c1-confirm-computer-1440.png`, `S/c1-confirm-mcp-1440.png`, `S/c2-confirm-this-1440.png`, `S/o2-confirm-{en,ru}-{light,dark}.png`, `S/o2-s.png`.
- Add a computer: `S/m2-add-{en,ru}-{390,1440}-{light,dark}.png`, `S/d1-add-{Windows,macOS,Linux}-1440.png`, `S/d1-add-macOS-390.png`; Connect an AI app: `S/m2-connect-{en,ru}-{390,1440}-{light,dark}.png`, `S/e1-connect-1440.png`, `S/m2-phone-sheets.png`.
- Versions screen: `S/j2-versions-{en,ru}-{390,1440}-{light,dark}.png`, `S/j2-combo.png`.
- Feed: `S/r1-feed-{en,ru}-{390-light,390-dark,1440-dark}.png`; notifications picker: not rendered on the web (L12).

Findings (design and accessibility; severity as above): M3 (confirm order on a phone), L1 (Escape on the confirm), L3 (versions screen, desktop), L4 (row action affordance and alignment), L5 (kind / truncation), L6 (bottom of Settings), L7 (sheet button hierarchy, red warning, fold), L8 (dialog name, input attributes, `color-scheme`, overscroll), L10 (RU/EN wording), L11 (destructive action in the accent colour).
Passes: axe (WCAG 2.2 AA) clean on every state above; focus ring visible in both themes; 48 px tap targets on Revoke/Cancel/Disconnect and all sheet buttons; no horizontal overflow at 390 in any state; the skeleton (3 rows, announced as "Loading devices") and the error line ("Couldn't load devices" + Try again, RU «Не удалось загрузить устройства») exist in both themes; the sheets slide from the bottom on a phone, sit centred with ✕ on a computer, close on Escape and on the dim/outside click; copy commands quote names correctly (a name `a'; echo PWNED; '` is escaped in the shell and PowerShell lines, `S` script `e1.js`).
Colour: lime for primary actions only; the one place lime is used for an irreversible act is "Not me" (L11); the red outline of the confirm's action and the orange-red "Danger zone" label are calm and consistent.
Button width after the app-wide change (1440, every route and sheet in `k1.js`, `n1.js`, `n2.js`, `n3.js`): content-width where intended (Settings actions, Presets "Add course examples", History "Now", Day "Log past", the New project row, Create/Cancel); fills where intended (task footer halves Focus/Submit, close/edit/log sheets, Wipe confirm Cancel + action, login card); nothing found that should fill and does not at 1440 other than the Settings bottom stack (L6).

---

## Owner requests (feedback-4) still not met
- "Show devices as a tidy list right here": met (inline list, skeleton, rows, per-row confirm).
- "Add MCP: a button that shows the instruction": met ("Connect an AI app" with URL, Copy, Claude/ChatGPT/other steps).
- "Export data moves down, then Log out, then a Danger section with Wipe and Delete": met in order; layout and the missing download feedback are L6.
- "Buttons on a PC are too wide / Disconnect too wide": met.
- "Login notices in the in-app feed with a button; classify browser/app/agent; revoke each": met in the feed; the classification is only an icon (L5).
- "Wipe/Delete confirmed on the site, then in the Telegram bot (2FA)": the second step cannot be exercised here (503, L13).
- "One list of notification kinds, visible in browser, app and Telegram": the feed and the bell work; H1 breaks the feed's read state.

## Round 14 re-check (what this round touched)
No round 14 finding was re-run beyond the sweep; L14 lists those seen unchanged.

## What works well
- Live sync and live notices: a task shows in the other tab in under a second over the socket alone; a new sign-in raises the bell in ~30 ms; "Not me" and a revoke from another place end the session at once; "This device" revoke signs out cleanly.
- The versions screen is exactly as specified (only a missing route blocks; 429, 5xx, offline and HTML 200 never do) and recovers by itself on return.
- Sessions list: exact time past 8 h, "just now" for the future, a quiet error line with retry, and a skeleton; the sheets keep a copyable command per OS with correct quoting.
- Accessibility and layout matrix: 0 serious axe findings and no overflow in any new state, in both themes, both languages and both widths.
