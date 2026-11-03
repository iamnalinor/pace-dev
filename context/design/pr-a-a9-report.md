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
- When a session exists, it always provides the identity: "Signed in as <name>", or "Signed in to
  Pace" before `me` has answered. Allow is enabled.
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

**M1's trade-off, as the reviewer framed it.** An own Log out now empties the copy even if another tab
of the same browser holds a newer session. That other tab's unsynced changes can be lost; it re-pulls
everything else. The reviewer judged the kept copy, a privacy failure on a shared computer, to be the
worse of the two.

## Verification

VERIFICATION_PLACEHOLDER

## Concerns

- **No code review under `superpowers:requesting-code-review` yet.** The brief forbids dispatching
  subagents, and that skill dispatches a reviewer subagent. The review of this range (3c05b49..tip) is
  owed. Its brief should carry "trace the client side", because the server rule changed, and the M1
  trade-off.
- **No real MCP client was connected end to end.** That is the new release QA line. The e2e cases drive
  a real registered client's authorization request, but not a real client's token exchange from Claude.
- **Shared browsers.** The consent page has no "not you?" switch. A person signed in to Pace in a shared
  browser grants as that account. The page names the account right above Allow.
