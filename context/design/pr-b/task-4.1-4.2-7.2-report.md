# Tasks 4.1, 4.2 and the running-card half of 7.2 — report

## Shipped
- **Meta (4.1):** `nowRow` gives no importance part for Normal (Q3); `MetaLine` is one line: tag (≤ 50 %), importance word (ASAP danger 600, Prioritized primary 600, Nice-to-have secondary 400), repeat mark, then the due/left texts in the footnote's tabular figures, truncating with "…".
- **TaskRow (4.1):** on `ListRow` with the new `control` slot (the `CheckCircle` beside the press area, never inside it — axe `nested-interactive`), `titleLook` (medium / dimmed / struck-through), `label`, role `link`, trailing repeat mark, selected fill + bar from `ListRow`. `ListRow` helpers moved to `ui/list-row-parts.tsx` (lint size).
- **TaskList (4.1):** rows in a `Group` (separator inset `check`), paged: 30 rows + «Show 30 more» (`now.showMore`), layout animation off above one page. History's board is a `Group` too.
- **RunningCard (4.2, 7.2):** `running-card.tsx` replaces `running-row.tsx`: dot + name (`headline`, truncates before Stop), `numeric.live` time, "of ~N", Stop = `Button secondary` with a filled square (`Button isIconFilled`), `haptic("tick")`, "Yes, still" past 2×, not a live region. Ink line: 2 px accent, red 1 px Expect mark at expected / max(expected × 2, elapsed), `status.warn` from 2× (`ink-line.ts`).
- **Announcements:** `useRunningAnnouncements` says start, stop and past-expected once each (never at mount); new keys `time.announce.*`.
- **Time bar (4.2):** `bar-tiles.tsx` (four fixed tiles on the kit Pressable, one frame whatever the label, neutral at rest, category stroke while running, dashed when greyed); `typed-start.tsx` on the kit `TextField` (`isDraft`: dashed outline while the assistant reads), text and proposal lifted so a fold keeps them; phone: only the field folds, in the kit `Disclosure` («Start something else»); bar cards/field scroll under a 40 % budget.
- **Pickers:** `ChoiceRow` on `ListRow` in a `Group` (tick haptic on a start), Stop as a filled-square `Button`; on a wide window the picker is the kit `Popover` anchored to its tile (phone keeps the `Sheet`).

## Tests added/changed
`now.test.ts` (Normal gives no part), `task-list.test.tsx` (1 284 rows mount 30; show more), `task-row.test.tsx`, `ink-line.test.ts`, `running-card.test.tsx` (not a tag, truncation before Stop, mark position and colour switch, not a live region, announcements, ticks, RU tiles identical), `time-bar.test.tsx` (Q12 fold). e2e (not run, owner's rule): `scale.e2e.ts`, a budget case in `overlays.e2e.ts`. Bug-lessons class 125 plus a nested-control row.

## Deviations
See the plan's "Deferred" notes: paging instead of `FlatList`; due/left kept as two parts; Approve has no tick; budget is a scroll cap, not a compact card.

## Verify on hardware
Android: ripple and the `tick` on Stop/pick; TalkBack reads one announcement per start/stop and none per minute; the row's check target (48 dp) beside the row; the popover on a desktop-width tablet.
