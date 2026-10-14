# Task 11 — Part F (core + API): the assistant proposes creates, edits and deletes

Owner's words: «Кастомным вводом хотим не только создавать текущие активности но и трекать что-то старое. Т.е. ввод в первую
очередь под сообщение ллмке, и она дальше решает что создать. UI под это нужно адаптировать. Т.е. ллмка может предложить
создать новую таску, может предложить отредактировать, может предложить удалить какую-то таску. Аналогично должен работать
ввод через тг-бота свободным текстом, тоже с последующим подтверждением. Такая идея работает и на вводе тасок, и на вводе в
активности. В UI у нас два разных поля для разных вводов. В тг боте поле одно, поэтому там нужно добавить доп этап
классификации – мы смотрим, хочет ли пользователь затрекать таску или активность. Если нет 100% уверенности, показываем, как
классифицировали запрос и даем пикер». Example input in the activity field: «7:30 - 8:30 - ходил в военкомат.»

Today: task parse `POST /api/parse` (packages/core/src/parse/schema.ts PARSE_INTENTS create_task|add_to_task|mark_subtasks|
close_task|unknown, ParseResultSchema; core/parse/apply.ts planParse; verifyParse; apps/api/src/shared/llm/prompt.ts,
providers.ts, llm.ts runStructured with Groq/Gemini fallback; apps/api/src/parse/parse-routes.ts), activity parse
`POST /api/parse/activity` (ActivityReadingSchema {label, category, expectMinutes}; activity-prompt.ts), the fake LLM
(`LLM_PROVIDER=fake`) used in tests and e2e, LLM regression fixtures (`bun test:llm`, packages/core test:llm), the deferred
parse queue (apps/api/src/user-store/parse-queue.ts).

This task builds the shared model and the API. The app UI (Task 12) and the bot (Task 13) come next — keep their current
behaviour compiling: adapt their call sites minimally (e.g. map the new answer into what they use today) and leave TODO-free
code (no TODO comments; Task 12/13 will rework them).

## Core: packages/core/src/proposals/
A proposal is a discriminated union (zod), each with a short human summary field produced by code (not the LLM) for display:
- `task.create { task: TaskDraft }` (TaskDraft = today's create form fields: title, category/preset, project, importance,
  due date/time, estimate, subtasks, description, link)
- `task.update { taskId, patch: Partial<editable task fields> }` (title, description, due, importance, project, preset,
  estimate, link, subtasks add/remove/rename)
- `task.delete { taskId }` (implemented as `event.revoked` of the task's `task.created`, exactly as the app's trash button
  does — find that action and reuse its event shape)
- `task.close { taskId, outcome: done|cancelled|skipped }`
- `task.addSubtasks { taskId, subtasks[] }` and `task.markSubtasks { taskId, subtaskIds[] }` (what add_to_task /
  mark_subtasks did)
- `activity.start { category, label, expectMinutes? }` (now)
- `activity.log { start, end, category, label }` (a past span; `activity.logged`)
- `activity.update { activityId, patch: { start?, end?, category?, label? } }`
- `activity.delete { activityId }` (revoke)
`planProposal(state, proposal, ctx)` → `Result<EventInput[], ProposalError>` using the existing validators (core's
validateEventInput / retro rules); unknown ids → `proposal/unknown-task` / `proposal/unknown-activity`.
Replace PARSE_INTENTS + planParse with this (delete the old intent code once callers move; breaking is fine).

## API
- `POST /api/parse { text, domain: "task" | "activity" | "auto", defer?, draft? }` → `{ status: parsed|unavailable|queued,
  domain: "task"|"activity", confidence: number 0..1, proposals: Proposal[], questions?: string[] }`. Remove
  `/api/parse/activity` (merged).
- The LLM output schema (what the model returns) is separate from Proposal: model-facing JSON with ids referencing the
  context lists, converted and verified in code (verifyParse extended: every referenced task/activity id exists in the
  context given to the model; times parse; a `task.delete`/`activity.delete` must quote the item's title). Keep the prompt
  under the existing token budget (prompt.ts: 3k tokens).
- Context given to the model: categories/presets, projects, up to 40 open tasks with short ids (index-based aliases mapped
  back in code, so the model never sees ULIDs), today's and yesterday's activities with aliases, now + zone. For `auto`, the
  model first classifies domain with a confidence; the API returns it (the bot shows a picker under a threshold — define
  `CLASSIFY_CONFIDENT = 0.8` in core).
- Rules fallback when no model is available (`unavailable`): task domain → today's rules parse as a `task.create`; activity
  domain → extend core/tracking/typed.ts to read a time span ("7:30 - 8:30 - text", "с 7:30 до 8:30 text", "7:30-8:30 text",
  "20 мин text") → `activity.log` for a span in the past, else `activity.start`.
- The fake LLM: extend it so tests and e2e can produce each proposal kind deterministically (look at how it is keyed today).
- The deferred parse queue keeps working with the new answer shape (it applies only creates automatically? — keep its current
  behaviour: what it auto-applied before stays auto-applied; anything else goes to the Inbox as before).
- LLM regression fixtures (`bun test:llm` — needs real keys, will not run here): update the fixture format and add cases for
  update, delete, close, activity.log with a past span, and auto classification; make sure the fixture files typecheck.

## Tests (TDD)
Core: planProposal for every kind (happy + unknown id + invalid patch), the typed.ts span reader (RU/EN formats), model-output
→ proposals conversion with aliases, verify rules. API int: /api/parse with the fake LLM returns each kind; auto
classification; unavailable fallback for both domains; queued/defer still works. `bun lint`, `bun test:unit`,
`bun test:api`, `bun test:app` green (adapt app call sites minimally so it compiles and current app tests pass).
