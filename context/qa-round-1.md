# QA round 1 (exploratory, web build)

Tester: Sonnet QA agent, 2026-10-10. Build: `apps/app` web export served on :4173 against the local Worker on :8787 (`LLM_PROVIDER=fake`, `ENVIRONMENT=test`).
Accounts: 3500 (seeded with `e2e/support/seed.ts`, Russian, device timezone forced to Europe/Moscow in the flow runs, UTC in the first sweep), 3501 (fresh, English, UTC).
Viewports 1440x900 and 390x844, light and dark, Russian and English. Screenshots and scripts: `/tmp/claude-0/-home-user-pace-dev/8008f024-d8c7-5848-9a9c-e7daadedded8/scratchpad/qa/` (`shots/`, `mont/`, `*.ts`). In the findings, `shots/x.png` means that folder.

Important limits of this round:
- The LLM is the **fake** provider (it keeps the words as the title and returns almost nothing else), so findings about parsing (QA-1..QA-4) show what the UI/rules do when the assistant gives little; they need a re-check with the real model.
- Web cannot read a phone calendar or Android permissions, so A4/A5 (Attend/Skip, From calendar naming) were only observed as far as the web build goes.
- No console errors or warnings, no failed requests (other than 401 on a bad token and the deliberate offline test) on any of 21 screens x 2 sizes x 2 themes x 2 languages (sweep in `sweep.json`). No horizontal page overflow anywhere. No missing translation keys. Inter is the only font in use (1220 text nodes checked).

## 1. Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 3 |
| medium | 17 |
| low | 14 |

Nothing crashes. The weak spots are (a) the paste -> form -> weekly-homework mapping, which in this build does not do what the owner described, (b) leftovers of the removed "smart logic" in the UI and texts, (c) states that contradict each other on the task page (closed/paused/estimate), (d) bottom sheets and chip rows that clip or hide things, (e) the web PWA icons, which still have the "too big, off-centre" problem the owner reported.

## 2. Findings (most severe first)

### High

**QA-1 (high) A pasted multi-line message becomes the whole task title, newlines included.**
Now, 1440, light, RU. Click the quick-input field and paste (`page.keyboard.insertText`) a 5-line message:
`Домашнее задание №2 по «Безопасность жизнедеятельности»` / `Дедлайн: вторник 13 октября 23:59` / `Нужно ответить на вопросы 1-5 …, решить задачи 12, 14, 17.` / `Методичка: https://example.com/bzd/method.pdf` / `Время на выполнение около 2 часов`. The form opens at once (paste detection works). Title field contains the *entire* text, with the line breaks removed and no spaces (`…жизнедеятельности»Дедлайн: вторник…`). Press "Создать": the task is stored with the line breaks, and the Now row shows a 5-line title (no line clamp).
Should: the owner explicitly asked that quick-input text must not turn into a long title. Cap the title (first line / first sentence, about 80-120 chars), put the rest into the description, show a hint when the title is longer than that, never glue lines without a space, and clamp titles in lists to 2 lines.
Shots: `shots/f3-01-form-tall.png`, `shots/f3-02-created.png`. (The fake LLM returns the text as-is; the missing guard is the bug.)

**QA-2 (high) Weekly-homework mapping is not applied: "Add to" defaults to "Separate task", and a wrong project is pre-filled.**
Settings -> Presets -> "Добавить примеры пресетов курсов" (adds Algebra HW / Calculus HW / History HW; Now now shows "Calculus HW 1", "History HW 1"). On Now paste `Calculus HW: №№ 12, 14, 16 — найти пределы, сдать до 12 октября https://example.com/calc/3`. The form shows "Добавить в: [Calculus HW 1] [Отдельная задача (selected)]", category "Calculus HW" is selected, but the instance is not; Project "Алгебра" is selected (nothing in the text points to it).
Should (T2): nearest open instance of the matching course is preselected (or the one with the explicit deadline); project follows the course/instance, not a random project.
Shot: `shots/f16-01-calc.png`.

