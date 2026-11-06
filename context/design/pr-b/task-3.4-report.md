# Task 3.4 report: `ScreenHeader` and the shell

**Status:** DONE, with concerns. Branch `pr-b-local` in `/home/user/pace-dev-b`. Not pushed.

**Commits:**
- first `ebc4881`, then `2c2e3a1` (docs);
- the e2e fix `7d460d3`, which comes after Task 3.5's commits. **Last: `7d460d3`.**

## What was built
- **Breakpoints.**
  - `ui/use-breakpoint.ts`: `breakpointOf(width)` and `useBreakpoint()`, giving `compact` below 600, `medium` from 600 to 1023 and `expanded` from 1024. The thresholds come from `layout.breakpoint`.
  - `ui/layout.ts`: `useIsWide()` now means `expanded`. The unused `WIDE_MIN_WIDTH` was removed.
- **The shell.**
  - `ui/shell.tsx`, `ui/shell.web.tsx` and `ui/shell-regions.tsx` give `<Shell navigation content inspector inspectorOpen inspectorLabel>`.
  - The inspector (`w-inspector`, min 360, max 480, a `border-l` separator, a labelled `region`) is drawn only on `expanded`, and only while `inspectorOpen`.
  - On the web, the shell that carries the navigation also:
    - makes the content `main` (`nativeID` `pace-main`, `tabIndex -1`);
    - puts a skip link first: "Skip to content", `<a href="#pace-main">`. Its press keeps the address and focuses `main` with `preventScroll`. Until it is focused it sits translated above the page (`global.css` `[data-skip-link]`).
  - The i18n key `nav.skipToContent` was added in EN and RU.
- **Navigation.**
  - `ui/navigation.tsx` picks the Sidebar on `expanded`, `NavRail` on `medium`, and nothing on `compact`.
  - `ui/nav-rail.tsx` is 80 wide (`w-rail`):
    - New task at the top: a 48 tonal button with a `bar` plus icon.
    - The eight destinations as kit Links, each an icon over a `caption` (`chrome`). The current one sits on a 64×32 `fill.3` pill with `aria-current`. Inbox shows its count badge.
  - `sidebar.tsx` now exports:
    - `DESTINATIONS`;
    - `useNewTask`, the New task press together with its N hotkey;
    - `useDestinationLink`, the `href`, `aria-current` and counted label shared with the rail.
  - The root `app/_layout.tsx` renders `<Shell content={Stack} navigation={<Navigation/>}>` beside every signed-in screen that is not bare, when the window is not compact.
  - The tab bar shows only on `compact`. The tabs' position is `left` otherwise.
  - `useBack()` returns no Back for a sidebar path when not compact, so screens next to the rail have no Back.
- **Rotation.** The portrait lock is gone: `orientation: "default"`, with an `app.config.test.ts` case for it (red first).
- **`ui/screen-header.tsx`, rewritten.** `<ScreenHeader variant="top|pushed" title subtitle period actions context onBack backLabel backIcon>`:
  - **top, on a phone or a tablet:** a 48 bar (`h-hit`) holding Back (when the screen is pushed from More) and the actions, then the `largeTitle` 8 below it (`mt-header-top`).
  - **top, on a desktop:** no bar; `pt-header-top-lg` (28), with the actions on the title's line.
  - **the subtitle row** (`min-h-6`): a `callout` `secondary` subtitle, then the `period` slot.
  - **pushed:** the 48 bar (Back, `context`, actions), then `title1`, which wraps.
  - Every title is `aria-level` 1. There is no eyebrow.
  - Back is the kit Pressable with a borderless ripple, a `bar` icon, its tooltip, and `-ml-3`.
- **Callers migrated.**
  - Now and Day: date as `subtitle`; DayNav goes in `period`.
  - Week and Insights: range as `subtitle`; WeekNav goes in `period`.
  - Inbox and More: `top`.
  - `DestinationScreen` and `PushedScreen` now share `screens/headed-screen.tsx`. History is a destination now.
  - The task header: `pushed`, with the project chip as `context` and no title.
  - `back-header.tsx` is deleted.
