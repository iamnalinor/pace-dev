# Pace technical roadmap — adversarial review

**Artifacts reviewed:** `context/technical-roadmap.md`, Android E2E, Firebase from server, OTA, cold storage, and infrastructure portability briefs. **Base:** `a67cc504dac7f4569a8cbc5da91c8ed4350bc5a3`, draft PR #54; current remote CI and production state unverified.  
**Standards consulted:** PM Critic, PRD, Build Risk Review, Edge Cases, and Acceptance Criteria.  
**Findings:** 10 (P0: 2, P1: 6, P2: 2, P3: 0).

## P0 findings

### F-01: A valid existing push deployment can turn into an API outage

**Location:** Firebase brief server steps 2–4; roadmap T2a/T2b; `.github/workflows/deploy.yml`.  
**Issue:** The existing workflow deploys the API before it writes `FIREBASE_SERVICE_ACCOUNT`; it also skips that write when the GitHub secret is absent, potentially leaving a Worker-only secret in place. A check over GitHub env alone does not establish the effective Worker configuration. The plan requires both secrets before the guard, but has no independent staging/verification step. Two independent secret writes after the strict guard is live also expose a half-configured state during first setup, project rotation or removal.  
**Why it matters:** The intentional strict behavior makes an otherwise valid legacy deployment, including a self-hosted server, answer 500 on health, login and sync. Rolling out the new APK first additionally makes old-but-compatible push-enabled servers poll until they advertise the config.  
**Fix:** Stage the pure validator, tolerant contract and compatible advertisement first. Next, have the release operator verify effective bindings and stage an exact matching pair together (or validate the target version with its staged bindings before routing traffic); verify deployed health, instance and legacy FCM. Preflight before any D1 migration/deploy side effect; a missing GH value must neither infer a Worker value nor silently discard it. Define separate planned procedures for first configuration, pair rotation, disabling push, legacy self-hosted upgrades and reverting. Enable the strict guard only after that evidence, then remove baked config in the new APK. Do not make a temporary lenient legacy rollout the final behavior.

### F-02: Archive completion currently includes irreversible pruning before all readers can use it

**Location:** Cold-storage brief steps 2–7; roadmap T5b before T5c.  
**Issue:** T5b includes pruning; T5c forbids pruning until checkpoint-aware clients, protocol policy and readers are ready. Read-back of a month object proves only the upload, not completeness under concurrent backdated writes, archive replacement, or the ability to restore.  
**Why it matters:** A user can lose sync history or raw usage, or a release rollback can strand data. A backup that cannot be reconstructed and read is insufficient.  
**Fix:** Split archive copy and hot pruning into distinct milestones. Begin with copy-only, publish a versioned manifest with event/cursor coverage and verify a full restore in an isolated account. Pin generation/ownership and serialize or conditionally commit around concurrent amendments, exports and deletion, with retries on the same operation identity. Ship compatible checkpoint bootstrap/history/export and outbox preservation; after rollout, move minimum protocol as needed and verify both old-client refusal and quiet new-client sync. Only then enable separately controlled pruning, with rehearsed restore and account deletion across live and superseded archive objects.

## P1 findings

### F-03: The Android test APK cannot use the proposed login flow as written

**Location:** Android brief steps 1–2; roadmap T1a/T1b; `apps/app/src/screens/login-screen.tsx`, `apps/app/src/platform/api-base.ts`.  
**Issue:** A bundled release-like APK does not run Metro, and Android's native login renders the dev form only for `__DEV__`. Web uses `IS_DEV_LOGIN_ENABLED`, which reads the test-build setting. The server URL parser permits `10.0.2.2`, but that does not prove the generated release manifest permits the connection.  
**Why it matters:** Green YAML validation or an APK assembly cannot prove that native tests reach any scenario; a shared cleartext or debug flag could accidentally alter production.  
**Fix:** Build a separate, test-only x86_64 APK with an explicit dev-login setting and the minimum emulator-only network allowance. Reuse the local Worker test setup and separate temp DB; prove x86_64 install, readiness probe, and dev login → Now on the actual runner. Confirm prod APK lacks the opt-ins and prod Worker rejects dev login and any inspection endpoint. Keep FCM credential checks separate from deterministic polling.

### F-04: A GitHub Actions scaffold cannot yet be made a release gate

**Location:** Roadmap T1a/T1b; `.github/workflows/release.yml`.  
**Issue:** The release publishes the APK and may notify Telegram. There is no evidence of working KVM, API/emulator networking, time/cost, exact commit provenance or the six flows failing when deliberately broken. Emulator-only evidence cannot cover vendor battery savers and real Doze.  
**Why it matters:** A flaky or skipped emulator job can either block ordinary APK releases or allow an untested APK to publish.  
**Fix:** Keep T1a dispatch-only until its Android smoke succeeds on Actions at the selected SHA. Check workflow and APK provenance with exact-commit checkout; capture x86_64 ABI, elapsed time, logcat and screenshots on failure. T1b makes an in-run reusable test job a dependency of APK publication only after the documented red/green scenario matrix passes. A job skipped or from a different commit is not a success. Leave the release ABI arm64. Before release, assign owner verification for the brief's real-device list.

