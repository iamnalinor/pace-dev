# Review: PR #48 follow-ups A1–A8 (cffcc47..98af07c)

Reviewer: Senior Code Reviewer (superpowers:requesting-code-review template). Read-only. A temporary
worktree at 98af07c was used for one probe test, then removed.

Read for this review:
- the brief and the implementer's report;
- `origin/main:context/pr48-followups.md` and the triage in `context/design/redesign-plan.md`;
- the full diff;
- the code each change calls into: the OAuth provider 1.2.2's constructor and its metadata matching, `useIsEmptyCopyUntil`, the sync backoff, `preset-actions.ts`, MCP `preset-tools.ts`, `decisionViews`, and `health.ts` penalties.

## Strengths

- **The groups match the brief.** There is one commit per group, and every item carries a test written first: a red run is shown for A7 and A8, and A1–A6 add tests that would fail without the fix.
- **A1 is one rule, not seven patches.** Every placeholder now waits on `useIsAccountUnknown`. The `isAccountBound` flag is gone, so there is one decision rather than two. `hasFirstSyncFailed` cannot flicker the cover, because `useIsFirstSync` stays false after the first run ends. The "Trying again…" copy is true: `sync-client.ts:242` backs off from 1 s to 60 s.
- **A2 maps the reasons with an exhaustive `switch` and no `default`.** It is shared by both callers. The time bar's ruling (no "read later" for an activity) is sound and recorded.
- **A3 removes the double read at its source.** Day reads once. It also adds a session-keyed share of requests in flight, with a deadline, which respects class 104. Review #5's sweep filter is now exact.
- **A4's health timeout is clean.** `withinMs` clears its timer. The cached empty value has its own TTL, shorter than the good-read TTL, and the test pins that. The schema-fit exception is narrow (`questions` only, at the root only), and the opposite case is pinned for `actions`.
- **The A5 #7 pin is a real steady-state test.** Both orders are covered, the result is "signed out, never ended elsewhere", and no `/api/me` follows.
- **A6 puts both writers (the app and MCP) behind one validator.** The id is the slug plus the end of a ULID: readable, and unique across devices.
- **A7's `ownOrigin` is one rule for the provider, `/api/instance` and the challenge.** The blank-origin crash the sweep found is real, it is fixed, and a test covers it.
- **A8's wrapper is minimal and does not weaken the rule** (see item 4). Classes 115 and 116 are honest, useful rows.

## Issues

### Critical

None.

### Important

**I1. A6: an unchanged name is refused, so duplicates that existed before A6 (or came from a merge) cannot be edited at all, and neither can the default preset they shadow.**
- **Where.**
  - `packages/core/src/presets/resolve-preset.ts:226` runs `validateName` on every `update`.
  - It excludes only the preset's own id (`resolve-preset.ts:205-210`).
  - MCP `update_preset` fills `name: args.name ?? current.name` (`apps/api/src/mcp/tools/preset-tools.ts:140-147`), so an edit that changes only the definition is refused too.
- **Verified.** A probe in the worktree:
  - Two "Gym" presets: an update of `gym-aaaaaa` that keeps its name returns `preset/name-taken`.
  - A custom "Work" from before A6: an update of the **default** `work` that keeps its shipped name returns `preset/name-taken`.
- **Why it matters.** Before this commit, duplicate names were the supported behaviour: the deleted test was "gives a second preset of the same name an id of its own". So real accounts hold them. The commit's own ruling, "kept as they are, the person renames one", leaves the person unable to change a recurrence on either preset, or on the default, without renaming first. The editor says "A preset with this name already exists" about the preset's own name. That is a class 99 remedy that cannot work as stated.
- **Fix.**
  - In `update` mode, check the name only when it changes: `nameKey(input.name) !== nameKey(current.name)`, where `current` is `presetById(state, input.id)`.
  - Tests:
    - (a) after a merge, a duplicate's definition-only edit passes;
    - (b) the default `work` is editable beside a custom "Work";
    - (c) renaming into a taken name is still refused;
    - (d) an MCP `update_preset` with only `definition` on a duplicate.
  - Add a bug-lessons log line (class 2: the update path was assumed from the create path).

