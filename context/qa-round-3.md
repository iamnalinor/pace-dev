# QA round 3 (exploratory, web build)

Tester: Sonnet QA agent, 2026-10-10. Build: `apps/app` web export (fresh `build:web`) on :4173 against the local Worker on :8787 (`LLM_PROVIDER=fake`, `ENVIRONMENT=test`), HEAD `1421716` (QA round 2 fixes).
Accounts: 3600/3602 (`seedLivedIn`, Russian, device timezone Europe/Moscow), 3601/3603/3604 (fresh, English; 3604 with two overdue tasks and a capture for the Inbox). A phone calendar (10 events: overlapping, 05:30, 23:00, tomorrow, very long title) and a computer's app usage were pushed through `/api/calendar/sync` and `/api/usage/sessions`.
Coverage: sweep of 21 screens x 1440x900 / 390x844 x light/dark x RU/EN (148 screenshots, DOM text, overflow, console and network logs, raw keys); axe on 16 routes x 2 sizes x 2 themes; every item of the round-3 brief (task form sheet, quick input after Back/Escape, Week lanes and early events, History label/[Now][‹][›]/undone mark, problem removal, header "Cancel or skip…" and the close sheet, one-tap Done and long press, homework to the next instance, Day sheet 12:00→11:00 and 23:00→01:00, Inbox decisions above captures); offline; keyboard (Tab, Escape); language switch; project create.
Screenshots and scripts: `/tmp/claude-0/-home-user-pace-dev/8008f024-d8c7-5848-9a9c-e7daadedded8/scratchpad/qa3/` (`shots/`, `mont/`, `*.ts`); in the findings `shots/x.png` means that folder.
Limits: the LLM is the fake provider (it answers only short texts; a 14-line paste gets "unavailable"); Attend/Skip was driven through the cloud calendar endpoint. Local-first store: scripts waited for the 30 s sync before reading the server.


## 0. What was done with it

