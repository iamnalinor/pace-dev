# Review: PR A CI fix (hold the session's senders while a 401 is checked)

Range: `7bb5d0b..1240244` (one commit, `fix(client): hold every sender of the session while a 401 has it checked`).
Read: CLAUDE.md, bug-lessons classes 63, 75, 108, 118, the diff, and the surrounding `auth.ts`, `auth-session.ts`,
`sync-transport.ts`, `deadline.ts`, `live.ts` and `e2e/support/fixtures.ts`.
Run (in a temp worktree at 1240244, since removed): `vitest run src/create-client.test.ts src/live.test.ts src/api-client.test.ts`
passed 60 of 60. Mutation checks:
- Removing the hold in `credentialFor`: both new `create-client` cases fail.
- Removing `sessionCheck` in `live.ts`: the new `live.test.ts` case fails.
- Removing the `me`/logout exemption in `pending`: **all tests still pass** (see m2).

The full e2e suite was not run, and neither was `bun lint`, as briefed.

## Strengths

- The fix targets the real cause, the gap between a 401 and `me`'s answer, at the two places that send the
  token (`api-client.ts`, `live.ts`). The implementer swept for other senders (`Authorization` and `pace.auth.`
  appear only there), which follows the sweep rule of class 75.
- There is one owner of the check (`sessionChecks`). Concurrent 401s collapse into one check through the
  `checking !== undefined` guard and `??=`. The socket's session-ended close joins the same check
  (`deps.checks.check()`) instead of sending a second `me`.
- A held call reads the token only after the check answers, so every outcome is handled:
  - The session is kept: the call goes out with the same token, once.
  - The session ended: the call is refused locally with 401 `auth/unauthorized` and never reaches the network.
    That local refusal does not call `onUnauthorized`, so there is no loop.
  - A Log out or a login happened meanwhile: the call sends whatever is current.
- No deadlock on the check's own path:
  - `me` and logout are exempt.
  - Logout always passes `credential`, so it never consults the hold.
  - `session.signOut` makes no API call.
  - The check's own `me` starts synchronously, before `checking` is assigned, so it could not wait on itself
    even without the exemption.
- The live waiter re-checks `line.current() === undefined` and `run.isRunning()`. Several waiters (stop and
  start during a check, retries) therefore still yield one socket. The `live.test.ts` case pins this.
- The tests verify real behaviour. Each new case fails under the mutation that removes the code it guards. The
  stale-401 case checks the header and the single send. The e2e is deterministic: it holds the pull and slows
  `me`, so it does not depend on a loaded runner.
- The bug-lessons entry and table row are complete: why the tests missed it, the class (75), the sweep and
  the guard.

## Issues

### Critical

None.

### Important

**I1. A held call ignores its caller's abort, so a hanging `me` stalls the sync and every held caller with no
bound.**
- Where: `packages/client/src/api-client.ts:152` (`await checking;`), together with
  `packages/client/src/create-client.ts:279-281` (`me` has no deadline) and
  `packages/client/src/sync-transport.ts:54-60`.
- What: `credentialFor` waits on `checking` without looking at `callOptions.signal`. The HTTP sync's
  `withinTimeout` ends a call only by aborting its signal. It does not race the call. `me` itself is sent with
  no signal and no deadline. So when `me` gets no answer (the network drops packets silently, a captive portal,
  a server that stalls), the following happens:
  - A held pull or push never reaches its 30 s `SyncTimeout`. The run stays in flight, `syncing` and the
    first-sync cover stay up (the QA round 17 I2 symptom), and the offline line is never shown.
  - `sync.hold()` waits on that run. So ending this device (`endThisDevice`, class 75) waits too. Its DELETE
    is also held.
  - Screen reads under `withinDeadline` do give up at 15 s, because it races. But their request stays queued
    behind the check.
  - Before this change, the same silent network only stalled `me`. Now it stalls every caller that needs a
    session. Aborts by unmount are not honoured during the wait either. The fetch later rejects at once
    because its signal is already aborted, so nothing is sent, but the caller's promise stays pending until the
    check answers.
- Why it matters: the wait is unbounded in practice. It ends only when the platform's own TCP timeout fires
  (minutes) or never. This is the "loading for good" class (62 and 64) that the deadlines were added to close.
- Ruling: a bound is needed. The smallest safe fix has two parts:
  1. **Bound the check.** In `sessionChecks.check`, send `me` with a signal and the existing
     `REQUEST_DEADLINE_MS` (15 s). This needs either `me(signal?)` threaded to `api.call(endpoints.me, {},
     { signal })`, or a race whose loss resolves `err("no-answer")` and does not reject. A timed-out check signs
     nothing out, because only a 401 does, and it clears `checking`. Held calls then **proceed** with the
     current token. Proceeding is the right choice, not refusing:
     - The worst case is one more 401 for a session that really ended, which starts the next check. That is
       at most one check per 15 s while the network is silent, and it stops once `me` answers.
     - Refusing would fail good calls on a live session because of a slow network.
  2. **Honour the caller's signal while held.** In `credentialFor`, race the wait with
     `callOptions.signal`, rejecting with the signal's reason, or with an `AbortError` when there is none. That
     way `withinTimeout` maps it to `SyncTimeout`, and an unmount releases at once. Also swallow a rejection of
     `checking` itself, as `live.ts:322-326` already does (see m1).
  3. Tests (fake timers): a `me` that never answers releases a held call after the deadline, and the call is
     sent once. A held pull whose signal aborts rejects as `SyncTimeout` before the check answers.