**I2. A4: a provider outage counts as a "blind try", so a text the person chose to have read later lands in the Inbox about 3 minutes into an outage.**
- **Where.** `apps/api/src/user-store/parse-queue.ts:197`, where `blindTries` grows for every failure with `retryAt === null`.
- **What happens.** A 5xx or a network failure gives `retryAt: null` and `reason: "unreachable"` (`llm.ts:70`). `blindRetryAt` then waits for the earliest penalty. Penalties are 1, 2, then 4 minutes (`health.ts:56-61`), so the third failed drain is about 3 minutes in, and the text goes to the Inbox.
- **Why it matters.**
  - It contradicts A2 in the same PR. The composer offers "Read it when it's back" precisely for `unreachable` (`reading-issue.ts`, `canReadLater`). Before, that promise held for up to a day. Now it holds for 3 minutes.
  - Review #2 asked to count tries for refusals *of this request for good*: a 400, a content filter, a context that is too long. An outage is the transient case. The fix inverts class 18 ("a permanent refusal treated as transient") into "a transient outage treated as permanent".
  - The test covers only a 400 three times, and a single 500.
- **Fix.**
  - Classify in `llm.ts`. When every provider answered a 4xx other than 401, 403, 408, 409 or 429, mark the error as refused for good (a flag or code on `LlmError`, e.g. `isRefused`). Count `blindTries` only for that.
  - A 5xx or a network failure keeps waiting for the penalty, bounded by `GIVE_UP_MINUTES`, as before.
  - Tests in `parse-queue.test.ts`:
    - three 500s keep it queued;
    - three 400s go to the Inbox;
    - a 400 then a 500 does not reset the count wrongly (choose and pin a rule).
  - Amend the class 18 row to say a guard must also check the opposite case.

**I3. A7's own sweep (class 1/40, "a malformed API_ORIGIN takes the Worker down") is incomplete. Values that `ownOrigin` accepts and the provider rejects still turn every request into a 500.**
- **Where.**
  - `apps/api/src/shared/config.ts:178-196`: `apiOriginOf` checks only `isHttpUrl` and returns the string as typed.
  - `apps/api/src/worker.ts:47-55,77-84` builds `new OAuthProvider` from it.
- **What the provider requires.** `validateResourceMetadataOptions` (oauth-provider.js:2822-2826) requires:
  - https, or http on a loopback host;
  - a lowercase scheme and host;
  - canonical serialisation, so no trailing `/`, no path and no default port.
- **Values that still throw `TypeError` on every request:**
  - `API_ORIGIN=https://Pace.example.com`
  - `https://pace.example.com/`
  - `https://pace.example.com:443`
  - `http://192.168.1.5:8787`
  - a blank `API_ORIGIN` on a Worker reached at `http://192.168.1.5:8787`. `docs/self-hosting.md:89` says the app accepts plain http on private networks during development, so this is a documented path.
- **Second effect.** With a trailing slash, `atOwnOrigin` (`worker.ts:64-70`) always rewrites, to `https://pace.example.com//.well-known/...`, which 404s even at the canonical host.
- **Why it matters.** This is the exact failure the commit says it fixed ("the config and docs say such a value is ignored"), and the bug-lessons row claims it is swept.
- **Fix.**
  - `apiOriginOf` returns `new URL(v).origin`, which lowercases the host and drops the default port and the path. It warns and ignores a value that is neither https nor http on loopback.
  - `ownOrigin`'s fallback to the reached origin must pass the same rule. When it does not, do not build the provider: serve `app` directly, with `/mcp`, `/oauth/*` and the well-known paths answering a 503 that says why (logged). `/api/*` and the app keep working.
  - Guard: a table test (better, a fast-check property over hosts, schemes, ports and trailing slashes) that whatever `ownOrigin` returns either builds `new OAuthProvider(providerOptions(x))` or takes the documented fallback. Never a throw.

**I4. A3's long quiet window does not reliably catch the 4–5 s loop it claims to catch.**
- **Where.**
  - `e2e/support/screen-checks.ts:128` sets `LONG_QUIET_MS = 6000`.
  - `repeatsAfterSettle` counts only what was sent since `settledAt`.
