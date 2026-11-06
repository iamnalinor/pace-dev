# Tasks 4.4 (Day) and 7.1 (Day on the notebook page) — report

## Shipped
- **PeriodStepper** (`shared/period-stepper.tsx`, new kit-level control): a group «Period», a `fill.2` pill with ‹, the date (a button that opens the picker, polite live region) and ›, then «Today» (`period.today`) only away from today. › is hidden (not greyed, not focusable) at the present; the Today slot is kept so nothing moves. Sits in the `ScreenHeader` `period` slot; `DayNav` is now its adapter (calendar in a `Popover` under the date on a computer, a `Sheet` on a phone).
- **Day page** (`day-screen.tsx` split into `day-rows.tsx`, `day-rail.tsx`): `Screen anchor="wide"` (960 at x 280 on `expanded`), editor in the **shell inspector** on a computer (collapsed with nothing picked; `ActivityPane`, ⌘↵ Save, Escape) and a sheet elsewhere (`activity-editor.tsx` holds the shared hook and body). Rows are kit `ListRow`s in one `Group` (one divider rule); gaps are rows with «Log»; «Log past activity» is the list's last row; the screen-time section is a `SectionHeader` + `Group` (same list system). A new day replaces the old in place: rows the date opened with never animate.
- **QA21 L3:** `dayChoicesOf(target, zone, now)` offers no end day that has not begun; "Other days" disappears when there is only one day to choose (bug-lessons 127).
- **7.1:** `dayRail(blocks, gaps, now)` (`packages/client/src/view-models/day-rail.ts`): proportional bands, gaps capped at 3 h with `scaleBreak`, `parallel` for alongside or overlapping blocks (with the overlap stretch), `nowAt`. `DayRail` draws the dot grid (`grid`, 16 px pitch, SVG pattern), tinted bands with a 1 px pen line at the start, dashed gaps with a scale-break tick pair, narrower parallel bands with 45° hatching on overlaps; `NowMargin` is the red margin line (`status.danger`, 1 px, dot, time in `caption`). The rail is hidden from assistive tech and takes no touches.
- Lint ratchets lowered (design values 39→38, bare Pressable 19→17, kit primitives 5→4).

## Tests
`day-rail.test.ts` (client: 2 h gap = 2 × 1 h block, 15 h gap capped with `scaleBreak`, parallel/overlap, now), `day-rail.test.tsx` (hidden rail, bands, break, hatching, margin), `day-wide.test.tsx` (inspector collapsed/open/close), `day-screen.test.tsx` (Today absent on today and › absent, present away; no animation props on a new day's rows), `activity-draft.test.ts` and `activity-sheet.test.tsx` (L3). e2e adjusted, not run: `latency.e2e.ts` and `week.e2e.ts` ("Today", the divider-rule check on `day-timeline`).

## Deviations / Deferred
See the plan's Task 4.4 and 7.1 "Deferred" notes (the rail is an index scaled to the list, not row-aligned; PeriodStepper used by Day only; summary cell not built).

## Verify on hardware
Android: the pane-less sheet editor on a phone; the rail's dot grid (react-native-svg pattern) on a long day; TalkBack skips the rail and reads the rows. Web: the Popover calendar anchored to the date at 1440 and its focus return.
