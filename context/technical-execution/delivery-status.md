# Delivery scope and remaining gates

This handoff advances the technical roadmap from the exact PR #54 snapshot. It does not implement the entire multi-release roadmap.

| Area | Delivered in this stage | Remaining evidence / work |
| --- | --- | --- |
| Environment and method | Bun/dependencies, Android build components, Chrome, pinned source plugins, risk review and task reviews | Native dependency resolution and accelerated emulator unavailable here |
| Android | Isolated smoke APK configuration, guarded dev login, emulator-only HTTP policy, pinned manual/reusable workflow, Maestro flow and tested runner | Actual APK/AVD run, negative control, additional native flows; release gate remains off |
| Firebase server contract | Pure strict validator, multi-package public projection, tolerant instance schema, additive API adapter, legacy sender preserved | Strict runtime policy and guarded deployment activation; staged version/secret rehearsal |
| Firebase preflight | `check:config`, explicit configured/disabled expectation, fixed diagnostics, dotenv guard | Only checks supplied local values; no live Worker credential or FCM delivery verification |
| Native Firebase | Rollout design and prerequisites | Runtime initialization, switch/restart, Settings reasons, device push/upgrade verification; baked APK config remains |
| OTA | Dependency ordering retained in roadmap | Implementation, signing, runtime match, actual rollback/embedded-bundle checks |
| Storage | Reproducible synthetic rebuild/serialized-size probe | Production read/write/storage metrics; reliable retained-memory measurement; checkpoint/archive/sync/export/restore implementation |
| Infrastructure ports | Existing coupling reviewed and incremental approach retained | Port/adapters and guards not implemented; alternative runtime remains conditional |

No production deploy, push, traffic migration, secret rotation, pruning or data deletion was performed. No full exploratory QA was run. Reports distinguish focused unit/integration checks, real local HTTP evidence, interrupted broad runs and device/CI evidence that is still absent.

The next release must not remove baked Firebase configuration or enable strict rollout based solely on this handoff. Follow `firebase-rollout-design.md`, verify the exact inactive Worker version's effective bindings, and run native device checks first. The Android workflow is intentionally not a release dependency until it has passed on an actual emulator.
