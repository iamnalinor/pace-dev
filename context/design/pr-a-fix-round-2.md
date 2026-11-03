# PR A, fix round 2: merge of main and the re-review findings N1–N9

Branch `claude/pace-design-overhaul-3p860c`. Started from 4553d9a. Scope: merge `origin/main` (#52),
then fix every finding of `context/design/pr-a-followups-rereview.md`. The `wip: checkpoint`
commits in the range (6633603, ad350eb, 38eef29) were made by the controller during the round.
Their contents are part of the N2 and N3 commits that follow them.

## Step 1: merge of origin/main (06bf826)

This is a merge commit with no rebase and no force-push. Main gained #52: e2e settle waits and the
Dependabot bumps.

| File | Conflict | Resolution |
|---|---|---|
| `apps/app/src/shared/assistant/use-pending-actions.ts` | Branch: `approvalText(…, TOAST_FIT)`. Main: `run` now returns the `Result` (`applied.ok`). | Kept both: `approvalText` with `TOAST_FIT`, plus `const applied = await run(…)` and `if (!applied.ok)`. |
| `apps/app/src/shared/user-avatar.tsx` | Branch: `initials()` from core and the person icon. Main: a photo-first ternary (the lint rule against a negated condition). | Branch content in main's order (`photoUrl === null \|\| failedUrl === photoUrl ? initials : Image`). |
| `apps/app/src/ui/chip.tsx` | Branch: token sizes (`h-hit`, `h-10`, `gap-2`) and `leading(color)`. Main: `label = children`. | Branch markup with main's default. `accessibilityLabel={label}`. |
| `e2e/support/seed.ts` | Same `seedLivedIn(token, now)` added on both sides. | Branch doc comment. |
| `e2e/targets.e2e.ts` | Both sides fixed the same midnight flake: main with `lastMidday()` and a settle poll, the branch with `fixedNow()`. | Kept main's `lastMidday`, which sets the clock before login. Dropped the branch's duplicate `fixedNow`. Its bug-lessons row (class 9) now says so. |
| `context/bug-lessons.md` | Both sides appended Log rows. | Kept both blocks. |

After `bun install`, the bumped `eslint-plugin-unicorn` reported new findings. They were fixed in the
code, and no rule was weakened:
- `prefer-ternary` in `packages/client/src/actions/review-actions.ts`.
- `prefer-smaller-scope` in four places: `year-of-use.fake.ts` (`Step`, `Body`), `use-phone-answers.ts` (`Held`), `document-theme.web.test.tsx` (`Meta`), and `scripts/eslint-rules/no-raw-design-values.ts` (`Options`; the rule's doc comment moved onto the rule).

The design-value ratchet stays at 74 warnings.

## Step 2: findings

### N1 (Important): Log out remounted the login screen (311ae41)

- **Root cause.** As the re-review traced: `logout-button.tsx` awaited `auth.logout()` and then
  called `router.replace("/login")`.
  - `auth.logout` signs out locally before it sends the POST, so the route gate had already
    redirected to `/login`.
  - When the answer came back, the replace went to the route already on screen. That remounted it
    and emptied the typed id.
  - This was not a session race. The pause added in fix round 1 only changed the odds.
- **Red test.** `e2e/login.e2e.ts` "a slow log-out answer leaves the login form as the person is
  filling it in":
  - `page.route("**/api/auth/logout")` holds the answer 2 s.
  - The test waits until the start's outbox is empty, so Log out does not ask first.
  - It types the id during the hold, waits for the answer plus 500 ms, then expects the field to
    still hold the id, Sign in to be enabled, and the sign-in to reach Now.
  - Red before the fix: `toHaveValue("3000")` received `""`.
  - Also red before the fix: `login-navigation.test.ts` (three sign-out files named `/login`) and
    the settings and sessions jest tests, which now assert that Log out was called and the router
    was not.
- **Fix.**
  - The button no longer navigates.
  - Sweep for the same class: `delete-account.tsx` (`await auth.finishAccountDeletion();
    router.replace("/login")`) and `sessions-section.tsx` (ending this device's own session) did
    the same after signing out. Both now leave the navigation to the gate.
  - The gate (`route-gate.tsx`: `signed-out` → `<Redirect href="/login">`) is the only way to the
    login card after a sign-out.
- **Guard.** `apps/app/src/auth/login-navigation.test.ts` fails when any app source outside the
  gate and the bare sign-in screens names the `/login` route.
- **Loops.** The new e2e and the stale-tab e2e (`live.e2e.ts` "a stale tab's late 401…") passed 10/10
  (`--repeat-each 5 --workers 4`). `login`, `live` and `sessions` e2e passed 28/28.
- **bug-lessons.** New class 118, "A follow-up after a network await that assumes the screen has not
  moved", with a Log row.
- **Other side traced.**
  - Server: `POST /api/auth/logout` is unchanged. It deletes the row, ends the live sessions in the
    Durable Object and records the end. A second logout's 401 is ignored by `auth.logout`.
  - Client: `auth.logout` is unchanged. It still signs out before the POST. `incompatible-screen.tsx`
    already did `void auth.logout()` with no replace.

### N2: the read-ahead outbox count was stale (9fd916d, with checkpoint 6633603)

- **Root cause.** `useUnsyncedCount` started at 0 and refreshed asynchronously. A press before the
  first read, or right after a write, logged out without asking. A read that threw was an unhandled
  rejection.
- **Red test.** In `settings.test.tsx`:
  - "reads the outbox at the press: a change whose count has not come back yet still asks" holds the
    read with `Promise.withResolvers`.
  - "asks when the outbox cannot be read, without naming a count" makes the read reject.
  - Both were red against the N1 tree: `logout` was called once, with no question.
- **Fix.**
  - The count is read at the press (`readUnsynced`). A failed read returns `null`, and the confirm
    then asks with new copy: "Some changes may not have synced yet: logging out now loses them." /
    «Возможно, не все изменения синхронизированы: если выйти сейчас, они пропадут.»
  - A ref ignores a second press while the read is in flight.
  - With N1's remount gone, a press-time read no longer causes the remount.
- **bug-lessons.** Log row, classes 62 and 117. The other destructive actions (Wipe data, Delete
  account, Delete preset, End session) were checked: none decides on a read-ahead value.
- **L5 (design pass).** Not fixed here. The open confirm still keeps its count: a live count that
  reaches 0 needs a "synced" state with its own copy and Log out in place of "Log out anyway", as
  the design pass says. It stays with Task 4.11.

### N3: stale tab check-then-wipe race (ecaade7, with checkpoint commits ad350eb, 38eef29)

- **Root cause.** `dropLocalCopyIfOwned` checked `isSessionStored()` and then queued
  `resetLocalData()`. A tab that signed in again between the check and the wipe lost its store id
  and its outbox.
- **Red test.**
  - `packages/client/src/create-client.test.ts` "a stale tab's sign-out keeps the shared copy
    another tab claimed since": two clients on one memory store. Red with the old unconditional
    clear: `expected [] to have a length of 1`.
  - `apps/app/src/app-state.test.tsx` "keeps the copy another tab claimed between the stale tab's
    check and its wipe": `isSessionStored` is wrapped so that the other tab signs in, claims the
    copy and writes an event inside the window. Red with the old wiring (`resetLocalData`): length
    0.
  - `sqlite-event-store.test.ts` covers the compare-and-clear in SQLite.
- **Fix.**
  - `EventStore.setOwner(mark)`, and `clear(ifOwner?)`, which checks the owner in the clear's own
    transaction:
    - IndexedDB: one read-write transaction over events, pending and meta.
    - SQLite: an exclusive transaction.
    - Memory: in-line.
  - One predicate, `canClearCopy`, decides for every store. An unclaimed copy (from before owners, or
    just cleared) can be cleared by anyone, as before.
  - The client gains `claimLocalCopy(token)` and `dropLocalCopyOf(token)`. The stored value is the
    existing `noteMark` hash, never the token.
  - The app claims the copy first in `bootstrap`, before any write. A refused claim is non-fatal. On
    sign-out it drops the copy only for the leaving session.
  - `bootstrap` moved to `apps/app/src/bootstrap.ts` and the local-copy helpers to `local-copy.ts`,
    to keep `app-state.tsx` under its size limits.
- **bug-lessons.** Log row, class 74.
- **Other side.** The server has no part in this. The client-internal callers of `state.clear` (the
  server switch, and a reset server store in the sync) stay unconditional, by design.

### N4: OAuth off on a LAN-http server (172cfc1)

- **(a) Root cause.** `/api/instance` never said MCP was off, so Connect an AI app showed
  `<origin>/mcp`, which answers 503.
  - **Fix.** The contract gains `features.mcp` (`oauthOrigin(...) !== null`). It defaults to true,
    because every server served MCP before one could be without it. This is the one named exception
    to class 13's "unmentioned means off", and the core test says why.
  - The app's `serverInfoOf.mcpUrl` is `null` when `mcp` is false. The sheet then says «ИИ-приложения
    не могут подключиться к этому серверу: им нужен адрес с https.» / "AI apps cannot connect to this
    server: they need an https address." It shows no URL, no copy button and no steps.
  - **Red tests.** `instance.test.ts` (3 red), `own-origin.int.test.ts` (`features.mcp` false on a
    LAN, true at https), `sessions.test.tsx` "says AI apps cannot connect…" (red with the old
    `mcpUrl`), and `server-store.test.ts`.
- **(b) Root cause.** On the fallback, `deleteAccount` called `oauthHelpers(c)`, and the provider was
  never mounted, so it threw 500.
  - Why the tests missed it: the provider leaves `OAUTH_PROVIDER` on the env it is handed. The tests
    share one env, so after any request through the provider it was always set.
  - **Fix.** `revokeAllGrants(kv, userId)` in `shared/oauth-grants.ts` deletes every `grant:<user>:`
    and `token:<user>:` key. The sessions list already uses KV the same way.
  - `fetchAt` in the test now clears `OAUTH_PROVIDER`.
  - **Red test.** `own-origin.int.test.ts` "deletes an account with no OAuth provider mounted":
    expected 500 to be 200. The test also checks that the grant and token keys are gone. The existing
    test that an MCP token is refused after deletion still passes.
- **(c)** The `config.ts` comments now say which origin `/api/instance` uses for which field.
- **Sweep.** The other `oauthHelpers` callers (consent, `/api/oauth/complete`, `/deny`) are reached
  only from the consent page. On such a server you cannot get there, because `/authorize` answers
  503.
- **bug-lessons.** Log row, classes 99 and 1.
- **Not shot.** The sheet's new line is one kit `Text` with existing tokens in an existing sheet. The
  phone/desktop × theme × language matrix was not taken in this round (see Concerns).

### N5: the R23-01 e2e guard could not see the socket (8608d44)

- **Root cause.** Pushes were counted with `page.on("request")` only. The push after the recovery can
  go over the v2 socket.
- **Fix.** After the existing HTTP check, the test reads the account's whole log through the API
  (`pullAll` in `e2e/support/seed.ts`). It expects no `settings.updated` carrying `Asia/Tokyo`.
- **Red test.** With the R23-01 fix reverted (`ensureTimezone()` right after the first `syncNow()` in
  `bootstrap`), all three cases failed at the new log check (14 lines received), while the old HTTP
  check before it passed. That is the gap, shown 3/3. With the fix restored, 3/3 passed.
- **bug-lessons.** Log row, class 107.

### N6: range reads carried rows across dates (4af2a13)

- **Root cause.** `useRangeRead` kept the previous rows on a failed read whatever their range. Day
  steps its date in place.
- **Red test.** `day-screen.test.tsx` "never shows one day's screen time on another when the next read
  fails". Today's read succeeds; going offline, Previous day then still showed "Laptop · 50m".
- **Fix.** The state is keyed by `from/to`:
  - Rows show only for their own range.
  - A failed read keeps rows only for the same range.
  - Another range starts empty, including while its read is on its way.
- **Sweep.** Week's `useUsage` and `useCalendarRange` share the hook. No other client hook keeps rows
  across reads.
- **bug-lessons.** Log row, class 62.

### N7: a refusal for good reported as `unreachable` (a69056e)

- **Root cause.** `reasonOf` never read `isRefused`.
- **Red test.** `parse.int.test.ts` (class 99 test): a 400 from every provider answered `unreachable`.
  With `defer: true` it must answer `unavailable`/`unreadable`, not `queued`.
- **Fix.** `reasonOf({ …, isRefused })` maps a read every provider refused for good to
  `unreadable`. The route, the bot's preview and corrections, and `canReadLater` all read it.
- **Other side traced.** The app shows `composer.aiUnreadable` / `assistant.rulesUsedUnreadable` with
  no offer, and `isFinalAnswer` keeps the first-read guard for `unreadable`. The parse queue's
  `blindTries` already counted `isRefused`, and is unchanged.
- **bug-lessons.** Log row, classes 99 and 1.

### N8: a provider-wide 400 counts as a refusal (7f6ce8b)

Written down as an accepted residual in class 18:
- Every queued text goes to the Inbox in about 15 minutes, and a first read answers `unreadable`.
- The words are kept, and the warning log shows the wall of 400s.
- A known-good probe per refusal would cost a model call for every refused text.

### N9: the MCP preset test was in the wrong describe (7f6ce8b)

The I1/M6 MCP test moved, unchanged, from `describe("search_decisions")` to
`describe("presets")`. It passes (23/23 in the file).

## Step 3: verification

(filled in below)
