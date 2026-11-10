# Review: Tasks 3.3, 3.4 and 3.5 (d2c6c4e..7d460d3, branch pr-b-local)

Scope: I read the diff file in passes. Outside it I checked only `ui/pressable(.web).tsx`, `ui/cx.ts`, the generated theme's size keys, the base commit's `AnimatedHeight` callers, a search for horizontal safe-area insets, and the plan's task list (to name owners). I re-ran no tests: the e2e results are the implementer's (49 passed on `7d460d3`).

## Spec compliance

### Task 3.3: Group, ListRow, SectionHeader
- ✅ Separators sit only between rows. None comes before the first row or after the last, and holes left by conditions are skipped (`group.tsx:44-61`; test `group.test.tsx:11-32`).
- ✅ The Group is `bg-cell rounded-lg`, has no border, keeps `collapsable={false}` through `RowList`, and insets its separators to the text start (`row`, or `icon` = 48).
- ✅ `selected` draws the leading bar. A tab row and a static row get `accessibilityState.selected`; a button row and a link row get `aria-current="page"`, as spec §4.3.1 asks for the inspector's row.
- ✅ `SectionHeader` is a heading of level 2 or 3, its text unchanged (no uppercase), in `subhead` secondary, 24 above and 8 below.
- ✅ Density classes `min-h-row lg:min-h-row-compact`, `px-row-x py-row-y lg:py-row-y-lg`, and `gap-row-gap`.
- ⚠️ What min-height Android actually gets. The row's class conflicts with the kit Pressable's `min-h-hit` (Important 1).
- ✅ `row-list.tsx` keeps `collapsable={false}` and only gains a note.

### Task 3.4: ScreenHeader and the shell
- ✅ `variant="top"`: `largeTitle`, `aria-level` 1, no eyebrow; the subtitle row sits under the title; `period` goes in that row.
- ✅ `variant="pushed"`: Back and `title1`, which wraps. `back-header.tsx` is deleted.
- ✅ `inspectorOpen=false` gives the content the full width with no empty pane (`shell-regions.tsx:28`; `week-wide.test.tsx`).
- ✅ Breakpoints at 600 and 1024 come from the tokens (`use-breakpoint.ts`; test at 599/600/1023/1024).
- ✅ Medium: the rail, no tab bar, no Back beside the rail. The inspector is not drawn, and Week uses its sheet.
- ✅ The portrait lock is removed (`app.config.ts:73`, plus a test).
- ⚠️ e2e title-y across eight destinations at 1440 and 390, the rail at 800, and the skip link. All are written; they pass per the report, not re-run by me.
- ❌ `ui/screen.web.tsx` ("the window scrolls on desktop") was not built (`screen.tsx:38-72`; concern 1, Important 7).
- ✅ `split-pane.tsx` is deleted, and Week's pane is now the Shell inspector.
- ❌ No motion when the inspector opens or closes. This is §6 "row → inspector", a structural change, and the reports do not list it (Important 4).

### Task 3.5: Presence and Disclosure
- ✅ `show=false` keeps the children until the exit animation's completion fires `onExited` (no timer), and a `show` during the exit cancels the let-go (`presence.tsx:58-75`).
- ✅ Reduced motion makes every preset opacity-only in `duration.sm` (`motion-presets.ts:33-52`). Scale never starts from 0.
- ✅ `Disclosure` sets `accessibilityState.expanded` / `aria-expanded` and has one chevron that turns 90°.
- ✅ The Disclosure height comes from measured content, and the content is hidden and untouchable while it closes.
- ⚠️ `onShown` (focus after layout, `preventScroll`) exists, but no caller uses it, so the focus move is untested end to end.
- ✅ e2e `expectDescendantsStayInside` covers the composer unfold and the preview (`geometry.ts:100-160`).
- ✅ `animated-height.tsx` is deleted. Its only caller at `d2c6c4e` was the composer, which I verified; the time bar fold never used it.
- ❌ (deliberate) The composer card no longer grows its height (§6 "height grows from the measured line height"), and spec §6 still says it does (concern 2, Important 6).

