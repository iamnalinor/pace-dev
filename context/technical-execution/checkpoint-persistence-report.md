# Task 9A durable checkpoint API implementation report

Status: source independently reviewed; full unit and API suites passed. Final unified lint runs in the checkpoint commit hook. No own lint, commits, deploy, pruning, epoch bump, QA or Android execution. All API runs use Bun entry points and Node 24 shebang tools through `/tmp/pace-tools/node-v24.22.2-linux-x64/bin`.

## Files

New production:
- `apps/api/src/user-store/checkpoint-repository.ts`: singleton SQL metadata and UTF-8 BLOB chunks of at most 65,536 bytes; strict metadata/core schema, build/store/version/count/sequence/length/SHA-256 validation; explicit absent/invalid/valid cache results; storage failures propagate. Hashing and generation check precede one synchronous publication transaction; source cursor is checked inside that transaction. Failed chunk replacement rolls back to the previous complete snapshot.
- `apps/api/src/user-store/checkpoint-cache.ts`: off/shadow/active policy separated from projection maintenance; exact cursor-bounded tail replay; complete retained-source fallback; fixed sanitized shadow mismatch diagnostic; daily local cutoff advancement; retained correction-target index.

Changed production:
- `user-store/schema.ts`: history_checkpoint + history_checkpoint_chunks private derived tables.
- `user-store/log-queries.ts`: `loadRecords(db, after, through)` reports complete raw-row acceptance; `checkpointPrefix` stops before the first recent arrival so late backdates stay in the sequence tail. `loadLog` optionally bounds its complete source prefix by captured sequence.
- `user-store/state-cache.ts`: optional mode/clock, off default and unnamed-build bypass, checkpoint current/advance integration; full-source `log()` preserved. Private correction-target Set forces full rebuild when a later ordinary ID fulfills an earlier correction, including warm caches reconstructed directly from checkpoint.
- `user-store/analytics.ts`: hides both new tables through the existing private-table policy.
- `shared/config.ts`, `shared/config.test.ts`, `shared/ports/bindings.ts`, `user-store/user-store.ts`: strict optional PACE_HISTORY_CHECKPOINT_MODE validation and actor composition. Archive author coordinated the optional Cloudflare Env declaration; string-setting pass-through already existed.

Generated through `bun db:generate` only:
- `apps/api/drizzle/do/0006_amused_silk_fever.sql`
- associated generated DO snapshot/journal/migrations.js changes. D1 unchanged. STORE_EPOCH remains 2.

Tests:
- `apps/api/tests/checkpoint-repository.int.test.ts`
- `apps/api/tests/checkpoint-cache.int.test.ts`
- `apps/api/tests/checkpoint-cost.int.test.ts`
- `apps/api/tests/checkpoint-fixture.ts`
- `apps/api/tests/helpers.ts`: meterSql recognizes the newly bounded whole-prefix query while excluding range-tail queries.

## TDD and verification evidence

1. Repository first RED: inert publication returned false instead of required true. `/tmp/checkpoint-repository-red.log`. Then bounded SQL implementation/migration GREEN.
2. Cold checkpoint cache RED: state was correct but no durable snapshot existed (expected covered_seq 1, received empty rows). `/tmp/checkpoint-cache-red.log`. Then cache integration GREEN.
3. Rollout/privacy RED: default and opt-in config fields missing; private tables accepted by analytics. `/tmp/checkpoint-mode-red.log`. Then validation/composition/private policy GREEN.
4. Real warm-path bug RED: correction-before-missing-target fixture later materialized the revoked task during `StateCache.fold`, while full source replay correctly omitted it. `/tmp/checkpoint-expanded.log` (40 passed, 1 failed). Private retained correction-target index fixed the cause. Root assigned the equivalent client sweep to archive_plan_sol; that agent owns the combined bug-lesson entry.

Latest focused command:
`bun run --cwd apps/api test -- tests/checkpoint-cache.int.test.ts tests/checkpoint-repository.int.test.ts src/shared/config.test.ts`
Result: 3 files, 51 tests passed. `/tmp/checkpoint-final-focused.log`.

