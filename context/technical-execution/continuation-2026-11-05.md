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
- [x] Verify main-based integration, commit and push it as the next checkpoint.
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
- Checkpoint `488c369a7942190daf2d87a703f64c1b2a051967` committed and pushed to
  `origin/codex/technical-continuation`; local and remote SHAs match. Full `bun lint` passes
  (48.19 s): ESLint with unchanged 74 design warnings, all typechecks, unused-code check,
  zero duplication, architecture, workflows and migration consistency.
- Lint refactors independently reviewed on GPT-6.1 Sol. Follow-up review found an in-flight
  Telegram login could resume after disable/recovery; generation invalidation now guards both
  device lookup and nonce creation, including stale rejection/reset. Five new RED→GREEN tests;
  scoped re-review approved. Seven affected suites / 64 tests exit 0. Sync-frame isolation:
  14 tests exit 0 without detectOpenHandles findings. Shared login extraction: 21 tests exit 0.
- Native Firebase and inactive deployment staging implementation dispatched to GPT-6.1 Sol after
  this clean checkpoint. Default baked APK behavior and production deployment remain unchanged.
- Native slice 1 implements the opt-in build, origin-bound persistence/reconciliation and process
  restart bridge. Three Jest suites / 15 tests pass; actual pure Kotlin/JVM tests pass 18/18.
  Review found an old-origin response could erase a staged server choice: reproduced RED and
  fixed by revoking origin authority only after durable staging. Re-review approved. Android
  compilation/device lifecycle and dependent app integration remain unverified/unfinished.
- Readiness endpoint and request-provenance port reviewed independently, no actionable findings.
  Real-workerd focused run: 81 cases; expanded readiness: 16 cases. Full application: 953 tests
  pass and exit normally. Parallel full verification caused timing-sensitive failures; unchanged
  serial reruns pass scripts 173, core 905, client 551, Python 54 and API 664. No limits weakened.
- A pinned, checksum-verified pure-JVM test command and CI step were added; this does not install
  Android or run an emulator. Final unified lint and the second checkpoint remain pending.

### Runtime integration checkpoint in progress

- Checkpoint `a45bb0e` was pushed after full lint, serial unit/API/app tests and 18 JVM controller tests passed; no emulator or exploratory QA ran.
- Runtime Firebase server handoff and origin/project-scoped push integration are implemented in the working tree. Push/Settings targeted tests passed 75/75; independent read-only review is underway. This is not yet a reviewed/pushed checkpoint or device proof.
- Deployment pure preflight now preserves the original sanitized baseline verdict for rollback. Explicit configure/disable may replace an invalid additive legacy pair after health checks; keep and strict-invalid baselines fail closed. 56 preflight tests passed. Injected staging/promotion orchestration is in progress, with no remote mutations.
- Adding the root zod catalog dependency caused unrelated lockfile resolution churn. Retained only the intended workspace dependency entry against the existing pinned graph; `bun install --frozen-lockfile --ignore-scripts` passed.

### Review-driven integration fixes

- Push/Settings expanded to 81 passing tests: unavailable Google is omitted while the preference is retained; per-invocation generation and ordered subscription/persistence writes cover delayed same-origin choices as well as origin changes. Native-compatible promise queues replace the ES2024 API prohibited for Hermes.
- The persisted-switch UI gate passed scoped review tests, but the independent reviewer traced a pending old bot-login answer into the retained runtime. The UI gate alone is insufficient: cancellation and sender authority are being fixed with a deferred-auth regression. This blocks the app checkpoint until resolved.
- The pure deployment runner passed independent review and 101 tests. CLI adapters and bootstrap are still incomplete. Temporary secret-file tests add four cases; no remote write occurred.
- A concrete OTA implementation plan now records protocol, signing, fingerprint, publisher, app and release gates. No OTA dependency, service or activation is claimed.

### Owner authorization: Android execution in PR CI

The owner explicitly authorized using the Android emulator in GitHub Actions to run Android tests as part of this PR. Local emulator/Android startup remains prohibited; exploratory QA remains excluded. Use the existing Android smoke workflow and later expanded flows on the PR's exact commit, inspect artifacts and fix failures before claiming native CI success. This authorization covers CI test execution, not production deployment, release publication or merging the PR. Device-specific FCM delivery proof remains distinct from emulator CI.

