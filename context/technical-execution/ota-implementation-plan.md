> Historical plan; see [HANDOFF.md](HANDOFF.md) for status. Unchecked boxes and listed files are not a claim about the current tree.

# Signed Android OTA implementation plan

Status: publisher and signed artifact pipeline checkpointed in `9432b6f`; native build trust,
app lifecycle and Settings integration are being verified in the next packet. Publication
automation, the full fingerprint matrix and device acceptance remain open. The historical
checkboxes below are not a substitute for the evidence in the continuation ledger.

## Requirements and decisions

Implement `context/ota-updates-plan.md` after the Firebase native interface stabilizes. Preserve the APK release path and the web service-worker path. The selected account server must never control the publisher URL, certificate, channel or executable update. Use a separate publisher Worker with immutable R2 objects, rather than putting code delivery under the user's API deployment. This follows the brief's preferred self-hosted option and keeps signing authority separate from account credentials.

No publication, production activation, signing-key creation, QA or emulator execution is part of local implementation. Tests use ephemeral fixture keys. Real certificate configuration and device rollback evidence remain release gates; do not silently activate unsigned OTA when either is missing.

## Evidence reviewed (2026-11-05)

- Current `apps/app/app.config.ts` disables updates; the phone UpdateBanner passes children through. `release.yml` builds and publishes APKs. No expo-updates dependency is installed.
- The pinned Expo version is 57.0.31; the dependency graph contains @expo/fingerprint 0.20.14. Resolve the matching expo-updates version from installed Expo metadata before adding it.
- [Expo Updates v1](https://docs.expo.dev/technical-specs/expo-updates-1/) requires compatible runtime/platform request headers and defines manifest, asset and directive response negotiation. Implement the actual protocol, not a bespoke JSON endpoint that only our tests understand.
- [Expo signing](https://docs.expo.dev/eas-update/code-signing/) embeds the public certificate in the native runtime and verifies signed update bytes. Changing that certificate changes runtime compatibility.
- [Expo runtime policies](https://docs.expo.dev/eas-update/runtime-versions/) provides fingerprint-based compatibility. Verify it against this repo's Kotlin and config-plugin changes instead of assuming those sources are included.
- [Expo Bun guidance](https://docs.expo.dev/guides/using-bun/) identifies Bun-version-sensitive patched-package tag files in SDK 57 fingerprints. Keep Bun pinned across APK and publisher builds; inspect actual fingerprint sources before deciding whether an ignore is needed.

## 1. Protocol and fingerprint spike

Files: `scripts/ota/` fixture/export/signature tests and report; no app activation.

- [ ] Inspect pinned Expo export/fingerprint APIs and the matching expo-updates Android verifier, startup error recovery and manifest parser. Record exact versions and source locations.
- [ ] Build a local fixture manifest from export metadata, retaining exact signed bytes, asset hashes, MIME types, update UUID, date and runtime. Verify signatures using an independent crypto verifier and the client-compatible algorithm/encoding.
- [ ] Reject byte mutation, wrong key, wrong runtime/platform, missing assets and unsafe asset paths. Test supported response headers, no-update semantics and multipart/directive cases against the protocol.
- [ ] Run fingerprint fixtures: JS-only change stable; Kotlin, module dependency, permissions, signing certificate and native config change unequal. Test equivalent clean installations produce the same result. Never invent a reduced native-file allowlist.
- [ ] Report feasibility and limitations before implementing the publisher. A passing custom verifier alone is not native client interoperability proof.

## 2. Publisher service and immutable release artifacts

Proposed files: `apps/updates/` isolated Worker workspace, `scripts/ota/{export,manifest,sign,publish,promote}.ts`; repository boundary/config changes reviewed before writing them.

- [ ] Define injected artifact storage and channel pointer operations. Stage assets and signed manifests under immutable content identities; verify read-back before atomically changing a channel pointer. Failed upload leaves the previous channel usable.
- [ ] Select Android updates by exact publisher runtime and channel. Unknown runtime gets protocol-correct no-update behavior; malformed headers are rejected; storage failures are explicit errors, never disguised as no update.
- [ ] Keep signing keys in CI only; the serving Worker cannot sign code. Sanitize errors, keep temporary secret files restrictive and remove them on every exit path.
- [ ] Preserve prior releases for deliberate rollback. Inspect the client's newest-update selection before implementing rollback: merely pointing to an older createdAt must not be assumed to work. Pin effective rollback behavior with client-compatible fixtures and later device evidence.
- [ ] Add workerd tests for runtime/channel isolation, headers, unsigned/wrong signature artifacts, missing assets, failed reads/writes and interrupted publish/promotion. Keep production mutation commands opt-in and separate from checks.

## 3. Native and app integration

Files: app config/build tests; platform OTA coordinator with web sibling; Settings/About presentation and EN/RU catalogs; tests and design matrix.

- [ ] Configure publisher URL/channel/certificate at build time, independently from server selection. Enabling OTA requires all validated inputs; disabled builds remain APK-only. Add expo-updates with matching SDK version, retaining fingerprint policy.
- [ ] Disable automatic launch downloading where needed to enforce the app's policy: check on launch/foreground at most hourly, coalesce concurrent triggers, use Wi-Fi for asset downloads, preserve offline startup, apply on next cold start or deliberate restart.
- [ ] Show ready, failure/rollback and APK/runtime/update identifiers through existing UI tokens and t(). Trace the versions screen when a bundle's API protocol is incompatible. No modal and no server-selected code URL.
- [ ] Tests pin hourly boundaries, foreground storms, offline recovery, metered/unknown network, stale completion, restart action and native-reported emergency launch/recovery. Preserve outbox and local data.

## 4. CI, docs and acceptance gates

- [ ] Publish preview only through deliberate dispatch; production promotion selects an already verified immutable preview artifact. Refuse mismatched latest-APK fingerprint or missing signing material. Use a concurrency group per publisher/channel and never overwrite immutable artifacts.
- [ ] Keep APK publication for native changes; record the signed APK runtime metadata used by the OTA guard. Update self-hosting documentation, release checklist and rollback runbook.
- [ ] Run unit, workerd and app checks, full lint and independent security/TypeScript/React review. Capture changed UI matrix without exploratory QA.
- [ ] External evidence before activation: preview JS update/restart, rejected signature, wrong runtime, bad startup rollback with diagnostics, offline behavior and old-server versions screen. No emulator is started in this environment; missing device evidence remains explicit.

The full original OTA requirement remains open until implementation and its required evidence exist. A disabled scaffold or green fixture suite does not complete this task.
