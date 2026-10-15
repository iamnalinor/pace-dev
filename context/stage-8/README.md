# Stage 8 — PR 1 final verification (2026-10-15)

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

## Current PR 1 state (2026-10-15)

- `claude/new-session-sy3n4a` (see `git log`): everything for PR 1 is merged and reviewed —
  Tasks 0–7, 11, 15, 16, 3d and the notification pool (8 + 8b) — except Tasks 18 and 17.
- Task 18's sweep is integrated in the PR 1 working branch. The log and guards now cover 24 bug
  classes; the later classes include cross-session phone privacy, secret-free computer setup and
  signed-out language. `context/bug-lessons.md` records each sweep and guard.
- Task 17's architecture, testing and QA documentation is updated for PR 1's actual scope.
- Exploratory QA rounds 8 and 9 found no new browser issues after fixes; their reports are
  `context/qa-round-8.md` and `context/qa-round-9.md`. Code review findings were addressed with
  regression tests. Android-only flows still need device verification after the APK release.
- PR 1 is [#42](https://github.com/iamnalinor/pace-dev/pull/42), still draft until exact-head
  checks and CI pass. PR 2 stays out of scope.

## To resume

1. Finish exact-head lint, unit, API, app and e2e checks; fix any failure and update #42.
2. Mark #42 ready, wait for CI, squash-merge, and dispatch `release.yml` for `v0.10.0`.
3. Verify the GitHub release, APK artifact and Telegram delivery. Stop; PR 2 is a separate task.

The owner has set `TELEGRAM_RELEASE_CHAT_ID`, `GOOGLE_SERVICES_JSON` and
`FIREBASE_SERVICE_ACCOUNT` in GitHub; all keys stay in GitHub only.
