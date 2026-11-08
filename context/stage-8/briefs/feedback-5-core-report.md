# Feedback round 5: core report (items 1–5, 9, 10)

Branch `fb5-core`. Brief: [`feedback-5-brief.md`](feedback-5-brief.md). Items 6–8 (front: links,
drafts, clickable description links) belong to the other branch and are not touched here.

## 1. Recurrence `firstNumber`
- **Changed.** `recurrence.firstNumber` (whole number, optional, default 1) in the preset schema
  and model. The generator (`hw-instances.ts`) titles an instance
  `<preset name> <firstNumber + instances of the preset already in the store>`; closed instances
  count, a revoked one does not. That is "first number + index in issue order" for a fresh preset.
- **Deviation.** The existing generator counted the instances in the store (last + 1); the brief's
  open point said to keep that rule and document it, which is what was done: the number is
  `firstNumber + count`, so changing `firstNumber` later moves the numbers of instances still to come
  (written in the tool description).
- **Open.** The app's preset editor does not show `firstNumber` (MCP only, as the brief scopes it);
  editing the schedule in the app keeps it (the form spreads the recurrence).

## 2. Weekday names
- **Changed.** Weekdays accept `1..7` or `"mon".."sun"` and full English names, any case; stored as
  the number (MCP writes the parsed definition, so older clients read numbers). The
  `create_preset` / `update_preset` descriptions list which number is which day.

## 3. `preset/invalid-definition` names the key
- **Changed.** The MCP refusal text carries `key.path: reason` for every zod issue
  (e.g. `recurrence.due.weekday: …`).

## 4. Retroactive issue documented
- **Changed.** The tool descriptions say that a preset created (or given its recurrence) after this
  week's issue moment issues this week's instance at once (unless its deadline already passed;
  then next week's waits under "In future").

## 5. `get_task` returns the whole task
- **Changed.** The structured answer is the whole projection plus the row (`startAt`, `startTz`,
  `estimateMinutes`, series, sources, fields, status history, `submittedAt` of old logs, …). The
  task's own importance is `ownImportance` (the row's `importance` is the effective one). The text
  answer carries the same fields as JSON, so a client that reads only text sees them.
  `TASK_FIELDS` is typed `satisfies Record<Exclude<keyof Task, …>>`: a new `Task` field fails tsc
  until it is answered. Bug-lessons class 138.
- **Deviation.** `submitPreview` left the answer with item 10.

## 9. No automatic close after the deadline
- **Changed.** `autoOutcomeEvents` no longer makes `cancelled_missed`; a task past its final
  deadline stays open and overdue, and "To sort" asks about it (`deadline-passed`). The automatic
  `skipped` of an empty homework instance stays. Old `auto:<task>:missed` closures still
  materialize, show the confirm/undo review item and reopen as before. The digest's memory now
  forgets a reported task once its deadline passed (it relied on the close to forget it).

## 10. One done mark per subtask
- **Model.** `Subtask` has `doneAt` instead of `solvedAt` / `submittedAt`. No event was rewritten:
  `task.subtask.solved` is the done mark (stamped at the action's instant); an old per-subtask
  `task.submitted` marks its subtasks done unless they already were, so either mark reads as done
  at the earlier time (events fold in time order). A whole `task.submitted` still stamps the task
  and `closes` still closes. `doneCount` replaces `solvedCount` / `submittedCount` /
  `unsubmittedSubtasks`; `SubmitPreview` is gone from `taskView`.
- **Outcome.** A per-subtask task closed as done is late when a done subtask was done after the
  deadline; with none done it goes by the closing instant.
- **Retro rules.** `subtask/submitted` is gone (a done subtask can be removed; History brings it
  back). `task.submitted` from an older client is still validated (`retro/nothing-to-submit` when it
  names subtasks not done).
- **Review.** The "submitted?" item is now `all-done` ("Everything done for a day — close it?")
  with `mark-done` / `keep-open`; `submit-now` is gone.
- **DO projections.** `subtasks.done_at` is added (migration `0006_sharp_vermin`, expand only);
  `solved_at` / `submitted_at` stay in the schema, no longer written, so a rollback still finds
  them (`db:check` refuses a drop in the release that stops using a column). **Open:** a later
  release drops them with a `-- contract:` migration. The rows are rewritten on the first cold
  start after deploy (the projection mark carries the newest migration), so `done_at` is filled
  from the log.
- **Client.** `markDone` / `unmarkDone` replace `markSolved` / `unmarkSolved`. Taking a mark back
  writes only corrections: every `task.subtask.solved` of the subtask is revoked, and an old
  per-subtask `task.submitted` that names it is amended to leave it out (revoked when it named only
  this one); before, revoking the solve alone left a subtask the old log had sent still done (found
  by the task-screen test); `submit` and
  `submitLabel` are gone; `primaryAction` is `done` or `none`; meta reads "4/7 done"
  (late: "N subtasks left"); the export's subtasks sheet has `doneAt`.
- **App.** The footer's primary is always Done; the close sheet has Done / Cancelled / Skipped (no
  submit mode); a row's check closes every task (no submit sheet first); the checklist shows
  "done <weekday> <time>" per subtask and "N/M done" in its header, a done subtask can be unmarked;
  the task form's kept subtasks show "Done" and can be removed.