### F-05: A Firebase project match is necessary but insufficient for a safe switch

**Location:** Firebase brief app steps 5–9; roadmap T2b; existing push registry.  
**Issue:** Origin, stored Firebase entry and initialized Firebase are separate lifecycle states. A new app ID/API key/sender or removing the package entry may happen within the same project; project-only equality would silently reuse stale options. A timed-out write or repeated confirmation can restart on stale state. The instance's configured metadata and current FCM transport availability are different signals: D1 may temporarily suppress an otherwise valid FCM transport. Native startup/provider ordering and both old-APK and new-APK behavior are still unproven.  
**Why it matters:** The user can register with the wrong config or miss notifications with no recovery reason, especially through server switches and rotation.  
**Fix:** Choose an effective config identity that includes origin, package and all native options. Commit the new origin/config coherently before the one Android restart on a confirmed *different origin*, even for the same project; a rejected/unreachable origin, failed persistence or repeat press must not create a partial switch. A same-origin config change waits for a cold start, polls in the meantime and reports why; test config removal, missing package, failed native initialization and rotation within one project. Keep health/instance errors distinguishable from protocol incompatibility and preserve the true transport status. Trace registration and FCM/poll convergence, then verify fresh install, cross-project/back switch and in-place upgrade with no re-login on device.

### F-06: OTA has no trustworthy promotion evidence yet

**Location:** OTA brief security/compatibility/channel constraints; roadmap T3.  
**Issue:** A preview path alone does not establish that the exact signed bytes promoted to production were tested, that the runtime fingerprint differentiates native config changes, or that self-hosted servers in use are compatible. The rollback is an observed behavior, not assured by citing `expo-updates`.  
**Why it matters:** Bad or incompatible code may reach all compatible APKs without an install prompt.  
**Fix:** Prototype against the final native Firebase/runtime boundary and test preview release-like APKs. Record publisher source, runtime, channel, certificate identity, immutable update ID, bundle/asset checksums and approved server protocol range. Production promotion points to the same already-tested bundle/assets; compare channel/runtime for actual supported APKs, rather than treating newest source as an APK version. Prove unsigned and wrong-key rejection, known crashing bundle recovery without launch loops, and offline embedded launch. Keep preview/test keys out of production. Choose self-hosted versus EAS only after the prototype proves what each route costs and supports.

### F-07: Cold-storage success is underspecified without a measured crossover or a defensible cost bound

**Location:** Cold-storage brief Step 0, cutoff and simulated-year test; roadmap T0/T5a.  
**Issue:** The brief requires real production rows, writes and storage before selecting how far to build. Synthetic figures can compare alternatives but cannot predict time to quota. A permanently open dependency, dedup index or materialized state can still grow with history; cursor order is not `occurredAt` order.  
**Why it matters:** Work could introduce migration risk without material savings, or pass a short fixture and grow in production.  
**Fix:** Record synthetic and production evidence separately. Measure cold-instance reads/writes (not warmed objects), time, memory, sync/export bytes at 1/6/12 months; reuse the existing `meterSql` and cold-alarm patterns and include year-old open entities, DST/zone shifts, late backdates and amended/revoked corrections. Define measured thresholds and exception policy before selecting archive urgency. Without production data the brief's decision to archive/prune remains pending; retain source data. Explicitly separate cursor coverage and replay cutoff; version and shadow-compare checkpoint state, IDs, and correction targets.

### F-08: The ports plan could freeze abstractions before the contracts are known

**Location:** Portability brief steps 1–5; roadmap T4/T6.  
**Issue:** Declaring eight ports upfront encourages Cloudflare types, data-plane behavior and hibernation assumptions to leak through renamed interfaces. A `workerd` container is useful for operating the current app, but a Cloudflare adapter exercised under workerd does not prove a non-Cloudflare adapter boundary.  
**Why it matters:** The project could pay the refactor cost without gaining portability, or regress wake-up/revocation behavior.  
**Fix:** Extract one used boundary with a real adapter first; keep SQL contract scoped to the selected SQLite driver capabilities and reuse typed actor RPC. Verify existing behavior at each cut (one writer per user, parallel users, durable alarms with past/earlier re-arm behavior, one-session socket closure, idempotent migrations). Enforce both imports and ambient access with an intentional leak. Document workerd as operational evidence and contract-test a second adapter if pursued; keep production Cloudflare and no Postgres/multi-node in scope.

## P2 findings

### F-09: The approved Firebase config sweep needs scoped dispositions

