# Bug lessons: why the tests missed it, and what catches the whole class

The owner, 2026-10-14: «после каждого найденного бага делать вывод почему существующими тестами мы его не
отловили и как в целом нужно улучшать свой подход к тестам чтобы отлавливать такие классы ошибок. однотипные
баги не хочется каждый раз скидывать».

So for every bug, whoever finds it (the owner, QA, a reviewer, a failing release) adds an entry here and does
three things:

1. **Why the tests missed it.** Name the gap: the path no test took, the state no fixture had, the level
   that cannot see it.
2. **The class.** Give the general kind of mistake, not the instance.
3. **Sweep and guard.** Find every other instance of the class in the code and fix them in the same change.
   Then add the check that catches the class from now on: a property test, a shared helper, an e2e sweep, a
   QA checklist line or a lint rule. A fix that only covers the reported case is not done.

The classes so far are below. Each has its standing rule, and new code is written against all of them.

## Classes

### 1. One decision computed in two places
- **Bug.** The composer's Create button was enabled from the form's title, while the action refused on the
  line's text. A task typed into a form opened by hand was refused with "Type something first." (stage 8).
- **Missed because.** Every test entered tasks the same way, by typing the line and pressing Enter. The two
  predicates agree on that path.
- **Rule.** A yes/no that the UI shows (enabled, visible, allowed) and the action enforces is one function
  in the view-model, read by both. Test it as a property: *whenever the control is enabled, the action
  accepts*, over every way into the state.

### 2. One entry path tested, the others assumed
- **Bug.** Same as 1. Also: the Inbox button counted something Now's counter did not.
- **Missed because.** The tests followed the happy path the author had in mind.
- **Rule.** For every form or flow, list its entry paths: typed, pasted, opened empty, from the assistant,
  from a shortcut, from a notification, editing. Test submit from each. QA opens every form every way
  (docs/qa.md).

### 3. Transient UI state cleared before the store catches up (async gap)
- **Bug.** A checked task flashed back after the dissolve, because "dissolving" was cleared before the close
  was written (stage 8).
- **Missed because.** Tests resolved the action at once; nothing held it pending.
- **Rule.** UI tests of an async action keep it pending with a deferred promise, and assert the screen at
  three moments: pending, then resolved, then refused. Local transient state is released when the store
  reflects the change, not when the call starts.

### 4. A number borrowed from a view-model built for something else
- **Bug.** Projects showed "0" because it read Now's filter chips, which drop projects (stage 8).
- **Missed because.** The fixtures had several projects with open tasks, where the borrowed value happened
  to be right.
- **Rule.** Each figure on a screen comes from a named view-model function for that purpose. Test it with
  edge fixtures: zero, one, all in one group, nothing open.

### 5. Layout, focus and animation that unit tests cannot see
- **Bug.** The composer's header slid out of its card while it unfolded. A focused input made the browser
  scroll an `overflow: hidden` box (stage 8).
- **Missed because.** jest-expo renders no layout. No e2e test looked at geometry during an animation.
- **Rule.** Anything that animates size or position gets an e2e check that samples the bounding boxes
  during the animation: nothing leaves its container. Every changed screen is looked at in screenshots,
  both themes, at phone and desktop widths.

### 6. Overlays placed without knowing what they cover
- **Bug.** Toasts lay over the time bar's buttons. The Calendar explanation appeared as a toast far from
  its button, after a delay (stage 8).
- **Missed because.** No test checks overlap. Toasts were placed at a fixed offset.
- **Rule.** Overlays (toast, tooltip, popover, banner) are positioned against their screen's real chrome or
  anchored to their cause. An e2e sweep shows every overlay on every screen and asserts it covers no
  enabled control. An explanation of a control is a tooltip on that control.

### 7. Invariants that live in folder structure
- **Bug.** Moving Projects, Insights and Settings out of `(tabs)` silently dropped the sign-in guard
  (stage 8, found in review).
- **Missed because.** Route tests ran signed in only.
- **Rule.** Guards and wrappers sit in one central place, not in a parent folder that files can leave. The
  route sweep runs signed out too: every non-public route must land on /login.

### 8. Only initial states tested, never transitions
- **Bug.** The central guard read "onboarded?" once, in a layout that never remounts. After the
  walk-through it would have sent the phone back into it forever (stage 8, found in review).
- **Missed because.** Tests mounted the component in state A or in state B. None changed A to B while it
  was mounted.
- **Rule.** For every hook or component holding state read from storage or the server, test the change
  while mounted: false → true, signed in → signed out, empty → filled.

