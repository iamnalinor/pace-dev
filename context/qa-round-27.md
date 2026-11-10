# QA round 27 — intermediate round (round 26's fix wave)

Tester: Playwright/Chromium against HEAD c161d9b8, fresh web build on :4173, fresh Worker on :8787 (`--persist-to .cache/qa-state`, ENVIRONMENT:test, fake LLM, ids 9270000001..40). Accounts: lived-in RU (`seedLivedIn`, Europe/Moscow), fresh EN (en-US, New York). Scripts and shots: `/tmp/claude-0/-home-user-pace-dev/c2f6dbb0-2503-5cbb-9212-ea5d94eaadd2/scratchpad/qa27/` (shots in `s/`). WebSocket frames were logged (sync runs over a socket, not HTTP); after every Undo the socket went quiet.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 3 |
| low | 7 |
| cosmetic | 3 |

All ten round 26 fixes are confirmed. The mediums are holes in the same classes: the time-field rule was not swept over the Close sheet's own «Время» field, Save with an unreadable time silently drops it in two forms, and archiving a project has none of the feedback or Undo that deleting a preset got.

## Round 26's fixes

| Id | State |
|---|---|
| R26-01 error hidden under pinned Save (390x844) | **confirmed.** Day gap Log, До 11:30, Save: the error sits at y=683-755, Save at y=786; «Введите время…» at y=719-755. Still a four-line half-width column (known). `s/p-gap-err.png`, `s/p-gap-err-time.png` |
| R26-02 Ctrl+Enter in description | **confirmed.** Ctrl+Enter and Meta+Enter save the description, task stays open; Escape cancels, pane stays, focus on «Изменить описание»; plain Enter is a newline. Ctrl+Enter with focus elsewhere in the pane still marks Done (see R27-08). Title/subtask fields of the pane not swept. |
| R26-03 overlap both ways | **confirmed.** Start inside a closed block, same start, equal block, swallowing a block: refused (under До «…следующую…» / under С «…предыдущую…»). Editing a block's start into the previous one: refused. Inside a live block: allowed with «Это время уйдёт из «…»», the live row splits in two. Alongside (Музыка) moved over main blocks: saved. See R27-05 for the wording of the same-start case. |
| R26-04 «Изменить в Дне» | **confirmed.** Day opens the right date with that block's form; close, prev day, Back, Back, Forward, reload: not reopened. Focus after Escape goes to BODY (R27-09). |
| R26-05 time fields agree | **partly.** Day, Settings, preset and task-deadline fields agree (typed/filled 930, 0930, 9:30, 9.30; deleted digit stays; message on leaving or Save). The Close sheet's own Дата/Время field does not: R27-01. |
| R26-06 stale Undo toast | **confirmed.** Delete preset, open from «Показать удалённые», Restore: toast gone, no extra push. |
| R26-07 deleted preset shows itself | **confirmed.** «Удалён», sentence, Restore, a preview «Пример задачи» tagged with the preset name, «Унаследовано от «Домашка»» (light, dark). |
| R26-08 pasted /decisions Back | **confirmed** at 1440 and 390 (goes to /notifications). |
| R26-09 durations | **confirmed.** Log 00:00-10:30: «Учтено 13 ч 30 мин» = 10:30 + 1 ч + 2 ч; after a further 15 мин block 13 ч 45 мин. |
| R26-10 History after Inbox Undo | **confirmed.** Accept = 2 events in one frame, Undo = 2 revokes in one frame, one «Исправление: отозвано · <note>» row, quiet after. Assistant Undo (EN) and History Undo: one frame each. |

## Findings

### R27-01 medium — Close sheet's date/time field is not the shared time field
Now → task pane → «Другое время или итог…» → «Выбрать время», 1440, light, RU. Steps: in «Время» type «7», «0930», fill «930», «9.30». Happened: nothing is read except «9:30»; the field stays as typed («0930» stays «0930», no colon), the message is a different sentence («Дата в формате ГГГГ-ММ-ДД, время — ЧЧ:ММ.») shown for both date and time at once, «Готово» is disabled with no hint which field is wrong, Enter does nothing. Everywhere else «0930», «930», «9.30» read as 09:30 and the message is «Введите время, например 09:30.». Should: the same TimeInput. Class: round 26's «time fields agree» was swept over the fields the fix touched, not over every typed time (grep for a time field not built on `TimeInput`). `s/close-sheet-bad-time.png`. Also the summary line there reads «Записано 14:21 · произошло —» with a dangling dash.

