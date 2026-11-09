# Design overhaul — handoff (state and what is left)

Read this first if you are picking up the design overhaul in a new session. It describes the state
as of the last checkpoint, every standing instruction of the owner, and the exact next steps. The
full decision log is [`overhaul-ledger.md`](overhaul-ledger.md) (a copy of the previous controller's
working ledger; its last lines are the most recent rulings).


## 00. Session 2026-11-05/06 (opencode; controller Opus, implementers Sonnet)

**Owner's rules for this run:** PR B only (do not start PR C), never merge without the owner; no QA round;
the imported Hentrixz commits are untrusted; **budget ≈ $60 for the whole run** (cost per session is in
`~/.local/share/opencode/opencode.db`, table `session_v2`, column `cost`); implementers on Sonnet with full
briefs, **one review only, near the end, on Opus** (whole branch, incl. the import); **never run e2e or
Playwright locally — e2e runs only in the PR's GitHub CI**; tests must not depend on the environment (time
zone, locale); every deferred item is recorded here even if it is never done. Plugins (skills, agent
prompts) are cloned under `~/.local/share/agent-plugins/<owner>_<repo>`.

**Done (pushed):** safety scan of the import — nothing dangerous (`pr-b/import-safety-scan.md`); green-up of
the merged tree (`pr-b/s0-greenup-report.md`: eslint report read from a file, overlay helpers, badges on
`BadgeAnchor`, ratchets lowered); screens 4.1/4.2/7.2 card (`240e0c2`, `07930b1`), 4.3 Now (`83bfc2a`),
4.4 + 7.1 Day (`a6efb81`), 4.5 Task (`96d3338`), 4.6 + 7.2 strip Week (`095679d`). Reports:
`pr-b/task-*-report.md`. Per-task reviews were skipped on purpose (owner): the import was never reviewed
in depth either — the final Opus review covers both.

Done 2026-11-06 (owner asked for device details in sessions): Settings sessions show the real device. The server parses the stored User-Agent (`userAgentDetails`: browser + major version, OS + version where the UA carries it, Android model, form factor; unknown parts absent) and the phone app sends brand, model and Android version at login (`expo-device`; optional fields, D1 migration `0009`, old rows null). `GET /api/sessions` returns `device`, with `name` kept for old clients. The row title is the device ("Samsung Galaxy S23", "Chrome 131 on macOS"), the parts the title does not say go under it, and old rows fall back to their name. Left: no tablet icon in the kit (a phone browser gets the smartphone icon), no PWA/standalone detection (the UA does not differ), UA reduction hides macOS/Android model on some Chromes.

**Next:** 4.7 + 4.10 + 7.3, 4.8 + 4.9, 4.11 + 4.12 + 4.13; then B9 "spec completion" (the register below +
the environment-independence sweep); then the whole-branch Opus review and one fix wave; then push and
make CI green (e2e is first run there).

Done 2026-11-06 (owner decision, batch 9 item 1b): Now's task groups, their headers and the 3-row preview/«Show all» are replaced by one list with a labelled hairline between dated and undated tasks (`NowTaskGroups`, `Group` `boundaries`). The 4.3 «Show all» deferral about groups no longer applies.

**Fix wave and CI (2026-11-06, end of session):** the final review's findings are fixed (I1, M1 to M5, M7, M8 in
`1c5f631`, `7880e85`, `e02c90b`; M6 and M9 left: see `pr-b/final-review.md`, "Fix wave"). CI: checks green at
`e8ead2d`; **e2e red, 18 of 217 failed** after four rounds (run `42254526190`); the list and what is known of
each is at the end of `pr-b/final-review.md`. The first e2e round of the PR failed 45 tests; the specs had not
run against any screen. Class 137 in `bug-lessons.md`. A screen task that changes a flow greps `e2e/` for its labels in the same commit.