## Strengths
- Every kit file is built from tokens. The layout roles are named spacing keys (`LAYOUT_SPACING`), so the off-scale desktop values (10, 28) exist only as roles, and a test pins that numeric spacing still equals `space`. The ratchets only went down: 72 to 70 to 68, and 33 to 32, each with a dated plan line.
- `Presence` follows F-MOT-03: the exit lets go from reanimated's completion callback through `scheduleOnRN`, and a re-show cancels it through `isFinished`. The tests drive the completion by hand rather than with timers.
- `Disclosure`'s phase machine (gone, opening, shown, closing) is set during render, so open/close races are handled: reopening while it closes grows back to the last measured height.
- The 390 Jest default plus `withWindowWidth` remove a real silent mismatch: every test ran a 750 (`medium`) layout. It has a bug-lessons row (class 113).
- `expectDescendantsStayInside` is a stronger guard than the old single-child sampler, and it is reusable for any card that changes shape.
- The skip link was fixed at its cause (a real `<a href>`, waiting above the page whole), and its bug-lessons row names the e2e guard.
- `useDestinationLink` and `useNewTask` give the sidebar and the rail one source for the href, `aria-current`, the counted label and the N hotkey.

## Issues

### Critical
None.

### Important

**1. ListRow's min-height fights the Pressable's target on Android (3.3).** At `list-row.tsx:56-59` and `:200-204` with `pressable.tsx:16,25`, a pressed row's className is `min-h-hit min-w-hit shrink-0 … min-h-row lg:min-h-row-compact`. `cx` only joins strings (`cx.ts:2`), so two `min-height` utilities compete, and the stylesheet's order decides which wins, not the string. Either way the result is wrong:
- If `row` wins over `hit`, then `density="compact"` (`min-h-row-compact`, 44) and the regular row's `lg:` value on an Android tablet ≥ 1024 dp in landscape are both 44 dp, below the 48 dp target.
- If `hit` wins, a regular phone row is 48 instead of 52.

`lg:` keys on window width, so a native tablet gets the "desktop" density. **Fix:**
- Make the desktop density a web concern: a `list-row-density.web.ts`, or `min-h-row` on native and `min-h-row lg:min-h-row-compact` on the web.
- On native, compact must resolve to at least `size.hit`.
- Add a test that renders on Android (`Platform.OS` replaced) and asserts the className holds exactly one min-height utility.

**2. The rail does not fit a short `medium` window, and nothing scrolls it (3.4).** The rail in `nav-rail.tsx:58-82` stacks New task (48 + 12) and eight links of about 60 each (32 pill + caption + `py-1`, with `gap-2`), about 640 px in all, in a plain `View`. Removing the portrait lock puts a phone in landscape (about 844 × 360–410 dp) in `medium`, so Insights, History and Settings fall below the window and cannot be reached. RU captions that wrap to two lines make it worse. A 900 × 500 browser window hits the same. **Fix:**
- Make the rail's destinations a `ScrollView`, or drop to icon-only items or a menu below a height budget.
- Add an e2e at 844 × 390 that asserts every rail link is in the viewport or reachable by scrolling.
- Add rotation to the spec §11 "Verify on hardware" list for this batch.

**3. Horizontal safe-area insets are ignored now that the app rotates (3.4).** No file uses `insets.left` or `insets.right` (searched `src`, `app`). `Screen` pads only `insets.top` (`screen.tsx:44`), and the rail, the sidebar and the tab bar pad nothing horizontally. On an edge-to-edge Android phone in landscape, the display cutout and the gesture area cover the rail's leading edge or the content's trailing edge. This is a new state the task created. **Fix:** pad the shell's leading region (the rail) with `insets.left` and the content's trailing edge with `insets.right`. Put it on the batch's hardware list (plan line 55: insets are never claimed verified from the web build).

