# Merge of PR A fix round 3 into PR B — report

2026-11-03. Branch `pr-b-local` → `claude/pace-design-overhaul-b` (draft PR #54, base
`claude/pace-design-overhaul-3p860c`). Merged `origin/claude/pace-design-overhaul-3p860c` at
`7924533` (PR A fix round 3). Merge commit `4ffb10d`.

## Conflicts and how they were resolved

- `apps/app/src/ui/chip.tsx`: A changed `label` to default to `children` and dropped the
  `?? children`; B replaced the render-prop `leading` with an `IconName` `icon` prop (and dropped
  `useTheme`). Merged as `label = children, icon`: B's icon, A's label default.
- `apps/app/package.json`: A bumped the Expo packages; B added `expo-haptics@57.0.3`. Union.
- `bun.lock`: A's lockfile taken, then `bun install` regenerated it. The only difference from A's is
  `expo-haptics` (B's single dependency change since the merge base).
- `scripts/eslint-rules/no-raw-design-values.ts`: A moved the rule's doc comment beside the rule and
  `Options` into `create` (prefer-smaller-scope); B added `pressedClass`, the state-layer check and
  its sentence in that doc. Kept A's layout and added B's `pressedClass` sentence to the moved doc.
- `context/bug-lessons.md`: every class and every log row kept. A owns 118–121; B's only new class
  (118, "A cross-cutting state drawn by every call site on its own") is now **122**. Updated B's
  references: its two log rows' class column, `eslint.config.ts` (the bare-pressable comment),
  `context/design/redesign-plan.md` (Lint baseline, Task 3.1), `context/design/pr-b/task-3.1-report.md`,
  `task-3.1-review.md`, `task-3.4-report.md`. A's references to 118 (`logout-button.tsx`, A's fix
  round 2 docs) stay at 118, which is A's class.

## Ratchets

`scripts/eslint-all.ts` ratchets are exact on the merged tree with no change:
`DESIGN_VALUE_WARNINGS = 68`, `BARE_PRESSABLE_WARNINGS = 32`, `KIT_PRIMITIVE_WARNINGS = 10`
(110 warnings in the app part, `bun lint` green).

## Failures found on the merge, fixed (same merge commit)

1. `bun lint` (the red): A had enabled `unicorn/prefer-smaller-scope`; four type aliases written by B
   at module scope failed it: `SharedProps` (`apps/app/src/ui/pressable-props.ts`), `Focusable`
   (`apps/app/src/ui/shell.web.tsx`), `Escape` (`e2e/support/geometry.ts`), `JsxAttribute`
   (`scripts/eslint-rules/kit-primitives.ts`). Each moved into the block that uses it. Log row under
   class 101 (a rule changed in one branch, code written against the old one in the other).
