# Infrastructure ports and safe history storage implementation plan

> For agentic workers: use superpowers:subagent-driven-development task-by-task, with independent
> Superpowers-template specialist review. The owner explicitly authorized Tasks 8 and 9 on
> 2026-11-06. Continue without approval between reversible implementation/checkpoint steps.

**Goal:** Complete the Cloudflare boundary extraction and implement verified checkpoint/archive,
checkpoint-aware sync and recoverable full-history access without activating production pruning.

**Architecture:** Domain code owns narrow SQLite, actor, scheduler, live-channel and archive ports.
Cloudflare adapters provide the current implementation. History remains immutable and authoritative;
checkpoints and aggregates are rebuildable derivatives. Archive publication is copy-only until
compatibility and recovery gates pass; no production deployment or data deletion occurs here.

**Tech Stack:** Bun, TypeScript, Drizzle SQLite, Hono, Cloudflare workerd/D1/DO/R2, Vitest, Playwright.
**Spec:** `context/infra-portability-plan.md`, `context/cold-storage-plan.md`, and revised T4/T5 in
`context/technical-roadmap.md`; review corrections in `context/technical-execution/plan-review.md`.

## Global constraints

- Continue on `codex/technical-continuation`; checkpoint and push PR #55, never merge.
- No exploratory QA or local Android. Automated tests are allowed; avoid unrelated UI changes.
- Bun entry points; Node-shebang tools use the verified Node 24 installation. Unified `bun lint`
  in meaningful batches, no standalone lint/type tools and no weakened rules.
- Preserve SQLite dialect, query behavior, migrations, RPC, alarm persistence and socket hibernation.
- Source events/raw usage are retained. No STORE_EPOCH bump, production pruning, deployment,
  resources or credentials. Archive copy and activation are distinct controls.
- Contracts in core precede server/client changes. Trace both sides and assert settled network.
- Generate schema migrations with `bun db:generate`; do not edit applied SQL or metadata.

## Review focus

1. Concurrent writes and external awaits must not introduce multiple writers or stale publication.
2. Retroactive events, corrections of corrections and duplicate ids across cursor/cutoff boundaries.
3. Corrupt/incompatible checkpoint or archive must fail closed or rebuild from intact source data.
4. Offline outbox survives bootstrap; store generation reset must still discard another account's data.
5. Failure/restart at each archive stage, late backdates, full export and account deletion include
   superseded objects; read-back success alone is not permission to prune.

## Task 8: Infrastructure boundaries

**Files:** `apps/api/src/shared/ports/*`, `platform/cloudflare/*`, `shared/db/d1.ts`,
`shared/app-env.ts`, `shared/user-store-of.ts`, `shared/llm/*`, `user-store/*`, callers in
`auth`, `account`, `bot`, `sync`, `mcp`; `app.ts`, `worker.ts`, lint/architecture guards and tests.

**Interfaces:** SQLite-only shared database and actor database; durable key/value and scheduler;
actor host returning the existing typed RPC surface; live-channel upgrade/list/tags/close with
session ownership. Assets remain at the existing app Worker composition boundary. Ports expose no Cloudflare ambient/runtime types. The adapter
owns migration execution, DO inheritance/RPC hosting, socket pairs/hibernation and raw bindings.
OAuth's Cloudflare-specific provider remains in composition, not domain logic.

- [x] Inventory actual call signatures and write portable contract tests for key/value, scheduler,
  actor isolation, session-scoped socket closure and migration idempotence. Capture RED for new seams.
- [x] Extract SQLite/storage/scheduler contracts first; keep existing SQL and tests intact.
- [x] Extract host bindings and actor/socket composition; wire Cloudflare adapters at entry points.
  Update tests at host boundaries rather than making production ports accept raw Cloudflare bindings.
- [x] Expand import/ambient AST guards to all converted domain files; deliberate leaks must fail.
- [x] Run real-workerd API regressions and focused adapter contracts; review, lint and checkpoint.
- [x] Document adapter capabilities. A second runtime belongs to conditional Task 10, not this task.

