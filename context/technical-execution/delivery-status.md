# Technical roadmap status — 2026-11-05

This is an intermediate checkpoint on `codex/technical-continuation`, based on main rather than
PR #54. It is not completion of the whole roadmap. Current instructions and detailed evidence:
[continuation ledger](continuation-2026-11-05.md).

| Area | Implemented and checked locally | Remaining work / evidence |
| --- | --- | --- |
| Recovery | Six original commits recovered, archive checksums verified, archive branch pushed; main-based transplant reviewed | Finish integration checks and publish subsequent checkpoints |
| Android harness | Optional isolated smoke workflow, guarded dev login and emulator-local network policy; stubbed runner tests | Emulator/device execution excluded by owner; more flow definitions and release gating remain |
| Firebase contract | Multi-package public metadata, strict parser, additive compatibility | Native runtime adoption remains |
| Firebase policy | Opt-in strict API and Worker/DO send guard, shared reason contract, local preflight including policy validation | Exact-version deployment staging and nonproduction rehearsal; no production activation |
| Client recovery | Known/unknown config reasons, both login variants and signed-in status, nonce cancellation, sender pause, guarded bootstrap recovery; preserved outbox/session | Final integration lint, visual matrix and CI; no exploratory QA per owner |
| Storage | Conditional raw-usage writes; real workerd deterministic cold-instance comparison, original/correction retention and cursor fingerprints | Alarm-inclusive workloads, bounded checkpoint/tail and verified archive/export/restore; no source-event/raw-usage pruning |
| Native Firebase | Original rollout design preserved | Initialization, process restart, server changes, package identity and device checks; baked config not removed yet |
| OTA | Original requirements and dependency ordering preserved | Signed publisher protocol, runtime guard, channels, client lifecycle, rollback evidence |
| Infrastructure ports | Original coupling survey preserved | Ports, Cloudflare adapters, dependency guards and conditional alternative host proof |

Fresh complete suites at this checkpoint before final lint corrections: scripts 156, core 905,
client 551, Python 54, app 943 and API 646 tests passed. Focused tests cover subsequent structural
corrections. Final integrated checks and review results are recorded in the continuation ledger;
do not infer release readiness from these counts alone.

No production deploy, traffic migration, secret rotation, pruning, data deletion, exploratory QA
or emulator run was performed. The original archive reports are historical evidence, not claims
about the current tree. The archived blanket no-push restriction is superseded by the owner's
explicit checkpoint/push/PR authorization; do not merge the final pull request.