**QA-3 (high) An explicit deadline in natural Russian is ignored and a wrong one is silently set.**
Same paste as QA-2: text says "сдать до 12 октября", the form's due chip says "завтра 12:00" (Oct 11). No warning that the date was guessed. (In the 5-line paste of QA-1 "Дедлайн: вторник 13 октября 23:59" was understood, and "Friday 18:00" in English too, so "до 12 октября" is the missed pattern.) In an app that sorts only by deadline a silent wrong deadline is costly.
Should: parse "до <date>", and when nothing was found show the due as empty/"not set" or visibly mark it as a guess.
Shot: `shots/f16-01-calc.png`.

### Medium

**QA-4 (medium) "№2" in the assignment name becomes a subtask "2".**
Same paste as QA-1. The form's "Задачи" section contains one chip "2 ×" (from "Домашнее задание №2"), the created task shows "0/1 решено". The owner's own example is exactly "Домашнее задание №2 по …". The real problem numbers (1-5, 12, 14, 17) were not picked.
Shot: `shots/f3-01-form-tall.png`.

**QA-5 (medium) A closed task page contradicts itself.**
/project/<Алгебра> -> open the done task "hw Algebra 123 124" (1440 light or phone dark). Status tag says "Не начата", "Осталось 1 ч", "Затрачено 0 м", the progress slider (0/10) is shown and live; only the footer says "Закрыта · Сделано". Should: for a done task show the status "Сделано", hide or set remaining to 0, show progress 10/10 (or hide the slider).
Shots: `shots/ru-d-light-task-done.png`, `shots/ru-p-dark-task-done.png` (in `mont/ru-p-dark-a.png`).

**QA-6 (medium) Pause and Focus are not coherent, and Pause has no visible effect.**
Task page -> header "Пауза" -> tag "На паузе" -> footer "Фокус": button becomes "В фокусе" (with a stop-square icon) while the tag still says "На паузе" and the header icon is now a Play triangle (three transport icons on one screen). On Now a paused task looks exactly like any other row. Should: Focus resumes a paused task (or is disabled with a reason), paused rows are marked on Now, and the owner should be asked what Pause is for (he already complained about two pause buttons).
Shot: `shots/f12-03-focus.png`, `shots/f12-04-now-after-focus.png`.

**QA-7 (medium) The task form is cramped on Now: "Создать" is out of sight.**
Now, 1440x900 or 390x844, paste any long text. The form is rendered inside the narrow list column, above the permanent time bar, so only the top 55-60% of the form is visible; Create/Cancel are below the fold and the whole column scrolls (the form header scrolls away under the page header). On phone the visible form area is about 560 px of 844. Should: open the form as a sheet or full-height panel, or make the footer buttons sticky.
Shots: `shots/f1-06-long-enter.png`, `shots/f2-02-form-scrolled.png`, `shots/f21-08-composer-form-phone-viewport.png`.

**QA-8 (medium) Leftovers of the removed "smart logic" and limits are still visible.**
- Settings -> Presets -> any preset (e.g. Матанализ): "Уведомления": "Критично за (часов)", "Критично при прогрессе ниже (0–1)", "Зависло в работе через (дней)". Progress type "По задачам / Ползунок / Нет". These are score/pace-era options; the owner said "remove everything unnecessary".
- /permissions and /onboarding: "Напоминания, таймеры **Expect и Limit** и утренний вопрос про сон" - the owner asked to drop limits (and "Expect"/"Limit" are English in a Russian sentence).
- Settings -> "Журнал решений": "Почему напоминание отправлено или придержано и что прочитал ассистент" - an internal debug log shown as a feature.
- Submit sheet: "Точное время. Выкл. = «примерно тогда», **не учитывается в калибровке**" - there is no calibration the user knows of.
Shots: `shots/f4-01-preset.png`, `shots/ru-d-light-permissions.png`, `shots/ru-d-light-onboarding.png`, `shots/f4-02-settings-tall.png`, `shots/f20-04-submit-sheet.png`.

