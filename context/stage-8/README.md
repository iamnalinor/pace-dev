# Stage 8 — paused 2026-10-14

Feedback round 4 (`context/feedback-4.md`). The plan is `plan.md`; the controller's log of every
dispatch, review, ruling and owner decision is `ledger.md`; each task's requirements are in
`briefs/`. `global.md` holds the rules every implementer got. Later owner decisions in the ledger
override the plan and the briefs where they differ.

## Split into three PRs (owner, 2026-10-14)

- **PR 1** (branch `claude/new-session-sy3n4a` → main, then release `v0.10.0`): Tasks 0, 1, 2, 3,
  3b, 3c, 3d, 4, 5, 6, 7, 11, 15, 16 — all on the branch, reviewed, tests green — plus the
  notification pool (8 + 8b), 18 (bug-class sweep), 17 (docs), one QA round and a whole-branch
  review.
- **PR 2**: 12 (proposal cards in the app), 13 (bot proposals), 5b (apps during an activity, the
  day's screen time), 10 (wipe and delete confirmed in Telegram).
- **PR 3**: 8c (poll background check, battery step), 9 (sessions, login notices), 14 (automatic
  sleep), 19 (self-hosting), 20 (WebSocket).

## Where it stopped

- `claude/new-session-sy3n4a` at `7e4aead`: everything listed for PR 1 except the pool, 18 and
  17. Task 6's fix round (`d85199c..7e4aead`) is not re-reviewed yet.
- The notification pool (8 + 8b) is on `claude/new-session-sy3n4a-pool-wip` (`4980726`, based on
  `98bcd6e`): the first review's 7 Important items and the Minors are fixed (see
  `task-8-review.md`); not yet re-reviewed. It still needs: a rebase onto the PR 1 branch (Task 6
  changed Day and Now), the bug-lessons row for Important 2/3, the re-review, e2e, screenshots
  of the Settings push picker.

## To resume

1. Rebase the pool onto the PR 1 branch (DO migration 0002, D1 0004 regenerated with
   `bun db:generate`), finish the remaining items above, re-review, merge into the branch.
2. Re-review Task 6's fix round.
3. Task 18, then Task 17.
4. QA round (`docs/qa.md`) and a whole-branch code review; fix until only cosmetic findings remain.
5. Open PR 1, CI green, squash-merge, release `v0.10.0` (Release workflow, tag on main), check the
   release and that the APK reached Telegram.

The owner has set `TELEGRAM_RELEASE_CHAT_ID`, `GOOGLE_SERVICES_JSON` and
`FIREBASE_SERVICE_ACCOUNT` in GitHub; all keys stay in GitHub only.
