# Design overhaul — handoff (state and what is left)

Read this first if you are picking up the design overhaul in a new session. It describes the state
as of the last checkpoint, every standing instruction of the owner, and the exact next steps. The
full decision log is [`overhaul-ledger.md`](overhaul-ledger.md) (a copy of the previous controller's
working ledger; its last lines are the most recent rulings).

## 1. Owner's standing instructions (binding)
- **Direction A · Тетрадь.** Decisions already taken are at the end of [`docs/design.md`](../../docs/design.md);
  every new or changed UI follows `docs/design.md` (comp, tokens and kit only, `pairs.ts`, worst-case
  gallery, the shot matrix phone/desktop × light/dark × EN/RU, design reviews).
- **Three stacked PRs into `main`**, each **squash-merged by the agent** once its code review
  (`superpowers:requesting-code-review`), its one QA round and CI are green:
  - **A "Foundation"** — batches 1+2 + PR #48 logic/server follow-ups A1–A9 — **PR #53, MERGED**
    into main on 2026-11-03 as squash `e03360f` (its branch was deleted).
  - **B "New look"** — batches 3+4+7 (the kit, every screen, direction A's identity) — **PR #54**,
    branch `claude/pace-design-overhaul-b`, base `main` (GitHub retargeted it when A merged). Work
    continues on this branch.
  - **C "Polish"** — batches 5+6+8 (motion and the 100 ms render budget, web/PWA, close-out). Not
    started; open it as a branch off B (owner allowed new branches for the stacked PRs).
- **QA policy (owner, 2026-11-03):**
  - One **light** QA round per PR, before its merge, scoped to what the PR changed (`docs/qa.md`,
    "Intermediate round"), with a parallel code review.
  - Its findings are fixed in that PR and **validated without another QA round**: a failing test
    first, targeted e2e, screenshots of the changed screen, a scoped code re-review, CI.
  - The QA **re-check** of those fixes is **carried to the next PR's round** (list in §4).
  - **PR C is different**: no carrying over — fix and re-check (QA included) until clean.
  - **No final release QA round.**
- **Release** right after C's squash-merge: tag `vX.Y.Z` on main via `.github/workflows/release.yml`
  (workflow_dispatch with the tag; v0.11.0 is the last and predates Phase C, so the next is v0.12.0).
- **Speed (owner chose "а")**: PR B's screens by 2–3 implementers in parallel git worktrees split by
  feature folder; reviews pipelined (task N+1 starts while N is reviewed); targeted tests per task,
  the **full** e2e before each QA round and each merge; small same-shape tasks batched; reviewer model
  by task size (Sonnet for scoped re-reviews, Opus for task and branch reviews).
- **Checkpoints**: commit and push regularly **as is** (even red), and keep this file current.
- **Talk to the owner in Russian**, short and dense; give options with a default.
- Never merge a PR whose CI is red; merge method is squash only (CLAUDE.md).

## 2. Where things are
- Plan: [`redesign-plan.md`](redesign-plan.md) — tasks 3.x/4.x/5.x/6.x/7.x/8.x with dated pointers
  for every PR #48 / QA follow-up they own; "PR #48 follow-ups (triage)"; QA carry-over tables;
  "Lint baseline". Spec: [`redesign-spec.md`](redesign-spec.md) (§4 components, §5 screens, §6 motion,
  §11 verify-on-hardware list, §12 owner answers). Comps: `context/design/comps/`.
- PR A records (now on main and this branch, `context/design/`): `pr-a-followups-report.md` / `-review.md` /
  `-rereview.md`, `pr-a-design-pass.md`, `pr-a-fix-round-2.md` / `-review.md`, `pr-a-a9-report.md`
  (A9 + fix round 3) / `pr-a-a9-review.md` / `pr-a-fix-round-3-review.md`.
- PR B records (on B's branch, `context/design/pr-b/`): briefs, reports, reviews and re-reviews of
  tasks 3.1–3.5, `merge-a-into-b-report.md`.
- QA rounds of this work: `context/qa-round-22.md`, `context/qa-round-23.md`.
- Bug-lessons classes added by this work: 108–113 (overhaul), 114–121 (follow-ups, A9, CI guard,
  third-party frames); B may renumber its own new classes after A's highest when merging.
- Lint ratchets (`scripts/eslint-all.ts`, exact, lower only, a raise needs a dated plan line):
  on A `DESIGN_VALUE_WARNINGS` 74; on B design values 68, bare pressables 32, kit primitives 10.
- Task tooling of the previous session (superpowers `subagent-driven-development`): one implementer
  per task (or a batch of small tasks), then a task review (spec + quality), fix rounds, a scoped
  re-review. Briefs come from the plan's task text.
- Screenshots: `DESIGN_SHOTS=.cache/shots/<name> bun test:e2e e2e/design-shots.e2e.ts` (the web build
  needs `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_DEV_LOGIN=1`, as `playwright.config.ts` does).
- **Two worktrees and e2e**: Playwright reuses running servers (`reuseExistingServer`), so two trees
  running e2e at once corrupt each other. Run e2e from one tree at a time, or use other ports.

## 3. State at handoff (2026-11-03)
### PR A — #53: merged
- Squash-merged into main as `e03360f` after CI run 41706095534 went green (lint, audit, unit, app,
  API, e2e chromium, latency step) and the last re-review (session-check fix) had no Critical or
  Important finding. Its records stay in `context/design/pr-a-*.md`.
- Left from A for B (Minor): `e2e/readme-shots.e2e.ts` opens pages with `browser.newPage()` without
  `openContext` cleanup (class 63; extend the lint selector or move it to the fixture); the
  `assistant.e2e.ts` toast flake has no stated cause in bug-lessons (class 20 row says "none yet").

### PR B — #54 (draft, base main)
- Done and approved: Task 3.1 Pressable (+haptics, per-role ARIA, Space, 48/44 minimum target),
  3.2 Text/Icon/Link (+ the lucide codemod), 3.3 Group/ListRow/SectionHeader, 3.4 ScreenHeader and the
  shell (rail on medium, rotation unlocked, insets), 3.5 Presence/Disclosure (+ inspector motion).
- A merged into B (`merge-a-into-b-report.md`), then main recorded as merged (`70f6842`: main's tree
  equals A's final tip, already in B). #54's CI was green on `420a933` (run 41678052705); the merge
  of A's last two commits was pushed at handoff — check its CI first.
- Parked minors from the 3.3–3.5 re-review (do first in B): N1 a static compact ListRow has no native
  min-height; N2 Disclosure close: set the height to the current measure before `withTiming` (first
  frame); N3 stale owner text in the spec (Disclosure row "4.3.7" → 4.2; ListRow "3.8/3.9" → 3.9;
  ScreenHeader `h-hit` → `min-h-hit` and gutter; the 3.10 plan bullet after `---`; the bug-lessons
  sweep text for Important 5); N4 the inspector takes touches during its 160 ms exit
  (`pointerEvents="none"` while exiting). From 3.1/3.2: Space double-fire relies on the caller's
  `preventDefault`; `checked="mixed"` typed for radio/switch; disabled Link reacts only to `disabled`.
- **Owner decided (2026-11-03)**: the 48 px top band stays on every top-level screen, Inbox and More
  included (variant A in `context/design/comps/top-band/`). Already as built; keep it.

## 4. Carried to PR B's QA round (re-check the way each was found, then its class)
- QA round 23 fixes: R23-01 zone not written on an unknown account (5xx first pull → Retry); R23-02
  offline Log out asks and names the unsynced count; R23-04 Enter after a paste; R23-06/07 preset names
  in the account's language, History names presets; R23-08 Day's screen-time failure line with Try
  again; R23-09/11/13c retry wording, the Connect line.
- Review fixes of A: preset edit with a shared name; a read-later text survives an outage;
  `API_ORIGIN` variants (case, slash, :443, LAN http, blank); a 3–5 s request loop is caught.
- A9: connect a **real** MCP client (Claude) from a signed-in browser; a signed-out browser with the
  widget blocked (the frame stays in its box, the "sign in first" link works and returns).
- Fix rounds 2–3: Log out while a slow logout answer is pending (typed id survives); Log out in one tab
  while another tab holds a newer session (its unsynced changes survive); "AI apps cannot connect"
  line on a plain-http LAN server.

## 5. What is left, in order
1. **Check #54's CI** on the tip; fix anything red (TDD, bug-lessons row). Do the parked minors listed in §3.
2. **PR B, the kit** — Tasks 3.6 Sheet/Dialog/Popover (+ QA21 M1 Enter submits a sheet's field), 3.7
   Toast/Tooltip (+ the offline pill and a toast stack, pill wraps in RU), 3.8 TextField/TimeInput,
   3.9 the controls (Button, IconButton, Chip, Tag, Segmented, Switch, Slider, CheckCircle,
   ProgressBar, CountBadge, Skeleton, EmptyState; + RadioChips sweep, the Pressable shape / disabled
   colours / small-visual pattern, toggle and select rows, keep the skeleton's 1.5:1 guard), 3.10
   Sidebar/TabBar (+ the header scroll-edge fill, the 4 px selected bar). Each task: brief from the
   plan, implementer, task review, fix round, re-review.
3. **PR B, the screens** — Tasks 4.1–4.13 with 7.1–7.3 folded in (Day as the notebook page with 4.4;
   the ink line and Week strip with 4.2/4.6; proposal highlight and logo with 4.7/4.12). Run 2–3
   implementers in parallel worktrees by feature folder; each screen gets its comp check, matrix shots
   and design review. The plan's pointers name every follow-up each screen owns (Now 4.3: `/add`
   focus, the composer grow-then-fade; Day 4.4: no next-day end, the notebook page; Task 4.5: close
   sheet copy/pickers/third footer button F-DAT-01; Week 4.6: the midnight block, lanes < 44 px;
   Inbox/Decisions 4.7: reason-specific "unavailable"; Presets 4.8: "Start from" verb, name refusal
   placement; Settings 4.11: Revoke 8 px, the sessions skeleton shift, the stale unsynced count).
4. **PR B close-out** — the batch checklist: full e2e (one tree at a time), the shot matrix and design
   reviews of every changed screen, a whole-branch code review (Opus), one light QA round including
   §4's list; fix (validated by tests, shots, review — no second QA round); carry the re-check list
   to C; CI green; squash-merge.
5. **PR C "Polish"** — Tasks 5.1 motion.ts, 5.2 check-off, 5.3 overlays/route transitions, 5.4
   reduced-motion and focus sweeps, **5.6 every latency case ≤ 100 ms** (the ceilings in
   `e2e/latency.e2e.ts` are regression guards now; R23-03), 6.1 document layer (+ phone-web `main` and
   skip link), 6.2 mobile-web baseline (+ the desktop window scroll), 6.3 update banner/manifest/icons,
   6.4 bundle splitting, layout shift, local CSP; 8.1 lint rule to error, 8.2 goldens, 8.3 README
   shots, 8.4 DESIGN.md from the shipped code, 8.5 CLAUDE.md design paragraph, 8.6 bug-lessons sweep,
   8.7 final verification. One QA round with B's carried list; fix and re-check until clean; CI green;
   squash-merge.
6. **Release**: tag v0.12.0 on main via `release.yml`, check the APK and the notes (debug-signed).

## 6. Verify on Android hardware (put in each PR description)
`rem` = 16 px sizes and fonts; the drawn switch's 48 dp target; ripple; haptics; status and navigation
bar colours in both themes; icon sizes after the 16/20/24 snap; the 48 dp minimum target; rotation in
landscape (the rail scrolls to Settings at ~844×390, the cutout and gesture area cover neither the rail
nor the content, a compact ListRow stays ≥ 48 dp); reduced motion.

## 7. Open items for the owner
- Tap latency 120–300 ms at 4× CPU (Task 5.6).
- Visual choices to confirm: Week blocks as a light tint with dark ink; icon tile `#0D0F15`.

## 8. How to resume
1. `git fetch`; check out `claude/pace-design-overhaul-b` (PR B). `bun install`, `bun lint`. Use a
   second worktree only for parallel screen implementers (one e2e at a time across trees).
2. Read this file, `overhaul-ledger.md`'s last 40 lines, the plan's task list, and the newest reports
   named in §2.
3. Check CI of #54 (GitHub MCP `pull_request_read` → `get_check_runs`).
4. Continue at the first unfinished step of §5. Keep checkpointing and updating this file.