### R27-02 medium — Save with an unreadable time closes the form and silently keeps the old time
Task edit sheet (deadline picker «Время»), 390 and 1440, and Preset page («Время срока»), 1440, RU. Steps: type «25:00» (or «2500») in the time field, click Save without leaving the field. Happened: the sheet closes / the page goes back to /presets; the old value is saved, no message, the typed time is lost. Day's sheet does it right (stays open, error under the field). Should: Save is blocked and the message shows, as in Day. Class: a button that blurs a field and submits in the same tick, before the blur's error counts. `s/x-edit-time-typed-390.png`, `s/x-edit-time-after-save-390.png`.

### R27-03 medium — Archiving a project has no feedback and no Undo, and hides it for good
Projects → Алгебра → «Изменить проект» → «В архив», 1440, RU. Happened: the event is sent (project.updated archived:true), the page stays on the project exactly as before (still «Изменить проект», no «Архив» mark, no toast); the project vanishes from the list, and the list has no «show archived» switch (presets have «Показать удалённые»). The only way back is the URL or a task's project chip, then Edit → «Вернуть из архива». Presets say «Удалить» with a confirm and a toast with Undo; projects say «В архив» with neither. Should: one verb, a toast with Undo, leave to the list (or mark the page «В архиве» with a visible Restore) and a way to list archived projects. `s/project-after-archive.png`, `s/projects-after-archive.png`.

### R27-04 low — «7» is refused instead of read as 07:00; Day validates later than the others
Day, Settings, preset, task deadline, 1440, RU. Typed «7» + Tab gives «07» (not 07:00): Settings/preset/deadline show «Введите время…» at once; Day shows nothing until the first Save, then both fields flag. «99:99» typed key by key becomes the garbage «09:9:99». Should: «7» means 07:00 (round 26 offered it) or one rule for when the message appears; refuse extra separators as they are typed.

### R27-05 low — Same-start overlap names the wrong neighbour
Day, 1440, RU. Block «Базовый» 08:00-09:00, Log past «Т» 08:00-08:30 (or 08:00-09:00). Happened: «Это заходит на следующую активность: сначала сдвиньте её начало.» under До, while the new block lies inside «Базовый» (08:20-08:40 gets the correct «…предыдущую…»). Should: the «предыдущую» message (or «это время занято»). Also a seeded block that was ended by the next start (Собираюсь) accepts a block inside it and is split in two, while an identically drawn explicitly ended block refuses it; the two look the same in the list.

### R27-06 low — Deadline picker opens half off-screen in the task sheet
Task edit sheet, 1440x900, RU: tap the deadline chip. The calendar shows three rows, «Время», «Убрать», «Готово» are below the pinned Save and need a scroll; the sheet does not scroll the unfolded picker into view (R26-01 revealed errors only). `s/edit-deadline-picker.png`.

### R27-07 low — History Undo of «Задача создана» leaves orphans
History, 1440, RU. Accept a note, then Вернуть on «Задача создана · <note>» (the capture). The later «Важность изменена» / «Пресет изменён» rows lose the task name, and «Важность изменена» still offers a live Вернуть. A confirm that said what else stays would do. `s/history-after-undo2.png`.

### R27-08 low — Done by Ctrl+Enter in the pane has no hint
Task pane, 1440: «Готово» shows no shortcut, nor does the pane's description Save, nor New task's «Создать»; the edit sheet, close sheet and Inbox show «Ctrl+Enter» on their buttons, and Settings' «Клавиши» lists only Alt+N and Alt+F. A click on any pane text then Ctrl+Enter closes the task. Add the hint to «Готово» (and list the keys).

### R27-09 low — Keyboard: Undo is 17 Tabs away; focus is dropped after a swap
1440, RU. After preset Delete the toast's «Вернуть» is reached after 17 Tab presses (toast sits last in the DOM; focus after the confirm goes to BODY). After «Изменить в Дне» then Escape focus is on BODY. Same for Day's form closed with Escape when focus was inside it. Suggest: focus the toast action (or give Undo a shortcut), return focus to the row that opened a form.

