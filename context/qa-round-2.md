# QA round 2 (exploratory, web build)

Tester: Sonnet QA agent, 2026-10-10. Build: `apps/app` web export served on :4173 against the local Worker on :8787 (`LLM_PROVIDER=fake`, `ENVIRONMENT=test`), HEAD `85b4594` (QA round 1, batch 3).
Accounts: 3500 (`seedLivedIn`, Russian, device timezone Europe/Moscow; re-seeded between flows so earlier actions do not leak), 3501 (fresh, English). A phone calendar (5 events, one running, one starting in 7 min, one overlapping, one with a very long title) and a computer's app usage were pushed through `/api/calendar/sync` and `/api/usage/sessions` to check Attend/Skip, From calendar, Week and "where I sat".
Coverage: 21 screens x 1440x900 / 390x844 x light/dark x RU/EN (148 screenshots, DOM text, overflow, console and network logs), axe on 16 routes x 2 sizes x 2 themes, tab order, tap-target and font-size audit, title-position audit, offline, bad session, every form/sheet listed in the brief.
Screenshots and scripts: `/tmp/claude-0/-home-user-pace-dev/8008f024-d8c7-5848-9a9c-e7daadedded8/scratchpad/qa2/` (`shots/`, `mont/`, `*.ts`); in the findings `shots/x.png` means that folder.

Limits: the LLM is the fake provider (it keeps the words as the title and returns almost nothing else), so parsing findings only describe what the rules and UI do; the web cannot read a phone calendar, so Attend/Skip was driven through the cloud calendar endpoint. The Telegram widget error on /login is a localhost artefact.


## 0. What was done with it

Fixed after the round (with the code-review findings of the same pass):
- QA2-1: the Day sheet refuses an end at or before the start unless it is a short night (23:00 → 01:00); the review had found the same.
- QA2-2: adding homework to a course's next instance starts it now, so it shows on Now.
- QA2-3: History says which moment it shows ("Tasks as they were at 9 Oct, 16:42"), lists events up to it, has [Now] [‹] [›], and marks undone lines.
- QA2-4: the quick input grows with its text (up to eight lines, then scrolls), the assistant's stale line is gone once back at the text, the buttons do not wrap their labels.
- QA2-5: Week lays overlapping events and blocks side by side in lanes; the grid starts early enough for an early calendar event.
- QA2-6: the header's last icon is "Cancel or skip the task…" (a circled ×, not a trash can); the close sheet's own button reads "Back".
- QA2-7: a first line too long for the title is kept whole in the description.
- QA2-10: chores in Russian are nouns (Сборы, Еда, Готовка …). QA2-11: the page is "Notification log" like its link.
- QA2-14: unsent problems can be taken off in the editor (new event `task.subtask.removed`; a sent problem stays).
- QA2-19: the sheet's body scrolls under a hairline below the title. QA2-20: `/review` leads to the Inbox. QA2-21: the web walk-through is titled "Pace in the browser".

Kept as decided: the Pause icon in the task header (the agreed plan keeps pencil, pause and trash), no toast after Done (no toasts; History undoes), the preset notification thresholds (they drive the deadline reminders). Left: QA2-8, QA2-9, QA2-12/13 (decided), QA2-15 (re-check with the real model), QA2-16, QA2-17, QA2-18, the rest of QA2-20/21.

## 1. Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 1 |
| medium | 5 |
| low | 15 |

Round 1's fixes hold: of the 34 findings, 24 are really fixed, 7 partly, 3 not (phone layout QA-22, session-expired QA-28, screen-title alignment QA-33). Nothing crashes; no console errors, no failed requests, no horizontal overflow, no raw translation keys, Inter is the only font (the Telegram widget error text on /login is the only serif) on any screen in either language, size or theme (only the deliberate 401 on a bad token and the deliberate offline test show up).
The new problems are concentrated in the time-logging sheet (a past block whose end is before its start is saved as a 23-hour block that hides other activities), in the weekly-homework flow (a freshly pasted assignment can land in a hidden future instance) and in History (a label without its date).

## 2. Round-1 finding -> really fixed?

