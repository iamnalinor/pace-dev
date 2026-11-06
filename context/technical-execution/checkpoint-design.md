# Checkpoint representation and safety — Tasks 9A–9C

Approved task scope is the revised T5 roadmap. This concrete design implements its copy-only
rollout. It does not activate pruning or promise flat checkpoint bytes.

## Source and derived data

The source remains the sequenced immutable event log. A checkpoint is derived from a complete
contiguous delivery-cursor prefix, not all events selected by an occurredAt filter. It contains
format version, materializer build identity, store generation, covered cursor, informational
cutoff, full CoreState, every included event id, every correction target (including targets not yet present), and the final effective canonical event key
(occurredAt **and id**). It contains no duplicate raw event log. Full state and dedup ids grow
with account history; fewer cold SQL rows is not bounded retained memory or wire bytes.

Select a conservative whole-day cutoff in the user's zone, initially 30 days back. The greatest complete cursor prefix before that date is eligible.
Late backdates after the prefix remain in the cursor tail regardless of their timestamp.
Open dependencies remain represented in the full state; source-dependent sleep/history readers
still explicitly read the retained source. Their cost is an exception to the optimized cold-state path. Dates and cursor coverage are separate metadata.

## Replay and invalidation

A compatible snapshot may seed a replay only when its format/build/store match, persisted bytes
and counts verify, and every new effective event is canonically after its base's final key.
A correction targeting the base (including a correction of a correction), or a retro event,
requires full source replay. No attempt is made to reverse a reducer from only its result.
A base correction can name a not-yet-arrived event; a new tail event with that id also requires
full replay, so unresolved target evidence must survive in the snapshot.
Conservative rejection of all corrections is acceptable for the first pure primitive; later
safe tail-only correction support requires an explicit test. Same-time lower-id events must
also take the rebuild path. Duplicate ids already in the base do not apply twice.

Invalid or incompatible snapshots are ignored in favor of intact source replay and a replacement.
Shadow mode compares both paths before snapshots become authoritative. SQL storage uses bounded
chunks plus metadata and atomic replacement; a growing snapshot is never put in one size-limited
DO KV value. Byte hash belongs to the persistence/transport boundary, not pure core logic.

## Core contract for 9A

New `packages/core/src/checkpoint/` modules own validated state schema and pure replay:
- `createCheckpoint({ storeId, build, coveredSeq, cutoff, cutoffTimezone, records })` returns a typed Result with
  versioned snapshot. `records` is the complete unique-id sequenced source prefix (`{ seq, event }`); invalid metadata/duplicates
  are refused. State comes only from the existing materializer.
- `parseCheckpoint(unknown)` validates serialized metadata, full state shape and bookkeeping.
- `replayCheckpoint(checkpoint, sequencedTail)` returns state, ids and final canonical key, or an explicit
  `checkpoint/rebuild-required` Result. It never mutates the snapshot or events.
- `checkpointCutoff` chooses the full-day boundary; the actor owns
  query/cursor selection and cannot infer a cursor from this date.

The initial property suite covers full replay equivalence for safe suffixes; all correction forms,
retroactive and same-time lower-id arrivals must request a rebuild whose full-source result is
identical. Pin duplicate ids, empty prefixes/tails, nonempty open entities, schema/build identity,
corrupt persisted state and DST/zone boundaries. Serialization contains no Sets or runtime objects.

## Client rollout constraints

AppState.log/events currently mean full history. Consumers include past-board materialization,
export, undoLast, deterministic recurrence deduplication and empty-account detection. A partial
log cannot keep pretending to satisfy that contract. Before bootstrap is enabled, represent history
coverage explicitly and keep known ids separately. Recent state can derive from base + tail;
History/past-board/export and edits requiring older raw source first hydrate that source through
an explicit loading/error path. Same-generation unsynced outbox survives hydration and snapshot
installation atomically; another store generation still resets it. Unsafe historical edits offline
must be refused clearly rather than materialized from missing history. A checkpoint-only schema
addition without these consumers is not completion of 9C.
