### Task 3.4: `ScreenHeader` and the shell

**Files:** Create `ui/shell.tsx`, `ui/shell.web.tsx`, `ui/use-breakpoint.ts` (+ tests); Rewrite
`ui/screen-header.tsx`, `ui/screen.tsx` (+ `.web.tsx`: the window scrolls on desktop),
`ui/back-header.tsx` (merged into `ScreenHeader variant="pushed"`), `ui/split-pane.tsx` (deleted:
the shell's inspector region replaces it).
**Interfaces:** `useBreakpoint(): "compact" | "medium" | "expanded"`; `<ScreenHeader variant="top|pushed"
title subtitle? period? actions?>`; `<Shell navigation content inspector? inspectorOpen>`.
- [ ] Failing tests: `variant="top"` renders `largeTitle` and no eyebrow element; subtitle under the
      title; `variant="pushed"` renders Back + `title1`; `inspectorOpen=false` gives the content the
      full width (no empty pane); breakpoints at 600 / 1024.
- [ ] Medium width (600–1023): the sidebar becomes a navigation rail (icons + labels), the inspector
      opens as a sheet; remove the portrait lock in `apps/app/app.config.ts` (`orientation`) — Q8,
      F-LAY-04. Test: `useBreakpoint` at 800 px returns `medium` and the shell renders the rail.
- [ ] e2e (in `e2e/layout.e2e.ts`): title top y is identical (±1 px) across Now, Day, Week, Inbox,
      Projects, Insights, History, Settings at 1440 and 390 (F-LAY-02).
- [ ] Implement; PASS; Commit.

