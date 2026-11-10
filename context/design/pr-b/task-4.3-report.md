# Task 4.3 — Now (report)

## Shipped
- **Shell inspector.** `screens/now-screen.tsx`: on `expanded` Now is `Shell content={NowBoard} inspector={form | picked task}`, collapsed with neither (the empty "Pick a task" pane and `now.pickTask` are gone; new `now.details` label). `Screen` got `anchor="content"|"wide"`: on `expanded` the column hugs the region's leading edge (sidebar 248 + header gutter 32 = 280, 720 column); Now uses it.
- **Composer.** The line is the kit `TextField` (`isGrowing`: one line, grows to 8, `isDraft` dashed while the assistant reads, focus ring from the field); the card chrome belongs to the form only. `+` shows on a computer only while the line has text (F-CMP-18, the sidebar's New task is the empty entry). Form header: kit `Text` title, `Create ⌘↵` (primary shortcut hint) at the right, kit `IconButton` close. `LineButton` is on the kit `Pressable`.
- **Unfold (spec §6).** `composer-unfold.tsx`: opening = card grows 160 ms (`easing.enter`) to the measured height with the form at opacity 0, then fades in (100, `duration.xs`); closing = fade 110, shrink 160, line fades in; reduced = fades only; nothing on first render. `e2e/support/geometry.ts`' `expectDescendantsStayInside` counts only boxes with effective opacity > 0.
- **Filters.** `ui/chip-scroller.tsx` (+ `use-wheel-scroll(.web).ts`, `wheel-scroll.ts`): chevron cue at each end with more, wheel → sideways on the web.
- **Groups.** `now-task-groups.tsx` on `SectionHeader` + `TaskRows` + `Disclosure` («Show all · N», `now.showAll`); old expand/collapse keys removed.
- **/add focus (QA21 M2, R23-12).** `TaskFields` focuses the title only once the first-sync cover lifts (bug-lessons 126).
- Lint ratchets lowered: design values 41→39, bare Pressable 22→19.

## Tests
`composer-unfold.test.tsx` (grow→fade, fade→shrink→fade, first render still), `screens/add-focus.test.tsx`, `ui/chip-scroller.test.tsx`, `ui/wheel-scroll.test.ts`, `now-screen.test.tsx` (Show all), `screens/now-screen.test.tsx` (inspector collapsed/labelled, + only with text). Existing composer entry-path tests (Enter, Send, +, share, New task, paste, To Inbox, empty form without error) all pass unchanged. e2e added, not run: `e2e/filters.e2e.ts`, `/add` focus at 390 and 1440 in `composer.e2e.ts`.

## Deviations / Deferred
See the plan's Task 4.3 "Deferred" note (medium inspector sheet, Escape hint on close, proposal card as ListRows, cue without gradient).

## Verify on hardware
Android: the composer unfold (no clipped frame while growing), TalkBack on the `Show all` disclosure, the keyboard on a direct `/add` load. Web: the wheel over the chip row and the cue at 390.
