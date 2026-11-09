# QA round 24 — release round for PR #54 (Design overhaul B, «Тетрадь»)

Tester: Playwright/Chromium on HEAD c703eb5, web build on :4173, fresh Worker on :8787 (ids 9100000001..20, ENVIRONMENT:test, fake LLM). Accounts: lived-in RU (seedLivedIn), fresh EN, extra tasks pushed for overdue/links/subtasks. Scripts and shots: /tmp/claude-0/-home-user-pace-dev/c2f6dbb0-2503-5cbb-9212-ea5d94eaadd2/scratchpad/qa24/ (shots in s/). Servers started by me are stopped at the end.

**Coverage, stated honestly.** Done: every route at 1440 and 390 in light RU and fresh EN (shots taken, RU ones read, EN not read), dark Now at both widths (taken, not read); Now with the task pane (URL, reload, Escape, Alt+N, Alt+F, description links, subtasks done mark, overdue, Done and the close sheet); the time bar (four pickers, typed line on phone, drafts); Settings offline Log out; /add, empty New task; 4x CPU taps; manifest. NOT done (budget): dark/EN screenshots read for every screen, Week/Day pickers and forms by hand, Inbox actions, preset forms, the Settings sheets (Add a computer, Connect), tooltips, History period in URL, Log out with a pending slow answer / two tabs, plain-http LAN line, phone Week sheet, the owner's heuristics walk on those screens. These need a follow-up round. A9 (real MCP client) is the owner's step: skipped.

## Summary
| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 3 |
| low | 7 |
| cosmetic | 3 |

## Round 23 fixes (carried list)
| Id | State |
|---|---|
| R23-02 offline Log out asks and names the count | **confirmed**: «1 изменение ещё не синхронизировано: если выйти сейчас, оно пропадёт.» with «Подождать Escape» / «Всё равно выйти» (s/offline-logout.png) |
| R23-06/07 preset names in account language | **confirmed for the list** (Домашка, Работа, Личное, Отложенное in RU); History naming presets not checked |
| R23-09/11/13c retry wording | **partly confirmed**: pill and Devices both «Попробовать снова» |
| R23-04 one parse request on Enter | confirmed for a typed line (1 POST /api/parse); paste path not tested |
| R23-01, R23-08, preset shared-name edit, read-later outage, request loop, slow logout, two-tab logout, LAN line | **not checked this round** |

## Findings

### R24-01 medium — Escape does not close the task pane on Now
Now, 1440, light, RU. Click a task row (pane opens, ?task=...), press Escape (focus on the pane, then after Tab to its buttons). Happened: nothing; URL and pane stay; only ✕ closes it. Should: Escape closes the pane and returns focus to the row (design review I4). Cause: apps/app/src/screens/now-screen.tsx passes inspectorOpen but not onInspectorClose (Day, Week, Inbox do), so the Escape hotkey in InspectorFrame is never armed. Class: one wrapper, one forgotten prop, on the most-used pane. Guard: e2e that opens each inspector and presses Escape. Shot: s/pane-hw-reload.png.

### R24-02 medium — Back/forward do not follow the screen state (feedback 5, item 6)
Now, 1440. Open task A, then B, press Back: leaves the app (history length stays 2; every pane change replaces the entry). The brief says "Back/forward follow it"; the front report lists it as a known deviation (expo-router has no push-params). Reload and shared links work (?task=, project filter). Unmet request. Related low: a ?task= link opened at 390 shows the plain list with no task.

### R24-03 medium — Taps over 100 ms at 4x CPU (R23-03, unchanged)
390, touch, 4x, shared machine: Day tab 232 ms, Now tab 176 ms, open a row 256 ms (lat.ts; filter chips not measured, selector failed). Above the 100 ms rule.

### R24-04 low — Phone: the deadline is the part of a task row that gets cut
Now and History, 390, RU: «осталось 23 ч 59 мин · Срок за…», «Срок 19 но…». Order is "remaining, deadline" at 390 and "deadline, remaining" at 1440, and the ellipsis eats the date. Same in the Task picker sheet. Shots s/now-ru-390-light.png, s/mt-p1.png.

### R24-05 low — Focus after closing the Task picker is lost
Now, 1440. Open «Задача» in the time bar, Escape: focus lands on a hidden element, not the tile (the other three pickers return focus to their tile).

### R24-06 low — New task: empty Create / Ctrl+Enter still silent (R22-15)
Alt+N, Ctrl+Enter with an empty title: no message; Create is only faded. Shot s/newtask-empty-ctrlenter.png.

### R24-07 low — Subtask done mark says «готово пн 22:08» for today while the fields say «сегодня»
Task pane, RU. One word for today.

### R24-08 low — Link shown twice
A header chip «example.com/a ↗» above the facts plus the same link inside the description (URL only in the description). Show one. Shot s/links-pane.png. (The links themselves work: new tab, no edit started; plain text starts edit.)

### R24-09 low — Insights rounds differently by width
RU: «Учтено 3 ч», «Другое 2 ч» at 1440 vs «Учтено 3 ч 01 мин», «2 ч 01 мин» at 390, same data.

### R24-10 low — Presets row has three chevron controls
1440 and 390: the open chevron floats mid-row beside the ▲▼ reorder chevrons. Sidebar keeps «Настройки» selected (R23-14).

