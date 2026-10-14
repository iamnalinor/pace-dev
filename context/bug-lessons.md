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
  relative to `now` instead of fixed timestamps.

### 10. A control that does nothing on one platform
- **Bug.** "Add a computer" did nothing on phones (stage 8; the root cause is recorded with its fix).
- **Missed because.** e2e runs only the web build. App tests rendered the button but never pressed it on
  the phone layout.
- **Rule.** Every control on a phone-layout screen has an app test that presses it and asserts a visible
  result. The QA heuristic "every control must change something" is checked at phone width too.

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
| 2026-10-14 | Attend refuses an event that starts soon | 9 | pending (stage 8 sweep) | time-offset tests |
| 2026-10-14 | Add a computer does nothing on phones | 10 | pending (stage 8 sweep) | press test at phone layout |
