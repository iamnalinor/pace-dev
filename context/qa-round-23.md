# QA round 23 — intermediate round after the rebase onto main and PR #48 follow-ups A1–A8

Tester: exploratory Playwright pass (Chromium) on HEAD `98af07c`, web build served on :4173 against a fresh Worker on :8787 (`--persist-to .cache/qa-state`, `ENVIRONMENT:test`, `LLM_PROVIDER:fake`, ids 5000–5029). Accounts: lived-in RU (`seedLivedIn`, 5001/5003/5004), fresh accounts for the reset cases. Token put in once per tab (init script with a `sessionStorage` mark). Scripts and screenshots: `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/qa23/` (shots in `s/`). Both servers are stopped at the end; the repository was not touched except this file.

Covered: every data route (/, /day, /week, /inbox, /projects, /presets, /settings, /decisions, /history, /insights, /add, /notifications) at 1440×900 and 390×844 in three states: normal (0 console errors, 0 failed requests), first pull answered 500 with the socket closed, first pull held; and an offline cold load of every route after one online visit. A1 (5xx first pull, `/add`, recovery with Retry, retry cadence), A2 (all five reading-issue lines, both the time bar and the composer, 1440), A3 (request counts per route), A4 (composer/time-bar with the parse answer forced to limited / unreachable / unreadable / off / queued), A5 (Log out online, offline, with an unsent note), A6 (new preset from each base, edit, built-in, duplicate names in four spellings, deleted names, extend twice), A7 (Connect an AI app with the server's public address equal to, different from, and a different host of the same machine than the one in use), `/decisions` online, offline and in the 5xx state. New task from the sidebar button, N, the composer's +, `/add` with title/text/url in every combination, and submitted by Enter in the title, Ctrl+Enter and Create. Keyboard pass on Now, Settings and the Day sheet. Dark shots of Now, Day, Presets, New preset, Settings, Connect sheet, /decisions, /add, and the 5xx Day. Responsiveness: touch, 4× CPU, 390×844, Event Timing (3 rounds).

Not covered, stated: the time bar's issue line at 390 (same component as at 1440, not shot at the phone width); Inbox Accept/Delete width (R22-10, Settings half re-checked); restoring a deleted preset from History when a live preset has taken its name (the History undo path); the server-side LLM path of A4 (deferred tries to the Inbox, the health read timeout) needs a failing model and the Worker runs the fake one: only the client side of the contract was traced; Android flows.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 3 |
| low | 9 |
| cosmetic | 3 |

Medium: R23-01 a failed first pull makes the app write the account's time zone on an empty copy, and Retry then changes the real account's zone silently; R23-02 Log out discards unsent changes with no word while the pill promises they will sync; R23-03 taps over 100 ms at 4× CPU (as R22-09, unchanged).

## Round 22's fixes

| Id | State |
|---|---|
| R22-01 toast cut the error sentence | **fixed**: `IDBObjectStore.add` forced to throw, tick a task: the whole sentence («Не удалось сохранить это на устройстве, поэтому ничего не изменилось. Попробуйте снова.») is drawn in a 224 px toast at 1440 (4 lines, box 106 px = its content) and 358 px at 390; row dissolves and returns. Class swept: the offline pill, the "not loaded yet" pill, the error under a preset form, the Connect line and the time-bar reading lines are all whole at both widths. Shots `s/r1-1440-ru-RU.png`, `s/r1-390-ru-RU.png`. |
| R22-02 Log out: a 401 storm, a race back in | **fixed** at 1440 and 390: Log out sends `GET /api/instance` (no token) and one `POST /api/auth/logout`, nothing else; `/login`; session key null; reload stays on `/login` with no request carrying the old token and no «ended on another device» line. Logging out offline also ends locally and lands on `/login` (see R23-02 for what it throws away). |

## Findings

### R23-01 medium — A failed first pull makes the app write the time zone, and Retry changes the account's zone without asking
Now (and every route), 1440 and 390, RU and EN; scripts `a1b.ts`, `a1c.ts`, shots `s/a1b-history-failing.png`, `s/a1b-history-recovered.png`.
Steps: lived-in account (zone Europe/Moscow). Open the app in a new browser profile in another zone (Asia/Tokyo) with `GET /api/sync/pull` answered 500 and the live socket closed (what A1 designs for). Wait 3 s. Open History. Then let the server answer and press Retry (or wait for the backoff).
Happened: while the screen says «Данные ещё не загрузились», History's «События» already lists «Настройки изменены 3 нояб., 11:42 · Веб» with an «Отменить» button: the empty copy wrote a `settings.updated` with the device's zone. After the recovery the event is pushed: the server log gains `settings.updated {"timezone":"Asia/Tokyo"}` and the account's zone is now Tokyo; every day, the night hours and every digest time move. Every context I opened in the 5xx state did the same (24 `settings.updated` rows on the account after 24 contexts). The healthy first sync of the same device writes nothing and shows the card «Устройство в поясе Asia/Tokyo; аккаунт использует Europe/Moscow. Использовать…» (control in `a1c.ts`: 1 settings event after a healthy open, 2 after a 5xx-then-recover open).
Should: no write while the account is unknown (same rule as the data screens), so the zone question is asked only after the pull, with the account's value.
Class: bug-lessons 62 (a definitive state or a write before the first pull completed). A1 covered every placeholder and the New task fields, not the app's own writes on an empty copy. `sync-state.e2e.ts` asserts "no write" for the held pull but not for a 5xx pull. Guard: extend the 5xx e2e to assert no `settings.updated` is in the local log (History) and none is pushed after the recovery, in a zone other than the account's.

### R23-02 medium — Log out silently discards unsent changes, right after the pill promised they would sync
Settings, 1440, RU; script `lo3.ts`, `lo4.ts`, shots `s/off-added.png`, `s/off-logout.png`.
Steps: signed in, network off. The pill says «Нет сети. Изменения синхронизируются при подключении.» Type a note, Alt+Enter («Добавлено во входящие», Входящие 1). Settings → Выйти.
Happened: no confirmation, no mention; `/login` at once. The account on the server has no such note (checked by a pull): the outbox went with the wiped store. The sentence on screen a second earlier promised the opposite.
Should: when the outbox is not empty, Log out says so first («1 change has not synced; it will be lost») with a choice, or keeps the outbox for the account until it can be sent.
Class: a destructive action that does not check what is pending (cf. R22-02's follow-up: the unconfirmed server-side logout is handled; the unsent data is not). Guard: app test "Log out with a non-empty outbox asks"; e2e offline-add-then-logout.

### R23-03 medium — Taps over 100 ms at 4× CPU, unchanged from R22-09
390×844, touch on, `Emulation.setCPUThrottlingRate(4)`, Event Timing, 3 rounds each, max ms per round (script `lat.ts`; shared machine, upper bounds):
| tap | ms |
|---|---|
| Day tab (first / next) | 312 / 136, 136 |
| filter chip Алгебра | 192, 176, 160 |
| filter chip Все | 192, 136, 168 |
| open a row | 264, 160, 184 |
| back from the task | 120, 136, 120 |
| New task (form opens) | 128, 136, 120 |
| Inbox tab, Now tab, "Начать другое" | 80–120 (inside) |
By the rule anything above 100 ms is a finding; the plan owns this in Task 5.6 (ceilings in `e2e/latency.e2e.ts`). The first Day tap (312 ms) and the chip filter (160–192 ms, a control that re-renders the list) are the worst.

### R23-04 low — With the assistant unavailable, Enter on a line of three or more words sends the same `POST /api/parse` twice
Now, composer, 1440 (also the time bar's domain not checked); script `a4e.ts`.
Steps: answer `/api/parse` with `{status:"unavailable", reason:"off"|"limited"|…, actions:[]}`, type «купить подарок бабушке» (or «Buy a gift for grandma's anniversary»), Enter.
Happened: two identical requests within 50 ms (`{"text":…,"domain":"task","thread":[]}`). «купить хлеб» sends one, and so does every line when the model answers normally (checked on the same texts). It is the unavailable path only: a second try that «off» (no assistant on the server) or «limited» (with a retry time) cannot answer differently.
Should: one request per Enter (bug-lessons 1, steady state), and none for a reason that cannot change.

### R23-05 low — New preset: the name error is at the bottom of a long form, not on the field
Presets → New preset (from any base), 1440 and 390, RU; shots `s/a6-dup-click.png`, `s/a6-empty-click.png`.
What works (A6): «Пресет с таким названием уже есть. Выберите другое название.» for «Работа», «работа», «  Работа  », «МАТАНАЛИЗ», the built-in's English «Work», and when renaming a preset to another's name; saving a preset unchanged is accepted; a deleted preset's name is free again; the empty name says «Дайте пресету название.».
Still wrong: (a) the sentence sits under the form, a screen below the Name field; the field is not marked and not focused (the Day sheet marks its field red); (b) it stays after the name is changed to a free one, until Save; (c) after a refused save the URL has lost `?from=hw` (`/presets/new`), so a reload makes a preset with no base; (d) Enter in the Name field does nothing and says nothing (QA21 M1, planned with Task 3.6/3.8).

### R23-06 low — Built-in and sample presets show English names in a Russian account
Presets, 1440, RU. The edit form of the built-in «Работа» has the Name field «Work» and a preview «Work 1 Work» under the title «Работа». «Добавить примеры пресетов курсов» adds «Algebra HW», «Calculus HW», «History HW» and three tasks («Algebra HW 1» …) written by «Система» to a Russian account. A button that adds samples should add them in the account's language, or the name fields should show the same name as the list.

### R23-07 low — History says «Пресет создан» / «Пресет изменён» without the preset's name
History, 1440 and 390: tasks and activities carry their name in the row («Задача создана · Квартплата»), presets do not, so six identical «Пресет создан» rows cannot be told apart, and an Undo (the only way to bring a deleted preset back) is a guess.

### R23-08 low — Day offline: «Экранное время 0 мин · Нет данных» is drawn as a fact when the usage read failed
Day, 390 and 1440, network off after a visit (`s/off2-390-_day.png`). The read of `/api/usage` failed; the block still says 0 min / No data as if the account had none. /decisions in the same state says «Не удалось загрузить журнал. Попробовать снова»; Day should say the same.

### R23-09 low — Two words for one retry
The offline and not-loaded pills say «Повторить»; /decisions' error says «Попробовать снова»; the Devices and sessions error says «Попробовать снова». One word per action, in both languages.

### R23-10 low — «Показать удалённые» is not tappable by its label
Presets, 1440: a click on the label text does nothing, only the 52 px switch toggles (the Settings night-hours row has the same shape). On a phone the label is the large target the finger finds.

### R23-11 low — The new Connect line names an environment variable to a person who cannot set it
Settings → Подключить ИИ-приложение, 390 and 1440 (`s/a7-390-other.png`). When the server's public address differs from the one in use the line reads «…тот, кто держит этот сервер, указывает в API_ORIGIN доступный адрес.» in caption size, four lines at 390 between the address and the Copy button; the copy button pushes down by 70 px. Tracing A7: the address shown is the server's `apiOrigin`, the discovery document at 127.0.0.1 and localhost names the one own `protected_resources` (`http://localhost:8787/mcp`), `/.well-known/oauth-protected-resource/mcp` answers 200 at both hosts (the bare path is 404, as it should be). The line works; it is a self-hoster's sentence in a user's sheet. Put the variable name in docs/self-hosting.md and keep the line to «Use the address above; AI apps cannot reach this device's address.»

### R23-12 low — The bare `/add` on a computer puts no focus in a field
`/add` with no query, 1440: the composer and the New task form open, `document.activeElement` is `BODY` (QA21 M2, owned by the New task screen task; still open). With title/text/url the text goes to the composer line and the line has the focus (works, also for blank shares).

### R23-13 cosmetic — Pill and badge placement
(a) The offline / not-loaded pill at 1440 sits in the middle of the main column's lower edge and straddles the column border and the empty pane; it covers the first row of the time bar's area when the tray is open. (b) The bell's red badge overlaps the bell glyph (the Inbox badge in the sidebar is placed correctly). (c) «Попробуйте тогда.» after «примерно до 06:08» reads as an afterthought; «Попробуйте после этого» says it.

### R23-14 cosmetic — Sidebar keeps «Настройки» selected on Presets and New preset
1440 (`s/a6-form.png`): the Settings item is highlighted, Presets has a Back chevron and no item of its own (owned by Task 3.10).

### R23-15 low — Keyboard: one tab stop per chip, 36 stops before the first task
Now, 1440: the sidebar is 10 stops, then the composer's «+», its field, three filter chips (one stop each), each row's check and body (two stops). Settings: the four theme/language chips are four stops. Radio groups should be one stop each (QA21 L1, owned by Task 3.9). Text inputs show no outline (a border change only), as noted in round 22. Escape on the Day sheet returns the focus to «Записать прошедшее» (good).

## What the 5xx, held and offline states do (A1, checked on every route)

| State | Result |
|---|---|
| first pull held, 12 routes × 2 widths | «Синхронизируем данные…» cover on every route, one pull, nothing else |
| first pull 500, socket closed | every data route: skeletons plus the pill «Данные ещё не загрузились. Пробуем снова… Повторить»; no empty copy, no zeros; Settings shows its skeletons; `/add` shows the form with skeleton for category, importance and project (A1) and a faded Create; retries back off 1, 2, 4, 8, 16 s (WS and pull each); Retry recovers the screen with the account's data |
| offline after one visit, cold load of each route | data from the local copy, pill «Нет сети. Изменения синхронизируются при подключении.» on every route; /decisions says it could not load; Day's usage block lies (R23-08) |
Except R23-01, nothing wrote, nothing repeated.

## Round 22's open lows

| Id | State, severity now |
|---|---|
| R22-03 cold URL rewritten to `/` | gone (/inbox, /day, /more at 390 keep their address; /more on a computer has no screen and goes to /, fine) |
| R22-04 second tab stale | gone (badge appears in the other tab within 3.5 s) |
| R22-05 first-sync empty copy | gone (cover or skeletons; checked with the pull held and failing) |
| R22-06 no offline indicator | gone (pill) |
| R22-07 share target drops text | gone (title, text and url land in the composer line; blank shares leave it empty); bare `/add` focus: R23-12 |
| R22-08 tooltips | gone (hover shows «Изменить детали», «Пауза», «Закрыть»; the project chip button has none: low). «Пауза» is still in the task pane (Task 4.5 pending) |
| R22-09 taps over 100 ms | still there: R23-03, medium |
| R22-10 wide controls | still there in Settings (time fields about 868 px for «09:00»); Inbox not re-run; low-medium |
| R22-11 phone Now tray eats a third | still there (running tray 2 rows + Start something else + tab bar about 270 of 844 px); low |
| R22-12 Week/Insights chevrons alike, far scroll hint | still there (Week 390: Back, ☾, ‹, › alike; hint «Листайте дни вбок» at the very bottom); low |
| R22-13 screen titles differ | still there (Ещё / Неделя / Аналитика / История differ in size and place); low |
| R22-14 History «Сейчас» at now | still there; low |
| R22-15 Projects form focus/Escape; New task silent on empty | Projects: gone (field focused, Enter says «Дайте проекту название.», Escape closes). New task: still silent for Create and Ctrl+Enter on an empty title (Create looks faded and does nothing); low |
| R22-16 Calendar picker «Settings → Devices» | gone («Сейчас в календаре ничего нет.») |
| R22-17 unknown task / route | gone for the route (title «Страница не найдена · Pace», «На главную»); unknown task shows «Такой задачи нет.» without a project header |
| R22-18 RU Insights wrap | the mid-word break is gone at 390; «Фокус по часам дня» is still an empty plot with axis only and no message; low |
| R22-19 «Телефон» / «App» | RU is «Телефон», «Веб», «Telegram»: consistent; EN not re-run; low |
| R22-20 Revoke beside Log out; estimate radios | Revoke on this device is still beside Log out; not re-run for the radios; low |
| R22-21 toast placement | desktop: still a sidebar dock; phone: the toast sits over the list above the tray (readable, covers a header); low |
| R22-22 time-bar copy | not re-run |
| R22-23 manifest dark only | still there (`theme_color` and `background_color` `#0d0f15`); low |
| R22-24 bell only on Now (phone) | still there (More lists Неделя, Проекты, Аналитика, История, Настройки; no Notifications); low |
| R22-25 cosmetics | selected-row width, card in card not re-run; the sidebar header now shows «D Dev» (avatar initial repeated) still |

## Owner requests not met (from the feedback files, only those this round could see)
- Buttons too wide on a computer (feedback 4): Settings time fields, still (R22-10).
- Reset button only away from today (feedback 4): History «Сейчас» still at now (R22-14).
- Met in this build: skeletons while loading, offline indication, icon hints on hover, share a text to Pace, Projects form focus/Escape.

## Heuristics walk
Breaches: every control earns its place (History «Сейчас», «Пауза»); one way per job (Revoke and Log out; R23-09); state you can see (R23-08 Day's usage, R23-07 History rows); forms keep their promise (R23-05 name error away from its field, New task empty submit silent); network quiet (R23-04); feedback (R23-02: the pill promises a sync that Log out cancels). Platform conventions hold: sheets slide from the bottom on a phone and are centred on a computer with ✕ and Escape; Ctrl+Enter is shown on Save and Create. Overlays: the pills and toasts no longer cut sentences; the phone toast still covers a list header.

## What works well
- A1 is solid: every route in the failing and held states shows the right words, no zeros, no writes except the zone (R23-01), an exponential retry, and a clean recovery.
- A2's five lines read well, differ by reason and name the time when the assistant is back («примерно до 06:08»); they appear in the composer and the time bar alike and offer «Разобрать, когда вернётся» only when waiting can help.
- A3: one `GET /api/usage` on Day (and one on Week), one `/api/calendar` on Now, no repeats over 9 s on any route.
- A6: the duplicate check is case-, space- and language-insensitive, and applies to new, edit and the built-ins' English names; unchanged save and deleted names behave.
- A5/R22-02: Log out is one request, an empty store and a quiet reload.
- Dark theme: Now, Day, the preset form, the Connect sheet and the 5xx Day are clean (selected chips, pills and skeletons readable; shots `s/dark-m1.png`, `s/dark-m2.png`).
