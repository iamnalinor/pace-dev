# PR A: CI fix report (run 41668309388)

## The red

CI run 41668309388, job 126036165340 (tip 7bb5d0b). Lint, unit, app and API passed. One e2e failed:
`e2e/live.e2e.ts:293` "a session ended from another device says 'another device' in every open tab
(fix round 5 V1)". Its `refused` list held `http://localhost:8787/api/notifications?limit=50`: a tab
sent the bell's read with the ended session, and the 401 came back after both tabs showed the login
card.

## Root cause

When a call got a 401 for the session in use, the client started the `me` check, but every other
sender kept sending the session until `me` answered. A tab still starting kept going in that gap
and read the bell with the ended token.

## The evidence, from the run's trace (artifact 13247724808)

The second tab (`/settings`) was still in its signed-in `bootstrap` when the test ended the session,
right after Log out became visible. In the order the tab sent them:

1. `GET /api/sync/pull?since=1` → 401. The `onUnauthorized` handler started the session check.
2. `GET /api/me` → 401. The check was on its way.
3. `bootstrap` did not wait. Its `syncNow()` resolved with the failure, and `zoneSettled()` and
   `pool.refresh()` followed. `GET /api/notifications?limit=50` went out with
   `Bearer WGmGony…` (the ended token) before the tab had processed `me`'s answer.
4. `me` signed the tab out and the login card showed. The notifications read was slow (85 ms waiting
   at the server). It answered 401 after the test attached its response listener.

The network timestamps alone suggested that the read went out after `me` answered. The trace's
order of events and a deterministic reproduction (below) showed instead that it went out while the
check was still pending in JavaScript.

## Reproduction

- The existing test passed 20/20 locally on the headless shell with 2 workers and `--repeat-each
  20`. The race needs a loaded runner.
- A deterministic test, now committed: `live.e2e.ts` "a tab still starting when its session ends
  sends nothing more with that session while it checks it (CI run 41668309388)". It holds the
  starting tab's first pull until the session has ended elsewhere, slows `me` by 1 s and records
  every request after the end that carries the token. Before the fix it was red with exactly
  `/api/notifications?limit=50`, plus a second pull.

## The fix (client, one rule for both senders)

- `packages/client/src/create-client.ts`: `sessionChecks` replaces `sessionCheck`. It has one
  `checking` promise for the check under way. It offers `check()` (start or join), `heard()` (a
  401) and `pending(endpoint?)` (the promise to wait for; never for `me` or the log-out). The
  socket's session-ended close now joins the same check instead of running a second `me`.
- `packages/client/src/api-client.ts`: the new `sessionCheck` option. A call that needs a session
  and names no credential of its own waits for a check under way. It then reads the token that is
  current: the same one if the session survived the check, none if it ended. With none, the
  existing `sessionEnded` guard refuses the call locally with 401 `auth/unauthorized` and nothing is
  sent.
- `packages/client/src/live.ts`: the new `sessionCheck` option. A (re)connect during a check waits
  for the answer and then connects with whatever session is current. It does not connect if the
  channel was stopped meanwhile or a start since already connected it.

This keeps the test's rule exact. After the tab learns of a possible end (its first 401), it sends
nothing more with the session until the check decides. Once the session has ended, it sends nothing
at all. The only request that can still be refused is the one that was already in flight when the
session ended. No single in-flight 401 needs to be accepted, so the test is unchanged.

## Contract, both sides

The server's rule is unchanged: a revoked session gets 401 on every call and a 4401 close on its
socket. The client now treats a 401 for its current session as "suspect until `me` answers". It
holds every request that carries that session (HTTP and socket) for that time. A session that
survives the check (a 401 the server got wrong) sends the held calls with its token. A test pins
this case.

## Sweep

