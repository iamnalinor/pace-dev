# Recheck after the freeze (QA rounds 27–28, the QA-26 and QA-27 wave reviews)

The owner froze the branch after QA round 28: no further QA round ran over the fixes below. This is
the checklist for the next QA pass (web build at 390×844 and 1440×900, light and dark, EN and RU,
as in [docs/qa.md](../../docs/qa.md)). Each line: the id, what to check, how. Lesson numbers point
into [bug-lessons.md](../bug-lessons.md).

## Time fields (R27-01, R27-02, R27-04, I1–I3 of the QA-27 wave review, R28-01, R28-09, R28-10)

- [ ] **Review I1 (lesson 235)** Settings → digest times, three rows. Type «2000» in the third and,
  without leaving the field, press its ✕: the row stays removed, nothing else changes. Type «2000»
  in the third and press the first row's ✕: the typed row moves up with «20:00» in it; Tab out:
  saved there. On Android repeat both by tap (a tap blurs nothing).
- [ ] **Review I2 (lesson 236)** In any time field holding «09:30», delete the 9 (caret after it),
  then type «:» or «.»: the field stays «0:30», says nothing complete; in the Close sheet the
  preview does not jump to 00:30.
- [ ] **Review I3 (lesson 237)** «7» then one press: the Close sheet's Done (exact time) closes at
  07:00; Enter in the field does the same; the task edit sheet's due panel: «7», Done once closes
  the panel with 07:00, Save once saves it; «7» and Save with the panel still open saves 07:00; a
  preset's issued «7» and due «9», one Save: both saved. Mouse, keyboard, and Android tap.
- [ ] **R28-01 (lesson 243)** Edit sheet and New task (full form): open the deadline panel, type
  «25:00», click Save / Create with the mouse: the form stays, «Введите время, например 09:30.»
  under the field, nothing written. Same for the final deadline panel. On Android, a tap on another
  field of the form with «2500» keeps the panel open; with «7» the panel closes and Save writes
  07:00.
- [ ] **R28-09 (lesson 245)** Type «99:99» key by key: «09:99» and no more; «09:30» then «5»: stays
  «09:30»; paste «12:345»: kept as typed, said wrong on leave.
- [ ] **R28-10 (lesson 246)** Settings → digest time «25:00», go to Now and back: the stored time,
  no message.
- [ ] **Typed estimate (lesson 248)** Task edit sheet → Estimate → «Другое» «45», Save without
  Enter: 45 min saved. Day's sheet: the same with its estimate.

## Day and the split rule (owner decision R27-05, R28-04, R28-05)

The rule (brief: `briefs/feedback-5-brief.md`, last section): a **new** past block logged over
time another block holds takes that time out of it «как в календаре», live or logged. Editing an
existing block into its neighbour stays refused.

- [ ] **Cut the end.** Logged «A» 09:00–10:30. Log past 10:00–11:00: the form says «Это время уйдёт
  из «A»» under С, saves; Day shows A 09:00–10:00 and the new block.
- [ ] **Cut the start.** Logged «B» 11:30–12:30. Log past 11:00–12:00: same hint; B now 12:00–12:30.
- [ ] **Split.** Logged «Lecture» 09:00–12:00, Log past 10:00–10:30: Lecture 09:00–10:00, the new
  block, Lecture 10:30–12:00 (the second part keeps label, category, task, Expect).
- [ ] **Whole cover.** Logged «Tea» 10:15–10:30, Log past 10:00–11:00: the form says «Активность
  «Tea» уйдёт целиком: это время её перекрывает.»; Tea is gone.
- [ ] **Live neighbours.** A running or stopped live block: Log past over its start, end or middle:
  the hint names it, the timeline cuts it (no events on the live block).