| Round-1 finding | Really fixed? | Evidence |
|---|---|---|
| QA-1 pasted message becomes the whole title | yes (one gap) | 5-line paste: title = first line, lines 2-5 in Description, link extracted, subtasks 12/14/17, "№2" not a subtask. Single 290-char line: title cut at 99 chars with "…", rows clamp. Gap: for a single long line the Description stays empty (QA2-7). `shots/f1-03-pasted.png`, `shots/f35-01-form.png` |
| QA-2 weekly-homework mapping not applied | yes | "Calculus HW: …" paste: "Добавить в: [Calculus HW 1] (selected) [Отдельная задача]", button "Добавить в Calculus HW 1", link, subtasks and original message kept. `shots/f3-01-calc-paste.png`, `shots/f3-03-calc-task.png`. New problem when the instance is a future one: QA2-2 |
| QA-3 "до 12 октября" ignored | yes | Form due = "12 окт. 23:59"; also "к 20 октября", "1 ноября", "завтра в 15:30", "в пятницу", "by Oct 14". Not understood: "31.10" gives "Без срока" silently (QA2-15). `shots/f37-0.png`..`f37-7.png` |
| QA-4 "№2" is a subtask | yes | "Домашнее задание №2 по физике … задачи 3, 5, 8" gives chips 3, 5, 8 only. `shots/f37-1.png` |
| QA-5 closed task page contradicts itself | yes | Done task: tags "Обычная · Сделано", "Осталось 0 м", no slider, footer "Закрыта · Сделано" + "Открыть снова". `shots/ru-d-light-task-done.png` |
| QA-6 Pause/Focus incoherent | partly | Focus from a paused task resumes it ("На паузе" -> "В работе", header icon back to Pause). But the header still carries a Pause icon (two bars) beside the footer "Фокус", while the owner asked for one pause control labelled Focus (QA2-12). Focus switches the main activity (ends "Пошёл в ЦСС") and the row in the time bar names the task. `shots/f5-01-paused.png`, `shots/f6-03-now-after-focus.png` |
| QA-7 task form cramped, Create out of sight | yes | Sheet with fixed footer "Назад / Создать" on 1440 and 390, body scrolls (one glitch while scrolled, QA2-19). `shots/f1-03-pasted.png`, `shots/f15-01-form-phone.png` |
| QA-8 leftovers of smart logic / jargon | partly | Gone: Expect, Limit, calibration, "Критично…" wording, the Permissions text. Left: preset editor still has "Предупредить, если до дедлайна меньше (часов)", "…и сделано меньше (0–1)", "через (дней)" and the progress-type choice (thresholds of the removed logic); the Settings link is "Журнал уведомлений" but its page is titled "Журнал решений"/"Decision log" (QA2-11). `shots/ru-d-light-preset.png` |
| QA-9 plan has holes | yes | Algebra HW 1 is no longer born closed: it sits under "В будущем" (starts 12 окт., due 14 окт.). Closing Calculus HW 1 creates "Calculus HW 2" (start 13 окт., due 19 окт.) under "In future", but only after the next sync, ~30 s later (QA2-17). Instances still carry no project (known). `shots/f2-03-future.png`, `shots/f29-01-after-reload.png` |
| QA-10 two inboxes, wrong text | yes (mostly) | One counter on Now ("Входящие, ждут: 0"), sidebar Inbox, Settings no longer duplicates it; hint says what Accept/Delete do; captured item shows "Personal · No project · No deadline · Nice-to-have", Accept moved it to Now. A decision card was not reproducible with the fake LLM. Still: Inbox title at y=14 / 22 px vs 42 / 30 px elsewhere, `/review` is an unlinked orphan route (QA2-20). `shots/f17-02-inbox.png` |
| QA-11 tags pill vs bare text | yes | Every tag (category, importance, project, preset) is a filled pill on Now, project page, task page, form. `shots/f2-03-future.png` |
| QA-12 estimate disagrees with edit sheet | yes | Sheet shows "1 ч по категории" (effective value). Minor: duplicate "1 ч" chip (QA2-14). `shots/f19-02-edit.png` |
| QA-13 web icons too big / off-centre | yes | Measured: icon-192/512, apple-touch: glyph 48-49 % of the tile, centre 49.7-49.9 %; matches `assets/icon.png` (49 %, 50.0 %). `favicon.svg` is still a different design (lime tile), low. `mont/icons.png` |
| QA-14 move-to-project rows | yes | Normal 48 px rows, colour dot, name centred, check on current. `shots/f19-01-move-project.png` |
| QA-15 log past validation | yes (one new hole) | Empty "Что": red field + "Напишите, что это было." under it; 99:99: "Введите время, например 09:30."; wrapping chips; edit sheet has "Удалить этот блок" -> "Удалить? Нажмите ещё раз" -> removed. No date field in the edit sheet. New hole: end before start (QA2-1). `shots/f9-02-empty-save.png`, `shots/f10-01-9999.png`, `shots/f12-02-delete-tap1.png` |
| QA-16 From calendar dead end on web | yes | Sheet text: "Nothing on right now in the calendar your phone sends. Events come from Pace on your Android phone…". With a phone calendar in the cloud: Attend/Skip card ("Иду / Пропустить") on Now, From calendar starts the running event under its title from its start. `shots/f7-01-from-calendar.png`, `shots/f30-01-now-cal.png` |
| QA-17 "Да, ещё" overwrote the estimate | yes | After "Да, ещё": "2 ч · из ~20 м" stays, the red ask disappears. `shots/f8-01-yes-still.png` |
| QA-18 Android-only screens on web | yes | /permissions and /onboarding: "Браузеру разрешения не нужны…", sidebar on /permissions, no dead buttons. Heading of /onboarding still "A few permissions" above "needs no permissions" (low, QA2-21). `mont/r.png` |
| QA-19 finishing is heavy | yes | Done = one tap, no sheet (task closes at once); long press opens the sheet. No toast/undo after one tap (QA2-13). `shots/f4-02-done-300ms.png`, `shots/f4-04-longpress.png` |
| QA-20 edit sheet incomplete | partly | Typed estimate ("Другое: 50, 2,5 ч") and "Октябрь 2026" fixed; subtasks can be added but existing ones show no remove control and tapping them does nothing (QA2-14). `shots/f20-01-estimate.png` |
| QA-21 clipped chip rows | yes | Rows wrap in the form, the edit sheet, Log past and the pickers. |
| QA-22 phone layout | no (partly) | (a) two running activities still take ~60 % of the phone; (b) tab bar icons only, Week/Inbox/History not in it; (c) History day-nav chips still overflow ("Сейча" cut); (d) "Переключени/й в день" still wraps mid-word; (e) Week blocks 19-35 px wide, labels "Co…"; (f) the timezone card is still a big card on Now. Left for later in round 1, unchanged. `mont/a.png`, `mont/p1.png` |
| QA-23 tap targets / text size | partly | "⋯" is 32x32 now; preset switch still 40x20, "example.com ↗" 15 px high, 8-10 text nodes per screen at 11 px, 22 at 10 px on Week. |
| QA-24 time bar jumps | yes | "Всё ещё этим занимаетесь?" always on its own line, bar height stable. Phone "Из календаря" still wraps to two lines with the icon higher. |
| QA-25 Week block dead end | yes (partly) | Block of time on a task has "Открыть задачу". The usage strip still has no legend. `mont/j.png` |
| QA-26 History wording | partly | Activity lines name the activity; "Задачи на момент". But the label has no date after it (QA2-3), "Отменить" on every row still revokes without confirmation, day-nav still long. `shots/f39-01-two-days-ago.png` |
| QA-27 offline | partly | "0 м назад" -> "только что". Still no offline indicator; parse error still says "The chips show the rule-based reading" with no chips on screen. `shots/f22-01-offline-paste.png` |
| QA-28 session/login | no | Bad token still lands on /login without a message, 401 fired 5 times, Telegram widget error in serif (black on the dark card). Login ignores the browser language (English under ru-RU). |
| QA-29 time wording on rows | yes | Future start shows "Начало 12 окт. 10:00 · Срок 14 окт. 23:59 · осталось …" with no record age; no-deadline rows show only their age (fine). |
| QA-30 devices | partly | Token sheet text fixed; Escape/backdrop still closes it silently and leaves the "My computer" row ("Nothing sent yet"). `shots/f25-02-list.png` |
| QA-31 switch visuals | yes | OFF: white knob on dark track; ON: dark knob on lime. |
| QA-32 master-detail | yes | Selected row highlighted while its detail is open. Empty right pane text stays by design. `shots/f3-03-calc-task.png` |
| QA-33 misc alignment | no | Title top: Now/Day/Week/Insights 42, Projects 28, Settings 28 (30 px), Inbox/History 14 (22 px, no back arrow on desktop), pushed screens 23 (22 px); two calendar icons on Day remain; form title field is single-line and cut. |
| QA-34 Settings duplicates | yes | "Разобрать" and the duplicate link are gone; History stays in Settings (the only path on phone). |

