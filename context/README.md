# Context for new sessions

Background for anyone (person or agent) picking up Pace without the chats it was built in.
Nothing in the code reads this folder; delete it whenever it stops being useful.

| File | What it is |
|---|---|
| [requirements.md](requirements.md) | The product spec («Трекер задач и времени — требования», Russian), exported verbatim from the Claude Doc it was written in (https://claude.ai/artifact/4y4q2oqUsEboRLHaUKr1eN). It was written from the user's original long brief, which itself is not preserved verbatim. |
| [stack.md](stack.md) | The spec's «Стек» tab, verbatim. Several picks were replaced during the build: own push/pull sync instead of LiveStore, grammY instead of GramIO, no Turborepo, IndexedDB instead of SQLite WASM on the web, `createMcpHandler` instead of `McpAgent`. The reasons are in `plan.md` (Decisions). |
| [plan.md](plan.md) | The working implementation plan: stage 6 on top, then stage 5, then as it stood at the end of stage 4: decisions taken with the user (Decisions table, "Spec open questions, decided here"), the user's feedback per stage, the stage plans (1, 2, 3, 3b, 4) and milestone notes. Where it and the spec differ, the plan reflects what the user decided later. |
| [feedback-2.md](feedback-2.md) | The user's second feedback document (2026-10-10), verbatim as text with the screenshots described, plus the scenario coverage table written while planning stage 6. |
| [user-messages.md](user-messages.md) | The user's requests and decisions during the build, in order: verbatim where the chat kept them, from session summaries where it was compacted. |

State at the time of writing (2026-10-08): stages 0–4 merged and deployed; releases up to
`v0.5.0` (APKs on GitHub Releases). Still `v0.x` on purpose ("still not a finished product");
no real signing keystore yet. Working agreements: see `CLAUDE.md`, plus from the chats —
plans are written but not sent for approval, one thread without subagents, PRs merged with a
merge commit and released by dispatching `release.yml` with a `tag` (tag pushes from sessions
are refused), never paste the Telegram bot token, no model ids in commits or PRs.
