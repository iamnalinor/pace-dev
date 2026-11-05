# Technical execution ledger

> Recovery note (2026-11-05): the original record below is historical. Current authority,
> main-based integration status and remaining work are in
> [continuation-2026-11-05.md](continuation-2026-11-05.md).
> Push/checkpoint/PR work is authorized; exploratory QA and emulator execution are excluded.

Base: a67cc504dac7f4569a8cbc5da91c8ed4350bc5a3 (PR #54). Local branch: codex/technical-roadmap.

## Authorization and rulings
- Owner authorized environment setup, plugin source download/use, plan adaptation and implementation; no GitHub write access.
- Owner update in this session: no full exploratory QA; targeted real E2E by Sol or cheaper when runnable.
- Ruling: keep the dedicated fresh checkout/feature branch; no second worktree is needed for sequential implementation. No shared user checkout is modified.
- Ruling: follow Superpowers task/review workflow without a repeated approval; user approved the roadmap and explicitly requested execution.
- Ruling F-01: Firebase strict guard is a later rollout step after compatible contract and deploy staging; avoid an outage on existing service-account-only servers.
- Ruling F-02: archive copy/verify and pruning are separate; no pruning before checkpoint clients, export, restore and protocol readiness.
- Ruling F-04: Android workflow initially dispatch/reusable only, not yet a release dependency. Cost: maintainer must run/verify it before enabling release gate.

- Ruling F-11: additive invalid Firebase input returns null metadata plus a sanitized operator diagnostic, not an HTTP 500; current client maps that 500 to unreachable. Strict outward error and client handling land together later. Cost: transitional validation is not yet the final strict policy.

## Preflight
| Tasks | Shared boundary | Resolution |
|---|---|---|
| 1 internal | test login + APK network + isolated API | Explicit test-build flag, emulator-only network exception; default production unchanged |
| 2 internal | public schema + parser + server | Pure typed validator; tolerant reader; legacy sender retained for additive phase |
| 1 / 4 / 5 | native config, release workflow | Sequential; smoke before native switch; release gate after real run |
| 2 / 3 / 4 | Firebase data and initialized identity | Additive contract first; later strict deployment before removing baked APK config |
| 6 / 4 | runtime fingerprint | Finish native Firebase boundary before OTA runtime |
| 8 / 9 | actor storage and scheduling | Ports first, checkpoint shadow mode second; pruning last |

## Environment and baseline
- Bun 1.4.2 installed; Node 24.22.1; frozen install succeeded (1576 packages).
- Eight plugin repositories cloned outside application; SHAs in plugins-lock.json. Hooks are not auto-installed from third-party sources.
- No /dev/kvm or physical device. Installed Android SDK 36, build-tools 36, platform-tools, NDK 27.1 and CMake 3.22.1; Java 17 available.
- Initial baseline checks: first parallel unit run: 169 script tests pass, one pre-existing 5s timeout in promise-function-async rule test under concurrent load; investigate serially before changing limits.
- Production metrics and live Firebase credentials unavailable.

## Tasks
- Planning risk review complete (plan-review.md); execution details expanded for Tasks 1–2.
- Task 1: complete and reviewed; commits bcf8d80 + 4e6caf9.
- Task 2: complete and reviewed; commit 2fc8702.
- Task 3: complete and reviewed; commit 3cb1310.

- Baseline instance API: 7/7 passed (workerd, maxWorkers=2). Timed-out lint-rule test rerun: 7/7 passed with unchanged timeout. Full API rerun limited to 2 workers after stopping the unbounded run for resource contention.

- Baseline API complete: 606/608 passed; two 5s timeouts under concurrent lint. Both affected files rerun serially unchanged: 63/63 passed (41.16s). No timeout increased.
- Android smoke Expo prebuild succeeded; generated manifest references a policy permitting only emulator 10.0.2.2 cleartext. Gradle network download blocked through Java; direct official distro download in progress. APK/emulator not yet verified.
- Chrome for Testing 153 installed from official archive; built-in Playwright download failed, direct download and ZIP check succeeded.

- Task 2 interfaces finalized: parseFirebaseAndroidConfig + validateFirebaseConfig strict pure Result; additive server adapter alone allows legacy account-only config. Duplicate packages rejected to avoid nondeterministic selection.

- Local Gradle 9.3.1 distribution verified by official SHA256; native build blocked resolving foojay-resolver-convention 1.0.0 through Maven/Google/Plugin Portal. No APK build or emulator pass claimed.
- Real local Worker: nine migrations, health OK, allowed test user authenticated, another user refused 403. Wrangler `--inspector-port 0` avoids unavailable interface enumeration without app changes.

- Task 1 committed bcf8d80; required hook lint passed (174.19 s). Reviewed tree 31fb5df0b62693077f1e052276ed04c0a5dff820 equals commit tree; independent /root/android_review pending. Focused app 25/25 and runner 5/5 pass. Full app run stopped after 12 unrelated passing suites; not claimed as a full pass.

- Task 1 review found ordinary unit tests implicitly required jq. Fix round 1 replaces JSON checks with existing Bun dependency; restricted-PATH RED/GREEN proves the defect and fix. Independent scoped re-review pending.
- Ruling: overlapping review with mandatory lint hook uses immutable Git tree snapshots; final commit tree must match before task completion. This avoids duplicate idle time without skipping lint or review.
- Synthetic baseline recorded in storage-baseline.md: event/state/ID serialized growth confirmed, CPU timings varied under load; heap measurements inconclusive. No Cloudflare quota or pruning claims.

- Task 1 fix re-review approved. Commit hook was interrupted with the session before committing; resumed normal hook on the same reviewed tree (no hook bypass).

Task 1: complete (commits a67cc50..4e6caf9, review clean); fix round 1/5 (1 addressed, 0 open; commits bcf8d80..4e6caf9). Hook lint passed 172.54s; reviewed and committed tree identical. APK/emulator evidence remains external.

- Task 2: implementing /root/firebase_contract, base 4e6caf97bad951ee1967d61c18ff0ce82662ec06.

- Task 2 focused green: core 29, client 12, API instance/health/notify 55, app server/picker 29. Review found exported service-account decoder violated Result convention; fix round 1 in progress. Existing proxy/sourcemap and React act warnings recorded as minor baseline noise.
- Broad core coverage run stopped (exit 130) after no completed test-file output for several minutes; client leg not reached. Diagnosing via same core test set without coverage; no timeout/coverage threshold changed.

- Task 2 fix round 1: Result finding addressed, independent review clean on tree e86628b9296eed6679bfeeeeddf91c70c3ee6632; core 31/31 and API 55/55 green. Final commit hook pending.
- Broad core attempts (coverage on/off, one/two workers) interrupted with exit 130, no completed-file evidence; host contention observed. They are NOT counted as passed. No tests deleted, skipped or timeouts increased. Focused evidence remains valid; a full unit/coverage run is an outstanding integration check.

Task 2: complete (commits 4e6caf9..2fc8702, review clean); fix round 1/5 (1 addressed, 0 open). Final tree3425f58ec1f107287dd2ecd7f6b4e4ea738049bc accepted. Full lint passed248.9s; 127 focused tests passed; independent real HTTP smoke all4cases passed.

- Task 3: implementing /root/firebase_preflight, base2fc8702c3d3339e66ae281456f94efdebb5226f6.

- Task 3 Bun probe: --no-env-file is not forwarded by bun run to its inner Bun command, and default runner echoes argv. Both layers disable dotenv; fixed-output CI/docs use outer --silent. Configuration accepts environment only; no global bunfig change.

Task 3: complete (commits 2fc8702..3cb1310, review clean). Added persistent dotenv guard from review suggestion; final sequential21/21 pass6.91s, normal full lint passed364.01s, final tree77257d3fb25379c74471887e2b76b38bf321c22c accepted.

- M1 documentation correction: clarified that implementation Task 3 delivered only the local CLI; runtime/client recovery and deployment remain pending Task 3b.
