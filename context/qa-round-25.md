# QA round 25 — intermediate round (round 24's fixes) and the rest of release round 24

Tester: Playwright/Chromium against HEAD 8a1692c, a fresh web build on :4173 and a fresh Worker on :8787 (`--persist-to .cache/qa-state`, ENVIRONMENT:test, fake LLM, ids 9200000001..40). Accounts: lived-in RU (`seedLivedIn`, one per script), a fresh EN account, the RU account switched to English for the EN screens. Scripts and shots: `/tmp/claude-0/-home-user-pace-dev/c2f6dbb0-2503-5cbb-9212-ea5d94eaadd2/scratchpad/qa25/` (shots in `s/`, contact sheets `s/sheet*.png`). A second Worker on :8788 (API_ORIGIN on a LAN address) was started for the plain-http line; both Workers and the web server are stopped at the end. Local time rolled past midnight (Moscow) during the run, so Day showed the next day; nothing below depends on it.

**Coverage, stated honestly.** Done: every R24 fix the way it was found and across its class; Back/Forward on Now (task pane, project filter, tabs), Day (date), Week (week, block), History (period), pasted deep links as the first entry, reload, 390 and 1440, typing creates no entries; Day forms (block edit, gap Log, Log past, a time ahead of now, into the next block, bad times) at 1440 and 390; Week block sheet at both widths; Inbox (accept, delete + undo, detail pane and sheet) at both widths; preset forms (new, extend, edit, shared-name rename, delete, Show deleted, restore through History); Settings sheets (Add a computer on all three OSes, Connect an AI app, revoke/disconnect inline confirm, Escape); tooltips; the carried fixes; dark theme and English read at 1440 and 390 on Now, Day, Week, Inbox, Settings, Presets, task, History (contact sheets read; RU dark read at 390 for the same set and at 1440 for Now/Day/Week/Inbox was taken, not read). Not covered: see the last section.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 3 |
| low | 9 |
| cosmetic | 6 |

Medium: R25-01 Log past silently moves the start of the next activity (the edit form refuses the same overlap); R25-02 an archived preset opens as a normal editable form with no Restore, and Delete leaves no toast or undo; R25-03 taps over 100 ms at 4x CPU (R24-03, re-measured, unchanged).
All seven R24 fixes hold. All carried fixes hold. Zero console errors and zero 4xx/5xx in every session that was not deliberately failing a route.

## Round 24's fixes

| Id | State |
|---|---|
| R24-01 Escape closes Now's pane | **confirmed.** Pane open, Escape: `/` and focus on the row «Квартплата». Description edited in place: first Escape leaves edit (draft dropped), second closes the pane. An open «Другое время» sheet takes Escape alone; Tab to a pane button then Escape closes. Day's block pane: focus back on the block row. (One flaw in R25-09.) |
| R24-02 Back/forward follow the screen | **confirmed**, no loop, never left the app except from the first entry. Now: open A, B, C, Back x3 retraces C/B/A/`/`, Forward retraces; ✕ and Escape each add an entry (Back from a closed pane reopens it). Filter chips (Алгебра, Работа, Все) are entries and retrace. Tabs День, Неделя, Сейчас are entries and retrace (`/week`, `/day`, `/`). Day `?date=` (prev, prev, Back, Back, Forward), Week `?week=`, Week `?block=`, History `?at=` all step and survive reload. Typing in the composer, the time bar, the description and New task adds no entry (`history.length` unchanged). Pasted `/?task=<id>` as the first entry: pane open, reload keeps it, Back leaves the app (the one entry). At 390 `/?task=` redirects to `/task/<id>` and replaces the entry (no loop; Back leaves; Forward returns); row taps and Back retrace. Junk params (`?date=garbage`, `?week=2026-13-45`, `?project=nonexistent`, `?task=nonexistent`) fall back to today, this week, all, no pane. |
| R24-05 Task picker returns focus to its tile | **confirmed** for all four pickers (Календарь, Задача, Дела, Прочее): Escape lands on the tile. |
| R24-06 empty New task | **confirmed**: Enter, Ctrl+Enter and Create each show «Дайте задаче название.» on the title and focus the field; Escape closes and focus returns to «Новая задача». Same message style in presets («Дайте пресету название.») and Log past («Напишите, что это было.»). |
| R24-07 subtask done mark | **confirmed**: «готово сегодня 00:10» next to «готово 6 нояб. 00:10». |
| R24-08 link not repeated in the header | **confirmed**: a description with two URLs shows them in the text only; the facts block has no link chip. (A task with a *source link* still shows its chip, as designed.) |
| R24-10 preset reorder arrows | **confirmed**: one open chevron per row, ▲▼ are arrows (shot `s/presets-1440.png`); disabled arrows are dimmed. |
| Approve answer kept when the page is left (keepalive) | **confirmed**: typed line, Enter, Enter (Approve), tab closed 0, 50 and 300 ms after the resolve request started: the server's decision is `approved` every time. |

