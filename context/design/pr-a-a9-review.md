# Review: PR A task A9 (consent with the session) and fix round 2 minors M1–M4, M7

Range 3c05b49..c94d37b (12 commits, 33 files). Requirements: `context/design/HANDOFF.md` "Owner bug
2026-11-03", `context/design/pr-a-fix-round-2-review.md` M1–M7. Read only: no tests were run. The
diff, the touched modules and their callers were read (api-client, create-client's session check,
auth/auth-session sign-out, login-screen.web `safeNext`, `_headers`, playwright config, latency
ceilings), and the CI runs of this head were checked with `gh`.

## Strengths

- **The server rule is small and right.** `resolveSessionIdentity` reuses `findSession` (expiry and
  revocation in the query), refuses scoped device tokens, and re-checks the whitelist on every
  Allow. The grant's user is the bearer's user. The page shows a name only from the same auth store
  whose token the API client sends, so the grant never goes to a user other than the one shown.
- **One proof per request** (422 `auth/identity-conflict`). On the client, `identityOf` makes the
  session win over a proof made on the page, and `identityBody` sends `{}` for a session, so the
  client never trips the 422 itself.
- **No CSRF surface.** The proof is a bearer that the same-origin page reads from its own
  localStorage, never a cookie. Another origin cannot read it or make the browser attach it.
- **The 401 is traced end to end.** `auth/unauthorized` maps to `oauth.sessionEnded`. The
  existing `sessionCheck` asks `me` once, the tab signs out as stale, and the page falls back to
  the widget with Allow disabled. Both `oauth.test.tsx` and `e2e/oauth-consent.e2e.ts` pin one
  `complete` and no redirect. The e2e also checks the real header and body shape.
- **The "Sign in to Pace first" link is not an open redirect.** `signInPathFor` builds `next` from
  `location.pathname + search`, which always starts with `/oauth/authorize`. `safeNext` keeps it
  same-origin. The query that comes back is re-validated server-side by `loadConsent`, which
  checks `redirect_uri` against the registered client. The e2e compares the returned query
  parameter by parameter.
- **API tests cover every refusal and check that no grant was written** (KV prefix counts). They
  also exchange the issued code for a working token.
- **M7 is the right shape.** The claim now goes through `state.claim` and then `LocalLog.claim`,
  the same chain the clear uses, and the test holds a write to prove the order. **M2** runs on
  real IndexedDB transactions (fake-indexeddb), with two handles sharing one database.

## Issues

### Critical

None.

### Important

**I1. M1's rule wipes another tab's unsynced changes when the browser stays signed in. A strictly
better rule exists.**
- **Where:** `apps/app/src/local-copy.ts:40-44` (`dropLocalCopyOnSignOut`, `cause === "own"` leads
  to `resetLocalData()`).
- **What is wrong:** an own Log out empties the shared IndexedDB copy unconditionally, even when
  the shared session store still holds another tab's live session. `auth-session.ts` `signOut`
  clears the store only if it holds the leaving token, so tab B stays signed in. A concrete path:
  1. Tab A holds tA and is hidden, so its socket is closed and no 401 has reached it yet.
  2. Tab B logs out of tA, then signs in again as tB.
  3. The person returns to tab A and presses Log out.
  4. Tab A's `signOut` leaves tB in the store, but `resetLocalData()` wipes the copy, including
     B's outbox.
  5. B hears `reload`, re-reads an empty store and pulls. Its unsynced events are gone for good.
  Adopting an app link in a second tab while the first is signed in reaches the same state.
- **Why it matters:** this is irreversible data loss, and it buys no privacy. The browser is still
  signed in through tab B, which shows the same account's data after its pull. M1's stated harm
  ("a signed-out browser keeps the data") needs a browser with no session left.
