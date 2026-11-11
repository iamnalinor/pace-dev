> Historical plan; see [HANDOFF.md](HANDOFF.md) for status. Unchecked boxes and listed files are not a claim about the current tree.

# Task 9B: Copy-only archive and verified recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This packet is planning only; do not edit Task8 files until its author hands them over.

**Goal:** Produce immutable, verified monthly copies of retained events and raw usage, correct daily usage derivatives, full-history reads, a restore rehearsal, and resumable account archive cleanup.

**Architecture:** Add a portable ArchiveStore port implemented by R2 only in platform composition. The per-user serialized actor captures and journals a stable archive operation, verifies the actual stored bytes, then atomically publishes its local manifest. Source events and raw usage remain present; checkpoints and aggregates are rebuildable derivatives. A separately durable account-cleanup journal survives actor reset and controls retries.

**Tech Stack:** Bun, TypeScript, Zod, Drizzle SQLite, workerd, R2, Web Crypto, CompressionStream/DecompressionStream, Vitest/fast-check.

**Spec:** context/technical-execution/tasks-8-9-plan.md (9B), checkpoint-design.md, checkpoint-persistence-plan.md, context/cold-storage-plan.md, revised T4/T5 in context/technical-roadmap.md, F-02/F-07/F-08 of context/technical-execution/plan-review.md. Revised copy-only roadmap overrides early pruning in the original brief.

## Global constraints

- No source edits were made while preparing this packet. No tests/lint were run by the planner.
- Task8 precedes integration; Task9A persistence precedes archive/checkpoint coupling. Respect its actual final ports and schema migration sequence.
- Bun only; test-first for changed behavior; `bun lint` after implementation changes in meaningful batches. Generate migrations via `bun db:generate`, review generated SQL, preserve STORE_EPOCH=2.
- No production provisioning/deployment, archive pruning, resource creation, exploratory QA, Android, or unrelated UI changes. An absent archive binding leaves existing source readers operational.
- API feature folders share only via shared; put cross-feature cleanup coordinator/contracts in shared rather than importing account from user-store or the reverse.
- A checkpoint-covered cursor is unrelated to a calendar month or occurredAt cutoff. Do not infer seq coverage from a date.
- No public restore/admin route. Recovery targets an explicitly isolated empty actor; never apply replay through `append`/`derive`, which would create new events and side effects.

## Review focus (each is pinned in tasks below)

1. Archive generation G finishing after wipe to H must never publish into H or recreate G objects after cleanup.
2. A correction can precede its missing target; archives preserve both raw corrections and opaque source envelopes without dropping unknown historical event schemas.
3. A usage extension/rename changes a month already archived; repeated/shrinking uploads must remain write-free and totals must never double count.
4. Reset deletes actor SQL/KV/alarm; cleanup operation identity and pending work must survive that boundary and a confirmation stuck at processing must be resumable.
5. Monthly objects contain sparse seq subsets; restore must prove complete union coverage, exact raw identities and replay equivalence, rather than trusting min/max/count alone.

## Existing seams and decisions

- `user-store/log-queries.ts`: `listPage` pages seq, `loadLog` skips schema-unknown source rows. Archive capture must read raw SQL rows (including seq and payload text), never `loadLog` or effective events.
- `user-store/cloud-data.ts`: usage_sessions PK=(deviceId,app,startAt), phone_uses PK=(deviceId,startAt). Upserts retain max(endAt); sessions can independently rename deviceName. Existing `cloud-data-writes.test.ts` pins **zero SQL writes** for repeated/shorter uploads. Preserve this invariant including archive bookkeeping/aggregate writes.
- `user-store/store-identity.ts`: storeId is generation; resetStore clears everything. Owner is the stable userId supplied by trusted actor host (`ctx.id.name` currently); missing owner must refuse archive/cleanup, never use a shared fallback.
- `account/delete-account.ts`: grants → store.wipe → D1 user delete → live socket end. Wipe confirmations also call store.wipe. Both must clean archives, including previous generations, superseded/uncommitted objects.
- `account/account-routes.ts`: processing currently resumes only through an in-process catch; a killed request can strand it. The retry coordinator must reconcile this state.
- Existing app XLSX export is `packages/client/src/view-models/export.ts`, from full AppState.log; MCP export_all is `mcp/tools/analytics-tools.ts` using store.list. Keep list's current full-history meaning through9B; don't repurpose it as checkpoint tail (9C adds a separate bootstrap contract).
- SQL analytics hides only phone_uses today. Add archive operation/chunk/manifests/revisions and cleanup internals to private policy; never expose archived phone uses through aggregate or JSON metadata tables.

