# QA round 16 — re-check of round 15 and a regression pass over its fixes

Tester: exploratory Playwright pass on a freshly built web build (`build:web` then `serve:web dist 4173`; no earlier server was listening) against a fresh Worker (`--persist-to .cache/qa-state`, `ENVIRONMENT:test`, fake LLM), HEAD `b2d97c2`. Accounts: fresh EN accounts, fresh and lived-in RU accounts (`seedLivedIn`). Scripts and screenshots: `/tmp/claude-0/-home-user-pace-dev/678d1f3f-8350-5220-b04c-4e657e9e201f/scratchpad/qa16/` (below `S/`). Matrix: 390 and 1440, light and dark, EN and RU for the confirm, the Add-a-computer sheet, the feed's sign-in notices and the versions screen (axe WCAG 2.2 AA: 0 violations, 0 horizontal overflow in every one of those states). Both servers were stopped at the end.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 1 |
| low | 12 |

Medium:
- **M1** "Not me — end this session" drops keyboard focus to `<body>` once it has ended the session (bug class 5, the sibling of round 15 M4 in the feed).

Round 15 H1 and M1–M4 are all fixed (table below).

## Round 15 findings: state

| Id | State | Evidence |
|---|---|---|
| **H1** feed request loop, bell never clears | **fixed** | 3 accounts (EN 1440 light, RU 390 dark, lived-in RU 1440 light), each with an own sign-in notice plus an older one. Feed open 30 s: **1** `POST /api/notifications/read` (body `{"ids":[own, older]}`) and 3 `GET`, the last request 0.2 s after load, then silence. Back on Now with the bell visible 30 s: 0 POST, 2 GET (the load itself). The bell read "2 unread" before and "Notifications" (no count) after, on all three; the API lists every sign-in notice as read. With the feed open and 3 more sign-ins arriving live: 1–2 POST and 4 GET in total, no loop. Screens `S/h1-*.png`. |
| **M1** ending an already-ended session fails forever | **fixed** (list live-ness still there, see L4) | Ended "Work laptop" via the API, then Disconnect in the stale row: `DELETE` 404, then one `GET /api/sessions`, the row is gone, no "Couldn't end the session" line, focus lands on the next row's action. (The 404 is still logged by the browser console; unavoidable.) |
| **M2** Add a computer: Enter, hint, focus | **fixed** | On open the Name field has focus with its text selected (`sel=[0,11,11]`) from 166 ms on, stable to 1.5 s, at 390 and 1440, EN and RU, light and dark. Typing replaces the suggestion; Enter makes exactly 1 `POST /sessions/agents` and shows the token step. Button reads "Create the token  Enter" (Mac UA: "↵"; RU «Создать токен  Enter»). An empty name creates the default "My computer". Escape closes and focus returns to the "Add a computer" button. Still open: L2, L5. |
| **M3** phone confirm in the wrong order | **fixed** | 390, EN and RU, light and dark: question on its own line (x=64), then Cancel (x 64–163, 99 px) and the red-outlined action (x 171–370, 199 px) side by side, both 48 px tall; at 1440 the same order (Cancel 1072–1156, action 1164–1252, right-aligned under the question). Same sequence in all 8 combinations; RU «Отмена / Завершить» too. `S/s2-confirm-*.png`. |
| **M4** focus lost after revoke / disconnect | **fixed** in Settings | Success: focus goes to the next row's Revoke/Disconnect. Failure (DELETE aborted): focus is back on the confirm's action, the error line is shown. Cancel returns to the row's button. The same class still exists in the feed (M1 below) and on the sheet's step change (L2). |
| L1 Escape does not cancel the confirm | **still there** | Escape with focus on Cancel: confirm stays (`S` script `s1.js`). |
| L2 a remote revoke signs out without a word | not re-run | |
| L3 versions screen pinned to the left on a computer | **fixed** | 1440: heading and button start at x=500 in a 440 px column (500–940), centred; 390: 24–366. EN and RU, light and dark. Log out is the first Tab stop, `lang` follows the account, axe clean. `S/v2-*.png`. |
| L4 row action looks like a label, 16 px off the right edge | **fixed** | Revoke/Disconnect are now outlined (1 px border, white or dark surface), right edge 1252 = the switches' edge, 48 px tall. |
| L5 rows say little (kind, last use, long names) | **still there** | Rows show an icon, no "Browser / Phone app / AI app" word; the AI app row has no second line. Truncation not re-run. |
| L6 Settings bottom stack, no export feedback | **still there** | Export data still downloads `pace-2026-11-01.xlsx` with no toast or status text (checked `[role=status]`/`[role=alert]`); Export/Log out/Danger zone/Wipe/Delete layout unchanged. |
| L7 sheet details | **still there**, one **changed** | "Copy the command" primary lime vs white "Copy the token"; red alarm paragraph and "Done" below the fold at 390 and at 1440×900; Connect an AI app still opens focus on the dialog. Changed: the OS picker opened on **Linux** in this Linux Chromium (round 15 reported "always Windows"); a Windows or Mac browser was not re-checked for the selected tab. |
| L8 dialog name, input attributes, `color-scheme`, overscroll | **partly fixed** | Name input now has `autocomplete=off`, `spellcheck=false`, `enterkeyhint=done`. Still: both dialogs have no `aria-label`/`aria-labelledby`, the input `name=""` and no id, `html` `color-scheme: normal` in the dark theme (theme-color meta is right), sheet `overscroll-behavior: auto`. |
| L9 duplicate requests on load | not re-run | |
| L10 wording | **partly fixed** | EN «recognise» is now "recognize". Still RU «Соединенные Штаты» (no ё). |
| L11 sign-in notice rows | **partly fixed** | "Not me" is now outlined in the danger colour (2 px, light `#b8441a`, dark `#ff8a5c`, label in the same colour), at 390 and 1440, EN/RU. Still: the own-session notice has the same words as the others (no "this device") but correctly no button; "Not me" ends the session with no confirm; a notice about a session ended elsewhere still offers "Not me" after a reload (pressing it answers "Session ended"). |
| L12–L16 | not re-run | L13 notes below were re-checked where stated. |

