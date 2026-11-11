> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Native OTA app integration — 2026-11-06

Scope: the app/build integration after publisher checkpoint `9432b6f`. This is a default-disabled
implementation packet, not activation or completion of the full OTA roadmap.

## Implemented

- Pinned Expo SDK-compatible updates/network modules. Existing lockfile versions and dependency
  placement are preserved; frozen installation succeeds with eight new package identities.
- Build-only HTTPS publisher/channel/RSA certificate/key identifier configuration. Missing inputs
  leave updates disabled; partial/invalid inputs fail the build without echoing secret material.
- Additive certificate-content fingerprinting using Expo's real fingerprint API. The test changes
  the contents at the same public-certificate path and observes a changed fingerprint.
- Native atomic network snapshot and actual installed APK version. Unknown/metered/non-Wi-Fi
  connections do not authorize asset downloads. No SSID or account credentials are read.
- App-level provider above account/server providers, hourly manifest checks, coalescing,
  bounded failed-fetch retries, first Wi-Fi resume, retained ready update, deliberate reload,
  and generation guards across disposal/effect replay.
- Settings and incompatible-server status, APK/runtime/update/date diagnostics, recovery copy
  and restart action through existing components and EN/RU catalogs. Web service-worker UI stays
  on its existing path. Separate design review/polish is deferred by the owner.

## Independent review

The Sol reviewer used the installed Superpowers requesting-code-review template with
TypeScript/React/security scope, base `9432b6f` and the working-tree delta. Client/provider,
native SDK and publisher protocol counterparts were traced. One important finding was accepted:
Expo's fetch operation also performs network work, so a manifest-only hourly budget did not
bound sequential retries after fetch failures. A separate failed-fetch budget and RED→GREEN
regression closed the finding. Final verdict: no outstanding critical or important issues for
the bounded, default-disabled integration.

The reviewer independently passed 25 lifecycle/adapter/provider/UI tests after the fix and had
previously passed 45 tests including build configuration. Implementer evidence includes 22
controller/adapter/provider/lifecycle tests, 31 configuration tests, two real Node/Expo loader
tests, three UI tests, five native fallback tests and 49 existing Settings/server integration
tests. The latter retain existing overlapping-act warnings. Final unified checks are recorded
in the continuation ledger rather than inferred from these focused results.

## Explicit remaining gates

- Full native fingerprint matrix, clean-install reproducibility, and reuse of the released APK's
  build-version inputs for JS-only publication. Current development versions derive from Git;
  their fingerprint cannot be assumed stable across JS commits.
- Publication CLI/workflow, immutable preview promotion, and signed APK runtime metadata.
- Native acceptance of signatures, rejection cases, offline/update/restart/recovery scenarios
  and network changes during transfers. Local Android/QA remains prohibited. Previous checkpoint
  `9432b6f` passed Android Actions smoke run `42112200861`; this does not validate the new OTA delta.
- Expo automatic checks use `NEVER`: native recovery fetching is disabled to preserve app network
  policy. Cached recovery is not a guarantee against every crash after content appears.

No production key, publisher resource, deployment, release or merge was performed.