## Contract and file map

Create `apps/api/src/shared/ports/archive-store.ts`:

```ts
type ArchiveIoError = "archive/unavailable";
type ArchiveStore = {
  putIfAbsent(key: string, bytes: Uint8Array): Promise<Result<"created" | "exists", ArchiveIoError>>;
  get(key: string): Promise<Result<Uint8Array | null, ArchiveIoError>>;
  list(input: { prefix: string; cursor?: string; limit: number }): Promise<Result<{ keys: readonly string[]; cursor?: string }, ArchiveIoError>>;
  delete(key: string): Promise<Result<void, ArchiveIoError>>;
};
```

No R2/CF types, etag-as-checksum, Response objects, or global bindings. R2 adapter `platform/cloudflare/archive-store.ts` uses actual atomic create-if-absent, not GET then PUT. Existing-key retries always GET and compare; mismatching immutable bytes are an integrity error, never overwritten. List must expose all pages, delete is missing-key idempotent. Owner authorization/key construction stays domain-side.

Add optional `HISTORY_ARCHIVE?: ArchiveStore` to shared/ports/bindings.ts and adapt optional raw binding in platform/cloudflare/{bindings.ts,env.d.ts}. Configure an **isolated test bucket** in vitest.config.ts miniflare only. Do not add a required production bucket/deploy config. Document self-host binding setup without provisioning it.

Create focused `user-store/archive-{codec,repository,service,history,restore}.ts`, `user-store/usage-aggregates.ts`; pure interval splitting belongs in `packages/core/src/tracking/daily-usage.ts` with exported contract through core.ts. Shared durable cleanup belongs in `shared/account-cleanup.ts` plus journal repository (D1). Exact implementation can split codec/types into two files if lint/file size warrants.

### Object representation and ownership

- Namespace: `history/v1/<encoded-owner>/<encoded-storeId>/months/<YYYY-MM>/<compressedSha256>.jsonl.gz`; immutable manifests under same generation namespace `manifests/<manifestHash>.json`. Encode each identity as one path segment and validate reconstructed prefix; never accept a caller-supplied arbitrary key for normal archive/read/delete.
- Partition month is **UTC occurredAt month for events**, **UTC startAt month for raw rows**. This is a storage partition, independent of the user's zone. Preserve full raw intervals once, even across month boundaries. Daily aggregates use local calendar boundaries separately.
- Each JSONL line is a strict discriminated stored record: event `{ kind:"event", seq, row:<complete stored SQL envelope> }`; usage `{kind:"usage", revision, row:{deviceId,deviceName,app,startAt,endAt}}`; phone use `{kind:"phone-use",revision,row:{deviceId,startAt,endAt}}`. Use deterministic record order (events seq ascending, then each raw kind by composite key), deterministic serialization/newline policy. Preserve payload text without materializing/filtering corrections.
- Manifest formatVersion=1, owner, storeId, sourceSchemaTag, month, capturedThroughSeq, rawRevision, counts per kind, min/max included seq (informational), canonical uncompressed SHA-256/byteLength, compressed SHA-256/byteLength and data object key. Validate every line, ownership/month and record uniqueness after decompression. Hash bytes, not UTF-16 strings. R2 metadata is merely diagnostic.
- Important: monthly copies can have sparse seq values because partitioning uses occurredAt. The retained-source complement is every source row not already represented at the fixed capture, including holes below an archive max seq, not just `seq > max(archive.seq)`. A monthly manifest describes a snapshot **as of its capture**, not a promise that every seq up to capturedThroughSeq lives in that one month. ArchiveSet manifest lists selected monthly manifest hashes plus exact sourceHighSeq/total event count (and raw counts/revision), allowing whole-set restore to verify the exact captured source inventory digest and counts. AUTOINCREMENT conflict attempts can leave legitimate numerical seq gaps: do not require 1..high-water to exist. Missing allocated records must still fail the source-inventory check.
- Amend/revoke events stay immutable and live in their own occurredAt month. They don't rewrite their target event. A later backdated event dirties its own month and writes a new complete monthly revision. Correction-driven checkpoint invalidation remains Task9A's full-source rebuild, including correction-before-target.
- First implementation may assemble one month in memory; report actual bytes and worker memory cost, with no flat-memory claim. Persist exact staged compressed bytes in <=64KiB SQL BLOB chunks for crash-safe retries. Use an initial 16 MiB uncompressed UTF-8 per-month limit (measure before raising it); if a capture exceeds it, return explicit archive/too-large and keep source; do not silently truncate or mark complete. Segmenting oversized months is a separately reviewed format extension, not a hidden behavior.

