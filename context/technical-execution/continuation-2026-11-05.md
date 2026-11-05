# Technical roadmap continuation — 2026-11-05

## Current authority

The owner requests completion of the technical roadmap, independent review, checkpoint commits
and pushes, then a pull request with green checks. Do not merge or deploy. Do not run exploratory
QA or an Android emulator in this environment. Run lint at meaningful checkpoints, inspect its
fixes, and retain the repository's checks. These instructions supersede archived no-push and QA
instructions. Never prune source events or raw usage as part of cost optimization.

## Recovery evidence

- Source: Downloads/pace-technical-checkpoint.zip, SHA-256
  `58f2562225d713d5bc989435db367dda20f7eeef51fdf957fdaf87a8a40169ad`.
- All five downloaded checkpoint copies are identical; the earlier implementation ZIP was also
  extracted. All embedded SHA256SUMS entries pass; the standalone Git bundle verifies.
- Recovered HEAD: `ce8dff57201c6e84a86d76fe9156f2f631eec6ce`, based on redesign snapshot
  `a67cc504dac7f4569a8cbc5da91c8ed4350bc5a3`.
- Durable checkpoint pushed as `codex/recovered-technical-roadmap`.
- Integration branch: `codex/technical-continuation`, based on `origin/main` at `e03360f`.
  Only the six feature commits' diff is transplanted, excluding the redesign itself.
- Remote recheck before checkpoint: main remains `e03360f`; the separate redesign branch has
  advanced to `4c24add448d1a9e3915ad5dc0fe724314c7cecef`. Its changes are not included here.
- Archived later optimization percentages and review claims do not establish implemented code.
  The recovery note explicitly says later Firebase policy and storage optimizations were lost.

## Execution order

- [x] Recover original plan, ledger, reports, patches and complete Git history.
- [x] Independently review recovered Tasks 1–3 using the Superpowers reviewer template.
  No confirmed findings. Client discovery and push fallback traced; runtime verification pending.
- [ ] Verify main-based integration, commit and push it as the next checkpoint.
- [x] Measure real local workerd read/write costs with identical deterministic workloads.
- [ ] Implement non-destructive optimizations supported by those measurements, with regression
  tests for corrections, cold instances and unchanged client behavior. Record both reads and writes.
- [ ] Complete Task 3b compatible Firebase error handling and guarded rollout infrastructure;
  never activate production policy or infer deployed bindings from local inputs.
- [ ] Complete native Firebase implementation and automated non-device tests; keep device evidence
  explicitly pending and preserve safe rollout gates while emulator execution is prohibited.
- [ ] Complete remaining Android flow definitions without executing an emulator.
- [ ] Complete OTA implementation and automated protocol/signature/rollback checks; distinguish
  actual device evidence and unavailable signing material from tested local behavior.
- [ ] Complete infrastructure ports and guards, followed by non-destructive checkpoint/archive
  implementation with correction/export/restore equivalence. No raw data pruning.
- [ ] Assess the conditional alternative host spike against measured evidence.
- [ ] Review final integration, open PR, resolve CI failures and leave it unmerged.

## Validation ledger

- Fresh script checks: 26 pass, zero failures (Firebase preflight and stubbed Android runner;
  no emulator or physical Android device used).
- Core targeted Vitest stalled; API targeted Vitest failed before executing tests with esbuild
  `The service was stopped`. Diagnosis: `node` absent from PATH; Bun's fallback is not the
  repository-supported execution mode. Core run interrupted, neither run counted as passing.
- Installing official Node 24 into /tmp/pace-tools with vendor SHA-256 verification; rerun pending.
- Historical archive reports remain historical; they are not this branch's validation evidence.

## Active implementation checkpoint

- Official Node v24.22.2 downloaded and vendor SHA-256 verified in /tmp/pace-tools.
  Commands prepend `/tmp/pace-tools/node-v24.22.2-linux-x64/bin` to PATH.
- Fresh recovered-scope verification: core 31/31, app 30/30, API workerd 55/55 passing.
  workerd needs local-port permission; the restricted run failed EPERM before tests.
- Initial lint failed in its packages child without a report. Retrying with CI's Node heap
  setting (4096 MiB) passed ESLint with the existing 74-warning design ratchet unchanged;
  remaining lint stages pending. Changes under active implementation require final revalidation.