### PR Android CI entry point

The existing Android E2E workflow now also accepts a PR label event for `android-e2e`, checking out that PR's exact head SHA. Ordinary pushes do not automatically consume emulator minutes; reapply the label for a newer commit. Manual/reusable entry points remain available. The workflow and documentation change are under independent review and await unified lint and actual GitHub execution. No local emulator has been run.

Pinned Wrangler structured upload output was inspected in the installed 4.156.0 source. A parser now requires one version-upload v1 record for the expected Worker with a version UUID and exact HTTPS preview origin; it rejects missing, duplicate and partial records and does not substitute a mutable preview alias. Ten targeted tests passed. This output alone does not prove version inactivity or trusted preview ownership; control-plane and probe verification remain mandatory.

### Current verification and review evidence

- GitHub open-PR lookup still shows only draft redesign PR #54 (`claude/pace-design-overhaul-b` -> main). No technical PR has been opened yet and redesign commits remain excluded.
- Unified lint round 3 stopped at 16 new client errors (function limits, parameter mutation, test typing, explicit boundary type and the Hermes-prohibited Promise.withResolvers API). These are being fixed at source without disabling rules; app/root checks have not yet been reached by this run.
- The HTTP deployment probe adapter passed 39 focused tests: trusted exact origins, schema/identity checks, non-200/redirect rejection and bounded body reading. It has no authenticated control-plane resolver wired yet and performs no remote deployment.
- Static independent rereview approved the corrected Android label workflow: concurrency is on the gated job, unrelated label events do not cancel it, reusable calls preserve caller checkout and direct label events use the PR head. Actual Actions execution remains pending.

### Owner scope update: design pass deferred

The owner asked to use the existing design system without spending time on a separate design review for now. Continue using the kit, tokens and localized strings; do not run a separate Impeccable/Apple Design review or polish round as a completion gate for this task. Functional checks and code review remain required. The pinned design skill sources were retrieved for reference only; no visual review was completed or claimed. The Impeccable context launcher failed because its engine/cache was unavailable, and its documented direct-context fallback was used. No hooks were installed.

### Session ownership verification

Independent rereview closed the remaining asynchronous adoption/logout cleanup findings. The implementation author completed 563 client tests with coverage thresholds met and 44 targeted app tests. Root then extracted bot polling into auth-bot.ts and owned-token cleanup into a small helper to address the final two client lint function-limit errors; 52 targeted auth/session tests passed after those extractions. Unified lint round 6 is running. No checkpoint is claimed green until the remaining workspaces and subsequent checks finish.

### Follow-up integration checks

Round 6 passed the client workspace and identified three app errors. Extracted the runtime server check, retained a bound AppState spy in the handoff regression, and made notification-choice completion return an explicit `isLatest` outcome. Targeted bootstrap/handoff tests passed 5/5; notifications/Settings passed 84/84. Unified lint round 7 is running; no green integrated result is claimed yet.

The authenticated read-only Cloudflare adapter and probe compatibility tests passed 74/74; independent review is in progress. Its explicit unsupported result preserves the Durable Object Version URL limitation. No live account reads, deployment or traffic changes were performed. The full staged deployment task remains open.

### Pareto priority and draft PR

The owner requested reducing effort and quota consumption. Prioritize finishing the current implemented changes and required checks; do not start additional large features or research while the proposed roadmap deferral is awaiting an answer. This is a priority change, not a claim that the remaining roadmap is complete.

Draft PR #55 (`codex/technical-continuation` -> `main`) was opened at the already pushed checkpoint: https://github.com/iamnalinor/pace-dev/pull/55 . It excludes redesign PR #54. The current runtime and deployment-tooling working tree is not yet pushed. No merge occurred.

Root unified lint round 8 and the full app test run were interrupted before a terminal result; process inspection confirmed neither was still running. These runs are not passes. Round 9 restarts the unified check; full app verification remains pending. Before interruption, the full deployment script suite passed 194 tests after structural fixes. Required package-boundary imports now use the public `@pace/core` export surface.

### Owner clarification: breadth over polish

