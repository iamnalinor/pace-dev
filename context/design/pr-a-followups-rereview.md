# Re-review: PR A follow-ups, fix round 1 (98af07c..df4665d, code tip 22b59b0)

Reviewer: scoped re-review, read-only on the main tree. I made one throwaway worktree at 22b59b0
(in the scratchpad) for four probes, then removed it. The uncommitted edits in the main tree (the
M8 design pass) are not part of this review.

I read:
- `context/design/pr-a-followups-review.md`, the "Fix round 1" section of
  `context/design/pr-a-followups-report.md`, `context/qa-round-23.md` and the new
  `context/bug-lessons.md` rows;
- the code diff `98af07c..22b59b0`. I skipped the docs-only commits, and 52864c7 changes formatting
  only.

I traced the client, auth, session, live and sync code, the app's logout path and route gate, and
the Worker's logout and session revocation.

## Probes run in the worktree (each fix reverted alone)

| Probe | Result |
|---|---|
| I1 core: delete the "own name" shortcut in `validateName` | `resolve-preset.test.ts` fails (1 failed, 28 passed). |
| **I1 MCP** (the report says it was never seen red): same revert, then `mcp-tools.int.test.ts -t "shares its name"` | **Fails:** `update_preset failed: preset/name-taken`. With the fix restored it passes. The test is a real guard. |
| R23-01 app: put `ensureTimezone()` back right after the first `syncNow()` in `bootstrap` | `app-state.test.tsx` "writes no time zone…" fails: `listPending()` holds a `settings.updated`. |
| The logout race (see the trace): an expo-router `renderRouter` probe, `router.replace("/login")` while `/login` is already shown | **The screen remounts** (mount count goes to 2), so its state is lost. |

## 1. The review's findings

| Item | State | Notes |
|---|---|---|
| I1 | **Addressed** | `validateName` skips the check when the wanted name is one the preset already goes by (`resolve-preset.ts:211-214`). Create mode is unchanged (a new id has no current preset). MCP `update_preset` validates `args.name ?? current.name` and stores `storedPresetName`. Proven red at both levels. No regression found. |
| I2 | **Addressed** | `isRequestRefusal` matches a 4xx except 401, 403, 404, 408, 409, 410 and 429. `isRefused` requires every ready provider to have refused and no retry time. Only `isRefused` counts toward `blindTries`. The pinned rule (a 500 between refusals keeps the count) is sound. Residual risk, Minor N8: a 400 caused by our own configuration counts for every queued text. |
| I3 | **Addressed** | `apiOriginOf` normalises to `URL.origin` and applies the provider's rule (https, or http on a loopback host). `oauthOrigin` returns null, and then the app is served while the OAuth and MCP paths get a 503. The fast-check property builds a real `OAuthProvider`. A new edge in the fallback path is Minor N4. |
| I4 | **Addressed** | `LONG_QUIET_MS = 2 × 5 s + 1 s`, which meets W ≥ 2P. The comment and the class 107 row are corrected. |
| M1 | **Addressed** | The cache holds at most 4 providers. It evicts in insertion order (FIFO, not LRU), which is enough here. |
| M2 | **Addressed** | A4 side: `parse.int.test.ts` gives three refusals, then one Inbox task, then later alarms write nothing. A1 side: at most 4 failed pulls in 6 s. |
| M3 | **Addressed** | |
| M4 | **Addressed** | The glob is wider and the guard needs a named `{ timeout: X_MS }`. Nit: it accepts that timeout on any `describe`/`it` in the file, not necessarily the one that calls `resetModules`. |
| M5 | **Addressed** | Every row now says why the tests missed the bug. Classes are refiled. |
| M6 | **Addressed** | Both seeds use `isExampleToSeed`; MCP lists a skipped example in `skipped`. |
| M7 | **Addressed** | The rewrite applies only to GET, HEAD and OPTIONS. |
| M9 | **Addressed (recorded)** | The run is honest: the `isCurrentSession` guard in `sessionCheck` is not pinned by this test, because `session.token() === sent` already covers that case. |
| M8 | Skipped, as instructed | |

## 2. QA round 23 fixes