### 9. Time boundaries
- **Bug.** "Attend" on an event that starts in a few minutes failed with "That time is in the future." The
  reminder and the Calendar button offer events slightly ahead (stage 8).
- **Missed because.** Fixtures used events that had already started.
- **Rule.** Anything taking an instant is tested around its boundaries: before, at and after the start;
  just before and after now; across midnight and a zone change. Prefer fast-check properties over offsets
  relative to `now` instead of fixed timestamps. Run them in a zone other than UTC (the owner's is
  Europe/Moscow, UTC+3) and feed them the input in the shape the platform really hands out (expo-calendar's
  Android module: UTC strings `yyyy-MM-ddTHH:mm:ss.SSSZ`), not only hand-made ISO fixtures. When a report
  names a screen, reproduce on that screen's own path before concluding where the refusal came from: a
  toast is app-wide and outlives a tab switch.

### 10. A control that does nothing on one platform
- **Bug.** "Add a computer" did nothing on phones (stage 8; the root cause is recorded with its fix).
- **Missed because.** e2e runs only the web build. App tests rendered the button but never pressed it on
  the phone layout.
- **Rule.** Every control on a phone-layout screen has an app test that presses it and asserts a visible
  result. The QA heuristic "every control must change something" is checked at phone width too.

### 11. The web build standing in for Android's layout
- **Bug.** On Android, Now's calendar card ("Attend or skip?") was drawn over the first two task rows: the
  rows stayed where they had been before the card arrived, while the list below them had moved down
  (stage 8, the owner's screenshot on v0.9.0).
- **Missed because.** React Native's renderer on Android flattens a View that only lays out (padding, an
  `aria-label`, a `role`): the task list's box vanished, its rows became children of the scroll view, and
  the card's arrival changed every row's own frame, which set off each row's Reanimated layout transition
  (`ROW_LAYOUT`); on the phone they stuck at their start. The web never flattens, so the e2e suite (web
  only) and jest (no layout) could not see it; nobody opened Now on Android with an event on.
- **Rule.** Rows that slide with a layout transition sit in `RowList` (`apps/app/src/ui/row-list.tsx`), a
  box kept a native view (`collapsable={false}`), so nothing outside the list can move a row's own frame.
  The structural app test `rowsInFlattenableBoxes()` (apps/app/src/test/sliding-rows.ts) runs on every
  screen with such rows; a card that arrives above a list gets an e2e geometry check at phone width (card
  and first row do not intersect), and the QA round on Android opens screens whose cards load late.

### 12. A producer's output never checked against its own contract
- **Bug.** `/api/parse` could answer with an activity label longer than 80 characters, a summary
  longer than 500, an expected length past a day, or a new task with over 100 subtasks. The schema
  the client parses the answer with refuses all of these, so the whole answer was lost. The client
  also refused answers with extra keys, so any key a newer server added would break an older app
  (stage 8, Task 11 review).
- **Missed because.** The API tests read answers with `json<T>()`, a cast that checks nothing.
  Fixtures used short, tidy texts. Nothing fed the producers long or odd input.
- **Rule.** Whatever a server sends goes through the endpoint's own `output` schema in its tests.
  A fast-check property feeds the producers (rules, model conversion, summaries, planners) random
  long texts and answers, and asserts the output still fits the schema. Limits live in one place
  (`proposals/limits.ts`), read by both the schema and the producers. Response schemas are loose
  (`z.object`); only request input is strict.

## Log

New bugs go here with their class; a new class gets its own section above.