### R27-10 low — Presets and Notifications: «Назад» above the title; title heights differ
390 and 1440: the back arrow sits above «Пресеты»/«Уведомления» (title at y=66 vs 78 on Проекты/Настройки). Same as R25-16. Every preset row has the same repeat glyph (it reads as «repeats»), chevron at the top of the row instead of centred.

### R27-11 cosmetic — Week: «Изменить в Дне» is indented 16 px against the pane text; Week blocks at 1440 with the pane open cut to «Пош…», «Муз…»
`s/week-pick.png`.

### R27-12 cosmetic — History: «Исправление: отозвано» after an assistant Undo (EN, task creation) has no subject; «Settings changed» (system, first sign-in) offers Undo
Fresh EN, 1440. `s/en-history-after-assistant-undo.png`.

### R27-13 cosmetic — A 5-minute gap between two blocks is not shown; the empty Now's «Add a task» (opens the full form) sits under a field that says «Add a task or paste text»
Day RU (10:30-10:35 missing between «Утро» and «Вечер»); Now EN.

## Round 26's open lows

- R25-03: still there. 4x CPU, 390, lived-in RU, click duration: Day tab 304 / 112 ms (first / repeat), Now 152, Inbox 128. Low, owner-deferred.
- R25-13: still there («Учтено 3 ч», Музыка alongside not counted; as specified). Low.
- R25-15: still there («Завершить» beside «Выйти», devices row without separators). Low.
- R25-16: still there (Presets, deleted preset, Notifications), now R27-10. Low.
- R25-17: still there (Inbox: stacked Принять/Удалить, row highlight stops at the button column, 1440). Low.
- R25-18: not reproduced.
- R25-19: still there («Учтено» at x=268, page title at x=280). Cosmetic.

## Owner requests not met

- «Time fields everywhere agree»: the Close sheet (R27-01); Save with an unreadable time (R27-02).
- «Preset/project Restore, one Undo»: projects have no toast and no list of archived ones (R27-03).
- «Main actions have shortcuts named on the buttons»: pane «Готово» (R27-08).

## What works well

- Every Undo checked (Inbox Accept, assistant, preset Delete, History row, offline) sends one frame, one History row, and the network is quiet after; the toast leaves when its action is undone another way.
- Overlap errors read clearly and scroll above the pinned Save at 390; the Day rows sum to «Учтено».
- Offline: Inbox Accept + Undo and Day logging queue (`Нет сети · изменения отправятся позже`) and push as one frame on reconnect.
- Deleted preset page, History and Day in dark read cleanly; no console errors or 4xx/5xx in any run.
- Russian account in an English browser: language arrives with the first paint, html lang=ru.

## Not covered

- Ctrl+Enter in the pane's title and subtask fields; New task's «Создать» shortcut.
- Real MCP client, Telegram widget, OAuth page; Add computer / token sheet at 390 for R26-01.
- Dark at 390 for sheets; EN walk of Presets and Projects beyond empty states.
- Project Restore's Undo (there is none, R27-03).

## Fix wave (review of the QA 26 wave, then round 27)

Branch ccr-e3a712f8-b1chmi, one commit per item, each with a bug-lessons entry (classes 219–234), the class swept and a guard added. Tests first for each.

### Review of the QA 26 wave (I1–I5, cheap minors)

