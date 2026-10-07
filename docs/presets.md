# Presets

A task in Pace is always the same thing: a title, optional subtasks, a deadline, an
estimate, a status. A **preset** is the profile that says how a kind of task behaves:
how its urgency grows, what happens when the deadline passes, whether it is submitted as a
whole or subtask by subtask, how progress is tracked, whether a new instance appears every
week, which extra fields the form shows, and when notifications fire.

Presets are data, not code. They live in the event log (`preset.created`,
`preset.updated`, `preset.archived`), so they sync to every device like tasks do. You edit
them in the web app under **Settings → Presets**; the Android app and the MCP tools read
them from the synced state.

## How a preset is built

- Five **base presets** are built in: `hw`, `work`, `personal`, `deferred`, `inbox`. They
  are complete (every field has a value) and cannot be edited, renamed or archived.
- A **user preset** extends a base preset or another user preset and stores only the
  fields it changes. "Algebra HW" extends `hw` and adds a schedule and a resubmission
  policy; everything else comes from `hw`.
- A **task** carries a preset id and, optionally, its own **overrides**: the same fields,
  applied on top of the preset chain for that one task.

Resolution walks the chain from the base preset down to the task:

```
base preset  →  user preset  →  …  →  child preset  →  task overrides
```

The later value wins. `fields` and `notify` are merged key by key, so a child that sets
`notify.criticalHours` keeps the parent's other thresholds. `recurrence` is replaced as a
whole; a child may set it to `null` to switch off an inherited schedule.

Rules the editor enforces:

- The id is a lowercase slug of letters, digits, `.` and `-` (`hw.algebra`, `work-ops`),
  1–64 characters, unique, and never one of the base ids.
- Every user preset must extend something; the chain must end at a base preset, must not
  contain the preset itself, and must not loop.
- The definition must pass the schema: unknown keys are rejected, so a typo cannot
  silently become an ignored setting.
- Changing a preset changes every task that uses it, except the fields a task overrides.
- Switching a task to another preset keeps its data; fields are just shown or hidden.
- Archiving hides a preset from the pickers. Tasks that use it keep resolving. To bring
  it back, revoke the archive event from History.

## Fields

Every field is optional in a user preset (it inherits what it does not set). The default
column is the value of the base preset `hw`; the base presets table below lists where the
others differ.

| Field | Values | Meaning | Default (`hw`) |
|---|---|---|---|
| `urgencyPolicy` | `pace`, `lag`, `age`, `resubmission` | How urgency grows. `pace`: work left over time left, for things with a real deadline. `lag`: how far you are behind an even pace between start and due; without a due date it behaves like `age`. `age`: slowly saturating with the days since creation, for things that have no deadline. `resubmission`: `pace` until the deadline, then the resubmission curve of the deadline policy. | `pace` |
| `defaultImportance` | `asap`, `prioritized`, `normal`, `nice_to_have` | Importance a new task starts with (multipliers 7 / 5 / 3 / 1 on the score). | `normal` |
| `deadlinePolicy` | `{ kind: "hard" }` or `{ kind: "resubmission", softDays, finalAt, finalTz }` | **Hard**: when the deadline passes the task is closed as *cancelled (missed)* and you are asked to confirm. **Resubmission**: late work is still welcome; the soft target is `softDays` after the deadline, urgency keeps growing after it, and `finalAt` (an instant in the zone `finalTz`, or `null` for none) is the hard end. | `hard` |
| `submission` | `whole`, `per_subtask` | **Whole**: one Done/Submit for the task. **Per subtask**: each subtask is *solved* and then *submitted*; "Submit" sends every solved, unsent subtask at once, and the submission time decides whether it was on time. | `per_subtask` |
| `progressMode` | `subtasks`, `slider`, `none` | What progress means: the share of subtasks solved, a 0–10 slider, or nothing. | `subtasks` |
| `recurrence` | `{ issued: { weekday, time }, due: { weekday, time }, tz }` or `null` | Weekly homework rhythm. `weekday` is ISO (1 = Monday … 7 = Sunday), `time` is `HH:MM` on the wall clock of `tz` (an IANA zone such as `Europe/Moscow`). An instance is created for every ISO week; its deadline is the due slot in the same week when that slot is later than the issued slot, otherwise in the following week (Thursday 09:00 → Thursday 09:00 means a week later). An instance that never receives an assignment is closed as *skipped* 24 h after its deadline. | `null` |
| `fields.ticket` | `true` / `false` | Show a ticket / reference field. | `false` |
| `fields.description` | `true` / `false` | Show a free-text description. | `true` |
| `fields.startAt` | `true` / `false` | Show a start date; a task whose start is in the future is hidden from Now until then. | `false` |
| `fields.submitVia` | `true` / `false` | Show "where to submit". | `false` |
| `notify.criticalHours` | hours ≥ 0 | A task is *critical* when less than this many hours remain to its deadline … | `12` |
| `notify.criticalProgress` | 0–1 | … and its progress is below this share. | `0.5` |
| `notify.criticalScore` | ≥ 0 | Also critical when its score first crosses this value. | `10` |
| `notify.waitingDays` | days ≥ 0 | A task *waiting* longer than this is reported as stuck. | `7` |
| `notify.inProgressIdleDays` | days ≥ 0 | A task *in progress* with no activity for this long is reported as stuck. | `5` |
| `defaultEstimateMinutes` | minutes ≥ 0 | Estimate for a task created without one. | `60` |
| `color` | `blue`, `violet`, `green`, `amber`, `coral`, `pink`, `teal`, `slate` | Accent used for the preset's tasks when they have no project colour. | `blue` |

