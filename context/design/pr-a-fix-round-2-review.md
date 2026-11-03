# Review: PR A fix round 2 (4553d9a..3c05b49)

Reviewer: read-only review against `context/design/pr-a-followups-rereview.md` and the CLAUDE.md rules.
I read history only by SHA and used a throwaway worktree at 3c05b49 for targeted runs, then removed it.

Runs at 3c05b49:
- `packages/client` `create-client.test.ts`: 20/20 passed.
- `packages/core` `instance.test.ts`: 4/4 passed.
- `apps/app` jest (`app-state`, `settings`, `login-navigation`, `day-screen`): 59/59 passed.
- Probe: I made `canClearCopy` always true. The N3 two-tab test then fails (`expected [] to have a length of 1`), so it is a real guard.

## Strengths

- **N1 is fixed at the root.** No sign-out flow navigates any more. The gate is the only way to `/login`.
  - The sweep found the same bug in `delete-account.tsx` and `sessions-section.tsx`.
  - `login-navigation.test.ts` guards it from now on.
  - The e2e holds the answer for 2 s, the deterministic test the re-review asked for.
- **N2 reads the count at the press.** A failed read returns `null` and asks, so there is no quiet fallback to 0. A ref ignores a second press while the read is in flight.
- **N3 has one predicate, `canClearCopy`, used by all three stores.**
  - IndexedDB checks and clears in one read-write transaction over `events`, `pending` and `meta`. `setOwner` writes `meta` read-write, so the two serialize. There are no non-IDB awaits inside the transaction, so it cannot auto-commit early.
  - SQLite checks and clears in an exclusive transaction, and reads through `txn`.
  - Memory checks and clears synchronously.
- **N4 is consistent with the Worker.**
  - `features.mcp` uses the same `oauthOrigin` rule as the Worker. `config.apiOrigin` and `env.API_ORIGIN` go through the same `apiOriginOf`.
  - The deletion now revokes through KV, as the sessions list does.
  - The test fixture bug (`OAUTH_PROVIDER` leaking through the shared env) is named and fixed.
- **N6** keys the rows by range, and the fix covers every caller of the hook.
- **N7** changes the one place a failure becomes a reason (`reasonOf`), so the route, the bot and `canReadLater` all follow.
- **The merge kept main's #52 intent** in all six conflicted files:
  - `applied.ok`;
  - the photo-first ternary order in `user-avatar.tsx`;
  - `label = children` in `chip.tsx`;
  - the `seedLivedIn(token, now = Date.now())` default;
  - `lastMidday`, `setFixedTime` and the settle poll in `targets.e2e.ts`;
  - every row of main's bug-lessons block (`git diff 4cc4aa8 06bf826` deletes nothing there).
- **The unicorn fixes change no behaviour.** I checked each De Morgan inversion (`project-actions`, `composer`, `to-sort`, `assistant`, `review-actions`, `link-preview`); the rest move types into smaller scopes.
- Every finding has a bug-lessons row, and class 118 is new.

## Issues

### Critical
None.

### Important
None.

### Minor

**M1. A Log out can leave the local copy when the owner mark is not the leaving session's.**
- **Where:** `apps/app/src/app-state.tsx` (`leaving = activeSession`), `apps/app/src/local-copy.ts:18`.
- **What is wrong:** `activeSession` is set only when the status changes to signed-in.
  - If the token changes while the status stays signed-in (`adoptToken` while signed in), the tab still holds the old token as its leaving session.
  - A tab that started later has claimed the copy under the new token.
  - Log out in the first tab then calls `clear(markOld)`, which is refused, and the copy survives the sign-out.
  - The same happens when a claim failed and an older mark stayed (the accepted concern in the report).
- **Why it matters:** on a shared computer, a signed-out browser keeps the previous account's data. Before N3, a Log out always wiped the copy once no session was stored. N3 trades a rare wipe of another tab's data for a rare kept copy, and the kept copy is the worse failure for privacy.
- **Fix:**
  - Use the owner check only on the stale-tab path (a 401, or a sign-out heard from another tab).
  - When this tab itself pressed Log out, ended its own session or deleted the account, clear unconditionally.
  - Alternatively, re-claim (update `activeSession` and call `setOwner`) whenever the held token changes.
  - Add a test: claim with T2 in a second client, then explicit Log out in a tab whose active session is T1 → the copy is empty.

**M2. The IndexedDB compare-and-clear, the only store tabs share, has no test.**
- **Where:** `apps/app/src/platform/event-store.web.ts:80-96`.
- **What is wrong:** memory and SQLite are tested. The web store, the actual target of N3, is covered only by reading the code. The repo has no `fake-indexeddb`.
- **Fix:** add `fake-indexeddb` (dev) and a small test with the same three cases as `sqlite-event-store.test.ts`, or an e2e step in `live.e2e.ts` that sets a foreign owner in `meta` before the stale tab's 401 and checks that the copy survives.

