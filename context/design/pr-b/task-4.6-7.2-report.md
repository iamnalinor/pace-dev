# Task 4.6 + 7.2 (Week day strip) report

## Shipped
- `layoutWeek()` in `@pace/client` (`week-layout.ts`): one pass returns every day's drawn boxes (px), lanes
  computed on the drawn heights (min 24), folds for runs past six lanes, the day strip's compressed line and the
  `overhang` of a short item at midnight. The grid draws only from it (F-DAT-05, class 1).
- The day's-end block: the column keeps `BOTTOM_PX` under the last hour (it replaces the grid's bottom padding,
  so the fit is unchanged); a 23:56 item is wholly inside the scroller and clear of its neighbour.
- Folds: a run needing more than six lanes is one «+N» block; its tap opens a list in the sheet/inspector, each
  row opening its own details (`week-picked.ts`, `GroupList`).
- Day strip (`day-strip.tsx`): `Пн 6` over a 4 px line of the day's tracked time, red 1 px now mark on today;
  phone days snap to whole days (`snapToOffsets`).
- Blocks announce weekday, date and hours before the name; hour numbers are hidden from assistive tech; labels in
  the kit `Text` (≥ 12 px, lines = floor(height / 16)); boxes on the kit `Pressable`; usage strip in
  `label.quaternary`.
- `PeriodStepper` in Week's and Insights' period slots (`shared/week-period.tsx`), the moon in the header actions;
  «This week» replaces «Back to today»; `WeekArrows` and `BackToToday` deleted. Ratchets 32 / 9 / 2.
- Bug-lessons 130.

## Tests
`week-layout.test.ts` (5 overlapping 20-minute blocks → 5 lanes, no overlap in a lane, the 23:56 item, folds, the
day line), `week-screen.test.tsx` (weekday in the name, day headers and now mark, snap offsets, fit with the tail).
e2e (not run): This week, new names, the 23:56 item inside the scroller and clear of its neighbour.

## Deferred
See the plan's Task 4.6 "Deferred" note.

## Verify on hardware
Android: snapping of the day columns with a fling, the «+N» block's tap, TalkBack reading the weekday first.
Web: the strip at 390 with a fold of seven blocks; Insights' stepper at 320.
