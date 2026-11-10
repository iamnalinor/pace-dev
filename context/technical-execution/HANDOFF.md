# Technical continuation: handoff

Current as of 2026-11-10. This is the one status record for the technical continuation; the
per-task reports, reviews, ledgers and earlier handoffs are in [archive/](archive/) and are
historical (their counts and "based on main" statements predate the rebase below).

## State now

- PR #55 "Technical continuation" (Codex, branch `codex/technical-continuation`, head `a403eaa`)
  was squashed onto the redesign PR #54 (`claude/pace-design-overhaul-b`, `5b1e883`) as commit
  `8cf29c4a` on branch `ccr-360ee3f0-hebtg7`: a stacked PR on top of #54, not on main. Merge
  resolutions are in that commit's message (the redesign's D1 0009 and DO 0006 stay; the account
  cleanup table is D1 `0010`, the continuation's two DO migrations are one regenerated `0007`).
- The full history of the Codex work stays on `codex/technical-continuation`.
- A review of the stacked PR is being worked through in fix waves on branches off
  `ccr-360ee3f0-hebtg7` (the tooling/CI/docs slice on `fix/t-tooling`). Earlier green CI runs of
  PR #55 do not cover the rebased head; its own CI is the authority.

## Delivered (all behind defaults that keep production as it was)

- **Infrastructure ports** (Task 8): Cloudflare SQL, actors, alarms, sockets, KV and OAuth behind
  portable contracts under `apps/api/src/shared/ports`, adapters in `apps/api/src/platform`,
  guarded by dependency-cruiser and ESLint.
- **Checkpoints** (Task 9A): bounded atomic SQL snapshots with `off` / `shadow` / `active` modes
  and retained-source fallback. **Default off.** Source events are never pruned.
- **Archives and cleanup** (Task 9B): immutable verified raw archives (codec and R2 port), raw usage
  revisions and daily aggregates, recoverable account cleanup and isolated restore.
- **Checkpoint-aware sync** (Task 9C): bootstrap, HTTP/live sync, IndexedDB/SQLite persistence,
  complete History and export from the source. The browser test for it is opt-in
  (`PACE_E2E_CHECKPOINTS=1`, see [docs/testing.md](../../docs/testing.md)).
- **Firebase**: the shared pair contract, `bun run check:config` preflight, opt-in runtime native
  configuration, server handoff, session retirement and origin/project-scoped push ownership;
  `GET /api/deployment-readiness` (see [docs/self-hosting.md](../../docs/self-hosting.md)). Policy
  defaults to `additive`; APK-baked configuration still works.
- **OTA**: manifest signing, immutable staging, channel promotion and the isolated delivery Worker
  `apps/updates`; native lifecycle, build trust and status UI; fingerprint validation and the
  runtime record CLI (below). **Disabled in default builds.**
- **Android**: the emulator smoke harness (`android-e2e.yml`, on the `android-e2e` label or by
  hand; not a release gate) and the JVM-only Firebase controller tests
  (`bun test:native-firebase`).

## Deferred (not started or not enabled)

- Production activation: checkpoint mode, strict Firebase policy, OTA in release builds.
- The archive R2 binding: not in `apps/api/wrangler.jsonc` (archives stay off).
- OTA publication: release/publication CLI and preview/promote workflows, signing in CI, native
  rollback evidence, binding runtime records to the compiled APK's `assets/fingerprint`.
- Device FCM delivery validation on a real phone; Android smoke as a release gate.
- Exact-version deployment rehearsal: Cloudflare Version URLs are not available for Durable
  Object Workers, so a staged "verify the inactive version, then promote" path does not exist.
- CPU: checkpoint validation and replay measured slower than source parse/replay in a synthetic
  Bun benchmark ([reproduction](checkpoint-benchmark-reproduction.md)); no CPU or memory gain is
  claimed.
- Open review item from Task 9B (not changed): `cloud-data.ts` filters intervals lexicographically
  (phone `endAt >= startAt`, sessions `endAt > startAt`), but valid UTC ISO strings of different
  precision are not always lexicographically chronological (`...00Z` versus `...00.001Z`). Review
  alongside the actual upload contracts before changing existing semantics. The archive codec
  never normalizes source strings and no longer orders intervals.
- Minor: the Week grid wall-clock positioning issue (older than this work). Telegram cleanup
  replies now keep the request's language (stored on the confirmation).
- Account cleanup recovery: a cron (`*/15 * * * *` in `wrangler.jsonc`, owner's decision 2026-11-10) runs the Worker's `scheduled` handler (`sweepAccountCleanups`), which resumes cleanups left `pending` (an outage, a crash, more than 100 archive objects) and settles confirmations still processing. Confirm again in Telegram or the app's status poll still resume one at once; while it waits the store is fenced and store calls answer `503 cleanup/busy`.

## Removed

- 2026-11-10: the staged-deployment runner `scripts/deploy/*` (about 1,560 lines and 2,000 lines of
  tests) was removed: nothing outside its tests called it, it had no adapters for upload, secrets,
  migration or promotion, and it depended on protected Version URLs, which Cloudflare does not offer
  for Durable Object Workers. It is in git history on `codex/technical-continuation` (`db38aebe`).

## Records

Plans and design notes that describe the current code stay here, each marked as historical:
[implementation plan](implementation-plan.md), [tasks 8–9 plan](tasks-8-9-plan.md),
[ports](ports-implementation-plan.md), [checkpoint design](checkpoint-design.md),
[checkpoint persistence](checkpoint-persistence-plan.md), [checkpoint sync](checkpoint-sync-plan.md),
[archive](archive-plan.md), [native Firebase](native-firebase-implementation-plan.md),
[OTA](ota-implementation-plan.md), [OTA publisher](ota-publisher-service-plan.md). Bug classes found
along the way are in [bug-lessons](../bug-lessons.md) (250–257, 280–291).

## Source record CLI

With an explicit release environment, run
`PACE_RELEASE_TAG=v0.11.0 bun scripts/ota/native-runtime-cli.ts record --output runtime.json`.
Use `verify --record runtime.json` under the candidate's same release environment.
Output creation is exclusive; errors are sanitized. Do not interpret a compatible source record
as proof of the installed APK, successful native execution, or authorization to publish.
