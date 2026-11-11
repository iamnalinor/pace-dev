> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Task 3 implementation report

Implemented the local `bun run check:config` preflight. It reads only the two Firebase bindings from its environment, delegates validation to the shared strict validator, and prints one fixed state or reason code. The optional expectation fails closed when the valid input state is different. Unknown, invalid and extra arguments are rejected without the CLI echoing them. The docs explain the difference between local inputs and a Worker's effective bindings and record the later staged rollout prerequisites. No runtime, deployment, workflow, UI, or native behavior changed.

## TDD evidence

- RED: `PATH=/root/.bun/bin:$PATH bun test scripts/check-config.test.ts` produced `0 pass, 20 fail` and 20 assertions. The package invocation received `error: Script not found "check:config"` where the test expected `configured\n` or a fixed error reason; the direct subprocess received `error: Module not found "scripts/check-config.ts"` instead of `invalid-arguments\n`. These failures were expected before adding the script and package entry.
- GREEN: the same command produced `20 pass, 0 fail` and 20 assertions. Each subprocess asserts its entire exit status, stdout and stderr, including malformed JSON, Android shape, no Android apps, duplicate packages, incomplete pair, invalid account, cross-project pair, expected state mismatches, and invalid argv. Fixtures are synthetic.
- Pinned Bun 1.4.2 experiment: an outer `--no-env-file` alone did not prevent dotenv loading by a nested Bun command. The package script passes it to the child as well. In a scratch directory containing the actual package manifest and CLI and a fixture `.env` with two malformed Firebase bindings, the documented `bun --no-env-file --silent run check:config --expect=disabled` returned `disabled`, exit 0, with neither binding supplied in the process environment.
- Bun's default package runner echoes the command and any supplied arguments before the CLI runs. Raw Firebase values are supported only via environment bindings. The docs prescribe `--silent` for fixed-code-only output and `--no-env-file` for CI. The default package command is tested with environment bindings and does not print them; the documented and direct invocation tests cover invalid argv redaction. No global runner settings changed.

## Files

- `scripts/check-config.ts`
- `scripts/check-config.test.ts`
- `package.json`
- `docs/self-hosting.md`

Self-review: the CLI forwards only two process environment values and uses no error interpolation beyond the typed validator reason. Expectation checking follows successful pair validation. Exact candidate verification, nonproduction rehearsal, and authenticating or sending against FCM are outside this slice. No broader suite was run per task scope.

## Review follow-up

Added a subprocess regression with the actual manifest and CLI copied to a temporary project, installed workspace dependencies available through a junction, and both Firebase inputs in a fixture `.env` only. The documented command returns `disabled` with exit 0. Removing only the outer flag also returned `disabled` in the original experiment; that flag makes the CI launcher's intent explicit, while the inner flag is the demonstrated protection.

- Mutation RED: in a scratch copy of the actual CLI and tests, removed only the package script's inner `--no-env-file` and ran `bun test scripts/check-config.test.ts -t 'conflicting dotenv'`. The selected case failed (0 pass, 1 fail, 20 filtered out) with exit 1 and `android-config-not-json\n` on stderr instead of exit 0 and `disabled\n`.
- GREEN: `bun test scripts/check-config.test.ts` with the real package manifest passed 21/21, including the new dotenv case.
- Added the missed environment case to class 120 in `context/bug-lessons.md`. No other Firebase preflight package script exists. Standard hook runs caught a default-import style issue and a Bun variadic test typing issue; both were fixed without weakening any lint rule.
- Final verification: commit `3cb1310` (tree `77257d3fb25379c74471887e2b76b38bf321c22c`) passed the normal pre-commit `bun lint` hook in 364.01 seconds, with the repository's existing 110 ratcheted app warnings and no errors. The only delta from the approved tree was Biome wrapping the fixture invocation.
- A run concurrent with that hook timed out in the last three Bun subprocess cases (18 pass, 3 killed by the 5 s harness timeout). The sequential post-commit run of `PATH=/root/.bun/bin:$PATH bun test scripts/check-config.test.ts` passed all 21 cases with 21 assertions and no test warnings.