**4. The inspector opens and closes without motion, and it is not listed as unbuilt (3.4).** In `shell-regions.tsx:28-37` and `week-screen.tsx:209-216` the pane appears and disappears in one frame. Spec §6 "row → inspector (desktop)" asks for a 16 px slide plus fade from collapsed (220/160), and the global constraint says a structural change animates. Week also passes `inspector={undefined}` when nothing is picked, so an exit could never keep its content. **Fix:** either build it now (`Presence` around the region, with the Shell keeping the last inspector content through the exit), or record it as unbuilt with a named owner. Plan Task 5.3 owns the §6 overlay rows, so add "row → inspector" there; Task 4.5 adds the task inspector.

**5. Disclosure's close starts from a stale height: a clipped first frame, which is bug class 5 (3.5).** After the grow, the `height` shared value stays at the height measured then (`disclosure.tsx:62-64`). While the fold is `shown` the style is unclamped, so a later size change only updates `measuredRef` (`:142-150`). When it closes, `startShrink` animates from the old shared value (`:75`) and `isClamped` turns the clamp on in the same frame (`:136`). Suppose «Готово · 11» was open and a check-off elsewhere added a row: the content is cut by one row at full opacity, then shrinks. If the content got shorter, the box jumps open by a gap instead. This is the class the task exists to remove. **Fix:**
- In `startShrink` (not reduced), start from the current measure: `height.set(measured)` and then `withTiming(0, …)`, or `withSequence(withTiming(measured, {duration: 0}), withTiming(0, …))`.
- Alternatively, keep `height` in step from `onLayout` while `shown`.
- Add a jest case: open, fire a layout of 120, finish, fire a layout of 160, close, and assert the first value of the close animation is 160.

**6. Spec §6 and §4.2.1 still describe a composer height grow that is no longer built (3.5).** The built note in §4.1.1 `Presence` says the card takes its height in the swap frame. The §6 row "composer unfold" still says "height grows from the measured line height, content fades in after 60 ms", and §4.2.1 says "grows from the swap frame on ease-out". The spec now contradicts itself, and the next implementer or the motion review (plan Task 5.3) will rebuild the grow. **Fix:** amend the §6 row and §4.2.1 with a dated decision (built behaviour, reason, the alternative below and its owner). See the ruling on concern 2.

**7. The desktop window scroll was not built and has no named owner (3.4, concern 1).** The brief names `screen.web.tsx` with the window scrolling, and spec §4.2.18 and §5.0.1 say "the window scrolls". The region scroller delivers F-WEB-05's visible goals: the scrollbar at the region edge, and the wheel works over the gutters. What it does not deliver:
- the document scroll, which brings the browser's own scroll restoration, Space/PageDown from `body`, find-in-page and anchor scrolling, and `overscroll-behavior` on `html` (Task 6.2's e2e asserts that on `html`);
- the left-anchored x = 280 and the 720 list column.

The spec note says only "left to the screen tasks". **Fix:**
- Accept the deviation for this gate.
- Add a dated plan line naming the owner. Task 6.2, which owns `global.css`, the `html` overscroll and the scrollbars, is the natural home for `screen.web.tsx` and the `body` overflow. x = 280 and 720 go to Task 4.3 and the screen tasks.
- Add an e2e in `layout.e2e.ts` for what was built: at 1440, a wheel over the right gutter scrolls a long screen such as Settings.

### Minor

