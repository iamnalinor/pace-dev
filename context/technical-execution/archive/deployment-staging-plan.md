> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Deployment staging implementation plan

> For agentic workers: use superpowers:executing-plans task by task.

**Goal:** Verify an inactive exact Worker version before migrations or traffic movement.
**Architecture:** A pure deployment state machine uses injected Cloudflare, probe and CLI ports. The shared public readiness contract exposes sanitized identity and pair verdicts; production activation remains gated externally.
**Tech stack:** Bun, TypeScript, zod, Hono/workerd, pinned Wrangler 4.156.0.
**Spec:** firebase-rollout-design.md, section 3b.

## Global constraints

No production mutations, deployment, exploratory QA or emulator execution. No workflow activation. Bun only; Node shebangs use /tmp/pace-tools/node-v24.22.2-linux-x64/bin. Root owns lint, review, commits and pushes. No dotenv inheritance or secret values in errors.

## Review focus

- Auth/network failures must never become confirmed absence.
- Secret-only writes create versions: stage every secret together, never mutate live bindings after promotion.
- Missing identity cannot fall back to PACE_VERSION.
- Latest-version drift can redirect secret bulk updates: compare immediately around the update.
- Rollback must verify the recorded compatible version rather than silently fall back.

## Task 1: Readiness contract

Files: packages/core/src/api/schemas/deployment-readiness.ts; endpoints.ts and public exports; apps/api/src/shared/deployment-readiness.ts; app.ts; Wrangler binding/types; workerd tests.

- [ ] Write failing workerd tests for GET /api/deployment-readiness under old protocol and anonymous caller, missing version/attempt, configured/disabled/partial/malformed/mismatched pair under both policies, and invalid policy. Verify private material is absent and strict existing routes remain 500.
- [ ] Add zod contract: deployment identity available(versionId, attempt) or unavailable; policy additive/strict or explicit invalid verdict; firebase ready configured(projectId), ready disabled, or invalid(reason). Never expose provider account fields.
- [ ] Mount before strict configuration guard; allow any protocol. Read CF_VERSION_METADATA.id and PACE_DEPLOY_ATTEMPT per request, never PACE_VERSION. Reuse strict pair validator even under additive policy.
- [ ] Run targeted API tests RED then GREEN; root runs bun lint and reviews.

## Task 2: Injected state machine

Files: scripts/deploy/{types,preflight,stage,promote,bootstrap}.ts and adjacent tests.

- [ ] Write fake-port tests pinning all operation sequences and every failure barrier.
- [ ] Define runDeployment(request, ports), with explicit staged or additive-bootstrap mode. Validate clean exact checkout, account, worker, authenticated existence, one 100% active version, latest equal baseline, and baseline readiness before writes.
- [ ] Keep inherits verified mode/project without reading values. Configure validates both supplied values. Disable uploads base candidate then stages one bulk null pair update, checking latest drift before and after. Support other secret updates within candidate staging.
- [ ] Require unique attempt marker and inactive upload result. Verify exact protected Version URL denies anonymous access; authenticated readiness identity, attempt, policy, mode and project match; health and instance succeed.
- [ ] Recheck active/latest immediately before backward-compatible migrations and exact ID@100 promotion. Probe production; on failure promote recorded compatible baseline and verify rollback. Return explicit failure if rollback cannot be verified.
- [ ] Explicit bootstrap only: confirmed absence or declared pending DO migration, additive policy, known complete pair/disabled inputs. Existing migration preserves already verified pair. Never bootstrap automatically after staging failure.
- [ ] Run fake tests RED/GREEN for each gate, drift, retries, rollback and pair lifecycle.

## Task 3: CLI adapter and report

Files: scripts/deploy/{cli,cloudflare,probes,secrets-file,main}.ts; adjacent tests; deployment-staging-report.md.

- [ ] Read installed pinned Wrangler upload output and versions/latest PATCH implementation before command mapping.
- [ ] Add sanitized CLI errors, explicit environment allowlist, no dotenv, restricted 0600 temporary JSON files with finally cleanup. Tests cover success, write failure, command rejection and secret-fragment redaction.
- [ ] Implement structured authenticated Cloudflare reads distinguishing missing/auth/network/malformed responses. Tests pin exact promotion ID and no post-promotion secret puts.
- [ ] Run focused scripts/API checks and root lint/review. Record local evidence and external gates: nonproduction DO bootstrap/staging rehearsal, Access exact Version URL, account permissions, device FCM, production activation. Do not claim these ran.

## Platform constraint discovered during adapter implementation (2026-11-05)

The original exact Version URL assumption does not hold for Pace's current Worker: Cloudflare's [Version URL limitations](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/#limitations) exclude Workers implementing Durable Objects. Pace exports a Durable Object. The existing generic injected runner/probe tests do not establish that its preview route is deployable for Pace, and Task 3b remains incomplete.

[Version overrides](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/) require the candidate to be in the current deployment, potentially at 0% while baseline remains at 100%. This is a distinct control-plane operation, and a public override header can select the candidate; it is not a drop-in protected inactive URL. Do not silently fall back to this route or ordinary deployment. Before implementing an explicit override mode, resolve authentication/edge stripping, exact response identity, active-state drift and rollback semantics, and Durable Object routing behavior. Any route must preserve baseline ordinary traffic until candidate proof and backward-compatible migration gates pass.

Continue implementing authenticated snapshot reads and fail closed for unsupported preview capabilities. Do not equate a generated hostname, green fake-fetch test or cloned preview with proof of the exact target Worker's effective bindings. Production remains additive until a supported path is implemented and rehearsed.
