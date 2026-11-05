### Spec Compliance

- ✅ Spec compliant for immutable tree 67871d6066c8c9e5554edd16e20d9d2ee4a8a0ab. All four requested surfaces are present: scripts/check-config.ts:1, scripts/check-config.test.ts:1, package.json:31, and docs/self-hosting.md:133. The local path accepts either valid state by default, checks explicit expectations after validation, rejects unsupported arguments, and documents the two-level Bun invocation and future rollout gates.
- ⚠️ Cannot verify from diff: normal hook/lint result and the final commit/tree match remain controller checks. The implementation report records RED and GREEN for 20 cases and a separate Bun dotenv experiment, but does not yet record the pending hook result; no additional suite was run during review.

### Strengths

- scripts/check-config.ts:3–19 accepts only the documented argument values and reads exactly the two environment bindings. Focused check for the risk of using the wrong parser or emitting sensitive error details: packages/core/src/core.ts:89–97 reexports the strict validator; packages/core/src/firebase/config.ts:26–34,128–151 gives a closed set of fixed failure codes and validates the complete pair. The CLI prints only those codes or its own fixed state/error values (scripts/check-config.ts:17–31).
- package.json:31 disables dotenv in the child, while docs/self-hosting.md:140–147 does so in the outer runner and suppresses argument echo. The ordinary package runner's expected echo is explicitly covered at scripts/check-config.test.ts:36–42. It does not include the environment values. Unsupported argument redaction is exercised through the direct and documented silent entry points (scripts/check-config.test.ts:44–48,123–129).
- scripts/check-config.test.ts:20–34,50–129 asserts full exit status, stderr, and stdout from real Bun subprocesses over absence, complete configuration, both partial pairs, all shared reason codes, expectation checks, and bad arguments. The synthetic fixtures make value disclosure observable.
- docs/self-hosting.md:154–174 distinguishes local input validation from effective Worker secrets and describes exact inactive candidate verification, nonproduction rehearsal, and rollback prerequisites.

### Issues

#### Critical (Must Fix)
- None.

#### Important (Should Fix)
- None.

#### Minor (Nice to Have)
- scripts/check-config.test.ts:20–34,55–57: the absent-input test does not create a controlled dotenv file, so it can pass in a clean checkout even if either no-env-file flag is removed. Consider preserving the report's scratch experiment as a fixture-backed subprocess regression so that accidental dotenv reads fail the test deterministically.

### Declined to judge

- Strict Worker activation, candidate upload/promotion and real rollback or FCM delivery: later rollout tasks, intentionally absent from the local CLI slice.
- Shared parser policy changes, including stronger credential authenticity checks: the brief requires the existing strict validator, and authentication is expressly outside preflight.
- Environment supplied through unsupported CLI arguments under the non-silent package runner: Bun echoes it before this CLI starts; the brief establishes the silent runner for fixed output and forbids passing values via argv. The documented supported path and direct script were judged above.

### Assessment

**Task quality:** Approved.

**Reasoning:** The thin CLI keeps validation in core and exposes only fixed diagnostics. The real subprocess checks cover the local contract; the hook and exact final tree still need controller confirmation.
