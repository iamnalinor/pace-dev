# Batch 9 report (spec completion and environment independence)

**Done.**
1. Environment independence: e2e pinned to `timezoneId: "UTC"` and `locale: "en-US"`; the 23:56 week test seeds the account zone; jest (`test` script) and vitest (core, client) run under `TZ=America/Los_Angeles`; guards: `tz-guard.test.ts` (core), a case in `settings.test.tsx` (app). Bug-lessons class 135.
1b. Owner decision: Now is one list with a labelled hairline (`Group` `boundaries`, `NowTaskGroups`); spec §5.1 built note, `docs/design.md` decision, HANDOFF line, jest tests; e2e `nowTasks` locator now the list "Tasks".
2. (part) Week: empty-week `EmptyState`, calendar error line with Try again; the 6-lane ruling is in spec §5.6.
4. `PeriodStepper` `shortLabel` at ≤ 340 wide; History uses it.

**Left (still in the HANDOFF register).** Week: loading line, sticky day strip on phone, edge fade; 3 (delete → in-row «Task deleted · Restore»); 5 (medium-width inspector sheet on Now); 6 (Day summary cell); 7 (Insights two columns/Group, value column); 8 (Projects archived section, edit form in a Sheet); Day/Week `PeriodStepper` short labels.

**Notes.** `materialize-cost` passed in the final unit run (no flake). e2e not run locally.
