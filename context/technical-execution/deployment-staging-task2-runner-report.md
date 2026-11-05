# Deployment staging Task 2: injected staged runner

Implemented `ports.ts`, `stage.ts`, `promote.ts`, `runner.ts` and fake-port tests in `scripts/deploy/`. This slice only invokes injected ports in tests. No CLI, network adapter, ordinary deploy/bootstrap path, production action, or workflow activation is included.

## Behavior

`runDeployment` accepts only explicit staged mode with strict candidate policy and an explicit migration declaration (`none` or `backward-compatible`). It parses an authenticated control-plane snapshot and proves baseline HTTP health/instance plus exact baseline readiness before its first write. Existing preflight rejects absence, invalid identity/checkout, split traffic, stale latest versions, reused attempts, and unsafe pair intent.

Upload creates an inactive candidate carrying the unique attempt. Keep inherits a verified remote pair without reading values. Configure stages the complete pair together with any other secret updates in one bulk version update after the base upload; disable stages both null values in one bulk update, skipping removal when the baseline is already proven disabled. Other secret updates are included before preview verification and promotion. Direct overrides of Firebase pair keys or identity/policy bindings through the other-secrets channel are rejected.

Every returned candidate must be new, HTTPS, and declared inactive. The runner rechecks original active version/deployment and exact latest version around the bulk update. The final exact preview must deny anonymous access with 401/403 and prove authenticated readiness identity, attempt, policy, pair mode/project, health, and instance. An invalid candidate never reaches migrations.

The original baseline deployment and final candidate latest ID are rechecked before migrations and again before promotion. Promotion always targets the verified candidate at exactly 100%. A production snapshot/probe failure triggers exact baseline promotion and verification of health/instance and the original identity/policy/Firebase verdict, including a healthy additive legacy-invalid verdict. A failed or throwing promotion is ambiguous and also triggers verified rollback, returning `promotion-uncertain-rolled-back`. Failed production proof with verified rollback returns `production-failed-rolled-back`. Any unsuccessful rollback command or proof returns `rollback-failed`.

All port failures and thrown exceptions become fixed error codes; raw adapter errors and configure/other-secret values never enter result objects. Ports receive sanitized target identifiers for observation rather than the configure request.

## Evidence

TDD RED: before implementation, the focused runner tests failed because `runner.ts` did not exist (`/tmp/pace-runner-red.log`). Initial implementation passed 27 tests. Additional ambiguity tests failed as expected against the prior generic rollback result (43 pass, 2 fail), then passed after distinguishing the uncertain promotion outcome. Test extraction briefly exposed missing fixture exports, corrected at their cause before rerunning.

GREEN: `bun test scripts/deploy` — **101 pass, 0 fail, 187 assertions across 4 test files** (`/tmp/pace-staged-green.log`). This includes the existing 56 pure preflight tests and 45 runner tests covering operation order, complete pair/other-secret staging, baseline/candidate health and malformed identity barriers, authenticated read failures, version/deployment/latest drift, anonymous preview access, migration failure, uncertain promotion, and verified/failed rollback. Root owns lint and independent review.

## Remaining boundaries and external gates

Snapshot reads followed by writes are not atomic. An external deployment lock/concurrency group must serialize uploads, secret writes, migrations, promotions and rollbacks; out-of-band changes remain an unavoidable race between the last check and the next operation. The adapter must authenticate control-plane responses, distinguish confirmed absence from auth/transport failures, guarantee actual inactive upload semantics, validate the returned Version URL against the intended Worker's trusted version-domain before sending Access credentials, and preserve attempt/policy bindings through bulk updates. HTTPS parsing alone does not establish a trusted preview host.

Migration rollback changes only Worker traffic; it cannot undo D1/DO data or migrations. The caller's backward-compatible declaration requires external review. The runner verifies HTTP health and instance as adapter-supplied successful verdicts, not real FCM delivery. Protected exact Version URLs, token permissions, Cloudflare/DO behavior, both-pair rotation/removal, rollback and device delivery still require the isolated nonproduction rehearsal before activation. Bootstrap remains an explicit separate future path, never an automatic fallback.

## Independent review and adapter work

The independent application-runtime author reviewed the pure preflight/runner through the installed Superpowers template, including the Worker readiness counterpart. No critical, important or minor findings were reported for this slice. Reviewer and root each ran all 101 deployment tests successfully. Adapter semantics, preview credential allowlisting, external serialization, bootstrap, migration compatibility and nonproduction/device rehearsal remain explicit outstanding gates; the bounded approval does not complete Task 3b or authorize activation.

A first CLI support primitive now exists in `scripts/deploy/secrets-file.ts`: exact bulk secret JSON is written in a unique private temporary directory, with file mode 0600 and exclusive creation; the command receives only its path. Success, returned command failure and exceptions all clean the directory; fixed errors do not echo secret fragments. Four filesystem tests passed after the initial missing-module RED. Independent review and unified lint are pending for this helper. Process termination that prevents JavaScript cleanup is not covered by the normal finally guarantee; the future CLI signal/runner cleanup policy remains to be implemented.

The command-environment support helper now builds an explicit environment from executable lookup, private HOME/TMPDIR paths and supplied account/token credentials. Ambient runtime preload flags, proxies, Worker bindings and debug/auth settings are not inherited. Five tests passed after missing-module RED, and independent review found no issue. Installed Wrangler 4.156.0 source confirms its global CLI dotenv loader is separate from the dev-vars switch; the future command adapter must still supply an explicit empty `--env-file`, alongside Bun's `--no-env-file`. No command executor or remote operation is implemented by this helper.