The owner clarified that the full roadmap stays in scope: implement more features and useful refactoring, defer polish, and finish the current packet first. The earlier proposed deferral of OTA/infrastructure/archive was not accepted. Keep required tests and code review, avoid repeated review/research without changed evidence. OTA manifest/signing implementation now proceeds from the existing plan/report, staged separately while the runtime checkpoint is checked.

Unified lint round 9 reduced root errors to three: the combined keep/disable intent variant did not narrow configure fields, and an auto-fix created an async fixture without await. Split the intent into proper discriminated variants and use an explicitly awaited fake resolution. Round 10 verifies these corrections and remaining unified stages.

### Runtime integration validation

Unified `bun lint` round 13 completed successfully: formatting, all ESLint workspaces (existing 74 design warnings), all TypeScript projects, unused/duplicate-code checks, dependency boundaries, workflow checks and migrations. The final corrections moved bot polling types to their owning module and classified the deployment CLI's zod dependency as a runtime dependency; no rules were weakened. Auth/session regression tests passed 52/52 and deployment scripts 194/194. Full app tests are running; CI also checks the draft PR's current pushed checkpoint. This evidence does not establish Android/FCM or staged production deployment success.

### Checkpoint db38aeb and CI evidence

Pushed `db38aeb` to draft PR #55 after unified lint, 52 targeted auth tests, 194 deployment-script tests and the complete app suite (134 suites, 1008 tests) passed. GitHub's combined lint/audit/unit/app/API/JVM job subsequently passed. Android run 42107202031 and web E2E both failed before application tests because Node's Expo config loader could not resolve extensionless `expo/config-plugins`. The .js import fix has real-loader RED→GREEN coverage for baked and runtime modes (2 tests) plus 11 existing config/plugin tests. A new push and CI rerun remain required.

### OTA publisher implementation in progress

The manifest/signing and immutable release pipeline now pass 53 Bun tests. An isolated `apps/updates` Worker with real local R2 tests passes eight cases covering CAS/immutability, exact signed bytes, asset delivery, missing channels, corrupt records and request boundaries. No cloud resources were created or deployed. Reusable runtime modules live in `apps/updates/src/shared` with public `@pace/updates/*` exports; CLI-only signing/filesystem operations remain in `scripts/ota`.

A single independent review found invalid cross-package import rewrites and mismatched channel validation. Both are fixed; delta review closed both findings. Optional MIME-type wildcard support is deferred because the pinned Android client sends supported explicit types. Actual Expo export, fingerprint compatibility, publication tooling, native integration and device recovery evidence remain open. Current unified lint reports 17 shared-module style issues and one regex warning; the author is correcting them without rule suppression.

### Real Expo export validation

`bunx expo export --platform android --output-dir /tmp/pace-ota-export --dump-assetmap` succeeded after the Expo import fix. This generated JavaScript/Hermes and assets only: no native build, Android process or emulator ran. Its 28 files total 10,697,203 bytes. The first OTA read failed on XML drawable MIME support; a captured real metadata regression was RED, the shared XML mapping fixed it, and all 54 OTA tests then passed. An ephemeral in-memory test key signed the real export, staged 31 objects, promoted a preview pointer and selected the original signed bytes successfully. The manifest's runtime was explicitly a nonvalidated spike value; this proves actual export-format compatibility, not native fingerprint or device compatibility. No production signing key, storage or deployment was used.

### Publisher verification before checkpoint

After CLI/test lint corrections, `bun test scripts/ota` passed 54 tests / 107 assertions. Multipart coverage checks exact envelope bytes and independently verifies the extracted signature with WebCrypto, without adding a parser dependency. Real workerd/R2 delivery tests passed 8/8. The two real Expo Node-loader regressions passed after the `.js` import correction. No exploratory QA or local Android run occurred.

The installed Expo fingerprint API computed the current tree's hash `659d7a0de63f9a5e7b2535e37949fb1b71399718` from 53 sources. Both `modules/pace-native/android` and `modules/pace-native/runtime-firebase-plugin.ts` have actual source hashes; Expo config still explicitly disables updates and contains the git-derived app version. This is source-inclusion evidence only, not the required comparative fingerprint matrix or an OTA-compatible native release.