## Task 9A: Checkpoint with retained source and shadow comparison

**Files:** core materialization/checkpoint modules and exports; API `user-store/state-cache.ts`,
`log-queries.ts`, schema/migration if required; new checkpoint service and property/integration tests.

**Interfaces:** Versioned checkpoint with schema/build identity, store generation, cursor coverage,
replay cutoff, state and correction/deduplication evidence. A loader returns either validated state
plus cursor tail, or an explicit rebuild requirement. Date cutoff never substitutes for cursor.

- [x] Expand concrete representation against actual state and dependencies before coding; record
  retention exceptions (old open entities/correction closure), avoid claims of strict flat memory.
- [x] RED properties: full replay equals checkpoint plus tail; same-time ordering, late backdates,
  amendments/revocations/chains, duplicate ids, incompatible/corrupt checkpoint and old open tasks.
- [x] Implement pure serialization/replay validation; integrate durable checkpoint shadow mode with
  full replay comparison and safe fallback. Source log stays intact.
- [x] Generate persistence migration if needed, test cold restart and measured row work with real DO.
- [x] Review, lint and checkpoint before archive integration.

## Task 9B: Copy-only archive, raw aggregates and verified recovery

**Files:** shared `ArchiveStore` port, Cloudflare R2 adapter, history/archive services, DO schema and
migrations, raw usage aggregation, account wipe/export paths and isolated workerd tests.

**Interfaces:** Immutable compressed JSONL objects keyed by owner/store generation/month/content;
versioned manifest with schema, cursor coverage, event/raw counts and SHA-256. Durable operation
states prepared → uploaded → verified → committed; retry identity is stable. Pruning is disabled.

- [x] RED cases: upload/read failure, altered bytes/count, restart at every stage, concurrent append,
  repeated operation, old correction, cross-owner keys and generation change.
- [x] Implement archive encoding/validation and R2 port adapter; publish manifests only after actual
  read-back verifies content. Save new versions for changed months; preserve originals.
- [x] Derive daily raw-usage aggregates without deleting source rows; verify interval boundaries and
  repeated/shrinking uploads. Provide full-history reads/export without duplicates.
- [x] Implement isolated restore verification and account archive cleanup, including superseded
  objects. Test failed cleanup/retry and prohibit stale archive jobs after account reset.
- [x] Review and checkpoint. No production pruning activation. Unified lint is enforced by the commit hook.

## Task 9C: Checkpoint-aware sync and history consumers

**Files:** core API schemas/endpoints/protocol, client event-store/state/sync transport/run,
web/native adapters, API sync/live/history/export/MCP consumers, integration and browser tests.

**Interfaces:** A versioned bootstrap response binds checkpoint and tail to one store generation
and cursor; older history is paginated separately. Store installation is atomic with preserved
same-generation unsynced outbox. History/export retain access to all events.

- [x] Expand contract and compatibility rollout after 9A/9B representations are reviewed.
- [x] RED: fresh device and stale cursor bootstrap, interrupted local installation, offline outbox,
  duplicate pull, store reset, unknown checkpoint version, old-client refusal and quiet steady state.
- [x] Wire server, HTTP/socket client and durable stores; expose old periods through existing history,
  analytics/MCP and export readers with explicit loading/error states where needed.
- [x] Compare restored state/history/export to full log; measure year-history cold reads and document
  exceptions. Verify compatible operation with archive unavailable while source is retained.
- [x] Run appropriate full suites, independent cross-contract review and final checkpoint (lint is enforced by its hook);
  update handoff/PR and trigger CI. Owner amendment on 2026-11-06: stop after CI starts;
  do not wait for its result. Leave merge and production activation undone.

## Execution notes

Task 8 precedes durable Task 9 integration; pure representation investigation can run meanwhile.
Tasks 9A→9B→9C share checkpoint/manifest contracts and must be executed in that order. The revised
roadmap's copy-only rollout takes precedence over the original brief's early deletion step.