- [ ] **Same start** (R27-05's tie): logged 10:00–10:30, Log past 10:00–10:15: cut, named; 10:00–
  10:30 or longer: removed, named.
- [ ] **Undo restores all.** After each of the above, History shows the write as **one** row
  («Записано прошедшее…»); its Undo brings every neighbour back exactly (Day before = Day after).
  Network: one push of the batch, one of the Undo, then quiet.
- [ ] **Edit stays refused.** Open an existing block and move its end into the next one: «Это
  заходит на следующую активность…», nothing written.
- [ ] **MCP and assistant.** `log_activity` over a logged block splits it the same way (get_day
  shows the pieces); the assistant's «записал прошедшее» over a logged block does the same.
- [ ] **R28-04 (lesson 242)** Day: С «13», До «1»: «Конец должен быть позже начала.», not «Это ещё
  впереди». С «13», До a later hour today still ahead: «Это ещё впереди…».
- [ ] **R28-05 (lesson 241)** Inbox Accept (preset + importance): History shows one row for the
  accept with one Undo, which takes all of it back. Revocations done together still one row.

## Toasts and Undo (R27-03, R27-09, R28-02)

- [ ] **R28-02 (lesson 244)** Project → Изменить → «В архив» (toast), then «Показать архив» → the
  project → «Вернуть из архива»: the toast goes at once; no History row is added by it. Archive,
  restore from History, archive again: the first toast (if still up) is gone. Double-click the
  toast's «Вернуть»: one revocation.
- [ ] **R28-02 sweep** Done on a Now row (toast), then reopen the task from its page: the toast
  goes.
- [ ] **R27-09** After a preset Delete the focus lands on the toast's «Вернуть».

## Lists and labels (review M5/R28-06, M6, M1, R27-07, R27-08/R28-07)

- [ ] **M5 / R28-06 (lesson 239)** Projects with nothing archived: no «Показать архив»; archive all
  projects, turn the switch on: archived rows, no «Пока нет проектов». Presets with nothing
  deleted: no «Показать удалённые».
- [ ] **M6 (lesson 240)** Retitle a task through the assistant/MCP as an amendment, then undo its
  creation in History: the later rows keep the newer title.
- [ ] **M1 (lesson 238)** MCP `revoke_event` twice on one event: the second answers
  «action/nothing-to-do: The event is revoked already; nothing was written (a repeated call is
  harmless).»
- [ ] **R28-07 (lesson 247)** At 1440: New task in the pane, hover «Создать»: tooltip «Создать ·
  Ctrl+Enter»; a task's description editor: «Сохранить Ctrl+Enter» on the button.

## Double presses (lesson 249, class 222)

- [ ] Double-click a preset's Delete confirm, a task's «Открыть снова», a project's «В архив» /
  «Вернуть из архива»: one event each (History, network).

## Left unfixed (owner froze the branch)

| Id | Severity | What is left |
|---|---|---|
| R27-09 remainder (= item 3 of the wave) | Low | Escape in Day's form, and Escape after Week's «Изменить в Дне», drop focus to BODY; focus should return to the row that opened the form. |
| R28-03 | Low | At 1440 the date panel in the edit sheet reveals only its top; «Время», «Убрать», «Готово» below the fold. |
| R28-07 (pane Done) | Low | The task pane's «Готово» names Ctrl+Enter only in its tooltip and hint; on the button it was removed for room (design review B1). Owner's call. |
| R28-08 | Low | Close sheet: the time field has no visible label and sits 25 px off the date; the zone note shows the raw IANA id; the date example «2026-10-07» is fixed, not today. |
| R28-09 remainder | Low | Day's From moves to To after a complete start, so a key typed after it («:5») lands in To. By design today; QA calls it a spill. |
| R28-05 remainder | Low | History's per-task rule still shows one visible «Вернуть» per task (F-CMP-14); the confirm text «Вернуть всё, как было до этого события» promises more than one row's Undo. |
| Calendar "attended" | Low | `calendar-run.ts` logs a past block without cutting its logged neighbours (the R27-05 rule applies to Log past, MCP `log_activity` and the assistant only). |
| Review M3 | Cosmetic | A split History row's revoked part names one revocation when members were revoked by different ones. |
| Review M4 | Cosmetic | The in-batch duplicate check ignores a revocation undone later in the same batch (no writer produces it). |
| R28-11 | Cosmetic | Now at 390: deadline text truncated, order swapped against desktop. |
| R28-12 | Cosmetic | Day «Учтено» 12 px off the title; clock label touches the divider. Owner: leave. |
| R28-13 | Cosmetic | Archive form «В архив» indented 16 px; Week pane date without month. |
| R28-14 / R25-03 | Low | Tap latency at 4x CPU. Owner: deferred. |
| R27-10, R27-11, R27-12, R25-13, R25-15–R25-17, R25-19 | Low / cosmetic | As listed in qa-round-28.md "Open items from round 27". |

Pushed back (not bugs): review M2 — a time in the DST gap is not read as null by `fromWallClock`
(it becomes the hour after), so the Close sheet never says «Введите дату» for it; pinned by
`format/time.test.ts`.
