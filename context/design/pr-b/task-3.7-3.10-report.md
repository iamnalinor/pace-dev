# Tasks 3.7 and 3.10 — report (stopped by the coordinator, WIP)

Branch `wip/task-3.7-3.10` (based on PR B tip a67cc50). Commits: 9c6ac8c (3.7), 715a1a8 (3.10), then a
WIP commit (bug-lessons rows, e2e fixes, this report).

## 3.7 Toast placement and Tooltip
- Done: toast above the measured chrome (`ui/float-layer.ts`: tab bar, screen footers, pill and the
  shell's content region publish themselves; `BASE_BOTTOM`/`TAB_BAR_HEIGHT` and the sidebar dock
  are gone), `anchor` option, persistent polite `role="status"` region (announced once), Close
  button (words not a control), timer held on hover/focus, `Presence` rise; lists grow their foot by
  what floats over them.
- Done: Tooltip 400 ms hover delay, `isImmediate` (time bar's "why unavailable"), warm hand-off,
  hoverable bubble with a 120 ms grace, Escape, nothing on touch (`showsOnTap` removed; Week's moon
  no longer pops a bubble). Native `Tooltip`/`TooltipHost` are pass-throughs.
- Done: offline pill restyled (kit Text/Pressable, secondary tones), Retry and re-check kept, floats
  in the content region, toast stacks above it (review #6); RU wrap test unchanged (QA21 L9).
- e2e: `offline-pill.e2e.ts` new "offline with a toast" (390/1440) and "inside the content column at
  1440" (R23-13a) pass; `overlays.e2e.ts` toast tests pass (wheel now over the content column);
  new tooltip sweep (Now, Day, task) still being stabilised (see Red).
- Deferred: toast swipe-to-dismiss, the §6 motion details (Task 5.3), toast anchored to the inspector.

## 3.10 Sidebar and TabBar
- Done: `ui/nav-item.tsx` (44 px link rows, ListRow's 4 px `SelectedBar`), `currentOf` page/section:
  an owned pushed screen (Presets, a task) keeps bar + weight, no fill, `aria-current="true"` (R23-14,
  new bug-lessons class 123). Rail: page on the pill, section bold. Rail haptics: none, per spec §3.10
  (no buzz on switching places) — deviation from the "rail haptics" bullet, flagged.
- Done: sidebar header (mark, Pace, bell; owner's name on its own line, truncate + title, no avatar);
  64-char name test. Header scroll-edge hairline in `Screen` (F-LAY-13).
- Done: tab bar (bg.cell, 64 + inset, 64×32 pill, bar icons, wrapping captions), tablist/tab on
  Android, `nav` of links with `aria-current` on the web (`tab-bar-item(.web).tsx`), measured height
  published while the tabs are in front; `deadControls()` over the bar. Filled icons not used (lucide
  fill blots clock/inbox glyphs) — flagged.
- Done: `UserAvatar` on tokens (fill.3, label.secondary, caption2/subhead, decorative).
- e2e selectors moved from tab/tablist to link/navigation (latency, login, keyboard, layout).

## Numbers
- `bun test:app` 1097/1097 (at 715a1a8). Lint clean at 715a1a8; ratchets: design values 66 (from
  68), kit primitives 9 (from 10), bare pressables 32.
- e2e (chromium): overlays, offline-pill, time, tooltips, keyboard, layout, login, link: 52 passed,
  3 failed in the first run; after fixes the toast tests pass; the assistant-preview test (Task 3.5)
  failed once by 1.5 px under load and passed alone (flake, not investigated).
- Bug-lessons: class 123 (new) + 4 log rows (class 6 ×3, class 123).

## Red / open
- `overlays.e2e.ts` "no tooltip covers an enabled control…": the sweep's button discovery picked a
  label not on top (fixed to on-top buttons in the WIP commit, not re-run).
- Merge notes: `showsOnTap` is removed from `Tooltip` (3.9's `icon-button.tsx` must drop it);
  ratchet numbers conflict with parallel tasks; `KeyHint` still imported from `button.tsx`.
- Verify on Android: tab bar height with gesture/3-button nav, toast above it, ripple on the pill.