- **MCP.** `submit` is gone; `mark_subtasks` marks done (`done` / `alreadyDone`), its description
  says the mark is recorded at `at`; rows carry `done` instead of `solved` / `submitted`;
  `review_action` lost `submit-now`; `search`/`fetch` text shows "done <instant>".
- **Telegram / LLM.** The parse prompt says `task.markSubtasks` marks done and that solved,
  submitted, sent and handed in all mean done; the fake model takes "done in <title>: …" (and the
  old "solved in").
- **i18n.** Dead keys removed (EN and RU): `meta.solved`, `meta.sent`, `task.subtaskSent`,
  `task.subtaskSolved`, `task.subtaskSentLabel`, `task.markSolved`, `task.unmarkSolved`,
  `task.submitSubtasks`, `close.submit*`, `close.subtitleSolved`, `close.whenSubmitted`,
  `close.stillOpen`, `review.action.submit-now`, `actionError.subtask/submitted`. New:
  `meta.done`, `task.subtaskDoneAt`, `task.subtaskDoneLabel`, `review.kind.all-done`.
- **Docs.** `docs/mcp.md`, `docs/presets.md`, `docs/qa.md` updated.
- **e2e (edited, not run).** `e2e/tooltips.e2e.ts` (the primary is "Готово" only),
  `e2e/worst-case.e2e.ts` (F-DAT-01 comment). `e2e/support/seed.ts` keeps its old
  `task.submitted` and `task.subtask.solved` events on purpose: they are old-log coverage.
- **Open.** The preset field `submission` (`whole` / `per_subtask`) still exists and still decides
  how lateness is judged; its tag on the task screen reads "Per-subtask submission" /
  «Сдача по подзадачам». Renaming or dropping it is a product question left for the owner.
  The event type keeps its name `task.subtask.solved` (events are never rewritten); its History
  label reads "Subtask done".

## Commits (fb5-core, not pushed)
- `cb50931` feat(presets): recurrence firstNumber, weekday names, refusals that name the key (1–4)
- `2056e5c` feat(outcomes): no automatic close after the deadline (9)
- `b1b8629` feat(subtasks): one done mark per subtask; get_task answers the whole task (10, 5)

## Checks
`bun lint` clean (31 warnings, the ratchet baseline; `DESIGN_VALUE_WARNINGS` lowered to 23).
`bun test:unit`: scripts 173 pass, core 887 pass, client 545 pass, pace-agent 54 OK.
`bun test:api`: 64 files, 634 tests pass. `bun test:app`: 174 suites, 1237 tests pass.
e2e not run (ports used by another session).

## Not done here
- The review through `superpowers:requesting-code-review` and the specialist reviewers was not
  run from this session (no agent tool available to it): run it on `2056e5c^..b1b8629` before the
  merge, with "trace the client side" for the removed `submit` route of MCP and the unmark
  corrections.
- MCP `revoke_event` on a solve of a subtask an old log also sent leaves it done (the send still
  marks it); the app's unmark handles both, MCP has no unmark tool.
