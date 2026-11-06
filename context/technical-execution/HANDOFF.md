## Tasks 8 and 9 — CI handoff, 2026-11-06

The owner requested wrap-up and explicitly changed the stopping condition: push
the finished packet, confirm CI starts, then stop without waiting for its results.
Do not merge. Task8 and9A were completed in earlier checkpoints;9B and9C are
implemented and independently reviewed. This checkpoint closes their local work;
final CI remains pending and must be inspected at the next session.
Foundation checkpoint: `d40e454`; the integration commit contains this handoff.

Delivered integration includes immutable verified archive publication, raw usage
revisions/aggregates, recoverable account cleanup and isolated restore; guarded
checkpoint bootstrap, HTTP/live sync, IDB/SQLite persistence and full History/export.
The restore rehearsal matches source, state, aggregates and all five client export
sheets. The opt-in browser test passed with real partial checkpoint coverage,
outbox preservation, two-page history, complete XLSX export and quiet network.

Final verification status:

- Full unit: scripts493, core941, client630, Python54 passed.
- Full API: 833 tests in87 files passed.
- Full app: 1112 tests in143 suites passed.
- Final extraction regressions: API27 and persistent-adapter60 passed.
- Cold-alarm readiness and absent-archive short-circuit: night-cost 14 and sleep 11
  passed serially, without changing thresholds.
- Unified lint is enforced by this checkpoint's mandatory commit hook, including
  types, unused exports, duplication, architecture, workflows and migration drift.
  Existing design warnings remain74; no threshold or rule was weakened.
- Full suites passed serially: simultaneous API and unit runs previously
  distorted timing assertions. No performance threshold was weakened.
- Session fixture startup barriers fixed the diagnosed CI logout race; fresh browser
  confirmation is delegated to CI on the new head; no green result is claimed.

PR run42199912608 on d40e454 passed combined checks and197/198 browser tests.
The new head is not claimed green until its own CI completes. See [integration review](checkpoint-integration-review.md),
[restore evidence](archive-restore-report.md), and [current plan](tasks-8-9-plan.md).

Next session: inspect the CI run for this commit first; address only any failing
checks before discussing new scope. The opt-in checkpoint browser test runs in its
own named/active test server step. No additional local Android or QA round is needed
to recover this handoff.

Defaults and follow-up: checkpoint activation remains off; no archive binding or
production cron was enabled, no source was pruned, and no deployment or merge was
performed. CPU improvement is not proven. Minor deferred items are Telegram cleanup
reply localization and the preexisting Week grid wall-clock positioning issue.

Task 8 is complete in pushed checkpoint `715b0aa`; independent review and unified lint passed.
Cloudflare SQL, actors, alarms, sockets, KV and OAuth now sit behind portable contracts. The
full API suite passed (73 files / 679 tests); focused adapter contracts passed 18/18. A deliberate
RPC queue bypass fails the regression. No schema/epoch or public sync contract change in Task 8.

Task 9A durable checkpoint is implemented and independently reviewed: bounded atomic SQL snapshots,
off/shadow/active modes, retained-source fallback and measured cold reads. Default is off. The
independent 9B foundation includes immutable raw archive codec/R2 port and daily usage splitting;
the subsequent 9B/9C integration is described above.

Foundation verification: full API 78 files / 766 tests; full unit core 938, client 577, scripts 493,
Python 54. Focused app tests passed 50. Final unified gate runs in the checkpoint commit hook.
Fixed warm correction-before-target replay on both client/server and midnight-DST daily/weekly
boundaries. The separate preexisting Week grid wall-clock positioning issue remains deferred.

Measured 12-month cold SQL rows: 7443 → 642 including snapshot chunks. Synthetic Bun CPU was
slower for snapshot validation/replay (43.91ms vs 24.85ms source parse/replay); no CPU or flat-memory
claim. See [persistence report](checkpoint-persistence-report.md), [review](foundation-review.md),
[current plan](tasks-8-9-plan.md), [archive packet](archive-plan.md) and
[sync packet](checkpoint-sync-plan.md). Source events stay intact. Prior wrap-up below is historical.

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
