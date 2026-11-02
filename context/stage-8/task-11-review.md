# Task 11 review (23fae59..21f2ff4) — spec ✅, quality: Needs fixes

## Important
1. New strict output schemas the client parses: ParseResponseSchema (api/schemas/parse.ts) built from ProposalSchema whose variants are all z.strictObject (proposals/schema.ts), plus TaskDraftSchema, TaskPatchSchema, SubtaskEditsSchema, ActivityPatchSchema, SubtaskDraftSchema. Client parses responses with endpoint.output.parse (packages/client/src/api-client.ts:85) → any added server field rejects the whole answer on older clients. Fix: stripping z.object for output; strict only where the server reads input.
2. task.addSubtasks no longer keeps the message as the task's source: old addToTask wrote task.source.attached with the text; new plan-task writes only task.subtasks.added. Silent regression for bot + deferred queue; README says "the line is stored verbatim". The removed apply.test.ts case was the only guard.
3. Server can produce answers its own contract rejects: activity label falls back to whole typed text with no cap (from-model-activity.ts typedActivity(world.text).label; rules.ts; typedSpan labels) while ProposalSchema requires label.max(80) and request allows 4000 chars; summary.max(500) exceeded by markSubtasks/addSubtasks summaries listing many labels (summary.ts). Client: readActivity → null / assistant.read → failed. planActivity would emit activity.started with label >80 that payloads.ts:216 rejects. Integration tests only cast (json<ParseResponse>). Guard: parse every /api/parse response in parse.int.test.ts via endpoints.parse.run.output; property test withSummary(...) satisfies ProposalSchema; clamp fallback labels.

## Minor
- plan-activity endedBy re-implements client's closedBy (activity-edits.ts) and they differ (core writes redundant activity.stopped). → parked to Task 12.
- planAll duplicated: bot preview.ts and parse-queue.ts; each proposal planned against the same state (two creates naming the same new project → two projects).
- Domain literal "activity"|"auto"|"task" repeated (contract.ts, parse-queue.ts, prompt.ts, cases.fake.ts, llm.test.ts) → export REQUEST_DOMAINS.
- subtaskBodies emits two task.subtask.removed when a subtask is both removed and renamed.
- isQuotedDelete substring check — short titles pass inside any longer quote.
- TaskPatch.link exists but ModelActionSchema lacks link; CLEARABLE lacks it.
- Time bar readActivity posts without draft → readings logged in Decision log as parse.activity.start (old endpoint never logged). → ruling: keep.
- Bot stores EventInputs stamped at preview time, not at Accept (stampAll did) → close accepted hours later recorded at preview time.
- Dropped "queued writes nothing before drain" assertion (parse.int.test.ts).
- type Request in parse-routes.ts shadows the global Fetch Request.