The token leaves the client in two places only: `Authorization` in `api-client.ts` and
`pace.auth.<token>` in `live.ts`. Both now wait for a check under way. The callers that drove the
leak (`bootstrap`'s `pool.refresh`, `AppState` resumes, the live-connect pool refresh, the
notification feed's `receive` → `refresh`, the sync loop) all go through the API client, so the
one hold covers them.

## Tests (red first)

- `create-client.test.ts`: "sends nothing more with the session while a call's 401 / the socket's
  close has it checked, and nothing once it ended". Both cases were red, with
  `['/api/notifications']`. A third test, "a call made while a 401 has the session checked goes out
  once it proves alive", guards against holding too much.
- `live.test.ts`: "opens no socket with the session while a check of it is under way, and one after
  a check that kept it". Red before the fix with 2 sockets.
- `live.e2e.ts`: the deterministic e2e above.
- `context/bug-lessons.md`: class 75 has a new rule, "the check after a 401", and the log has a row.

## Verification

- `bun lint`: clean (0 errors; the 74 warnings were there before).
- `CI=1 bun test:unit`: 878 + 521 passed.
- `bun test:app`: 910 passed (121 suites).
- e2e on the headless shell, `--project chromium`, `CI=1` (2 workers):
  - live, login, sessions and sync-state: 65 passed.
  - The failing test plus the new one with `--repeat-each 10`: 20/20 passed.
  - The full chromium project: 196 passed in 21.4 min.
- CI for the pushed tip: the run on PR #53, reported in the hand-back.

## Concerns

- A call made while `me` hangs now waits as long as `me` does. The API client has no request
  deadline. Before the fix, that call would have gone out and got its own 401. Such a hang starts
  right after the server answered a 401, so it is unlikely, but nothing bounds it.
- No reviewer agent was dispatched (the brief said not to). The CLAUDE.md review through
  `superpowers:requesting-code-review` (with `typescript-reviewer` and `silent-failure-hunter`) is
  still owed for this change.

## Fix round 1 (review: `pr-a-ci-fix-review.md`, 0 Critical, 2 Important, 5 Minor)

- **I1 (bound the check, honour the caller's abort).** `sessionChecks` (now in `session-checks.ts`)
  sends the check's `me` within `REQUEST_DEADLINE_MS` (15 s, `withinDeadline`; `auth.me(signal?)` passes
  the signal to the request). A check that times out signs nothing out (only a 401 does), clears itself
  and answers `err("session-check/no-answer")`; held calls then go on with the session in use. Every
  held wait (`heldUntilChecked` in `held-call.ts`) also races the call's own signal and rejects with
  its reason (an `AbortError` when there is none), so the sync's timeout and an unmount release it at
  once. Tests: the deadline case (fake timers: nothing sent before 15 s, sent once after, still signed
  in) and the abort case (aborted while held and before it began: rejected, nothing sent).
- **I2 (the e2e's handlers and context).** A shared fixture: `openContext` in `e2e/support/fixtures.ts`
  opens a test's own contexts and, when the test ends either way, unroutes every page and closes them.
  Every `browser.newContext()` in `e2e/` moved to it (`live.e2e.ts` and `design-shots.e2e.ts`, whose
  `withPage` releases its context through the same `releaseContext`). The new test resolves its held
  pull in `finally`. A lint rule (`OWN_CONTEXT`) refuses `.newContext(` in e2e test files.
- **m1.** A check that rejects is caught by the held wait (the call goes on with its own outcome) and
  by `check`, which resolves to a `Result` whatever happens: no unhandled rejection. Test in
  `api-client.test.ts`.
- **m2.** `create-client.test.ts` "`me` and a log-out are never held behind the check under way";
  checked against the mutation that drops the exemption (it fails).
- **m3.** The start's `me` goes through `sessionChecks`, as a check that does not hold: holding at
  start would make every cold start's first sync and socket wait one round trip for `me` (eighteen
  sync and peer-tab tests that open the socket at once went red when it held). A 401 heard while the
  start's `me` is on its way joins it (no second `me`) and makes it hold from then on. Test: "the
  start's `me` is the check…".
- **m4.** Not taken (optional, ruled harmless): one more microtask per call when no check is under
  way.
- **m5.** A stopped channel schedules no waiter (`!run.isRunning()` first). Test in `live.test.ts`.
- `bun lint` clean; `CI=1 bun test:unit` 878 + 527 passed; `bun test:app` 910 passed; e2e live,
  login, sessions and sync-state 65 passed; the two live tests `--repeat-each 10` on the headless
  shell 20/20.

