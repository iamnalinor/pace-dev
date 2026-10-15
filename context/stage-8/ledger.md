# Stage 8 ledger (the controller's progress log; plan: context/stage-8/plan.md)

Spec: the owner's feedback document (context/feedback-4.md once written) + decisions in the plan. Plan Parts split into tasks:
T0 context docs (feedback-4.md, user-messages, plan.md stage 8 header)
T1 Part A bugs 1-4,6 (5 folds into T9)
T2 Part B accent split + icons + update card
T3 Part B navigation (order, Week->Calendar rename, phone tabs More, Inbox badge, Now counter removed, Telegram first name)
T4 Part B tooltip + composer simplification + desktop right-pane form + Subtasks rename/editor
T5 Part B Day list design, Back to today, Calendar fit/no-scroll + night toggle, Calendar split detail pane + more calendar info
T6 Part C time bar buttons + bar moves to Day + compact running row on Now (free-text proposals wait for T12)
T7 Part D data reset + storeId + dead pieces
T8 Part E notification pool + Deadline Digest + feed
T9 Part D sessions + login notice + Devices inline + Settings layout + MCP instructions
T10 Part D 2FA wipe/delete
T11 Part F core+API proposals
T12 Part F app UI (composer + Day bar) 
T13 Part F bot (classification + proposals)
T14 Part G sleep auto
T15 Part H desktop agent
T16 Part I release/deploy + README
T17 docs: architecture.md, qa.md
Then QA rounds (Sonnet) + final review.

