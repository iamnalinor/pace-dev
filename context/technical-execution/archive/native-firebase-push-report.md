> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Native Firebase push integration checkpoint

Runtime push eligibility now requires the current server origin, native ready status without a blocking reason, an actual native project id, and a matching non-null server FCM project. The token request is skipped for every blocked state. Baked mode preserves legacy optional-project behavior. Explicit device token failure adds a services-unavailable reason and falls back to polling when offered.

The origin/native-state authority captured before asynchronous work is checked after discovery, after token retrieval, before subscription POST, before method persistence and before global publication. Session changes also invalidate registration completion. This prevents late old-origin/configuration token work from sending FCM or overwriting the current Settings state. Missing origin cannot request a runtime token. Registration retains existing method choice, denied permission, polling fallback and none behavior.

Settings exposes localized explanations and an explicit restart action only for pending restart. No push path clears local events/outbox, removes the session, signs out or rewrites user content: this slice only stores the existing push method/choice and registers a notification subscription. Outbox/session ownership remains in existing runtime/sync/auth layers. The restart calls the native fresh-process operation deliberately; no automatic restart on server rotation is added.

TDD: initial runtime cases observed RED: 9 failed / 32 passed. Initial implementation GREEN: 41/41. Expanded notifications + existing Settings suite GREEN: 71/71 before final deliberate-restart/configuration-race cases. Final expanded run before lint cleanup: 2 suites passed, 81 tests passed in 10.36 seconds (notifications + Settings). This includes configuration/origin races, device-services explanation/offer retention across Settings refresh and later recovery, deliberate restart, latest-choice generation, serialized subscription ordering, durable method ordering, and persistence queue recovery after failure. Unified lint, gallery screenshot matrix, review/checkpoint and PR are root-owned. No emulator, QA round, native build or real-device delivery was run or claimed.

## Independent review follow-up

Read-only review against `a45bb0e` and the application working tree found no critical issue and two P2 issues requiring fixes before checkpoint:

- Persisted origin B with failed restart leaves the running UI on A. The recovery flow must explicitly block ordinary old-origin use and offer restart; a generic dismissible error is insufficient.
- Device-services failure must remove FCM from displayed options while preserving the saved preference and allowing future automatic registration retries. Retaining explanation text alone is insufficient.

Both fixes are in progress with regressions. Review also requested deferred POST/persistence invalidation coverage. Native/device and screenshot evidence remain outstanding; this review does not certify them.

Unified lint reached the app workspace and reported 24 errors in new code (complexity, promise ownership, state-holder assignment and test typing), plus the existing 74-warning design baseline. Fixes are being made without suppressing rules. The first restricted run failed without an ESLint report; the permitted retry produced these actionable diagnostics. No green checkpoint is claimed for this working tree yet.

Review follow-up: an old token completion could overwrite a newer saved choice under the same server/session/native snapshot. Each registration now captures its generation, and subscriptions are serialized so an already in-flight older POST completes before the newer choice is sent. Method persistence is serialized as well. The queue uses native-compatible Promise construction and await/try/finally; caller failures propagate while its tail resolves for recovery.

Worst-case gallery integration: `apps/app/src/screens/gallery/gallery-push-reasons.tsx` renders every reason using the actual presentational component, with existing card/token styles and no global-store mutation. `gallery-sections.tsx` includes it under the existing localized notification-method heading. Root owns web matrix screenshots and design review.

Latest independent-review follow-up: origin/native-only device failure retention survives later polling registrations, captured credential prevents a held API session check from sending an old body as a replacement user, and serialized choice writes return latest-owner completion so Settings skips obsolete callbacks. A late Settings stored-choice read is also guarded by choice generation. Each regression was observed RED first. Final targeted run: 3 suites passed, 85 tests passed in 11.045 seconds (notifications, Settings, inert gallery).
