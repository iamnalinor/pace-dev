# Task 3.9 report — Controls (PR B, the kit)

Branch: worktree branch, pushed as `wip/task-3.9`. Base: `a67cc50` (PR B's tip; the worktree had been
created on `main`, it was reset onto B's tip before any work).

Commits: `202929a` the controls (all bullets); `99973ba` e2e fixes (destructive contrast, gallery
wrap, badge hang in the sweep, stale F-DAT-01 entries); then this report.

## What shipped, per bullet
- **Pressable shape / disabled / small-visual pattern (parked N1): done.** `shape` (radius token on
  the drawn box), `visual` (the drawn box when smaller than the target: the Pressable is the 48/44
  target and the layout box, no negative margin; the visual carries the corners, the overlay and the
  focus ring on the web via `data-pace-inner` / `data-pace-visual` in `global.css`), `DISABLED`
  roles exported, `ref` typed. Tests: `pressable.test.tsx`, `pressable.markup.web.test.tsx`,
  `state-layer.test.ts`.
- **RadioGroup + QA21 L1 / R23-15 sweep: done.** `ui/radio-group.tsx` (`RadioGroup`, `useRadio`:
  roving tab stop, arrows, throws outside a group). Every radio in the app now goes through it:
  `RadioChips`, `Segmented`, the chips of the task fields (repeat, repeat end, deadline policy,
  final mode, estimate options), Now's project filter, preset `ChoiceChips`, close sheet recent
  reasons, Day's category, the project sheet and Day's task link (`ListRow select`), colour swatches,
  OS picker, the gallery. AI-question chips are action buttons; Due/Start/Estimate/Final chips are
  buttons with `aria-expanded` (tests moved from `radio` to `button`). Guard: `radio-callers.test.ts`.
- **Chips' real 44 px press area: done** (small-visual pattern, wrapped rows use `gap-x-2` only).
- **Chip: done** (choice radio by `value`, filter `checked`, picker `expanded`, action; `fill.2` rest,
  accent chosen, `fill.1` disabled; hue only as a `Dot`; truncate at `chip-max`). `ActionChip` removed.
- **Tag + hue helpers: done.** `color.tsx` → `ui/hue.ts` (helpers; `inkClass`/`washClass`/
  `outlineClass`/`IMPORTANCE_HUES` kept for the batch-4 screens still using them) + `ui/tag.tsx`
  (`Tag`, `Dot`). `ColorTag` gone. Kit `Text` gained `hue`, `onAccent`, `onDanger`, `quaternary`.
- **pulse-dot deleted** (running row uses the static `Dot`); `dissolve.tsx` untouched.
- **Button: done.** Variants `primary|secondary|plain|destructive` (`ghost`→`plain`,
  `danger`→`destructive` migrated), `size regular|small` (48/40 desktop, 32), `width hug|fill` (+ the
  unnamed responsive `auto`, kept as the default — deviation: the plan names only hug/fill),
  `shortcut`/`shortcutMode` (was `hotkey`/`hotkeyMode`; `KeyHint` API unchanged), spinner keeps the
  label, disabled `fill.1`+quaternary.
- **IconButton: done** (round target, borderless ripple, `selected` → `aria-pressed` + `fill.3`, `busy`,
  `size`, `badge`; dead `surface`/`raised`/`variant` removed from every caller).
- **CountBadge / R23-13b / F-DAT-10: done** for the bell (`BadgeAnchor`, `IconButton badge`); tab bar
  and rail keep their own anchor (Task 3.10's files) and should adopt `BadgeAnchor`. 120 → "99+".
- **Switch / SwitchRow / R23-10: done.** `ui/switch.tsx` (`SwitchTrack`, `Switch`); `SwitchRow` is a
  `ListRow toggle` (whole row flips, one stop). `PaceSwitch` → `Switch`.
- **ListRow `toggle` and `select` variants: done.**
- **Segmented: done** (real segmented control, radio group, thumb with a `label.tertiary` edge).
- **Slider: done** (24 thumb in a `bg.cell` ring, 4 px track, no `scale-110`, released step held
  until the store answers, `valueText` → `aria-valuetext`; web CSS matched).
- **CheckCircle: done** (small-visual target, fills on press-in, `confirm` haptic, neutral checked
  disc, read-only quaternary ring; `dashed` removed). TaskRow keeps its geometry by centring the
  target in a 24 box (Task 4.1 moves it to ListRow).
- **ProgressBar: done** (`marker` removed, `tone`, `valueText`, clamps).
- **Skeleton: done** (shapes row/listRow/text, bars after 300 ms, region labelled from frame one,
  `label.quaternary` bars: the 1.5:1 guard kept). `FirstSyncBody`/`KnownAfterSync`/`EmptyText`
  restyled on it.
- **EmptyState: done** (`title body icon action`, leading-aligned; callers migrated to `title`).
- **Gallery:** new `gallery-controls.tsx` appended after the existing sections.
- **Bug-lessons:** class 123 (new, F-COL-09 "contrast asserted for text only") + log rows for
  F-COL-09 (123), F-DAT-10 (6), QA21 L1 / chip press area (84), R23-10 (84), F-DAT-02 tags (109).
  `pairs.ts` gained the controls' marks.

## Deviations
- Button `destructive` is `bg.cell` in a 2 px danger ring, not the spec's `status.dangerQuiet`
  fill: the danger label is 4.31:1 on that fill over the page (axe, `sync-state.e2e.ts`).
- Segmented thumb gets a `label.tertiary` hairline (the bare `bg.elevated` thumb is 1.1:1 on the
  track); track height = the target (48/44), not a 40 visual.
- Tag padX 8 (spec 4) so the pill's curve clears the text; `min-h-5`, no fixed height.
- Small button 32 (spec §4.2.3), not the plan's 36 (no 36 on the scale).
- Skeleton bars stay `label.quaternary` (spec says `fill.3`, which fails the 1.5:1 guard);
  breath unchanged (motion is Task 5.x).
- EmptyState callers pass their one sentence as `title`; splitting copy into title/body is 4.x/4.13.
- Android ripple of a small-visual control fills the target box (rounded by `shape`), not only the
  visual — verify on hardware.

## Tests
- `bun test:app`: 150 suites, 1101 tests, all green.
- `bun lint`: clean; ratchets lowered: design values 68 → 56, bare pressables 32 → 28, kit
  primitives 10 → 8.
- e2e (through the lock): `worst-case`, `sync-state`, `composer`, `keyboard` green (after fixes:
  the destructive contrast, the gallery choice rows, the badge hang exemption, two stale F-DAT-01
  entries removed).
- F-DAT-02 entries in `worst-case.e2e.ts` ("Домашка по алгебре 6", "Алгебра", "Это не я", the worst
  set's two) still match: they are not tags (time-bar / week labels / notification buttons, owned by
  4.x); no Tag break is left, so there was no tag marker to remove.

## Verify on Android hardware
Ripple on small-visual controls (chips, switch, check circle, small buttons) and on whole-row
toggles; the check circle's `confirm` haptic; the drawn switch in both themes; the slider's held
step after release; the bell badge position at font scale 1.6.

## Files of the parallel implementers touched (mechanical, expect trivial conflicts)
`ui/sheet.tsx` (IconButton `variant` dropped), `ui/sheet-actions.tsx` (`hotkey`→`shortcut`,
`danger`→`destructive`), `ui/sidebar.tsx` (`NotificationBell place="sidebar"`), `ui/sync-frame.test.tsx`
(`EmptyState title=`). A rewritten sheet/sidebar must use the new names.