## 3. New findings (most severe first)

### High

**QA2-1 (high) Log past activity: an end earlier than the start is saved as a 23-hour block into the future, and it hides other activities.**
Day, 1440, light, RU (same code on phone). Steps: Day -> "Записать прошедшее" -> "Что" = "Сходил в магазин", "С" = 12:00, "До" = 11:00 -> "Сохранить". Happened: no error, no hint. The sheet code reads "an end at or before the start means the block ran past midnight", so it stored `startAt 2026-10-10T09:00Z`, `endAt 2026-10-11T08:00Z` (verified in the push body). Day then shows one block "12:00 – 18:40 · 6 ч 40 м" (clipped at now), "Учтено 6 ч 41 м" (was 3 ч), and the earlier blocks "Собираюсь" and "Пошёл в ЦСС" vanish from Day although they are still in the log and "Пошёл в ЦСС" is still running on Now (Day and Now disagree). Should: for a block logged for today, an end in the future or before the start is an error (or at least a visible "ends tomorrow 11:00 (23 h)" line before Save); overlapping a running activity should not hide it. Round 1 recorded this input as handled ("works as intended").
Shot: `shots/f10-02-end-before.png`.

### Medium

**QA2-2 (medium) A pasted assignment added to the course's next (future) instance disappears from Now.**
Now, 1440, RU. Settings -> Presets -> "Добавить примеры пресетов курсов", then paste `Algebra HW: № 5, 7, 9 — найти определители. Срок: среда 14 октября 23:59`. The form preselects "Algebra HW 1" (start Mon 12 окт. 10:00, due Wed 14 окт.) and "Добавить в Algebra HW 1" adds the three problems. Happened: the task does not appear on Now at all; it is under the collapsed "В будущем · 2" (shows "0/3 решено" only after expanding); no toast or hint. The owner's scenario is "when homework arrives I paste it and see my plan". Should: an instance that just received an assignment should surface on Now (start = now, or at least a toast "Added to Algebra HW 1, starts Mon 12 Oct" with a link), or the form should warn that the target is hidden until it starts.
Shots: `shots/f28-01-algebra-paste.png`, `shots/f28-03-future-expanded.png`.