| Finding | Correct? | Test fails without the fix? |
|---|---|---|
| R23-01 | Yes. `createZoneStep` writes once per session token, only after a successful run of that session. That run is reported synchronously by the status subscription, so `settled()` sees the write. | App test: **proven red**. E2E guard: red in most runs, **but not reliably** (Minor N5). The recovery push can travel over the v2 socket, which `page.on("request")` does not see. |
| R23-02 | The intent is right. The read-ahead has a stale window (Minor N2), and the logout path still has the race in N1. | `settings.test.tsx` covers the new behaviour. There is no e2e. |
| R23-04 | Yes. `isFinalAnswer` keeps the first-read guard for `parsed`, `off`, `unreadable` and `limited`. | Yes, by reading: before the fix the guard is set only for `parsed`, so paste then Enter sends twice. |
| R23-06 | Yes. `editorDraft(preset, language)` shows the label; `storedPresetName` keeps a default's shipped name; the seed uses the account's language. | Yes, by reading: `preset-draft` and `actions` assert the label and the RU seed names. |
| R23-07 | Yes. `presetTitleOf` names a preset as it is called now, else as the event wrote it. | Yes: before the fix, `titleOf` returned null for preset events. |
| R23-08 | Correct for the case it targets. The sweep misses a case (Minor N6). | Yes: before the fix, a 503 gave an empty list and "0 min". |
| R23-09 | Yes. Every `*.retry` key now says "Try again" / «Попробовать снова». | Yes: the guard counts distinct values, and there were 2 before. |
| R23-11, R23-13c | Copy only. Fine. | `sessions.test.tsx` was updated. |

## 3. The logout race (class 75): the exact line

### What actually failed

The failure output (`v-e2e.txt` of fix round 1) shows:

> `locator.click: … getByRole('button', { name: 'Sign in as dev' }) … resolved to <button disabled … aria-disabled="true">` … `226 × element is not enabled` at `live.e2e.ts:275`

So the Telegram id was typed at line 274, and afterwards the field was empty. The login screen had been **remounted** after the fill.

### The line

`apps/app/src/shared/logout-button.tsx:61-64`:

```ts
const logout = async (): Promise<void> => {
  await auth.logout();        // resolves only after POST /api/auth/logout answers
  router.replace("/login");   // ← remounts /login if the person is already there
};
```

Step by step:

1. `auth.logout` (`packages/client/src/auth.ts:325-341`) leaves the note, then calls `session.signOut()` (line 335). That sets the token to undefined and the status to `signed-out` **before** the POST (line 337).
2. The route gate (`apps/app/src/auth/route-gate.tsx:72`) re-renders and redirects to `/login` at once.
3. Playwright's `toHaveURL(/login/)` passes, and it fills the id.
4. When the POST answers, `router.replace("/login")` runs.
5. The `renderRouter` probe above shows that a replace to the route already shown remounts it. The typed id is lost and the button is disabled.
6. If the person had already signed in again, the same replace sends a signed-in user to `/login`, which bounces them to `/`.

The same code existed before R23-02 (`settings-screen.tsx` at 98af07c), so this race is older than the fix round. It loses only when the POST's round trip is longer than the time it takes to see `/login` and type.

### "You signed out in another tab"

The logging-out tab cannot reach that state. I traced every caller of `signOut`. Only `meOf` passes `endedInAnotherTab` (`auth.ts:268-278`). It needs a 401 for the token that is still held (`session.token() === sent`) plus a note matching that token. The tab that logs out forgets its token synchronously, before its POST exists, and the server ends T1 only on that POST. So its own late answers fail the `token() === sent` test, whether the token is now undefined or T2.

The text belongs to the **hidden first tab**, which hears its 401 for T1, finds the note and signs out "in another tab", as designed. The failure attached two screenshots, one per page of the context (`test-failed-1/2.png`). That fits the report reading the first tab's correct state as the second tab's.

### Why a pause before `auth.logout` raised the odds

This is plausible, not proven. Two places serialise the two tabs:
- the IndexedDB read waits behind the hidden tab's read-write transactions, from the sync-on-hide that `hide(first)` starts;
- on the server, the logout's `deleteSession` → `endLiveSessions` (`apps/api/src/shared/session-rows.ts:22-33`, `user-store/live-sessions.ts:97`) runs in the same user Durable Object as that tab's push.

So the pause tends to land the POST while the Durable Object is busy. The POST gets slower, and step 4 lands after the fill.

### Can it still happen?

**Yes, with or without a pause.** A pause before `auth.logout` is not the cause. Any slow logout POST still remounts the login form under the person's fingers, and the e2e stays flaky. Examples:
- a phone on a slow network;
- a busy Worker;
- another tab syncing in the same Durable Object;
- "Log out anyway" in the new confirm.

The read-ahead lowered the odds by removing one alignment. It did not close the race.

### Server side