2. `CI=1 bun test:unit` (the red: A's `scripts/no-focused-tests.test.ts`, and Bun's ".only is
   disabled in CI"): B's `scripts/eslint-rules/kit-primitives.test.ts` still assigned
   `RuleTester.itOnly = it.only`. Line removed. Log row under classes 120 and 101; A's guard already
   covers the class, nothing new needed.

No behaviour changed in either fix, so no new test was written beyond the guards that were red.

## Verification (local, on 4ffb10d, before CI)

- `bun lint`: green (also run by the pre-commit hook on the commit).
- `CI=1 bun test:unit`: scripts 170 pass; core 878; client 517; pace-agent 54 OK.
- `bun test:api`: 64 files, 608 tests passed.
- `bun test:app`: 143 suites, 1066 tests passed.
- e2e, the way CI runs it (`CI=1`, so no server is reused; ports :8787 and :4173 were free before,
  and every server process ran from `/home/user/pace-dev-b`):
  `bunx playwright test --project chromium`: 203 passed (22.4 min, 2 workers);
  `E2E_REUSE_WEB_BUILD=1 bunx playwright test --project latency --no-deps` on fresh servers:
  10 passed (row p75 200 ms, theme chip 256 ms, within their ceilings).

One run of `bun test:unit` made while `bun lint` was running timed out in
`eslint-scoped-bans.test.ts` (5 s budget on a loaded machine, class 115); it passed when run alone.

## Second merge of A's tip

The coordinator raised CI's e2e `timeout-minutes` to 35 on A (`7bb5d0b`); A's tip was merged again
(`da8a941`, no conflicts), so #54 carries the same timeout. Not edited on B.

## CI on 4ffb10d (run 41662203819): two e2e failures, fixed

Checks (lint, audit, unit, app, API) passed; e2e: 201 passed, 2 failed. Both passed in my local
full run because that run used full Chrome (`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`)
while CI runs Playwright's chromium headless shell. On the headless shell both reproduced locally
(the reds), each with a bug-lessons row (class 120):

1. `overlays.e2e.ts` "a toast covers no control…" (390): Settings' Activity check switches read as
   stuck under the toast. The trace showed the wheel's scroll landing one frame after the second
   read: `mouse.wheel` resolves when the event is sent. `wheelAndSettle` now waits for the scroll
   events to go quiet (150 ms; 600 ms if none comes) before the second read. Red 1 in 2 on the
   headless shell, then 30 of 30 and 24 of 24.
2. `link.e2e.ts` "a sidebar link is an anchor…": the Ctrl-click opened no tab. Not the app:
   instrumenting the page showed no `preventDefault`, and a bare `<a href>` on an empty routed page
   failed the same way about 1 in 50 on the headless shell (0 of 30 on full Chrome). The test now
   asserts the app's half, which is deterministic: a Ctrl/⌘-click's default is left to the browser
   ("followed") and the page stays on `/`; a plain click's default is taken ("prevented") and the
   page moves to `/week`; any tab the browser did open must be `/week`. Red 2 of 30 and 4 of 30,
   then 15 of 15 and 12 of 12.

`docs/testing.md` now says CI's browser is the headless shell and a run is called green on it.

After the fixes, on the headless shell (`CI=1`, ports free first, servers from this worktree):
`bun lint` green; chromium project 203 passed (21.4 min); latency project on fresh servers: one
read of "Day: previous and next day" at p75 192 ms against its 160 ms ceiling right after the
chromium project, then 10 of 10 passed twice (128 ms and 104 ms). Ceiling unchanged; log row
under class 115.

## CI on 420a933 (run 41678052705)

Green: Checks (lint, audit, unit, app, API) success; End-to-end (chromium project, then the latency
step on fresh servers) success; the Android APK job is on demand (skipped).

## Commits

- `4ffb10d` merge of A fix round 3 (conflicts, renumbering, the two lint/focused-test fixes).
- `da8a941` merge of A's tip (CI e2e timeout 35).
- `420a933` the two e2e fixes, `docs/testing.md`, bug-lessons rows.

## Concerns

- The first commit attempt failed inside lefthook's pre-commit stash step (it writes its patch to
  the main checkout's `.git/info`, shared by the worktree), so the merge and the fixes were committed
  together as one merge commit rather than a merge plus a fix commit. Lefthook left
  `lefthook-unstaged.patch` / `lefthook-unstaged-all.patch` in `/home/user/pace-dev/.git/info/`;
  they are lefthook temp files and were not removed (that checkout is off limits here).
- `eslint-scoped-bans.test.ts` has a 5 s budget that a concurrently loaded machine exceeds (class 115).
- The link test no longer requires the browser to open the tab (CI's headless shell does not always
  do it). It still fails if the app prevents a Ctrl-click's default or navigates in place on it, but
  whether a real browser opens the tab is now checked only by hand or in the QA round.
- Latency: "Day: previous and next day" read 192 ms against its 160 ms ceiling once, right after the
  chromium project on a loaded machine. Two clean reruns read 128 ms and 104 ms, and CI passed. The
  margin is thin, and Task 5.6 owns it.
- I switched from full Chrome to the headless shell partway through the work. Earlier local full runs
  used full Chrome and missed the two CI failures. The final full run used the headless shell.