**QA2-3 (medium) History: "Tasks as they were at" has no date; the day buttons give no feedback; events are not filtered by the day.**
History, 1440 and 390, RU/EN. Steps: History -> "На день раньше" twice. Happened: the section label reads "Задачи на момент" / "Tasks as they were at" with nothing after it (`history-screen.tsx` never renders `instant`), so there is no way to tell which day is shown; "Срок завтра 18:55" is relative to today, not to the viewed day ("осталось 2 д 23 ч" is recomputed, "завтра" is not); the "События" list shows the whole log (10 окт. events at the "2 days ago" view). Should: show the date ("Задачи на 8 окт., 18:55"), compute relative words from the viewed instant, filter or mark events by that day.
Shot: `shots/f39-01-two-days-ago.png`.

**QA2-4 (medium) Quick input: after closing the task form (Escape or Back) the multi-line text is clipped and overlaps the hint; stale "Разобрано ассистентом…" stays.**
Now, 390 and 1440, light/dark, RU. Steps: paste the 5-line message from round 1 -> the form opens -> Escape. Happened: the quick box keeps the 5 lines but shows ~2 lines; line 3 is cut mid-glyph and drawn over "Enter добавит короткую строку как есть…", a second hint "Разобрано ассистентом. Проверьте форму и создайте." (from the closed form) stays above "Разобрать / Заполнить вручную / Во входящие", and the buttons wrap to two lines ("Заполнить вручную", "Во входящие" at 560 px). Should: the box grows with its text (or scrolls inside its own frame) and does not overlap the hint; the stale AI hint is cleared when the form closes.
Shots: `shots/f16-02-phone-after-esc.png`, `shots/f16-02-desk-after-esc.png`.

**QA2-5 (medium) Week: overlapping events and activities are drawn on top of each other; the grid hides everything outside 07-23.**
Week, 1440/390, light. With the cloud calendar "Дейли (стендап)" 18:45-19:15 and "Матанализ: лекция" 19:07-20:37 (and an activity "Дейли" started from the calendar) the dashed blocks sit in the same lane and their labels overprint ("Дейли (стендап)" over "Матанализ: лекция"); at 390 px a block is 19-35 px wide ("Музыка" 19x48). Calendar events or sleep before 07:00 and after 23:00 are not reachable on the grid. Should: side-by-side lanes for overlaps, a visible day range that follows the data, labels that stay legible (or a tap target for the stack).
Shot: `shots/f30-04-week.png`, `mont/u.png`.

