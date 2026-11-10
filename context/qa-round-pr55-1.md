# QA round PR55-1 (intermediate) — branch ccr-360ee3f0-hebtg7

Scope: PR #54 redesign (not re-audited) + PR #55 technical continuation (sync and local copy rewrite, two tabs
sharing a copy, History source, export, server configuration strip, account wipe/delete, sign-in, Settings).
Stack: Worker :8899 (persist `.cache/qa-pr55-state`, `API_ORIGIN` set to the test origin), web :4199 built with
`EXPO_PUBLIC_API_URL`, Chromium 1243, fake LLM. Checkpoints off (legacy path). Russian lived-in accounts for
exploration, one fresh English account. Scripts and screenshots: scratchpad `qa/` (/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/ holds every shot named below).

Setup note (not a product finding): `/api/instance` names `apiOrigin` from the `API_ORIGIN` var; without it the
dev Worker answered 8787 and the app's socket and some calls went there (all sync dead, "Нет сети" forever).
A QA stack must set `--var API_ORIGIN:<worker origin>`.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 1 |
| medium | 4 |
| low | 14 |

Measured: first sync of the lived-in account visible in ~1.5 s (1440, local Worker); a check-off or tab tap ~50 ms
unthrottled; under 4x CPU throttle every tap handled in 170–370 ms (PR55-1-05). No read loop: after each route
settled, no request or socket frame repeated (details in PR55-1-12). Offline writes go out on reconnect (verified
on the server). Two tabs share one copy and an action in one shows in the other in ~1.1 s.

## Fixes to confirm

| Fix | Result |
|---|---|
| Hidden tab signs out when its session ended and the other tab dropped/re-claimed the shared copy | **Confirmed.** Two tabs, one profile, B hidden via `visibilityState` override. (a) Session ended from Settings → Devices in a second context: visible tab A on sign-in after ~9 s, hidden B after ~26 s, both with the "ended on another device" line (<45 s). (b) A signed out and signed in again as a new session: B (hidden) went to sign-in after ~20 s with "Вы вышли в другой вкладке"; A's new session was intact after reload (`t3-A-relogin.png`, `t3-B.png`). Aside: B could have adopted A's new session instead of showing sign-in; judged acceptable. |
| Configuration strip no longer squeezes words beside Retry (320–390) | **Confirmed.** Sentence on its own lines, Retry under it, at 320/390/1440, RU/EN, light/dark (`cfg2-320-ru-RU-light.png`, `cfg2-390-ru-RU-light.png`, `cfg2-1440-en-US-dark.png`). Recovers on its own: the `/api/instance` re-check came after ~5 s and the strip left within ~7 s of the server answering normally. The Retry tap itself was not exercised separately. |
| Kit Icon no longer shrinks to a dot beside wrapping text | **Confirmed** for the strip warning icon at 320, the offline toast, the session row (5 wrapping lines at 390), Settings estimate pills. No shrunk icon found elsewhere. (A different icon bug, the stop glyph, is PR55-1-03.) |
| History loading uses the skeleton | **Confirmed**: slow first pull shows the skeleton with "Синхронизируем данные…" (`h-loading.png`). See PR55-1-02 and -13 for what is wrong around it. |
| Foreground return syncs even if series instances fail | **Not verified**: a browser cannot make series instances fail; no stuck sync seen on foreground return with the visibility override. |

