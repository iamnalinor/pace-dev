# Task 3.3 report: `Group`, `ListRow`, `SectionHeader`

**Status:** DONE. Branch `pr-b-local` in `/home/user/pace-dev-b`. Not pushed.
**Commits:** first `b727dfb`, last `b727dfb` (one commit; the pre-commit `bun lint` ran on it).

## What was built
- **Layout roles as classes.** `scripts/design/generate-design.ts` adds `LAYOUT_SPACING`. These are the §3.3 layout roles as named spacing keys, with desktop values under `-lg`:
  - `row-x`, `row-y`, `row-y-lg`
  - `row-gap`, `cell-gap`
  - `gutter`, `gutter-lg`, `gutter-pane`
  - `header-top(-lg)`, `header-bottom(-lg)`
  - `section(-lg)`, `sheet-pad(-lg)`

  The desktop values that are not on the 4-pt scale (row padding 10, header top 28, section 28) exist only as these roles. Numeric spacing keys are still exactly the `space` tokens; the test covers both. The theme was regenerated.
- **`ui/group.tsx`**, `<Group inset separatorInset>`:
  - The group is `bg-cell rounded-lg overflow-hidden` with no border.
  - A `border-t border-separator` separator goes only between two rows. Rows left out by a condition do not count.
  - The separator is inset to the text start: `row` = `ml-row-x`, `icon` = `ml-12` (16 + 20 + 12), `none`.
  - `inset` (the default) adds `mx-gutter`.
  - An empty group renders nothing.
  - It is a `RowList`, so it keeps `collapsable={false}`. `row-list.tsx` documents this.
- **`ui/list-row.tsx`**, `<ListRow leading title titleLines subtitle meta trailing onPress|href role selected density disabled haptic>`:
  - Density: `regular` = `min-h-row lg:min-h-row-compact`; `compact` = `min-h-row-compact`.
  - Padding `px-row-x py-row-y lg:py-row-y-lg`; gap `gap-row-gap`.
  - Leading and trailing sit in first-line boxes (`min-h-6 justify-center`). The title column centres beside a taller control and top-aligns when it wraps.
  - The title is `body`; the subtitle is `footnote` `secondary`.
  - With `href` the row is the kit `Link` with a `chevron-right` (inline, tertiary). With `onPress` it is the kit `Pressable`, role `button` or `tab`. Otherwise it is a static `View`.
  - `selected` adds the `bg-fill-1` fill (`SELECTED_ROW_FILL`, per bug-lessons 112) and a 4 px `bg-accent rounded-xs` bar. How it is announced depends on the row:
    - a tab row says `selected`;
    - a button or link row says `aria-current="page"`;
    - a static row sets `accessibilityState.selected`.
- **`ui/section-header.tsx`**, `<SectionHeader title level count action inset>`:
  - `subhead` `secondary`, with the text unchanged (no uppercase); `mt-6 mb-2 px-row-x` (+ `mx-gutter`).
  - `level` is 2 (the default) or 3.
  - `count` goes through `formatCount` as `numeric.value`; `action` is a ReactNode.
- **`pairs.ts`:** the selected bar, `accent` on `fill.1` over cell and over app, target `ui`.
- **Gallery:** `screens/gallery/gallery-lists.tsx` `ListSections`:
  - a SectionHeader with the count;
  - a Group of the set's project rows (`titleLines 2`, the first one selected, a neutral CountBadge);
  - a navigation row, a static row with a subtitle, and compact rows with durations.

  EN/RU `dev.gallery.lists.*` keys were added; the test is `gallery-lists.test.tsx`.

## Tests (red first: the modules did not exist)
- `group.test.tsx` (6): separators sit only between rows; holes are skipped; an empty group renders nothing; the classes and `collapsable`; the inset kinds; the gutter.
- `list-row.test.tsx` (8): the slots; the density classes; a static row has no button; a press; the selected bar and `accessibilityState.selected`; `aria-current` on a button row; a static selected row; first-line alignment.
- `section-header.test.tsx` (4): the level, the sentence case unchanged, the default level 2, the count and the action.
- `generate-design.test.ts`: the named layout keys.
- `bun lint`: green. Ratchets unchanged: 72 / 33 / 10.
- `bun test:unit`: green (scripts 166, core 877, client 515).
- `bun test:app`: green.

## Notes
- **Bar width:** the bar is 4 px (`w-1`), not the 3 px of §4.3.1, because 3 is not on the scale (noted in the spec).
- **`ListRow` roles:** `option` is not in React Native's `AccessibilityRole`, so `ListRow` takes `button | tab`. The `select` (radio) and `toggle` (switch) variants come with their controls in Task 3.8/3.9.
- **No caller was migrated**, as the brief says. `row-list.tsx` only gained the note.
- **e2e:** the gallery's list sections are covered by the confirmed run on tip `7d460d3`: `worst-case.e2e.ts` and the route sweep with axe, 49 passed (see the 3.4 report).