## Preflight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T4 vs T12 | T4 composer form header ("New task"); T12 adds proposal headers | sequential, T12 builds on T4 form — ok |
| T6 vs T12 | T6 moves bar to Day with current rules start; T12 swaps to assistant-first proposals | ok, sequential |
| T7 vs T8/T9/T10 | T7 squashes DO migrations + storeId; T8/T9/T10 add tables/columns after | T8+ generate migrations on top of the squashed 0000 — ok |
| T8 vs T9 | T8 pool with kind login; T9 emits login notices | T9 consumes T8 API — ok |
| T3 vs T5 | T3 renames features/week -> features/calendar; T5 edits calendar screen | ok sequential |
| T2 vs T3/T4 | accent tokens consumed by later UI | ok |
| Plan omission | Calendar split detail pane + richer calendar info is in the feedback but not a plan Part | Ruling: added to T5 — the feedback (spec) asks for it explicitly — cost if wrong: one extra screen change |
| Plan: notify plan / Android local | T8 removes deadline crossings from Android plan, keeps timers | consistent with user answer "Two + keep the timers" |
Baseline: bun lint clean, test:unit green (core 469, client 200) at 4cf543f
Task 0: implemented 02f7255 (pushed); review dispatched (haiku)
Task 1: dispatched (sonnet), BASE 02f7255
Task 0: Ruling: the Co-Authored-By 'Claude Opus 5.5' trailer stands — it is the attribution the session's system reminder requires; the 'no model ids' rule is about model identifiers like claude-opus-5-5 — cost if wrong: trailer rewording on future commits
Task 0: minor (deferred): user-messages.md says 'small Python agent'; README plan row edited beyond brief (accurate)
Task 0: complete (commits 4cf543f..02f7255, review clean after ruling)
Task 1: implemented 02f7255..18d7acc (DONE_WITH_CONCERNS: N only focuses the line — T4 makes N open the form; toast tab-bar 72px constant); review dispatched (sonnet)
Task 1: minor (deferred): toast footer height is one global slot (split view: last mounted wins); TAB_BAR_HEIGHT=72 constant untested on Android; composer-actions never-refuses test message not per-draft; project counts include untouched hw instances / future-start tasks
Task 1: complete (commits 02f7255..18d7acc, review clean)
Task 2: dispatched (sonnet), BASE 18d7acc
Task 2: implemented 18d7acc..ef58020 (pushed); review dispatched (sonnet)
Task 2: Ruling: update card copy 'New version' + 'Refresh page' (shorter than briefed) accepted — owner asked for a narrow rectangle and kept only 'refresh page'; a wider card covered controls — cost if wrong: one string change
Task 2: minor (deferred): RU card + switch on-state not screenshot-checked; light lime fill low non-text contrast vs bg
Task 2: complete (commits 18d7acc..ef58020, review clean)
Task 3: dispatched (sonnet), BASE ef58020
Owner follow-up: update notice → top slide-down strip like olympagg.github.io, quiet blue → Task 3b (after Task 3, same layout files)
Task 3: implemented ef58020..a9a6b7d (pushed); review dispatched; Task 3b dispatched in parallel (different file: update banner)
Task 3: review: Important 1 (projects/insights/settings lost auth+onboarding guard when moved out of (tabs)); minors: name null until relogin (fallback to first word of name), nav.inboxWaiting in generic comps, back fallback, useNow in badge, e2e 'Week' wording. Fix round 1 queued after Task 3b finishes (same checkout)
Task 3b: implemented a9a6b7d..a2fea57 (pushed); review dispatched. Task 3: fix round 1 dispatched (resume implementer), FIX_BASE a2fea57
Task 3b: minor (deferred): notch inset jumps while strip grows; slide/reduced-motion untested; hover state via useState
Task 3b: complete (commits a9a6b7d..a2fea57, review clean)
Task 3: fix round 1 implemented a2fea57..e878d6b (pushed); scoped re-review dispatched
Task 4: dispatched (opus), BASE e878d6b
Task 3: fix round 1/5 (4 addressed, 1 new open — IMPORTANT: RouteGate in persistent root layout keeps stale useOnboarded=false → Android onboarding loop; minor: signed-out unknown URL → /login). Fix round 2 queued until Task 4 finishes (shared checkout)
PARALLEL (owner asked, max 2 tasks at once): UI track in main checkout (T4 → T3 fix2 → T5 → T6 → T12); server track in worktrees (T7 → T8 → T11 → T13 → T14 → T16); T9/T10/T15 when neighbours are done. Worktree branches are rebased/cherry-picked onto claude/new-session-sy3n4a by the controller when the main checkout is idle.
Task 7: dispatched (opus, worktree), base e878d6b + T4 in flight
PARALLEL up to 3 (owner): third track in a worktree: T15 → T16
Task 15: dispatched (opus, worktree)
Owner feedback: (a) Attend on the calendar reminder fails with retro/future → Task 3c (UI track, after T4); (b) calendar reminders join the pool as kind event_start, default Telegram, Attend/Skip on every channel, resolving one dismisses the others; Firebase push chosen by owner → Task 8b (after T8 + T9)
Owner: bug lessons rule → context/bug-lessons.md + CLAUDE.md rule (written; commit waits for T4 WIP — lint of the shared checkout fails on T4's temp files); lint ignores .claude/worktrees (biome !!, eslint globalIgnores). Task 18 (sweep classes 1-10 + guards) queued after the UI track settles (after T3 fix2/T3c)
Owner: answered in TG → edit TG message; answered elsewhere/expired → delete TG message (task-8b brief updated)
Owner: start the new notifications now, assume Firebase creds in CI → Tasks 8 + 8b run as ONE dispatch on the server track as soon as Task 7 finishes (slots full: T4, T7, T15); push token on the D1 session row (T9 later folds it in)
Owner: 'still doing X' → pool kind activity_overrun, default app only (added to 8b brief). 'Event ended' not chosen → removed as planned. Assistant-read notification: owner didn't understand — explained, awaiting answer
Note: bug-lessons/CLAUDE.md/biome/eslint changes were swept into T4's commit 13634e4 by the T4 agent; .gitignore worktrees b7b750a; pushed through b7b750a (T4 commits included, T4 not yet reported)
Task 4: implemented e878d6b..6785128 (pushed; 2 commits with LEFTHOOK=0 because knip saw worktrees — lint now passes at HEAD); review dispatched. Task 3: fix round 2 dispatched (resume), FIX_BASE b7b750a
Task 4: review: Important 1 (pane replays picked.close after form closes → close sheet pops again); minors 2 FormOrigin unused/title from ai.state, 3 line+pane two editors for one draft, 4 new-task-request pending never expires, 5 Permissions row while calendar loading, 6 typed-not-submitted subtask dropped on Create, 7 tooltip focus→hover, 8 no geometry check for pane swap, 9 RU copy + duplicate key. Fix round 1 queued after T3 fix2 (shared checkout)
Task 15: implemented on worktree branch worktree-agent-aa10ddbbb7d0b0d29 (dd0c125..f837649); review dispatched; Task 16 dispatched (sonnet, worktree)
Task 3: fix round 2 implemented b7b750a..e20c77d (pushed); re-review dispatched. Task 4: fix round 1 dispatched (resume), FIX_BASE e20c77d
Task 15: review: Important 1 powerShellQuote misses U+2018-201B quotes (name with ’ breaks/injects); minors 2 UnicodeDecodeError/OSError kill loop, 3 outbox only saved on flush + non-atomic, 4 ctypes argtypes/1024 buf, 5 win edge cases, 6 token-in-history note, 7 systemd %/$ + XAUTHORITY, 8 boundary tests, 9 'bridge' wording, 10 SW navigateFallback .py, 11 e2e Linux preselect, 12 last_sent_at. Fix round 1 queued after Task 16 frees a slot (limit 3)
Task 7: implemented on worktree-agent-a9fce8a7cd76457f7 (dd0c125..a59a4e9); review dispatched (opus). Task 15: fix round 1 dispatched (resume, worktree)
Task 3: fix round 2/5 (3 addressed, 0 open; commits b7b750a..e20c77d)
Task 3: minor (deferred): sidebar.tsx:79 settings owns uses plain startsWith; e2e bare list is a copy (comment only)
Task 3: complete (commits ef58020..e20c77d excluding 3b, review clean after 2 rounds)
Lint in worktrees: biome pattern changed to root-relative '!!.claude/worktrees' in main checkout (uncommitted yet) — fixes 'No files were processed' inside worktrees
Task 16: implemented on worktree-agent-ac76df937372e899a (450a7f7, LEFTHOOK=0 due to biome pattern); review dispatched
Task 16: minor (deferred): token masked twice; TG failure turns release job red (by brief)
Task 16: complete (450a7f7 on worktree branch, review clean) — to cherry-pick when main checkout is idle
Task 5: dispatched (opus, worktree; no now-screen.tsx changes; no e2e runs)
Task 7: review: Important 1 MCP grants with old userId hit ghost stores (check user exists in mcpHandler → 401); minor 2 push without server-side storeId check (add expected storeId to push, store/changed); 3 unbounded resets per run + dispatch-during-reset untested; 4 alarm vs wipe race (pre-existing); 5 hide-flush now pulls first; 6 old DOs keep data; 7 auth parse clarity, IndexedDB untested. Ruling: also use telegramId as fallback Telegram chat id (private chat id == user id) so the epoch wipe doesn't silence notifications — cost if wrong: a send to a user who never opened the bot fails (403) and is logged. Fix round 1 (1,2,3 + chat fallback) queued for the next free slot
Task 15: fix round 1 implemented f837649..2c7e0a0; re-review dispatched. Task 7: fix round 1 dispatched (resume, worktree)
Task 15: fix round 1/5 (12 addressed, 1 residual + 2 new minors open — finished sessions only reach the outbox at send time (lost on power cut during backoff); Outbox.save OSError kills loop; refresh_desktop_env overrides terminal DISPLAY/XAUTHORITY). Fix round 2 queued for next free slot
Task 4: fix round 1 implemented e20c77d..d32ec68 (pushed); re-review dispatched
Integrated: 69536aa biome root-relative; Task 16 cherry-picked as b05da03 (pushed)
Task 15: fix round 2 dispatched (resume, worktree)
Task 4: fix round 1/5 (9 addressed, 0 open; e20c77d..d32ec68)
Task 4: minor (deferred): RU placeholder dropped 'вставьте'; useComposer twice per render; duplicate subtask draft allowed
Task 4: complete (commits e878d6b..d32ec68, review clean)
Next UI-track: Task 3c (attend future) when a slot frees
Task 15: fix round 2 implemented 2c7e0a0..02b9499; re-review dispatched. Task 3c: dispatched (sonnet, main checkout), BASE b05da03
Task 15: fix round 2/5 (3 addressed, 0 open); minor (deferred): _load misses UnicodeDecodeError; replace=True refresh after any xdotool failure
Task 15: complete (review clean after 2 rounds); cherry-picked as 3dd5517..59565b8 (pushed)
Owner: Calendar → back to Week (sent to Task 5 agent mid-task); new Task 5b (apps during an activity on Day/Week details; Day screen-time list) after Task 5
Task 7: fix round 1 implemented a59a4e9..92f5ee7 (worktree); re-review dispatched
Owner: remove Day's calendar icon (→Week); phone tabs Now·Day·Inbox·More, Week moves into More (sidebar unchanged) — sent to Task 5 agent
Task 7: fix round 1/5 (4 addressed, 0 open; a59a4e9..92f5ee7). minor (deferred): clear() outside enqueue; tests/setup global telegram.test stub; chat fallback sends to never-started users; ghost store re-queries D1; delete-account race re-stores chat
Task 7: complete (review clean). Integration: T7 agent rebases its branch onto claude/new-session-sy3n4a in its worktree, then controller fast-forwards
Task 3c: implemented 59565b8..23fae59 (pushed): root cause Day's Attended → logPast of a not-yet-over event; review dispatched. Task 11: dispatched (opus, worktree)
Task 3c: review approved; finding 1 (Medium): after attending an upcoming event Day's row never flips to logged (running activity ends at now < event start) → buttons stay, 2nd tap restarts; fix round 1 queued (resume T3c agent) for next free slot. Low: owner-path claim 'likely' only
Task 7: cherry-picked as 3b6b8d2..f2271a0 (verifying lint+unit+api+app before push)
Task 8+8b: dispatched as one (opus, worktree) with combined brief
Owner (Android screenshot, v0.9.0): Now's calendar prompt overlaps rows + Attend → retro/future on an ongoing event → Task 3d (opus, fresh — Task 3c's diagnosis missed it), includes 3c's follow-up. Owner: new Task 19 self-hosting (Change server, /api/instance, protocol compat, docs). Queue: 3d first (next free slot), then 19
Owner: incompatible while signed in → full-screen with only Log out (Change server only on the login screen) — task-19 brief updated
Owner asked about push without Firebase/GMS and on self-hosted servers → sent to the notifications agent: local fallback path (no FCM token → local scheduling of event_start/activity_overrun + show/cancel on sync); options for self-hosters put to the owner
Owner: NO local notifications at all (retracted the local-fallback message to T8 agent); delivery = FCM, the live WebSocket while open, later UnifiedPush; server transport interface. Owner chose UnifiedPush and asked for relay vs UnifiedPush comparison
Integrated branch at f2271a0 verified (lint, unit, api, app green) and pushed
Owner: keep FCM + UnifiedPush; push abstraction (transport registry, per-device subscriptions, preference+fallback, dedup by delivery records + pool id as system id) — sent to T8 agent; Task 8c UnifiedPush and Task 20 sync+notifications over WebSocket queued (after T8)
Owner: one push method per device (fcm|unifiedpush|none), no fallback chain — sent to T8 agent, 8c brief updated
Owner: server advertises pushMethods; FCM not configured → only other methods; server-side FCM breakage → methods-changed → app re-registers; per-device token error = re-fetch token, not a switch; delivery log with method — sent to T8 agent, 8c brief updated
Owner: default push method = FCM automatically (when accepted + GMS); picker in Settings to change — 8c brief updated
Owner: UnifiedPush dropped; FCM where possible, else Pace's own socket connection (foreground service) with a battery-optimization step only in that case — Task 8c rewritten
Task 5: implemented on worktree-agent-a52e10d0d29a88b1c (base e20c77dd2b5415e142b0f6b8b66e66bbd395c14a: fa0f6ae..62047fa incl. Week rename + 4 tabs); review dispatched. Task 3d: dispatched (opus, main checkout)
Owner: no foreground service/ongoing notification; non-FCM phones use a periodic background check (poll ~15 min) + socket while open — Task 8c rewritten; T8 agent told
Task 5: review approved (spec ✅). Integration: rebase onto feature branch + regenerate DO migration as fresh 0001 on squashed 0000 (drop branch's 0003). Minors to fix in the same round: sideways reset keyed by weekStart, location link colour, explicit isCurrent for Back to today, e2e title 'Calendar after Day', clear pick on week change test; ruling: client output parsing must tolerate extra keys (adding a field is not breaking) — sweep all strictObject output schemas → cost if wrong: weaker drift detection for removed/renamed fields (still caught: missing required keys fail). Queued for next free slot (resume T5 agent)
Task 11: implemented on worktree-agent-a9d56fea111a6876b (base 23fae59: 4d28193..21f2ff4); review dispatched. Task 5 fix+integration round resumed in its worktree
Task 11: review spec ✅, Needs fixes (strict output schemas; addSubtasks lost source text; producer output exceeds own contract; minors). Fix round 1 sent to implementer. Ruling: time-bar readings stay in Decision log — they are assistant decisions — cost: log noise. Parked to Task 12: client activity delete via planProposal (closedBy/endedBy dup)
Task 3d: implemented fd07c00 (main checkout, base f2271a0); overlap = Android flattening padding box (RowList collapsable=false); 'future' toast attributed to Day Attended (fixed 23fae59) by elimination; review dispatched
Task 3d: pushed fd07c00 (lint green). Review spec ✅ (overlap root cause verified against RN ViewShadowNode; retro/future elimination convincing), Needs fixes: Important — startCalendar's second-tap no-op keyed on title vs ANY open run → a stale same-title run (recurring lectures) makes Attend silently do nothing. Ruling: match by event window via ONE shared predicate (start−15min ≤ activity.startAt < end) used by startCalendar, isTracked, isStartedFor; compare labelOf(title); fold AHEAD/NEAR constants — why: minimal correct fix, no event-schema change — cost if wrong: two overlapping same-title events could still share a run. Minors: sliding-rows guard comment. Queued fix round 1 (resume a6511c4ef3506b3bb) for next free slot (3 tasks running: T8, T5-fix, T11-fix)
Owner: parallelism cut to 2 — don't stop running agents, launch nothing new while 2+ are running
Owner: split into two PRs (Pareto: useful + quick first, heavy later); make PR1, drive it to green, then STOP. Started agents are not stopped.
Ruling — PR1 (branch claude/new-session-sy3n4a → main): Tasks 0,1,2,3,3b,3c,3d(+fix round),4,7,15,16 (in branch) + 5 (Day/Week, fix round running) + 11 (proposals core+API, fix round running; done and reviewed, landing it avoids drift) + 6 (time bar buttons, bar to Day) + 18 (sweep of PR1's bug classes) + 17 (docs for PR1 content) + one QA round & code review, fix non-cosmetic findings → PR → CI green → stop.
PR2 (later, after PR1 merges; designated branch restarted from main): 8+8b (running, lands in PR2), 8c, 5b, 9, 10, 12, 13, 14, 19, 20, rest of 17/18. — why: 8/9/10/14/19/20 are server-heavy or need creds/devices; 12/13 build on 11 — cost if wrong: PR1 lacks login notices/notification pool a bit longer.
Queue for PR1 (max 2 running): 3d fix round → 6 → 18 → 17 → QA+review.
Owner: three PRs are fine. Ruling — PR1 unchanged. PR2 (user-visible features): 12 (proposal cards in app), 13 (bot proposals), 5b (apps during an activity + Day screen time), 10 (wipe/delete confirmed in Telegram). PR3 (infra-heavy): 8+8b (running) + 8c, 9 (sessions + login notices — needs the pool), 14 (auto sleep), 19 (self-hosting), 20 (WebSocket). Each later PR starts from main after the previous merges — why: 9 depends on 8; 12/13 build on 11 in PR1 — cost if wrong: login notices and push wait for PR3.
Owner: after PR1 CI green → squash-merge into main, make a release, verify it released, then stop. Remind owner: TELEGRAM_RELEASE_CHAT_ID + Firebase setup
Owner: all keys (incl. FIREBASE_SERVICE_ACCOUNT, GOOGLE_SERVICES_JSON) live only in GitHub secrets; deploy pushes them to the Worker — keep the 8b design as is
Task 8+8b: implemented 41f1aea on worktree-agent-a0f0cbf5d892b6e62 (base f2271a0), unpushed — parked for PR3 (review there). Concerns: login notices need Task 9; phone side mock-only; poll needs expo-background-task re-added in 8c; dead preset fields criticalHours/criticalProgress/inProgressIdleDays still in editor; no QA/screenshots; overlaps with T5 in sidebar.tsx, now-header.tsx
Task 11: fix round 1 done 071047f..8131f9f; scoped re-review dispatched
Task 11: re-review all findings addressed (minors: stacked JSDoc parse-queue planAll, stale 'class 11 taken' parenthetical in bug-lessons, planProposals revocation-limit comment — fixed by controller at integration). Task 11: complete
Owner: suggests merging the pool now → Ruling: Task 8+8b moves to PR1 (review + fix round + integration after T5; conflicts sidebar.tsx/now-header.tsx). Caveat told to owner: local Android notifications are gone, so without Firebase secrets at release the phone gets nothing while closed (event_start still to Telegram); non-Google phones wait for 8c (PR3). Login notices still need Task 9 (PR3). PR1 queue: T5 integrate → T8 review → 3d fix integrate → 6 → 18 → 17 → QA+review
Integrated Task 11 onto branch (9bfbdbc..a540e99): lint ✓, unit core 536 / client 249, api 258, app 305 ✓
Rate limit (session limit, resets 15:00 UTC): T5 fix agent and 3d fix agent stopped mid-work; resume both via SendMessage after reset
Task 3d: fix round 1 done af04a79 (branch t3d-fix); re-review dispatched. Note: prompt lead 10→15 min (one constant)
Task 3d: re-review all addressed; integrated af04a79 + controller fix d609382 (logPast cuts long labels — out-of-scope finding, same class). Task 3d: complete. Task 8+8b: review dispatched (moved to PR1)
Task 8+8b: review Needs fixes (7 Important: strict payload schemas; attended predicate x3 + long titles; FCM 403 kills all; Day skip not server-side; phone answer dismissed before save; method picker missing). Fix round 1 → resume implementer: rebase onto branch first; move isCalendarRun/activityLabel/CALENDAR_LEAD_MINUTES to core
Task 5: fix+rebase round done on d609382 (e02e19b..2bff326; fix commits 83c23ea c202137 2bff326 — loosen() applied centrally by endpoint()); scoped re-review dispatched
Task 5: re-review all addressed; integrated e02e19b..2bff326 (ff) + guard commit. Task 5: complete
Task 6: dispatched (opus, worktree, base 98bcd6e)
Branch 98bcd6e pushed; verified unit 545/266, api 259, app 319 ✓
Owner: added TELEGRAM_RELEASE_CHAT_ID variable and GOOGLE_SERVICES_JSON + FIREBASE_SERVICE_ACCOUNT secrets (GitHub)
Task 6: implemented 7584631..cbe6735 (base 98bcd6e, worktree /home/user/pace-dev/.claude/worktrees/agent-adc3f906f010faef4); review dispatched. Ruling: Sport-button legacy runs moot (store epoch reset wipes them)
Task 6: review spec ✅ Approved; minors fix round 1 sent (taskLink in Day VM w/ 'Open task'; re-tap running choice closes; focusedTaskId; stale open; docs; Stop style)
Owner: pause — agents told to wrap up at a sensible point and commit; then integrate what is reviewed, push, stop
Owner: OK to push the pool WIP to a separate branch claude/new-session-sy3n4a-pool-wip
Paused: main 7e4aead pushed (Task 6 integrated; fix round re-review pending). Pool WIP pushed to claude/new-session-sy3n4a-pool-wip (4980726). Handoff in context/stage-8/
Owner: continue. Finish PR1 (merge+release), then do PR2 to the end; strictly ONE agent at a time. PR3 not now.
Resume: cleaned merged worktrees; pool agent resumed (rebase onto 5fe5dbd, bug-lessons rows, e2e, screenshots). Queue (one agent at a time): pool re-review → integrate → Task 6 fix-round re-review → 18 → 17 → QA → whole-branch review → fixes → PR1 → CI → merge → release v0.10.0 → verify. Then PR2: 12, 13, 5b, 10 → QA/review → PR2 → CI → merge → release
Owner: think of proposals as actions the assistant was going to take anyway; we only approve them. Ruling: in Tasks 12/13 the UI speaks in the assistant's voice as a pending action ('Assistant will create…/change…/delete…', [Approve] [Cancel]; no 'Suggested by the assistant'), and the code term 'proposal' is renamed to 'action' (pending assistant action) across core/api/client/bot in Task 12 — cost: one rename sweep
Owner: a follow-up can be sent on pending actions — it goes to the model together with the original request and the actions already shown. Ruling: Task 12 adds it end to end (contract: /api/parse takes optional 'thread' = [{text, actions}] of earlier turns; prompt shows them; revised answer replaces the cards; fake LLM + regression fixtures); Task 13 wires the bot (a text reply while actions are pending = follow-up)
Task 8+8b: fix round + rebase done (worktree HEAD d3d1f8d on fbc3da2; 17 commits; e2e 55 ✓; new e2e/notifications.e2e.ts; FCM class → 15). Carry to Task 18: closed enums in cloud device kind and sync precision/source. Re-review (pool fix + Task 6 fix round) dispatched as ONE agent
Re-review: pool all addressed; Task 6 fix round all addressed → Task 8+8b complete, Task 6 complete. Integrated pool (ff to d3d1f8d), verified unit 578/278, api 278, app 355 ✓, pushed. Residual minors carried into Task 18 brief. Next: Task 18
Task 18: dispatched (opus, worktree, base d3d1f8d)
Owner: FCM available on both sides ≠ usable — different Firebase projects (keys) → nothing arrives. Sent to Task 18 agent: server advertises its FCM project identity; app compares with its baked google-services project; mismatch → poll + reason in picker; SENDER_ID_MISMATCH → subscription incompatible (not gone), no re-register loop
Task 18: rate limit stop; progress d89305f..f4cfa1c (carried items, FCM project match, classes 1-4, 8, 13); resumed 04:46
Owner: finish PR1 and STOP (PR2 not now)
Owner: stop after the bug-class sweep (Task 18): integrate it, push, update context/stage-8 handoff, stop
