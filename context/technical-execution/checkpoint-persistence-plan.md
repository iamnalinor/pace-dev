> Historical plan; see [HANDOFF.md](HANDOFF.md) for status. Unchecked boxes and listed files are not a claim about the current tree.

# Durable checkpoint implementation packet (Task 9A integration)

Prerequisites: Task8 portable actor/storage contracts reviewed; pure core checkpoint review closed.
No pruning. The source log, public API shape and projection tables stay authoritative as before.

## Interfaces and files

- New `user-store/checkpoint-repository.ts`: bounded SQL chunks and metadata; `read(expected)`
  returns a validated Checkpoint or explicit absent/invalid result. Storage failures propagate.
  Validate expected build/store, format, chunk sequence/count/bytes, SHA-256 and core schema.
- New `user-store/checkpoint-cache.ts`: checkpoint selection/replay/shadow comparison, separate
  from projection maintenance. Uses the existing core primitive and retained sequenced source.
- `schema.ts`: private metadata/chunk tables with deterministic singleton ownership; generate
  migration through `bun db:generate`. All chunks and metadata replace in `transactionSync`.
  Add internal tables to analytics private-table policy rather than expose persistence internals.
  Store UTF-8 bytes in BLOB chunks of at most 64 KiB; reassemble bytes before decoding/hash
  verification. Do not split JavaScript strings across surrogate pairs into SQL text values.
- `log-queries.ts`: `loadRecords(after, through?)` by seq, complete raw-prefix checks and a
  conservative prefix cursor before the selected local-day cutoff. Never query tail only by date.
- `StateCache`: optional checkpoint mode `off | shadow | active`; existing no-option behavior is
  off. Shadow compares checkpoint-derived state/ids/key against full replay and never returns a
  mismatching candidate. Active uses validated snapshot+tail; invalidation reloads complete source.
  `log()` remains explicitly a full-source reader for sleep/simulation/history consumers.
- Actor composition passes an optional validated `PACE_HISTORY_CHECKPOINT_MODE`; default off,
  documented opt-in shadow before active. No deployment/configuration activation in this task.

## Tests and sequence

1. RED repository roundtrip beyond a single KV-value-sized snapshot; missing/reordered/altered
   chunks, altered metadata, wrong store/build, unknown version all refuse the cached value.
2. Implement parameterized SQLite storage and hashing. A failed chunk write leaves the previous
   complete snapshot visible; no external await inside the SQL publication transaction.
3. RED cold StateCache equivalence with old open task and year history. Safe tail uses seq range;
   old correction, correction of correction, missing-target correction fulfilled later, retro and
   same-time lower-id arrivals rebuild from source with the exact full-replay result.
4. Integrate modes and daily advancement. Capture a consistent prefix/seq before hashing; verify
   ownership/current cursor before publication. Do not rewrite identical checkpoint each read.
   A prefix may contain schema-unknown raw rows: refuse building a misleading complete checkpoint
   instead of silently dropping them; ordinary legacy source replay retains existing tolerance.
5. Shadow compare state, IDs and key (not JSON property insertion order); mismatch records a fixed
   diagnostic and returns full source state. Failure cannot erase or mutate the source log.
6. Generate migration, exercise repeated migrations and fresh/restarted actor with existing data;
   do not bump STORE_EPOCH. Wipe clears snapshots with the rest of the actor's data.
7. Measure representative 1/6/12-month cold reads against off mode on the same fixture. Report
   snapshot bytes/parse cost plus remaining source-reader exceptions; no flat-memory claim.
8. Independent database/type review, focused tests, unified lint and checkpoint commit. Task9A
   completion requires this packet as well as the previously reviewed pure primitive.

## RPC boundary note

CoreState contains opaque task overrides (`unknown`), while the existing RPC surface deliberately
uses RpcState. Keep checkpoint persistence internal for9A. When9C adds an actor bootstrap call,
reuse the validated RpcState conversion or transfer validated checkpoint JSON as a string across
the actor boundary; never force CoreState through Durable Object Serializable with a type cast.