| Date | Bug | Class | Swept? | Guard added |
|---|---|---|---|---|
| 2026-10-14 | Composer refuses a hand-typed title | 1, 2 | pending (stage 8 sweep) | `canAdd` property test, e2e N → title → Enter |
| 2026-10-14 | Dissolved task flashes back | 3 | pending (stage 8 sweep) | deferred-promise app test |
| 2026-10-14 | Projects show 0 | 4 | pending (stage 8 sweep) | edge-fixture view-model test |
| 2026-10-14 | Composer header clipped while unfolding | 5 | pending (stage 8 sweep) | e2e geometry check |
| 2026-10-14 | Toast over the time bar | 6 | pending (stage 8 sweep) | e2e overlay sweep |
| 2026-10-14 | Moved routes lost the sign-in guard | 7 | yes | central RouteGate, signed-out deep-link tests |
| 2026-10-14 | Onboarding loop in the central guard | 8 | pending (stage 8 sweep) | transition test |
| 2026-10-14 | Attend refuses an event that starts soon | 9 | yes: root cause was Day's "Attended" button, which logged the whole event with `logPast` (its end is ahead for any event not over, so `retro/future`; an event that was on already failed too). It now goes through `startCalendar` like Now's offer, the Calendar button and the picker, and is shown only from 15 minutes before the start (`isAttendableNow`). `startCalendar` already started at `min(start, now)`; other `logPast` callers (sleep, "always attended" series) only take instants already over | time-offset tests (−10 min, −1 s, 0, +1 s, +2 min, +15 min) at client and Day level, `isAttendableNow` boundary test |
| 2026-10-14 | Add a computer does nothing on phones | 10 | pending (stage 8 sweep) | press test at phone layout |
| 2026-10-14 | Now's calendar card drawn over the task rows on Android | 11 (5) | yes: the only lists whose rows carry a layout transition are Now's/Projects' `TaskRows` and Day's timeline (`Entries`); both now sit in `RowList`. The sheet's entering animations have no layout transition and are absolutely placed | `rowsInFlattenableBoxes()` app tests on Now (card shown) and Day (blocks and calendar shown); e2e at 390px: the card's box ends above the first row, then Attend starts the event |
| 2026-10-14 | "That time is in the future." over Now's calendar card (owner, Android, 13:47 Moscow, an event 12:15–15:20) | 9 | yes: not reproducible on Now's path. A Now-level test in Europe/Moscow with expo-calendar's Android event shape (offsets −92 min … +9 min, with and without something running) and a client fast-check property (start ±6 h by the second, any length, any running activity) all start the event; `startCalendar` cannot return `retro/future` (its only refusal path, `logPast`, runs for an event already over). Every `retro/future` producer in v0.9.0 was swept: `logPast` (Day's "Attended" over the whole event, the activity sheet, sleep), `adjustActivity`, task events dated ahead; none is reachable from Now. In v0.9.0 Day's "Attended" refused exactly this event, and a toast is app-wide for 5–10 s; with the rows drawn over the card (above), a tap on the visible "Attend" would land on the task row drawn over it (rows come later in drawing and hit-test order), not on Attend. The previous fix's sweep had checked UTC offsets only, on hand-made ISO fixtures. Follow-up found and fixed: after attending ahead of its start, Day kept offering Attended/Skip (`isCalendarLogged` saw a block ending at now before the event's start) and a second tap restarted the activity | Moscow + Android-shape test on Now, client fast-check property, phone-calendar shape test, Day test "then reads logged", `startCalendar` keeps an attended event running (second tap), `isStartedFor` test |
| 2026-10-14 | Adding problems to a task through the assistant no longer kept the message as the task's source | 2 | yes: the bot and the deferred queue both plan through `planProposals`, with the text as `sourceText`; add and mark both keep it | the deleted `addToTask` test was the only guard: core plan test, bot integration test, deferred-queue integration test |
| 2026-10-14 | `/api/parse` could send answers its own contract refuses (labels, summaries, lengths, subtask counts), and the client refused unknown keys | 12 (new) | yes: producers clamp to `PROPOSAL_LIMITS`, summaries name at most 5 items and then "+N", response schemas are loose | every `/api/parse` answer in `parse.int.test.ts` goes through `endpoints.parse.run.output`; fast-check properties over the rules, the model conversion with summaries, and `planActivity` against `parseEvent`; a client test with extra keys |
| 2026-10-14 | Attend after a run of the same title left open (yesterday's lecture, or the one just before back to back) silently did nothing, while Now kept offering it | 1 | yes: "is this occurrence attended already?" was answered in three places with three rules (`startCalendar`'s no-op by title against any open run, Now's `isTracked` from 10 minutes before, Day's `isStartedFor` from 15 and with the raw title, so a title over 80 characters never matched). One predicate now, `isCalendarRun` in @pace/client (label as stored by `activityLabel`, begun from `CALENDAR_LEAD_MINUTES` before the start until the end), read by all three; the 10 and 15 minute windows are one constant (Now now offers an event 15 minutes ahead, like Day and the Calendar button); Day's overlap check compares `activityLabel(title)` too | client tests: a stale open run from yesterday, back-to-back same-title events, a title over 80 characters; `isCalendarRun` unit tests; Day "reads logged" with a long title; Now prompt still offered over a stale run |
| 2026-10-14 | A past calendar event with a title over 80 characters could not be logged (`logPast` trimmed but did not cut, the payload refuses > 80) | 12 | yes: `logPast` and the Day sheet's rename cut through `activityLabel`, the one helper `startActivity` and `isCalendarRun` use | client test: a 100+ character title logs, stored as `activityLabel(title)` |
