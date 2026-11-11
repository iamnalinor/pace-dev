> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Validation of the delivered stage

All results are scoped to the commands and revisions recorded in the task reports. This is not a claim of a full release or full QA pass.

| Check | Evidence |
| --- | --- |
| Dependency install | Bun 1.4.2, frozen lockfile install succeeded |
| Android runner unit tests | 5/5; restricted PATH excludes jq; expected subprocess failure is propagated |
| Android app changes | 25/25 focused configuration/API-origin/login tests |
| Firebase core/client | 31/31 core parser/schema tests; 12/12 client discovery tests |
| Firebase Worker | 55/55 instance, health and notification tests in workerd |
| Firebase app consumers | 29/29 server-store and server-picker tests |
| Real HTTP E2E | Four configurations on actual local Wrangler/workerd and D1; all nine migrations; public metadata, warning sanitization/deduplication, health, login and authenticated me passed |
| Local preflight | Final committed source: 21/21 subprocess tests, 6.91s, no warnings. Actual dotenv fixture plus failing inner-flag mutation confirms regression sensitivity |
| Required lint | Normal full pre-commit `bun lint` passed on each final code commit, including typecheck, architecture, workflow and migration checks. Existing design ratchets produce 110 warnings, not new errors |
| Independent reviews | Android and Firebase each had one blocking finding fixed; preflight's non-blocking dotenv suggestion was implemented. Final commit deltas were reviewed |

## Checks not completed or not claimed

- Android prebuild and Expo config emission passed. SDK components are installed, but Gradle dependency resolution failed, no APK was produced, and no accelerated emulator/device was available. No on-device login, notification, negative control, FCM or upgrade verification is claimed.
- The broad API baseline before Firebase changes passed 606/608 with two timeouts under load; both unchanged affected files then passed serially, 63/63. This is baseline evidence, not a full post-change API suite pass.
- Broad core runs, with/without coverage and one/two workers, were interrupted after producing no completed-file results. No full core/client unit or coverage pass is claimed. No timeouts or coverage thresholds were increased or disabled in repository configuration.
- The optional full app suite was stopped after 12 unrelated suites passed. Focused app checks above completed; no full app suite pass is claimed.
- A concurrent preflight rerun timed out three child processes under load. The final sequential run on the committed tree passed all 21 with the original limits.
- Existing Wrangler proxy/source-map notices and React act warnings appeared in some focused integration/app output; the reports retain this evidence.
- No full exploratory QA, remote GitHub workflow, production deployment, live credential validation, storage quota measurement or destructive storage operation ran.

Next integration evidence: full unit/coverage and normal CI on the maintainer's environment; actual Android workflow and negative control before release gating; exact-version Cloudflare rehearsal before strict Firebase activation; device FCM/upgrade checks before removing baked configuration.
