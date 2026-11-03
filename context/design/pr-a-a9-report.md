# PR A, task A9: connecting an MCP client fails (owner bug 2026-11-03), and the fix round 2 review minors

Branch `claude/pace-design-overhaul-3p860c`. Started from 3c05b49. Requirements: `HANDOFF.md`, "Owner bug
2026-11-03", and the coordinator's addition (`pr-a-fix-round-2-review.md` M1–M7). The `wip: checkpoint`
commits in the range (7d81ffe, 8cc4766) were made by the controller during the task. Their contents are
the A9 server and client change and the M1 change, finished in the commits that follow them.

## A9: what changed

### 1. The consent page uses the browser's Pace session

**Root cause.** Before this change, `POST /api/oauth/complete` took only a Telegram widget payload or a
dev id. The consent page never read the session that the web origin already holds. Plan.md's OAuth
decision was "widget on the web origin". It asked how a person proves who they are. It never asked
whether they already had.

**Server** (`apps/api/src/oauth/oauth-routes.ts`, new `apps/api/src/shared/session-identity.ts`):
- A request with `Authorization: Bearer <session>` is proved by that session (`findSession`). The grant
  is stored under the session's user (`userId` and `props` of `completeAuthorization`).
- Each refusal is typed:

  | Case | Status | Code |
  |---|---|---|
  | Revoked or expired session | 401 | `auth/unauthorized` (the same refusal `requireAuth` gives, so the app's session check hears it) |
  | Device token (`usage:write`) | 403 | `auth/forbidden` |
  | Session user has left the whitelist | 403 | `auth/not-allowed` |
  | A bearer plus a widget payload or dev id | 422 | `auth/identity-conflict` |

  The last row is the rule "one proof per request": the grant can only ever go to the user the page
  showed.
- With no bearer, the widget path and the dev-id path are unchanged.
- The contract stays `auth: false`, because a signed-out browser still completes. Its doc comment in
  `packages/core/src/api/endpoints.ts` names both proofs and every refusal.

**Client** (`packages/client/src/react/oauth.ts`, `apps/app/src/features/oauth/consent-flow.tsx`):
- `useConsent(api, { authQuery, redirect, session })` takes `ConsentSession`, which is one of three
  states: loading, signed-in (with the name), or signed-out.
- When a session exists, it always provides the identity: "Signed in as <name>", and Allow is
  enabled. (Fix round 3, m1: before `me` names the person, the page now shows no identity and keeps
  Allow disabled; the first version showed "Signed in to Pace" with Allow enabled.)
- The body carries no proof. The API client adds the bearer.
- While the auth state is still being read, the page shows no identity step, and Allow stays disabled.
- If the session was revoked, the 401 shows "Your Pace session has ended. Sign in again to continue."
  The client's existing `sessionCheck` then asks `me` once, `me` gets its own 401 and signs out, and the
  page shows the sign-in options.
- **Trace of the other side, and the steady state.** After the refusal there is exactly one Allow
  request and at most one `me`, and no repeats. This is pinned in `oauth.test.tsx` and in the e2e,
  which watches 1.5 s of quiet.
- The intro line (`oauth.body`) said "then sign in with Telegram" even to a signed-in person. The matrix
  shots caught it (see "Shots and design review"). It is now neutral in EN and RU.

**Signed-out browser.**
- The page keeps the Telegram widget and, in dev builds, the dev id.
- A line is always visible: "Can't see the Telegram button? Sign in to Pace first."
- The link opens `/login?next=<the consent path and query>`, built by
  `apps/app/src/auth/sign-in-path.ts`. That login has the bot deep-link fallback, so it works on a
  network that blocks the widget. Once signed in, the login screen follows the same-origin `next` back.
- Expo Router writes the query back in its own spelling: a space becomes `%20` instead of `+`. That is
  the same request, and the e2e compares the parsed parameters.

### 2. The widget frame gets a box of its own (`apps/app/src/auth/telegram-widget.web.tsx`)

- The host is a full-width, `overflow-hidden` box of at least `hit-web` height, centred. Every injected
  iframe gets `max-width: 100%`.
- Whatever the frame loads stays inside that box and pushes the content below it down. It never draws
  over that content.
- The shots run a simulated block page in the frame, and nothing overlaps.
- The login page shares the component, so it gets the same fix.

**Ruling (conservative option).** The page cannot tell a block page inside Telegram's frame from the
real button: the frame is cross-origin, so its content cannot be read. Telegram's postMessage protocol
is internal and could change without notice. So the fallback is not a guess made by a timer. The line
"Can't see the Telegram button? Sign in to Pace first" is always visible under the widget. The existing
`failed` state (the script did not load) and `slow` state (4 s) are kept.

### 3. Why we did not catch it: bug-lessons class 119 (new)

**Class 119: a test-only sign-in path that stands in for the real one.** It is written in
`context/bug-lessons.md`, with a Log row.

**Guards:**
- `e2e/oauth-consent.e2e.ts`, 4 cases, each on a real authorization request from a registered client:
  - signed in: allow with no widget; the bearer is sent with no Telegram proof; the client callback
    gets `code` and `state`;
  - session revoked as Allow goes out: the page falls back to sign-in, and the network goes quiet;
  - session revoked before the page opens: the page offers sign-in and shows no stale name;
  - signed out: "Sign in to Pace first", then the dev login, then back with the request intact, then
    Allow.
- `docs/qa.md`:
  - a consent-page row in "Every form, every way in";
  - "Once per release: connect a real MCP client end to end", with the steps.
- `oauth.test.tsx` fails when any line of the signed-in page names Telegram.

**Sweep of every place that asks for a Telegram proof:**

| Place | Finding |
|---|---|
| Web login | It redirects a signed-in browser to `next` and hands the token to the app for `?return=app`. |
| Consent page | This was the one place that asked a signed-in person. Fixed. |
| Android login | It is shown only without a session. |
| Account-deletion confirmation | It is a bot confirmation of a destructive action, by design. It is not a sign-in. |
| API | `resolveTelegramIdentity` has one caller, the consent path above. |

### Security review (`dev-core:security-review` checklist, over this change)

- **Authentication and authorization:**
  - The grant's user is the user `findSession` resolves from the bearer: an unexpired row in D1, found
    by the SHA-256 of the token.
  - The client cannot name the user. A second proof in the same request is refused, never merged.
  - A device token (scoped `usage:write`) is refused.
  - The whitelist is checked again at consent, as the widget path checks it.
  - Tests: `oauth-session.int.test.ts`, 7 cases.
- **CSRF.** The proof is a bearer header read from the web origin's storage, not a cookie. Another site
  cannot attach it. CORS for `/api/*` allows the web origin, localhost and `null`, and it is unchanged.
  No ambient credential exists, so no CSRF token is needed.
- **Clickjacking** (the session makes Allow a single click):
  - The web build sends `X-Frame-Options: DENY` (`apps/app/public/_headers`).
  - The CSP has no `frame-ancestors`; the DENY header covers it.
  - It is still worth adding `frame-ancestors 'none'` when the CSP is next touched. Not done here.
- **Input validation.** The body is zod-validated by `mount()`, as before. The bearer is parsed by the
  shared `readBearer`.
- **Open redirect.** `next` is accepted only as a same-origin path (`safeNext` on the login screen and
  `safeReturnPath`). `sign-in-path.test.ts` checks that the consent path survives that rule.
- **Secrets and logging.** No token is logged. The 401 body is the generic `Unauthorized`.
- **Token storage.** The web keeps its session in localStorage, as before. That choice is pre-existing
  and out of scope.
- **Rate limiting.** There is none on `/api/oauth/complete`, as before. A valid session plus a valid,
  unexpired authorization request is required, so this change adds no new brute-force surface.
- **Lint.** The `security/detect-possible-timing-attacks` warning on the bearer check was a false
  positive: it was a presence check, not a secret comparison. It was resolved by restructuring the code,
  not by disabling the rule.

## Shots and design review

**The shots.**
- A scratch spec (not committed) shot the page at 390 and 1440, light and dark, EN and RU, both the top
  and the end of the page:
  - the consent page signed in;
  - the consent page signed out on a network that serves a block page inside Telegram's frame;
  - fix round 2's N4 line ("AI apps cannot connect…", with `features.mcp` false).
- Shots are in `.cache/shots/a9/` (git-ignored), 40 files.

**`impeccable critique`.** The platform is `adaptive`, so Assessment A runs alone with no degraded
banner.
- The page reads as one task: who is asking, what it may do, who is allowing, then Deny or Allow.
- "Signed in as …" sits right above the buttons, where the decision is made.
- The signed-out stack, in order: the widget's box, the fallback question and the action, the dev box,
  then the buttons. Each part sits in its own space, and the block page no longer overlaps anything.
- One finding was above cosmetic: the intro line told a signed-in person to sign in with Telegram.
  Fixed (ca51b61).

**`apple-design`** (`managing-accounts.md`, `sheets.md`, `layout.md`, `accessibility.md`):
- No Critical or High findings. Rating: Good.
- `managing-accounts.md › Best practices` says to "always identify the authentication method you
  offer". The widget line names Telegram, and the fallback names Pace's own sign-in, so it holds.
- Deny and Allow keep equal weight, and Allow is the primary style.

**The N4 line.**
- It is one secondary line in the sheet at both widths, with no clipping in RU at 390.
- The phone sheet has no Close button. It dismisses by its grabber, a swipe, or a tap on the scrim. The
  desktop dialog has ×.
- `sheets.md › Best practices` expects "a way out". The kit gives every phone sheet that way out, so
  this is cosmetic, and kit-wide. Left as is.

**Cosmetic, left as is:**
- The fallback question is centred while the lines above it are left-aligned. It follows the centred
  widget.
- The dev box is local and e2e only.

## Fix round 2 review minors

| Item | Commit | What |
|---|---|---|
| M1 | 8cc4766 (checkpoint), then the row | **Before:** an own Log out left the copy when another tab had claimed it. **Now:** Log out, ending this device's own session and deleting the account sign out with no reason, which counts as `own`, and clear the copy unconditionally (`resetLocalData`). A 401 or another tab's sign-out carries a reason, which counts as `stale`, and only that path compares the owner (`signOutCauseOf` and `dropLocalCopyOnSignOut` in `apps/app/src/local-copy.ts`). Test: `app-state.test.tsx` "empties the copy on Log out even when another tab's mark is on it" (red before). Bug-lessons row (class 103). |
| M2 | c06a58a | `apps/app/src/platform/event-store.web.test.ts` runs on `fake-indexeddb` (dev dependency, 6.2.7), with 3 cases: a full clear, a clear refused under another owner, and two tabs on one database. Each case checks `isShared()`, so the memory fallback cannot make it vacuous. Probe: with the owner check removed, 2 of 3 cases fail. |
| M3 | a681ad3 | Class 13's rule now names the `features.mcp` default and its reason. |
| M4 | 99aa732 | `parse.ts`'s doc now says `unreadable` also covers a read that every provider refused for good. |
| M5 | (above) | The N4 line is shot and reviewed. |
| M6 | none | **Accepted, not fixed.** A refused clear still broadcasts `reload`, which costs one extra read in another tab. Since M1, only the stale path can be refused, and the fix would change `EventStore.clear`'s return type in five implementations for that one read. |
| M7 | 073d397 | The claim goes through the state's write queue and the log's write chain (`state.claim`, `LocalLog.claim`), so a sign-out's clear queued before it has its turn first. Test: `create-client.test.ts` "a claim waits for the sign-out's clear queued before it" (red before). Bug-lessons row (class 74). |

**M1's trade-off** (superseded in fix round 3, I1). As first written, an own Log out emptied the copy
even while another tab of the same browser held a newer session, which could lose that tab's unsynced
changes. The A9 review ruled that out; see "Fix round 3".

## Verification

Every run is on tip f63003a, the last code commit; the report commit follows it.

**Lint.** `bun lint` passes with 0 errors. The design-value ratchet stays at exactly 74 warnings.

**Unit, API and app suites:**

| Suite | Result |
|---|---|
| `bun test:unit`, core | 878 passed |
| `bun test:unit`, client | 517 passed |
| `bun test:api` | 608 passed, 64 files |
| `bun test:app` | 904 passed, 121 suites |

**Full `bun test:e2e`** (fresh servers; :8787 and :4173 were free beforehand): 203 passed and 1
failed, in 17.2 min.
- **The failure.** `latency.e2e.ts` "a task row opening its screen" measured p75 296 ms against its
  240 ms regression ceiling.
- **Rerun.** The latency project was rerun alone (`--project=latency --no-deps`) and passed 10/10. The
  task row passed too.
- **Why it is noise.** The budget measures the CPU (4× throttling), and the full run shares the machine.
  This change does not touch the task row or navigation. Tap latency is the open item that Task 5.6
  owns.

**New tests, each seen red before its fix:**

| File | Cases |
|---|---|
| `oauth-session.int.test.ts` | 7 |
| `oauth.test.tsx` | 3 new and 1 extended |
| `sign-in-path.test.ts` | 1 |
| `e2e/oauth-consent.e2e.ts` | 4 |
| `app-state.test.tsx` (M1) | 1 |
| `event-store.web.test.ts` (M2) | 3 |
| `create-client.test.ts` (M7) | 1 |

**Exceptions to "red first":**
- `sign-in-path.test.ts` was written together with the helper it moved into.
- The e2e cases were seen failing only for the reasons this report describes: the router's spelling of
  the query, and the socket race.

## Concerns

- **No code review under `superpowers:requesting-code-review` yet.** The brief forbids dispatching
  subagents, and that skill dispatches a reviewer subagent. The review of this range (3c05b49..tip) is
  owed. Its brief should carry "trace the client side", because the server rule changed, and the M1
  trade-off.
- **No real MCP client was connected end to end.** That is the new release QA line. The e2e cases drive
  a real registered client's authorization request, but not a real client's token exchange from Claude.
- **Shared browsers.** The consent page has no "not you?" switch. A person signed in to Pace in a shared
  browser grants as that account. The page names the account right above Allow.

## Fix round 3 (A9 review: 0 Critical, 2 Important, 6 Minor; plus the CI blocker)

Review: `context/design/pr-a-a9-review.md`. Started from c94d37b. The controller's checkpoint
ee46194 holds the CI blocker's first commit (the `itOnly` removal, the guard, class 120); 1f7c2cc
finishes it.

| Item | Commit | What |
|---|---|---|
| CI blocker | ee46194, 1f7c2cc | **Cause.** `RuleTester.itOnly = it.only` in `promise-function-async.test.ts` and `no-raw-design-values.test.ts`. Bun throws when it reads `it.only` under `CI`, so `bun test:unit` failed in CI before the API, app and e2e steps. Local runs never set `CI`. **Fix.** The assignment is removed: RuleTester needs it only for a case marked `only`. **Guard.** `scripts/no-focused-tests.test.ts` reads every unit, Worker, script and e2e test file and fails on `it.only`, `describe.only`, `test.only`, `itOnly` or `only: true` (red before, on those two lines). Bug-lessons class 120 (new). Proof: `CI=1 bun test:unit` passes (Verification below). |
| I1 | 20c515c | **Rule.** An own sign-out clears the copy without the owner check only when no session is left in the shared store; a blocked store counts as empty. While another tab's session is stored, the copy and its unsent changes stay (`dropLocalCopyOnOwnSignOut` in `apps/app/src/local-copy.ts`). **Tests** in `app-state.test.tsx`: the counter-test "keeps the copy while another tab's session is still stored…" (red before); the M1 test, now with no session stored ("empties the copy when no session is left, whatever mark is on it"); "…when the shared store cannot be read". Bug-lessons row (class 117). |
| I2 | efa40ce | **Test.** `e2e/oauth-consent.e2e.ts` "a frame the widget loads stays in its own box…" runs at 390×844. A stub of `telegram-widget.js` puts a 600×300 frame where the button goes. The test asserts that the frame stays within the card (`testID="consent-card"`), does not intersect "Can't see the Telegram button?" or its button, and that the button still takes the click. **Red against the old layout:** with `telegram-widget.web.tsx` from 3c05b49, the frame started at x = −105 px. It is green on the current layout. Bug-lessons class 121 (new). |
| m1 | cda6b44 | A signed-in session with no name yet (a stored session before `me` answers) reads as loading: no identity shown, Allow disabled. `oauth.signedIn` is removed from both catalogs. Test: "keeps Allow disabled until it knows whose session it is", with a held `me` (red before). Bug-lessons row (class 62). |
| m2 | 50b376c | The CSP gains `frame-ancestors 'none'`; `X-Frame-Options: DENY` stays for old browsers. `scripts/web-headers.test.ts` parses `apps/app/public/_headers` and pins both for `/*` (red before). The deployed check is in the owner's release step (m4). Bug-lessons row (class 37). |
| m3 | b978b23 | **Mapping.** `errorKey` names `auth/forbidden` (`oauth.deviceToken`) and `auth/identity-conflict` (`oauth.identityConflict`), with real sentences in EN and RU. **Test.** `oauth.test.tsx` runs 3 cases (403 `auth/not-allowed`, 403 `auth/forbidden`, 422 `auth/identity-conflict`). Each shows its line, sends one `complete` and no redirect; the two new cases were red before. Bug-lessons row (class 99). |
| m4 | 4450f2b | `docs/qa.md` "Release round" now carries "The owner's step, once per release: connect a real MCP client end to end", with numbered steps and the `curl -sI …/oauth/authorize` header check. The old line under "Every form" is gone. |
| m5 | 242e2b8 | Class 119 now holds only the testing rule, and says plainly that its guard is procedural (the owner's release step), with the e2e pinning what can run without Telegram. The product half ("ask whether they already proved it") is filed under class 81, which has a new line pointing back. |
| m6 | da8e859 | **Log row.** The latency failure: 296 ms against 240, in the full run after ~200 tests, versus the ceilings' method of running the project alone on fresh servers (classes 115 and 116). **CI.** `ci.yml` runs `playwright test --project chromium`, then `playwright test --project latency --no-deps` as a step of its own. Playwright starts a fresh Worker (fresh state), and with `E2E_REUSE_WEB_BUILD=1` it serves the same build without rebuilding. That is one extra server start, no new job, and no ceiling changed. Next, for Task 5.6: collect three CI runs' p75 annotations. |

### Verification (fix round 3)

VERIFY3_PLACEHOLDER

