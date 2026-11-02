# QA round 8 — PR 1 web build

Tester: Codex exploratory QA agent, 2026-10-15. This round retested QA7-1…5 after their
fixes. The web export was built from checkout `287610e` plus the then-uncommitted QA7
fixes. Its exact JS bundle was
`entry-51815b634c6e7cfd1d4567d94c5869d3.js` (SHA-256
`2f27c7a5019f0742c82d0aa2cb317773d38402bff20499b059ffaa01efdb2221`). Later
privacy and locale edits made during this QA round are **not** in that browser bundle and
need another short QA pass. The Worker used fresh local state in `/tmp/pace-qa8/state`,
`ENVIRONMENT=test`, `LLM_PROVIDER=fake`, and QA-only Telegram IDs. The web and Worker ran
on isolated ports 4174 and 8788.

Scripts, logs, raw route observations, and screenshots are in `/tmp/pace-qa8/`.

## Summary

| Severity | New findings | QA7 issues still present |
|---|---:|---:|
| Blocker | 0 | 0 |
| High | 0 | 0 |
| Medium | 0 | 0 |
| Low | 0 | 0 |
| Cosmetic | 0 | 0 |

All five QA7 issues passed on the tested web bundle. No new product defect was reproduced.
One request in the route sweep failed with `ERR_NETWORK_CHANGED` while the local Worker
reloaded after concurrent API edits; a direct repeat of that route had no failed request or
console error. It is excluded from product findings. Details are in
`/tmp/pace-qa8/sweep.json` and `/tmp/pace-qa8/rerun-route.ts`.

## Coverage

- **160 signed-in page loads:** 20 routes × 390×844/1440×900 × light/dark × RU/EN,
  including fresh English and Russian lived-in accounts. No page overflow; 159/160 loads
  had no page exception, console error, or failed request. The one interrupted request
  passed on repeat. See `/tmp/pace-qa8/sweep.json`, `/tmp/pace-qa8/extra.json`, and
  `/tmp/pace-qa8/shots/`.
- **32 signed-out loads:** `/login`, a task deep link, `/week`, and `/app/login` at both
  widths, themes, and `ru-RU`/`en-US` browser locales. Task and Week deep links went to
  `/login`. No console or request errors. See `/tmp/pace-qa8/public.json`.
- **Real interactions:** History Undo → Escape, Undo → Cancel, Undo → explicit confirmation;
  a task's Done checkbox → toast Undo → restored task; Close sheet with Now and one hour
  earlier; Week cue, focus and ArrowRight; language change through Settings; phone and
  desktop screens in both languages and themes. The targeted logs are
  `/tmp/pace-qa8/focused.json` and `/tmp/pace-qa8/en-continuation.json`.
- **Accessibility:** the project's WCAG 2.2 AA axe tags found no violation on Week at
  390 px light/dark and 1440 px light, or on Russian login at 390 px. Results:
  `/tmp/pace-qa8/axe.log` and `/tmp/pace-qa8/login-axe.ts`.

This is a browser pass with the fake LLM. Android-only permissions, Firebase transport,
real Telegram delivery, and the owner's device-only "Add a computer" report remain outside
browser QA. Every form entry path in `docs/qa.md` was not resubmitted by hand in this
targeted retest; the app and e2e suites cover those paths.

## Five fixes retested

| QA7 issue | Result and evidence |
|---|---|
| **QA7-1 · History Undo** | First click opened a confirmation without changing the event. Escape and Cancel closed it without a correction; `Undo event` / `Отменить событие` performed the revocation. The settled desktop dialog and phone bottom sheet kept their titles, explanation, and buttons visible. `/tmp/pace-qa8/shots/history-modal-settled-1440.png`, `/tmp/pace-qa8/shots/history-modal-settled-390.png`, `/tmp/pace-qa8/shots/ru-390-light-history-after.png`. |
| **QA7-2 · Close preview** | With Now selected, the preview showed one time (`Записано 21:45` / `Recorded 21:43`). Choosing one hour ago showed both times (`21:43 · happened 20:43`). The phone sheet fit in the viewport. `/tmp/pace-qa8/shots/close-settled-390.png`, `/tmp/pace-qa8/shots/en-390-dark-redo-close-hour-ago.png`. |
| **QA7-3 · Done Undo** | The checkbox removed the task and showed `Готово: … · Отменить` / `Done: … · Undo` above the phone tabs. Clicking Undo returned the task. The toast covered no visible control. `/tmp/pace-qa8/shots/ru-390-light-done-toast.png`, `/tmp/pace-qa8/shots/en-390-dark-redo-done-toast.png`, `/tmp/pace-qa8/shots/ru-1440-dark-done-undone.png`. |
| **QA7-4 · Russian login and document language** | With a `ru-RU` browser and no session, login and `/app/login` showed Russian, and `<html lang>` was `ru`; `en-US` showed English and `lang=en`. Signed-in language changed through Settings and survived navigation to Now. `/tmp/pace-qa8/shots/public-ru-RU-390-light-_login.png`, `/tmp/pace-qa8/shots/public-en-US-1440-dark-_login.png`, `/tmp/pace-qa8/shots/en-390-dark-redo-language.png`. |
| **QA7-5 · Week scroll cue/focus** | The phone grid showed `Листайте дни вбок` / `Swipe to see all days`. Its scroll region had `tabindex=0` and took focus; ArrowRight moved `scrollLeft` from 144 to 170 px in both RU and EN. Axe reported no serious scroll-region issue. `/tmp/pace-qa8/shots/ru-390-light-week.png`, `/tmp/pace-qa8/shots/en-390-dark-redo-week.png`. |

## Owner requests still requiring another surface or PR

No QA7 request remains unmet in the tested browser bundle. Physical Android permissions,
the reported phone-only "Add a computer" failure, and closed-app Firebase behavior need a
device. Proposal cards, bot proposals, apps during an activity, Telegram delete
confirmation, automatic sleep, and sessions/login notices are assigned to later PRs in
`context/stage-8/README.md`; they are outside PR 1 QA. The later privacy and locale edits
made after this bundle was built need QA round 9.