1. **No `main` landmark or skip link on the phone web (3.4).** `shell.web.tsx:51` makes `isTopLevel = navigation !== undefined`, and `_layout.tsx` gives the Shell no navigation on `compact`, so the phone web has neither. Spec §4.2.18 does not limit them by width. **Fix:** a separate `isRoot` prop. The owner is plan Task 6.1 ("one `main` landmark and a skip link").
2. **A static selected ListRow says nothing on the web (3.3).** At `list-row.tsx:171`, `accessibilityState` is not read by react-native-web (`pressable-props.ts` says so itself), and `aria-selected` on a div with no role is invalid ARIA. No caller uses it yet. **Fix:** `aria-current="true"` on the web, or forbid `selected` without a press in the type.
3. **The top bar has a fixed height (3.4).** `screen-header.tsx:67` uses `h-hit`, while text-yield rule 3 (F-AND-05) says nothing has a fixed height. A labelled action such as Notifications' "Assistant log" at 200 % font scale overflows the bar. **Fix:** use `min-h-hit`.
4. **The medium gutter is 16, not 24 (3.4).** In `screen-header.tsx:131`, `px-gutter lg:px-gutter-lg` gives 16 on a tablet, while spec §5.0.1 says medium has gutter 24 (`gutter-pane` exists). **Fix:** add `md:px-gutter-pane`, or leave it to the screen tasks with a note.
5. **The preview's Presence differs from §6 (3.5).** At `composer.tsx:70`, `enter` defaults to `fade` with no 4 px rise, and since the Presence sits inside the `pending !== null` condition, the exit never runs. §6 "assistant preview appears" asks for fade plus 4 px rise, 160/110, and a fade exit. **Fix:** move the condition inside (`show={pending !== null}`) and keep the last actions through the exit. Owner: Task 4.3 or 5.3.
6. **The fold trigger changed visibly without shots (3.5).** `task-list.tsx` dropped the `border-t border-separator` hairline above the trigger, and the inset moved from 20 to 32 (`mx-gutter px-row-x`, `disclosure.tsx:197`). This needs to go into the batch's re-shoot.
7. **The close easing differs from §6 (3.5).** Disclosure closes on `easing.exit` (`disclosure.tsx:74-77`), while the §6 disclosure row says `move` for both directions. The built note records it; either amend the §6 row or use `move`.
8. **`expanded` is accepted on any role (3.5).** `pressable-props.ts:61` lets any role take `expanded`, unlike the role gating of `selected` and `checked`. ARIA does not allow `aria-expanded` on radio or switch. **Fix:** an `ExpandableRole` constraint in the same shape.
9. **A composer e2e assertion is now vacuous (3.5).** At `composer.e2e.ts:226-232` the sampler's "container" is the card, which no longer scrolls, so `scroll` is always 0. **Fix:** drop that assertion, or point it at the nearest scroll container.
10. **A test name promises more than it checks (3.3).** `list-row.test.tsx:81` is titled "bar, selected state and aria-current" but asserts no selected state. **Fix:** rename it.
11. **`count` and `action` can both be passed (3.3).** `SectionHeader` (`section-header.tsx:24-27`) documents them as exclusive, but the type allows both. **Fix:** a discriminated union.
12. **Back sits 2 px off the gutter on the web (3.4).** At `screen-header.tsx:52`, `-ml-3` (12) centres a 24 glyph on the gutter in a 48 target. With the web's 44 target the glyph lands 2 px left of the gutter. **Fix:** a web class or `.web` value of `-ml-2.5`, if the scale allows it, or accept.
13. **The report names the wrong owner for the time bar fold (3.5).** The 3.5 report calls it "Task 4.3.7", which is a spec section. The plan task is **Task 4.2** (Running card, time bar, pickers).

## Rulings on the implementer's concerns

**1. Desktop window scroll: accept as a recorded deviation, but not silently.** The region scroller is a reasonable intermediate step and does no harm. The brief's requirement still stands, so the gate needs a dated plan line naming the owner (Task 6.2) and an e2e for the built behaviour (Important 7).