- **Why it misses.** A loop with period P appears twice in a window W for certain only when W ≥ 2P. For P = 5 s the chance of two sends inside 6 s is (6−5)/5 = 20%. For P = 4 s it is 50%.
- **Why it matters.** The class 107 log row and the comment both say a 3–5 s loop is caught, so a future loop of that kind would pass about 80% of runs. That is class 107 again: a window shorter than what it must see.
- **Fix.** Either:
  - make the window at least twice the longest period to catch (10–11 s), and run it on one account rather than all of them, to bound the cost; or
  - keep 6 s, but count each key's sends since navigation (`watch.reset()`) and fail on two sends of one key at least 2.5 s apart after the first settle.

  Correct the comment and the row either way.

### Minor

- **M1.** `apps/api/src/worker.ts:47` keeps one `OAuthProvider` per origin in an unbounded `Map`. With a blank `API_ORIGIN`, the key comes from the Host the request reached. Behind a self-hoster's proxy that forwards any Host, every distinct Host adds an instance for the isolate's life. Fix: cache only the configured origin, or cap the map, for example by building per request in the fallback path.
- **M2. Steady-state pins are missing on two sides.**
  - A4's server rule ("read later goes to the Inbox after N refusals") has no test on the client or the API: the Inbox item arrives over pull, and nothing repeats.
  - A1's 5xx e2e (`e2e/sync-state.e2e.ts:99-144`) asserts the line and Retry, but not that the failing pull backs off rather than hammering the server.

  Add both. CLAUDE.md's rule on contract sides asks for this, and so does explicit item 1 of the brief.
- **M3.** `apps/app/src/app-state.tsx:339-343`: the comment on `useIsAccountUnknown` still says "the rest of the app shows its real empty state meanwhile". After A1 the rest of the app waits on this hook. Update it.
- **M4.** `scripts/fresh-import-timeout.test.ts:31`: `/\btimeout: /` is satisfied by any `timeout:` in the file, such as a `waitFor({ timeout: … })`. The glob also skips `apps/api/tests` and `scripts/`. Fix: require the `FRESH_IMPORT_MS` constant, or a `{ timeout:` on the `describe`/`it` that holds the `resetModules`, and widen the glob.
- **M5. Bug-lessons rows.**
  - The log rows for A1–A7 (`context/bug-lessons.md`, the 2026-11-03 rows) do not say why the existing tests missed each bug. CLAUDE.md requires it, and the A8 sections (114–116) do say it.
  - A6 L4 is filed under class 1, which is weak. It is a missing invariant on the write path, closer to class 2 or a new "uniqueness people rely on, not enforced" class.
  - The class 107 row overstates its guard (I4).
  - The class 18 row will need I2's correction.
  - The A7 row claims the sweep is complete (I3).
- **M6.** A6's "both writers go through the validator" misses a third writer: the example seed (`packages/client/src/actions/preset-actions.ts:121-131` and MCP `seed_example_presets`) emits `preset.created` without `validateName`. A custom "Algebra HW" followed by a seed gives two identical chips. Fix: skip a seed whose name is taken, and report it in `skipped`.
- **M7.** `worker.ts:64-70` `atOwnOrigin` rewrites any method on that path, while its comment and the report say "only that GET path". It is harmless, because the provider answers 405 or the CORS preflight. Restrict it to GET, HEAD and OPTIONS, or correct the comment.
- **M8. The UI changes have no design pass.** These are visible changes:
  - the new pill copy with Retry;
  - `ReadingIssueLine` with an `ActionChip`;
  - the rewritten connect-AI line.

  The report shows no shot matrix, no `impeccable`/`apple-design` review and no intermediate QA round. CLAUDE.md requires all three before the PR leaves draft. The Russian `sync.notSyncedYet` makes the pill longer while QA21 L9 (the pill wrapping in Russian) is still open (Task 3.7). Check it at 390 px.
- **M9.** A5 #7's pin has no recorded red. Run a mutation once, removing the `isCurrentSession` guard or the `ending` guard, and note in the bug-lessons row that the test fails without each. A pin of existing behaviour is only a guard if it can fail.

## Explicit items

### 1. The other side traced, and steady-state pins