## Carried fixes

| Id | State |
|---|---|
| R23-01 5xx first pull | **confirmed**: lived-in account, EN browser in Asia/Tokyo, socket closed and `GET /api/sync/pull` 500: Now and History show «Your data has not loaded yet. Try again», no empty copy, the account has one `settings.updated` before and after, and after the recovery the screen switches to the account's language (RU) with the account's zone; deadlines read «… GMT+3 (у вас 06:11)». |
| R23-08 Day's screen-time failure | **confirmed**: «Не удалось загрузить экранное время. Попробовать снова»; one request, no loop in 6 s idle; Try again recovers to «0 мин · Нет данных». |
| R23-04 paste path | **confirmed**: paste then Enter gives exactly one `POST /api/parse` (at the paste) and one resolve; nothing repeats in the next 4 s. |
| Preset edit with a shared name | **confirmed**: opening the default «Работа» and saving unchanged works; renaming another preset to «работа » (case, trailing space) is refused under the field: «Пресет с таким названием уже есть. Выберите другое название.» |
| Read-later text survives an outage | **confirmed**: `/api/parse` refused: the typed line becomes a task by the rules («Записаться к стоматологу», Fri 15:00), the original message is kept under «Исходное сообщение», no request loop (1 request after 5 s). |
| 3–5 s request loops | **confirmed gone** in every state I forced (usage 500, pull 500, parse refused, offline): no repeat inside 6 s. |
| Slow logout | **confirmed**: logout answer delayed 5 s: `/login` at once, the id typed meanwhile is still there after the answer. |
| Log out while another tab holds a newer session | **confirmed**: tab 2 holds a newer token and an offline unsynced inbox note; tab 1 logs out; tab 2 keeps its session, shows the note, and the note reaches the server. |
| «AI apps cannot connect» on plain-http LAN | **confirmed** (server side on a real second Worker: with a LAN `Host` the instance says `mcp:false`; UI with that answer: «ИИ-приложения не могут подключиться к этому серверу: им нужен адрес с https.», no URL, no copy button). The browser was on localhost, the instance answer was replayed through a route. |
| R23-05 name error at the bottom | **gone**: «Дайте пресету название.» sits under the field at 1440 and at 390, inside the viewport. |
| R23-10 «Показать удалённые» label | **gone**: a click on the label toggles the switch. |
| R23-15 tab stops | **improved/gone**: 15 stops before the first task on Now (chips are one roving stop). |
| R22-20 Revoke beside Log out | **still there** (cosmetic, R25-15): «Завершить» on «Это устройство» and «Выйти» do nearly the same. |

## Findings

