# Design overhaul — handoff (state and what is left)

Read this first if you are picking up the design overhaul. It is updated at every checkpoint;
the full decision log is [`overhaul-ledger.md`](overhaul-ledger.md) (a copy of the controller's
working ledger). Checkpoint commits may be pushed with failing checks (owner, 2026-11-03: "push as
is, even without good CI"); the last line of "State" says whether the tip is green.

## Owner's standing instructions
- Direction **A · Тетрадь**; decisions already taken are listed at the end of
  [`docs/design.md`](../../docs/design.md). New UI follows `docs/design.md`.
- Three stacked PRs into `main`, squash-merged **by the agent** once code review
  (`superpowers:requesting-code-review`), its one QA round (`docs/qa.md`) and CI are green:
  - **A "Foundation"** = batches 1+2 + PR #48 logic/server follow-ups A1–A8 — **PR #53** (draft).
  - **B "New look"** = batches 3+4+7 (the kit, every screen, direction A's identity), screen by
    screen; the PR #48 UI follow-ups and QA lows go into the task that rebuilds that screen.
  - **C "Polish"** = batches 5+6+8 (motion and the 100 ms render budget, web/PWA, close-out).
- **Release only at the very end** (after C), **without a final QA round**: tag `vX.Y.Z` on main via
  `.github/workflows/release.yml` (v0.11.0 is the last; it predates Phase C).
- Report to the owner in Russian, short; options with a default.
- Checkpoint regularly: commit + push as is, update this file.

## Speed and QA schedule (owner chose option "а", 2026-11-03)
- PR B: the kit (batch 3) by one implementer first; then the screens by 2–3 implementers in parallel
  git worktrees, split by feature folder (Now/Day/Week · task/Inbox/projects · settings/insights/
  history); reviews pipelined (task N+1 starts while N is reviewed); targeted tests per task, the full
  e2e before every QA round and every merge; small same-shape tasks batched, reviewer model by size.
- QA (owner, 2026-11-03): **one light QA round per PR, before its merge**, scoped to what the PR
  changed, with a parallel code review. Its findings are fixed in that PR and **validated without
  another QA round**: a failing test first, the targeted e2e, screenshots of the changed screen, a
  scoped code re-review, CI. The QA re-check of those fixes is **carried to the next PR's round** via
  the list below. **PR C is different**: no carrying over; its findings are fixed and re-checked
  (QA included) until they are fixed.
  - A: round 23 was its round (no round 24). B: one round at its end. C: one round, then until clean.

## Carried to the next PR's QA round (re-check the way each was found, then its class)
- From PR A (QA round 23, `context/qa-round-23.md`): R23-01 zone not written on an unknown account
  (5xx first pull → Retry); R23-02 offline Log out asks and names the unsynced count; R23-04 Enter
  after a paste; R23-06/07 preset names in the account's language, History names presets; R23-08
  Day's screen-time failure line with Try again; R23-09/11/13c retry wording, Connect line.
- From PR A (review of A1–A8): I1 preset edit with a shared name; I2 read-later text survives an
  outage; I3 `API_ORIGIN` variants (case, slash, :443, LAN http, blank); I4 3–5 s loop caught.

## Where things are
- Branch `claude/pace-design-overhaul-3p860c` (rebased onto main 7bf2815 on 2026-11-02).
- Plan: [`redesign-plan.md`](redesign-plan.md) (tasks, batch checklist, "PR #48 follow-ups
  (triage)", QA carry-over tables, lint baseline). Spec: [`redesign-spec.md`](redesign-spec.md).
- QA rounds of this work: `context/qa-round-22.md` (was 18 before the rebase), `qa-round-23.md`.
- Bug-lessons classes of this work: 108–113 (overhaul), 114+ (follow-ups).
- Lint ratchet `DESIGN_VALUE_WARNINGS` in `scripts/eslint-all.ts`: 74, exact, never raised except by a
  dated line in the plan's "Lint baseline".
- Screenshots: `DESIGN_SHOTS=.cache/shots/<name> bun test:e2e e2e/design-shots.e2e.ts` (build with
  `EXPO_PUBLIC_API_URL` + `EXPO_PUBLIC_DEV_LOGIN=1`).

## State (2026-11-03)
- Batches 1+2: done, reviewed, QA'd (rounds 22, 23).
- Rebase onto main: done, reviewed (fix round 1 re-reviewed clean).
- PR #53 opened as draft.
- Follow-ups A1–A8: done; code review 0C/4I/9M → fix round 1 committed (I1–I4, minors).
- QA round 23 (intermediate): 0 blocker, 0 high, 3 medium, 9 low. Fixed so far: R23-01 (zone written
  on an unknown account), R23-02 (offline Log out asks before dropping unsynced changes), R23-04,
  -06, -07, -08, -09, -11, -13c; lows on screens PR B rebuilds were moved into their plan tasks;
  R23-03 (latency) belongs to Task 5.6.
- **Tip: work in progress, the full check run for this fix round has not finished.**

## What is left, in order
1. PR A: finish the fix round (full `bun lint`, `test:unit`, `test:api`, `test:app`, full
   `test:e2e`); a scoped re-review of fix round 1 (`review-followups-a` findings + R23 fixes);
   CI green on #53; mark ready; squash-merge. No QA round 24 (the re-check is carried to B).
2. PR B "New look": rebase onto main after A's squash; Tasks 3.1–3.10, 4.1–4.13, 7.1–7.3 screen by
   screen (kit first per screen), each through the method in `docs/design.md` (comp, tokens, pairs,
   gallery, matrix shots, design reviews), TDD, per-task review; batch checklist; one QA round (with
   the carried list above); fixes validated by tests/shots/review; PR; merge.
3. PR C "Polish": Tasks 5.1–5.4 + 5.6 (every latency case ≤ 100 ms), 6.1–6.4, 8.1–8.7 (lint rule to
   error, goldens, README shots, DESIGN.md from code); one QA round with B's carried list, fixed and
   re-checked until clean.
4. Release right after C's merge, no final QA: tag via `release.yml`, check the APK and notes.

## Open items for the owner
- Tap latency 120–300 ms at 4× CPU (Task 5.6 owns it; per-case ceilings in `e2e/latency.e2e.ts`).
- Week's day's-end block hangs past its column (main's code; Task 4.6).
- Visual choices to confirm: Week blocks as a light tint with dark ink; icon tile `#0D0F15`.

## How to resume
`git log --oneline origin/main..HEAD`, read this file, the plan's task list and the last lines of
`overhaul-ledger.md`; run `bun install` and `bun lint`; continue at the first unfinished step above.
Shared dev servers are not running after a container restart; the Playwright config starts its own.
