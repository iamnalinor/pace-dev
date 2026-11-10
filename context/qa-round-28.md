# QA round 28 — intermediate round (round 27's fix wave)

Tester: Playwright/Chromium against HEAD 5e50178a, fresh web build on :4173, fresh Worker on :8787 (`--persist-to .cache/qa-state`, ENVIRONMENT:test, fake LLM, ids 7001..7020). Accounts: lived-in RU (`seedLivedIn`, Europe/Moscow; also in an en-US browser), fresh EN (en-US, New York). Scripts and shots: `/tmp/claude-0/-home-user-pace-dev/c2f6dbb0-2503-5cbb-9212-ea5d94eaadd2/scratchpad/qa28/` (shots are the `.png` files there). Sync runs over a socket, so WebSocket frames were logged next to HTTP; after every Undo/archive/restore checked the network went quiet (0 requests/frames in 3 s). No console errors or 4xx/5xx in any run.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 2 |
| low | 8 |
| cosmetic | 4 |

Most of round 27's fixes hold (Close sheet, project archive with toast, double-press, offline queue, focus on the Undo toast). The two mediums are holes in the same class as R27-02: a mouse press on Save/Create while an unreadable time is typed in the open date panel is still silently dropped, and the archive toast is not retired when the project is restored another way.

## Round 27's fixes

| Id | State |
|---|---|
| R27-01 Close sheet «Время» | **confirmed.** «7»→07:00, «930», «9.30» read; own date message («Введите дату, например 2026-10-07.»); Enter presses Done; Done with 25:00 shows the message. Remaining: R28-08, R28-09. `close-bad-time-done.png` |
| R27-02 Save with unreadable time | **reopened for two forms.** Preset page Save: refused with message (confirmed). Composer full form «Создать» and task edit sheet «Сохранить», **by mouse**, with an unreadable time in the open date panel: see R28-01. Ctrl+Enter and the panel's Done refuse correctly. |
| R27-03 project archive | **confirmed.** Toast «Проект в архиве: Алгебра · Вернуть», back to the list, focus on «Вернуть», double-click Undo writes one frame, «Показать архив» lists it with «В архиве», its page says so and offers «Вернуть из архива» (one frame). Stale toast: R28-02. |
| R27-04 «7», Day late message, second colon | **confirmed** («7»→07:00 everywhere incl. Day and Settings; second colon refused). A third-digit minute is still typed: R28-09. |
| R27-05 same-start wording | not re-walked (owner question on live vs logged split still open). |
| R27-06 date panel scrolls into view | **confirmed at 390** (panel, Время, Готово all visible); **partial at 1440**: R28-03. |
| R27-07 orphans after undoing creation | **confirmed for names** (rows keep «Заметка R28»); History Undo model: R28-05. |
| R27-08 Ctrl/⌘+Enter on Done | **confirmed.** Hover tooltip «Закрывает задачу сейчас. · Ctrl+Enter»; Settings «Клавиши» lists «Ctrl+Enter — Готово или сохранить». The pane's Done itself shows no visible hint (R28-07). |
| R27-09 focus | **partly.** Undo toast takes focus after archive and Inbox Accept (confirmed). Escape in Day's form / after «Изменить в Дне» / after Save in Day: focus on BODY. |
| Double-press undo / server refuses re-revoke | **confirmed.** Double-click on a History confirm and on the archive toast: one frame, one «Исправление» row. |
| «Изменить в Дне» waits for the store | **confirmed.** Opens the block's form with the right name; Back to Week reopens the pane; focus lands on the sheet. |

## Findings

### R28-01 medium — Save/Create by mouse silently drops an unreadable time typed in the open date panel
Task pane → Изменить (and Now → Новая задача → pick a date, reopen «Срок:»), 1440 and 390, light, RU. Steps: in the panel's «Время» type «25:00» (also «2500», «99:99») and click «Сохранить» (edit sheet) or «Создать» (composer form) without leaving the field. Happened: the sheet/form closes, no message; edit sheet changes nothing (deadline stays 17:28), the composer creates the task with the previous time (chip showed 23:59). Should: stay open with «Введите время, например 09:30.» as Done and Ctrl+Enter do (same input, same sheet, Ctrl+Enter refuses). Preset page and Day's sheet Save refuse correctly. Class: the form's pre-submit check is not fed by a draft held inside the date panel when the press blurs the field first. `typed-bad.png`, `after-save.png`, `edit-after-save-390.png`, `new-after-bad.png`.

### R28-02 medium — Archive toast outlives a restore done another way, and its Undo writes a stray revocation
Projects → Алгебра → Изменить → «В архив» (toast), then «Показать архив» → Алгебра → «Вернуть из архива», 1440, RU. Happened: the toast «Проект в архиве: Алгебра · Вернуть» is still shown on the restored project's page; pressing it sends a frame (revoking the old archive event) and adds a History row though nothing changes. Should: the toast leaves when its action is undone another way (R26-06 class, preset Delete got it, projects did not). `stale-toast.png`.

