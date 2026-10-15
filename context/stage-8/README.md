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

## Where it stopped (2026-10-15)

- `claude/new-session-sy3n4a` (see `git log`): everything for PR 1 is merged and reviewed —
  Tasks 0–7, 11, 15, 16, 3d and the notification pool (8 + 8b) — except Tasks 18 and 17.
- Task 18 (bug-class sweep) is on `claude/new-session-sy3n4a-sweep-wip` (pushed from the worktree branch). Done:
  the review leftovers of the pool and the time bar, FCM only between the same Firebase project (server names its
  project, the app compares, mismatch → poll for good), classes 1–10 and 13 swept with guards. Remaining: classes
  11, 12, 14, 15 (check other code for instances; guards exist), the Log's "Swept?" column in
  `context/bug-lessons.md`, a full `bun lint` / unit / api / app run, then a task review of the sweep.
- The owner asked to stop after the sweep; PR 2 waits (owner: finish PR 1 first, one agent at a time, PR 3 later).

## To resume

1. Finish Task 18 on its branch (above), review it, merge into `claude/new-session-sy3n4a`.
2. Task 17 (docs).
3. QA round (`docs/qa.md`) and a whole-branch code review; fix until only cosmetic findings remain.
4. Open PR 1, CI green, squash-merge, release `v0.10.0` (dispatch `release.yml` with the tag), check the release
   and that the APK reached Telegram.
5. Then PR 2 (Tasks 12, 13, 5b, 10; briefs include the owner's framing: the assistant's actions wait for one
   approval, with a follow-up thread), one agent at a time.

The owner has set `TELEGRAM_RELEASE_CHAT_ID`, `GOOGLE_SERVICES_JSON` and
`FIREBASE_SERVICE_ACCOUNT` in GitHub; all keys stay in GitHub only.