## Findings

### M1 medium — "Not me" drops keyboard focus to the page
Feed (`/notifications`), 1440 light EN. Script `n2.js`.
Steps: sign in twice so there is a notice with a button, Tab/`focus()` the "Not me — end this session" button, press Enter.
Happened: the session ends, the button is replaced by "Session ended", `document.activeElement` is `<body>` (mouse click too, `n1.js`). A keyboard user loses their place in a long feed.
Should: focus moves to the next notice's action, or to the replacing "Session ended" text (made focusable), or the row. Class: bug class 5 (a control that removes itself must place focus); the round 15 sweep fixed Settings only. Guard: extend the "focus after the control is gone" check to every control that swaps for a status (Not me, Add a computer step change, Attend/Skip).
Screenshot: `S/n1-after-notme.png`.

### L1 low — A half-open live socket leaves a tab stale for up to 5 minutes
Two contexts, A's WebSocket proxied (`routeWebSocket`) and silent after connect (frames neither way), B adds a task. A did not show it within 140 s, with a single socket attempt (script `i5.js`). The ping is a bare `"ping"` with no answer check, and a request is the only thing that detects quiet; with the socket "connected" the safety poll runs every 5 minutes (`POLL_LIVE_MS` in `apps/app/src/app-state.tsx`), so a network switch can hide the other device's changes that long. The round 15 commit ("a quiet socket reconnects at once") only helps when a request is already open. Suggest: treat a missing pong within ~10 s of a ping as quiet, or poll over HTTP every 60 s while the tab is visible. With HTTP sync blocked and the socket healthy it works (below).

### L2 low — Add a computer: focus is dropped when the sheet changes step
Press Enter (or the button) in the name step: the field and button are replaced by the token step and `document.activeElement` is `<body>` (`n2.js`); the first Tab does land inside the dialog ("Windows"), so it is recoverable. Should: focus the sheet's first control or the heading of step 2.

### L3 low — Escape does not cancel the inline confirm (carried, round 15 L1)
Several confirms can also be open at once.

### L4 low — The devices list is not live (carried, round 15 M1 second half)
A computer added elsewhere ("Live Agent" via the API, waited 6 s) does not appear until reload; it only reloads after a 404 on revoke.

### L5 low — Sessions sheets: accessibility and platform attributes (carried, round 15 L8)
No accessible name on either dialog; Name input has no `name`/id; `color-scheme: normal` in dark; `overscroll-behavior: auto` on the sheets. Fix once in `Sheet` (`aria-labelledby` the title, `overscroll-behavior: contain`) and in the theme provider (`color-scheme`).

### L6 low — Sign-in notice: no "this device", no confirm, stale "Not me" (carried, round 15 L11)
See the table. An irreversible act with one press and no undo; the rule "destructive actions need a confirm or undo window" is met in Settings but not here.

### L7 low — Settings bottom and Export feedback (carried, round 15 L6)
No "Downloaded" feedback after Export; the content-width stack of Export data / Log out / Wipe / bare "Delete account" link is unchanged.

### L8 low — Sheet button hierarchy, red paragraph, fold (carried, round 15 L7)
At 1440×900 the token step needs a scroll to reach "Done"; the warning is a 4-line alarm-red paragraph (RU 4 lines at 1440).

### L9 low — Rows: kind and last use not shown; RU country name (carried, round 15 L5, L10)
RU «Соединенные Штаты» should read «Соединённые».

### L10 low (cosmetic) — Sheet header: the ✕ sits about 4 px lower than the title
Add a computer, 1440 (both steps, EN and RU): title baseline y≈367 vs the ✕ centre y≈371 (step 1); step 2 y 101 vs 104. `S/a1-sheet-en-1440-light.png`, `S/a1-token-ru-1440-light.png`.