Critical and stuck notifications are sent at most once per task; retroactive edits never
trigger them.

## Base presets

| | `hw` | `work` | `personal` | `deferred` | `inbox` |
|---|---|---|---|---|---|
| Name | Homework | Work | Personal | Deferred | Inbox |
| `urgencyPolicy` | `pace` | `lag` | `age` | `age` | `age` |
| `defaultImportance` | `normal` | `normal` | `normal` | `nice_to_have` | `nice_to_have` |
| `deadlinePolicy` | hard | hard | hard | hard | hard |
| `submission` | `per_subtask` | `whole` | `whole` | `whole` | `whole` |
| `progressMode` | `subtasks` | `slider` | `subtasks` | `none` | `none` |
| `recurrence` | `null` | `null` | `null` | `null` | `null` |
| `fields` | description | ticket, description, startAt | — | startAt | — |
| `notify.criticalHours` | 12 | 24 | 24 | 24 | 24 |
| `notify.criticalProgress` | 0.5 | 0.5 | 0.5 | 0.5 | 0.5 |
| `notify.criticalScore` | 10 | 10 | 10 | 10 | 10 |
| `notify.waitingDays` | 7 | 7 | 7 | 7 | 7 |
| `notify.inProgressIdleDays` | 5 | 5 | 5 | 5 | 5 |
| `defaultEstimateMinutes` | 60 | 120 | 30 | 15 | 15 |
| `color` | blue | violet | green | slate | amber |

What they are for:

- **`hw`** — a course's weekly homework: subtasks are the problem numbers, each is solved
  and then submitted. Course presets extend it with a schedule (see below).
- **`work`** — a ticket with a start, an optional due date and a 0–10 slider; urgency is how
  far behind an even pace you are.
- **`personal`** — errands and small projects with an optional checklist.
- **`deferred`** — "check the exam grade on the 20th": a start date in the future keeps it
  out of the way until then.
- **`inbox`** — quick capture without any fields; the inbox review turns it into a real
  task with a proper preset.

## Example course presets

On first login the web app offers **Start from example course presets**. It creates three
user presets extending `hw`; their ids are fixed, so applying the seed again creates
nothing. Edit or archive them freely.

| | `hw.algebra` | `hw.calculus` | `hw.history` |
|---|---|---|---|
| Name | Algebra HW | Calculus HW | History HW |
| Issued | Monday 10:00 | Tuesday 12:00 | Thursday 09:00 |
| Due | Wednesday 23:59, same week | Monday 23:59, next week | Thursday 09:00, next week |
| Zone | Europe/Moscow | Europe/Moscow | Europe/Moscow |
| `urgencyPolicy` | `resubmission` | `pace` (inherited) | `pace` (inherited) |
| `deadlinePolicy` | resubmission, soft target 7 days after the deadline, no final date yet | hard (inherited) | hard (inherited) |
| `defaultImportance` | `normal` (inherited) | `normal` (inherited) | `nice_to_have` |

Everything not listed (per-subtask submission, subtasks as progress, the description
field, 60-minute estimate, 12-hour critical window, blue) comes from `hw`.

## Overrides on a task

Any preset field can be overridden on a single task from the task page (deadline policy,
importance, estimate, urgency policy, …). Overrides use the same shape as a preset
definition and are validated by the same schema; they are applied after the whole preset
chain, so they win over the preset and survive later preset edits. Clearing an override
returns the task to whatever the preset chain says.

## For developers

Everything lives in `packages/core/src/presets/` and is exported from `@pace/core`:

- `model/preset.ts` — the types (`Preset`, `PresetDefinition`, `ResolvedPreset`, …).
- `preset-schema.ts` — `PresetDefinitionSchema` (strict), `PresetIdSchema`,
  `parsePresetDefinition`.
- `base-presets.ts` — `BASE_PRESETS`, `BASE_PRESET_IDS`, `isBuiltInPreset`.
- `preset-reducer.ts` — `presetReducer` over the preset events, `INITIAL_PRESETS_STATE`,
  `presetById`. Events that would break an invariant (duplicate or built-in id, invalid
  definition, non-slug id) are ignored, which is what makes the seed idempotent.
- `resolve-preset.ts` — `resolvePreset(state, presetId, overrides?)` →
  `Result<ResolvedPreset, "preset/unknown" | "preset/unknown-parent" | "preset/cycle" |
  "preset/invalid-overrides">`, `presetChain` for the editor's inherited placeholders,
  `validatePresetInput` with the editor's error codes.
- `recurrence.ts` — `dueWeekOffset(recurrence)`: 0 when the due slot is in the issued
  week, 1 when it is in the following week.
- `example-presets.ts` — `exampleCoursePresetEvents(now)` and `EXAMPLE_PRESET_IDS`.