**Location:** Firebase brief step 2; `apps/api/src/shared/config.ts`.  
**Issue:** Existing LLM slot skips and origin handling already document distinct recovery policies; broad conversion to Firebase-style global 500s could itself regress optional features. `token_uri` is accepted as a URL by the existing FCM account shape; syntactic acceptance alone does not prove the account can sign or send.  
**Fix:** Record for each audited setting which failures are already loud, deliberately degraded or newly rejected. Normalize and validate paired credentials consistently, redact secret contents from errors/CI output, and treat live FCM authentication as a distinct release smoke. Pin precedence for malformed config versus version enforcement and CORS preflight, and decide explicitly whether non-`/api/*` paths such as Telegram webhooks are affected.

### F-10: Status language can make a code slice look like release evidence

**Location:** Roadmap base, Definition of Done and “Проверка этого результата”.  
**Issue:** The roadmap is a dated plan and retains historical “no code changes” and “no Bun” statements. As work starts, there is no place to separate local implementation from real Actions/device/production evidence.  
**Fix:** Preserve the original snapshot, add per-slice status with exact SHA and pass evidence, and label external gates with roles (repo maintainer, Firebase/deploy operator, Android device owner, Cloudflare metrics operator). State explicitly that this work is separate from draft design PR #54 and that no push/merge/release is implied. Link the addenda from the roadmap instead of duplicating specs.

## First executable increment

**Build-risk review, feature-change mode.** R1 (`trust`): treating locally tested code as a safe release when the effective deployment config, Android runtime, or archive recovery has not been observed. The owner's one request is L1 demand across the five initiatives; the Android manual checks and APK installation workaround in the briefs are medium behavioral evidence, and inspected code/workflows are direct evidence for technical constraints only. No production quota or device result was supplied. **Verdict: Build small.** Validate first on each external gate by recording the runner's exact-SHA smoke, effective-binding names and matching-project check without values, and a current representative DO/D1 read/write/storage snapshot; use the local increment while those remain unavailable.

1. T0: re-check actual base and tool availability, record the evidence matrix, and run a repeatable, isolated synthetic baseline where tooling permits. Mark real metrics as pending; no archive/pruning decision.
2. T1a: manual x86_64 workflow and one dev-login → Now smoke using isolated test-only config. A local runner/tooling check can validate syntax or tests but cannot sign off this workflow. Keep release wiring untouched until a successful exact-SHA run and the T1b flows.
3. In parallel as an independent commit, T2a.0: contract-first pure parser and pair validator with unit fixtures, `knownOrNull` instance read, and optionally additive advertisement for a valid pair while preserving legacy FCM and compatibility. Invalid/partial fixtures must not advertise unvalidated metadata. The strict API/deploy activation remains a distinct gated increment. No new native/UI or OTA dependency in this slice.
4. Keep all remaining approved work visible: T1b and Firebase native/release after evidence; OTA after Firebase native settles; minimum ports before checkpoint/storage; synthetic baseline and production evidence separately; archive only after dual-reader rollout and restore. Telegram OIDC remains out of scope.

**Pass/fail for these slices:**

- Given unset pair or an old instance payload, when a new client parses the instance, then Firebase metadata is null and compatibility is unchanged.
- Given a valid matched pair with multiple distinct package entries, when parsing and serving the instance, then every public Android entry is present and no private service account value is returned.
- Given malformed input, a partial pair or mismatched projects, when checking config, then the check fails with a stable reason without secret output. Given a legacy server during the additive stage, when an existing APK registers, then the old FCM path remains usable.
- Given the exact x86_64 test build and isolated Worker, when the manual emulator job runs, then the test can sign in and reach Now; given deliberately broken login, the test fails and emits the promised diagnostics.
- Given increasing synthetic histories, when the same cold fixture runs for each size, then the report records observed reads, writes, time, memory, and byte sizes with SHA/conditions and without presenting these figures as production.

## Status Summary

The review returned 10 findings: 2 P0, 6 P1, 2 P2. The release-blocking problems are a strict Firebase guard against secrets that have not been staged and premature pruning before compatible readers and recovery. The first local increment can proceed with isolated Android workflow preparation, baseline work and additive Firebase contract checks, subject to normal verification. Those changes establish no evidence of production bindings, Android behavior, OTA rollback or archive safety.

**Recommended next action:** Revise the plan to split the gated actions as above; proceed with the approved first executable slices.  
**Refusal triggered:** No.

## Status

```yaml
artifact:
  path: context/technical-roadmap.md
  type: technical-roadmap-and-supporting-prd-briefs
  thread: other
findings:
  total: 10
  p0: 2
  p1: 6
  p2: 2
  p3: 0
refusal:
  triggered: false
  reason: null
standards_consulted:
  - skills/utility-pm-critic/SKILL.md
  - agents/pm-critic.md
  - skills/deliver-prd/SKILL.md
  - skills/foundation-build-risk-review/SKILL.md
  - skills/deliver-edge-cases/SKILL.md
  - skills/deliver-acceptance-criteria/SKILL.md
recommended_action: revise
dispatch:
  mode: inline-execution
  client: other
```
