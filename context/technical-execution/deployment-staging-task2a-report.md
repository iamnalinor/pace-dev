# Deployment staging Task 2a: pure preflight

Implemented `scripts/deploy/types.ts`, `preflight.ts`, `verification.ts`, and `preflight.test.ts`. This bounded slice performs no I/O or remote mutation. CLI orchestration, bootstrap, staging, migrations, promotion, and rollback remain outside it.

## Contract and assumptions

- `parseControlPlaneSnapshot` validates already authenticated adapter data. The adapter must distinguish authentication, transport, and malformed responses from confirmed absence before invoking it. Both absent and existing snapshots carry account and Worker identity.
- `preflight` requires a clean exact 40-character checkout SHA, matching target, unique nonsecret attempt, one active version at 100%, and latest version equal to that baseline. Attempt history is injected evidence, not authentication or a concurrency lock.
- Baseline readiness must expose the exact active version and an available attempt, a valid additive/strict policy, and a sanitized Firebase verdict. Keep requires a strictly ready pair. An unavailable legacy identity requires explicit verified additive bootstrap; no identity is invented and there is no application-version fallback.
- Keep derives the public mode/project from baseline readiness without reading secret values. Configure validates both explicit inputs through the shared Firebase validator and returns only the public project. Disable expects disabled while retaining the original baseline verdict. Explicit configure/disable may replace an invalid pair only under a verified additive baseline policy; strict invalid baselines always fail. This permits staging a replacement for the healthy legacy service-account-only sender without rewriting the live pair.
- `verifyReadiness` compares exact version, attempt, policy, mode, and project. Missing identity, noncanonical identity, unknown policy/reason, partial readiness, and invalid pair verdicts fail closed. Results contain fixed error codes and sanitized public fields.
- The later orchestrator must serialize writes and recheck active/latest around staging and promotion. This pure snapshot check cannot establish ongoing remote stability.

## Evidence

TDD RED: the initial focused test failed before implementation because `preflight.ts` did not exist. After implementation, root linked the agreed root zod dependency. Initial fixture failures identified an invalid test assumption: preflight derives baseline attempt/pair rather than comparing them with candidate expectations. Candidate-negative and baseline-negative cases are now separate, with no conditional assertions.

GREEN: `bun test scripts/deploy/preflight.test.ts` — **56 pass, 0 fail, 74 assertions** (latest run 37 ms; `/tmp/pace-preflight-revision-green.log`). Refactoring separated target validation and pair resolution; focused tests remained green.

The legacy migration refinement followed an additional RED run (53 pass, 3 fail), then GREEN. `BaselineObservation` retains sanitized `firebase` including an invalid reason; `VerifiedBaseline` no longer promises an unconditional baseline pair. Candidate verification remains ready-only. Pure preflight does not prove HTTP health: the orchestrator must verify baseline health and instance before writes, stage the candidate inactive, and compare the exact preserved baseline identity/policy/verdict when verifying rollback. No automatic bootstrap or ordinary-deploy fallback is authorized.

Root owns formatting, lint, branch review, and integration. No deployment, outbound request, QA, emulator, Git mutation, or production action ran in this slice.
