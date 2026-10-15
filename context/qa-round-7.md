# QA round 7 — PR 1 web build

Tester: Codex exploratory QA agent, 2026-10-15. The web export was built from checkout
`3408b1e` with `EXPO_PUBLIC_API_URL=http://localhost:8788` and `EXPO_PUBLIC_DEV_LOGIN=1`.
The tested JS bundle is `entry-252f37aea1ce5c9594bad08c47557078.js` (SHA-256
`553d9f5ff58576916a2ed0dd7ea4d72e9aaa90b016cc12f9faccad147e9bf2da`). The checkout
had concurrent uncommitted API and phone-platform edits during this round, but no web UI edits.
The Worker ran with fresh local D1/DO/KV state in `/tmp/pace-qa7/state`,
`ENVIRONMENT=test`, `LLM_PROVIDER=fake`, and QA-only Telegram IDs. Its browser endpoint was
`:4174`; the Worker was on `:8788`, separate from the e2e stack. Chromium executable:
`/home/nalinor/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`.

Scripts, logs, and screenshots are in `/tmp/pace-qa7/`; `sweep.json`, `extra.json`,
`focused.json`, and `public.log` contain the observations. Screenshot paths below are absolute.

## Summary

| Severity | New in PR 1 | Reconfirmed from QA6 |
|---|---:|---:|
| Blocker | 0 | 0 |
| High | 0 | 0 |
| Medium | 0 | 3 |
| Low | 0 | 2 |
| Cosmetic | 0 | 0 |

No new web regression was found. The three older medium issues remain user-visible and are
listed below so the release decision can account for them. The known QA6 findings that were
resolved after that round stayed resolved where rechecked: the signed-out guard, computer
setup, Inbox Keep open, the moved time bar, and live refresh of open Now and Day screens.

## Coverage and method

- **160 signed-in page loads:** 20 routes at 390×844 and 1440×900, both themes, with a
  Russian lived-in account and an English account. Routes: `/`, `/add`, `/day`, `/week`,
  `/inbox`, `/more`, `/decisions`, `/review`, `/notifications`, `/insights`, `/settings`,
  `/devices`, `/permissions`, `/projects`, `/history`, `/presets`, `/presets/hw.seeded`,
  `/task/<id>`, `/project/<id>`, and an unknown route. Every route had a screenshot. No
  uncaught page exception, console error, failed request, or horizontal page overflow was
  observed in this sweep. See `/tmp/pace-qa7/sweep.json` and `/tmp/pace-qa7/extra.json`.
- **20 signed-out public page loads:** `/login`, `/app/login`, `/app/auth`, `/auth`, and an
  unknown URL at both widths with `ru-RU` and `en-US`; see `/tmp/pace-qa7/public.log`.
  The unknown URL redirected to login.
- **Clicked paths:** Add a computer on phone and desktop; create a token and switch its
  Windows, macOS, and Linux instructions; Escape to close. Inbox capture and badge; reopen
  an automatically closed task, then Keep open; open Day's Calendar picker; close a task;
  change a digest time; history Undo; desktop keyboard Escape; Now and Day with incoming
  events; offline Day. Settings and the device wizard were inspected in both themes and
  languages. The tooltip and computer sheet screenshots are in `/tmp/pace-qa7/shots/`.
- **Cross-device check:** with Now and Day already open, a second client pushed a task and a
  20-minute activity through the Worker. Both open screens showed them in 1.0 s without
  navigation or reload. Evidence:
  `/tmp/pace-qa7/shots/sync-now.png`, `/tmp/pace-qa7/shots/sync-day.png`.
- **Offline check:** when API requests were aborted, the previously loaded Day stayed
  readable with cached activity data. Evidence: `/tmp/pace-qa7/shots/offline-day.png`.

This is a browser pass with the fake LLM. Android permissions, Firebase delivery, real
Telegram, and the phone-only "Add a computer" complaint need a device or external service.
Form entry paths not exercised by hand here were covered by the project's app and e2e suites;
this report does not claim a manual submission through every path in `docs/qa.md`.

