# Task 13 — Part F (bot): free text → classify → proposals → confirm

Builds on Task 11 (`POST /api/parse`-equivalent internals: the same parse function with `domain: "auto"`, `CLASSIFY_CONFIDENT`,
`Proposal`, `planProposal`). Owner's words: see Task 11 brief (.superpowers/sdd/…/task-11-brief.md) — read it.

Today: apps/api/src/bot/preview.ts (`preview`: prompt → runParse → verifyParse → planParse → stored plan → preview message
with Accept / To Inbox / Cancel buttons, callback prefixes a:/i:/c:), describe.ts (texts), choosePreview (applies via
UserStore.apply with source "bot"), the unavailable/queued path.

## Flow
1. Free text → parse with `domain: "auto"`.
2. If `confidence < CLASSIFY_CONFIDENT`: reply "I read this as a task." / "…as an activity." (RU too) with buttons [Task]
   [Activity] (the read one marked ✓); pressing one re-parses with that domain (or reuses the proposals if the pressed one
   equals the read one) and continues to 3. If confident, go to 3 directly.
3. Show the proposals as one message: each proposal described like the app's cards (describe.ts: "New task «…» · Homework ·
   due Fri 18:00", "Change «X»: due Thu → Fri", "Delete «X»", "Log 7:30–8:30 «…» · Chores", "Start «…»"), with [Accept]
   [Cancel] (and [To Inbox] only when the domain is task and there is a create). Accept applies all proposals in order with
   `planProposal` + UserStore.apply (source "bot"); the message is edited to the result ("Done: …" or the error).
4. Unavailable → the rules fallback for the classified domain (no classifier without a model: default to task unless the
   text matches the activity span reader → activity), same confirm step; queued/defer path as today.
Store the pending state (proposals, domain, text) under the existing `store.remember(id)` mechanism; callback data stays within
Telegram's 64-byte limit.

## Tests
API int (bot tests with stubbed Telegram fetch, fake LLM): confident task create → one message with Accept; low confidence →
the classify picker; picking Activity → activity proposals; Accept on an update/delete applies the events (check the store);
Cancel; unavailable fallback. Remove tests of the old intents. `bun lint`, `bun test:api` (and unit) green.

## Owner's framing (2026-10-14, overrides the wording above)
«давай об предложениях мыслить как о том что ассистент и так хотел сделать но мы просто апруваем его действие».
These are not suggestions: they are the actions the assistant is about to take, held for one approval. Copy speaks
in that voice — "The assistant will create «X»", "…will move «X» to Friday", "…will delete «X»", "…will log 7:30–8:30
Военкомат" — with [Approve] (Enter) and [Cancel]; nothing says "suggested" or "proposal". In code, rename the
domain term `proposal` → `action` (pending assistant action) across core, API, client, app and bot in Task 12
(one sweep, no aliases left behind); Task 13 uses the new names.

## Follow-up on pending actions (owner, 2026-10-14)
While an approval message is pending, any text the person sends (or a reply to that message) is a follow-up: the bot
asks again with the thread (Task 12's `thread` on `/api/parse`: original text, actions shown, follow-ups), edits the
approval message to the revised actions and keeps [Approve] [Cancel]. A new unrelated message after Cancel or Approve
starts fresh. If several approvals are pending, a reply targets its message; plain text targets the latest one.