Other scope checks, all OK unless a finding says otherwise: History step back day by day (`?at=` in the URL, board
and events follow, "Сегодня" returns), a direct `?at=` URL, Undo (confirm dialog, Escape closes, focus returns to the
row's button, board recomputed); Export with a synced copy (44 event rows, 5 sheets); account wipe/delete up to the
Telegram step (polls ~every 2 s, Cancel posts `/cancel` and stops polling, "Запрос отменён."); offline on every route (data
shown from the copy, offline toast, reload while offline works); reconnect pushes the offline task; sign out in one tab
and in again; sign-in screen `lang` follows the browser locale (ru/en).

## Findings

### PR55-1-01 — high — Export on a copy that never synced downloads an empty workbook and says it succeeded
Settings, 1440, light, RU.
Steps: new context signed in to the lived-in account; block `**/api/sync/pull**` and the live socket; open `/settings`; tap «Экспорт данных».
Happened: `pace-2026-11-10.xlsx` downloads in ~200 ms with no network request; all 5 sheets hold only the header row (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/ex3.xlsx`); the toast says «Скачан файл pace-2026-11-10.xlsx». Same account, synced copy: 44 event rows.
Should: refuse (a "not synced yet, try again" toast, or sync first) when the first sync has not completed; an empty file reported as success is data-loss bait. The `completeHistoryOf` guard accepts an empty never-synced copy on the legacy path. Screenshot: `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/ex3-fail.png`.

### PR55-1-02 — medium — History after a failed first pull: skeleton forever and a wrong-sounding toast; the in-page error with Retry is unreachable
History, 1440, light, RU.
Steps: fresh profile, block `/api/sync/pull` (and the socket), open `/history`, wait 40 s.
Happened: the title and the date pill are drawn over six skeleton rows forever; the only message is the global toast «Нет сети · изменения отправятся позже» + «Попробовать снова» (no changes are waiting; a read is failing, and the network is up). The `HistoryPending` error state with its own Retry never shows (checkpoints off). Retry via the toast works (list loads).
Should: after the load fails, the History body says so with its Retry; the toast wording should not promise sending changes when none exist. `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/h-error.png`, `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/h-error-40.png`.

### PR55-1-03 — medium — Time bar stop buttons: the black stop square sits off-centre at the top-left of its grey circle, which is clipped at the card's right edge
Now, 390 and 1440, light, RU (lived-in account, two running activities).
Steps: open Now; look at the time bar rows «Пошёл в ЦСС», «Музыка».
Happened: the square is ~5 px up and left of the circle's centre; the circle is cut on the right (zoom `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/zoom-timebar.png`, `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/n-pane-1440.png`, `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/m-now-390.png`).
Should: centred glyph, whole circle inside the card.

### PR55-1-04 — medium — On the phone the deadline is the part of a task's meta line that gets cut
Now and History, 390, light, RU.
Steps: Now with the lived-in tasks.
Happened: line reads «Работа  осталось 23 ч 59 мин · Срок за…», «Алгебра  осталось 2 дн 23 ч · 1/3 готов…», «Личное осталось 9 дн · Срок 20 но…»: the actual deadline and the progress count are ellipsized, while the derived «осталось» stays whole. Desktop order is «Срок … · осталось …», so the two widths disagree. Same in History's "Задачи на …" (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/m-now-390.png`, `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/ru-history-390.png`).
Should: deadline first on both, let the line wrap to two lines or drop the less important part.

### PR55-1-05 — medium — Under 4x CPU throttle every tap takes 170–370 ms to its click handler's end
Now/Day, 390 touch (isMobile, hasTouch), CDP `setCPUThrottlingRate 4`, Event Timing `click`.
Measured: tab Day 368 ms, tab Now 232, tab Inbox 184, tab Now 200, open a task row 264, Back 168, time-bar «Задача» 216; every tap tested is over the 100 ms line, the navigations being the worst (the route mounts synchronously inside the click). Screens: `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/m-task-390.png`. Should: defer the heavy mount (transition) so the tapped control answers first.

### PR55-1-06 — low — Dev login: Enter in the Telegram id field does not submit
Sign-in, 1440, RU. Type an allowed id (7063), press Enter: nothing is sent (no request), stays on /login; only the button works. The heuristic «Enter submits» fails (dev-only form, hence low).

### PR55-1-07 — low — Sign-in error line is the same for "not allowed", "garbage id" and "server unreachable"
Sign-in, 390/1440, RU/EN. 403 (id not on the list), «abc» (sent to the server unvalidated) and an aborted request all give «Не удалось войти. Попробуйте ещё раз.» / "Could not sign you in. Try again." The unreachable case should say there is no connection; a non-numeric id needs no round-trip. Empty id correctly disables the button. `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/l-390-ru-RU-3-bad.png`, `l-390-ru-RU-4-net.png`.

### PR55-1-08 — low — «Экранное время» block on the web can never have data
Day, 390 and 1440, RU/EN. A section «Экранное время · 0 мин · Нет данных» on every day on the web (Android-only data); offline it becomes «Не удалось загрузить экранное время» with its own «Попробовать снова» for something that was never requested. Hide on the web or say it is phone-only. `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/p1-day-1440.png`, `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/o2-day.png`.

### PR55-1-09 — low — Two Retry buttons for one offline state
Day and Week offline, 1440, RU. The block's own error («Календарь не загрузился» / «Не удалось загрузить экранное время») with Retry, plus the global toast «Нет сети…» with another «Попробовать снова». Two controls, one job. `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/o2-day.png`, `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/o2-week.png`.

### PR55-1-10 — low — Focus falls to the start of the page after a swap
Now, 1440, RU: Tab to a row's check «Отметить «ДЗ по алгебре…» сделанным», Enter: the row leaves and focus goes to the document start («Перейти к содержимому»), the keyboard user restarts from the top (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/k-row-enter.png`). Settings: after «Очистить данные» → «Очистить через Telegram» the buttons are replaced by «Ждём подтверждения в Telegram… / Отмена»; focus is on the body, not on «Отмена». Focus should move to the next sensible control.

### PR55-1-11 — low — A brand-new English account's History starts with an undoable «Settings changed»
History, 390, EN, fresh account (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/en-history-390.png`): one event «Settings changed · Nov 10, 11:16 · Web» with Undo before the user did anything (the timezone/default write). A system event should not offer Undo, or not be listed.

### PR55-1-12 — low — Repeated reads at every load (not a loop)
Network log, any route, full load: `/api/instance` twice; `GET /api/sync/pull?limit=200&since=N` over HTTP and then the identical pull over the socket; on the notifications route `/api/notifications?limit=50` twice; after reconnect two socket `pull since=43` frames 19 ms apart. After the screen settles nothing is repeated (checked 8–10 s windows on all routes, and with two tabs). Worth trimming; not a defect users feel.

### PR55-1-13 — low — First-sync skeleton is drawn without the shell and ~80 px right of where the content lands
History/any route with a slow first pull, 1440 (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/h-loading.png`): the skeleton and «Синхронизируем данные…» sit at x=360 with no sidebar; the page then appears with the sidebar and the column at x=280, so everything jumps.

### PR55-1-14 — low — Configuration strip at 1440 floats off the content column; the screen behind stays a skeleton
Server misconfigured, 1440, EN dark (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/cfg2-1440-en-US-dark.png`): the card is centred on the whole window (604–1083 px) while the content/time bar column is 248–968; reads as unattached. With a fresh profile the skeleton stays behind it for as long as the server is misconfigured (sync parked), with no word on the screen that the data is not loading.

### PR55-1-15 — low — 320 px truncations
Now, 320, RU (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/cfg2-320-ru-RU-light.png`): composer placeholder «Задача или…», time bar «Календ…». 320 is below the target phone width, so low.

### PR55-1-16 — low — «Другое время или итог…» cut in the task pane at 1440
Now with the task pane, 1440, RU (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/n-pane-1440.png`): the link under «Фокус»/«Готово» ends in an ellipsis with plenty of room to the right.

### PR55-1-17 — low — Settings copy and a phone-irrelevant row
Settings, 390, RU (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/m-set390.png`): «Луна на Неделе включает то же самое» (what moon?); quiet hours «Придерживает «начало события» и «всё ещё…?»» is stilted; a «Клавиши — Alt+N … Alt+F» row on a touch phone web view. Geo in notifications mixes languages: «Соединённые Штаты, Columbus».

### PR55-1-18 — low — Inconsistent small things
Day's back control is «Предыдущий день», History's «На день раньше»; Notifications and Assistant log titles sit ~12 px higher than every other screen's title at 390 (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/m-ru390-a.png`, `/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/m-ru390-b.png`); at 1440 Day's «Учтено 3 ч» line starts at x=268 while the pill is at 280 and cards at 264.

### PR55-1-19 — low — Empty Now has both a composer line and an «Add a task» button saying the same
Now, 390, EN fresh account (`/tmp/claude-0/-home-user-pace-dev/668106b2-81a5-5292-bbca-f1b041a2aedd/scratchpad/qa/shots/m-en390-a.png`): the line «Add a task or paste text» and, one inch below, «Add a task». One way per job.

## What works well
- The hidden-tab session-end path: both tabs land on sign-in with an honest reason, the surviving session is untouched.
- Offline: every route renders from the copy, reload offline works, the offline task reached the server on reconnect, and the network goes quiet afterwards.
- History: the board follows the stepped moment, `?at=` is shareable, Undo asks first and returns focus to its button.
- Wipe/delete waiting state is calm: polls every ~2 s, Cancel stops them and says so.
- The configuration strip is readable at 320–1440 in both languages and themes and recovers by itself.
- Fresh-account empty states are short and each has one action; Week's «Swipe to see all days» cue is there.