Lifecycle/regression command:
`bun run --cwd apps/api test -- tests/checkpoint-cache.int.test.ts tests/checkpoint-cost.int.test.ts tests/projections.int.test.ts tests/night-cost.int.test.ts tests/state-order.int.test.ts`
Result before the final narrow test additions: 5 files, 58 tests passed. `/tmp/checkpoint-lifecycle-cost.log`.

Measurement command:
`bun run --cwd apps/api test -- tests/checkpoint-cost.int.test.ts --reporter=verbose`
Result: 1 file, 3 tests passed. `/tmp/checkpoint-measurements.log`.

Covered behavior: large Unicode snapshot chunks, missing/reordered/altered chunks, metadata damage, unknown format/state schema, wrong build/store, atomic chunk-write failure, stale source cursor and generation, old open task, corrections/amendments/revocations/correction-of-correction/future targets, retro arrivals and same-time lower IDs, cold and warm active/off equivalence, unknown raw-prefix rejection, conservative sequence-prefix selection, no identical writes, daily advancement, mismatching shadow fallback/repair and sanitized diagnostic, repeated migrations, private schema visibility, wipe, and actor mode composition.

The initial local-runtime run hit `listen EPERM 127.0.0.1` before tests; ordinary local-port escalation enabled workerd runs. Existing dependency sourcemap warnings persist. No new test failures remain in these runs. Root still must run unified lint and the full API suite.

## Measurements and limits

Synthetic fixed fixture: 20 events/day, 31-day months, closed tasks and activities plus one oldest task still open; 600-event recent cursor tail. Identical fixture/state/IDs/seq in off and active modes. No SQL writes or projection writes on measured valid cold reads.

| Months | Source events | Off SQL rows read | Active SQL rows read including snapshot chunks | Snapshot bytes | Prefix events | Chunks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 622 | 623 | 603 | 10,956 | 22 | 1 |
| 6 | 3,722 | 3,723 | 620 | 1,174,704 | 3,122 | 18 |
| 12 | 7,442 | 7,443 | 642 | 2,579,748 | 6,842 | 40 |

CPU/heap evidence is a separate Bun 1.4.2 Linux x64 process benchmark, not workerd CPU. Nine-run medians; complete source path includes source payload JSON parsing, parseEvent and rebuild; checkpoint path includes snapshot JSON parsing, strict validation, recent source parsing and replay. SQL and byte hashing excluded. Benchmark source `/tmp/checkpoint-benchmark.ts`; raw results `/tmp/checkpoint-benchmark.jsonl`.

| Months | Source parse + full replay ms | Snapshot parse/validate + tail parse/replay ms | JSON parse ms | Core snapshot validation ms | Approx retained parsed snapshot JSC heap bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.28 | 6.38 | 0.062 | 0.684 | 14,281 |
| 6 | 16.04 | 29.41 | 2.827 | 7.875 | 1,674,228 |
| 12 | 24.85 | 43.91 | 5.879 | 17.942 | 3,655,850 |

Heap estimate retains ten independently parsed/validated snapshots across Bun.gc and divides the live JSC heap delta by ten. Baseline already retains the fixture and original snapshot. Process/GC noise remains; RSS deltas were unreliable and are not a useful retained-state estimate.

This implementation reduces cold SQL row work. It does not establish a CPU speedup; strict snapshot parsing/validation was slower in this synthetic CPU benchmark. Keep off by default and opt into shadow before active. No flat-memory or bounded-byte claim: state plus all IDs grow with account history.

A validated older base remains persisted when a recent correction, retro event, or late fulfillment of a base correction requires complete source replay; replacing the same eligible prefix cannot resolve that unsafe tail. Once the conservative day/cursor prefix advances, a newer snapshot can include it. Repository-invalid snapshots and shadow mismatches are replaced from intact source when an eligible complete prefix exists.

Full-source readers remain explicit exceptions: StateCache.log for automatic sleep, simulation/history consumers. Source events, projections and existing public RPC/sync shape remain authoritative/unchanged. No checkpoint JSON or opaque CoreState crosses the Durable Object RPC boundary.

Reproducible process benchmark: [script](checkpoint-benchmark-reproduction.md) and [raw results](checkpoint-benchmark-results.jsonl).

Integrated verification: API78 files/766 tests; core938/client577/scripts493/Python54. Adapter46 tests are included in the API run after the common provider-error wrapper extraction.