**QA2-6 (medium) The trash icon "Удалить задачу" does not delete: it opens "Закрыть задачу" with Отменена / Пропущена, and three "cancel" words collide.**
Task page, 1440, RU. Tap the trash icon (aria-label "Удалить задачу"). Happened: a close sheet with chips "Отменена | Пропущена", a "Причина" field, the full "when / exact time / summary" block, a "Отмена" (dismiss) button and a primary "Закрыть как «Отменена»". A task cannot be deleted from the UI at all, the icon promises it, and "Отменена" (outcome) vs "Отмена" (button) are one letter apart. Should: label/icon say what it does ("Отменить задачу" / box icon) or offer a real delete with undo; rename the dismiss button ("Назад").
Shot: `shots/f31-01-delete-task.png`.

### Low

**QA2-7 (low) A single long line: the rest of the text is not in the Description.** Paste one 290-char sentence: title is cut at 99 chars with "…", Description is empty, the full text exists only inside the collapsed "Исходное сообщение" (the multi-line case does move lines 2-5 to the description). Should: put the remainder into the description (or keep the whole sentence there). `shots/f35-01-form.png`, `shots/f35-02-task.png`.

**QA2-8 (low) Week: "where I sat" has no legend** (3 px grey strip left of the day column) and it is easy to miss next to the blocks; hover/tap shows nothing. `shots/f30-04-week.png`.

**QA2-9 (low) Day: a focus block repeats the task title** (name "ДЗ по алгебре…" plus an underlined link with the same text) and the Now row for it has no "in focus" mark in the task list. `shots/f6-02-day-after-focus.png`.

**QA2-10 (low) Chores list in Russian mixes grammar:** "Собираюсь", "Ем", "Готовлю" (verbs, 1st person) next to "Дорога", "Душ", "Уборка", "Стирка", "Посуда", "Продукты" (nouns). `shots/f8-04-dots.png`.

**QA2-11 (low) Naming: Settings link "Журнал уведомлений" opens a page titled "Журнал решений" (EN "Notification log" -> "Decision log").** `shots/ru-d-light-decisions.png`.

**QA2-12 (low) Task page header still has a Pause icon (two bars) next to the footer "Фокус" (stopwatch).** Two transport controls for one idea; owner asked for one, labelled Focus. After Focus the footer reads "В фокусе" and the header keeps Pause. `shots/f5-01-paused.png`, `shots/f6-01-focus.png`.

**QA2-13 (low) One-tap Done has no toast or undo.** The task closes at once and the page switches to the closed state; a mistap needs "Открыть снова". `shots/f4-02-done-300ms.png`.

**QA2-14 (low) Edit task sheet:** existing subtasks (290, 292, 293) show no remove control and tapping does nothing (new ones can only be added); estimate row has both "1 ч" and the selected "1 ч по категории" (two ways to pick 1 h, only one is an override); chip rows are indented 4 px differently. `shots/f20-01-estimate.png`.

**QA2-15 (low) Rules reading:** "Сдать 31.10 лабу по химии" yields "Без срока" with no sign it was not understood; "by 18:00 tomorrow … Friday seminar" picks Friday 16 Oct 18:00 over "tomorrow" without a "check" mark. (With the real model re-check.) `shots/f37-7.png`, `shots/f14-02-parsed.png`.

**QA2-16 (low) Settings: an invalid quiet-hours value ("25:99") reverts silently on blur, with no message** (the Log-past sheet has one). `shots/f32-03-bad-quiet.png`.

**QA2-17 (low) The next weekly instance appears only after the server round trip** (~30 s): closing "Calculus HW 1" shows no "Calculus HW 2" under "In future" until the next sync (the Worker derives it); offline it never appears. `shots/f29-01-after-reload.png`.

**QA2-18 (low) Accessibility:** the four time-bar buttons have role `switch` (screen readers announce a switch, not a button); no `main` landmark and no `h1` on most screens (axe: landmark-one-main, page-has-heading-one, region, 32+ hits); /insights on phone has a scrollable region without focusable content; project stats labels in dark with the pink wash have contrast 3.91 (axe color-contrast, 11 px); the quick-input textarea has `outline: none`.

**QA2-19 (low) Task form on phone, scrolled: the sheet title "Проверьте перед добавлением" overprints the "Категория" label** (content scrolls under a transparent header). `shots/f16-01-phone-form-scrolled.png`.

**QA2-20 (low) Orphans and small inconsistencies:** `/review` ("Разобрать") still exists and is not linked from anywhere; Project edit is inline while task edit is a sheet; an empty project has no "add a task" action; Inbox "Delete" has no confirmation; Inbox/History have no back arrow on desktop but do on phone; the Delete link in the block-edit sheet is a plain grey text. `shots/f27-02-edit-project.png`, `shots/f12-02-delete-tap1.png`.