| Id | State | Commit | Lesson |
|---|---|---|---|
| I1 typed time lost when the field is not left (Android) | **fixed.** `TimeInput` saves a complete time it still holds as it unmounts; inside a draft (date panel, preset final/recurrence times) it hands each complete time over as typed, so Done/Save find it. | 7ea4e407 | 219 |
| I5 untouched field ignores a new stored value | **fixed** with I1 (same component): takes the stored value while untouched; the date panel's `key` is gone, digest rows stay keyed by position. | 7ea4e407 | 220 |
| I3 MCP `revoke_event` wrote a duplicate revocation | **fixed** at the store (`prepareBatch`, every server writer): `action/nothing-to-do`, the client's code. API test. | 8f405cce | 221 |
| I4 check-then-act in `revokeAll` | **fixed.** `stage` takes a `refusal` run inside the write queue (revocations, and `stageEmit`'s retro rules); Stop runs under `serially`. Test: two revokes at once write one. | 10cac217 | 222 |
| I2 grouped History row stuck | **fixed.** A batch is split by state: the members in effect (Undo revokes only them) and the ones revoked already. | af0ec5fd | 223 |
| M1/M2 reveal: last error wins; per-keystroke scroll | **fixed.** The first reveal of a render wins; a message is revealed on appearance, not on text change. | ee1f3209 | 224 |
| M10 `?block=` before the store is ready | **fixed.** Waits for `ready`; an unknown block opens nothing. | d0b4f7f2 | 225 |
| M11 stale Settings comment | **fixed** in 7ea4e407. | | |
| M3–M9, M12 | **left** as the review allowed (M8's `revokedIdsIn` per call was done in passing with I4). | | |

### Round 27

| Id | State | Commit | Lesson |
|---|---|---|---|
| R27-01 Close sheet's «Время» | **fixed.** It is `TimeInput` («930», «0930», «9.30»; its message; Enter presses Done); the date says its own message; no «произошло —». | 36f67b69 | 227 |
| R27-02 Save with an unreadable time | **fixed.** Every `TimeInput` registers with its form (`useTimeChecks`); the task edit sheet's Save, the composer's Create, a preset's Save, the date panel's Done and the Close sheet's Done refuse with the message. | 0c4a9853 | 226 |
| R27-03 project archive without feedback | **fixed.** Toast with Undo, back to the list; «Показать архив» on the list; an archived page says so with Restore at hand. | 341a41ae | 228 |
| R27-04 «7», Day's late message, «09:9:99» | **fixed.** `readTime`: an hour alone is that hour sharp on leave and save (all time fields, Day's too); Day says a time fault once a field is left; a second separator is refused as typed. | 6433dd65 | 229 |
| R27-05 same-start wording | **fixed** (a draft inside a same-start block is «…предыдущую…»). **Left for the owner:** a logged block into a past live-recorded block splits it, into a logged one is refused; requirements.md («обрезает или делит соседние интервалы, как в календаре») vs R26-03's refusal. | 27fc2e09 | 230 |
| R27-06 deadline picker off-screen | **fixed.** The date panel asks the overlay body to reveal it as it opens. | 921c9e2b | 231 |
| R27-07 orphans after undoing «Задача создана» | **fixed.** A gone task is named from the log; its task events offer no Undo. | 3960380a | 232 |
| R27-08 Ctrl/⌘+Enter on the pane's Done | **fixed.** Tooltip and hint name it; Settings lists it. New task's «Создать» and the pane's description Save were not changed. | c79767bc | 233 |
| R27-09 focus after delete | **partly.** An Undo toast takes focus left on the page (web). **Left:** focus back to the row after Escape in Day's form / after «Изменить в Дне». | 29ae3ad5 | 234 |
| R27-10–R27-13 | **left** (cosmetic / low, as allowed). | | |
| R27-03 follow-up | «Показать архив» showed during a first sync (caught by `sync-state.e2e.ts`); it waits for the account now. | 02abaa0f | 228 |

### End-of-wave runs

- `bun lint`: clean (31 warnings, all pre-existing).
- `bun test:unit`: scripts 173 pass; core 905; client 579; pace-agent OK.
- `bun test:app`: 1525 passed (before the last follow-up; projects suite re-run after it: 8 passed).
- `bun test:api`: 647 passed.
- `bun test:e2e` (chromium, full): 245 passed, 1 failed, 10 did not run (12.8 min). The failure was `sync-state.e2e.ts` «/projects during a first sync…» (the new archive switch), fixed in 02abaa0f; `sync-state.e2e.ts` re-run whole: 36 passed. The 10 «did not run» are the reporter's count for tests not started in that run (no names listed); a further full run was not made.

### Left

- Review M3–M9, M12 (as allowed); R27-05's live-vs-logged split question (owner); R27-09's focus back to the row after Escape in Day's form and after «Изменить в Дне»; R27-08's hints on New task's «Создать» and the pane's description Save; R27-10–R27-13 (cosmetic); the typed estimate (`TypedEstimate`, «Enter sets it») still loses a value when Save is tapped without Enter (class 219, noted); other client actions whose own pre-checks read state before `emit` (class 222, noted).
