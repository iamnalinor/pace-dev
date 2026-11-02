# Task 6 — Part C: the time bar's buttons; the bar moves to Day

Owner's words (screenshot: the bar under Now with Calendar, Rest, Sport, Chores, each with «⋯»):
«Три точки – на шестеренки, и только там где это актуально. У Calendar, например, нет, там пикер всегда. У Chores
аналогично. Среди активностей давай оставим Calendar, Task (открываем пикер тасок и выбираем), Chores, Rest.
Получается шестеренки даже нигде не нужны (все всегда открывают менюшки, в Rest можно добавить подвиды – сон
небольшой, отдых и тд, придумай). Давай уберем их везде».
Decision taken: the bar moves from Now to Day (it now holds a Task button and belongs with the day's activities);
Now keeps one compact row for the running activity.

## Buttons (packages/core/src/tracking/buttons.ts TIME_BUTTONS; apps/app/src/shared/tracking/time-bar.tsx,
## choices-sheet.tsx, use-calendar-button.ts)
Four buttons in this order: Calendar, Task, Chores, Rest. Sport is removed as a button.
- Every tap opens that button's picker (a Sheet; a dialog on wide windows). No «⋯», no long press, no right-click
  menu anywhere (delete `Ellipsis`, `contextMenuProps` usage, the long-press path, `time.more`).
- A running button: tapping it opens its picker too, with a "Stop" action at the top (stop must stay one tap away
  for the running activity — also via the running row, see below).
- Calendar: today's events picker as today (incl. "Start a meeting without an event"); unavailable state keeps the
  Tooltip from Task 4.
- Task: a picker of open tasks in Now's order (reuse the Now view-model rows), with a search field at the top
  filtering by title; choosing one starts Focus on that task (the same action the task page's Focus button runs —
  find it in packages/client/src/actions, e.g. startFocus / focus.started).
- Chores: as now, minus Nap.
- Rest: Short break (15m), Rest (30m), Walk (30m), Workout (1h), Nap (30m), Sleep (8h). Each with a category
  (rest for break/rest/walk? — use `sport` for Workout, `sleep` for Sleep and Nap? decide sensibly: Nap and Sleep →
  `sleep`, Workout → `sport`, the others → `rest`) and an expected length. EN/RU labels (RU: Короткий перерыв, Отдых,
  Прогулка, Тренировка, Дрёма, Сон).
- "Alongside what is running" switch moves into the picker's header (shown only when something else is running).
- Core tests for TIME_BUTTONS (ids, order, choices); remove obsolete tests for removed behaviour.

## The bar on Day, a compact row on Now
- Move `<TimeBar />` from Now's `Screen footer` (apps/app/src/features/now/now-screen.tsx) to the Day screen's
  footer (apps/app/src/features/day/day-screen.tsx). Day's footer is shown only when Day shows today.
- Now: when an activity runs, a compact row at the top of the list (or above the composer — pick the calmer place
  and say why): the category tag, label, running duration, and a Stop button; tapping the row opens Day. Nothing when
  nothing runs. Reuse `RunningRow` (shared/tracking/running-row.tsx) in a compact variant if it fits.
- Anything else that depended on the bar living on Now (hotkeys? Focus on the right pane?) keeps working.

## Tests
App tests: Day shows the bar with the four buttons in order and no «⋯»; each tap opens its picker; Task picker
filters and starts focus; Rest lists six choices; Now shows the compact running row with Stop only while something
runs. Update e2e specs that use the time bar (e2e/time*.e2e.ts and others: grep "What are you doing", "Rest",
"Sport", "time.more"). `bun lint`, `bun test:unit`, `bun test:app` green; run the touched e2e specs.
Screenshots of Day (bar, each picker) desktop + phone into
/tmp/claude-0/-home-user-pace-dev/cb223545-7465-5720-b7e6-b3fd375d3413/scratchpad/task6/.
