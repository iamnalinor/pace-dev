# Re-review: PR A, A9 fix round 3

Range c94d37b..7924533 (15 commits, 2 of them wip checkpoints). Inputs: `pr-a-a9-review.md`, the
"Fix round 3" section of `pr-a-a9-report.md`. Read only: the diff, the touched modules and their
callers were read. Two script tests were run (`bun test scripts/no-focused-tests.test.ts
scripts/web-headers.test.ts`, with and without `CI=1`): 4 and 2 pass. No e2e, jest or API suite was
run here; the report's counts are taken as the implementer's.

## Per item

| Item | Addressed | Regression | Notes |
|---|---|---|---|
| CI blocker | Yes | None | `RuleTester.itOnly = it.only` removed from both files; RuleTester needs it only for a case marked `only`. Guard below. |
| I1 | Yes | None | Rule and tests as asked. |
| I2 | Yes | None | e2e and class 121. |
| m1 | Yes | None | `name === null` now reads as loading. |
| m2 | Yes | None | CSP has `frame-ancestors 'none'`, test pins it. |
| m3 | Yes | None | Both codes mapped explicitly, with EN and RU text. |
| m4 | Yes | None | Owner step moved under "Release round", with the `curl -sI` check. |
| m5 | Yes | None | Class 119 holds the testing half, says its guard is procedural, and points to class 81. |
| m6 | Yes | None | Log row, CI step, no ceiling changed. |

## The points asked about

**Focused-test guard (`scripts/no-focused-tests.test.ts`).** It catches the four spellings:
`\b(?:it|test|describe|context)\s*\.\s*only\b` covers `it.only`, `test.only`, `describe.only` and
`test.describe.only`; `\bitOnly\b` and `\bonly\s*:\s*true\b` cover RuleTester. A self-test pins
three positives and a negative (`"reads only the first line"` is not flagged). The word `only`
alone, or `only: false`, is not matched. The sweep covers packages and apps `src`/`tests`,
`scripts/**` and `e2e/**` (so the API `tests/*.int.test.ts` too). It skips only its own file. It
reads files instead of the runtime, so `CI` does not matter. Limits, none blocking:
- The match is per line, so `it\n.only(` is missed (Playwright's `forbidOnly: isCi` and Bun's CI
  refusal still catch it in CI).
- It would flag a comment or string that contains `x.only` or `only: true`. Today there is no such
  hit.

**I1.** `dropLocalCopyOnOwnSignOut` clears via `resetLocalData()` only when
`runtime.auth.isSessionStored()` is false. That reads `sessionStore.get()` through `tryStore(..., null)`
(`auth-session.ts:142`), so a throwing store reads as "nothing stored" and the copy is emptied
(fails toward privacy). Other-tab case: tab A logs out while tB is stored. `signOut` keeps tB (it
clears only a store that holds the leaving token), the check sees tB, and the copy and B's outbox
stay. The tests are the three asked for: a counter-test that expects one pending event and a
store id left (and `shared.get()` still `tok_other_tab`), the M1 case with no session stored, and
the unreadable store. The stale path is unchanged (`dropLocalCopyIfOwned`). Remaining residual,
by design: a store that is unreadable only at that instant and holds a session wipes the copy.
Observation: the "keeps" test waits a fixed 50 ms before asserting that nothing happened. That is a
weak negative wait, not a flake source (a late wipe would be missed, not invented).

**I2 e2e and the new class.** `e2e/oauth-consent.e2e.ts` "a frame the widget loads stays in its own
box…" at 390x844 stubs `telegram-widget.js` with a 600x300 iframe (and the frame's page with a block
text). It asserts: the frame stays within `consent-card`'s horizontal extent, does not overlap
"Can't see the Telegram button?" or the "Sign in to Pace first" button, and the button takes the
click (URL goes to `/login?next=`). The `consent-card` testID was added to the card. It fails
against the old layout: the report states frame x = -105 px with `telegram-widget.web.tsx` from
3c05b49 (the old file was not re-run here; the assertions on `x >= card.x` do fail for that value).
The new class is **121, "Content we do not control laid out without a box of its own"**, with
bug, missed-because, rule (a box of its own for any third-party frame), and a sweep (the Telegram
widget is the only third-party frame; the web login shares the component) plus this test as guard.