### Durable operation state

Add private `_history_archive_operations`, `_history_archive_chunks`, `_history_archive_manifests`, `_history_archive_months` and monotonic revision metadata in DO schema. Operation includes immutable owner/store/month/capture identity, staged bytes+hashes/counts, stage prepared|uploaded|verified|committed, and retry scheduling metadata. Local active month points at a committed manifest; previous manifests remain immutable and discoverable.

- `prepareArchiveMonth({owner,storeId,month})` captures source plus current seq/raw revision, computes bytes/hashes, and atomically inserts operation+chunks; if an identical prepared/committed identity exists reuse it. Prepared is durable **before** external PUT.
- `resumeArchiveOperation(operationId)` validates current owner/store and cleanup fence before every external write and before local publication. PUT object and immutable manifest, persist uploaded; GET both, decompress/parse/recount/check both hashes and metadata, persist verified; transactionally insert committed manifest and active month pointer, mark committed. Failure retains stage/source and schedules bounded retry via armEarliest. A crash after PUT before stage update retries exact staged bytes/key.
- Keep object data and manifest immutable. Publish manifest remotely only after data readback; re-read remote manifest as well. A remote manifest without local commit is a harmless uncommitted object and must be included by cleanup listing.
- Task8 actor queue covers complete top-level calls across awaits; normal same-user appends cannot interleave within one resume call, but may happen between retries/restarts. A newer source revision must not be marked clean by an older operation: clear dirty month only if captured revision still equals current month revision. Preserve committed old revision as valid historical copy and enqueue a fresh operation; do not overwrite it or silently label it latest-current.
- Do not add detached archive writes through waitUntil that outlive actor authority. All actor RPC/alarm entry points retain the Task8 queue; no internal reentrant RPC to the same actor. Another user's actor remains independent.

## Task 1: Portable storage and codec

**Files:** new shared port, platform adapter, codec/types and adjacent tests; bindings/vitest config; core archive schema only if transferred in a public contract later.

- [ ] Write RED adapter cases: create then retry same key, altered existing bytes cannot overwrite, missing read, all list pages, missing delete, real R2 byte roundtrip. Domain failure-injection double implements the same port; adapter tests use actual test R2.
- [ ] Write RED codec cases: Unicode payload split across persisted chunks, corrections/unknown stored type roundtrip, duplicate seq/id/raw key, wrong owner/generation/month, invalid gzip, truncated JSONL, byte/hash/count mismatch and unknown version.
- [ ] Implement minimal port adapter and strict deterministic codec. Return literal Result errors; never catch storage outage and return an empty successful archive.
- [ ] Run focused tests, then `bun lint`; review storage boundary and immutable-write contract before continuing.

## Task 2: Journal and copy-only publication

**Files:** DO schema.ts, archive-repository.ts, archive-service.ts, user-store.ts/alarm integration, log-queries.ts raw snapshot helper, analytics.ts private tables, generated DO migration, tests/archive.int.test.ts.

**Interfaces:** `captureArchiveMonth({owner,storeId,month}): Promise<Result<PreparedArchive,ArchiveError>>`; `resumeArchiveOperation(id): Promise<Result<CommittedArchive,ArchiveError>>`; explicit absent archive support = no scheduling/no production changes.

- [ ] RED interruption matrix: throw immediately after each durable boundary and after remote writes; reconstruct service with same SQL and bucket and resume. Same operation identity/bytes, one active local pointer, all source rows retained.
- [ ] RED current generation mismatch, absent owner, cross-owner key injection, late correction/backdate between retries, append queued behind slow PUT, independent user's progress, failed GET/checksum/count and failed local commit. No corruption becomes committed and no hot row is deleted.
- [ ] Implement chunk repository with transactionSync publication and no external await inside it; integrate optional archive alarm branch preserving earliest-wakeup semantics. Begin copy only for closed months beyond conservative checkpoint cutoff, never through incomplete current month.
- [ ] Generate/review migration. Check repeated migrations and initialization on an existing populated actor, with no epoch reset. Run focused API tests and `bun lint`.

## Task 3: Raw revisions and local-day derivatives

**Files:** core daily-usage.ts/test, core.ts; cloud-data.ts and cloud-data-writes.test.ts; usage-aggregates.ts/test; DO revision/aggregate schema and generated migration; archive capture/service tests.