### R25-01 medium — Log past / a gap's Log silently moves the start of the next activity
Day, 1440, light, RU (the same code at 390). Steps: Day on a day with «Собираюсь» 20:51–21:51 after a gap 00:31–20:51; click the gap's «Записать» (or «Записать прошедшее»), name «Тест», keep С 00:31, set До 21:30, Сохранить.
Happened: the form saves; «Собираюсь» is now 21:30–21:51 (1 ч became 22 мин); no message, no toast, no way to see what changed except by comparing rows. Should: the same rule as the edit form, which refuses the identical overlap («Это заходит на следующую активность: сначала сдвиньте её начало.» when «Собираюсь» is stretched to 22:40, and «Конец должен быть позже начала.» for С after До). Two forms, one data model, two rules (bug-lessons class 2, the entry paths). Guard: a day-screen test that logs over a neighbour from the gap path and expects the error. Shots `s/day-gap-overlap.png` (result), `s/day-overlap-running.png` (the edit form's refusal).

### R25-02 medium — An archived preset opens as a plain editable form; Restore is only in History, and Delete leaves no trace
Presets, 1440, RU. Steps: Начать с «Работа» → name «Курсовая» → Сохранить → open it → «Удалить пресет» → «Удалить»; then «Показать удалённые» and open «Курсовая 2 · Удалён · Ваш».
Happened: (a) after Delete there is no toast and no «Вернуть» (Inbox delete, History and task creation all have one); (b) the archived preset opens as an ordinary form (Название, Наследует, all rows, Сохранить, «Удалить пресет») with no «Удалён» marker and no Restore; saving it keeps it archived; (c) the only way back is History → «Пресет архивирован · Курсовая» → «Вернуть» → «Отменить событие» (works), which the confirm sentence names («вернуть можно из Истории»), but nothing on the Presets screen points there; (d) archived rows sit in the middle of the list (after the preset they were between) with live ▲▼ arrows. Should: archived preset opens with «Удалён» and a «Восстановить» button (the owner asked for archive/restore, `docs/qa.md` row «Projects / presets»), Delete gets the undo toast, archived rows sort last without reorder arrows. Shots `s/preset-show-deleted.png`, `s/preset-deleted-open.png`, `s/history-revoke-preset.png`.

### R25-03 medium — Taps over 100 ms at 4x CPU (R24-03, re-measured, no investigation)
390, touch, 4x CPU, production web build, lived-in RU, Event Timing `click` duration (script `qa25/lat.ts`): Day tab 224 ms, Now tab 216 ms, filter chip «Алгебра» 216 ms, chip «Все» 184 ms, open a row 192 ms. (Round 24: 232/176/256, profile in round 24's fix notes.) Back: no event over 16 ms. Unchanged in kind; chips are as slow as tabs.

### R25-04 low — A typed time «9:30» is refused; «0930» and «09.30» are accepted
Day, Log past (and the block edit uses the same field), 1440. Steps: С 09:00, До typed as `9:30`, Сохранить. Happened: «Введите время, например 09:30.» The same field takes `0930` and `09.30` and refuses `9 30`, `9h30`. Should: accept the most natural form `9:30` (a one-digit hour with a colon), or the hint should name what is accepted. Class: lenient parsing that is lenient in the wrong places.

### R25-05 low — History: every row says «Вернуть», the confirm says «Отменить событие», rows are not named for a screen reader
History, 1440, RU. The list's buttons are all «Вернуть» (for the newest rows the accessible name is only «Вернуть»; further down «Вернуть: <event>»), the dialog is «Отменить событие» with «Отменить это событие? Всё, что оно изменило, пересчитывается без него.». Two verbs for one action; and «Вернуть» on «Пресет архивирован» means «bring the preset back» but on «Задача создана» it means «remove the task». Should: one verb («Отменить»), and the row's own name on every button. Shot `s/history-1440.png`.

### R25-06 low — Inbox «Принять» gives no feedback and no undo
Inbox, 1440, RU. «Принять» on «Позвонить маме в субботу»: the row simply disappears (count 3 → 2); no toast, no «открыть задачу», no undo, while «Удалить» gives «Заметка удалена · Вернуть». Should: a toast «Создана задача «…» · Вернуть» as the composer gives. Shot `s/inbox-accepted.png`.

### R25-07 low — Week's block sheet is read-only and a dead end
Week, 1440 and 390, RU. Click «Собираюсь»: pane/sheet shows name, time, «Гигиена · 1 ч», «Приложения за это время», and only ✕. To correct it the person must know to go to Day. Should: «Изменить» (opens Day's form) or a link «Открыть в Дне». Shots `s/week-block-1440.png`, `s/p-week-block.png`.

### R25-08 low — Settings «Показывать ночные часы»: static hint, and a second switch on Week
Settings and Week, 1440, RU. The hint under the switch, «Неделя показывает весь день, с 00 до 24.», is identical with the switch off and on, and reads as the opposite of a switch that is off. Week has its own «Ночные часы» control (moon, turns blue when on) for the same setting: two ways for one job. Should: the hint follows the state («Неделя скрывает ночные часы» / «показывает весь день»), and one of the two controls goes (or Week's says it is Settings' setting).

### R25-09 low — Escape out of the description edit drops the draft and loses focus
Now, task pane, 1440. «Добавить описание», type «черновик», Escape: the draft is gone without a word, and `document.activeElement` is `body` (not the field's place, the pane or the row), so the next Tab starts from the top of the page. Should: focus to the description's place (or the pane); the dropped draft is acceptable for Escape but a long text typed is lost silently.

### R25-10 low — Phone activity sheet: Сохранить is below the fold
Day, 390x844, RU. Tap «Собираюсь»: the sheet shows name, category, estimate, task, С/До; «Сохранить» and «Удалить активность» need a scroll inside the sheet, with no cue (the desktop pane has Сохранить in the header). Should: the primary button pinned to the sheet's bottom edge, or in its header. Shots `s/p-day-sheet.png`, `s/p-day-sheet-bottom.png`.

### R25-11 low — «Добавить компьютер»: the token warning is cut by the dialog's own scroll
Settings, 1440x900, RU, Linux tab. After «Создать токен» the dialog is taller than the window; the warning «Токен показывается только сейчас… Потеряли? Отключите компьютер и…» is cut mid-sentence above «Готово» with no scroll cue (steps 3 and 4 are below). The one sentence that matters (shown once) is the one half hidden. Should: warning above the token, or a visible scroll edge. Shot `s/add-computer-token.png`.

### R25-12 low — A pasted deep link's Save/Back falls back to Now, not the list
`/presets/new?from=work` opened as the first entry (a pasted link or a reload): Сохранить lands on `/` (Now) instead of Presets; via the app's own flow it lands on Presets. Back (the arrow) on a first-entry page should fall back to the section, not the home.

### R25-13 low — Day's «Учтено» leaves the alongside activity out
Day, 1440, RU. «Учтено 3 ч 32 мин» with chips Другое 2 ч, Гигиена 1 ч, Дорога 32 мин, while «Музыка · Отдых · 1 ч 30 мин» (running alongside «Пошёл в ЦСС») has its own row; Отдых has no chip. If «alongside» is deliberately not counted, the header should say so; otherwise a person sums the rows and gets 5 ч. Shot `s/day-1440.png`.

### R25-14 cosmetic — Preset preview shows «Курсовая 2 1» and a duplicate name
Presets, edit form: the preview task title is «<name> 1» («Курсовая 2 1», «работа 1»), and its tag repeats the name; with an empty name both read «Пример задачи» (`s/preset-new-1440.png`). Should: «Пример задачи» as the title and the preset's name only in the tag.

### R25-15 cosmetic — Settings devices row: metadata without separators, two ways to end this session
«Dev login  Вход разработчика  Это устройство  Соединённые Штаты  127.0.0.1  Вход 10 нояб., 00:03» is separated only by spacing; «Завершить» beside «Это устройство» and «Выйти» below do nearly the same (R22-20). Shot `s/settings-devices.png`.

### R25-16 cosmetic — Presets header and rows
Presets, 1440: the back arrow hangs above the title at y≈24 (no breathing room, unlike other screens); the open chevron sits about 8 px above the row's centre while the ▲▼ are centred; «Показать удалённые» label sits higher than its switch. Sidebar keeps «Настройки» selected (R23-14). Shot `s/presets-1440.png`.

### R25-17 cosmetic — Inbox rows
Inbox, 1440: meta repeats «Работа · Работа · Без срока» (preset and project of the same name); «Принять» and «Удалить» stack so each row is 117 px high with the row highlight stopping at the button column when the pane is open (`s/inbox-detail-1440.png`).

### R25-18 cosmetic — A blue vertical line along the pane's left edge after creating a task
Now, 1440, after Enter creates a task: the pane opens with a 2 px blue line the full height of its left edge (the region's focus ring after programmatic focus). Absent when the pane is opened by a click. Shot `s/outage-enter.png`.

### R25-19 cosmetic — Day's date: «Учтено» outdented, «Сегодня» for a garbage date
Day, 1440: «Учтено …» and the rail start at x=268, the title and date chip at x=280, rows at x=304. `/day?date=garbage` falls back to today but shows «Сегодня» beside the date as if it were another day.

## Round 24's open lows

R24-03 still there (R25-03, medium, numbers above). R24-04 kept as designed. R24-11 toast straddling the column and the pane edge: still there («Создана задача…» sits over the main column's lower edge and the pane, `s/outage-enter.png`), cosmetic. R24-12 desktop composer indented 44 px when empty (the + appears only once text is typed): still there, cosmetic. R24-13 Stop squares not centred in the grey circle: still there (`s/now-1440.png`); Day's red now label under the last row is clear of the duration now («23:51» under «1 ч 30 мин»): gone, cosmetic.

## Round 23 and 22 open lows

R23-05 gone, R23-10 gone, R23-15 improved (15 stops), R22-20 still there (R25-15), R23-14 still there (R25-16).

## Owner requests not met

- Archive and restore of presets (`docs/qa.md` row «Projects / presets»): restore exists only as a History event (R25-02), not on the preset.
- «Every control earns its place / one way per job»: Week's «Ночные часы» and Settings' switch (R25-08); «Завершить» beside «Выйти» (R25-15); History's «Вернуть»/«Отменить событие» (R25-05).
- «Forms keep their promise»: Log past and the block edit disagree about overlap (R25-01); `9:30` refused (R25-04).
- Back/forward follow the screen state (feedback 5 item 6) and Escape closes the pane (design review I4): now **met**.

## What works well

- Back/forward are now a real model: every pane, filter, tab, date, week and period is a step, reload and pasted links land on the same state, and junk parameters degrade to the default screen instead of an error.
- First-sync and outage handling is honest in every state I forced: «Данные ещё не загрузились · Попробовать снова» instead of empty copy, one request per failure, no loops, nothing written on an unknown account, the account's language and zone arriving after recovery.
- The assistant's Approve survives a closed tab; the offline fallback keeps the original message.
- Inline confirms (disconnect a computer, delete a preset, log out) are keyboard-complete: focus lands on Cancel, Escape closes and returns focus to the control.
- Tooltips behave: none after a tap on a phone, Escape takes a shown tooltip first (pane stays), «Календарь» explains why it is disabled, and none covers a control (the «Закрыть» tooltip covers only the task title).
- Dark theme in both languages reads cleanly at 390 and 1440: no unreadable pair seen on Now, Day, Week, Inbox, Settings, Presets, the task and History; the EN catalog has no stray Russian chrome (only user content).
- Zero console errors and zero 4xx/5xx on every route I visited without forcing a failure.

## Not covered

- Real MCP client end to end (owner's step, A9); the Telegram widget; the OAuth consent page.
- Offline state of the changed screens other than the pull/parse/usage failures above (no full offline walk of Day/Week/Inbox/Presets).
- English light screens (only dark EN was read); RU dark at 1440 for Settings, Presets, task and History (taken, not read); Projects, Insights, Notifications, Decisions at 1440 in dark.
- Phone Week keyboard and the sideways-scroll cue beyond the shot (R22-12 hint still at the bottom).
- Plain-http LAN line was checked by replaying the server's real answer into a browser on localhost, not from a browser on the LAN address (the web build points at :8787).
- The tap-latency re-measure was one run on a shared machine.