**QA-9 (medium) Weekly-homework plan has holes and the example presets are in English.**
After "Добавить примеры пресетов курсов" on a Russian account: preset names are "Algebra HW", "Calculus HW", "History HW" (English content on a Russian screen), instance titles "Calculus HW 1"; "Algebra HW 1" is auto-closed on creation (its Thursday deadline had passed more than 24 h ago) and immediately produces "Разобрать 1" in the Now header, so there is **no open Algebra instance** this week - the "I see my plan even without a new assignment" scenario (T1) is only partly met. Instances also get no project (the Алгебра project exists).
Shots: `shots/f14-02-now-after-presets.png`, `shots/f15-01-review.png`.

**QA-10 (medium) Two inboxes, and the inbox text is wrong.**
Now header shows "Разобрать 1" and a separate inbox icon "0"; the sidebar has "Входящие", Settings has another "Разобрать - то, что система не смогла решить сама". Two lists with near-identical purposes. On /inbox: the hint says "Всё здесь считается необязательным, пока не разобрано" but the captured item is listed as "Prioritized"; the hint "Подсказки — догадка: нажмите на поле, чтобы изменить" is false: tapping the meta line does nothing. The Inbox/Review headers are also positioned differently from other screens (title at y=27 vs 46/60, Inbox has no back arrow, Review has one).
Shots: `shots/f24-01-inbox-item.png`, `shots/f25-01-inbox-tap.png`, `shots/ru-d-light-inbox.png`, `shots/ru-d-light-review.png`.

**QA-11 (medium) Importance/category tags: some have a pill, some are bare text.**
Now rows: "Обычная" is a grey pill; "Необязательно" and "Отложенное" (and "Calculus HW" as category) render as plain coloured text with no fill, so the row looks different from its neighbours. The owner's request was that tags must be visible and not merge with the background. The "Обычная" pill itself is a very light grey on the light grey page.
Shots: `shots/f13-01-future-open.png`, `shots/f14-02-now-after-presets.png`.

**QA-12 (medium) Estimate shown on the task page disagrees with the edit sheet.**
Task "ДЗ по алгебре" (preset hw): the page shows "Оценка 1 ч" and "Осталось 40 м", but "Изменить детали" shows the estimate chip as "Без оценки" and the estimate picker has "Без оценки" selected. Saving may silently change the estimate. Should: the sheet shows the effective value (and says "from preset").
Shots: `shots/f9-01-edit.png`, `shots/f11-02-estimate.png`.

**QA-13 (medium) Web icons are still too big and off-centre, and differ from the app icon.**
`apps/app/public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`: glyph is 71% of the tile width and its centre is at x=54% (4% right of centre, 8 px at 192); `icon-512.png` is declared `"purpose": "any maskable"` with a glyph that wide, so circular masks will clip it. `assets/icon.png` is a different design (black tile, small glyph + dot, centred 50%, 49% wide); `assets/favicon.png` is a blurry 48 px lime tile. This is the first item of the owner's feedback ("icon slightly too big and not centred, do it like the Telegram bot").
Evidence: measured with PIL; `mont/icons.png`.

**QA-14 (medium) "Move to project" sheet rows look broken.**
Task page -> tap the project name in the header. Each row is a 48 px box with the project name as a tiny 11 px tag in the top-left corner and empty space below ("Без проекта" has a grey pill, the others bare text). Should look like a normal list row (name vertically centred, regular size, colour dot).
Shot: `shots/f8-03-edit-sheet.png` (this is the project sheet).

**QA-15 (medium) Log past activity / edit block: weak validation and a dead end.**
Day -> "Log past activity". (a) Save with empty "What": only a toast "Check the values and try again." appears **behind the dimmed sheet** (not visible), the field is not highlighted. (b) From = `99:99`: message under the field says "The end must be after the start." (wrong message). (c) End before start works as intended. (d) The edit sheet of a block has no Delete (only via History -> "Отменить") and no date field. (e) Category chips are clipped at the right edge ("Дела по дому", "Socia").
Shots: `shots/f23-01-empty-save.png`, `shots/f23-02-bad-time.png`, `shots/f7-01-edit-block.png`.