**Interfaces:** `splitDailyUsage(interval, zone): Result<readonly {day:string;from:string;to:string;milliseconds:number}[],"usage/invalid-interval"|"usage/invalid-zone">`; app aggregate table key=(storeId,zone,day,deviceId,app); device aggregate table key=(storeId,zone,day,deviceId). Keep phone-use totals private and separate, never expose phone timing via analytics. Store integer milliseconds; convert/round only for existing consumers.

- [ ] RED daily split: midnight exactly, UTC month crossing, spring/fall DST in America/New_York (2026-03-08=23h and 2026-11-01=25h), non-hour offset Asia/Kathmandu, zero/negative duration, zone change. Use startOfDayIn and nextDayStartIn, never add 86_400_000 milliseconds or preserve a skipped-midnight hour into the next date.
- [ ] RED uploads: repeated/shorter emits **zero SQL writes** to raw/revision/dirty/aggregate tables; extension emits a new monotonic revision; rename preserves max end while changing archived metadata; old-start interval extended into a later month dirties its start-month archive and all affected aggregate days.
- [ ] Track raw revisions atomically with actual changed raw rows (prefer sidecar private revision table to keep existing SELECT * callers/tests/RPC row shape intact). Seed preexisting raw rows as revision0. Source row+sidecar/month-dirty changes share one SQL transaction; notification/sleep external awaits remain outside. Each changed row receives current monotonic generation-local raw revision.
- [ ] Recompute affected closed days from authoritative retained rows and replace exact totals; do not increment totals per upload. Match existing packages/client/src/view-models/screen-time.ts exactly: union intervals within each device/app for app totals, and separately union intervals across all apps on each device for device totals. Account total is the sum of rounded per-device totals, not the sum of per-app totals (apps can overlap). Retain per-app firstAt/lastAt and device names for future aggregate-backed consumers; round only at the same boundary as existing screenTime/appsDuring. Keep devices separate, phone intervals separate from app sessions. Rebuild all zone-tagged aggregates if settings zone changes; never relabel old-zone results as new-zone facts.
- [ ] Verify old aggregate revisions are replaced, no phantom zero rows remain, and sleep usage/knownUntil behavior is unchanged. Run focused core/API tests and `bun lint`.

## Task 4: Full-history reader and isolated restore rehearsal

**Files:** archive-history.ts/test, archive-restore.ts/test, shared/contract.ts/ports user-store-host.ts where RPC needed, platform host forwarding, user-store.ts list/find/simulate, tests/archive-restore.int.test.ts, tests/mcp-analytics.int.test.ts. App/client export integration is Task9C, but pin9B's unchanged full-history contract now.

**Interfaces:** internal reader takes a fixed `{owner,storeId,sourceHighSeq,archiveSet}` snapshot; `readHistoryPage({after,through,limit})` returns original seq-ordered raw envelopes+next cursor; `verifyRestore({archiveSet,retainedComplement,expected})` returns a report or literal integrity error. Any restore writer accepts only explicit isolated-empty target and a generation-bound plan, never HTTP user input.

- [ ] RED merge cases: same event in hot+multiple monthly revisions appears once by id with original seq; conflicting bytes or seq for same immutable id fail; monthly replacements use latest selected committed revision, never concatenate all revisions. Mutable raw identity merges by revision (equal revision unequal bytes fails), never additive totals or arbitrary longest-end to choose rename metadata.
- [ ] RED complete restore: capture baseline events/raw rows, corrections/chains/future target, same-time lower-id, old open task, late backdate, raw extension/rename; restore selected latest archive set + retained hot complement to a fresh isolated actor. Preserve seq and identity metadata; rebuilt canonical state/known ids/correctionTargets, timeline/history, source envelopes, raw rows and daily totals equal baseline. Rebuild checkpoint/projections from source; don't trust archived projections.
- [ ] Assert exact captured source inventory/digest and counts through high-water plus raw snapshot revision/counts before saying complete; preserve legitimate unallocated sequence gaps. A stale month after raw change may be readable as historical snapshot but cannot certify latest full restore. No automatic derived/system event insertion, notification, parse, or external send during restore.
- [ ] Preserve list/find/simulate and MCP export_all as full-history readers. Source-retained normal reads may use hot source on archive outage; an explicitly archive-backed request must return error, never missing rows as complete. Pin pagination limit+1/more/seq progress and no duplicates. An immutable read snapshot must not mix generations or revision pointers across pages.
- [ ] Compare existing client `exportSheets` on restored full state+log with baseline (event sheet includes correction envelopes). No replacement of AppState.log with partial history in9B. Add an API integration test proving normal retained-source sync is unchanged and requests settle;9C owns checkpoint HTTP/socket bootstrap and browser steady state.
- [ ] Run focused API/core/client export tests and `bun lint`.

