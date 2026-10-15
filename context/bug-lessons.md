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
  `deadControls()` does this for a whole screen at once; a new main screen joins
  `phone-controls.test.tsx`. A control whose action writes nothing (an empty list of events) is
  dead on every platform: an answer that changes nothing still has to be written down.

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

### 13. A contract strict in the direction that must stay open
- **Bug.** The calendar answer was a strict schema shared with what the phone sends: adding the
  event's details to the answer would have made every older client refuse it (stage 8, found in
  review).
- **Missed because.** Client and server always shipped together in the tests; no test parsed an answer
  from a newer server.
- **Rule.** What a client sends is strict; what a server answers is not (unknown keys are dropped;
  class 12 made the parse answer loose by hand, and the LLM status answer was still missed). One
  place decides it now: `endpoint()` loosens every output (`loosen` in
  `packages/core/src/api/loose.ts`: every object at any depth, all other checks kept), so a schema
  may stay strict where it also checks an input. `endpoints.test.ts` walks every endpoint's output
  and fails on any strict object at any depth.
- **Also open: what a newer server can add a value to.** Unknown keys are not the only way in: a new
  kind of notification, a new resolution, push method or delivery result fails a closed enum or a
  discriminated union just as hard, and one such entry lost the whole list. A list of things a
  server can grow is read with `knownValues` (unknown entries dropped, the rest kept), a single
  value with `knownValue` (a stand-in for an unknown one) or `knownOrNull`
  (`packages/core/src/api/tolerant.ts`). A socket message is an answer too: it is read through
  `loosen`. `loosen` and the sweep walk records as well.
- **And what an older server leaves out.** A field added to an answer is absent from an older
  server's (a self-hosted one, a stale deploy): it is read with `knownOrNull` (absent reads as
  `null`) or as optional, never as required (stage 8 sweep: `fcmProject`).

### 14. A control inside a control
- **Bug.** Day's block row is one button (it opens the edit sheet); a block on a task carried the
  task's title as a link inside that button. A screen reader never reached the link, the web build
  nested a focusable inside a focusable (axe `nested-interactive`), and the link was 15 px tall
  (`target-size`) (stage 8, found by the Task picker's e2e, which is the first to put a block on a
  task before running axe on Day).
- **Missed because.** Day's tests and its axe pass ran on blocks without a task; the link only shows
  for a block on a task. jest cannot see the nesting either: it finds no link by role inside an
  accessible button, and no test looked for one.
- **Rule.** A row that is pressable as a whole holds no other control: anything else it offers
  (a link, Stop, a check) sits beside it or on its own line. `controlsInsideControls()`
  (apps/app/src/test/nested-controls.ts) runs on screens with such rows, with the fixture that
  shows every optional part (a block on a task, something running), and the e2e axe pass runs with
  that fixture too.

### 15. An outside service's refusal read by its status alone, with a lasting consequence
- **Bug.** Any 401 or 403 from FCM marked push broken for every user until the key changed. FCM
  answers 403 `SENDER_ID_MISMATCH` for one phone's token issued by another Firebase project, and
  401 for an access token it stopped taking: one odd device, or one stale token, would have
  switched push off for everyone, for good (stage 8, Task 8 review).
- **Missed because.** The test double answered bare statuses with empty bodies, so the code
  could only ever look at the status; nobody read the provider's error codes.