**QA-16 (medium) "From calendar" on the web is a dead end.**
Now -> time bar -> "From calendar": a sheet with "Nothing on in your calendar right now." The web has no calendar access, so this message is false/misleading; there is no explanation, no link to connect or to the phone, no way to start a plain activity. Same for "Разрешения" -> "Открыть настройки" (see QA-18). Also the web has no place that says whether the phone's calendar sync is on (W1).
Shot: `shots/f5d-10-from-calendar.png`.

**QA-17 (medium) "Да, ещё" overwrites the original estimate.**
Now -> activity "Пошёл в ЦСС … из ~20 м" past 2x -> "Всё ещё этим занимаетесь?" -> "Да, ещё". The activity's estimate becomes the elapsed time ("из ~2 ч 10 м" - bar full) and stays so forever (Day later shows "из ~2 ч"). The 20-minute estimate is lost, so overrun statistics are wrong. Should extend the next reminder instead of replacing the estimate (or keep both).
Shots: `shots/f6-04-log-past.png` (Day shows "из ~2 ч" behind the sheet).

**QA-18 (medium) Android-only screens are reachable and unconstrained on the web.**
/permissions: "Выключено в настройках Android", four "Открыть настройки" buttons that cannot work on the web. /onboarding ("Несколько разрешений"): full-width 1440 px layout without the sidebar or the 560 px column, Android wording. The sweep treats both as normal screens.
Shots: `shots/ru-d-light-permissions.png`, `shots/ru-d-light-onboarding.png`.

**QA-19 (medium) Finishing a task is a heavy sheet.**
Task page -> "Сдать 290 и 292" (or "Готово"): a sheet with 4 time chips + date button, a "Точное время" switch with the jargon from QA-8, a summary table (Итог / Ещё открыты / Записано "17:04 · произошло 17:04") and a text link "Закрыть как… Отменена · Пропущена". For "I just did it" this needs one tap, not a form.
Shot: `shots/f20-04-submit-sheet.png`.

**QA-20 (medium) The edit sheet is incomplete.**
"Изменить детали" edits title, category, importance, project, start, due (with "Убрать"), estimate, description, link - good - but it cannot add/remove subtasks (the creation form can), and the estimate picker has only 15 m … 4 h (no custom value, e.g. 50 m or 2.5 h). The due picker header reads "Октябрь 2026 Г." (capital Г.).
Shots: `shots/f9-01-edit.png`, `shots/f10-01-due-picker.png`, `shots/f11-02-estimate.png`.

### Low

**QA-21 (low) Horizontally clipped chip rows with no affordance.** Category chips in the task form after adding presets ("Algebr…"), in Log past/edit sheet ("Дела по дому" cut, "Socia"), "Nice-to-have" on phone, Importance row. No scroll hint, no wrapping. `shots/f16-01-calc.png`, `shots/f23-01-empty-save.png`, `shots/f21-07-composer-form-phone.png`.

**QA-22 (low) Phone layout.** (a) With two running activities the time bar + tab bar take ~60% of the screen; 2 task rows are visible (`shots/ru-p-dark-now.png`). (b) Tab bar has icons only, no labels; Week and Inbox/History are not in it (Week only via the small calendar icon on Day). (c) History: day-nav chips overflow ("Сейча…" cut) (`mont/ru-p-light-b.png`). (d) Insights tile wraps mid-word "Переключени/й в день". (e) Week blocks are 19-35 px wide, labels "Со…", "Алг…" - unreadable, tap targets tiny (`mont/ru-p-light-a.png`). (f) The UTC banner ("Устройство в поясе UTC; аккаунт использует Europe/Moscow" + big button) is a huge card on every Now load for a device in another zone.

