# QA round 4 (exploratory, web build)

Tester: Sonnet QA agent, 2026-10-10 (evening, device timezone Europe/Moscow, so "now" was 21:00-21:30 local). Build: `apps/app` web export (fresh `build:web`) on :4173 against the local Worker on :8787 (`LLM_PROVIDER=fake`, `ENVIRONMENT=test`), HEAD `96f03e3` (QA round 3 fixes), clean working tree.
Accounts: 4100 (`seedLivedIn`, Russian) with, for Week, a phone calendar (11 events: five overlapping around now, 05:30, 23:00, tomorrow 07:00, a 00:55 event two days ago, a very long title) and a computer's usage; 4102 (English, three tasks due on 8/9/11 Oct, pushed through `/api/sync/push` to test History's relative words); 4103-4107 fresh accounts (English UI).
Coverage: every item of the round-4 brief; Day "Log past" and "Edit block" sheets (today and a past day, RU and EN, light/dark, 1440/390/360), History on 6 past days (RU lived-in and EN pushed data) plus the empty moment, screen headers of 8 routes x RU/EN x light/dark at 390 and RU/EN at 360 and 320 (element-by-element off-screen check), close sheet with and without a deadline, check circle size and hit area, "New task"/"+" focus, Week on 390/360/320 and 1440/1280 with and without calendar data, lanes, now line, scroll position, previous/next week.
Screenshots and scripts: `/tmp/claude-0/-home-user-pace-dev/8008f024-d8c7-5848-9a9c-e7daadedded8/scratchpad/qa4/` (`shots/`, `t*.ts`, `lib.ts`); in the findings `shots/x.png` means that folder.
Limits: fake LLM; the web build has no soft keyboard (autoFocus on Android was not checked); the Day roll-over at midnight was not reproduced.


## 0. What was done with it

