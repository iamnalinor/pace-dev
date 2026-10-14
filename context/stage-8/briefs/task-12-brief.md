# Task 12 — Part F (app): proposal cards in Now's composer and Day's bar

Builds on Task 11 (`POST /api/parse` with `domain`, `Proposal` union and `planProposal` in packages/core/src/proposals) and
Task 4 (the composer line + the form in the right pane on a computer, header text from one helper) and Task 6 (the bar on Day).
Owner's words: see Task 11 brief (.superpowers/sdd/…/task-11-brief.md, "Owner's words") — read it.

## Now's composer (domain "task")
- Enter on the line → the assistant (packages/client/src/assistant.ts; add `propose(text, domain)`), showing the busy state
  on the Send button. The answer's proposals are shown where the form shows today (right pane on ≥1024, in place on a phone):
  - one `task.create` → the editable form (as today), header "Suggested by the assistant: new task" / RU "Ассистент
    предлагает: новая задача";
  - `task.update` → a card "Change «Title»" listing each changed field as `old → new` (strikethrough old), Apply / Dismiss;
  - `task.delete` → a card "Delete «Title»?" (warn colour) with Delete / Dismiss;
  - `task.close`, `task.addSubtasks`, `task.markSubtasks` → cards in the same style ("Mark «X» done", "Add 3 subtasks to
    «X»"…);
  - several proposals → a stacked list of cards with "Apply all" (Enter) and per-card Apply/Dismiss.
  Opened by hand (+ / N) the form's header stays "New task". Enter / ⌘↵ applies, Esc dismisses. Apply runs `planProposal`
  through the client actions (add a `applyProposal(proposal)` action in packages/client/src/actions that validates and emits;
  Result-based, like other actions), shows a toast with Undo where other actions do.
- `unavailable` → the rules reading as a `task.create` form with the existing "assistant unavailable" line. `queued` (defer)
  as today.
- Remove the old "always a create form" path (`parseToQuickInput` / ai-reading view-model) once replaced.

## Day's bar (domain "activity")
- Enter in "What are you doing?" → the assistant first (busy state on ▶); the proposal shows as a card right above the bar
  (both phone and computer): "Start «label» · Category · ~30m" / "Log 7:30–8:30 «Военкомат» · Chores" / "Change «X»: 10:00 →
  10:30" / "Delete «X»?"; Enter or the card's primary button applies, Esc dismisses, the text stays in the field until
  applied. `unavailable` → the rules reading (Task 11's typed.ts spans) in the same card.
- The previous "start immediately, refine in the background" flow and its dashed draft tag go away (the confirmation replaces
  them) — remove dead code (`refineActivity`, `reading` set, DraftTag, `time.draft`) if nothing else uses it.

## Tests
Client: applyProposal for each kind emits the planned events; a refused plan returns the error. App (jest-expo, fake API):
composer shows each card kind and applies it; Day bar shows the start/log card and applies; Esc dismisses; manual form header.
e2e (fake LLM): composer → an update proposal applied changes the task; Day bar "7:30 - 8:30 - ходил в военкомат" → logged
span appears in the Day list. `bun lint`, `bun test:unit`, `bun test:app` green; touched e2e specs pass. Screenshots (desktop +
phone, light + dark) of each card kind into /tmp/claude-0/-home-user-pace-dev/cb223545-7465-5720-b7e6-b3fd375d3413/scratchpad/task12/.