### R28-03 low — Date panel at 1440 reveals only its top
Task edit sheet → deadline chip, 1440x900, RU. Happened: calendar shows 3 of 6 weeks; «Время», «Убрать», «Готово» are below the fold (time field at y=897 of 900) although the sheet's scroll area could show all 400 px. At 390 it is fully visible. Should: reveal the whole panel (or its bottom edge). `edit-deadline-panel.png`.

### R28-04 low — «До» earlier than «С» says «Это ещё впереди»
Day → block → С «13», До «1» → Сохранить, 1440, RU. Message «Это ещё впереди: записывайте то, что уже было.» Should say the end is before the start. `day-from-13-to-1.png`.

### R28-05 low — History: Undo only on the newest row of an Accept batch
History after Inbox Accept (3 events), 1440, RU. Only «Важность изменена» offers «Вернуть»; «Пресет изменён» and «Задача создана» show none until the ones above are undone one by one; the confirm says «Вернуть всё, как было до этого события» yet revokes one event, then the next row gains Вернуть and the first reads «Отменено». A person cannot tell why a row has no Undo, and the batch's own toast Undo is the only one-step way. Suggest one Undo per batch or a hint. `hist-after-accept.png`, `hist-after-undo-batch.png`.

### R28-06 low — «Показать архив» offered when nothing can be archived
Projects, 1440/390, RU (two projects, none archived) and fresh EN («No projects yet.» plus a «Show archived» switch). A switch that cannot show anything (heuristic: every control earns its place). Hide it until a project is archived (as presets' «Показать удалённые» probably should too). `en-projects.png`.

### R28-07 low — Pane «Готово» hint only on hover
Task pane 1440: edit sheet, Close sheet and Settings show «Ctrl+Enter» on the button; the pane's «Готово» only in a tooltip (which sits over the pane's bottom edge). New task's «Создать» and the description Save still none (R27-08 remainder). Show it on the button or accept as owner choice.

### R28-08 low — Close sheet: Date and Time fields misaligned, time unlabelled, raw zone name
Now → pane → Другое время → Выбрать время, 1440, RU. «Дата» has a label and sits 25 px lower than the time field, which has none; the note reads «Время читается в поясе Europe/Moscow» (IANA id). The date example in the error is a fixed «2026-10-07». `close-pick.png`.

### R28-09 low — Time fields still accept garbage minutes
«99:99» becomes «09:999», «9:30:5» overflows into the next field (Day: «До» got «:5»). Message appears, but the field should cap at 4 digits.

### R28-10 low — Settings keeps an unreadable draft after leaving
Settings → «Время сводки 1» type «25:00», go to Now and back: the field still shows «25:00» while 09:30 is stored (the screen stays mounted). Should reset to the stored value.

### R28-11 cosmetic — Now at 390: deadline truncated
Rows read «осталось 23 ч 59 мин · Срок за…» (order swapped against desktop, «Срок» cut). `m390-.png`.

### R28-12 cosmetic — Day: «Учтено» at x=268 vs title x=280 (R25-19); clock label «17:48» touches the divider above «Записать прошедшее».

### R28-13 cosmetic — Archive form: «В архив» is indented 16 px from the form's left edge; Week pane date «вт, 10, 14:41–15:41» has no month. `project-edit.png`, `week-pick.png`.

### R28-14 cosmetic — Tap latency (R25-03 measure)
4x CPU, 390, lived-in RU, click to second frame: Day 331 ms first / 139 ms repeat, Now 171, Inbox 77.

## Heuristics walk (breaches beyond the above)

- One way per job: «Готово» on the pane and «Готово» in the Close sheet and the date panel use the same word for three different commits.
- Overlays in context: toasts persist across navigation (archive, Inbox capture, Accept) and stay on screens they no longer concern (R28-02).
- Forms keep their promise: R28-01.
- Keyboard: Escape closes sheets; Escape does not dismiss a toast; focus after Escape/Save in Day's form is BODY.

## Open items from round 27