`POST /api/auth/logout` (`apps/api/src/auth/auth-routes.ts:313-319`) does three things:
- deletes the D1 row;
- then, in the Durable Object, closes the session's sockets with 4401;
- records the session as ended until it expires, so a socket upgrade that races the logout is refused (`isEndedSession`).

That is correct. The response waits for the Durable Object, which is what makes the POST's latency depend on other sync traffic. A second logout gets a 401, and the client ignores it (`sessionCheck` excludes the logout endpoint, and `auth.logout` catches it). No change is needed here. Optionally, the socket close could move to `waitUntil` to shorten the POST, but the client fix below makes that unnecessary.

### Root fix (Important N1)

1. Do not navigate after the network call. The gate already redirects on `signed-out`. Either:
   - delete `router.replace("/login")`; or
   - call it right after the local sign-out. One way is to let `auth.logout` resolve once the device is signed out and send the POST in the background (it already ignores the answer).

   `incompatible-screen.tsx:50` already does `void auth.logout()` with no replace.
2. With the remount gone, the outbox read at press time is safe again: the pause was never the cause. Read the count fresh at the press (this fixes N2), or re-check when `known === 0`.
3. Add a deterministic guard. In `live.e2e.ts`, or a new test:
   - `page.route("**/api/auth/logout", …)` holds the answer for about 2 s;
   - the test types the id on `/login` during the hold;
   - after the answer it asserts that the field still holds the id and that "Sign in as dev" is enabled.

   Today this fails on every run. Add a bug-lessons row: class 77-like ("a navigation after an await that the state already did"), or a new class: "a follow-up action after a network await that assumes the screen has not moved". Sweep for `await …; router.replace|push` after a call that has already changed the auth or route state.

### A related latent race (Minor N3, class 74)

`dropLocalCopyIfOwned` (`apps/app/src/app-state.tsx:112-116`) checks `isSessionStored()` and then queues `resetLocalData()`. Check and wipe are not atomic across tabs.

If the stale tab's 401 lands after the other tab signed out, but before that tab signed in again, the wipe can run **after** the new session has written its store id and outbox into the shared IndexedDB. That wipes the new session's unsent changes. The e2e's `localCopy(second)` check would catch it only when the timing lines up.

**Fix:** a real compare-and-clear. Record the owning session's mark in IndexedDB `meta` at sign-in. In the clear's own read-write transaction, clear only while `meta.owner` is still the leaving tab's mark.

## 4. The other side of each changed contract

| Contract | Server → client | Client → server | Gaps |
|---|---|---|---|
| A4: Inbox counting (I2) | The drain keeps an outage queued for up to a day and sends a refused-for-good text to the Inbox after 3 refusals. The Inbox task arrives over pull. Steady state is pinned (`parse.int.test.ts`). | The composer offers "Read it when it's back" for `limited` and `unreachable`. | Minor N7: a first read every provider refused for good reaches the app as `unreachable` (`reasonOf` never reads `isRefused`). The app offers "Read it when it's back" for a text no provider will read, and R23-04 lets Enter ask again. It does converge on the Inbox within about 15 minutes (3 drains, 5 minutes apart, since a 400 sets no health penalty). |
| A7: origin and the 503 | `/api/instance.apiOrigin` = `ownOrigin`, normalised. `/mcp`, `/oauth/*`, `/authorize` and `/.well-known/oauth-*` answer 503 when no origin passes the rule. | `mcpUrl = instance.apiOrigin + "/mcp"` (`server-store.ts:114`). | Minor N4: (a) on a LAN-http server, Connect an AI app still hands out a URL that answers 503, because the instance contract has no "MCP available" flag; (b) the fallback serves `app` without the provider, so `env.OAUTH_PROVIDER` is absent and `deleteAccount` throws 500 (`oauth-helpers.ts:12`). |
| A1 / R23-01: first-sync writes | The server accepts any pushed `settings.updated`, by design. | The zone is written only after a successful run of this session; the push needs the store id the pull confirmed (`sync-run.ts:90`). Other start writes: `ensureInstances` writes nothing on an empty copy. | The e2e guard is weak (N5). Otherwise both sides hold. |
| Preset name rule | The server does not validate pushed events, by design. Old APKs can still create duplicates, and I1 now keeps those editable. | Client `savePreset` and core `validatePresetInput` check the name. MCP create, MCP update and both seeds check it too, with `isExampleToSeed`. `storedPresetName` is used by the app and MCP update. | None found. Nit: `storedPresetName` compares exactly after trimming, but `validateName` ignores case. A default saved as "работа" therefore becomes a rename shown in every language. That is the person's typing, so I leave it. |