**m2 headers.** `apps/app/public/_headers` has `...; worker-src 'self'; frame-ancestors 'none'` on
the `/*` CSP line, and `X-Frame-Options: DENY` stays. `scripts/web-headers.test.ts` parses the file
(rule `/*`, indented lines) and pins `x-frame-options` = `DENY` and a `frame-ancestors 'none'`
directive in the CSP. The built output has it too: `apps/app/dist/_headers` (local, gitignored,
built after the source edit) contains `frame-ancestors`. The test pins the source file, not the dist
copy; the copy is the build's plain copy of `public/`. The deployed fallback path stays an owner
step (`curl -sI`, in `docs/qa.md`).

**m6, CI.** `ci.yml` now runs `bunx playwright test --project chromium`, then
`bunx playwright test --project latency --no-deps` with `E2E_REUSE_WEB_BUILD=1`. In CI
`reuseExistingServer` is false and Playwright stops its servers after each invocation, so the
second step starts a fresh Worker (the webServer command wipes `E2E_STATE_DIR` and re-applies
migrations) and web server; the env var only skips the rebuild of `dist`, which the first step
made. No ceiling changed (`e2e/latency.e2e.ts` is not in the diff). `playwright.config.ts` keeps
the dependency of `latency` on `chromium` for local `bun test:e2e`. The first step failing skips the
latency step, as before. Failure artifacts still upload after both.

**New bug-lessons rows.**
- *Unroute fixture* (class 63): says what failed, that the handler caught one message of the race and
  not its cause, and so why earlier checks missed it. Sweep named (`notifications.e2e.ts` is the other
  `route.fetch()` handler). Fix: the shared `test` in `e2e/support/fixtures.ts` calls
  `page.unrouteAll({ behavior: "ignoreErrors" })` after `use`. Every `*.e2e.ts` imports `test` from
  that file; `touch-hints.e2e.ts` imports only `devices` and the `Page` type directly. Pages made from
  `browser.newContext()` (only `design-shots.e2e.ts`) are not covered, and have no `route.fetch()`
  handlers.
- *Assistant toast flake* (class 20): **no reason why the existing tests missed it.** The
  "Missed because" cell reads "none yet: recorded so a second sighting is a pattern". The user asked
  for each row to say why; this one is honest but does not meet that. See N1.

## New issues

**N1 (Minor). The assistant-toast flake row has no "missed because" and no guard.** The cause is
untraced (the report says so), and `retries` is 0 in CI, so the case can fail a merge. The row should
at least state the working hypothesis (the 5 s `toBeVisible` window under load, as in class 20) and
name who watches it. One more unlucky run is a CI red, not a code bug.

**N2 (Minor, note). The report claims no full e2e run was green.** The three local runs were: 190/5
(interference from the other worktree), 194/0 with 11 not run (the stray "Test ended", now fixed),
194/1 with 10 not run (the toast flake). The latency project ran only in its own CI-shaped run
(10/10). So the chromium and latency steps, as CI runs them, have not been seen green on this
head. The first CI e2e run is the real proof.

**N3 (Nit). The guard is line-based.** See above; add `multiline` handling only if a focused test ever
slips in.

No Critical or Important findings. No regression found in the six touched areas.

## Verdict

All nine items are addressed. **PR A is ready to merge once CI is green**, with one condition: read
the CI e2e run of the head (it has never run for this branch), and treat the assistant-toast case as
a known flake to rerun once, not as a new bug, until someone traces it (N1). The owed
`superpowers:requesting-code-review` pass for this round is this document; the `docs/qa.md`
release-round steps (real MCP client, header `curl`) remain the owner's pre-release work.
