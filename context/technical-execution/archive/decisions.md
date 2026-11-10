> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Execution decisions and tradeoffs

| Decision | Reason | Cost / remaining risk |
| --- | --- | --- |
| Keep the fresh dedicated checkout and feature branch based on PR #54 | There is no shared user checkout to isolate again | Integration with later redesign work may need conflict resolution; exact base is recorded |
| Continue the authorized plan without asking again between tasks | The owner explicitly requested implementation and plugin-based working methods | A mistaken local design choice can require rework; no push, deploy or production mutation was authorized or performed |
| Stage Firebase migration: additive metadata and local validation first | Existing deploy publishes the Worker before setting Firebase secrets, and some instances have Worker-only secrets | Strict loud failure is not the current default; native migration and guarded activation remain work |
| Preserve legacy service-account-only FCM while the pure pair validator rejects partial pairs | Existing baked APKs must keep working during migration | The API adapter and standalone strict validator intentionally answer different questions |
| Return HTTP 200 with null Firebase metadata and a fixed sanitized warning for invalid new metadata | Current clients interpret an arbitrary server 500 as unreachable; error UI must migrate with strict policy | A client does not yet display a configuration reason; operators must consult the diagnostic/preflight |
| Android workflow is manual/reusable and not a release gate yet | No successful real emulator run is available from this environment | Maintainer must run the actual workflow and negative control before enabling gating |
| Archive copy/verification and pruning are separate future steps | Corrections, sync outbox, export and restore must remain correct | Storage quotas remain unchanged; no claim of production savings |
| Review immutable Git trees while normal lint hooks run, then compare final tree/delta | Required lint is slow, but review can proceed without modifying source | Every hook-driven delta must be inspected before completion; final accepted identities are in reports |
| Keep the branch and hand off bundle/patches rather than publishing | Owner requested an archive and provided no GitHub write access | A maintainer applies and integrates the changes, then runs CI/device/release checks |

The owner explicitly excluded full exploratory QA. Focused checks, independent source reviews and real local HTTP smoke were performed. Interrupted broad unit runs are not counted as passes. SDK/prebuild evidence is not an APK or emulator pass.
