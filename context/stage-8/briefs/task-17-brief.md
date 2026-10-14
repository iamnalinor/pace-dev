# Task 17 — docs: architecture.md and qa.md for stage 8

Read the commits of this branch (`git log --oneline origin/main..HEAD`, and the diffs where needed) and update:
1. docs/architecture.md: Auth and sessions (the unified sessions model: kinds, name/ip/country, GET/DELETE /api/sessions incl.
   MCP grants, login notices), the sync protocol (storeId and the client reset; observations removed), the Durable Object section
   (notifications table and notify(), the alarm: digest slots, sleep evaluation; STORE_EPOCH wipe), a short "Assistant proposals"
   section (Proposal kinds, planProposal, /api/parse with domain + classification, the bot's picker), the time bar on Day and the
   desktop agent (pointer to docs/desktop.md), navigation (Now · Day · Calendar · Inbox · More; sidebar order). Remove stale text
   (ActivityWatch bridge, update banner "Reload"/"Later", "Week").
2. docs/qa.md: add to the heuristics checklist (find it) these mandatory items, each with one line of why:
   - Every way into each form × submit (opened empty by hand, from the assistant, from a paste, from New task/N, edited): the
     action accepts exactly what the enabled button promises.
   - Every toast, tooltip and popup: where it lands and what it covers (never over controls, never far from its cause), and
     how soon it appears.
   - Every changed screen in both themes and at phone width (390 px) and desktop (1280 px), with Russian text.
   And note in the QA prompt section that the round must open every form both ways.
3. docs/testing.md: one line that the composer's canAdd is a single predicate and must be tested at the action level.
`bun lint` green. Commit "docs: stage 8 — sessions, notifications, proposals, the agent; QA checks every way into a form".