- **Rule.** Classify a provider's refusal by its documented error body first (FCM's `FcmError`
  `errorCode` and the field it names), the status only after that. A refusal about one item (a
  device's token) acts on that item; a stale credential is refreshed and retried once before
  anything is concluded. A state that turns something off for everyone expires and is checked
  again (`BROKEN_FOR_MS`). Test doubles answer with the provider's real error bodies.

### 16. Each side checks it has the thing, nobody checks that both have the same one
- **Bug.** The app chose Google's push whenever the server offered FCM and the phone had a Google
  token. An APK built with one Firebase project's `google-services.json` and a server holding
  another project's service account (a self-hosted server) get `SENDER_ID_MISMATCH` on every
  send: the server dropped the phone as gone, the app registered FCM again on its next start, and
  no notification ever arrived, silently (stage 8, the owner).
- **Missed because.** Each side was tested alone: the app against a server that "offers fcm",
  the server against tokens that were all its own project's or plainly dead. No test paired two
  identities, and the refusal that means "never with this server" was read as "gone".
- **Rule.** When two parts must be configured from the same source (a Firebase project, a bot, a
  key pair, an origin), the handshake names the identity, and each side compares it before it
  relies on the other (`fcmProject` in `GET /api/push/methods`, `projectId` in the FCM
  registration). A provider's refusal of the pairing is its own outcome (`incompatible`), never
  "gone": the device moves to what works (polling) at once, and the server remembers the pairing
  (`fcm_refused_tokens`) so a retry cannot start a silent loop. Test the whole path: refused →
  fallback → the next start stays on the fallback.

### 17. A failed external action has no persisted path back to a retry
- **Bug.** Telegram and FCM send refusals were logged as failures, but the pool pass never revisited their existing notifications. FCM dismissals were marked complete before FCM accepted them, so a refused dismissal had no retry path.
- **Missed because.** Notification integration tests covered successful sends, permanent refusals and repeated passes after success; none ran a pool alarm after a transient refusal or inspected an unsuccessful dismissal.
- **Rule.** A transient refusal leaves a durable pending state and arms the next alarm. Commit delivery or dismissal only after transport acceptance. Test refusal, alarm retry, and a later pass that must not duplicate success for every external channel.

### 18. A permanent provider refusal treated as a transient one
- **Bug.** Telegram's permanent HTTP 400 deletion refusal kept an already resolved notification on a one-minute retry alarm forever. FCM dismissal also collapsed a project mismatch or refused credentials into a transient failure.
- **Missed because.** The retry tests used only HTTP 500 followed by success. They did not run another alarm after a provider response that cannot become successful for that copy.
- **Rule.** Preserve provider refusal classes through the transport, persist terminal dismissal outcomes without claiming the copy was removed, and exclude them from the retry queue. Test one later pool pass for each terminal channel outcome.

The same rule applies when a previously successful channel is no longer configured: a delivered Telegram copy cannot be deleted without a bot transport. Record `dismissal-unavailable` with `dismissedAt` still null and stop the minute retry alarm, as for a missing FCM transport.

### 19. Progress saved for one session reused in another
- **Bug.** The phone stored one push poll cursor for all accounts. After account A reached sequence 100, account B's first poll sent `after=100`; the server discarded B's earlier pending entries. The phone usage upload cursor likewise skipped history when the account changed.
- **Missed because.** Tests only repeated polling or uploading within one signed-in session. They never switched sessions while keeping the phone's secure storage, and the fake server did not make one account's cursor larger than another's queue. Later tests delayed only the response, missing a switch between the last local read and the API call; they also made only one poll at a time. The platform tests filled SecureStore directly, while the app-state test used an injected memory session store, exposing an accidental dependence on the storage adapter.
- **Rule.** Every persisted server progress marker carries the identity of the session whose data it advances. A different session, or an old marker without identity, starts from the beginning. Capture session identity from the API client's in-memory credential, which is the one `call` sends, independently of where auth persists it. Before an API call, synchronously compare that credential after all awaited preparation; check it again before applying the answer. If an asynchronous display finishes after a switch, take it back. Advance an upload cursor only after every batch was sent. Serialise concurrent progress reads and writes for one session so a later dismissal and cursor cannot be overtaken. Test A → B during preparation, response and display, and two overlapping polls whose responses change the same notification.

### 20. A test acts before server settings reach the screen
- **Bug.** Week's Day navigation pressed Previous day before the first sync applied the seeded UTC zone. The displayed date changed from 15 to 13 across the zone switch, so a counting loop missed 7 October.
- **Missed because.** The e2e test assumed the seed's time zone was already visible when the page loaded. It did not wait for the app to receive and apply the server's settings before navigating dates.
- **Rule.** A scenario that depends on a server setting waits for that setting to appear in the UI before acting on derived dates or state. Check the authoritative value first; Week's test waits for Settings to show `Account: UTC` before Day navigation.

### 21. A one-tap destructive action has no recovery path
- **Bug.** History's Undo button revoked an event on the first press, though that correction cannot itself be undone. The Done check on Now and Project rows and the task detail also closed a task with no immediate way back.
- **Missed because.** The History test checked that Undo existed but never pressed it. The Done tests checked that the task closed, not whether an accidental press could be reversed.
- **Rule.** A destructive one-tap action must offer immediate recovery; if recovery is not available, it needs explicit confirmation before the write. Test the first tap, Cancel or recovery, and the final write. History uses the shared Sheet confirmation (phone sheet, desktop dialog, Escape/backdrop dismissal, no primary hotkey). Done uses the shared `useCloseWithUndo` action and an Undo toast. Sweep direct `actions.revoke` controls and other destructive actions whenever adding one.

## Log

New bugs go here with their class; a new class gets its own section above.

| Date | Bug | Class | Swept? | Guard added |
|---|---|---|---|---|
| 2026-10-14 | Composer refuses a hand-typed title | 1, 2 | yes (stage 8 sweep): class 1 found the close sheet's pills and typed time (its own row below); class 2 listed every form's ways in (docs/qa.md, "Every form, every way in") and found one way with no test submitting from it, the share into the composer (`/add`): it works (the address becomes the task's link), now tested; the others each have a submitting test | `canAdd` property test, e2e N → title → Enter; the entry-path table in docs/qa.md; share → Create test |
| 2026-10-14 | Dissolved task flashes back | 3 | yes (stage 8 sweep): every component holding local state around a write was read (the slider's saving step, the feed's pending answer, the time bar's pickers, the composer, the task edit sheet, Settings' account deletion, Devices' add and disconnect, the calendar sync switch): each releases after the call returns with the store updated, or keeps a refusal on screen. Two were not: Day's and Now's Skip hid the event and ignored a failed `skipEvent` (row below), and a refused Telegram button answer took the buttons away (row below) | deferred-promise app test; `heldRoute()` (apps/app/src/test/held-route.ts): a fake route held pending, answered or refused by the test, used by the Skip tests on Day and Now |
| 2026-10-14 | Day's and Now's Skip hid the calendar event at once and ignored a failed `skipEvent`: offline, the event was gone here and still asked about everywhere else | 3 | yes (see the class 3 row above) | Day and Now tests with `heldRoute()`: shown while it is sent, gone once accepted, kept with "That did not go through. Try again." when refused |
| 2026-10-14 | A refused answer from a Telegram button (an unknown or failing notification) edited the message and took its buttons away | 3 | yes: the only other button path that edits after a write is the preview's Accept, which replaces the preview by the result on purpose | bot test: a refused answer leaves the message untouched (no edit) and shows the reason as an alert |
| 2026-10-14 | Projects show 0 | 4 | yes (stage 8 sweep): every figure on a screen was traced to where it is computed. One was still borrowed: the Inbox badge (sidebar and phone tab) added Now's `inboxCount` to a filter that lived in a screen file (`decisionsOf` in review-card.tsx), while the Inbox screen counted its own list; they agreed only because both rules happen to match today. Now both read `waitingCount` / `reviewDecisions` in the client's review view-model. The others come from their own view-model (the bell's `unread`, Projects' `open`, Day, Week and Insights totals) or count the very list they sit beside (Now's and a project's folded sections, the subtask checklist's solved and sent, Settings' permissions summary) | edge-fixture view-model test; `waitingCount` tests: the artboard (a capture waiting too long counted once), nothing open (0), decisions without captures |
| 2026-10-14 | Composer header clipped while unfolding | 5 | yes (stage 8 sweep): what animates size or position is the composer's unfold (`AnimatedHeight`, its only user), the sheets and dialogs (slide and fade in), the dissolve of a checked row, the rows' layout transitions (class 11) and the update banner (web, static once shown). Sampled now: the unfold and a sheet's open at phone and desktop width; no frame lets a child out. No new instance | e2e geometry check; `expectStaysInside()` (e2e/support/geometry.ts): frame-by-frame boxes of a child against its container while an animation runs, on the composer's unfold (its clipping card) and a sheet's open (its title and its foot inside the surface) |
| 2026-10-14 | Toast over the time bar | 6 | yes (stage 8 sweep): a toast raised on Now and carried to every main screen (Now, Day, Inbox, More, Week, Settings) at 390 and 1280 px. One more instance: on a computer the floating toast lay over Settings' first digest time (and over whatever control a page has near its foot). A wide window's toast now docks at the sidebar's foot, below its links, where nothing is to be pressed; a phone's stays above the tab bar (and a footer), where it covered nothing on any screen. The greyed Calendar tooltip sits over the typed field above the bar while the pointer rests on Calendar: by design (an explanation on its control), never over the bar's buttons | e2e overlay sweep `overlays.e2e.ts` with `controlsUnder()` (the enabled controls an overlay lies over): every main screen at phone and desktop width, and the Calendar tooltip; time.e2e's toast check reads the same helper |
| 2026-10-14 | Moved routes lost the sign-in guard | 7 | yes; stage 8 sweep: every wrapper that depends on folder placement was checked — the guard (RouteGate, the root Stack's layout), the screen scene (set on both navigators, the root Stack and the tabs), every provider (all in the root layout; `(tabs)/_layout` holds none). No instance | central RouteGate, signed-out deep-link tests; the e2e route sweep now also runs signed out: every route file, by a direct load, must land on /login unless it is a sign-in or walk-through screen |
| 2026-10-14 | Onboarding loop in the central guard | 8 | yes (stage 8 sweep): every effect that reads phone storage or the server once was listed (`useEffect(…, [])` and friends). Fixed: the push picker (its own row above) and what the phone remembers about calendar series and dismissals, read separately by Now's offer (every 5 min), Day (every minute) and Settings → Permissions (on opening): a series answered for good on Day left Now's card up, and one forgotten in Permissions stayed in effect on Day for up to a minute. Now one change count (`usePhoneMemoryVersion`) that every write bumps and every reader follows. Not instances: the theme (one reader, its own writer), the device id (fixed per install), Devices' calendar switch (its own writer), the onboarding flag (Task 3's fix), the permission cards (read again on return to the app), the bot login's poll | transition test; app tests: Now drops the card of a series ruled on Day while mounted; Permissions lists a rule remembered meanwhile and drops one forgotten |
| 2026-10-14 | Attend refuses an event that starts soon | 9 | yes: root cause was Day's "Attended" button, which logged the whole event with `logPast` (its end is ahead for any event not over, so `retro/future`; an event that was on already failed too). It now goes through `startCalendar` like Now's offer, the Calendar button and the picker, and is shown only from 15 minutes before the start (`isAttendableNow`). `startCalendar` already started at `min(start, now)`; other `logPast` callers (sleep, "always attended" series) only take instants already over | time-offset tests (−10 min, −1 s, 0, +1 s, +2 min, +15 min) at client and Day level, `isAttendableNow` boundary test |
| 2026-10-14 | Add a computer does nothing on phones | 10 | yes (stage 8 sweep): not reproducible in the current code. The add flow was rebuilt (Task 7, the system picker); at phone layout the button opens the sheet, Create makes the token and the steps show, and the generic press sweep finds nothing dead on Devices. The v0.9.0 code had the same open-a-sheet structure and its app test passed too, so the root cause is Android-only and could not be established without a device: it is on the release QA list (open Settings → Devices → Add a computer on a phone). The sweep found one dead control on every platform instead (row below) | press test at phone layout; `deadControls()` (apps/app/src/test/dead-controls.ts): renders a screen afresh for each enabled control, presses it and fails when nothing changed (screen, navigation, store), run on Now, Day, Inbox, More, Settings, Week and Devices (`phone-controls.test.tsx`), with an allowlist that says why (Day's usage access opens Android's settings) |
| 2026-10-15 | The Inbox's "Keep open" (a passed deadline, "submitted?") wrote nothing: the card stayed, on every platform; the MCP tool said "keep-open records nothing" | 10 | yes (the sweep above, every main screen) | Keep open writes the task's own status again, which the reducer counts as activity (`lastEventAt` moves, no field changes): the deadline card goes, "submitted?" asks again a day later; core tests for both, the client test, and the sweep's Inbox run (it failed on Keep open before) |
| 2026-10-14 | Now's calendar card drawn over the task rows on Android | 11 (5) | yes: the only lists whose rows carry a layout transition are Now's/Projects' `TaskRows` and Day's timeline (`Entries`); both now sit in `RowList`. The sheet's entering animations have no layout transition and are absolutely placed | `rowsInFlattenableBoxes()` app tests on Now (card shown) and Day (blocks and calendar shown); e2e at 390px: the card's box ends above the first row, then Attend starts the event |
| 2026-10-14 | "That time is in the future." over Now's calendar card (owner, Android, 13:47 Moscow, an event 12:15–15:20) | 9 | yes: not reproducible on Now's path. A Now-level test in Europe/Moscow with expo-calendar's Android event shape (offsets −92 min … +9 min, with and without something running) and a client fast-check property (start ±6 h by the second, any length, any running activity) all start the event; `startCalendar` cannot return `retro/future` (its only refusal path, `logPast`, runs for an event already over). Every `retro/future` producer in v0.9.0 was swept: `logPast` (Day's "Attended" over the whole event, the activity sheet, sleep), `adjustActivity`, task events dated ahead; none is reachable from Now. In v0.9.0 Day's "Attended" refused exactly this event, and a toast is app-wide for 5–10 s; with the rows drawn over the card (above), a tap on the visible "Attend" would land on the task row drawn over it (rows come later in drawing and hit-test order), not on Attend. The previous fix's sweep had checked UTC offsets only, on hand-made ISO fixtures. Follow-up found and fixed: after attending ahead of its start, Day kept offering Attended/Skip (`isCalendarLogged` saw a block ending at now before the event's start) and a second tap restarted the activity | Moscow + Android-shape test on Now, client fast-check property, phone-calendar shape test, Day test "then reads logged", `startCalendar` keeps an attended event running (second tap), `isStartedFor` test |
| 2026-10-14 | Adding problems to a task through the assistant no longer kept the message as the task's source | 2 | yes: the bot and the deferred queue both plan through `planProposals`, with the text as `sourceText`; add and mark both keep it | the deleted `addToTask` test was the only guard: core plan test, bot integration test, deferred-queue integration test |
| 2026-10-14 | `/api/parse` could send answers its own contract refuses (labels, summaries, lengths, subtask counts), and the client refused unknown keys | 12 (new) | yes: producers clamp to `PROPOSAL_LIMITS`, summaries name at most 5 items and then "+N", response schemas are loose | every `/api/parse` answer in `parse.int.test.ts` goes through `endpoints.parse.run.output`; fast-check properties over the rules, the model conversion with summaries, and `planActivity` against `parseEvent`; a client test with extra keys |
| 2026-10-14 | Attend after a run of the same title left open (yesterday's lecture, or the one just before back to back) silently did nothing, while Now kept offering it | 1 | yes: "is this occurrence attended already?" was answered in three places with three rules (`startCalendar`'s no-op by title against any open run, Now's `isTracked` from 10 minutes before, Day's `isStartedFor` from 15 and with the raw title, so a title over 80 characters never matched). One predicate now, `isCalendarRun` in @pace/client (label as stored by `activityLabel`, begun from `CALENDAR_LEAD_MINUTES` before the start until the end), read by all three; the 10 and 15 minute windows are one constant (Now now offers an event 15 minutes ahead, like Day and the Calendar button); Day's overlap check compares `activityLabel(title)` too | client tests: a stale open run from yesterday, back-to-back same-title events, a title over 80 characters; `isCalendarRun` unit tests; Day "reads logged" with a long title; Now prompt still offered over a stale run |
| 2026-10-14 | A past calendar event with a title over 80 characters could not be logged (`logPast` trimmed but did not cut, the payload refuses > 80) | 12 | yes: `logPast` and the Day sheet's rename cut through `activityLabel`, the one helper `startActivity` and `isCalendarRun` use | client test: a 100+ character title logs, stored as `activityLabel(title)` |
| 2026-10-14 | Day's row hairlines missing on the web (class names on a reanimated view are dropped there; found in screenshots before shipping) | 5 | yes (no other `Animated.View` carries a class name) | e2e reads the computed border of every Day row |
| 2026-10-14 | Strict output schemas: a field added to an answer breaks older clients | 13 | yes: `endpoint()` loosens every output; the cloud, notify and LLM status answers are also plain `z.object`, the calendar event split by direction; requests stay strict | output strictness sweep in `endpoints.test.ts`, extra-key parse test |
| 2026-10-14 | The notification answers (list, poll, live notices, push methods) were read with strict payloads and closed enums: a key, kind, resolution, push method or delivery result a newer server adds would have made an older app drop the whole feed | 13 | yes: every notification output goes through `endpoint()`'s `loosen` (records included now); the lists a server can grow (items, poll entries, delivery logs, push methods) drop unknown entries, an unknown resolution reads as `read`, the live notice is loosened. Left for their owners, listed in the Task 8 fix report: closed enums in other answers (cloud's device `kind`, sync's event `precision`/`source`) | `knownValues`/`knownValue`/`knownOrNull` tests, the sweep walks records, a client test reading a newer server's pool, the notify API tests read every answer through `endpoints.notifications.*.output` (`answerOf`) |
| 2026-10-14 | FCM's 401/403 marked push broken for everyone, forever: one device's `SENDER_ID_MISMATCH`, or an access token FCM stopped taking, was enough | 15 (new) | yes: FCM is the only place in the Worker that reads a provider's status (Telegram's and the LLMs' failures stay per message); the token endpoint's 400/401 is OAuth's `invalid_grant` and its mark now expires too | API tests with FCM's real error bodies: `SENDER_ID_MISMATCH`, `UNREGISTERED`, `INVALID_ARGUMENT` on `message.token` drop only the device; on `message.data` keep it; 401 then 200 sends with a fresh token; 401 twice marks broken, accepted again after an hour |
| 2026-10-14 | Day's Skip hid a calendar event on this phone only (Telegram and the web still asked), and Day kept asking about an event skipped or attended on another channel | 2 | yes: every Skip of an occurrence now goes through `notifications.skipEvent` (Now's prompt, Day's row; the feed, Telegram and phone buttons resolve the notification itself), and both Now and Day read `eventAnswers` from the pool. Also removed: Day's "answered" mark, written for the removed background check and read by nothing | Day tests: Skip calls `/api/calendar/skip` with the occurrence's key, an event skipped elsewhere is not shown, one attended elsewhere reads logged; Now's Skip test asserts the same call |
| 2026-10-14 | A phone notification's answer button took the notification away before the answer was saved: offline, signed out or refused, the answer was lost with nothing left to tap again | 3 | yes: both button paths (the background task, the open app's response listener) go through one `answerFromButton`: save, then dismiss; otherwise show it again under its id, led by "That did not go through. Try again." The feed's answer already kept the item open on a refusal; Telegram's message is edited only after the server resolved; mark-read is optimistic on purpose (nothing is lost) | push-task tests: a 503 and a signed-out phone keep the notification with the line (not added twice); app-state test: a refused answer re-shows it, a saved one dismisses it |
| 2026-10-14 | No way to pick how a phone shows notifications (the agreed Settings picker was not built), and Settings read the push method once on opening, so a change (registered again, the server's methods changed) never showed | 8 | yes: Settings offers the methods the server takes plus Off, the pick is stored and `registerPush` honours it, leaving it only when it cannot be used (not offered, a 409, no Google token) and keeping it for next time; the push state is one store (`pushStore`) that Settings and the live notices follow. No other Settings row reads phone state once on mount | registerPush tests (a pick of polling on a phone with Google, Off without asking the methods, a refused pick falls back and is used again later); Settings test walking Off → Pace checks → Google, the line following each transition |
| 2026-10-14 | The server's notification pool answered "attended already?" with its own rule (10 minutes early, the raw title): an event attended 11–15 minutes ahead was still announced, a title over 80 characters never matched; and the server's Attend wrote an unclamped label and an Expect over a day, which the log refuses, so Attend from Telegram or a phone failed | 1, 12 | yes: `isCalendarRun`, `activityLabel`, `activityExpect`, `CALENDAR_LEAD_MINUTES` and `calendarAttend` moved to core; the client re-exports them, `poolPass` and the server's Attend use them; no other server writer builds activity events | core boundary tests (−16, −15, −11, −10, 0 min; a title over 80), a fast-check property over title and event length whose written event must pass `parseEvent` and count as the run, a pool-pass test attended 12 minutes early, an API test attending a 200-character, 30-hour event from a notification |
| 2026-10-14 | The notification feed grouped its days in the account zone but printed times in the device zone: an item could sit under "yesterday" with today's time | 1 | yes: the feed's zone comes from `useFeed` (the device's, as every other time the app shows); the screen reads it from there | app test: account in New York, device in Moscow, the item under Moscow's day with Moscow's time |
| 2026-10-14 | The answers were restated in the app's button ids, the `Answer` type and the resolve endpoint's enum | 1 | yes: `ALL_ANSWERS`/`isAnswer` derive from `ANSWERS` in core; the type, the enum and the app read them | core test: the answers are exactly those `ANSWERS` has, each a resolution `canResolveAs` accepts |
| 2026-10-14 | A notification whose payload broke its kind's schema was stored and then could not be read back (`notify` threw, the row stayed); a digest's Telegram text and a phone's push body had no size limit (Telegram refuses over 4096, FCM data over 4 KB) | 12 | yes: `insertNotification` checks against `PAYLOAD_SCHEMAS` before storing (a `Result`); Telegram text and the phone body are cut to fit, by whole characters, with "…"; the poll queue stores the same cut body | API tests: an oversized sign-in is refused and nothing is sent; a digest of 60 long tasks fits one Telegram message and one push |
| 2026-10-14 | The pool marked work done before it was: a pass saved its memory before adding what it planned (a pass cut short lost those notifications for good), and an answer resolved its notification before writing its events | 3 | yes: the pass is remembered once everything is in the pool and notifications are found again by subject (Telegram once while pending, each device once); the answer writes, then resolves; the alarm drains the parse queue even when the pass fails | API test: a pass whose poll queue throws, run again, delivers the overrun exactly once; a third pass adds nothing |
| 2026-10-14 | `calendar.skip` recorded every skip as coming from the app, the web's included | 2 | yes: it takes `from` like `resolve`, and the client sends its own source | client test: the web feed's skip sends `from: "web"`; the app's Now and Day tests assert `from: "app"` |
| 2026-10-14 | Settings' notification channels were a `table` whose rows held switches directly (axe `aria-required-children`, critical, on the web); the feed's day lists held a heading and plain views instead of list items; its delivery lines were 4.18:1 in the light theme | 10, 5 | yes: each switch sits in a `cell`, a day's heading sits above its list and each notification is a `listitem`; the other `role="list"` containers were already axe-checked with items in their e2e; the delivery lines take the muted ink | app test: every switch's nearest role is `cell`; a new e2e (`notifications.e2e.ts`) runs axe on a filled feed and on Settings, light English and dark Russian, phone and desktop; route-sweep only ever saw the feed empty |
| 2026-10-14 | In Russian the channel column "Приложение" broke mid-word in its 56 px column, phone and desktop; the overrun line read "Вы всё ещё: …?" | 5 | yes: "Телефон"; "Всё ещё занимаетесь: …?" (Telegram and the feed); found in the review screenshots | the notifications e2e asserts each column header is one line (a run with the old label fails at 28 px) |
| 2026-10-14 | The live socket answered a device's close with the device's own code: a dropped connection (1006) made it close with a code no socket may send, an uncaught error in the Worker per dropped tab | 12 | yes: the only `close(` in the Worker | `replyCloseCode` test: 1005, 1006 and 1015 answer 1000, sendable codes are echoed |
| 2026-10-14 | Week's picked block marked with `accessibilityState.selected`: jest saw it, the web build did not (react-native-web emits no `aria-selected` on a button, and axe refuses it there) | 10 | yes (the only other `accessibilityState` is the time bar's `disabled`, left to its owner to check) | e2e asserts `aria-current` on the picked item and runs axe with it picked |
| 2026-10-14 | Day's block row held its task as a link inside the row's button: unreachable for a screen reader, `nested-interactive` and a 15 px target on the web | 14 (new) | yes: Day's task link is a line of its own under the row (24 px target); a one-off sweep of `controlsInsideControls()` over Now (something running), Day (a block on a task), Week, the task screen, Inbox, History, Insights, Projects and More found no other | `controlsInsideControls()` on Day (block on a task), Now (running row) and the time bar's Task picker; the time e2e runs axe on Day after Focus from the Task picker |
| 2026-10-14 | FCM offered on both sides but from different Firebase projects: every send `SENDER_ID_MISMATCH`, the phone dropped as gone, FCM registered again, no notification ever (owner) | 16 (new) | yes: the only other two-sided identity is the web login widget's bot (`EXPO_PUBLIC_TELEGRAM_BOT`) against the Worker's bot token; a mismatch there refuses the sign-in visibly (a bad signature), nothing loops silently. Found on the way: `knownOrNull` refused an answer whose key an older server does not send (class 13: an added answer field must read as absent, not fail) | API test: mismatch → the phone polls, the notification is queued for it, its token is refused for FCM, the next notification goes by polling only; `isRegistrable` with the app's project; app tests: another project → poll even when Google is picked, the same project registers with `projectId`, a refused token stays on polling start after start; Settings says why; `knownOrNull` missing-key test |
| 2026-10-14 | The close sheet offered "An hour ago" and "Yesterday evening" for a task made after them, and "At the deadline" for a deadline still ahead; a typed time ahead of now or before the task left Done enabled. Each was refused on press (`retro/before-created`, `retro/future`) | 1, 9 | found by the stage 8 sweep of class 1. Swept: every enabled-vs-refused pair — the composer (`canAdd`, already one predicate), the time bar's ▶ (`trim() !== ""` vs `activityLabel`: agree, now a property), the task edit sheet (title blank, the payload's only limit), project and preset forms and the bot/inbox capture (Save always enabled, the refusal shown inline: one decision), Day's activity sheet (its `notAhead` reads the viewer's minute clock, never later than the write's: it refuses at most what the write would, never lets through what it refuses), the OAuth dev identity (trim, as the server) | `taskInstantProblem` in core, read by `validateEventInput`'s rule, the pills (`quickTimes`) and the close sheet's typed time (the reason shown under it, Done disabled); a client fast-check property "every pill offered is accepted" over the task's age and deadline; app test for the typed time; a property "▶ enabled ⇒ `startTyped` accepts" |
| 2026-10-15 | Stage 8 sweep of class 9: every action that takes an instant from outside (an event, a notification, a pill, a typed time, a deadline) | 9 | yes: attending (Now, Day, the picker, the feed, a phone button, Telegram) already had properties around now; the close sheet's pills and typed time were the one instance (fixed under class 1: `taskInstantProblem`); logging a past block and a deadline take every instant they should (no instance), now as properties; Day's sheet checks "ahead" on the viewer's minute clock, never later than the write's | client fast-check properties: a block a day either side of now, to the second (accepted exactly when it is over, refused only as `retro/future`); a deadline a day either side; every close pill accepted (Moscow device zone) |
| 2026-10-15 | Stage 8 sweep of classes 11–15 in the code their tasks did not touch | 11, 12, 13, 14, 15 | yes. **11**: the only lists whose rows slide (`ROW_LAYOUT`) are `TaskRows` (Now, a project, its future and done) and Day's timeline, all inside `RowList`: none other. **12**: output limits equal the input limits they are stored from (calendar, usage, devices); the cloud API tests still read answers with a bare cast, now through the endpoints' output schemas; the auth, OAuth, sync and bot tests still do in places (follow-up). **13**: every closed enum in an output was listed: device `kind` and a pulled event's `precision`/`source` made tolerant (rows above); the parse answer's proposal kinds and categories stay closed for now because the producers' class 12 properties read through that same schema (dropping would hide a producer's bad output; follow-up: check producers against `ProposalSchema` itself, then read the list with `knownValues`); OAuth scopes stay closed on purpose (a consent must show every scope it grants); the resolve answer's notification kind is the one the client answered. Found on the way: `knownOrNull` refused an answer that lacks the key altogether (an older server), fixed with the FCM row. **14**: `controlsInsideControls()` now runs over Now, Day, Inbox, Settings, Week and the notifications feed: none. **15**: the Worker reads a provider's refusal only in FCM (Telegram and the LLMs fail per message; the OAuth token call's mark expires): one more fixed, a bare 404 read as a dead phone (Pool review row) | the cloud API tests read every answer through `endpoints.*.output` (`answerOf`); the nested-control check in `phone-controls.test.tsx` over the main screens |
| 2026-10-15 | Pool review: the Telegram copy was marked "taken back" when an answer came from Telegram (the message stays, edited); a 404 without `UNREGISTERED` dropped the phone; a reply close code outside 1000–1003, 1007–1014, 3000–4999 threw; a device on a broken method was logged "unavailable" once per pass; a refused Telegram button answer took the buttons away (class 3 row) | 1, 15, 12 | yes: `withdraw` was the only place marking deliveries taken back; FCM the only provider status read; `close(` the only socket close | notify, live and bot API tests for each (Telegram origin keeps the row standing; bare 404 and `NOT_FOUND` keep the phone; the close-code table; three passes log one row) |
| 2026-10-15 | Task 6 re-review: Day's "Open task" links all read "Open task" to a screen reader; Calendar's picker did not mark the event that runs, as Chores, Rest and Task do | 1 | yes: the running mark is now named too ("…, running") in every picker | Day test: the links named after their task; time-bar test: the running choice of each of the four pickers is checked and named, and only closes |
| 2026-10-15 | Pool review: transient Telegram and FCM sends became terminal; FCM dismissal was marked before delivery and its refusal ignored | 17, 3 | yes: swept both send transports and both dismissal transports; polling enqueue acknowledges only after its durable write, FCM returns its result; Telegram send and push delivery logs now drive one-minute retries, and unresolved push dismissals are retried by the pool alarm | notify API tests: Telegram and FCM fail then succeed at the next alarm without duplicate sends; FCM dismissal fails, remains pending, then succeeds on the next pass |
| 2026-10-15 | Pool re-review: a failed Telegram deletion left an actionable chat message forever; a failed send to a device that had unsubscribed kept a retry alarm running every minute | 17, 3 | yes: Telegram-origin answers mark the edited message as intentionally kept, while app-origin deletion failures stay pending; retry eligibility for push checks live subscriptions, which also excludes expired sessions | notify API tests: failed Telegram deletion retries once and stops after success; removal of the subscription clears the retry alarm |
| 2026-10-15 | Pool re-review: Telegram HTTP 400 deletion and FCM project mismatch dismissal were retried indefinitely | 18 | yes: Telegram deletion now distinguishes terminal 4xx from 429/network/5xx; FCM's unregistered, mismatch and credential-refusal outcomes are classified at the dismissal boundary, and terminal copies stay in the log with a reason but leave the retry queue | notify API tests: Telegram 400 and FCM `SENDER_ID_MISMATCH` stop after one dismissal attempt and the next alarm returns to the normal pool schedule; existing transient 500 tests still retry |
| 2026-10-15 | Push poll reused account A's cursor for B and lost B's pending notifications; phone usage upload reused A's cursor and skipped B's history | 19 (new) | yes: both secure-store progress markers now use one session-scoped helper; event sync already records the server store id and resets on mismatch; other `cursor` uses in the app are text caret positions | app tests switch A → B for push and usage, plus a legacy device-wide push cursor test |
| 2026-10-15 | Failed FCM send kept the alarm waking after the app channel was disabled; a resolved FCM copy did the same when transport was unconfigured | 18 | yes: retry eligibility reads the current channel; missing transport is marked unavailable on send and dismiss | notify API tests: both cases stop the one-minute alarm and retain the unavailable reason |
| 2026-10-15 | A previously sent Telegram copy kept a one-minute dismissal alarm forever after the bot transport was removed | 18 | yes: missing FCM and Telegram dismissal transports both leave a terminal unavailable reason without claiming the copy was removed; Telegram 4xx refusal remains a distinct terminal reason | notify API test: resolve with no Telegram transport, then run another pool pass and check the alarm and delivery log |
| 2026-10-15 | Week e2e navigated Day before the seeded UTC zone reached the app and skipped the target date | 20 (new) | yes: scenarios deriving dates from server settings must wait for those settings to apply | Week e2e waits for Settings `Account: UTC` before Day navigation |
| 2026-10-15 | A session could change between reading push cursor and sending poll, or while preparing a calendar upload; overlapping polls could apply a stale show after a later dismissal | 19 | yes: push, calendar and each usage batch compare the API client's current in-memory token immediately before calling it; poll rechecks before side effects, late shows are dismissed, usage cursor advances only after all batches, and polls for one session run in order | app tests hold cursor and calendar reads across A → B, hold an old response and a scheduling call, and overlap show then dismiss polls |
| 2026-10-15 | The signed-in app did not poll when auth used a memory session store because pollNow looked only in SecureStore | 19 | yes: push, calendar and usage capture the API client's current credential, with persisted cursors still scoped to that value; injected and secure auth stores now follow the same path | app-state signed-in push test plus platform A → B race tests |
| 2026-10-15 | History revoked an event on the first Undo press; Done on Now, Project and task detail had no immediate recovery | 21 (new) | yes: UI `actions.revoke` occurs in History confirmation or in Undo recovery toasts; device disconnect and OAuth grant revoke already confirm, preset archive and Day activity deletion already require a second action. Done paths now share `useCloseWithUndo` | History app test: first press does not revoke, Cancel leaves it intact, explicit confirmation revokes without a hotkey; Done app tests cover Undo recovery on row and task detail |
