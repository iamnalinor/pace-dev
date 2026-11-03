# Task 3.2 re-review (4f33e1e..d2c6c4e, branch pr-b-local)

Read by SHA only. Nothing was run (the tree is shared and read-only); the claims about test
results below are the implementer's.

## Conditions
- **Lucide codemod: addressed.** `git grep lucide-react-native d2c6c4e` finds only `ui/icon.tsx` and
  its test mock. Button, IconButton, BackHeader, Chip (`icon`), RadioChips (`icon`) take `IconName`.
  I read every call-site diff (about 75 files). No icon changed its meaning: each glyph maps one to
  one, tones map to the old palette roles (`quaternary` and `inverse` are new tones on existing
  roles, `x` is a new glyph), `filled` Play keeps its fill, `aria-hidden` is the Icon default.
  Size snaps are the accepted ones (12-16 to 16, 18-20 to 20, strokes to 1.75). UserAvatar's glyph
  uses 20 from 32 px up, 16 below. Chip icons and the check circle grow 14 to 16.
- **Green e2e: partly addressed.** link.e2e + worst-case (6) and the route sweep "every screen on"
  (8, axe, gallery) are reported green. Not run: the rest of the suite. Accepted for this task, but
  the full run stays a pre-merge gate. The codemod's visual effect (icons 18 to 20 in
  Button/IconButton/bell/time bar; check circle) is unshot; the report says so.

## Minors
1. **Target on the kit Pressable: addressed, with one note.** `min-h-hit min-w-hit` (native) and
   `-web` (web) are added through `cx`, tested on both. The classes exist (`SIZE_PREFIXES` has
   min-h/min-w, `min-h-hit-web` is used elsewhere). The effect today is small: only sidebar rows,
   New task, the gallery and Link use the kit Pressable (`h-10` rows become 44; on a wide Android
   tablet they become 48). Chips, the check circle, icon buttons and headers are RN `Pressable`s
   and are untouched, so nothing in a row layout breaks now.
   - A smaller visual box is possible without an opt-out only the way `CheckCircle` does it: a
     visual child inside the target box, with negative margin. `min-*` makes `h-*` on the
     Pressable itself useless, and `hitSlop` plus a short box is impossible because min wins.
   - **New, Minor (N1):** there is no opt-out prop, so the later migrations (chips in a row, header
     icon buttons) will either grow or need the negative-margin trick each time. Add the opt-out
     or a documented pattern before 3.3+ moves them onto the kit Pressable. The report lists it
     as a remaining concern.
2. **Disabled Link: addressed.** `href` and `hrefAttrs` are dropped when `rest.disabled === true`;
   the test asserts no `href`, `toBeDisabled`, no navigation. Minor residue (N2): only the
   `disabled` prop counts. A disabled state passed as `accessibilityState` or `aria-disabled` would
   keep the href. No caller does it; LinkProps inherits `disabled` only, so low.
3. **Text `full`: addressed.** web uses `props.full ?? props.children` for the title and marker;
   native strips it in `textProps` (`full: _full`), so it never reaches the native Text. Two tests
   (marked with `full`, unmarked without). No caller uses `full` yet, which is fine for a kit prop.
   The `full` value must equal what is drawn; nothing enforces it (Nit).
4. **Circular sidebar test: addressed.** A real-router test (expo-router `renderRouter`) presses
   Week on Week, goes back, and requires Now with `canGoBack() === false`. The reasoning that it
   goes red on `push` holds: a pushed duplicate would leave a history entry. The sidebar test was
   renamed.
5. **Gallery absence: addressed.** Asserts the empty fixture is empty, no worst-case project name
   or capture text, and only the inside link.
6. **Lint rule coverage: addressed, no false positives found.**
   - `rawIcon`: `export … from`, `export * from`, `lucide-react-native/…` paths, dynamic
     `import()` with a literal. `source?.value` is undefined for `export const`, so local exports
     are not reported. A package that only shares the prefix (`lucide-react-native-x`) is ignored.
     A non-literal `import(x)` is skipped (no report), as it should be.
   - `rawLineLimit`: named and aliased `Text`, `import * as RN` and default import with
     `<RN.Text>`. `RN.TextInput`, `RN.Animated.Text` (object is a member expression) and
     namespaces from other packages are not flagged. Only `react-native` imports are collected.
   - Ratchet 71 to 10 matches `git grep numberOfLines` outside tests and the kit: 10 sites.
7. **Comment on the direct `pressable.web` import: addressed** (accurate).
8. Previously "no change needed": still none.

## Other checks
- `rawLineLimit` moves (13 sites): each kept its policy (`truncate` for single-line, `clamp`+lines
  for 2). Where a `min-w-0` was dropped it is now supplied by the Text primitive. Where className
  carries `flex-1`/`font-normal`, the role's own weight is overridden as before. The
  `where-sat-line` clamp keeps 1 or 2 lines.
- Gallery/doc/bug-lessons rows and the plan baseline line (72/33/10) are consistent with the
  report.
- `icon={"chevron-left"}` (braces around a string literal) in about 20 call sites: stylistic only,
  lint accepted it. Nit.

## New issues
- N1 Minor: no opt-out below the target on the kit Pressable (above).
- N2 Minor: disabled Link only reacts to the `disabled` prop.
- N3 Minor (verification): the full e2e suite and the design-shots pass for the larger icons/check
  circle are still open; the code review of this round through `requesting-code-review` is
  pending per the report.

No Critical or Important issues.

## Verdict
**Approved.** Both conditions are met: the codemod is complete and meaning-preserving, and the
e2e that proved the headline Link behaviour and the owner-name removal is green. Run the full
`bun test:e2e` and the shots for the check circle and Button icons before merge.
