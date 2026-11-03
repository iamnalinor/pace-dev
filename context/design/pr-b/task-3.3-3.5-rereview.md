# Re-review: Tasks 3.3, 3.4, 3.5 fix round 1 (7d460d3..981ca53, branch pr-b-local)

Read-only. I read the diff and the files at 981ca53. I re-ran no tests.

## Important
1. ListRow min-height (3.3): ADDRESSED. The Frame is now only "relative flex-row"; the density is on an inner box (list-row-box) from ROW_BOX. Native: regular = min-h-row (52), compact = no minimum, so the Pressable's min-h-hit (48) is the only floor. No lg: and no class order on native. The 44 density is in list-row-density.web.ts, and the web Pressable's min-h-hit-web is 44, so compact 44 is not below it. Android is at least 48 for every pressed row at every density and width. Tests assert exactly one min-height on the control on android and the box classes.
2. Rail on short windows (3.4): ADDRESSED. The destinations sit in a ScrollView under New task, with the bottom padding moved into its content container. There is a jest check and an e2e at 844x390 (scrollIntoView, in viewport whole, last link opens /settings).
3. Side insets (3.4): ADDRESSED. useShellInsets pads left and right on the outer frame of both Shell and Shell.web, tested with insets 30/20. Hardware item 13a is in spec §11.
4. Inspector motion (3.4): ADDRESSED (built). Presence with the new slide preset (translateX 16, 220/160, fade only when reduced). `kept` holds the last content through the exit, and onExited clears it. Once the exit has finished Presence returns null, so nothing is left to block input (the test checks the label and text are gone). If the window stops being wide mid-exit the pane returns null at once.
5. Disclosure close (3.5): ADDRESSED. startShrink runs withSequence(withTiming(measured, {duration: 0}), withTiming(0, ...)), where measured is measuredRef.current, updated on every layout. The jest case grows 120 to 160 and asserts the 0 ms step to 160 and then 160 to 0. See new issue N2.
6. Composer spec (3.5): ADDRESSED. §6 composer row and §4.2.1 Motion carry a dated decision (2026-11-03), the reason, the alternative and its owner (Task 4.3, pointer in plan 4.3).
7. Window scroll (3.4): ADDRESSED. Dated plan line in Task 6.2 (screen.web.tsx, body overflow, restoration, find-in-page, html overscroll), x=280 and 720 in 4.3, and a new e2e (wheel over the right gutter at 1440 scrolls Settings).

## Owner table
Addressed: dated pointers in plan 3.9, 3.10 (including the F-LAY-13 scroll-edge fill, which had no owner), 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.9, 4.10, 5.3, 6.1, 6.2. Nit: the 3.10 line sits after the "---" rule that closes the task, not inside the task's list (see N3).

## Minors
1 (phone-web main and skip link): deferred to Task 6.1 with a pointer. Accepted.
2 (static selected row on the web): addressed, aria-current added.
3 (h-hit to min-h-hit on the top bar): addressed.
4 (medium gutter 24): addressed, md:px-gutter-pane.
5 (preview Presence): addressed. lift preset (4 px, 160/110), fade exit, kept actions, pointerEvents none while it goes. No jest case for the exit (the implementer says so).
6 (fold hairline): addressed, tested; the re-shoot is left to the batch matrix.
7 (close easing): addressed by amending §6 to say the close leaves on easing.exit.
8 (expanded role gating): addressed in the type and at runtime.
9 (vacuous composer e2e): addressed, the sampler reads the nearest scrolling ancestor.
10 (test name): addressed.
11 (count XOR action): addressed (discriminated union).
12 (Back 2 px): accepted, owner 3.10/5.3.
13 (4.3.7 owner): fixed in the plan (Task 4.2). NOT fixed in the spec, see N3.

## New issues
- N1 (Minor): on native, a static (not pressed) compact ListRow has no minimum height now. It is below 48, but it is not a touch target, and a static regular row keeps 52. No action needed; mention it in the kit note if wanted.
- N2 (Minor, unverified): the 0 ms withTiming step starts on reanimated's next frame, so the first close frame could still read the old height. Setting `height.set(measured)` before starting the sequence removes the doubt. The jest mock cannot tell the difference. Confirm in the 390 shots or with a frame sampler in e2e.
- N3 (Minor, docs): the spec's Disclosure row still says "Task 4.3.7 merges time-bar-fold.tsx" (should be Task 4.2); the ListRow row still says "Task 3.8/3.9" (3.9 only); the ScreenHeader row still says `h-hit`, `-ml-3` and `px-gutter lg:px-gutter-lg` (now min-h-hit and md:px-gutter-pane). The Disclosure "Built" note does not mention the close from the current measure. The 3.10 plan bullet is after the "---" rule. The bug-lessons row for Important 5 gives "Presence animates no height" as the sweep, which is the wrong evidence for a Disclosure bug (it should say that no other animated height exists).
- N4 (Minor): the inspector's pane stays interactive during its 160 ms exit (Presence takes no pointerEvents guard there, unlike the preview). It cannot block input after it closes. A pointerEvents="none" while !isShown would match the preview.

## Verdict
- Task 3.3: Approved (Important 1 fixed; remaining items are Minor).
- Task 3.4: Approved (Important 2, 3, 4, 7 fixed; N3 and N4 are cosmetic or doc).
- Task 3.5: Approved with minor follow-up (Important 5 and 6 fixed; N2 to be confirmed in a frame check, N3 doc edits).