| Item | Other side | Steady state pinned? |
|---|---|---|
| A1 (client rule; server answers 5xx) | Server unchanged; the client backs off 1–60 s. | Screen settles (e2e and jest). Network quiet is **not asserted** (M2). |
| A3 | The usage endpoint is unchanged; the client adds an abort on the deadline. | Yes (`day-screen.test.tsx`, `sync-state.e2e.ts`). |
| A4: deferred tries go to the Inbox | The client reads the Inbox over sync, but the rule breaks A2's "read later" promise for `unreachable` (I2). | **No** (M2). |
| A4: `LlmHealth` timeout and cache | Server internal; there is no client contract. | Not applicable. |
| A5 #7 | The server refuses the ended token; the client ignores it. | Yes, `/api/me` stays quiet (`create-client.test.ts`). |
| A5 hidden tab | Server not involved. | Unit test only. |
| A6 `preset/name-taken`, ids | Both the MCP and the app writers check the name; the server does not validate pushed events (by design). Old APKs still create slug ids with duplicate names, which makes I1 more likely. | The app test checks that nothing is written. Not a network concern. |
| A7: well-known, `ownOrigin`, `/api/instance`, challenge | The app's `mcpUrl` is built from `instance.apiOrigin`, which now uses the provider's rule: traced. | Server-only tests. This is adequate, apart from I3. |

### 2. Rulings on the implementer's concerns

- **A6, edits refused after a merge or beside a pre-A6 name: must fix.** See I1. Check the name only when it changes.
- **A4, an outage counts toward the three tries: must fix.** See I2. Count only refusals of this request for good.
- **A5 #7, a test pin only: acceptable.**
  - The brief allows "ignore 401s for the ended token".
  - The test does run past `HOLD_WAIT_MS` (the DELETE waits for the hold), covers both orders and pins the quiet network.
  - Record a mutation-red once (M9).
- **A7, the library's 401 at another host: acceptable, keep it.**
  - RFC 9728 §3.3 makes a compliant client reject metadata whose `resource` differs from the URL it used. So a client at a non-canonical host cannot finish OAuth whatever the challenge says.
  - Adding `resource_metadata` there would not help, and it would mean patching the library.
  - By the same reasoning, the well-known document served at another host mainly helps lenient clients. The real remedy is the canonical URL, which the app hands out, plus the L6 line and the docs. The commit already does both.

### 3. Security of A7

- **No open redirect.** `atOwnOrigin` builds a `Request` internally and never answers with a redirect. `/authorize` is unchanged.
- **No header injection.**
  - The `WWW-Authenticate` value is built from `ownOrigin(...)`, which is either the validated configured string or `new URL(request.url).origin`. URL origin serialisation cannot carry `"`, CR or LF.
  - The descriptions are constant strings.
  - `new Request(url, request)` copies the headers verbatim and reflects nothing.
- **The canonical resource cannot be spoofed when `API_ORIGIN` is set.** The document is static and names the configured origin at whatever host is asked, and the query passes through to the provider's own `requestCarriesResourceQuery`.
- **With a blank or ignored `API_ORIGIN`, the document names the Host it was reached at.** That is the documented fallback, and it was already true of `/api/instance`. The document goes only to the requester, and Cloudflare's cache key includes the host, so there is no cross-host poisoning. Two residual risks:
  - the unbounded provider map (M1);
  - a misconfiguration that still crashes the Worker (I3). That is an availability problem, not a confidentiality one.
- **Nothing leaks.** The metadata is public by RFC 9728.

### 4. The A8 wrapper rule

- **It is not weakened.**
  - `pace/promise-function-async` forwards every report of the upstream rule, with upstream's `meta` (schema, defaults and messages) and the same options, since both are configured as plain `"error"`.
  - It removes `fix` only when `messageId === "missingAsyncHybridReturn"`, and that report stays an error.
- **Its scope matches the old one.**
  - It is on in the typed TypeScript block.
  - It is off for React files, where upstream was off.
  - It is off in the untyped blocks, where `disableTypeChecked` turned upstream off. `UNTYPED_RULES` makes that explicit for the new name.
- **Two tests pin it.** The RuleTester checks the hybrid case (reported, `output: null`), the pure-promise case (still fixed) and the annotated case (valid). A config test checks that `pace/` resolves to `[2]` and upstream to undefined on three files.
- **Not a weakening, but a gap the row admits:** the other fixers were not audited (class 114 sweep). The row says so, and that is acceptable.