### R24-11 cosmetic — Toast over the time bar and pane edge
«Готово: …» straddles the main column and the pane, covers the time-bar field top, and stays visible behind the close dialog's dim (s/close-sheet-overdue.png).

### R24-12 cosmetic — Desktop composer indented 44 px
Now, 1440: the + shows only at phone width; at 1440 an empty gap leaves the line misaligned with chips and list.

### R24-13 cosmetic — Stop squares and the Day now label
Black Stop square not centred in its grey circle (s/now-ru-1440-light.png); Day's red «22:01» crowds the last row's duration.

## Round 23 open lows
R23-03 still there (R24-03, medium). R23-05, R23-10, R23-15, R22-20 not checked. R23-12 **gone** on a computer (/add focuses «Название»). R23-14 still there. R22-10 **gone for Settings** (time fields 250 px). R22-11 phone Now tray: about 330 of 844 px with two running, around the 40% budget; low. R22-12 Week phone: back arrow and in-pill chevron still alike, hint «Листайте дни вбок» still at the bottom; low. R22-13 titles still differ in size/position; low. R22-14 **gone** (no reset button at now). R22-15 still there (R24-06). R22-18 **gone** («На этой неделе фокуса не было.»). R22-21 toast placement still straddles (R24-11); low. R22-23 manifest still dark only (#0d0f15); low. R22-24 bell only on Now (phone): still; low.

## Owner requests not met
- Feedback 5 item 6: Back/forward follow the screen state — not met (R24-02).
- Escape closes the inspector (design review I4) — not met on Now (R24-01).
- Met: ?task= reload, drafts survive reload and clear on empty/submit, links clickable, one done mark with date/time, overdue stays open («опоздание 2 дн»), Alt+N, Alt+F, no profile name in the chrome, «Прочее» holds Отдых (workout ~3 ч), no submission setting, Settings buttons no longer wide, no reset button at today.
- Not verified: lateness by subtasks only when all done (close-sheet preview), drafts cleared on sign-out, colour-never-dots on every screen (none seen in the shots read).

## What works well
- The kit reads as one system in light RU at both widths; Day's rail lines up with rows and the now line sits in its row.
- Time-bar pickers are consistent (alongside switch, search in Task, ~3 ч workout); the phone proposal is a bottom sheet with Confirm/Cancel.
- Offline Log out is honest and keyboard-friendly; /add now focuses the title.
- Subtask done marks update progress and remaining work at once; undo is clean; overdue is clearly worded.
- Zero console errors and zero 4xx/5xx in every session I ran.

## Fix wave notes (2026-11-09)

Fixed with tests and a bug-lessons class each: R24-01 (class 194), R24-02 (195, the front report's deviation closed), R24-05 (198), R24-06 (197), R24-07 (196), R24-08 (199), R24-10 (200); plus the owner's keepalive item on bug-lessons 192.

**R24-04 — kept as designed.** The phone row puts the deadline last on purpose (design review 2 N10, commit 7cd2b40, bug-lessons 181): the line is cut at its end, and the piece that must stay whole is the countdown («осталось 23 ч 59 мин»). In the shots (s/now-ru-390-light.png, s/mt-p1.png) every countdown is whole and only «Срок …» (or a progress count after it) yields; the full deadline is one tap away on the task. No change.

**R24-09 — not a rounding difference.** Insights formats every figure with one `formatDuration(minutes, language)`, nothing depends on the width. The two shots were taken about a minute apart with «Музыка» running, so the open activity had grown from 3 ч to 3 ч 01 мин (and «Другое» from 2 ч to 2 ч 01 мин). No change.

**R24-03 — measured, not fixed (time-boxed).** 390 px, touch, 4× CPU, production web build, lived-in RU account, CDP Profiler + Event Timing (script: scratchpad `qa24/prof.ts`):

| Tap | Event duration | Click handler (processing) | React render, inclusive | `(program)` (style, layout, paint) |
|---|---|---|---|---|
| Day tab (first visit) | 400 ms | 255 ms | ~300 ms | ~1.0 s over the window |
| Now tab (back, Now already mounted) | 216 ms | 167 ms | ~200 ms | ~0.35 s |
| Open a row (task page) | 312 ms | 233 ms | ~235 ms | ~0.44 s |

The work is synchronous React rendering in the click (a discrete event renders at once), spread across react-dom and react-native-web's element and style resolution (`createDOMProps`, style preprocessing), with timezone formatting (`@date-fns/tz` `tzOffset`, ~7 ms self) the only app-side function that shows up; no single hot spot. The telling line is the Now tab: Now is already mounted, yet going back to it renders ~200 ms of tree. The root layout's `Navigator` reads `usePathname()` (and `useHasNavigation`), so every navigation re-renders it, and with it `<Stack>` / `<Tabs>` and every mounted scene. Proposed fix (not contained enough for this wave): confirm with a React profiling build which scenes re-render on a tab switch; move the pathname reads at the root into leaf components (as `CrashContext` already does), memoize the scene content (`ScreenScene` / screen components) so an unfocused or unchanged scene skips, and consider wrapping tab and row navigations in `startTransition` so the tap paints before the new screen renders. Carry as R25 medium.
