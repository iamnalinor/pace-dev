# QA round 26 — intermediate round (round 25's fix wave)

Tester: Playwright/Chromium against HEAD b42e9de0, a fresh web build on :4173, a fresh Worker on :8787 (`--persist-to .cache/qa-state`, ENVIRONMENT:test, fake LLM, ids 9200000001..40). Accounts: lived-in RU (`seedLivedIn`, one per script), a fresh EN account (en-US, New York). Scripts and shots: `/tmp/claude-0/-home-user-pace-dev/c2f6dbb0-2503-5cbb-9212-ea5d94eaadd2/scratchpad/qa26/` (shots in `s/`). Only the servers started here were stopped at the end.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 2 |
| low | 6 |
| cosmetic | 2 |

Every round 25 fix checked is confirmed. The two mediums are new: one is a hole left by the R25-10 fix, the other a keyboard shortcut collision.

## Round 25's fixes

| Id | State |
|---|---|
| Back/forward: Day/Week pick belongs to its date/week | **confirmed.** Day: block picked today, prev day: no pane; Back, Back, Forward: no stale pane. Week: block pick, «Изменить в Дне», Back retraces to the pick, Back again to plain Week. |
| Inbox Accept/Delete of the open note: Back skips the gone item | **confirmed** (pane delete and pane accept: Back lands on the earlier note then the list, Forward retraces; no entry of the gone note). |
| Deleting the open task: Back skips it | **confirmed** (Now, open A, open B, delete B: Back goes to A then Now). |
| Sidebar/tab bar are Back steps | **confirmed** (Now, Day, Week, Inbox; Back retraces). |
| R25-01 one overlap rule | **confirmed forward** (gap Log, Log past and the edit form all refuse an end inside the next activity). The reverse direction is R26-03. |
| R25-02 archived presets | **confirmed**: read-only «Удалён» with «Восстановить пресет», Delete toast with Undo (works, also offline: «Нет сети · изменения отправятся позже», and it syncs), deleted rows last without arrows, delete persists across reload. See R26-06 and R26-07. |
| R25-04 time fields | **confirmed** typed key by key in Day's form and Settings fields: 9:30, 9.30, 9 30, 9h30, 0930, 9,30 all give 09:30. Pasted/filled «930» is still refused (R26-05). |
| R25-05/06 Inbox Accept toast, History «Вернуть: <row>» | **confirmed**: «Задача создана: … · Вернуть» revokes all three events, the task leaves Now, the note returns; every History button is named «Вернуть: <row>»; the question is «Вернуть как было». |
| R25-07 Week «Изменить в Дне» | **confirmed**, but see R26-04. |
| R25-08 night-hours hint | **confirmed**: the hint follows the switch and names Week's moon. |
| R25-09 focus after description edit | **confirmed**: Escape leaves focus on «Добавить описание», the pane stays. |
| R25-10 phone activity sheet Save pinned | **confirmed** (Save at y=772 of 844), but the pinned footer hides error text: R26-01. |
| R25-11 token warning first | **confirmed** (the warning is the first line of the dialog). |
| R25-12 pasted preset/project goes back to its list | **confirmed** at 1440 and 390 for /presets/new?from=work, /presets/<id>, /presets/zzz, /project/<id>, /project/zzz. |
| R25-14 preview «Пример задачи» | **confirmed** (title «Пример задачи», tag is the preset's name). |

## Findings

### R26-01 medium — Phone: a form error under «До» is hidden behind the pinned Save footer
Day, 390x844, touch, light, RU. Steps: tap the gap's «Записать», name «Тест», До «9:30» (inside the next activity), tap «Сохранить». Happened: the sheet stays open and the field gets a red border, but the message «Это заходит на следующую активность: сначала сдвиньте её начало.» sits at y=757-829, under the pinned footer (Save starts at 772); the sheet does not scroll to it. It shows only after scrolling the sheet by hand, and then it wraps to four lines in a half-width column. Should: scroll the error into view, or put it above the footer, or give it the full width under the pair. Class: pinning a footer (R25-10) without checking where inline errors land; the same holds for «Введите время…». Shots `s/p-gap-saved.png`, `s/p-gap-err-scrolled2.png`.

### R26-02 medium — Ctrl+Enter inside the description field completes the task
Now, task pane, 1440, RU. Steps: open «Купить продукты на неделю», «Добавить описание», type text, Ctrl+Enter. Happened: the task is marked Done («Готово: … · Вернуть»), the pane shows «Закрыта · Сделано» with the editor still open and the draft unsaved. Should: Ctrl+Enter saves the description (or does nothing) while a text field has focus; Done's shortcut must not fire from an editor. Class: a pane-level primary shortcut reaching into editable fields (the title edit and subtask fields not swept). Shot `s/ctrl-enter-desc.png`.

### R26-03 low — Starting inside the previous activity silently shortens it
Day (9 нояб.), 1440, RU. Block «Дорога в вуз» 10:30-11:10; «Записать прошедшее» «Ужин» С 10:50 До 12:00, Сохранить. Happened: saved, and «Дорога в вуз» becomes 10:30-10:50 (40 to 19 мин) with no message or toast. Moving an existing block's start earlier does the same. The forward direction is refused (R25-01), the backward one is silent. Should: the same refusal («Это заходит на предыдущую активность…») or a visible note. Shot `s/day-back-overlap.png`.

### R26-04 low — «Изменить в Дне» lands on the day list, not on the block's form
Week, 1440, RU. Click a block, «Изменить в Дне»: Day opens the right date with no pane and no highlight, so the person finds and clicks the block again. Should open the block's edit form, or at least highlight the row. Shot `s/week-edit-in-day.png`.

### R26-05 low — Time fields disagree about invalid input and about «930»
Settings' reminder and quiet-hours fields silently snap an invalid typed value back to the old one on blur (typed «7», «12:5», «24» become the previous time, no message). Day's form keeps the text and says «Введите время, например 09:30.». Typed «930» becomes 09:30, but pasted or filled «930» is refused in Day. Should: one behaviour everywhere (a message, or 7 meaning 07:00).

### R26-06 low — Stale Undo toast stays after the same action is done another way
Presets, 1440, RU. Delete «Альфа» (toast «Пресет удалён · Вернуть»), open it from «Показать удалённые», «Восстановить пресет»: the toast «Пресет удалён: Альфа · Вернуть» is still shown and clicking it does nothing visible. Should dismiss once its event is already revoked.

### R26-07 low — A deleted preset shows nothing of itself
Presets, 1440, dark, RU. «Старое · Удалён» opens a page with only «Удалён», one sentence and «Восстановить пресет»: no rules, colour or inheritance. A person cannot tell what they would restore. Shot `s/d-preset-deleted.png`.

### R26-08 low — Pasted /decisions goes Back to Now
Decisions (reached from Notifications) opened as the first entry: Back goes to Now at 1440 and to More at 390, not to Notifications. Same class as R25-12, smaller.

### R26-09 cosmetic — Durations one minute off after logging against live-started blocks
Seeded blocks carry seconds. A gap logged 00:00-10:30 shows «10 ч 31 мин» and the cut block 19 мин, so the rows do not sum to «Учтено». Seen only with seconds in the neighbouring block, so it matters only for live-started activities.

### R26-10 cosmetic — History after an Inbox Undo shows three «Исправление: отозвано» rows
Accept then Undo of one note leaves three correction rows plus three «Отменено» rows in History. Noise; one grouped line would do.

## Round 25's open items

- R25-03: still there. 4x CPU, 390, lived-in RU, 3 runs, click duration: Day tab 312 / 320 / 344 ms, Now tab 224 / 168 / 264, chip «Алгебра» 192 / (576 outlier) / 240, chip «Все» 224 / 224 / 248, open row 264 / 232 / 312. Back: no event over 16 ms. Same range as round 25, on a shared machine.
- R25-13: still there («Учтено 3 ч», Музыка alongside not counted; as specified).
- R25-15: still there (devices row without separators, «Завершить» beside «Выйти»).
- R25-16: still there (the Presets back arrow at y=24 above the title; the same on the deleted preset page).
- R25-17: still there (stacked Принять/Удалить and the row highlight stopping at the button column; «Работа · Работа» not seen on this seed).
- R25-18: not reproduced (no blue line after Enter created a task; the assistant preview opened and the pane stayed).
- R25-19: still there («Учтено» at x=268, title at x=280).

## Owner requests not met

- «Forms keep their promise»: the overlap rule is forward-only (R26-03); time fields differ between screens (R26-05).
- «One way per job»: «Завершить» beside «Выйти» (R25-15) unchanged.

## What works well

- Back/forward is consistent on Inbox, Now, Day and Week after deletes and accepts; pasted deep links fall back to the section list.
- Every Undo I tried (Inbox Accept, Inbox Delete, preset Delete, task Delete) undoes exactly what it said; the preset one also offline and after reload.
- Typed times take every natural separator wherever typing is used.
- The deleted-preset page and the History confirm read cleanly in dark; no console errors and no 4xx/5xx in any run (the one pageerror was about:blank after Back past the first entry).
- Fresh EN account: empty states on Now, Day, Week, Inbox, History, Settings read well at 1440 and 390.

## Not covered

- Offline walk of Inbox Accept/Undo, Day logging and Week (only preset delete/undo offline).
- Ctrl+Enter in the other editable fields of the task pane (title, subtasks).
- Dark theme at 390; Projects, Insights, Notifications in dark; EN light screens only glanced at via one contact sheet.
- Real MCP client, Telegram widget, OAuth consent page (owner's step).

## Fix wave (after round 26, with the review of the QA 25 wave)

| Finding | State |
|---|---|
| Review I1 (a deleted hour digit committed «00:30»), M4 («9:30 PM», «12:345», «930»), R26-05 (Settings silent revert, pasted «930») | **fixed in 04dfdfa1.** `typeTime(raw, previous)` fills a one-digit hour only when text came in, keeps a deletion as typed, refuses text after the minutes and more than four digits, reads «930» as 09:30 typed or pasted; `TimeInput` saves on leaving or Enter, only what was typed, and shows «Введите время, например 09:30.» under itself as Day does. Bug lesson 208. |
| Review I2, R26-03 (overlap only forward; same start erased a block; start moved back shortened the previous one) | **fixed in eafa473a.** `overlapOf` checks every main block both ways, same start included; the spec's case (a logged block in a live block's time) stays and is said under From («Это время уйдёт из «…»»). Bug lesson 209. |
| Review I3 (alongside block refused against the main line) | **fixed in eafa473a.** Bug lesson 210. |
| R26-01 (error under «До» behind the pinned footer) | **fixed in 8f3040c3.** Every overlay body reveals a field error or form alert above its footer as it appears (web and phone). Left: the error still sits in its half-width column (the reveal makes it readable; a full-width message under the pair would lose its link to the field). Bug lesson 211. |
| R26-02 (Ctrl+Enter in the description marked the task Done) | **fixed in 1cd58029.** In-place editors own Escape and ⌘/Ctrl+Enter (`data-pace-keys="edit"`); the description saves on it. Bug lesson 212. |
| Review M1, M2, R26-06, R26-10 (Undo batching, double revoke, stale toast, three History rows) | **fixed in eec6c4e3.** `revokeAll` (one instant, all or none), `revoke` refuses a revoked target, Restore revokes every archive in effect, History shows a batch as one row, every Undo toast goes once what it undoes is revoked another way. Bug lesson 213. |
| Review M3, R26-04 («Изменить в Дне» landed on a bare day) | **fixed in 1e78bf5c.** The link names the block; Day opens its form once. Bug lesson 214. |
| Review M5 (Log past default refused) | **fixed in 36b9219b.** Bug lesson 215. |
| Review M6 (EN quote marks) | **fixed in 36b9219b.** |
| R26-07 (deleted preset shows nothing of itself) | **fixed in 36b9219b.** The deleted preset shows its sample task drawn with its settings and its parent. The full rule list stays in the form after Restore. Bug lesson 216. |
| R26-08 (pasted /decisions goes Back to Now) | **fixed in 36b9219b.** Bug lesson 217. |
| R26-09 (durations one minute off) | **fixed in 36b9219b.** Minutes between shown clocks. Bug lesson 218. |
| R25-03 latency | **left**, not part of this wave (documented separately). |

End-of-wave runs: `bun lint` clean; unit 905 (core) + 573 (client); app 1501; api 646; full chromium e2e 246 passed (10.7 min, latency project judged on CI).