- **SplitPane → inspector.** `split-pane.tsx` is deleted. Week's wide pane is now the Shell's inspector and collapses while nothing is picked (F-LAY-03). The `week.pickHint` string and the empty branch of `PickedPane` went with it, and `week-wide.test.tsx` was updated to match. Now's own split (`NowSplit`, with its "pick a task" pane) is not migrated: it moves with Now's screen task.
- **`ui/screen.tsx`.** The header, the body and the footer each keep to the column (`max-w-content-wide self-center`), but the scroller spans the content region. Its scrollbar sits at the region edge, and the wheel scrolls over the gutters too.
- **Tests and harness.**
  - `jest.setup.ts` gives every test a 390×844 window. React Native's default of 750 would be `medium`.
  - `src/test/window.ts` adds `withWindowWidth(n)`.
- **e2e.** `e2e/layout.e2e.ts` checks:
  - the title y over Now, Day, Week, Inbox, Projects, Insights, History and Settings, within 1 px, at 1440 and at 390;
  - that 800 has the rail and no tab bar, and that Projects next to the rail has no Back;
  - the skip link: Tab, then Enter, puts focus in `main`.
  - In `overlays.e2e.ts`, the toast check now holds spec §4.1.4 rule 3. A covered list control must scroll out from under the toast; chrome must never be covered (`stuckUnderToast`).
- **Gallery.** `HeaderSections`: a top header with a subtitle and two actions, and a pushed header whose title is the set's longest project name. It wraps and is never cut (test included). EN and RU `dev.gallery.headers.*` keys were added.
- **Ratchets.** `DESIGN_VALUE_WARNINGS` went from 72 to **70**: the two `active:opacity-70` back buttons are gone. Bare pressables stay at 33 and kit primitives at 10. The plan's baseline line was added.
- **Docs.**
  - Spec: built notes for ScreenHeader, Shell, Screen and split-pane.
  - Bug-lessons rows:
    - F-LAY-02/03, class 122;
    - the Jest default window being `medium`, class 113;
    - the skip link, class 113.