### Deferred register (every item a screen task left; the plan has the full note under each task)
| Task | Deferred | Plan note |
|---|---|---|
| 4.1 | `TaskList` paged (30 + «Show 30 more»), not virtualised (nested in the screen scroll); due and "left" are two meta parts on one line; `e2e/scale.e2e.ts` never run | plan §4.1 |
| 4.2 | typed start's Approve plays no `tick`; region budget is a 40 % scroll cap, no compact one-line running card / IconButton Stop / desktop shell indicator; budget e2e uses one running activity, not two proposals | §4.2 |
| 4.3 | medium width pushes a picked task (no inspector sheet); the form's close has no Escape hint in its tooltip; composer buttons keep their own round `LineButton`; proposal card (`ActionCards`) not rebuilt ("facts as ListRows"); filter cue is chevrons, not a gradient | §4.3 |
| 4.4 / 7.1 | [320 short label of `PeriodStepper` DONE batch 9 item 4, History uses it; Day/Week labels pass none yet]; no summary cell (stacked 24 h bar + legend); phone calendar/usage sections and the sleep card keep their old look; [rail row-aligned DONE 2026-11-09 (owner): a bar beside each row at its measured frame, now line inside the row that holds now; `dayRail(entries, now)` in `view-models/day-rail.ts`]; no "+1" for a third parallel band; no overlap footnote | §4.4, §7.1 |
| 4.5 | delete Undo is the toast, not in-place "Task deleted · Restore", focus not moved to the next row; no separate «Cancel the task» in ⋯; no ⌘↵ hint on Save; stats 2×2 at every width (no 4×1 at 720); repeat in stats, not meta; 100 subtasks not virtualised; project picked from a sheet, not a page field; footer at 320 unchecked | §4.5 |
| 4.6 / 7.2 | day strip not sticky; no edge fade / overscroll containment (hint text stays); [RULED: runs fold past 6 lanes, the 44 px target wins over spec's 3, see spec §5.6 built note]; [empty-week `EmptyState` and calendar error line DONE batch 9 item 2; still open: loading line] [DONE batch 9 item 1] the 23:56 e2e does not seed the account zone (depends on the host zone) | §4.6 |
| 4.7 | sheet has no medium detent; Accept is tonal small, Delete a plain button (no ⋯/swipe + inline Undo, the toast's Undo carries it); ↑↓ selection and ⌘⌫ not bound; «Open the line» does not focus the composer; no `review` folder (row lives in `features/inbox`); assistant-correction input not on `TextField` (waits for the `ActionCards` rewrite) | §4.7 |
| 4.10 | Undo grouped per task only; other undoable rows open a confirm (no long-press/swipe/⋯); ⌫ and ←/→/T not bound; snapshot dot 8 px (spec 6, no token); skeleton without the extra 300 ms | §4.10 |
| 3.6 / 3.8 | Sheet detents; dirty-form discard question; remaining raw inputs (assistant correction); half-typed time warning; counters; bug-lessons rows F-CMP-02/F-MOT-05/06 and F-CMP-03 (check) | HANDOFF §0 |
| tests | environment dependence: jest `app-state` time-zone case was host-TZ dependent (fixed in `0747db9`); sweep e2e + jest for host TZ/locale, pin the zone (account + Playwright `timezoneId`), bug-lessons class + guard | — |

| 7.3 | an activity created by a typed start is not highlighted (its row is the running card); `ActionCards` → `ProposalCard` rewrite still unbuilt; PNG icons regenerated here, check on a device | §7.3 |

| 4.8 | Projects: no «Archive · n» fold, no skeleton; project edit stays an inline form (no `Sheet`); no «Add task» in the project's empty state; presets: no drag handle / ⌥↑⌥↓, Save at the foot of the preset page (not the header), parent picked by chips | §4.8 |
| 4.9 | charts in one padded cell (not a `Group`); no 960 column / two-column grid; no tile → `ListRow` fallback; no «Start tracking» action; value column measured after first layout; `insights.e2e.ts` written, not run | §4.9 |
| 4.11 | phone per-kind notification rows with a channel sheet (the compact matrix stays at every width); time-zone, estimates and Devices rows keep their own blocks inside a cell (not one `ListRow` per value); «Выйти» as a centred row; Escape-on-confirm is the Button shortcut (web, e2e only); the Keyboard row lists today's single-key N and F (Alt+N/Alt+F of Q6 not built). [DONE audit-gaps: R22-02 a Sign out the server did not hear is kept and sent again; Devices skeleton is one device row] | §4.11 |
| 4.12 | `app/oauth/authorize.tsx` and the login card not restyled; onboarding's per-permission cards keep their layout. [DONE audit-gaps: «Sign in with the bot» is the filled button once the Telegram widget fails; Notifications row with its unread count in More (R22-24)]. [DONE tabbar-stack: F-AND-03 — More's destinations (Week, Projects + project, Insights, History, Settings, Notifications, Presets + preset, Decisions) live in `app/(tabs)/(more)/`, a Stack inside the More tab (`src/ui/more-stack.tsx`), so a phone keeps the tab bar with More selected; More is anchored under the first screen (cold link: `unstable_settings`; opened from another tab: a reset), so Back leads to More. Every address unchanged; the task page and signing in stay root screens. Tests: `more-stack.test.tsx` (real tab/More layouts), `route-files.test.ts`; e2e `layout.e2e.ts` phone case written, not run] | §4.12 |
| 4.13 | nothing deferred. [DONE audit-gaps: the Calendar hint pinned word for word; EN signs in and out with one pair (Sign in / Sign out) pinned in `glossary.test.ts`; R22-22 RU copy («Дневной сон», the Rest picker's own item renamed, «Закрыть со статусом «…»»)] | §4.13 |
| 5.6 | scale e2e: the fold's commit frame is under the 100 ms budget, not 32 ms (`e2e/scale.e2e.ts` takes p95 over ≥ 60 frames from the press and bounds the slowest frame at 100 ms) | §5.6 |

Later batches append their rows here.

## 0. Current session (2026-11-03, fork Hentrixz/pace-dev, branch `claude/vigilant-archimedes-kq5d4w`)
> **2026-11-04 update:** the three kit branches below and this section's commits were merged into PR B's branch (`claude/pace-design-overhaul-b`) without review or lint; see [`pr-b/imported-from-hentrixz.md`](pr-b/imported-from-hentrixz.md). "Nothing is merged" below describes the fork at the time.

Session stopped by the owner at a checkpoint. **Nothing of the kit wave is merged into
`claude/vigilant-archimedes-kq5d4w` yet** — it equals PR B's tip `a67cc50` + HANDOFF commits only.
All three kit branches start from `a67cc50` (B's tip) and are pushed to the fork:

| Branch (fork) | Hash | Status |
|---|---|---|
| `wip/task-3.6-3.8` | `7fd48e7` | Parked minors **done** (`aa43cfe`, lint-clean): N1–N4, Space owned by the kit on checkbox/radio/switch/tab, `checked="mixed"` checkbox only, `aria-disabled` disables Link. 3.6 **mostly done**: draggable handle (30 % / 800 dp/s), sheet travels its height, scrim fades in place, exits kept mounted (`OverlayPresence`), each close path → `onClose` once; Dialog 0.96→1; anchored Popover (flip, Escape, outside click); `visible`→`open` on 11 callers; ratchet design values 68→67. Deferred: detents, dirty-form discard question, Popover in pickers, the F-CMP-02/F-MOT-05/06 bug-lessons row. Review Focus 5 e2e written in `sheet-focus.e2e.ts`, **not run**. QA21 M1 **done**. 3.8 **partial**: TextField rewritten (`purpose`, touched gate, focus ring, `<label for>`), TimeInput on the same box, 5 raw inputs migrated; not done: estimate/subtask/assistant-correction/composer inputs, half-typed time warning, counters, F-CMP-03 row. **Red / unknown**: `7fd48e7` committed with `--no-verify`; last full lint failed on `TextField` complexity (refactored, lint not re-run); no e2e run; `task-3.6-3.8-report.md` not written. `bun test:app` 1104/1104 before the last TextField refactor. |
| `wip/task-3.7-3.10` | `077e60f` | 3.7 **done**: toast above measured chrome (`ui/float-layer.ts`) or an anchor, status region mounted (announces once), Close, pause on hover/focus; Tooltip 400 ms, hoverable, Escape, nothing on touch (`showsOnTap` removed); offline pill restyled, toast stacks above it, R23-13a (new e2e pass). Not built: swipe-dismiss, §6 motion (5.3). 3.10 **done**: `NavItem` with the 4 px bar, R23-14, name on its own line (64-char test), header scroll-edge hairline; Material tab bar, web nav links with `aria-current`, height published to the toast layer, `deadControls()`. Deviations: no rail haptics (spec §3.10), no filled tab icons. `bun test:app` 1097/1097 and lint clean at `715a1a8`; ratchets design values 66, kit primitives 9. **Red / unknown**: tooltip sweep in `overlays.e2e.ts` failed (hovered an off-screen button), fixed in `077e60f` but not re-run; `077e60f` committed with `--no-verify` (lint not run on its e2e edits); a 3.5 preview test once 1.5 px off under load (likely flake). Report: `context/design/pr-b/task-3.7-3.10-report.md`. Bug-lessons class 123 + 4 log rows. |
| `wip/task-3.9` | `4d30e8c` | 3.9 **done** (green): Pressable `shape` + small-visual pattern (parked N1 of 3.2), shared disabled colours; `RadioGroup` one tab stop everywhere (guard `radio-callers.test.ts`), chips 44 px; Chip, Tag + hue helpers, `pulse-dot` deleted, Segmented, Switch; `SwitchRow` = `ListRow` toggle (R23-10), ListRow `toggle`/`select`; Button `width`/`shortcut`, IconButton, bell badge on the glyph (R23-13b, F-DAT-10, 99+); CheckCircle, ProgressBar, Slider, Skeleton (1.5:1 guard kept), EmptyState; gallery section; bug-lessons class 123 (F-COL-09) + rows for 6/84/109. `bun lint` clean (ratchets 56 / 28 / 8), `bun test:app` 1101/1101, e2e worst-case, sync-state, composer, keyboard green. Partial: Tag `test.fail` markers in `worst-case.e2e.ts` stay (they match other text; 4.x). Deviation: destructive button = cell colour with a red ring (red on quiet-red fill read 4.31:1). Report: `context/design/pr-b/task-3.9-report.md`. |

Known merge conflicts: both 3.7/3.10 and 3.9 add bug-lessons **class 123** (renumber one); ratchet
numbers in `scripts/eslint-all.ts` (take the lowest the merged tree measures); 3.9 renamed Button/
IconButton props used in `ui/sheet.tsx`, `ui/sheet-actions.tsx` (3.6), `ui/sidebar.tsx` (bell
`place="sidebar"`), `ui/sync-frame.test.tsx` (`EmptyState title=`); 3.9's `icon-button.tsx` must
drop `showsOnTap` (3.7 removed it); tab bar / rail badges should move to 3.9's `BadgeAnchor`;
parked N1 touched by both 3.6-3.8 (ListRow) and 3.9 (Pressable).

**Next step** (strictly in this order): merge the kit branches one at a time — suggested 3.9, then
3.7-3.10, then 3.6-3.8 (the reddest last) — after each: `bun lint` + `bun test:unit` + `bun test:app`,
commit, push to `claude/vigilant-archimedes-kq5d4w`, update this section. Then finish 3.6/3.8's
deferred bullets, run the e2e files the kit touched. Then the screens 4.1 → 4.13 with 7.1–7.3 folded
in, one implementer at a time. Then the whole-branch review (Opus), the full e2e, the PR, CI green.

**Owner rules for this run**: Sonnet for small/mechanical tasks and narrow re-reviews; Opus for kit and
screen tasks and the whole-branch review. Checkpoint commit + push after every finished task or merged
branch (even red), this section updated before each push. Implementers push to `wip/<task ids>`.
Strictly sequential: one implementer at a time, no parallel worktrees (the kit wave above was the
last parallel one). **No QA round** in this run. Note: the Agent tool's worktree isolation created
the trees on `main`; each implementer had to reset onto B's tip — brief the next ones to check
`git merge-base --is-ancestor a67cc50 HEAD` (or the current branch tip) first.

**PR**: not opened yet. This session cannot reach iamnalinor/pace-dev through the GitHub tools (a
same-named repo is attached); open it from the compare link:
https://github.com/iamnalinor/pace-dev/compare/claude/pace-design-overhaul-b...Hentrixz:pace-dev:claude/vigilant-archimedes-kq5d4w

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