### L11 low — Information: a 404 with an HTML body also blocks; signed-out pages never block
Versions screen matrix with `page.route('**/api/instance')`: JSON 404, HTML 404 and plain-text 404 block; 429, 500, 503 HTML, an aborted request and a 200 HTML page do **not**; a 200 JSON without `features` does not block and the app, Settings and Now render normally (the new fail-safe works). Recovery on a focus/visibility event with the route removed works. A signed-out visitor with a 404 sees the normal login card (no versions screen). The HTML 404 of a proxy that does not route `/api` therefore blocks like round 15 L13; confirm that this is intended.

### L12 low — Information: with the socket refused and HTTP open the other tab needs 24 s
`i2.js`: 5 socket attempts, 24.4 s (round 15: 24 s), documented 30 s safety poll. Unchanged.

## Regression pass: what the fixes touched (all OK unless a finding says otherwise)

- **Devices and sessions, inline confirm**: layout and order identical at 390 and 1440 in EN and RU, light and dark; focus enters Cancel on open, Cancel returns focus to the opener; failure keeps the confirm open with the action focused again; double press ends once; a second Revoke on the next row works straight after. The "this device" confirm says "End this session? This device signs out."
- **Add a computer**: see M2; also at 390 the sheet slides from the bottom, on 1440 it is a centred dialog with ✕ and closes on Escape; the command quotes the typed name (`'Рабочий ПК'`); axe and overflow clean on the token step.
- **Feed sign-in notices**: a new sign-in appears live without a reload; "Not me" ends that session (the row becomes "Session ended"); the notice about the current session has no button; the bell clears and stays cleared after leaving the feed (H1).
- **Versions screen**: see L3 (fixed) and L11. `document.title` stays "Pace" (known).
- **Live sync between two contexts with `**/api/sync/{push,pull}` aborted in both**: a task approved in a 1440 tab shows in a 390 tab in 877 ms over the socket alone (`i1.js`); no console errors.

## Design pass (`dev-core:web-design-guidelines`, applied to the rendered DOM and the screenshots)

Screenshots (all light/dark, 390/1440, EN and RU where listed): confirm `S/s2-confirm-{en,ru}-{390,1440}-{light,dark}.png`; the outlined row action `S/s2-list-{en,ru}-{390,1440}-{light,dark}.png`; "Not me" in the danger colour `S/f1-feed-{en,ru}-{390,1440}-{light,dark}.png`; versions screen `S/v2-{en,ru}-{390,1440}-{light,dark}.png`; Add a computer `S/a1-sheet-*.png` (name step) and `S/a1-token-*.png`; Connect an AI app `S/m1-connect-1440.png`.

Findings (severity-tagged):
- **[medium] M1**: focus lost after "Not me" (Focus States / Accessibility).
- **[low] L5**: dialogs lack an accessible name; no `name` on the input; `color-scheme: normal` under the dark theme; `overscroll-behavior: auto` in sheets (Accessibility, Dark Mode, Touch rules).
- **[low] L6**: destructive "Not me" with no confirm or undo (Navigation & State: destructive actions need confirmation).
- **[low] L1, L2, L3**: focus placement (Escape on confirm, step change, stale socket is separate).
- **[low] L8**: three different treatments for Copy actions and a long all-red paragraph; at 390 the token step is mostly below the fold.
- **[low, cosmetic] L10**: the ✕ misaligned with the title.
- Typography: the confirm and the versions screen read well in RU at 390 (no overflow); "Enter" next to the primary button reads as the shortcut in EN and RU.

Passes:
- Confirm: calm, one danger colour used for the one irreversible action; Cancel is the visually equal safe option; 48 px targets; question in the group's accessible name; both themes keep the contrast (axe 0).
- Outlined row action: now reads as a button and aligns with the switches and chips above (right edge 1252).
- "Not me": danger colour (border and label) in both themes, replacing the lime primary; no longer competes with the page's real primary actions.
- Versions screen: a centred 440 px column on a computer, edge-to-edge with 24 px gutters on a phone, one control, heading in a real header role; in dark the focus ring on "Log out" is clearly visible.
- Add a computer: Name selected on open, "Create the token  Enter" hint, `autocomplete=off`, `spellcheck=false`, `enterkeyhint=done`; sheet from the bottom on a phone, centred on a computer.

## Owner requests (feedback-4)
No request that was met in round 15 regressed. Still only partly met: "classify browser / app / agent" is an icon only (L9), "Not me" on a stale notice (L6).

## What works well
- The notification feed is quiet now: one read request, then nothing, for 30 s on both screens; the bell clears and stays cleared.
- Ending sessions: the stale row disappears quietly on 404, focus moves forward, and a failed end gives focus back to the action.
- One confirm layout for every width and language; the row action is a real outlined button aligned with the page.
- The Add a computer sheet is keyboard-complete (focus, select, Enter, one request, Escape back to its button).
- The versions screen is centred and only a missing route blocks it; the missing-`features` response degrades to "no features" instead of blocking.
- Live sync across two tabs with HTTP sync blocked: 877 ms.