- R27-09 remainder: still there (Escape in Day's form, after «Изменить в Дне», after Save: BODY). Low.
- R27-08 remainder: still there («Создать»; description Save not rechecked). Low.
- R27-10: still there (Presets: «Назад» above the title at 390; chevron placement). Low.
- R27-11: Week block text cut «Пош…», «Муз…» with the pane open: still there. Cosmetic.
- R27-12: still there («Settings changed» offers Undo, fresh EN). Cosmetic.
- R27-13: not rechecked.
- R25-03: measured, R28-14. Low, deferred.
- R25-13: unchanged («Учтено 3 ч», Музыка not counted). Low.
- R25-15: not rechecked. R25-16: still there (= R27-10). R25-17: still there (Inbox Принять/Удалить stacked). R25-19: still there (R28-12).

## Owner requests not met

- «Time fields everywhere agree»: R28-01 (Save by mouse), R28-09.
- «Toast Undo retires when undone another way»: projects (R28-02).

## What works well

- Archive/restore/Undo/Inbox Accept/History confirm: one frame each, double-press safe, network quiet after.
- Offline: archive queues («Нет сети · изменения отправятся позже», «Попробовать снова») and pushes once on reconnect.
- Russian account in an English browser: html lang=ru from first paint.
- Typed times: «7», «930», «9.30» read the same on Close sheet, Day, Settings, preset; the message sits under the field and reveals above pinned Save at 390.
- Dark at 1440 on all changed screens reads cleanly; no console errors anywhere.

## Not covered

- Telegram/MCP/OAuth, real LLM; New task's Ctrl+Enter; pane title/subtask fields' Ctrl+Enter.
- Full Tab-order walk of every screen; loading/first-sync states beyond the route sweep; Day sheet at 390; dark at 390.
- «Подключить ИИ-приложение»/«Добавить компьютер» sheets.

## Fix wave (QA-27 wave review, owner R27-05, round 28) — the branch is frozen after it

No QA round verifies these; the checklist for the next pass is
[stage-8/recheck-after-freeze.md](stage-8/recheck-after-freeze.md). Lessons 235–249.

| Item | Cause | Fix | Commit |
|---|---|---|---|
| Review I1 | Digest rows keyed by index; the removed row's field saved on unmount through the `onTime` of the render before (the old list) | `setDigestTime`/`removeDigestTime` write by index on the list in the action queue; rows keep a key each (`useRowKeys`) | 60a97490 |
| Review I2 | A second separator answered `typeTime(previous)`, read whole | `typeTime(previous, previous)`; property tests over deletions and stray separators | 639d0fd3 |
| Review I3 | Save read the draft from its own render's closure after a field handed «7» over | `useCheckedSubmit`: a field that hands over answers `waits`, one per press, the press runs again from the next render; Enter commits and presses | 9f9cabab |
| Review M1 | No `CODE_MESSAGES` entry for `action/nothing-to-do` | Message saying the repeat is harmless | 154786a6 |
| Review M2 | — | Pushed back: `fromWallClock` never returns null for a DST-gap time; pinned by a test | 90ddb615 |
| Review M5 / R28-06 | Empty state and switch keyed on half the list | Empty state goes with archived rows shown; switch only with something archived (projects and presets) | 14553b2a |
| Review M6 | The title lookup skipped `event.amended` | Follows an amendment to its target | 90ddb615 |
| Owner R27-05 | Logged neighbours were refused | Core `yieldsTo`/`yieldEvents`: a logged neighbour is moved (`activity.adjusted`), split (logged copy) or revoked in the same batch, a live one cut by the timeline; app Log past, MCP `log_activity`, the assistant | 56b6e7f5 |
| R28-05 | Only revocation batches were one History row; each event had its own `recordedAt` | The store records a write at one instant, later writes later; History shows a write as one row with one Undo | 56b6e7f5 |
| R28-04 | «13» → «1» read as a night into tomorrow, caught by "ahead" | `notAhead` says the end is before the start for that pair | 56b6e7f5 |
| R28-01 | The panel's outside-press dismissal unmounted the time field before Save asked it | The panel dismisses through its checked Done (web pointer and Android touch) | 453dbcfa |
| R28-02 | Restore writes `project.updated`, not a revocation; the toast retired on revocations only | Toast `holds`; `undoArchive` revokes only the archive in effect, in the write queue; the Done toast swept | 16a93e99 |
| R28-09 | Only a second separator was refused | Any key that makes a readable text unreadable is refused | 7bc5c975 |
| R28-10 | The Settings screen stays mounted behind its tab | A self-saving time field drops an unreadable text when its screen goes inactive | 3e87c1ba |
| R28-07 / R27-08 remainder | Sweep stopped at the footer | Create in the pane: tooltip and hint; description Save: the key on the button | ed740180 |
| Typed estimate (class 219 left) | Only Enter handed the length over | Handed over as typed inside drafts | a0538a39 |
| Class 222 left | Pre-checks outside the queue | `emit(…, check)` runs the action's check in the queue: preset Delete, Reopen, project archive/restore | e52926c2 |

Left unfixed (frozen): R27-09 remainder (focus after Escape in Day's form and after «Изменить в
Дне»), R28-03, R28-08, R28-11, R28-13, the pane Done's visible hint (owner's call), the calendar
"attended" log not cutting neighbours, review M3/M4 (cosmetic). R28-12 and R28-14 left by the
owner. Severity for each in the recheck checklist.