- QA3-1: a block is the past: the Day sheet says "That is still ahead" under a start or end after now, and logging or moving a block into the future is refused by the actions too (`retro/future`).
- QA3-2: screen headers wrap their actions under the title on a narrow screen (Day's nav fits at 390 px).
- QA3-3: History counts "today/tomorrow" from the moment it shows; an empty moment says so.
- QA3-4: the close sheet previews plain "Done" for a task without a deadline.
- QA3-5: the row's check is a 44 px target on the web too.
- QA3-6: New task and the "+" open Now with the cursor in the composer.
- QA3-7: Week on a phone keeps days 72 px wide and scrolls sideways to today with the hours fixed, opens at the current hour, and draws a "now" line.

Left (low): QA3-8..QA3-18 and the open round-2 items, listed above.

## 1. Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 1 |
| medium | 6 |
| low | 11 |

Round 2's fixes mostly hold: of the 14 re-checked, 11 are really fixed, 3 partly (QA2-1 Day sheet, QA2-3 History, QA2-5 Week on a phone). Nothing crashes; no console errors or failed requests on any of the 148 sweep pages (only the deliberate offline test), no horizontal page overflow, no raw translation keys, no Latin text in the Russian UI apart from user data, `/review` leads to the Inbox.
The new problems: the Log-past/edit-block sheet still accepts an end in the future (a block that keeps "growing", cuts the running activity on Day and Week, and is invisible when it is tomorrow), the Day header on a phone pushes the "next day" button off screen, History's relative words are computed from today, and a few small contradictions ("Done · before deadline" with no deadline, a 22 px one-tap Done with no undo, "New task" that does nothing).

## 2. Round-2 fix -> really fixed?

| Round-2 fix | Really fixed? | Evidence |
|---|---|---|
| QA2-1 Day sheet end <= start | partly | 12:00→11:00 and 12:00→12:00 show "Конец должен быть позже начала." and do not save; 23:00→01:00 saves and Day splits it at midnight (9 Oct 23:00–00:00, 10 Oct 00:00–01:00). Hole: an end in the future for today (19:00→23:00 at 19:49) saves silently, and 23:00→01:00 on today saves a block in the future that is shown nowhere (QA3-1). Edit sheet has the same hole. `shots/c2-3-future.png`, `shots/c3-4-night.png`, `shots/g1-prev-day-night.png` |
| QA2-2 homework to the next instance starts it now | yes | Presets → "Добавить примеры пресетов курсов", paste "Algebra HW: № 5, 7, 9 — найти определители. Срок: среда 14 октября 23:59" → "Добавить в Algebra HW 1" → the task is on Now at once ("Срок 14 окт. 23:59 · осталось 4 д 4 ч · 0/3 решено") and not under "В будущем"; log has "Задача изменена", "Задачи добавлены", "Источник прикреплён". `shots/d2-form.png`, `shots/d3-history.png` |
| QA2-3 History date, up to the moment, [Now][‹][›], undone mark | partly | "Задачи на момент 9 окт., 19:53", "События до 9 окт., 19:53" (events after it gone), [Сейчас][‹][›] 44 px and fit on 390 px, undo turns the button into "Отменено" and adds "Исправление: отозвано". Not done: relative words still come from today: at the 9 Oct view "Срок завтра 19:48 · осталось 1 д 23 ч", at 8 Oct "завтра … осталось 2 д 23 ч" (QA3-3). `shots/h2-1.png`, `shots/d3-history-undone.png` |
| QA2-4 quick input grows, stale line, buttons | yes | 5-line paste → Escape: box shows all 5 lines, hint below it, no "Разобрано ассистентом", buttons on one line at 1440, stacked full width at 390; 14 lines: box stops at 212 px and scrolls inside. `shots/a1-d-after-esc.png`, `shots/a1-p-after-esc.png`, `shots/q1-d-reparse.png` |
| QA2-5 Week lanes, early events | partly | Overlaps sit side by side; the grid starts at 00 when an event is at 00:55 (05:30 run visible). At 1440 the lanes are 21–35 px wide, on 390 px 8–10 px with one-letter labels, and the week opens at 00:00 so "now" is a 600 px scroll away (QA3-7). `shots/w2-d-end.png`, `shots/w2-p-end.png` |
| QA2-6 header icon "Cancel or skip…", "Back" | yes | Circled ×, aria-label "Отменить или пропустить задачу…", sheet buttons "Назад" / "Закрыть как «Отменена»", Escape and Back close it. `shots/t2-p-close-sheet.png` |
| QA2-7 long first line kept in the description | yes | 275-char single sentence: title 98 chars with "…", Description = the whole 275 chars. |
| QA2-10 chores are nouns | yes | Сборы, Еда, Готовка, Дорога, Душ, Уборка, Стирка, Посуда, Продукты, Дела вне дома, Дневной сон. |
| QA2-11 "Notification log" everywhere | yes | Settings link and page title read "Журнал уведомлений" / "Notification log" (the search box still says "Поиск по решениям", QA3-14). |
| QA2-14 unsent problems removable | yes | Edit sheet: "Убрать 290/292/293" (66x32 chips); after "Сдать 290" the sent 290 has no remove control, the others keep it; History logs "Problem removed". No hint why the sent one has none (QA3-16). `shots/t3-d-edit.png`, `shots/t4-edit2.png` |
| QA2-19 sheet body scrolls under a hairline | yes | 390 and 1440: title stays, labels scroll under the hairline, no overprint, footer fixed. `shots/b1-p-scrolled.png`, `shots/b1-d-scrolled.png` |
| QA2-20 `/review` leads to the Inbox | yes | `/review` → `/inbox` on all 8 combinations. |
| QA2-21 "Pace in the browser" | yes | /onboarding heading "Pace в браузере" / "Pace in the browser". |
| One Inbox, decisions above captures (brief) | yes | "TO SORT" cards first, then the capture with Accept/Delete; Now badge counts both. `shots/i1-inbox.png`, `shots/i2-phone-after.png` |

## 3. New findings (most severe first)

### High

**QA3-1 (high) Log past / edit block accepts an end in the future; the block "grows", cuts the running activity, and a future block is invisible.**
Day, 1440, light, RU (same sheet on 390). Steps (at 19:49): Day → "Записать прошедшее" → Что "Сходил в магазин", С 19:00, До 23:00 → Сохранить. Happened: saved without a word; the log has `startAt 16:00Z`, `endAt 20:00Z` (23:00 local, `occurredAt` in the future). Day shows "19:00 – 19:49 Сходил в магазин 50 м" and the end keeps growing with the clock (20:06 an hour later); the running activity "Пошёл в ЦСС" is cut to "17:48 – 19:00 · 1 ч 12 м" on Day and Week while Now still shows it running ("2 ч 2 м") — Day and Now disagree, the same symptom as QA2-1. History (viewing "now") lists "Активность записана · Сходил в магазин 10 окт., 23:00" above events that happened earlier, i.e. future events inside "events up to the moment". The same with 23:00→01:00 entered for today: accepted, closes the sheet, nothing appears anywhere on Day (the block is tomorrow night and "next day" is disabled); the event sits in the log dated 11 окт., 01:00. Editing an old block ("Собираюсь", До 23:30) is accepted the same way. Should: for a block of today an end after "now" is an error ("Конец не может быть в будущем") or the block runs until now only as a running activity; 23:00→01:00 for today should mean last night (yesterday 23:00 → today 01:00) or be refused; a closed block must not shorten an activity that is still running.
Shots: `shots/c2-3-future.png`, `shots/c3-0-day-after-future.png`, `shots/c3-4-night.png`, `shots/w2-d-end.png` (Week, "По…/Сх…" lanes).

### Medium

**QA3-2 (medium) Phone: the Day header pushes the "next day" button off the screen.**
Day, 390, light and dark, RU and EN. The row [Week][Today][‹][pick a day][›] is 409–418 px wide on a 390 px screen: "Следующий день" is at x 365–418 (only ~25 px visible, no horizontal scroll), "Pick a day" touches the edge. From a past day the only way forward is "Сегодня". Should: shrink the chips (icon-only Week/Today or wrap to a second row).
Shots: `shots/e2-day-prev.png`, `shots/e1-en-US-day.png`.

**QA3-3 (medium) History: relative words still computed from today.**
History, 1440, RU. Steps: "На день раньше" once or twice. Happened: label "Задачи на момент 9 окт., 19:53" but the row says "Срок завтра 19:48 · осталось 1 д 23 ч"; at 8 окт.: "Срок завтра … осталось 2 д 23 ч" — "tomorrow" next to "2 days 23 h left" contradicts itself (the due date is 11 Oct). "осталось" and the age ("3 д назад") are recomputed, the word "завтра" is not. A day with nothing (4 окт.) shows two bare labels and no "Ничего не было".
Shots: `shots/h2-1.png`, `shots/h2-6.png`.

**QA3-4 (medium) Close sheet says "Done · before deadline" for a task with no deadline.**
Task page, 1440, EN (RU same: "К сроку"). Steps: quick-add "Call mom" → open → long press Done. Happened: the page says "Due: No deadline", the sheet's Outcome reads "Done · before deadline" and the "when" chips offer "К сроку / before deadline". Should: just "Done" when there is no due date; hide the deadline chip.
Shot: `shots/f1-4-longpress.png`.

**QA3-5 (medium) One-tap Done from a Now row is a 22x22 px target with no undo.**
Now, 390, EN. The circle ("Mark Call mom done") is 22x22; a tap closes the task at once (decided: no toast), the list drops it, and the only way back is History → Undo or the closed task page → "Open again". With the target far below 44 px a mis-tap while scrolling is likely. Should: a 44 px hit area (hitSlop) at least; consider a short "Done · Undo" line (owner decided no toast, so at least the target).
Shot: `shots/u1-after-circle.png`.

**QA3-6 (medium) "New task" (sidebar) and "+" (phone tab) open nothing.**
Any screen, 1440 and 390. The button navigates to `/add`, which is Now with the quick input; nothing is focused (active element stays the button), so on Now itself it does nothing visible and from other screens it only switches to Now. The owner's flow "tap +, type" needs a second tap on the field. Should: focus the quick input (and scroll it into view) or open the task form.
Shots: `shots/p2-d.png`, `shots/p3-plus.png`.

**QA3-7 (medium) Week: unreadable on a phone and opens at midnight.**
Week, 390/1440. (a) With 4–5 overlapping items on one day the lanes are 8–10 px wide on 390 px (labels "П", "С", "М", "К…"), 21 px at 1440; tapping works (aria-labels) but nothing can be read or hit reliably. (b) After any early item (00:55 event) the grid starts at 00 and opens at the top, so today's activity (16:00–23:00) is ~600–800 px below the fold; there is no "now" line. Should: scroll to the current hour on open, a "now" line, cap lanes (+N) or give the stack a list on tap.
Shots: `shots/w1-d.png`, `shots/w2-p-end.png`.

### Low

**QA3-8 (low) Task form: the date/time picker opens below the fold; Escape closes the whole form.** 390, RU. Tap "Начало сейчас": the calendar appears under the chips, cut by the fixed footer ("Время / Готово" are out of sight); the body does not scroll to it. Escape with a picker open closes the whole sheet (edits lost) instead of the picker. `shots/r1-p-start.png`.

**QA3-9 (low) Inbox decisions: wording and a loop.** 390, EN. "Closed automatically — confirm?" does not say closed as what; "since Oct 9, 20:01" is the due time without saying so; "Reopen" on an overdue task immediately turns the card into a second one, "The deadline passed. What happened?" with buttons "Mark done / Cancel task / Skipped / Keep open" (verb, verb, participle). Overdue tasks leave Now for the Inbox until answered. `shots/i2-phone-after.png`.

**QA3-10 (low) History lines are vague.** "Исправление: отозвано" does not name what was revoked; the three "Пресет создан" lines have no preset name (other lines have the task name); on a fresh account the only event is "Settings changed — Undo" (undoing the initial timezone). EN fresh History with no tasks shows the label and nothing under it.

**QA3-11 (low) The page/tab title is "Pace" on every route** (Now, Day, Week, Settings, a task…); browser history and tabs cannot be told apart.

**QA3-12 (low) Parse "unavailable" is reported as a rate limit.** A paste the assistant cannot answer (status `unavailable`, `retryAt: null`) shows "The assistant is out of requests for now. The chips show the rule-based reading; To Inbox keeps the line for later." There are no chips on screen (QA-27 still open) and nothing says it is not a quota. `shots/q1-d-reparse.png`.

**QA3-13 (low) Task form captions.** The date chips have no caption ("13 окт. 23:59" with a calendar icon is the due date, "Начало сейчас" the start); "Категория" mixes "Домашка" with the course presets "Algebra HW / Calculus HW / History HW" that extend it. `shots/b1-p-scrolled.png`, `shots/r1-p-start.png`.

**QA3-14 (low) Leftovers of the removed logic (owner request still partly open).** The preset editor still has "Предупредить, если до дедлайна меньше (часов)", "…и сделано меньше (0–1)", "Напомнить о начатой задаче без движения через (дней)", "Прогресс: По задачам/Ползунок/Нет"; the notification-log page keeps "Поиск по решениям" / "Решений пока нет". `shots/ru-d-dark-preset.png`.

**QA3-15 (low) Task page: "отправлено сб" for a problem sent today** (weekday abbreviation instead of "сегодня"); after sending the only solved problem the footer keeps just a full-width "Фокус" with no way to finish except solving the rest or the × icon. `shots/t4-after-submit.png`.

**QA3-16 (low) Edit sheet: problem remove chips are 66x32 and the sent one has no explanation** (no lock/hint why "290" cannot be removed). `shots/t4-edit2.png`.

**QA3-17 (low) Close sheet jargon:** "Выкл. = «примерно тогда»", "Записано 19:55 · произошло 19:55" (recorded/happened, event-log words) for a user who just cancelled a task; the link "Close task as… Cancelled · Skipped" is plain grey text with no button look. `shots/f1-4-longpress.png`.

**QA3-18 (low) Still open from round 2 (not re-reported in detail):** phone Now with a calendar prompt + two running activities leaves ~2 task rows (`shots/n1-p-now.png`); "Из календаря" wraps to two lines; "из ~20 м" wraps under the running label; screen titles at different heights (Inbox/History 27 px, Projects 46, others 60) and Inbox/History without a back arrow on desktop; empty project has no "add a task"; Insights "Переключени/й в день" wraps; axe: landmark-one-main, page-has-heading-one, region (all routes), scrollable-region-focusable on /insights at 390, color-contrast on the project page in dark; offline: no indicator.

## 4. What works well

- The task form sheet is now solid: fixed footer (Назад / Создать), body scrolls under a hairline, Tab stays inside, "Добавить в Algebra HW 1" is clear, Back returns to the quick input with the text intact and without the stale assistant line.
- Pasted homework to a future instance now lands on Now with its problems and the log shows exactly what changed.
- History is readable: a dated label, events limited to the moment, an honest "Отменено" mark, a [Сейчас][‹][›] row that fits a phone.
- The Day sheet's night rule and the midnight split of a 23:00→01:00 block across two days work well.
- One-tap Done, long-press sheet, "Cancel or skip…" icon and the "Назад" button read well; offline use of Enter/Rest keeps working and syncs back silently.
- 148 pages, two languages, two themes, two sizes: no console errors, no overflow, no raw keys, Inter everywhere.
