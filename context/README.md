# Context for new sessions

Background for anyone (person or agent) picking up Pace without the chats it was built in.
Nothing in the code reads this folder; delete it whenever it stops being useful.

| File | What it is |
|---|---|
| [requirements.md](requirements.md) | The product spec («Трекер задач и времени — требования», Russian), exported verbatim from the Claude Doc it was written in (https://claude.ai/artifact/4y4q2oqUsEboRLHaUKr1eN). It was written from the user's original long brief, which itself is not preserved verbatim. |
| [stack.md](stack.md) | The spec's «Стек» tab, verbatim. Several picks were replaced during the build: own push/pull sync instead of LiveStore, grammY instead of GramIO, no Turborepo, IndexedDB instead of SQLite WASM on the web, `createMcpHandler` instead of `McpAgent`. The reasons are in `plan.md` (Decisions). |
| [plan.md](plan.md) | The working implementation plan: stage 8 on top, then stages 7, 6 and 5, then as it stood at the end of stage 4: decisions taken with the user (Decisions table, "Spec open questions, decided here"), the user's feedback per stage, the stage plans (1, 2, 3, 3b, 4) and milestone notes. Where it and the spec differ, the plan reflects what the user decided later. |
| [feedback-2.md](feedback-2.md) | The user's second feedback document (2026-10-10), verbatim as text with the screenshots described, plus the scenario coverage table written while planning stage 6. |
| [stage-8/](stage-8/README.md) | Stage 8 (feedback round 4): the plan, the controller's ledger, the task briefs and where the work paused (three PRs). |
| [feedback-3.md](feedback-3.md) | The user's third feedback document (2026-10-11), verbatim as text with the screenshots described. |
| [feedback-4.md](feedback-4.md) | The user's fourth feedback document (2026-10-13), verbatim as text with the screenshots described, plus the extra screenshot sent after it. |
| [bug-lessons.md](bug-lessons.md) | Every bug with why the tests missed it, its class, the sweep and the guard added; the standing rules per class (owner's request, 2026-10-14). |
| [qa-optimisation-analysis.md](qa-optimisation-analysis.md) | How the 45 medium-or-worse findings of QA rounds 10–20 were found, and which cuts to a QA round the history shows are safe (2026-11-02): the mechanical matrix moved into `e2e/route-sweep.e2e.ts`, intermediate rounds scoped to the changes plus an always-on set, a full round before each release ([docs/qa.md](../docs/qa.md)). |
| [android-e2e-plan.md](android-e2e-plan.md) | To do: Android end-to-end flows (Maestro) on an emulator in GitHub Actions — a brief for a new session (owner, 2026-11-01). |
| [cold-storage-plan.md](cold-storage-plan.md) | To do: hot 30 days (checkpoint + tail) in the Durable Object, older events and raw usage archived to R2 — measure first; a brief for a new session (owner, 2026-11-01). |
| [firebase-from-server-plan.md](firebase-from-server-plan.md) | To do: no Firebase keys in the APK; the app reads them from `GET /api/instance` and restarts when the server changes, so a self-hosted server gets push without its own build; a brief for a new session (owner, 2026-11-02). |
| [telegram-oidc-plan.md](telegram-oidc-plan.md) | Not planned (2026-11-02: OIDC confirmations need the official client's push or deep-link handling, which the owner's third-party clients lack; checked in client sources). Research and a design kept for the day the legacy widget is switched off: sign in through Telegram's OpenID Connect (code + PKCE, a JWT `id_token`, bot access) instead of the archived Login Widget and the bot deep link; research notes and a design that keeps one APK for every self-hosted bot; a brief for a new session (owner, 2026-11-02). |
| [ota-updates-plan.md](ota-updates-plan.md) | To do: over-the-air JS updates for the Android app (runtime-version guard, code signing, channels, rollback; EAS Update or a self-hosted Expo Updates server on R2); a brief for a new session (owner, 2026-11-02). |
| [infra-portability-plan.md](infra-portability-plan.md) | To do: infrastructure behind ports (user-store host, scheduler, live channel, databases, KV, request place, assets) with Cloudflare adapters and a dependency-cruiser rule, so a move off Cloudflare is adapters, not a rewrite; survey of today's coupling; a brief for a new session (owner, 2026-11-02). |
| [technical-roadmap.md](technical-roadmap.md) and [technical-execution/](technical-execution/HANDOFF.md) | The technical continuation (PR #55, rebased onto PR #54): the roadmap (Russian), then `HANDOFF.md`, the one current status (what is delivered behind defaults that stay off, what is deferred), the plans and design notes behind the code, and `archive/` with the per-task reports, reviews and ledgers (historical). |
| [pr48-followups.md](pr48-followups.md) | To do after PR #48 (scope frozen at round 7): QA round 21's mediums and lows, the round-7 review's mediums, implementers' leftovers, owner actions and the carried-over list (2026-11-02). |
| [user-messages.md](user-messages.md) | The user's requests and decisions during the build, in order: verbatim where the chat kept them, from session summaries where it was compacted. |

State at the time of writing (2026-10-08): stages 0–4 merged and deployed; releases up to
`v0.5.0` (APKs on GitHub Releases). Still `v0.x` on purpose ("still not a finished product");
no real signing keystore yet. Working agreements: see `CLAUDE.md`, plus from the chats —
plans are written but not sent for approval, one thread without subagents, PRs merged with a
merge commit and released by dispatching `release.yml` with a `tag` (tag pushes from sessions
are refused), never paste the Telegram bot token, no model ids in commits or PRs.