**QA-23 (low) Tap targets and text size.** The "⋯" on the four time buttons is 24x24 px (owner: buttons large so as not to miss); 92 text nodes are 11 px and 22 are 10 px (task meta, field labels, running-activity labels, week/hour labels); preset toggles are 40x20; "example.com ↗" link is 15 px high.

**QA-24 (low) Time bar jumps.** The "Всё ещё этим занимаетесь?" text sits inline at "2 ч" but wraps below at "2 ч 7 м", moving the bar and the text field by 14-24 px as digits change (compare `shots/ru-d-light-now.png` and `shots/f1-04-after-enter.png`). On phone "From calendar" wraps to two lines and its icon sits higher than the other three buttons.

**QA-25 (low) Week: block sheet is a dead end, usage strip unexplained.** Tapping a block opens a sheet with title, time, "Задача · 45 м" - no open-task, edit or delete action. "Where I sat" is a 3 px grey strip with no legend; the detail only appears in the sheet / Day. `shots/f7-02-week-tap.png`, `shots/f18-04-week-block.png`.

**QA-26 (low) History wording.** Most entries read just "Активность начата" / "Активность переименована" without which activity; the section "Доска на момент" is cryptic; "Отменить" on every line without confirm (revokes an event); day nav labels "На день раньше / На день позже / Сейчас" are long. `shots/ru-d-light-history.png`.

**QA-27 (low) Offline state.** Local-first works (task, activity saved, survives reload) but there is no global offline/"not synced" indicator. The parse error "The assistant could not be reached. The chips show the rule-based reading." mentions chips that are not on screen and is not aligned with the hint above it. "0m old" / "0 м назад" for a task created a second ago. `shots/f22-03-offline-parse.png`.

**QA-28 (low) Session/login.** An invalid stored token sends the user to /login with no "session expired" message and fires the failing request 5 times (401 x5). On the login card the Telegram widget error "Bot domain invalid" is rendered in a serif font and is black on the dark card (invisible in dark). `shots/f19-badtoken.png`, `mont/login.png`.

**QA-29 (low) Time wording on rows.** A task that starts in the future shows "Начало 15 окт. 16:49 · 4 д назад" (the age of the record next to a future start, contradictory); no-deadline rows show only an age. `shots/f13-01-future-open.png`.

**QA-30 (low) Devices.** The token sheet says "shows up in the list after its first upload" while the computer is already in the list behind the sheet ("Nothing sent yet"); closing the sheet with Escape/backdrop loses the token without warning and leaves an orphan "My computer"; the default name "My computer" is accepted silently. "Disconnect" does ask for confirmation (good). The page text "What sends Pace the apps you have in front" is ungrammatical. `shots/f17-04-token.png`, `shots/f17-06-device-list.png`.

**QA-31 (low) Switch visuals.** An OFF switch has a dark filled knob on a light track (looks "on"); the ON state is a teal knob on a lime track (low contrast, odd colour pair). Seen in Presets ("Показать удалённые"), preset editor ("Своё"), sheets ("Alongside what is running"). `shots/ru-d-light-presets.png`, `shots/f5d-02-chores-sheet.png`.

**QA-32 (low) Master-detail on desktop.** Selected row on Now is not highlighted while its detail is open on the right; the empty right pane ("Выберите задачу…") stays as a large blank area on /add and Now. `shots/f1-02-click-row.png`.

**QA-33 (low) Misc alignment/wording.** Screen titles sit at different heights (Now/Day/Week with an eyebrow at y=60, Projects/Settings y=46, Inbox/History y=27); Day has two near-identical calendar icons ("Неделя" and "Выбрать день"); Settings has a section header "УСТРОЙСТВА" above a full-width button "Устройства"; the form header text "Разобрано ассистентом…" is inset 4 px from the field labels; the form title field is single-line and cuts a long title without ellipsis; the link stays in the title and in the Link field; the 3-step composer "Fill in by hand" / "Во входящие" wrap to two lines at 560 px.