**QA2-21 (low) Copy:** /onboarding heading "A few permissions" above "The browser needs no permissions"; the timezone card on Now says "Use UTC" with no explanation (what changes, for whom); subtask label "Problems / Add a problem" in English for a generic task; preset badge "Сдача по подзадачам" on a task page is jargon; History "Отменить" rows give no sign that a line was already revoked (the revoked row only loses its button). `mont/r.png`, `shots/f31-02-history-undo.png`.

## 4. Owner requests (`feedback-2.md`) not met or only partly met

Met (checked in this round): icon sized and centred like the bot; no recent-activity chips; four fixed large buttons (⋯ 32 px); Inter everywhere; checked slider draggable (drag to 7/10 worked); no why-card/score/pace/"window gone"/Waiting; tags after the project, urgency always shown, weekday gone from Due; "Original message" chevron; sidebar on Inbox, Settings, History and project pages; Focus + Done equal width; project page = task list with Open / In future / Closed, a Done task opens and can be reopened; sheets dim and slide without the light-top flash (screenshots at 30/90/150 ms); Chores/Sport pickers; right click, long press and "⋯" give "Параллельно с текущим"; a new activity ends the previous one; typed "Читал книгу, 40мин" starts at once, "из ~40 м"; "still doing this" keeps the estimate; quick input vs form are different steps, Parse is a visible button, Enter adds a short line; start time visible and editable; Attend/Skip and From calendar work with a cloud calendar; "where I sat" on Day and Week; every field editable in the task sheet.

Not met / partly met:
1. **"Remove all clever logic / everything unneeded"**: partly. The preset editor still carries the old critical/stuck thresholds ("Предупредить, если до дедлайна меньше (часов)", "…и сделано меньше (0–1)", "через (дней)") and per-preset progress type; docs/presets.md still documents them. `shots/ru-d-light-preset.png`.
2. **"One pause button, labelled Focus"**: partly: Focus is labelled, but the header still has a Pause icon (QA2-12).
3. **"Every week an instance exists so I see my plan; a pasted assignment maps to the nearest open instance"**: partly. Instances exist and the nearest one is chosen, but the nearest one can be a hidden future instance, so the task the owner just pasted is invisible (QA2-2), and the next week's instance appears only after a sync (QA2-17); instances are not linked to the project (known).
4. **"Calendar as a week in the browser, with what I actually did"**: partly. Events and activities show, but overlapping items collide and hours outside 07-23 are cut (QA2-5); the usage strip has no legend (QA2-8).
5. **"Buttons always in their place, large"**: partly on phone: "Из календаря" wraps to two lines with its icon raised; with two running activities the bar plus tabs take ~60 % of the screen (QA-22).
6. **"Edit everything"**: partly: existing subtasks cannot be removed in the edit sheet; the block-edit sheet has no date (QA2-14, QA-15d).
7. **"Quick text must not become a long title"**: met for titles, but the cut-off remainder of a single long line is not kept as a description (QA2-7).
8. **History as "the board at any date"**: the date is not shown and events are not filtered (QA2-3).

## 5. Works well

- Round 1's biggest issues are gone in practice: the form sheet with a fixed footer, the colour pills, the move-to-project sheet, the closed-task page, one-tap Done with a long-press sheet, inline validation in Log past, "Yes, still" keeping the estimate, and the web explanations for From calendar and Permissions.
- Rules reading of dates and numbers is good: "до 12 октября", "к 20 октября", "1 ноября", "завтра в 15:30", "в пятницу", "by Oct 14", "около 3 часов", "№2" not a subtask, link and problem numbers extracted.
- Weekly homework: the paste preselects the nearest open instance, keeps link, subtasks and original text; a skipped week no longer creates a closed instance; closing an instance brings the next one under "In future".
- Cloud calendar: the Attend/Skip card on Now, From calendar naming the activity after the running event and stopping the previous one at the event start, "Linux Mint: code 1 ч" under blocks on Day.
- Local-first and offline: tasks created offline sync after reconnection; no data lost; a failed parse keeps the text and offers Fill in by hand / To Inbox.
- Consistency across themes and languages: no raw keys, no overflow, every switch/pill visible in dark, sheets keep focus and close with Escape, Delete account asks for confirmation, Disconnect asks for confirmation, 404 page keeps the sidebar.
