# Pace Android fingerprint spike — successful source comparison

Prepared snapshot rerun with approved read-only subprocess access; exit 0. This supersedes the restricted-process matrix below. No tracked edits were needed for the rerun. Full JSON: /tmp/pace-fingerprint-spike-results.json; log: /tmp/pace-fingerprint-spike-escalated.log.

Baseline and repeated baseline: **fe7a35dd1257955651abfdc1d31b84a8427234b9**, **63 sources**, identical. Includes:
- modules/pace-native/android: 9fb4e924193f4818daedd141ab3d126af0a3ccad (matches root's independently computed native directory hash).
- expoAutolinkingConfig:android: 37a1994f80c1162833907ab641d1f9a9248474e9.
- rncoreAutolinkingConfig:android: a4f027768efcb0bf86a545edf2a40fb048de3bf0.
- The extra public certificate fixture accounts for one more source than root's 62-source disabled checkout. Snapshot-wide hash is not expected to match root because snapshot dependency paths and certificate differ.

| Mutation | Required | Observed | Hash |
| --- | --- | --- | --- |
| js-only-screen | same | same | fe7a35dd1257955651abfdc1d31b84a8427234b9 |
| kotlin-body | different | different | abc7a1a5f2b65fc63f997211541bb1b54ee985cc |
| module-permission | different | different | 500438ff5883f9bb82d3d24524c772cec2f577d8 |
| native-app-config | different | different | d18454a3562083fb24281cbcbd662232bfd7a300 |
| module-dependency-declaration | different | different | ed0681df02cf8f39f05b733c98ebbbb1e26a9b7c |

All comparisons satisfy expectations; source files restored after each comparison. No custom source skips/allowlists. Execution: PATH=/tmp/pace-tools/node-v24.22.2-linux-x64/bin:$PATH bun /tmp/pace-fingerprint-spike-run.mjs, with approved subprocess access. Installed default Expo57 fingerprint API as recorded below.

Limitations: this establishes source fingerprint sensitivity, not APK/native interoperability, installed dependency graph resolution, or a production runtime identity. Gradle dependency declaration was changed without resolving/building that dependency. No Google services file, real publisher certificate, or production OTA settings were used. Those exact build inputs must be captured for publication. Fingerprinting under restricted child-process execution can silently omit all autolinking sources; a publication guard must require successful discovery and expected native/autolinking sources before accepting its runtime record.

## Reproduction inputs and publication guard

Source checkout: `7964023`; installed Expo 57.0.31 and fingerprint 0.20.14. The isolated
snapshot uses tracked source files and read-only links to the existing dependencies. Set
`PACE_RELEASE_TAG=v0.11.0`, `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_FIREBASE_MODE=baked` and provide
Node 24 on PATH. No Google services file or production publisher settings were supplied.
Each mutation is restored before the next comparison. The JS case appends a screen comment;
the Kotlin case changes an error literal; the permission case adds a manifest permission;
the configuration case changes orientation; the Gradle case changes a dependency declaration.
Certificate replacement at the same path is separately covered by the existing real API test.
Repeated baseline is not equivalent to two clean dependency installations; that remains open.

An actual-checkout calculation independently returned 62 sources and fingerprint
`a20d6160fb3c03a58412801788c4c6eb15a70a1c`. Under restricted subprocess execution, the same API
silently returned only 17 sources and hash `d1a74d76a439e080f75ee711b4a9e66ee723a428`.
The new collector rejects missing native directory, Expo configuration or autolinking evidence as
`fingerprint-incomplete`, while retaining Expo's entire default source set. Its actual API
run accepted the complete checkout and rejected the saved incomplete result.

The native-runtime record guard checks explicit APK/candidate evidence: runtime fingerprint,
release tag and native version/code, platform/package, Bun version, and publisher/channel/
certificate/key identity. Disabled APK records are valid records but cannot authorize OTA.
This is not yet an authenticated latest-APK provenance pipeline; the release workflow and
publication CLI still need to collect and use these records.

A separate regression fixes default-disabled builds without a certificate: extraSources now
adds the fixed certificate path only when present. Enabled build validation still requires it.
The first real API test failed with ENOENT, then all 22 config tests passed after the fix.

## Verification and independent review

The two record/fingerprint guard files pass 35 tests; the complete OTA script and real Node
loader set passes 91 tests / 152 assertions. The app build/config set passes 32 tests. Unified
`bun lint` passed with the existing 74 design warnings and no new errors or warnings.

Independent Superpowers-template review found that native/autolinking presence alone did not
prove Expo configuration discovery succeeded. The collector now also requires a hashed
`expoConfig` source; removing it produced RED before the fix and GREEN after it. The reviewer
closed the finding with no further blocker for this bounded guard/collector packet. Actual
latest-APK provenance, workflow/CLI integration, clean-install equivalence and native OTA
interoperability remain explicitly outside this packet.