**M3. Class 13's rule text does not record the `features.mcp` exception.**
- **Where:** `context/bug-lessons.md` class 13 section, `packages/core/src/api/schemas/instance.ts`.
- **What is wrong:** the exception is explained only in the schema comment, the core test and a Log row. Class 13's own rule says that a field an older server leaves out reads as absent (`knownOrNull`) or optional.
- **Ruling on the default:** `default(true)` is accepted.
  - An absent `mcp` means "an older server", and every older server either served MCP or failed the same way it does today. So true reproduces the status quo.
  - A default of false would hide a working Connect URL on every older https server, a regression for no gain.
  - A tri-state (`null` = unknown, shown as today) would be the class-13-pure form, with the same behaviour.
- **Fix:** add one line to class 13's rule: "An added capability flag defaults to what older servers actually did; name the flag and the reason in the class." The schema already carries its reason.

**M4. A stale doc comment on the parse reasons.**
- **Where:** `packages/core/src/api/schemas/parse.ts:37-42`.
- **What is wrong:** it still says `unreadable` means "every one answered out of shape". Since N7 it also covers a read every provider refused for good.
- **Fix:** update the comment. It is the contract's own documentation, shared by the Worker and the client.

**M5. N4's new sheet line was not shot.**
- **Where:** `apps/app/src/features/sessions/connect-ai-sheet.tsx`.
- **What is wrong:** CLAUDE.md requires the phone/desktop × light/dark × EN/RU matrix and a design review for every visual change before the PR. The report says this is owed.
- **Fix:** shoot the matrix before merge, or record explicitly that it moves to PR B's batch.

**M6 (nit). A refused clear still tells the other tabs to reload.**
- **Where:** `packages/client/src/state.ts`, `clear`.
- **What is wrong:** `onStored({ kind: "reload" })` is broadcast even when the store refused the clear. It is harmless: `reload` waits for writes in flight and re-reads the same data. It costs one extra read in the other tab.
- **Fix:** optional. Return whether the clear happened and broadcast only then.

**M7 (nit). `claimLocalCopy` bypasses the log's write queue.**
- **Where:** `packages/client/src/create-client.ts`, `claimLocalCopy`.
- **What is wrong:** it calls `store.setOwner` directly, while `clear` goes through the queue. Within one tab, a quick sign-out → sign-in can let the new claim land before the old session's queued clear. That clear is then refused, and the old copy stays until the first pull's store-id check drops it.
- **Fix:** optional. Run the claim through the same queue.

## The other side traced

| Change | Other side | Result |
|---|---|---|
| N1 (client) | `POST /api/auth/logout` is unchanged. A late 401 fails `token() === sent`, so it is never read as "ended elsewhere". | Holds. |
| N2 (client) | The server has no part. The press-time read now counts the start's own zone write, as the e2e fix shows. The count is right. | Holds. |
| N3 (client) | The server has no part. The other tabs' `reload` handling is safe (`settledAll` before `listAll`). | Holds. See M1 and M7. |
| N4a (server) | The client's `mcpUrlOf` returns `null`, and the sheet explains instead of showing a URL. Older APKs drop the unknown key, so nothing breaks. The sheet is the only consumer of `mcpUrl`. | Holds. |
| N4b (server) | The client is not involved. After deletion an MCP token is refused (the existing test passes). The `token:<user>:` prefix ends in a colon, so it never matches another user (ULID ids). | Holds. |
| N7 (server) | The app shows `aiUnreadable` / `rulesUsedUnreadable` / "Rephrase it." with no offer to read later. `isFinalAnswer` keeps the first-read guard. The bot uses `rulesPreviewUnreadable`. `unreadable` is an existing enum value, so older clients are unaffected. | Holds. |

## Recommendations

- Fix M1 before merge if the PR is meant to keep the "Log out wipes the copy" promise. It is a small change, scoped to who calls the drop.
- Add the IndexedDB test (M2) in the same change.
- Correct the two documentation items (M3, M4) in the same change.

## Declined to judge

- `onboarding-screen.tsx` `await markOnboarded(); router.replace("/")`: it awaits local storage, not the network, so it is outside class 118's case, and this round did not change it.
- KV list and delete eventual consistency in `revokeAllGrants`: the provider's own helpers have the same property, so there is no regression.
- Whether `withExclusiveTransactionAsync` can make concurrent native writes see SQLITE_BUSY: it was already used before this round, and clear goes through the write queue.
- N8 (the accepted residual): it is written down as the re-review asked, and accepting it is a product decision.
- The N5 log check's timing relative to the quiet window: the implementer showed it red 3/3 with the fix reverted. I did not rerun the e2e (the brief says not to run the full suite).
- Day's rows when returning to an earlier range (refetched, so empty offline): this follows from keying by range and is a reasonable tradeoff.
- The bumped dependency versions in `bun.lock`: they come from main's #52, which was reviewed there.
- The A9 analysis (a4a4c9f): docs only, a future task.
- The re-review's M4 and `storedPresetName` nits: the re-review itself left them.

## Assessment

**Ready to merge: With fixes.** There are no Critical or Important issues. M1 is the one with user-facing weight (privacy on sign-out) and should be fixed before merge. M2–M5 are small; M6 and M7 are optional.