- **Fix (ruling on explicit item 3):** the trade-off as implemented is not acceptable, because a
  rule exists that is better in both directions. On the own path:
  - clear unconditionally (no owner compare) when no session is left in the shared store;
  - keep the copy when another session is stored.
  In code: `cause === "own" ? (await runtime.auth.isSessionStored() ? undefined : runtime.resetLocalData()) : dropLocalCopyIfOwned(...)`.

  This covers every case M1 named:
  - the claim failed and an older mark stayed: no session is stored, so the copy is cleared;
  - `adoptToken` replaced the token while signed in: the tab logs out the token it holds now, the
    store is emptied, so the copy is cleared;
  - a blocked store reads as nothing stored, so the copy is cleared. This fails toward privacy.

  Add the counter-test next to the M1 test: a second client signed in with T2 in the shared
  session store and one pending event, then an explicit Log out in the T1 tab. Expect the event to
  stay. Keep the M1 test (T2's mark, no session stored, so the copy empties).

**I2. The frame half of the owner bug has no regression test and no class.**
- **Where:** `apps/app/src/auth/telegram-widget.web.tsx:38-44, 105-125`. Class 119's sweep
  (`context/bug-lessons.md:1246`) is silent on it.
- **What is wrong:** the owner saw the widget's frame clipped over the text below it. The fix puts
  `maxWidth: 100%` on the iframe and wraps it in an `overflow-hidden` box. Nothing asserts either:
  no jest or e2e test references `telegram-widget` or `telegram.org`. The design shots load the real
  script, or none offline. The class 119 row covers only "asked to sign in while signed in".
- **Why it matters:**
  - A later restyle of the widget box (it is shared with the web login) can bring the overlap
    back silently.
  - CLAUDE.md requires every bug to get a class, a sweep and a guard. A third-party frame or
    embed that is not contained in its own box is its own class. A sweep would cover the other
    embeds, if any, and the login screen, which shares the component.
- **Fix:**
  - Add an e2e case at 390×844 that routes `https://telegram.org/js/telegram-widget.js*` to a
    stub. The stub inserts an oversized iframe (for example 600×300) into the widget host.
  - Assert three things: the frame's bounding box stays within the card's width; it does not
    intersect "Can't see the Telegram button?" or its button; that button can still be clicked.
  - Name the class in `context/bug-lessons.md` and link this case as its guard: a new section,
    or the nearest existing layout or containment class if one fits.

### Minor

**m1. Allow is enabled before the page knows whose session it is.**
- **Where:** `apps/app/src/features/oauth/consent-flow.tsx:44-45`, `packages/client/src/react/oauth.ts:104-105`.
- **What is wrong:** after a reload, `auth.ready` sets `signed-in` with no user until `me`
  answers. The page shows "Signed in to Pace" with Allow enabled.
- **Why it matters:** on a slow line, a person in a shared browser can grant as an account the
  page never named. The report lists the missing "not you?" switch as a residual; this case widens
  it.
- **Fix:** treat `name === null` as still loading for Allow (identity `null` until `me` answers).
  If `me` fails offline, `complete` would fail anyway.

**m2. `frame-ancestors 'none'` is missing, and no test pins the anti-framing headers.**
- **Where:** `apps/app/public/_headers:3-5`.
- **What is wrong:** with this change, a signed-in browser grants with a single click on Allow,
  so clickjacking is now the main residual risk on this page. `X-Frame-Options: DENY` covers every
  current browser, and storage partitioning gives a cross-site frame no session (it would see the
  signed-out page). Still, `frame-ancestors` is the standard control and XFO is the legacy one.
  Nothing tests that `_headers` keeps either, and the e2e server (`serve-web.ts`) does not apply
  `_headers`.
- **Fix (explicit item 1):**
  - Yes, add `frame-ancestors 'none'` to the CSP line, and keep XFO for old clients.
  - Add a unit test that parses `apps/app/public/_headers` and asserts, for `/*`: `X-Frame-Options:
    DENY`, and a CSP containing `frame-ancestors 'none'`.
  - Add one post-deploy check to the release QA line: `curl -sI <web>/oauth/authorize` shows both
    headers. It also confirms that the SPA fallback path carries them (see Declined).

**m3. The 403 and 422 refusals are not traced on the client.**
- **Where:** `packages/client/src/react/oauth.ts:55-77`.
- **What is wrong:** `auth/forbidden` and `auth/identity-conflict` fall to `default`, which shows
  `oauth.failed` ("Could not finish connecting. Try again."). For these permanent refusals, "Try
  again" is misleading, though neither is reachable from the app today. `auth/not-allowed` with a
  session shows `login.notAllowed`, and "Signed in as …" stays with Allow enabled. That is
  acceptable, but no client test pins it.
- **Fix:**
  - Add one `oauth.test.tsx` case: a session answered 403 `auth/not-allowed` shows the line, sends
    one `complete`, and sends nothing more.
  - Map `auth/identity-conflict` and `auth/forbidden` explicitly, even to `oauth.failed`, so a
    future code is a deliberate choice rather than a silent default.

**m4. The release QA line is not where a release round reads.**
- **Where:** `docs/qa.md:217`.
- **What is wrong:** "Once per release: connect a real MCP client" sits under "Every form, every
  way in". The "Release round" section (lines 77-83) and the prompt (lines 102+) do not mention
  it. The QA agent cannot connect Claude, so this is the owner's step and it can be missed.
- **Fix:**
  - Add one sentence to "Release round" that points at it and names who does it: the owner, not
    the Sonnet agent.
  - Add the header `curl` from m2.

**m5. The class 119 row bundles two rules, and the second overlaps class 81.**
- **Where:** `context/bug-lessons.md:1246-1269`.
- **What is wrong:** "A test-only sign-in path stands in for the real one" is a real testing class,
  and its sweep and guards (the e2e cases, the QA line) fit it. "Before asking a person to prove
  who they are, ask whether they already have" is a product rule, a sibling of class 81 ("a key the
  system needs asked of the person": asking for what the system already has).
- **Fix:** cross-reference class 81 in the rule line. Also say plainly that the guard for the
  testing half is procedural (the QA line). A mechanical guard, for example a test that fails when
  `e2e/oauth-consent.e2e.ts` loses its no-`devTelegramId` assertion, is optional.

**m6. The failing e2e run has no row in the bug-lessons log.**
- **Where:** `context/bug-lessons.md` Log; `context/design/pr-a-a9-report.md:203-209`.
- **What is wrong:** CLAUDE.md treats "a failing run" as a bug that gets a lesson. The report calls
  296 ms against the 240 ms ceiling "noise" and keeps it out of the log.
- **Fix:** add a log row with the measurement and the condition (the full run, latency after
  chromium), and the next step from Recommendations.

## Recommendations

1. **Latency flake (explicit item 5).** CI is likely to flake on this case.
   - **The measured margin is tight.** The row ceiling is 240 = 192 × 1.25 (`e2e/latency.e2e.ts:280`).
     The largest p75 measured was 192, and 296 is 54% above it.
   - **The measurement method does not match the gate.** The method measures the project alone
     (`--no-deps`, line 19-21). The gate runs it right after ~200 chromium tests on the same
     wrangler dev and machine, with `retries: 0` (`playwright.config.ts:68`). A run alone passing
     10/10 shows that the alone condition passes, not that the gate condition does.
   - **The ceilings were never measured on a GitHub runner**, which is slower and noisier.
   - **CI has never run e2e on this branch.** Every recent CI run of this head stops at
     `bun test:unit` (see 3 below), so it is unproven.

   Without raising the ceiling silently:
   - (a) Log it (m6).
   - (b) Make the gate's condition match the method. Either run the latency project as its own CI
     step against freshly restarted servers (`playwright test --project latency --no-deps` after
     the chromium step), or let the latency project's first test idle until the API is quiet.
   - (c) Once CI reaches e2e, collect the p75 annotations from three CI runs and hand them to Task
     5.6.
   - (d) If Task 5.6 decides the ceiling must reflect CI, re-measure by the documented method on CI
     and change the number in a commit that says so, owned by 5.6, never in this PR.
2. Fix I1 and I2 before merge. m1–m3 are small and fit the same change.
3. **Outside this range, but it blocks merge.** CI on c94d37b fails `bun test:unit`:
   - The error is `.only is disabled in CI environments` at
     `scripts/eslint-rules/promise-function-async.test.ts:11` and
     `no-raw-design-values.test.ts:11` (`RuleTester.itOnly = it.only`). Bun's runner throws when
     it reads `it.only` under `CI`.
   - These files predate 3c05b49, but no CI e2e (and so no latency) has run for this PR.
   - Fix: assign `itOnly` lazily, or drop it.

## Declined to judge

- **The SPA fallback and `_headers`.** I could not verify offline whether Cloudflare Workers
  static assets apply `_headers` rules to the `not_found_handling: single-page-application`
  fallback response for `/oauth/authorize`. I believe they do, because `/*` matches the request
  path. The curl check in m2 settles it.
- **`safeNext` accepts `/\host`.** WHATWG URL parsing reads it as `//host`. This predates the
  range, and expo-router's `<Redirect>` resolves the value as an in-app route, so I do not think it
  is exploitable. The new link always produces `/oauth/authorize?...`. Worth hardening separately:
  reject a backslash.
- **A failed `adoptToken` on Android while signed in now resets the copy** (an own sign-out with no
  reason). Before the change it was also dropped, through `dropLocalCopyOf(activeSession)`, so this
  is not a regression.
- **The visual result of the widget box and the matrix shots.** The report says they were shot. I
  did not review the images.
- **The `fake-indexeddb` 6.2.7 dev dependency.** It is test-only, and I did not audit it.

## Assessment

**Ready to merge: With fixes.**
- Critical: 0.
- Important: 2.
  - I1: own Log out wipes a still-signed-in tab's unsynced copy; keep the copy when another
    session is stored.
  - I2: the widget-frame containment has no regression test and no class.
- Minor: 6.

The consent security answers to explicit item 1:
- **CSRF:** no, the proof is a bearer.
- **Clickjacking:** XFO DENY covers it today; add `frame-ancestors`.
- **Bearer storage:** only the same-origin page reads it.
- **Grant goes to the user shown:** yes, from the same auth store, except while no name is shown
  yet (m1).
- **No open redirect.**
- **Device tokens and expired or revoked sessions are refused.**
- **The whitelist is re-checked.**

Merge also needs CI green, which is blocked by the pre-existing unit failure (Recommendation 3).
