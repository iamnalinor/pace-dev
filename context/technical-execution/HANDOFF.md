## Tasks 8 and 9 — resumed 2026-11-06

Task 8 implementation and independent review are complete; final unified lint is being closed.
Cloudflare SQL, actors, alarms, sockets, KV and OAuth now sit behind portable contracts. The
full API suite passed (73 files / 679 tests); focused adapter contracts passed 18/18. A deliberate
RPC queue bypass fails the regression. No schema/epoch or public sync contract change in Task 8.

Task 9A pure checkpoint primitive and canonical equal-time ordering fix are implemented and
independently reviewed. Full unit checks passed: core 920, client 565, scripts 493 and Python 54.
Durable API checkpoint integration is next, followed by copy-only archive/restore (9B) and
checkpoint-aware client sync/history (9C). These are not yet complete. Source events stay intact.
See [current plan](tasks-8-9-plan.md), [checkpoint design](checkpoint-design.md) and
[persistence packet](checkpoint-persistence-plan.md). Prior wrap-up evidence below is historical.

# Technical continuation handoff — 2026-11-06

> New instruction: Tasks 8 and 9 resumed on 2026-11-06. Active work is tracked in
> [tasks-8-9-plan.md](tasks-8-9-plan.md). The wrap-up record below describes the green
> `f0bf58c` checkpoint; it is not a claim that the newly resumed tasks are complete.

The owner requested a bounded wrap-up: finish the in-progress packet, record remaining work,
and get [PR #55](https://github.com/iamnalinor/pace-dev/pull/55) green without merging.
The full roadmap is paused, not complete. Branch: `codex/technical-continuation`, based on
main and independent of redesign PR #54. This handoff supersedes earlier “next task” statements.

## Delivered

- Recovered and reviewed the six original commits; preserved the archive and pushed checkpoints.
- Added the isolated Android smoke harness. Actions run 42112200861 passed on `9432b6f`.
- Implemented Firebase contract/preflight, opt-in native runtime configuration, server handoff,
  session retirement and origin/project-scoped push ownership. Baked compatibility remains.
- Reduced redundant raw-usage writes and recorded storage measurements; added the first
  RequestPlace port and dependency guards.
- Added OTA signing, immutable staging, channel promotion and isolated R2 delivery; integrated
  the guarded native lifecycle, build trust and status UI in `7964023`.
- Added complete-source fingerprint validation, runtime record comparison (`6f20838`), and a
  canonical Expo collector/CLI. Records describe source/build metadata, not compiled APK provenance.
- Fixed wrap-up CI causes: finite animation waits no longer hang on intentional loading spinners;
  all three Android build entry points use 1 GiB metaspace and fail fast on memory exhaustion.

OTA remains disabled by default. Firebase runtime adoption is opt-in. No production deployment,
release, publication, resource provisioning or merge was performed.

## Evidence and verification

Native OTA packet: 140 app suites / 1055 tests and unified lint passed; independent review closed
critical/important findings. Runtime guards: 91 OTA/loader tests and 32 app/config tests passed.
Collector/CLI packet: 63 focused tests and a real read-only canonical CLI smoke passed; disabled
records correctly refuse verification for publication. Android runner guards: 7 tests passed.
The real-browser finite/infinite animation regression failed before the fix and passed afterward.
Final unified lint (format, ESLint, types, dependencies, duplication, architecture, workflows and
migrations) passed. Frozen dependency installation passed. Independent final review has no blockers.

At `7964023`, combined CI checks passed, but eight web matrix cases hung on the gallery spinner
and Android ran out of its former 512 MiB metaspace. The final packet fixes both causes; the
latest PR checks are the authority for final-head CI, including Android. Earlier green runs do
not establish the final head. Final results are also recorded in the PR description.

No exploratory QA or local Android/emulator run is authorized. Android tests run only in PR
Actions. Separate design review/polish is deferred by the owner. Use Bun entry points; installed
Node-shebang tools still require Node. Run the unified linter in batches.

## Remaining roadmap (deliberately not started during wrap-up)

- Bind runtime records to authenticated compiled APK `assets/fingerprint` evidence; finish
  release/publication CLI and preview/promote workflows, signing and native rollback evidence.
- Rehearse exact-version deployment in nonproduction. Cloudflare Version URLs do not support
  Durable Object Workers; the adapter refuses unsupported staging instead of claiming isolation.
- Validate device-specific FCM delivery and expand Android flows/release gating.
- Complete remaining infrastructure ports and storage checkpoint/tail, archive/export/restore,
  broader sync workloads and conditional alternative-host evaluation. Do not prune source events.

See [continuation ledger](continuation-2026-11-05.md), [implementation plan](implementation-plan.md),
[OTA integration](ota-app-integration-report.md) and [fingerprint matrix](ota-fingerprint-matrix-report.md).

## Source record CLI

With an explicit release environment, run
`PACE_RELEASE_TAG=v0.11.0 bun scripts/ota/native-runtime-cli.ts record --output /tmp/runtime.json`.
Use `verify --record /tmp/runtime.json` under the candidate's same release environment.
Output creation is exclusive; errors are sanitized. Do not interpret a compatible source record
as proof of the installed APK, successful native execution, or authorization to publish.
