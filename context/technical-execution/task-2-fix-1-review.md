- **Public service-account parser returns a bare account or null** — **ADDRESSED.** The exported function now returns `Result<FirebaseServiceAccount, "invalid-service-account">` with a fixed error code (`packages/core/src/firebase/config.ts:113`). FCM unwraps success and preserves the account schema, default token endpoint, fingerprint, and the existing once-per-isolate log/null fallback for missing or invalid credentials (`packages/core/src/firebase/config.ts:104`, `apps/api/src/shared/fcm.ts:48`). Direct tests assert the exact typed failure and successful default token endpoint (`packages/core/src/firebase/config.test.ts:49`).

### New Breakage in the Fix Diff

- None. The extracted required-field check preserves nonblank validation and exact project equality (`packages/core/src/firebase/config.ts:120`, `packages/core/src/firebase/config.ts:145`). The revised integration assertions still compare the complete log records and now also require the refusal code on HTTP 409 (`apps/api/tests/instance.int.test.ts:138`, `apps/api/tests/instance.int.test.ts:163`).

### Out-of-Scope Observations

- The existing runner/picker warning noise remains a previously reported nonblocking item (`.superpowers/sdd/implementation-plan/task-2-report.md:19`).
- Recorded evidence: two decoder contract tests failed before the fix; focused core passed 31/31 after the final predicate factoring, and workerd instance, health and notification suites passed 55/55 after the Result fix (`.superpowers/sdd/implementation-plan/task-2-report.md:37`, `.superpowers/sdd/implementation-plan/task-2-report.md:40`). No duplicate test run. Reviewed immutable tree `e86628b9296eed6679bfeeeeddf91c70c3ee6632`; resulting commit identity is a controller check.

### Verdict

**Fix round:** All findings addressed, no new Critical/Important breakage.

### Final Commit Acceptance

- **Accepted** commit `2fc8702c3d3339e66ae281456f94efdebb5226f6`, tree `3425f58ec1f107287dd2ecd7f6b4e4ea738049bc`. The delta from reviewed tree `e86628b9296eed6679bfeeeeddf91c70c3ee6632` wraps the same required-field predicate and moves the same timestamp matcher into a local constant. The validator and integration assertion retain their semantics (`packages/core/src/firebase/config.ts:122`, `apps/api/tests/instance.int.test.ts:140`).
- The controller recorded the successful full lint run. The independent local Worker HTTP smoke passed all four cases (`context/technical-execution/feature-e2e-report.md:21`).
