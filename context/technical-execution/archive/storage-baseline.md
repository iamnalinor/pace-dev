> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Synthetic history baseline

Measured locally with Bun 1.4.2 against PR #54. This is a CPU and serialized-size probe of the real `user-store/state.ts::rebuild`, not Cloudflare quota usage or a measured database cold start. No production data or credentials were used.

The existing deterministic `yearOfUse(12000, 7)` fixture was filtered at 30/180/365 days after 2025-11-01. Each prefix preserves corrections and dependencies. One initial rebuild and five warm rebuilds were timed. The complete event array is serialized, not the HTTP sync/export envelopes or raw usage tables.

| History days | Events supplied to rebuild | First rebuild ms | Warm median ms | Event JSON bytes | State JSON bytes | ID-list JSON bytes |
|---|---:|---:|---:|---:|---:|---:|
| 30 | 962 | 29.98 | 4.60 | 271721 | 204498 | 27899 |
| 180 | 5724 | 34.68 | 19.55 | 1626471 | 1198160 | 165997 |
| 365 | 11556 | 38.72 | 42.25 | 3278372 | 2405191 | 335125 |

The input log, materialized state and deduplication ID list all grow with history. A checkpoint alone does not bound retained state or IDs. Warm timings are advisory and share a machine with validation jobs. Heap deltas were unstable (including negative values after GC); they are not reliable retained-memory measurements and are deliberately not reported as savings.

Production rows read/written, storage growth, real sync/export wire size, and a reliable isolated-process memory measurement remain required before choosing an archive/pruning policy. No quota-exhaustion date can be inferred from this probe. No data retention policy was activated. The reproduction script and raw result accompany the handoff archive.

A second run used one fresh Bun process per history prefix (`bun storage-baseline.ts 30`, then `180`, then `365`). First rebuilds were 23.09/64.75/199.12 ms and warm medians 3.54/29.84/68.30 ms under concurrent validation load. Byte counts were identical. Heap deltas were still negative for larger histories, so this runtime measurement cannot establish retained heap usage. The variation prevents treating the first table as a latency budget or capacity forecast.