**QA-34 (low) Settings.** "Ещё" links "Разобрать" and "История" duplicate sidebar entries under other names; no setting or status for calendar sync to the cloud on the web (W1).

## 3. Owner requests from feedback-2.md not met or only partly met

Met (checked): Inter everywhere (all 1220 text nodes, Russian included); no recent-activity chips; four large buttons in fixed places; the "+" in the time bar is gone; progress is a draggable slider (drag, click on track, arrow keys all work); why-card, "How Now is ordered", "window gone", "behind pace", weekday in Due, Waiting - gone; tags are after the project, urgency tag always shown; project in the task header is a coloured text with chevron, aligned; "Original message" has a normal chevron; sidebar stays on Inbox, Settings, History, /project/<id> (also on direct load); footer is Focus + Done of equal width; project page lists open then "Закрытые" with the same rows, done task opens; edit sheet covers start, due (clearable), estimate; sheets dim/animate consistently (no flash seen at 40/160 ms); Rest 30 m, Sport 30m/1h/2h/3h picker, Chores picker with many items, parallel via right-click/long press/"⋯", new activity stops the previous one, "Пошел в ЦСС, 20мин" starts at once and is named "Пошёл в ЦСС" with ~20 m, "still doing this?" after 2x, "Quick input" has a visible "Parse/Разобрать" button and pasted text opens a form, future start goes under "In future", Devices flow with token, command, copy button, upload, "where I sat" on Day/Week.

Not met / partly met:
1. **Pasted text must not become a long title** - not met: QA-1 (and with the 5-line example the title is the whole message).
2. **Homework maps to the nearest unfinished instance / explicit deadline, subtasks, description, link** - partly: link and subtasks work, instance is not preselected, explicit "до 12 октября" missed, "№2" read as a subtask, description empty, project guessed wrong: QA-2, QA-3, QA-4 (re-check with real LLM).
3. **Every week an instance exists so the plan is visible** - partly: QA-9 (no Algebra instance this week, English example presets).
4. **"Remove all clever logic / everything unneeded from the code"** - partly: QA-8 (preset notify fields, decisions log, calibration, Expect/Limit text), QA-6 (Pause).
5. **App icon not too big, centred, like the Telegram bot** - not met on web/PWA: QA-13.
6. **Tags must be visible** - partly: QA-11.
7. **"Why can't I return to a Done task in a project" / consistent lists** - met in the list, but the done task page itself is inconsistent: QA-5.
8. **Edit everything incl. start time, due, estimate** - partly: QA-12, QA-20 (no subtasks, no custom estimate).
9. **Time tracker details**: "From calendar" naming (A5) and Attend/Skip (A4) cannot work on web and the web explains nothing: QA-16; "still doing this?" replaces the estimate: QA-17; buttons "large so as not to miss" - the "⋯" is 24 px: QA-23.
10. **Calendar synced to the cloud and shown as a week in the browser (W1)** - not visible on web: no calendar events in Week without a phone, no sync status or toggle anywhere on the web (QA-16, QA-34).
11. **App time from all devices "where I sat" in activities** - works on Day and in the Week sheet, but Week shows only a 3 px strip without legend: QA-25.

## 4. Works well

- Local-first behaviour: offline task/activity creation, reload keeps them, clear parse-offline message.
- Desktop master-detail on Now, sidebar persistence on every screen, 404 page, theme and language switching (RU/EN complete, no raw keys).
- Focus handling in sheets: Escape closes, focus moves into the sheet and returns to the trigger; Disconnect asks for confirmation; Day shows "Linux Mint: code 1h, firefox 21m" under the block after a device upload.
- Overdue reopened task is sorted first with a red "опоздание 2 д"; sort by deadline, no-deadline tasks after, future starts folded under "В будущем".
- Preview/validation of the end-before-start time in Log past; the due picker (calendar + time + "Убрать") is clear.