## New issues

### Critical

None.

### Important

**N1. Log out remounts the login screen when its POST answers late; the class-75 flake is still open.**
- **Where:** `apps/app/src/shared/logout-button.tsx:62-63` (`await auth.logout(); router.replace("/login")`).
- **Effect:** a slow logout POST wipes whatever the person has started typing on `/login`. The stale-tab e2e stays flaky. The 22b59b0 read-ahead only lowered the odds.
- **Fix and guard:** see section 3.

### Minor

- **N2.** The read-ahead count is stale.
  - **Where:** `logout-button.tsx:16-41,68`.
  - **What happens:** before the first read resolves, and just after a write until its refresh lands, `known === 0`, so Log out drops a fresh unsent change without asking. The class 117 window is still open.
  - **Silent failure:** a read that throws inside `refresh` is an unhandled rejection that keeps the old count.
  - **Fix:** after N1, read the count at the press, and catch errors by treating the count as unknown, which asks.
- **N3.** The `dropLocalCopyIfOwned` check-then-wipe race across tabs (section 3).
  - **Where:** `apps/app/src/app-state.tsx:112-116`.
  - **Fix:** compare-and-clear on an owner mark inside the IndexedDB transaction.
- **N4.** OAuth off (a LAN-http server), two gaps:
  - (a) `/api/instance` does not say MCP is unavailable, so Connect an AI app shows a URL that answers 503 (`apps/app/src/platform/server-store.ts:114`). Fix: add `features.mcp: oauthOrigin(...) !== null` to the instance schema and hide or explain the URL.
  - (b) The fallback (`apps/api/src/worker.ts:117-118`) serves `app` with no `OAUTH_PROVIDER`. `deleteAccount` (`apps/api/src/account/delete-account.ts:13`, reached from the bot-confirmed delete and from `testReset`) throws 500 after the confirmation is claimed. Fix: revoke grants through `shared/oauth-grants.ts` (KV, as `session-routes.ts` already does), or skip grant revocation when the helpers are absent.
  - Also correct the comment at `apps/api/src/shared/config.ts:224`: `/api/instance` uses `ownOrigin`, not `oauthOrigin`.
- **N5.** The R23-01 e2e guard cannot see a push sent over the socket.
  - **Where:** `e2e/sync-state.e2e.ts:118-123,174`.
  - **Why:** Retry runs `backOnline`, which restarts the socket, so the push after recovery can go over v2. A regression could then pass silently.
  - **Fix:** also collect `page.on("websocket")` → `framesent`, or after recovery pull the account's log through the API and assert there is no `settings.updated` with `Asia/Tokyo`. History is a third option.
- **N6.** R23-08: rows carry over when the date changes.
  - **Where:** `packages/client/src/react/usage.ts:86`, `useRangeRead`.
  - **What happens:** it keeps `previous.rows` from **another range** when a read fails, and computes `isFailed` against them. Day steps dates in place (`day-screen.tsx` `useState(date)`), so offline, yesterday shows today's screen time as a fact.
  - **Status:** older than this round, but in R23-08's class 62 sweep.
  - **Fix:** key the state by `from|to`; on failure keep rows only for the same key.
- **N7.** A4: a refusal for good is told to the app as `unreachable` (section 4). Map `isRefused` to `unreadable`, or to a new reason, when the parse route answers. That is a contract change, so a follow-up is fine.
- **N8.** I2: a provider-wide 400 caused by our own misconfiguration (a bad parameter after an SDK change) counts as a refusal for good. Every queued text then goes to the Inbox in about 15 minutes. Acceptable, since the Inbox keeps the text, but it should be written down in the class 18 row as the accepted residual.
- **N9 (nit).** The I1/M6 MCP test sits inside `describe("search_decisions")` (`apps/api/tests/mcp-tools.int.test.ts:741`). Move it under the preset tools.

## Verdict

**With fixes.**

Every review finding (I1–I4, M1–M7, M9) is addressed with no regression found.

I proved two tests red myself:
- the I1 MCP test, which the implementer had never seen red;
- the R23-01 app test.

The R23-01 e2e guard would fail in most runs, but it can miss a push sent over the socket (N5).

The logout race now has its exact line. It is not a session-token race, and the logging-out tab never reaches "another tab". The cause is the `router.replace("/login")` that runs after the awaited logout POST: it remounts a login screen the gate has already shown. Any slow POST still triggers it, so N1 should be fixed, with its deterministic e2e guard, before merge. The Minors can ride along or be carried to the next PR.