## Plan follow-ups covered
- QA R22-13 (titles differ): one header and the `layout.e2e.ts` title-y check.
- R22-12 (Task 3.4's part): Back lives in the top bar, and the period chevrons in the subtitle row, so they are never neighbours. PeriodStepper itself is Task 4.x.

## Tests
- `bun lint`: green.
- `bun test:unit`: green.
- `bun test:app`: green. New suites:
  - `use-breakpoint.test.ts` (8)
  - `shell.test.tsx` (6)
  - `shell.web.test.tsx` (2)
  - `screen-header.test.tsx` (9)
- **e2e, first run** (ports were free):
  - `layout.e2e.ts`: the title-y checks at 1440 and 390 and the tablet rail **passed**. The skip link **failed**, which is a real bug (fixed in `7d460d3`).
  - `worst-case.e2e.ts`: **failed** on the 1 px skip link (fixed).
  - `overlays.e2e.ts`: **failed**. The tooltip covered the skip link (fixed). The toast covered Settings' activity-check switches at 390, because the 48 bar moved them down; the check was aligned with spec rule 3.
  - Composer, week, link and the rest of overlays: **passed**.
- **After the fix:** `layout.e2e.ts` alone passed (4/4).
- **The confirming run is invalid.** Another agent's Playwright run (in `/home/user/pace-dev`) took ports 8787 and 4173 in the middle of it (`EADDRINUSE` in the log), so my tests ran against its server and build. The ports are still taken, so I did not rerun.

## e2e confirmation (after `7d460d3`, ports free, no EADDRINUSE in the log)
`bunx playwright test` on `overlays`, `worst-case`, `layout`, `composer`, `link` and `week`, plus `route-sweep` filtered to "every screen on … phone|desktop", with axe: **49 passed (7.9 m)**. This supersedes concern 1 below.

## Concerns
1. **(Resolved: see "e2e confirmation" above.)** e2e after `7d460d3` was not confirmed at first. Still to run:
   - `overlays.e2e.ts` (the new toast rule; the tooltip);
   - `worst-case.e2e.ts`;
   - `layout.e2e.ts`;
   - the route sweep's "every screen on …" set.

   Run them when 8787 and 4173 are free.
2. **The window does not scroll on desktop yet.** The brief asks for a `screen.web.tsx` in which the window scrolls. I did not build it: the document scroller needs `body` to stop being `overflow: hidden` (in the generated `index.html`), and the stack's scenes and the fixed footer would have to move with it. That is too wide a change for this kit task. Instead the scroller spans the content region, which gives F-WEB-05's scrollbar at the edge and the wheel over the gutters. Also not built: the left-anchored x = 280 and the 720 list column. These are noted in the spec as left to the screen tasks.
3. **Things not built:**
   - the header's scroll-edge fill;
   - Now's inspector (its screen task);
   - the medium inspector as a sheet (Week already uses a sheet whenever the window is not wide);
   - rail haptics.
4. **Visual changes not shot.**
   - The phone's top-level screens gain a 48 bar above the title. Today it is empty on Inbox and More.
   - History is now a large-title destination.
   - The tablet layout (the rail) is new.

   The design-shots matrix has not been taken.
5. **No code review** through `superpowers:requesting-code-review` yet, as instructed: no subagents.

## Fix round 1 (review `task-3.3-3.5-review.md`; covers Tasks 3.3, 3.4 and 3.5)

**Status:** DONE. Tip **`981ca53`** (on `7d460d3`), not pushed. Commits:
- `d19bc93` kit fixes;
- `85239fe` shell, header and composer;
- `981ca53` docs.

All fixes went test-first. Each new test was seen to fail first, except where noted below.

### Important
1. **ListRow on Android (3.3).**
   - The row's density now sits on an inner box (`list-row-box`). The kit Pressable's `min-h-hit` is the control's only minimum height, so the order of classes in the stylesheet no longer decides it.
   - On native (`list-row-density.ts`): a regular row's box is `min-h-row` (52); a compact row has no minimum of its own and takes the 48 dp target.
   - The 44 desktop density is web-only (`list-row-density.web.ts`: `min-h-row lg:min-h-row-compact`, compact `min-h-row-compact`).
   - Tests: with `Platform.OS` set to android, the control holds exactly one min-height class (`min-h-hit`) and the box holds `min-h-row` or nothing, with no `lg:`. A second test checks the web module's classes.
2. **The rail on short windows (3.4).**
   - The destinations sit in a `ScrollView` under New task (`nav-rail-scroll`). jest checks that all eight links are inside it.
   - New e2e in `layout.e2e.ts` at 844 × 390: each rail link scrolls into view, whole, and the last one opens `/settings`.
3. **Side safe-area insets (3.4).**
   - The Shell, native and web, pads `insets.left` and `insets.right` on its outer frame (`useShellInsets`). This keeps both the navigation and the content clear of the display cutout.
   - Tested in `shell-motion.test.tsx`, with the insets mocked to 30 / 20.
   - Spec §11 gained item 13a for rotation (the rail scrolls, the insets hold, a compact row stays ≥ 48 dp). **For the PR's verify-on-hardware list (controller):** rotation on a phone in landscape: the rail scrolls to Settings at about 844 × 390; the cutout and the gesture area clear the rail and the content; a compact ListRow is ≥ 48 dp.
4. **Inspector motion (3.4), built.**
   - The Shell's inspector is now a `Presence` using a new `slide` preset: 16 px from the trailing edge plus a fade, 220 in / 160 out, and a fade only with reduced motion.
   - The inspector keeps the content it last showed through the exit. Week can therefore pass `undefined` the moment nothing is picked.
   - Test: `shell-motion.test.tsx` checks that the content stays until the exit's completion fires.
   - Task 5.3 has a pointer to review the content cross-fade when the pane is already open.
5. **Disclosure close (3.5).** The close's height runs `withSequence`: first a 0 ms step to the current measure, then 0 in the exit time. Jest case: open; layout 120; finish; layout 160; close. The first close step is asserted to go to 160, followed by `{duration: 160, to: 0}`. It went red against the old code.
6. **Composer decision (3.5).** Spec §6 "composer unfold" and §4.2.1 Motion now carry a dated decision (2026-11-03): no height grow for now. The note gives the reason (a clipped frame, bug-lessons 5) and the reviewer's grow-then-fade alternative, owned by Task 4.3. Task 4.3's plan section has the pointer.
7. **Window scroll (3.4).**
   - Task 6.2's plan section has a dated pointer: `screen.web.tsx`, `body` overflow, scroll restoration, find-in-page, and `overscroll-behavior` on `html`.
   - New e2e in `layout.e2e.ts`: at 1440, the wheel over the right gutter scrolls Settings.
   - x = 280 and the 720 column go to Task 4.3.

### Owner table
Each named plan task got a one-line dated pointer:
- 3.9: toggle and select rows.
- 3.10: sidebar on ListRow/NavItem with the 4 px bar, and rail haptics. **The header scroll-edge fill (F-LAY-13), which had no owner, is placed here.**
- 4.1: SectionHeader collapsible, TaskRow, folds.
- 4.2: the time bar fold.
- 4.3: Now's inspector and medium sheet, x = 280 / 720, Show all, the composer grow.
- 4.4, 4.6, 4.9: PeriodStepper.
- 4.7: Inbox's inspector and sheet, Show all.
- 4.10: Notifications as a desktop destination, History's PeriodStepper.
- 5.3: the inspector and disclosure motion review.
- 6.1: phone-web `main` and skip link.
- 6.2: window scroll.

### Minors fixed
- 2: a static selected row also says `aria-current` (web).
- 3: the top bar is `min-h-hit`.
- 4: the tablet gutter is 24 (`md:px-gutter-pane`).
- 5: the preview lifts 4 px in (new `lift` preset, 160/110) and fades out, keeping what it showed and ignoring touches while it goes (`show={pending !== null}`, last actions kept).
- 6: the fold's hairline above the trigger is back (`fold-hairline`, tested in `now-screen.test.tsx`).
- 7: the close easing. Spec §6's disclosure row now says the close leaves on `easing.exit`.
- 8: `expanded` is typed and emitted only for button, combobox, link, menuitem and tab (`@ts-expect-error` on switch; a radio gets none at runtime).
- 9: the unfold sampler's scroll check now reads the nearest scrolling ancestor, not the card.
- 10: test name.
- 11: `SectionHeader` takes a count or an action, never both (a discriminated union, `@ts-expect-error` test).
- 13: the corrected owner. The time bar fold belongs to **Task 4.2**, not "4.3.7".

### Minors left, with owners
- 1: phone-web `main` landmark and skip link → Task 6.1 (pointer added).
- 12: Back sits 2 px off the gutter on the web (`-ml-3` with the 44 px target). Accepted. A web value (`-ml-2.5`) is not on the scale, so it goes to Task 3.10/5.3 with the header polish.
- Fold trigger look, the empty 48 bar on Inbox and More, History as a destination, the rail: these go to the batch-end shot matrix (plan lines 117–121, including 800 wide). The owner should be asked about the empty band on Inbox and More.

### Bug-lessons
New rows:
- Important 1, class 11;
- Important 2 and 3, class 113;
- Important 5, class 5.

### Checks
- **`bun lint`:** green. Ratchets exact and unchanged at 68 / 32 / 10.
- **`bun test:unit`:** green (scripts 166, core 877, client 515).
- **`bun test:app`:** green, 140 suites and 1044 tests.
- **e2e:** ports 8787 and 4173 were free (curl refused, nothing in `/proc/net/tcp`), and the log has no `EADDRINUSE`. The run covered `overlays`, `worst-case`, `layout` (with the two new tests), `composer` and `week`, plus the route sweep's "every screen on … phone|desktop" set with axe: **50 passed (6.8 min)**.

### Notes
- The preview's exit (Minor 5) has no jest case of its own. It relies on `Presence`'s tests and the e2e preview sampler.
- The rail's jest assertion was written before the ScrollView, but I did not run it on its own to see it fail first.
