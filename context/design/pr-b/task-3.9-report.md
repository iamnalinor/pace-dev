# Task 3.9 report — Controls (PR B, the kit)

Branch: worktree branch, pushed as `wip/task-3.9`. Base: `a67cc50` (PR B's tip; the worktree had been
created on `main`, it was reset onto B's tip before any work).

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

## Files of the parallel implementers touched (mechanical, expect trivial conflicts)
`ui/sheet.tsx` (IconButton `variant` dropped), `ui/sheet-actions.tsx` (`hotkey`→`shortcut`,
`danger`→`destructive`), `ui/sidebar.tsx` (`NotificationBell place="sidebar"`), `ui/sync-frame.test.tsx`
(`EmptyState title=`). A rewritten sheet/sidebar must use the new names.
