# Local storage comparison — 2026-11-05

Identical workerd fixture on isolated main (`e03360f`) and the continuation working tree.
All four input identities and final identities match. Final identity includes raw events,
sequence, usage freshness metadata, materialized state and raw calendar/usage tables.
Both runs passed all 11 harness tests. Measurements are synthetic, not production billing.

| Days | Seed history tasks | Reads before | Reads after | Writes before | Writes after | Cold-init reads after | Inspection reads after |
|---|---|---|---|---|---|---|---|
| 3 | 20 | 453 | 453 | 112 | 100 | 228 | 122 |
| 1 | 0 | 61 | 61 | 44 | 40 | 84 | 28 |
| 1 | 20 | 161 | 161 | 44 | 40 | 84 | 108 |
| 1 | 100 | 561 | 561 | 44 | 40 | 84 | 428 |

The first four counters cover workload operations only. Seed operations, each cold constructor,
and final inspection are measured separately in the JSON artifact. Initial runtime bootstrap and
scheduled alarms/background delivery are excluded. This is not a full daily cost forecast.
The write reduction comes from unchanged raw-usage upserts; read growth with history remains and
requires the planned checkpoint/tail work. No history or raw usage was deleted.

Reproduce on each source tree with the same four harness/helper files and locked dependencies:
`bun test:api storage-cost.int.test.ts --reporter=verbose --silent=false` (Node 24 on PATH).
Machine-readable logger records have `message: "STORAGE_COST"` and a `report` object.