**I2. The new e2e's route handlers and context are released only on the success path (class 63).**
- Where: `e2e/live.e2e.ts:323-367`.
- What: the test builds its own `browser.newContext()`. The shared fixture in `e2e/support/fixtures.ts` only
  unroutes the default `page`, so it does not cover `tab`. `tab.unrouteAll({ behavior: "ignoreErrors" })` and
  `context.close()` run only if every assertion before them passes. If the test fails early, the two handlers
  are left behind:
  - If `pulling`, `goto` or `endBrowserSessionElsewhere` throws, the `/api/sync/pull*` handler waits on
    `ended.promise` forever.
  - If a `toHaveURL` or `toBeVisible` assertion times out, the `/api/me` handler can be inside its 1 s delay.
    Its `route.continue()` then lands after the test.
- Why it matters: this is the failure that, in A9 fix round 3, threw "Test ended" outside any test, failed the
  run and left 11 tests not run. The comment "Its handlers end with the page" holds only on the green path.
  The test above it, at line 314, has the same shape. It is older, but it is the pattern copied here.
- Fix: put the body in `try { ... } finally { ended.resolve(null); await tab.unrouteAll({ behavior:
  "ignoreErrors" }); await context.close(); }`. Better, give a `context`/`newPage` helper in
  `fixtures.ts` the job of unrouting and closing every context a test opens, so the guard covers the class.
  Sweep the other `browser.newContext()` tests in `e2e/` for the same gap.

### Minor

**m1. A rejecting check would fail every held call with the check's error.**
- Where: `packages/client/src/api-client.ts:152`, `packages/client/src/create-client.ts:294`.
- What: `live.ts` catches a rejected check. `credentialFor` does not, so every held call would reject with
  `me`'s error instead of its own outcome. `void check()` in `heard` would also be an unhandled rejection.
  `meOf` currently catches everything and `signOut` uses `tryStore`, so neither happens today. Both become live
  as soon as I1's deadline is added as a race that rejects.
- Fix: `await checking.catch(() => undefined)` in `credentialFor`, and make `check` resolve to a `Result`
  whatever happens (the type already says `Result`).

**m2. No test pins the `me`/logout exemption.**
- Where: `packages/client/src/create-client.ts:296-297`.
- What: replacing `pending` with `() => checking` leaves every test green. Today the check's own `me` is safe
  only because it reads `pending` synchronously, before `checking` is assigned. A future `await` added before
  `api.call` in `meOf` (for example `await session.ready`) would deadlock the check with no test failing. The
  exemption is the real guard, and it is unpinned.
- Fix: a `sessionChecks` or `createApiClient` test that calls `endpoints.me` (and `auth.logout` without a
  credential) while a check is pending, and expects it to be sent at once.

**m3. The startup `me` does not go through `sessionChecks`.**
- Where: `packages/client/src/create-client.ts:358`.
- What: the bootstrap's `auth.me()` is not a tracked check. If the first pull's 401 arrives while that `me` is
  on its way, a second `me` goes out, and calls are not held behind the first one. This is not a regression
  (two `me` calls existed before), but it is the same gap at start-up, which is the case this fix is about.
- Fix: `await checks.check()` there.

**m4. One more microtask on every call (performance, ruled harmless).**
- Where: `packages/client/src/api-client.ts:183`.
- What: `await credentialFor(...)` now starts `fetch` one or more microtasks later than before, even with no
  check in flight. There is no macrotask, no timer and no I/O wait. The delay is sub-microsecond against a
  network round trip. No tap-to-frame path waits on an API call, because actions integrate locally first
  (class 108, Task 2.5). So this does not breach the responsiveness budget, and the hot path is not
  measurably slower.
- Optional fix, for zero change when idle: if `sessionCheck` returns `undefined`, keep the old synchronous path
  and only `await` when a check exists.

**m5. Extra waiters when no socket can open.**
- Where: `packages/client/src/live.ts:346-348`.
- What: `isWaitingForCheck` runs before the `run.isRunning()` and `createSocket` checks, so a stopped channel
  still schedules a waiter. The waiter does nothing (`connect` returns early), so this is harmless.
- Fix: optionally check `run.isRunning()` first.

## The other side (traced)

- **Server.** It answers 401 for an ended session, and closes the socket with `LIVE_SESSION_ENDED`. Nothing on
  the server changed, and nothing needed to.
- **Client after the end.**
  - `me`'s 401 calls `signOut`, which clears the cached token synchronously and sets `hasEnded`.
  - Held calls throw locally with 401 and send nothing, and `onUnauthorized` is not called for them.
  - The socket waiter finds no token and opens nothing. The close path's `check()` returns not-ok, so
    `live.start()` is not called.
  - The sync's next run is refused locally.
  - The network goes quiet. The new `create-client` cases (the bell is never sent) and the e2e (nothing after
    the end except `me`) pin this.
- **UI.** The gate shows the login card with "ended on another device" (the e2e asserts `ANOTHER_DEVICE`), with
  no request loop. The stale-401 case stays signed in, with the call sent once.
- **Class 118.** No follow-up after an await navigates. The UI change is driven by the auth store.

## Declined to judge

- Whether the e2e is red on 7bb5d0b and green over many repeats. I did not run e2e. The report states it was
  red first.
- Hermes/React Native microtask scheduling for m4. The ruling assumes native promise semantics. Even with RN's
  `setImmediate`-based Promise polyfill, the delay stays below a frame and only applies to network calls.
- `bun lint` and dependency-cruiser results. They were not run in this review. No new cross-package imports
  were added: `create-client.ts` imports only `@pace/core` types.

## Assessment

Ready to merge: **With fixes.** Fix I1 (bound the check and honour the caller's signal while held) and I2 (the
e2e's handlers and context released in `finally`). Both are small. m1 belongs with I1. m2 is a cheap guard and
worth adding in the same change.
