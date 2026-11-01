# Stage 8 — feedback round 4

Feedback round 4 (`context/feedback-4.md`) shipped as three PRs: PR 1 (`v0.10.0`, #42), PR 2
(`v0.11.0`, #44) and PR 3, the infrastructure part, called phase C. Phase C's plan is
`phase-c-plan.md` (its Rulings section wins over the briefs); its controller's log, task briefs,
reports and reviews stayed in the working checkout's `.superpowers/sdd/phase-c-plan/` (not
committed; `progress.md` is the log, the plan's rulings and the bug-lessons rows carry what lasts).

## Phase C (2026-11-01)

**Part 1, merged as #47** (Tasks 1–9): self-hosting (`GET /api/instance`, `X-Pace-Protocol` with
`426 client/outdated`, Change server on the Android login screen with the token bound to its
server, the versions screen with only Log out, `docs/self-hosting.md`); one session system (kind,
name and place on every session, `GET/DELETE /api/sessions` with MCP grants, sign-in notices in
Telegram with "Not me", one message for a deep-link login, Devices and sessions inline in
Settings); sync over the live socket (`pace.v2` push, pull and unasked events, v1 kept, one client
code path with HTTP as fallback, sockets closed with their session); the background check every
~15 minutes. QA rounds 15 and 16, bug classes 47–52.

**Part 2, this PR** (Tasks 10–15 and the fix waves): the battery step only while the phone polls
(Task 10); the phone uploads when it was really in use and how far it read (11); the pure
automatic sleep rules (12) run in the user's store, the phone's sleep card gone, every step in the
assistant log (13); the sync's id limit raised to 128 and a one-time re-pull from 0 on every
installed client so the long-id events their cursor skipped arrive; QA rounds 14–16 leftovers
(14, 15: among them ✕ drops the New task draft, and a series without a start begins its later
instances at 00:00 of their day; a series made before keeps its creation minute until it is
made again); the docs pass. The `sessions.label` contract (drop the column)
is the next release's first migration (`TODO(sessions-label-contract)` in `docs/architecture.md`).

**Left for the owner** (product calls, not decided here): kind groups in the sessions list (QA 15
L16); whether an HTML 404 on `/api/instance` should block as "not a Pace server" (QA 16 L11).

**Needs the owner** (cannot be verified in this environment):

- an Android phone without Google services: background check delivery within ~15 minutes, the
  battery exemption dialog and the maker's autostart page (`Battery.kt` is compiled only in CI's
  APK job), Change server against a self-hosted URL, the versions screen against an older server;
- a real Telegram login from a phone and from a browser: one message each, "Not me" ending it;
- `PACE_VERSION` showing the tag in `GET /api/instance` after `deploy.yml`;
- a week of production data replayed through the sleep rules (bug class 39: a day of frequent
  use never yields a sleep);
- the first start of the updated app on an existing install: one full re-pull, then normal pulls.

## History: PR 1 final verification (2026-10-15)

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
