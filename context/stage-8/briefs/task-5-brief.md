# Task 5 — Part B: Day list design, "Back to today", Calendar without scrolling, event details in a pane

(After Task 3 the Week screen is the Calendar screen: apps/app/src/features/calendar/*, route `/calendar`.)

Owner's words:
- Day list (dashed boxes «10h 36m not logged — Log it», activity rows, dividers between some rows only):
  «Ну чето дизайн снова странный. Где-то есть черточки, где-то нет. Давай красиво сделаем пожалуйста».
- Calendar header («This week» button, greyed, ‹ ›): «Громоздкая кнопка которая хуй зачем нужна если мы уже на текущей
  неделе. Мб просто “Reset to today” на всех неделях которые не наши. И у вкладки Day то же самое».
- Calendar grid: «А еще блять почему оно скроллится? Раз уж тут всего 7-24 часы (что кстати не оч правильно, надо хотяб
  опцию показывать и ночные часы тоже), стоит сделать так чтобы не скролилось».
- Event dialog («🚆 Поезд Москва → Ижевск … · 17 Sat, 17:44–10:43 · From the calendar»): «Как-то странно инфа о календаре
  вылезает. Во первых, давай сделаем как в Now – слева календарь, справа по клику инфа о событии (или затреканной
  активности), а на телефонах всплывашку снизу, как при клике на таску условно. Ну и можно как будто чуть больше инфы
  из календаря подсосать».

## 1. Day list (apps/app/src/features/day/day-screen.tsx, day-nav.tsx; model packages/client/src/view-models/day.ts)
One consistent timeline list: every entry (activity or gap) is a row of the same height rhythm and the same
left time column; a hairline divider between EVERY pair of rows (or none at all — pick one and apply it
everywhere, including around gaps and the "Log past activity" action). Gaps are not dashed boxes: a muted row
"10:36 – 21:12 · 10h 36m not logged" with a text "Log" action on the right (same place the activity rows have
their duration/pencil). "Log past activity" becomes a quiet text/ghost row at the end, not a big outlined box.
Keep row animations. Look at the result in screenshots and iterate until it is calm and consistent.

## 2. "Back to today" (Day and Calendar)
Remove the 48 px "Today" / "This week" buttons. Show a small text/ghost button "Back to today" (EN) / "К сегодня"
(RU) next to the ‹ › arrows only when the shown day/week is not today / the current week. Arrows stay. On Day keep
the date picker. Tests: app tests that the button is absent on today/this week and present (and works) otherwise.

## 3. Calendar fits the screen; night hours option
apps/app/src/features/calendar (ex-week) week-screen/week-grid + packages/client/src/view-models/week.ts.
The grid must not scroll vertically: compute the hour height from the available height (onLayout of the grid's
container: (height − header − day labels) / number of hours), with a floor (e.g. 18 px per hour on phones,
and if even that does not fit, then — and only then — allow scrolling). Remove the pre-scroll logic
(`useOpenAt`, CHROME_PX) if it becomes dead. The hour range: default 07–24 as now (lowered to fit earlier tracked
blocks/events as now); a new setting "Show night hours" (calendar shows 00–24) — a settings key in core's
settings (packages/core/src/model/settings.ts + settings reducer + `settings.updated` payload; follow how
existing settings like `quietHours` are added) toggled from a small control on the Calendar screen header
(e.g. a moon icon toggle with a Tooltip "Night hours", from Task 4's ui/tooltip.tsx) and mirrored in Settings
(a switch row under preferences). Phones keep sideways scrolling of days if columns would be narrower than 72px.
Tests: view-model test for the hour range with and without night hours; app test that hourPx follows the
measured height (mock onLayout).

## 4. Details beside the calendar / sheet on phones
Like Now: on a wide window the Calendar screen is a split — the grid on the left, a details pane on the right
that shows the clicked event or tracked block (empty state: "Pick an event or a block to see its details");
on a phone a bottom sheet (ui/sheet.tsx) as today. Reuse the split layout approach of
apps/app/src/screens/now-screen.tsx (`NowSplit`) — extract a shared `SplitPane` layout component in
apps/app/src/ui if that keeps both simple. The selected block gets a selected style.
Event details show more from the calendar: title, the day and time range (and "all day"), the calendar's name,
location (tappable → maps link on phone/web), the video-call link if any (opens), notes/description (first ~10
lines, links tappable), organizer and attendees count if available. Tracked block details as today (category ·
duration, where-sat info, "Open the task").
This needs the phone's calendar copy to carry more fields: find the calendar sync schema
(`/api/calendar/sync` in packages/core/src/api/endpoints.ts + schema, apps/api cloud routes/storage — the DO table
that stores calendar entries in apps/api/src/user-store/schema.ts — and the phone side apps/app/src/platform/
phone-upload.ts / calendar reading via expo-calendar). Add optional fields: `location`, `notes` (cap length,
e.g. 2000 chars), `url`, `calendarName`, `organizer`, `attendeeCount`, `allDay` — whatever expo-calendar's Event
gives (check its types in node_modules/expo-calendar). DO schema change → `bun db:generate`, commit SQL.
Tests: api int test that the new fields round-trip through sync → the calendar read endpoint; app test for the
details pane content; client view-model test if the view-model maps them.

## Checks
Screenshots desktop 1280 (light + dark) and phone 390 of Day (a day with gaps), Calendar (this week and another
week, with night hours on and off, a selected event with details), saved under
/tmp/claude-0/-home-user-pace-dev/cb223545-7465-5720-b7e6-b3fd375d3413/scratchpad/task5/; look at them and fix what
looks off. `bun lint`, `bun test:unit`, `bun test:api`, `bun test:app` green; update and run the e2e specs that
touch Day/Calendar.
