# Report: PR #48 follow-ups A1–A8 (PR A "Foundation", draft #53)

Branch `claude/pace-design-overhaul-3p860c`. A1–A6 were done by an earlier implementer, who left no
report before the container restarted (commits b52545d..3e4b722, already pushed). This report
rebuilds them from `git show`. A7 (2fdc7b9) and A8 (a70756d, plus 98af07c, a fix to A8's own test) were done in this session, each test
first with the red run shown. Nothing was pushed.

## Summary

| Group | Commit | Bug-lessons rows | Coverage against the brief |
|---|---|---|---|
| A1 Sync and first pull | b52545d | 2 (class 62) | full |
| A2 Time bar | 6412838 | 1 (class 99) | full |
| A3 Network hygiene | 684d813 | 3 (79, 76, 107) | full |
| A4 Server LLM path | 57bbc91 | 3 (104, 18, 95) | full; client side of the "to Inbox" rule not pinned (see A4) |
| A5 Sign-out races | f5fd571 | 3 (75, 1, 2) | review #7 pinned only, no code change (the client already ignored it) |
| A6 Presets data | 3e4b722 | 2 (1, 38) | full; a side effect on edits after a merge is flagged (see A6) |
| A7 Self-hosting | 2fdc7b9 | 3 (102, 1, 99) | full; one ruling on the library's challenge |
| A8 Tooling | a70756d, 98af07c | 3 (new classes 114, 115, 116) | full |

## A1: sync and first pull (b52545d, reconstructed)

- **QA21 M4.**
  - **Root cause.** On an empty copy, a first pull that failed with HTTP 500 left every placeholder on the final empty copy ("Nothing to do right now."). There was no line and no Retry. The placeholders waited on `useIsFirstSync`, which turns false after any finished attempt. Only a pull that could not reach the server showed the offline pill.
  - **Fix.** `EmptyState`, `EmptyText` and `FirstSyncBody` now wait on `useIsAccountUnknown`, so a failed first sync keeps the grey rows. After a failure that reached the server, the sync frame says "Your data has not loaded yet. Trying again…" with Retry (`shell` catalog, EN and RU).
  - **Tests.** `sync-frame.test.tsx` covers 500 and offline: grey rows, the line, and Retry loads the data. `sync-state.e2e.ts` opens `/`, `/day` and `/projects` with the pull and the socket failing: no `EMPTY_COPY`, the line is there, Retry works.
- **`/add` during the first sync.**
  - **Root cause.** New task drew its built-in categories, importance and project as if they were the account's. The route sweep let `/add radio:` through as "open".
  - **Fix.** `TaskFields` (shared by New task and the task editor) wraps the account-bound rows in `KnownAfterSync`. The estimate falls back to none. The task's own fields (start, due, estimate, repeat) stay.
  - **Tests.** `composer.test.tsx` (the rows stay grey until a pull of this session succeeds). The `/add` exception in `sync-state.e2e.ts` now covers only the task's own choices.
- **Other side.** Client only; no server rule changed.

## A2: time bar (6412838, reconstructed)

- **QA21 M3.**
  - **Root cause.** `readingIssue` never read the parse `reason`. When no model read the text and the rules found nothing, it said "could not read this. Try again." for every reason, including off and out of requests.
  - **Fix.**
    - One `ReadingIssue` carries the reason's sentence and its time (`reading-issue.ts`, plus the new `reading-issue-line.tsx`). Both callers read it: the time bar and the composer's line.
    - The composer offers "Read it when it's back" for limited and unreachable.
    - The time bar does not offer it. **Ruling recorded in the row:** an activity read later would start at the wrong time.
  - **Tests.** `time-bar.test.tsx` and `composer.test.tsx`, one case per reason (limited, unreachable, unreadable, off) with no actions.

## A3: network hygiene (684d813, reconstructed)

- **QA21 L5.**
  - **Root cause.** Day read the day's usage twice: once in `useWhereSat`, outside the first-sync placeholder, and once in the screen-time section, inside it. On a fresh browser the second read mounted only after the first had answered, so sharing the request in flight alone did not catch it.
  - **Fix.** Day reads once and hands the result to both parts. `useRange` in `packages/client/src/react/usage.ts` also shares a request in flight by kind, session and range, with a deadline.
  - **Tests.** `day-screen.test.tsx` (one usage call); `sync-state.e2e.ts` (no URL twice on Day's first load).
- **Review #5.** The signed-out route sweep now allows exactly `refused: GET /api/me 401` (`route-sweep.e2e.ts`).
- **Review minor.** Each screen is watched once more per account with `LONG_QUIET_MS` (6 s), which catches a loop that repeats every 3 to 5 s.

## A4: the server's LLM path (57bbc91, reconstructed)

- **Review #2 and the drain minor.**
  - A failure with `retryAt: null` counts as a blind try (`blindTries` on the queued item). After `BLIND_TRIES` (3), the text goes to the Inbox.
  - The wait without a time is the earliest health penalty still running, else 5 minutes (`blindRetryAt`).
  - Test: `parse-queue.test.ts` (with the fake model's `badRequestWith`).
- **Review #3.**
  - The `LlmHealth` read gives `{}` after `readTimeoutMs` (about 1 s) and keeps the failure for `HEALTH_FAILURE_CACHE_MS` (5 s). `record` runs after the response.
  - Test: `health-store.test.ts`.
- **Review #4.**
  - A left-out root `questions` reads as `[]`. A missing `actions` is still refused, and that is pinned.
  - Tests: `schema-fit.test.ts`, `llm.test.ts`.
- **Other side.** I found no client-side test in this commit for "a text read later lands in the Inbox after three blind tries". The rule changes what the server returns over time, which the brief's "trace the other side" item covers. The client reads Inbox items through ordinary sync, so it is probably fine, but it is not pinned.
- **Possible behaviour concern (not in the brief).** A provider outage (a 500) with no `retryAt` from the model also counts as a blind try. The wait is the penalty, but a text can reach the Inbox after three penalty windows instead of waiting up to a day.

## A5: sign-out races (f5fd571, reconstructed)

- **Review #7.**
  - **No code change.** The client already ignores the hung run: `isCurrentSession` once the token is forgotten, and `ending` while the revoke is out.
  - A test pins both orders: `create-client.test.ts` (the hung pull lands before and after the revoke's answer; the result is signed out, never "ended elsewhere", and no check follows).
  - **Flag.** The brief said "abort it or ignore 401s". It is ignored rather than aborted. That meets the "ignore" branch, but only through existing code.
- **Minor: hidden tab.** `startSenders` now checks visibility, and both the start and the failed revoke go through it. Test: `senders.test.ts`.
- **Minor: read later.** "Read it when it's back" resolves the preview's decision as "corrected". Test: `composer.test.tsx`.

## A6: presets data (3e4b722, reconstructed)

- **QA21 L4.**
  - `validatePresetInput` refuses a name that another non-archived preset already goes by (`preset/name-taken`). The name is compared trimmed, NFKC-normalised and lower-cased, against a default's label in either language too.
  - The editor shows a sentence; MCP `create_preset`/`update_preset` return a code.
  - Tests: `resolve-preset.test.ts`, `presets.test.tsx`, `mcp-tools.int.test.ts`.
- **Other side.** Both writers (the app and MCP) go through the one validator.
- **Ids across devices.**
  - `newPresetId` is the name's slug plus the end of a fresh ULID. Test: `preset-draft.test.ts`.
  - **Ruling recorded in the row:** two presets with the same name that an offline merge brings together are kept as they are, and the person renames one.
- **Flag (side effect).** After such a merge, editing either duplicate is refused as `name-taken` until it is renamed: the check excludes only the preset's own id. That matches "the person renames one", but it blocks unrelated edits, and no test covers it.

## A7: self-hosting (2fdc7b9, this session)

### 1. The well-known document returned 404 off `API_ORIGIN`

- **Root cause.** `@cloudflare/workers-oauth-provider` 1.2.2 answers `/.well-known/oauth-protected-resource/mcp` only when the origin and path match the canonical resource exactly (`findResourceServerForMetadataUrl`).
- **Test (red: 404).** `oauth.int.test.ts` fetches it at `https://pace.lan:8443`. It now gets 200, with `resource: <API_ORIGIN>/mcp`. Another path in that namespace still gets 404.
- **Fix.** `worker.ts` `atOwnOrigin` rewrites only that GET path to the Worker's own origin before handing it to the provider. The document is public and names the canonical resource.
- **Our own challenge.** `invalid_token` in `mcp/server.ts` built its `resource_metadata` from `request.url`. It now uses `<own origin>` plus `MCP_RESOURCE_METADATA_PATH`.
  - This changes nothing observable today: a token used at another host is refused with "Invalid audience" by the provider before our handler runs. I tried a red test for it, saw that, and dropped the test.
- **Ruling.** At another host, the provider's own 401 challenge names no `resource_metadata`. That is deliberate (RFC 9728 §3.3), and I left it as it is. A compliant MCP client must use `<API_ORIGIN>/mcp` in any case (class 102), and the app hands out that URL.

### 2. A blank or malformed `API_ORIGIN` took the Worker down (found in the sweep)

- **Root cause.** `worker.ts` passed `env.API_ORIGIN` raw to `new OAuthProvider`, whose constructor throws a `TypeError` for anything that is not an absolute https URL (or http on loopback). Every request failed. The config and `docs/self-hosting.md` say such a value is ignored.
- **Test (red: TypeError).** The Worker with `API_ORIGIN: "  "`: `/api/instance` and the metadata answer using the reached origin. Also a unit test for `ownOrigin` in `config.test.ts`.
- **Fix.** One `ownOrigin(configured, requestUrl)` in `shared/config.ts`, used by the provider, `/api/instance` and the MCP challenge.

### 3. MCP URL vs the agent's `--api`

- **Ruling.** The difference is intended (classes 83 and 102):
  - The computer agent's `--api` uses bearer tokens, which work at any address, so "Add a computer" keeps the address the device uses.
  - The MCP URL must be the canonical resource.
- `docs/self-hosting.md` now says which address each one is, and that `API_ORIGIN` must be reachable by the AI apps.

### 4. QA21 L6, the "public address differs" line

- **Test (red).** `sessions.test.tsx`.
- **Fix.** `connectAi.otherAddress` takes `{used}`, the address the device uses. EN: "This device reaches the server at {used}, but AI apps must use the address above: Pace's sign-in for them works only there. If they can't reach it, whoever runs this server sets API_ORIGIN to an address they can." RU mirrors it.

### Bug-lessons rows and the other side

- Bug-lessons rows: 102 (the well-known document), 1 (one rule for the Worker's own origin, in three places), 99 (the line drops what it knows).
- Other side traced: the app's `mcpUrl` already uses `instance.apiOrigin`. `/api/instance` now uses the same rule as the provider, so the URL handed out equals the resource the metadata names, at whatever address the Worker is reached (the existing round 7 test plus the blank-origin test).

## A8: tooling (a70756d, this session)

### 1. Autofix turned `() => p` into `async () => await p`

- **Which rule.** `@typescript-eslint/promise-function-async`. For a "hybrid" return (`Promise | undefined`, inferred and unannotated) it reports `missingAsyncHybridReturn` and still inserts `async`. `return-await: always` then adds the `await`.
  - I reproduced it on a probe file: `{ get: () => inFlight }` became `async () => await inFlight`.
  - An annotated union return is not reported at all.
- **Fix.** `pace/promise-function-async` (`scripts/eslint-rules/promise-function-async.ts`) wraps the upstream rule.
  - It keeps every report and drops the fix only for `missingAsyncHybridReturn`. The upstream message already tells the person to add an explicit return type.
  - `eslint.config.ts` uses it in place of the upstream rule, with a reason comment. It is off for React files, as the upstream rule was, and off in the untyped blocks (`UNTYPED_RULES`).
  - No inline disables.
- **Test (red: the output had `async`).** `promise-function-async.test.ts`, a type-aware RuleTester: a pure promise is still fixed, a hybrid return is reported with no output, and an annotated union is valid. A config test checks that the resolved config runs `pace/` and not the upstream rule.
- **Bug-lessons.** New class 114, "An autofix that changes what the code means". The sweep covered `return-await` only; the other fixers were not audited one by one, and the row says so.

### 2. `ids-no-prng.test.ts` timed out under load

- **Root cause.** Each test does a cold fresh import (`vi.resetModules()`) within vitest's 5 s default.
- **Fix.** A describe-level `FRESH_IMPORT_MS` (30 s) there and in `numbers.test.ts`. `initials.test.ts` already had one.
- **Guard (red: both files listed).** `scripts/fresh-import-timeout.test.ts`.
- **Bug-lessons.** New class 115, "A test's time budget set on an idle machine".

### 3. A8's own test failed in the full suite (98af07c)

- **What happened.** `bun test:unit` failed the four RuleTester cases, which had passed when the file ran alone. With no `filename`, typescript-eslint linted them as a missing `estree.ts`, and the project service, already warmed by the other test files, refused that path.
- **Fix.** The cases now lint as the test file itself. I re-checked red: with the wrapper's fix-drop removed, a case fails.
- **Bug-lessons.** New class 116, "A test green alone, red in its suite".

## Verification (tip 98af07c)

| Check | Result |
|---|---|
| `bun lint` | exit 0; design-value warnings at 74, the ratchet |
| `bun test:unit` | scripts 125/125, core 875, client 510, pace-agent OK |
| `bun test:api` | 62 files, 590/590 |
| `bun test:app` | 118 suites, 881/881 |
| `bun test:e2e` | 191/191 passed in 13.0 min, 4 workers, fresh servers (:8787 and :4173 were free before the run) |

- **Note on timing.** `bun test:api` and `bun test:app` ran at a70756d. 98af07c changes only `scripts/eslint-rules/promise-function-async.test.ts` and `context/bug-lessons.md`; `bun test:unit` and `bun lint` were re-run after it.
- **Note on jest.** jest-expo printed "A worker process has failed to exit gracefully". It is not a failure, and it was not investigated.

## Concerns for the controller

1. **A6, edits after a merge.** After an offline merge brings two presets with the same name together, or for a custom preset named like a default that was created before A6, any edit of either one is refused as `preset/name-taken` until it is renamed. No test covers this.
2. **A4, Inbox after an outage.** A provider outage without `retryAt` counts as a blind try, so a text can reach the Inbox after about three penalty windows. The client side of "read later lands in the Inbox" is not pinned by a test.
3. **A5, review #7.** Pinned only, with no code change: the client already ignored the hung run.
4. **A7, another host.** The library's 401 challenge at a non-canonical host still names no `resource_metadata` (RFC 9728 §3.3, left as the library has it).
5. **Reviews.** No `superpowers:requesting-code-review` was run for A1–A8: the brief says never dispatch subagents. The CLAUDE.md review step is still to do before the PR leaves draft.
6. **Report file.** `.superpowers/` is ignored by git (`.git/info/exclude`), so this report is not committed.

## Fix round 1 (review `review-followups-a.md` and QA round 23)

Commits 2a23dbb..f3e6a02, each test first, with trailers. History was not rewritten and nothing was pushed.

### The review: all 4 Important and all 9 Minor findings

| Item | Commit | What changed | Test (red first) |
|---|---|---|---|
| I1 (A6) | 2a23dbb | The name rule runs only when the name differs from every name the preset goes by (its own, plus a default's label in EN and RU). | `resolve-preset.test.ts`: merged duplicates, the default `work` beside a custom "Work" in both languages, and a rename into a taken name still refused. `mcp-tools.int.test.ts`: duplicates pushed past the rule, then a definition-only `update_preset`. |
| M6 | 2a23dbb | Both seeds (the app's and MCP's) go through `isExampleToSeed`. An example whose name is taken is skipped and listed in `skipped`. | `actions.test.ts`; `mcp-tools.int.test.ts` |
| I2 (A4) | 0da7175 | `LlmError.isRefused` is set only when every provider asked answered a 4xx about this request (not 401, 403, 404, 408, 409, 410 or 429). Only that counts toward `BLIND_TRIES`. An outage keeps waiting, up to a day. Rule pinned: a 500 between two refusals keeps the count. | `llm.test.ts`. `parse-queue.test.ts`: 20 drains of outages and refused keys leave it queued with a count of 0, then it is read; refusal → 500 → refusal keeps counting. |
| M2 (A4 side) | 0da7175 | The store's path end to end, through a new `#refused` marker on the fake provider. | `parse.int.test.ts`: three refusals give one Inbox task, and later alarms write nothing more. |
| I3, M1, M7 (A7) | cc7fc33 | `API_ORIGIN` is normalised to `URL.origin` and must pass the provider's https-or-loopback rule. `oauthOrigin` returns null when neither the configured origin nor the reached one passes; the Worker then serves the app, and only `/mcp`, `/oauth/*`, `/authorize` and `/.well-known/oauth-*` answer 503 with a reason (logged once). The provider cache keeps 4. The well-known rewrite is GET/HEAD/OPTIONS only. `docs/self-hosting.md` updated. | `own-origin.int.test.ts`: a fast-check property over schemes, hosts (case, IDN, loopback, LAN), ports and tails. Red check: a pass-through `apiOriginOf` fails it, and the 503 split and the trailing-slash origin are covered too. |
| I4 (A3) | 8d7decd | `LONG_QUIET_MS` = 2 × `LONGEST_LOOP_MS` + 1 s = 11 s (W ≥ 2P). The screens are split over three tests per account. The comment and the class 107 row are corrected, and class 107 gains the W ≥ 2P rule. | Route sweep: 6/6 long-window tests passed in the final full e2e (11 s window). |
| M2 (A1 side) | 8d7decd | A1's 5xx e2e checks that the failing pull backs off: no more than 4 tries in 6 s. | `sync-state.e2e.ts` |
| M3 | 8d7decd | The `useIsAccountUnknown` comment now matches what the code does. | — |
| M4 | 8d7decd | The guard now requires a timeout on the test itself (`{ timeout: X_MS }` on a `describe`/`it`). The glob widened to `apps/*/tests` and `scripts`. | `fresh-import-timeout.test.ts` (a `waitFor({ timeout })` is no longer accepted) |
| M5 | 8d7decd | Every A1–A7 log row now says why the existing tests missed the bug. Corrected rows: class 18 (overcorrection, plus a rule for the opposite case), class 107, A6 L4 (refiled under class 2, and notes the missed seed), A7 blank origin ("partly", completed by I3). | — |
| M8 | — | Not done. It needs the design pass: the shot matrix plus impeccable/apple-design reviews of the pill, the issue line, the Connect line and the new Log out confirm. That still has to happen before the PR leaves draft. | — |
| M9 | 8d7decd (recorded) | Mutation run on the A5 #7 pin. Without the `ending` guard (`auth.ts`, `session.ending() !== sent`), the "before" case fails. Without `isCurrentSession` in `sessionCheck`, both cases stay green: `session.token() === sent` already holds the "after" case. | `create-client.test.ts`, run by hand |

### QA round 23

| Finding | Where it went |
|---|---|
| R23-01 (medium) | Fixed, 636ae54. `createZoneStep` writes the device zone once per session, only after a sync of that session succeeded. **Sweep:** the start's other writes are `ensureInstances` (nothing on an empty copy; idempotent ids) and the phone's device registration and usage upload (device data, not account data). Account controls already wait in `KnownAfterSync`. **Tests:** `app-state.test.tsx` (red first). Guard in `sync-state.e2e.ts`: the 5xx path in a browser set to Asia/Tokyo pushes no `timezone` after the recovery; it passes, but was not run red. |
| R23-02 (medium) | Fixed, 636ae54, plus 22b59b0. `PaceClient.unsyncedCount` is new. The shared `LogoutButton` asks first when the outbox is not empty: it names the count (plural, EN and RU) and offers Wait (which syncs now) or Log out anyway. Log out stays reachable. New class 117. **Tests:** `create-client.test.ts`, `settings.test.tsx` (red first). There is no e2e for it. **Plan:** the R22-02 follow-up row (Task 4.11) marks the unsynced half as fixed; the server-session half stays with Task 4.11. |
| R23-03 (latency) | No code change. Task 5.6 owns it: the carry-over row "R22-09 → Task 5.6" stands, and Task 5.6 gains a line for R23-03. |
| R23-04 | Fixed, 81f5d3f. Root cause: a paste is read at once, and the first-read guard kept only a parsed reading that found nothing, so the Enter after a paste repeated the request. `isFinalAnswer` now keeps the guard for off, unreadable and limited; unreachable may still be asked again. **Tests:** `composer.test.tsx` (paste then Enter, one case per reason; red first). |
| R23-05 | (a, b): Task 4.8 + Task 3.8. (c) did not reproduce on this tree (refused Save keeps `?from=hw`) and is pinned in `round6-minors.e2e.ts`. (d) is QA21 M1, already owned by Tasks 3.6 + 3.8. |
| R23-06 | Fixed, 35f220e. `editorDraft(preset, language)` shows the label; `storedPresetName` keeps a default's shipped name when its label is saved back (the app and MCP `update_preset`). The examples are seeded in the account's language (`preset.example.*`). **Tests:** `preset-draft.test.ts`, `actions.test.ts` (red first). |
| R23-07 | Fixed, 35f220e. History names a preset as it is called now. **Tests:** `history.test.ts` (red first). |
| R23-08 | Fixed, 756f44f. `useUsageRead` reports a failed read when nothing was ever read; Day says "Couldn't load screen time." with Try again. **Tests:** `day-screen.test.tsx` (red first). |
| R23-09 | Fixed, 0cec3b5. One word for retry: "Try again" / «Попробовать снова». `crash.retry` (Reload) is a different action and keeps its word. **Tests:** `i18n.test.ts` guard (red first). |
| R23-11, R23-13c | Fixed, 0cec3b5 (copy). The Connect line no longer names `API_ORIGIN`; the docs carry it. |
| R23-10, R23-12, R23-13a/b, R23-14, R23-15 | Pointers added to Tasks 3.9, 4.3, 3.7, 3.9/3.10 and 3.10, plus a "QA round 23" table in the plan. |

New bug-lessons classes: 116 (from round 0) and 117 (R23-02). Every other item got a log row under an existing class.

### Found by the full e2e of this round (22b59b0)

- **The failure.** The first `LogoutButton` awaited the outbox read (IndexedDB) between the press and `auth.logout`. Under parallel load, `live.e2e.ts` "a stale tab's late 401…" then failed 2 runs in 3: the tab that had logged out showed "You signed out in another tab", and its login form was emptied.
- **Diagnosis.** With the read removed (count forced to 0) the test passed 3/3, so the pause itself is the cause. A sync run that started in the pause carried the token the log-out then ended. That is my reading of it; the race was not traced to the exact line.
- **The fix.** The count is now read ahead: `useUnsyncedCount` refreshes it on every change to the log or the sync, so a press with nothing unsent logs out with no pause. Both the stale-tab and the versions-screen e2e passed 3 of 3 runs.
- **Ruling.** The versions screen keeps a plain Log out. Its server can take nothing, so Wait could not help, and the only unsent change there was the app's own zone write.
- **Bug-lessons.** A row under class 75.

### Concerns

- **The underlying race (22b59b0) is not fully traced.** A Log out preceded by any pause can read to its own tab as "signed out in another tab". Today nothing pauses before `auth.logout`, but the class 75 race is not closed at its root. The specialist review should trace it.
- The new UI needs the design pass (M8) before the PR leaves draft: the Log out confirm, Day's screen-time failure line, and the shorter Connect line.
- R23-02 has no e2e (offline add, then Log out). It is covered by app tests only.
- R23-01's e2e guard was not run red.

### Verification after fix round 1 (tree at 52864c7, the last code commit is 22b59b0)

| Check | Result |
|---|---|
| `bun lint` | exit 0 (74 design-value warnings, the ratchet) |
| `bun test:unit` | scripts 126/126, core 877, client 515, pace-agent OK |
| `bun test:api` | 63 files, 599/599 |
| `bun test:app` | 888/888 |
| `bun test:e2e` | 195/195 passed in 14.1 min, with fresh servers |

The run before 22b59b0 failed 2 e2e tests (183/185). Both are explained in "Found by the full e2e of this round" above.