**2. The composer height: the implementer is right for now, but the spec must be changed.** "No box leaves the card in any frame" (§4.2.1 worst case, F-MOT-08, bug-lessons 5) and the QA 22 carry-over (the half-hidden Approve) are correctness. "Height grows" is polish. A clipped frame is the bug that has already shipped twice. To get both, an animated height with no visible clipping:
- Grow the card's height (the clip box) from the old measured height to the new one in about 160 ms on `easing.enter`, while the new content is laid out at its natural height inside it at opacity 0.
- Fade the content in (about 120 ms) only once the grow completes, through the completion callback, not a timer: 280 ms in all, within the 300 ms cap.
- The preview's own Presence starts, and is announced, after the card's grow, so Approve is whole when it becomes visible or pressable.
- The reverse is fade out (110), then shrink (160).
- The content below slides with the card instead of jumping.
- `expectDescendantsStayInside` must then count only boxes with an effective opacity above 0 (walking the ancestors' computed opacity), or the clip box's `scrollTop` and visible boxes.

Owner: Task 4.3 (Now) or 5.3. Until then, amend §6 and §4.2.1 (Important 6).

**3. The relaxed overlays toast check is a legitimate spec alignment, not a weakened test.** Spec §4.1.4 rule 3 says verbatim: "while it shows, the scroll content's bottom inset grows by its height, so the next row can always be scrolled out from under it", and chrome is never overlapped. `stuckUnderToast` checks exactly that:
- covered controls that do not leave after a wheel scroll of the toast's height plus 120 fail;
- chrome does not scroll, so a covered chrome control still fails;
- a missing bottom inset still fails;
- if the wheel does nothing, the control stays covered and the test fails, so it cannot pass vacuously.

Two caveats, neither blocking:
- The wheel is moved to x = 8. At 1440 that is over the sidebar, which makes the check stricter there, not weaker.
- Identity is the accessible name, so two controls with the same name can mask each other.

Good, but optional: assert the scroller's `scrollTop` changed.

**4. Callers not migrated and unbuilt variants are acceptable.** Task 3.3's brief asks for no migration, and 3.4 and 3.5 migrated what their briefs name. Owners from the plan:

| Item | Owner |
|---|---|
| `ListRow` toggle and select rows | Task 3.9 (Switch, radio). The report says "3.8/3.9", but 3.8 is TextField. |
| Sidebar rows on `ListRow` or `NavItem`; rail haptics | Task 3.10 |
| `SectionHeader collapsible`, TaskRow on ListRow, task folds | Task 4.1 |
| Time bar fold | Task 4.2 (not "4.3.7") |
| Now's split and inspector; "Show all" toggles | Task 4.3 (Inbox's: Task 4.7) |
| Medium inspector sheet for Now and Inbox | Tasks 4.3 and 4.7 |
| Notifications as a top-level screen on desktop | Task 4.10 |
| `PeriodStepper` | The screen tasks that use it: Day (4.4), Week (4.6), Insights (4.9), History (4.10) |
| Header scroll-edge fill (F-LAY-13) | No plan task names it: add it to Task 5.3 or 3.10 with a dated line |
| Inspector motion | Task 5.3 (Important 4) |
| Window scroll | Task 6.2 (Important 7) |
| Phone-web `main` and skip link | Task 6.1 |

**5. The unreviewed visual changes are spec-mandated and not regressions, but they must be shot before the PR.**
- The phone's 48 top bar above every top-level title is spec §5.0.2: "a 48 top bar … largeTitle below it at header.top 8". It exists so the title sits at one y. On Inbox and More it is empty by design.
- History as a destination is §4.2.16, "History and Notifications use destination".
- The rail is §5.0.1.

None blocks this task gate. The batch-end steps (plan lines 117–121: the matrix re-shoot including 800 wide, `impeccable polish`, `apple-design`) must cover all three, plus the fold trigger's look (Minor 6). Ask the owner explicitly about the empty band on Inbox and More, which is the most likely to read as a bug.

**6. Deviations:**
- **The 4 px selected bar: accept.** 3 px is off the 4-pt scale, and the spec now records it. Use the same 4 px in the sidebar (Task 3.10) for one bar everywhere.
- **ListRow roles limited to button and tab: accept.** A select row is a radio by the spec ("select (radio, trailing check)"), and it comes with Task 3.9.
- **The Pressable `expanded` prop: accept.** It is the right home for `aria-expanded` and is tested on both platforms. Role-gate it (Minor 8).
- **The 390 Jest default window: accept.** It is a fix: tests had silently run a `medium` layout. It has a bug-lessons row.

## Assessment
- **Task 3.3: Needs fixes.** Important 1 (the min-height conflict and 44 dp rows on Android). The rest is minor.
- **Task 3.4: Needs fixes.** Important 2 and 3 are real bugs that rotation introduced. Important 4 and 7 need a named owner and a dated plan line (and, for 7, an e2e for what was built).
- **Task 3.5: Needs fixes (small).** Important 5 (a class-5 clipped frame on close, a two-line fix with a test) and Important 6 (amend spec §6 and §4.2.1 for the composer decision).