## Task 5: Resumable account archive cleanup

**Files:** shared/account-cleanup.ts + durable journal repository, shared/db/d1-schema.ts + generated D1 migration, account/delete-account.ts, account/account-routes.ts, user-store.ts/store-identity.ts cleanup fence, actor alarm retry path/host RPC forwarding, account/archive cleanup integration tests.

**Interfaces:** `beginAccountCleanup({operationId,userId,action:"wipe"|"delete"})`; `resumeAccountCleanup(operationId)`; journal is not FK-cascaded with users and contains no user content, only identity/action/stages/retry/lease. Both confirmation actions and test account deletion use the same coordinator. Existing account confirmation id is the stable operation id where available; direct test reset obtains/reuses a pending owner operation.

- [ ] RED cleanup: owner has multiple generations, committed/superseded manifests, uploaded-not-committed objects and >one list page. Remove every object under exact owner prefix; preserve another owner with a common string prefix. Missing keys are success; a page/list/delete failure is not completion.
- [ ] RED fail/restart after each effect (grant removal, each object deletion, actor reset, D1 user deletion, socket closure, confirmation terminal state). Resume same operation, no orphan archive/no lost retry identity/no unrelated-user deletion. A processing confirmation must resume after lease expiry rather than report alreadyHandled forever; terminal polling survives deleted sessions as now.
- [ ] Establish durable cleanup journal/fence before archive cleanup; serialize/fence actor source/archive writes while cleanup is in progress. Cancel/prevent prepared job publication and await queued/in-flight archive operations before listing. Repeated list-from-start deletion until prefix empty avoids pagination offsets shifting during deletion; test this on adapter behavior. Remove remote archives **before** resetting the actor (reset otherwise loses manifests), but never rely on local manifests as complete deletion inventory.
- [ ] Keep retry evidence outside actor deleteAll. Existing actor alarm retries before reset; after reset re-arm remaining work from journal, and provide a journal-driven reconciliation entry called by confirmation/status retry and available to scheduled host maintenance. **Do not claim actor alarm alone guarantees autonomous retry across a crash immediately after deleteAll**: that deletes the alarm. If guaranteed unattended cleanup is required, implement/test a Worker scheduled journal sweep entry without enabling a production cron here; otherwise document explicit retry-driven recovery honestly. D1 journal completion is last, after all effects and confirmed prefix emptiness; no success response before it.
- [ ] Wipe preserves sessions, changes store generation only after old archive cleanup, and permits writes only when its cleanup journal is complete. Delete revokes grants/sessions, ends sockets and deletes D1 identity; retries tolerate already missing user, actor data, OAuth keys, sockets and archive binding absent when none ever existed. An archive binding unexpectedly missing for recorded objects must block completion rather than forget them.
- [ ] Add bug-lessons entry for any found missing class and sweep all wipe/delete/reset callers, including epoch policy. Do not bump STORE_EPOCH; a future epoch reset with archives requires its own durable cleanup handling rather than silently dropping generation inventory.
- [ ] Run focused account/archive/live/MCP regressions and `bun lint`.

## Verification and handoff

Focused commands are `bun run --cwd apps/api test src/platform/cloudflare/archive-store.test.ts`, `bun run --cwd apps/api test src/user-store/archive-codec.test.ts tests/archive.int.test.ts`, `bun run --cwd packages/core test src/tracking/daily-usage.test.ts`, and equivalent named new API test paths. Use actual final test filenames. Root `bun test:api` and `bun test:unit` are appropriate once focused changes pass; no exploratory/Android run. Record RED and GREEN evidence; don't run standalone type/lint tools.

Before checkpoint/push, use installed Superpowers requesting-code-review template with goal/spec, actual git range, and explicit **trace the client side** brief. Request database/type/security/silent-failure specialist review for archive ownership, revision/coverage invariants and cleanup. Trace app export, MCP export, HTTP/socket sync even when their files are outside diff. Work through findings with receiving-code-review. Update implementation ledger with exact commit/check results and limitations (copy-only, retained-source fallback, snapshot bytes and oversized-month behavior, no provision/deploy/pruning). Task9C consumes these contracts and still must implement atomic checkpoint bootstrap/outbox/history hydration and explicit protocol rollout.