## Findings (reconfirmed, most severe first)

**QA7-1 (medium, carried from QA6-5) History Undo is irreversible after one click.**
`/history`, 1440×900, light, EN. On a row such as `Settings changed`, click `Undo` once.
The row immediately becomes `Undone`, and a new `Correction: revoked` row appears without
an action to restore the event. There is no confirmation or transient Undo. A stray click
can permanently change the log and its derived state. An immediate reversal or a confirmation
is needed. Evidence: `/tmp/pace-qa7/shots/history-undo.png`.

**QA7-2 (medium, carried from QA6-6) Close preview repeats the same time as recorded and
happened.** `/`, 1440×900, light, RU. Click the check on an algebra task with solved
subtasks to open its Close sheet. The preview reads `Записано 10:10 · произошло 10:10`.
The owner asked to omit the recorded time when it equals the event time. Show one time in
that case. Evidence: `/tmp/pace-qa7/shots/close3-sheet.png`.

**QA7-3 (medium, carried from QA6-7) Checking off a task gives no immediate Undo.**
`/`, 1440×900, light, EN. Create a plain task and click its checkbox. Its row animates
away and no alert or Undo action appears (`[role="alert"]` was empty); restoring it requires
finding and revoking the close in History. Deleting a task already offers an Undo toast.
Evidence: `/tmp/pace-qa7/shots/checkoff-after.png` (row animating away with no toast).

**QA7-4 (low, carried from QA6-11) Signed-out Russian locale still shows English.**
`/login`, 390 and 1440, light, `ru-RU`. The screen says `Your tasks and time` and
`Log in with the bot instead`; `<html lang>` is `en`. The same `lang` remains on signed-in
Russian pages. The signed-out default should follow browser language, and document language
should follow the visible text. Evidence:
`/tmp/pace-qa7/shots/public-ru-RU-390-_login.png`.

**QA7-5 (low, carried from QA6-18) Week's phone grid hides the remaining days without a
scroll cue.** `/week`, 390×844, light, RU. The view reaches a partially cut Sunday, and
there is no visible cue that the grid scrolls sideways. The horizontal region also lacks a
keyboard focus target (the prior round's axe finding). Show a scroll affordance and make the
region reachable from the keyboard. Evidence:
`/tmp/pace-qa7/shots/ru-phone-light-_week.png`.

## Owner requests and PR split

The PR 1 requests exercised here worked: the sidebar Inbox badge matched the Inbox list;
`Keep open` cleared the decision and badge; `Add a computer` opened on phone and desktop;
the desktop wizard offered instructions for all three operating systems; Day and Now noticed
new events from another client; digest time `09:00` changed to `09:30` without a toast
covering that field. The owner's older requests for a one-time event timestamp and a safe
way back after completion remain unmet as QA7-2 and QA7-3.

Proposal cards in the app/bot, apps-during-activity, delete confirmation in Telegram,
automatic sleep, and sessions/login notices belong to later PRs according to
`context/stage-8/README.md`; they are outside this round's PR 1 verdict.

## What works well

- The 160 signed-in combinations rendered without a JS error, failed request, or page-width
  overflow; labels on the lived-in Russian screens stayed translated.
- The computer wizard responded on a phone, created a token, showed platform-specific
  instructions, and closed with Escape. Evidence:
  `/tmp/pace-qa7/shots/focus-phone-computer-Windows.png` and
  `/tmp/pace-qa7/shots/focus-desktop-computer-macOS.png`.
- Keep open changed the review state on the first tap. Reopen exposed a past-deadline card;
  Keep open removed it and cleared the Inbox badge. Evidence:
  `/tmp/pace-qa7/shots/reopen.png`, `/tmp/pace-qa7/shots/kept.png`.
- Open Now and Day updated within a second after an external write; offline Day retained its
  last local data.