### 5. Bug-lessons rows

| Row(s) | Ruling |
|---|---|
| 114 | Real class. The sweep is honest about its limit. Guard present. |
| 115 | Real class; sweep done. The guard is weak (M4). |
| 116 | Real class; sweep and guard reasonable. |
| A1 ×2 (class 62) | The class fits. The sweep covers every placeholder. Guards present. "Missed because" is missing (M5). |
| A2 (99) | Fits; swept; guarded. |
| A3 L5 (79) | Fits; swept; guarded. |
| A3 review #5 (76) | Fits; swept; guarded. |
| A3 window (107) | The class fits, but the guard does not do what the row says (I4). |
| A4 #3 (104) | Fits; guarded. |
| A4 #2 (18) | Overcorrects (I2). |
| A4 #4 (95) | Fits; both sides pinned. |
| A5 ×3 | Fit. For #7, see M9. |
| A6 L4 (class 1) | Weak class (M5), and the sweep misses the seed (M6). |
| A6 ids (38) | Good. The sweep of other content-derived ids is reasoned. |
| A7 well-known (102) | Good. |
| A7 blank origin (1) | The class fits; the sweep is incomplete (I3). |
| A7 L6 (99) | Good. |

## Recommendations

1. Fix I1–I4 test first. Each needs:
   - the red run;
   - a log line in `context/bug-lessons.md`;
   - for I2, the class 18 note on the opposite case;
   - for I3, a property test over origins.
2. Fold in M1, M3, M6 and M7 while those files are open. They are small.
3. Before the PR leaves draft:
   - the shot matrix and design review for the pill, the issue line and the connect-AI line (M8);
   - an intermediate QA round scoped to A1, A2 and A7;
   - the specialist reviews CLAUDE.md names:
     - `security-reviewer` on `worker.ts` and `config.ts`;
     - `database-reviewer` is not needed: there is no schema change;
     - `pr-test-analyzer` on the e2e window.
4. Consider renaming the composer's "Read it when it's back" decision resolution from `corrected` to a dedicated value. This is low priority: `corrected` folds the row into the drain's own decision, which works today.

## Declined to judge

- **`TaskFields` hides the category, importance and project rows while the account is unknown, but a task saved then still writes the hidden default preset.** The brief asks only that defaults are not *drawn* as the account's. Which preset to write while the account is unknown is a product choice the sources do not settle.
- **"Read it when it's back" resolving the decision as `corrected` rather than a new resolution.** It meets the minor as worded (the decision no longer stays open), and the drain writes its own decision row. A new enum value would change the API contract, which is outside this plan.
- **The cost of the new e2e long-window loop on CI time** (it was about 12.5 minutes before). This is the owner's CI concern, listed separately in the follow-ups.
- **The copy and tone of the new EN and RU strings** (`assistant.unread.*`, `connectAi.otherAddress` naming `API_ORIGIN` to end users). Copy direction belongs to the design pass (impeccable), not this logic review.
- **Whether the well-known document should be served at foreign hosts at all, given RFC 9728 §3.3.** The brief explicitly asked for the 404 to go. The ruling above explains why it is harmless.
- **`blindRetryAt` reading health that may be a cached `{}` after a failed read, so it falls back to 5 minutes.** That is the intended degraded behaviour from review #3.
- **Preset ids now carrying a random suffix in URLs (`/presets/gym-3k9x2q`).** This is cosmetic, and it is the ruling the brief invited.
- **The jest "worker process failed to exit" warning.** It is not caused by this range, and the report flags it.
- **PR B items, owner actions and "Carried over" items.** These are out of scope by the brief.

## Assessment

**Ready to merge: With fixes.**

The work is careful and mostly well tested. A1, A2, A3 (apart from the window), A5 and A8 are solid. Four Important issues need fixing before this leaves draft:
- A6 locks editing for accounts that already hold duplicate names, including a default preset (verified).
- A4's tries counter turns A2's "read it when it's back" into "Inbox in three minutes" during any outage.
- A7's sweep leaves several plausible `API_ORIGIN` values, and the documented private-network http setup, still crashing every request.
- A3's 6 s guard misses the 4–5 s loops it claims to catch most of the time.

None is architectural. Each is a contained change with a clear test.