- Non-destructive usage optimization: repeated/shorter raw uploads wrote 8 SQL rows before,
  zero after conditional conflict updates. Extension and device rename preserved. Focused
  workerd checks 4/4 pass; full API run pending. Independent new-change review still required.
- Task 3b server/core and client implementation are in progress in parallel, with matching
  `server/misconfigured` HTTP 500 + whitelisted reason. No production policy activation.
- Client library targeted 51 tests pass; full client suite pending. App store regression caught
  missing separate configuration status, then passed after implementation. Existing full-state
  expectations updated for the new field; revalidation pending.
- App error presentation, retry behavior and design verification remain unfinished. Do not
  treat this working tree as release-ready or merge it. No QA or emulator has been launched.
- Full API suite after raw-usage optimization: 65 files / 616 tests passed (117.19 s).
- Full client suite: 46 files / 551 tests passed, coverage thresholds passed.
- App origin/configuration state: 3 files / 13 tests passed.
- Policy-focused server tests: 69 passed before a typecheck correction; guard retest pending.
  Unified lint caught TS7030 in new middleware; author corrected it, final lint remains pending.
- Independent storage review approved the two predicates and tests, including client acknowledgment
  semantics; no findings. Independent server-policy review found no functional defects and requested
  actual DO-send evidence. Added proof: three real-UserStore cases pass, strict invalid bindings make
  zero OAuth/FCM requests, additive legacy sends once. No production credentials used.
- Root reviewed the client decoder and discovery diff: reason decoded only on correct status/code;
  unknown reason preserved as generic configuration problem, other errors unchanged.
- App failure-transition sweep found stale mutually exclusive errors; both directions have observed
  RED→GREEN tests (5/5 configuration-state cases). No version gate from configuration failure.
- Local uncommitted checkpoint archive: `.cache/checkpoints/technical-continuation-wip.tar.gz`.
  This is an intermediate recovery copy, not a reviewed release artifact or remote checkpoint.
- App independent review required active-response detection, nonce cancellation, and sender pause;
  all three fixed with observed RED→GREEN. Additional interrupted-startup recovery fixed and reviewed.
  89 affected tests pass; normal exit, transient aggregate open-handle warning but no handles from
  isolated detectOpenHandles runs. Final full app rerun pending.
- Full unit command passed: scripts 156, core 905, client 551, Python54; coverage gates pass.
- Full app first integration: 938 pass, one host-timezone-dependent fixture failure. Fixture now
  chooses an account zone distinct from host; focused25 tests pass under Moscow and UTC.
- Comparative harness review found missing raw-history/cursor identity; fixed with retained event
  rows, sequence, usage-known KV and tests detecting missing-original/cursor differences. Cleanup
  waits for started initializers even on failure. Baseline main run11 tests passes; candidate pending.
- Main baseline isolated in `/tmp/pace-cost-baseline` at e03360f. Uses copied/hardlinked installed
  dependencies with relative workspace symlinks preserved; frozen lockfile same. No dependency
  mutation during comparison. A stalled network installation was cancelled before copying.
- Comparative baseline and candidate: 11 tests each pass, all four input/final identities match.
  One-day workloads reduce writes 44→40; three-day replay reduces writes 112→100. Reads are
  unchanged and grow with retained history. Reports: `storage-comparison-2026-11-05.md` and JSON.
- Final full app integration: 125 suites / 943 tests pass with normal exit; transient Jest
  open-handle warning remains, isolated checks found no persistent handle. Full API: 68 files /
  646 tests pass. These precede checkpoint lint-driven structural refactors and require targeted
  revalidation afterward.
- Independent GPT-6.1 Sol review found CLI/runtime policy drift: unknown policy was accepted by
  preflight but rejected by runtime. Shared policy schema now rejects it in both; 25 CLI cases
  pass and scoped re-review found no remaining blocker. Runtime guard retest: 30 cases pass.
- Checkpoint commit hook is still failing on app complexity/structure rules. Fixing the cause
  without weakening rules; checkpoint has not yet been committed or pushed. Native/runtime and
  deployment staging plans are being expanded by GPT-6.1 Sol agents, with device and nonproduction
  deployment evidence kept as explicit release gates.