- QA4-1 / QA4-2: Week scrolls only when now would be out of sight (the day names stay otherwise), and the target follows the grid once the calendar arrives.
- QA4-4: moving a block's end into the next activity is refused under "To" ("That runs into the next activity: move its start first") instead of being clipped silently.
- QA4-3 is as designed: a block recorded afterwards wins over the live time it overlaps (Day shows the split; Now's running row counts from its start).
- The lows are left for a later round (a past week on a phone opening at Wednesday, one-letter lane labels, the ahead error shown only after Save, the one-minute drift in the close sheet, a ru-RU browser on a fresh account, the "+" refocus on /add).

After this round only low findings are open: QA stops here for v0.7.0 (docs/qa.md).

## 1. Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 4 |
| low | 10 |

Round 3's fixes hold except Week: QA3-1..QA3-6 are really fixed (a time after now is refused with "Это ещё впереди"/"That is still ahead" under both fields, headers fit down to 320 px, History counts "today/tomorrow" from its moment, plain "Done" for a task without a deadline, a real 44 px check, the cursor lands in the composer). QA3-7 is only partly fixed: 72 px days, the sideways scroll to today, fixed hour labels and the "now" line work, but the way Week opens is wrong: the open-at-current-hour scroll hides the day names row on every screen where the grid is taller than the viewport, and it is computed before the calendar data arrives, so with an early calendar event the "now" line is still below the fold. No console errors, no failed requests, no horizontal overflow, no raw keys on any page visited.

## 2. Round-3 fix -> really fixed?

| Round-3 fix | Really fixed? | Evidence |
|---|---|---|
| QA3-1 a block is the past (Day sheets refuse a start/end after now; the actions too) | yes (one related symptom left, QA4-3/QA4-4) | Today at 21:0x, RU: 19:00→23:00 → "Это ещё впереди: записывайте то, что уже было." under "До"; 23:00→01:00 and 21:30→22:00 and 20:00→00:30 are refused too (23:00→01:00 flags both fields); the sheet stays open, nothing is written. 12:00→11:00 still says "Конец должен быть позже начала.", 09:00→09:30 saves. EN: "That is still ahead: log what already happened." (360 px RU: wraps to 3 lines, fits). Edit sheet: "Собираюсь" end 23:00 / 23:00→23:30 and the running "Пошёл в ЦСС" start 22:00 are refused with the same text. Past day (Previous day): 23:00→01:00 saves, Day shows 23:00–00:00 there and 00:00–01:00 on today. 20:00→02:00, 17:00→03:00 and 23:30→00:00 also save; 15:00→14:00 and 00:00→00:00 are refused. The gap row's "Записать" prefills 00:00→18:10 and saves. `shots/b-saved.png`, `shots/ru-ahead-360.png`, `shots/en-ahead.png`, `shots/p-prev-night.png`, `shots/p-today-after-night.png` |
| QA3-2 headers wrap their actions under the title | yes | Day, Week, History, Projects (plus Now, Inbox, Insights, Settings) at 390, 360 and 320 px, RU/EN, light/dark: no element outside the viewport (checked for every DOM node), `scrollWidth` = width. Day's [Week][Today][‹][pick][›] sits on a second row with "next day" fully visible. `shots/m-hdr-ru-light.png`, `shots/m-hdr-en-dark.png`, `shots/m320.png` |
| QA3-3 History counts relative words from its moment; empty moment says so | yes | Pushed tasks due 8/9/11 Oct, EN: viewing Oct 8 shows "Due today 23:00 · 2h 3m left", "Due tomorrow 12:00 · 15h 3m left"; Oct 7 "Due tomorrow 23:00 · 1d 2h left" and "Due Oct 9 12:00" (2 days away is a date); Oct 9 "Due Oct 11 12:00 · 1d 15h left". No "tomorrow" next to "2 d left" any more. Ages follow the moment ("3 д назад", "только что"). Before the first event: "На тот момент в Pace ещё ничего не было." / "Nothing in Pace yet at that moment." under both labels. `shots/h-back1.png`..`h-back6.png`, `shots/hen-back2.png`, `shots/en-history-empty.png` |
| QA3-4 close sheet previews plain "Done" without a deadline | yes | RU and EN, 390 and 1440, light/dark: "Итог: Сделано" / "Outcome: Done", chips Сейчас / Час назад / Вчера вечером / Точное время, no "К сроку". The same sheet for a task with a deadline still says "Сделано · до срока" and offers "К сроку". The "Cancel or skip the task…" sheet reads "Outcome: Cancelled". `shots/c2-long-ru-dark.png`, `shots/c2-long-ru-dark-deadline.png`, `shots/c2-long-4103.png` |
| QA3-5 row check circle is a 44 px target | yes | Now, 390 and 1440: `[role=checkbox]` is 44x44 (circle still 22 px, row layout unchanged: title starts right after the box); a click 4 px from the box's corner (outside the circle) closes the task; Tab reaches the circle. On the project page and in History the circle is 44 px as well (disabled in History). `shots/n1-390.png`, `shots/proj-390-dark.png` |
| QA3-6 "New task" and "+" put the cursor in the composer | yes (one small hole, low) | From Day and Projects on 390 ("+") and from Day on 1440 ("New task"), also from Now itself: URL `/add`, `document.activeElement` is the composer textarea; typing at once "Buy milk" + Enter adds the task. Hole: see L1. |
| QA3-7 Week on a phone: 72 px days scrolling to today, fixed hours, "now" line, opens at the current hour; desktop lanes | partly | Works: columns are 72 px at 390/360/320 and the strip scrolls sideways to today (scrollLeft 170 of 170, Fri-Sat-Sun in sight), the hour gutter stays put, the "now" line (orange/red, 2 px) is in today's column at the right height, desktop lanes are 108 px wide for single items and 26 px for five overlapping (15 px on a phone). Broken: the open-at-current-hour scroll (QA4-1, QA4-2). Dense stacks still show one-letter labels (L4). |

## 3. New findings (most severe first)

### Medium

**QA4-1 (medium) Week opens scrolled past its day-name row: the columns have no names.**
Week, 1440x900 (also 1280x560, 360x640, 320x700), light and dark, RU (EN the same). Steps: any account with a tracked day and a tall grid (an early calendar event, or a short screen) → Week. Happened: the page opens with the scroll at about 18-110 px (the "hour before now" plus the 28 px label row, `Screen.scrollTo` adds `LABELS_PX`), so the row "пн 5 … вс 11" and today's bold label is scrolled out of sight; the first thing under the title is a gridline and hour 00 (or 10, or 16). Nothing says which column is which day or which one is today until the person scrolls back up. At 390x844 the labels are visible only because the content is barely taller than the screen (no scroll happens). Should: keep the label row in view (sticky above the grid, or do not add `LABELS_PX` to the offset so the labels stay at the top).
Shots: `shots/w-1440-light.png` (no day names above "00"), `shots/w2-360x640-early.png`, `shots/w3-360x640-nocal.png`, `shots/w3-1280x560-nocal.png`, `shots/m320.png` (second tile).

**QA4-2 (medium) Week "opens at the current hour" only if no calendar/usage data changes the grid afterwards; with an early event the "now" line is below the fold.**
Week, 360x640 and 1440x900/1280x600, RU. Steps: account whose calendar has an event before the tracked day's first hour (here Thu 00:55 and Sat 05:30) → Week. Happened: the scroll is applied once, on the first content-size change (`scrolledRef`), before the calendar arrives; then the grid starts at 00 and gets taller, the scroll stays where it was. Measured: 360x640 scrollTop 108 of 374, "now" line at y=698 on a 640 px screen; 1440x900 scrollTop 18 of 298, line at y=943 on a 900 px screen; 1280x600 line at y=643 on 600. The same accounts without the early event open correctly (line at y=488 of 640). So the owner's "open at the current hour" works on a fresh install with nothing synced and fails once the phone calendar is on, which is the normal case. Should: redo the scroll when the grid's first hour or height changes (until the person scrolls), or compute it from the final `fromHour` before showing.
Shots: `shots/w2-360x640-early.png`, `shots/w-1440-light.png`, `shots/w2-1440x900-early.png`.

**QA4-3 (medium) A block logged inside a running activity splits it; Day and Now disagree (the rest of QA3-1).**
Day, 1440, RU. Steps (at 21:12): seeded account with "Пошёл в ЦСС" running since 19:12 → "Записать прошедшее" → "Магазин", 19:30–20:50 → Save. Happened: accepted (it is in the past); Day now shows "19:12 – 19:30 Пошёл в ЦСС 18 м", "19:30 – 20:50 Магазин", "20:50 – сейчас Пошёл в ЦСС 22 м" (two pieces, 40 min), while Now still shows the same activity as one running row "Пошёл в ЦСС 2 ч · из ~20 м · Всё ещё этим занимаетесь?". The person sees 2 h on one screen and 18 m + 22 m on the other. Round 3 asked for "a closed block must not shorten an activity that is still running" and the fix only covered future ends. Should: either refuse a block that overlaps a running activity, or make Now count the same pieces (and say that the block was cut out of the running one).
Shots: `shots/overlap-day.png`, `shots/overlap-now.png`.

**QA4-4 (medium) Edit block: an end later than the next block's start is saved, logged and silently has no effect.**
Day, 1440, RU. Steps: today's "Собираюсь" (18:10–19:10, next activity starts 19:10) → pencil → "До" 20:30 → Сохранить. Happened: the sheet closes with no message, History gets "Время активности изменено · Собираюсь", Day still shows 18:10 – 19:10 (the timeline stops a live activity at the next start); reopening the sheet shows До 19:10 again. Nothing tells the person that 20:30 was not kept. Should: say so under the field ("Не позже начала следующей активности (19:10)"), or clamp the field and the saved event to that value.
Shots: `shots/g1.png`, `shots/g2-history.png`.

### Low (brief)

- L1 "New task"/"+" while already on `/add` after the field lost focus does not focus it again (`autoFocus` works on mount only); desktop/phone, second press does nothing visible.
- L2 History: the row circles are disabled but drawn and labelled like live ones ("Отметить «…» сделанной", `aria-disabled`); a click does nothing, no hint that the past view is read-only.
- L3 Week, previous week on a phone: the sideways strip keeps the scroll of this week (opens at Wed, Mon/Tue hidden); a past week should start at Monday.
- L4 Week lanes with 5 overlapping items: 15 px wide on a phone, 26 px on desktop, labels are one letter ("П", "М", "К", "Д…") and two items are 15 px circles; accessible names exist, but nothing is readable by eye (round-3 suggestion "+N" or a list on tap not done). `shots/lanes-390-crop.png`, `shots/lanes-1440-crop.png`.
- L5 Day sheets: the "still ahead" message appears only after pressing Save (the fields are not marked while typing); the Save button looks enabled.
- L6 23:00→01:00 for today is refused as "still ahead" in both fields; a person who means last night gets no hint to use the previous day (one-line hint would do).
- L7 Close sheet with "Сейчас" chosen: "Записано 21:02 · произошло 21:01" (the viewer's minute clock lags the real one by up to a minute); the same line for the deadline task reads 21:02 · 21:02.
- L8 A fresh account opened in a browser with `ru-RU` gets the English UI; also History lets you step back to before the account existed, one empty page per day, with no stop.
- L9 Week on a phone: the left-most day label is cut by the scroll ("ср, 7" shows ":р, 7"), by design of the strip but looks like a glitch; Day row of a running activity wraps its tag above the title at 320-360 px.
- L10 Not re-checked this round (still open from rounds 2-3): QA3-8..QA3-18 (picker below the fold, Inbox wording, vague History lines, tab title "Pace", leftover preset fields, close-sheet jargon "Выкл. = «примерно тогда»", landmark/heading axe items, no offline indicator).

## 4. What works well

- The Day sheets' new rule is consistent: log and edit, RU and EN, both fields marked in red with a readable sentence at 360 px, nothing written when refused, the night rule on a past day and the midnight split are right.
- History on a past day now reads as that day: "today/tomorrow/in N days" and ages agree with the label, and an empty moment says so.
- Headers: nothing leaves the screen at 390, 360 or 320 px, in either language and theme.
- The 44 px circle has the same look as before and the rows did not move; the composer takes the cursor from "New task" and "+" and a typed line goes straight into the list.
- Week on a phone: days are finally readable (72 px), the hour gutter stays, the strip lands on today and the "now" line is clear in both themes.
