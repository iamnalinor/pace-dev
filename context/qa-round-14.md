# QA round 14 — assistant card, assistant log outcomes, repeat again / refused series

Tester: Claude exploratory QA agent, 2026-10-31. Web build of `6d7b8a1` (HEAD) made with `build:web` logic (the repo's own `dist/` was being rebuilt by another run on the default ports,
so the same script was run with an output folder in the scratchpad; `sw.js` precaches 14 files and is active in the page), served on :4203; Worker :8827
(`LLM_PROVIDER=fake`, `ENVIRONMENT=test`, fresh `--persist-to`). Accounts 7401..7433: fresh EN accounts, one RU lived-in (`seedLivedIn`, 7420), fresh RU accounts (a `settings.updated` language event).
All scripts and screenshots: /tmp/claude-0/-home-user-pace-dev/6f77ce81-7a78-529a-8acb-0db3ef7ffece/scratchpad/qa14/ (abbreviated `qa14/`; every path below is under it).

Sweep (`sweep.ts`): 16 routes x RU lived-in and an EN account with repeating tasks x 1440/390 x light/dark = 128 pages: no page error, no console error, no failed request, no horizontal overflow, no raw
key; axe (WCAG 2.2 AA) clean except `scrollable-region-focusable` on `/insights` RU 390 (light and dark; round 11 L8, unchanged). axe on the assistant card in every state (card with questions,
answered, nothing-to-do, time-bar card, the log) at 1440 dark, 1440 light, 390 light, 390 dark: no violation (`x1.ts`).
Offline and a failing `/api/parse` (503) still give the "Assistant unavailable ... local rules" card (`a8.ts`). Not testable here: a real model, Telegram, Android, a phone calendar.

## Summary

| Severity | Count |
|---|---:|
| Blocker | 0 |
| High | 0 |
| Medium | 3 |
| Low | 11 |

Round 13's high (H1, a repeat cannot be turned on again) is fixed, so are three of its four mediums (one request per message, `#ask` in the time bar, outcomes in the log); the fourth (M3) is fixed in the log but not on the card.
Everything the brief lists as new works on the main path. The defects are at the edges: a rename card that does not say the new name, the same Russian word for two different buttons on screen at once, and a log that drops the middle of a long thread.

## Findings

### M1 medium — Approving a rename (or any "change") the card does not say what it changes to
Composer and time bar, 1440 light EN (same on 390). Steps: create "Aone"; type `rename task Aone to Aone renamed` (or in the time bar `rename activity Walking to Strolling`).
Happened (`a4.ts`, `a12.ts`): the card reads "The assistant will change “Aone”: title" / "The assistant will change “Walking”: name". The new name is nowhere on the card. Only after Approve does the log say "Renamed “Aone” to “Aone renamed”".
Expected: the card, which is what the person approves, says the same as the log: "The assistant will rename “Aone” to “Aone renamed”". (Round 13 M3 asked for it in the log; the log got it, the card did not.) The delete card for a running activity reads "delete “Strolling”, 22:27–…" with a half-open range.
Screenshot: qa14/a4-F.png (card family), text in `a4.ts` output.

### M2 medium — In Russian the assistant card's Cancel and the toast's Undo are the same word, on screen together
390 dark RU (and any width). Steps: in the time bar «Бег» -> Подтвердить (toast "Готово · Отменить", 5 s), then at once type «Чтение» + Enter (`c2.ts`).
Happened: the toast says «Отменить» (Undo: revokes the activity just started) and the card's second button says «Отменить» (Cancel: dismisses the new reading). Two different actions, one label, one thumb apart
(`qa14/c2-390-dark-barstops.png`). The card's Cancel is also «Отменить» while the rest of the app's Cancel is «Отмена» (`common.cancel`), Undo is «Отменить» (`common.undo`).
Expected: distinct words (Undo «Вернуть»/«Отменить действие», Cancel «Отмена»); the same on the card.

### M3 medium — The log row of a thread with two or more corrections shows only the last one
`/decisions`, 1440 light EN (`a5.ts`). Steps: `#ask Taptwo` -> tap "Today" -> type "work" in "Correct the assistant…" -> Approve. Then `#ask Typedfirst` -> type "work" -> tap "Tomorrow" -> Approve.
Happened: the first row reads "Created task “Taptwo” / You wrote: “#ask Taptwo” / Then you wrote: “work” / You approved it" — the tapped answer "Today" is gone. The second reads "You answered “By when…?”: Tomorrow" — the typed "work" is gone.
(One correction, tapped or typed, is right: `Tapone`, `Fsix`.) The request sent to the model carries all turns, so the log shows less than what happened.
Expected: every turn in the row ("You answered … / Then you wrote …"), or at least the count. Screenshot: qa14/a4-log.png (the one-correction rows are right there).

### L1 low — A thread you walk away from leaves two rows, and a reading you edit away stays "Shown to you for approval" for good
`/decisions`, 1440 EN (`a7.ts`, `c1.ts`). Steps: type `Hone`, Enter, type "urgent" in the correction field, Enter, then edit the line (type "y") instead of Approve/Cancel.
Happened: two rows, "Suggested a new task “Hone” / You wrote: “Hone” / Shown to you for approval" and "Suggested a new task “Hone” / You wrote: “Hone” / Then you wrote: “urgent” / Shown to you for approval".
The same for `#ask Buy milk` -> tap "Tomorrow" -> edit the line (rows with and without "You answered"). Editing the line and opening the manual form are correctly NOT logged as dismissed, but the row never gets an ending
("Shown to you for approval" reads as if it were still open, also after you made the task by hand).
Expected: the superseded reading folds into the conversation's row as for an approved thread; an abandoned one says "You changed the text instead" (or similar). Screenshot: qa14/a7-log.png.

### L2 low — Every log row ends "via the assistant (model not recorded)"
`/decisions`, all widths, EN/RU («через ассистента (модель не записана)»). Round 13 L5 asked for a clearer "via the assistant model"; the new text is clearer about nothing: "model not recorded" is a developer detail
(it appears on every row with the fake model) and invites "what did you not record?". Expected: drop the clause when there is nothing to show, keep "via local rules" (the useful distinction). Screenshot: qa14/a4-log.png.

### L3 low — Edit: the message for an existing past-due task blames "the start" the person never chose and gives no remedy
Task screen -> Edit, 1440 light EN (`r8.ts`). Task "BothPast" (due Oct 1, created today) -> Edit -> Repeat "Every day".
Happened: "The deadline is before the start: every repeat would begin late." and Save disabled. The start is the task's creation time ("Start today 22:15" chip), not something chosen; New task for the same dates says
"The deadline has already passed: a repeat cannot start late. Pick a later deadline." (right). Expected: in Edit, when the start is the automatic one (or earlier than now), the same "deadline has passed ... Pick a later deadline" text; the other message should also say what to change.
Screenshot: qa14/r8-BothPast.png.

### L4 low — Final deadline "On a date" with no date: the message says to set a main due date that is already set
New task, 1440 EN (`r5.ts`). Due Nov 3, "Main due + final deadline" -> "On a date" -> Done without a date: "Set a main due date and a later final deadline." (Create disabled). Picking Oct 31 (before the main due) gives the same text.
The chip (calendar icon, label "Final deadline", "No final date set") is right now. Expected: "Pick a final deadline after Nov 3 23:59." Screenshot: qa14/r5-afterdone.png, qa14/r5-before.png.

### L5 low — The refusal under Repeat is not announced and, on a phone, Create is far from it
New task, 390 light EN (`p1.ts`). Due Oct 20 + Every day: the red text appears under the chips (not a live region; the "nothing to do" line is `role=alert`, this one is a plain `div`), Create is disabled and scrolled out of view (y = -340).
A screen reader user hears nothing; a sighted one sees a faded Create and has to find the cause. Expected: `role=alert` (or `aria-live`), and the field linked with `aria-describedby`. Screenshot: qa14/p1-form-refused.png.

### L6 low — The New task form keeps its draft after the cross and "New task" reopens it, without saying so
1440 EN (`r4.ts`). New task -> title "Leftover", due Nov 5, Every day -> ✕ -> New task: the old title, date and repeat are back. A button called "New task" opening an old draft, with no "Draft" cue and no "Discard", surprised the tester
(and it carried a series refusal into the next scenario). The title opens red ("Give the task a title.") on a fresh form (round 11 L2, unchanged; qa14/a9-formopen.png, qa14/p1-form-open.png).

### L7 low — A plain task whose start is after its deadline is accepted and shown without a word
New task, 1440 EN (`r3.ts`, `r8.ts`). Start Nov 10, due Nov 5, "Does not repeat" -> Create works; the future list shows "Starts Nov 10 09:00 · Due Nov 5 23:59" (qa14/r9-after-stop.png).
The series is refused (as asked), the plain task silently accepted. Expected: the same plain sentence under the Due field ("The deadline is before the start") for both, or a note that it is allowed.

### L8 low — After Escape in the correction field the focus falls to the page
Composer card, 1440 EN (`a6.ts`). Escape in "Correct the assistant…" closes the card (right) but `document.activeElement` is `body`; the caret is not in the line, so the next keystroke goes nowhere.
Escape in the line itself keeps the caret and the text (right). Expected: focus returns to the line.

### L9 low — The last instance of a series still carries the repeat mark on its rows
Now, 1440 EN (`r6.ts`, `r7.ts`). Weekly series due Nov 3 with last repeat date Nov 5: the task screen says "Every Tuesday, this one is the last" (new, good), the Now row still shows the repeat icon (aria-label "Repeats") and, after it is closed, no next instance appears
(right). Expected: the row's mark follows the screen (no mark, or a "last" cue). Screenshot: qa14/r7-LastOne.png.

### L10 low — Round 13 leftovers, unchanged
- Round 11 L3: the toast after Approve says "Done" / "Undo" (RU «Готово»): it does not say what was done.
- Round 11 L4: "To Inbox" (Alt+Enter) gives no toast, only the badge 0 -> 1 (`a9.ts`).
- Round 11 L11: every route's `document.title` is "Pace" (9 routes checked).
- Round 11 L8: Insights RU 390 `scrollable-region-focusable`.
- Round 11 M3 remainder: the next instance of a daily series starts at the creation time of day ("Starts tomorrow 22:16 · Due Nov 4 23:59"; monthly "Starts Nov 30 22:16 · Due Dec 3 23:59").
- RU log rows and cards show the model's English questions and options ("Вы ответили на «By when does this need to be done?»: Tomorrow"); a real model would answer in the text's language, the fake does not.

### L11 low — Not re-tested / limits
Round 13 L11 (phone, activities running: the New task card is covered by the bar) was not re-run with activities running; with an empty day the phone form is an inline card whose Create scrolls away (qa14/p1-form-open.png).
"Every month on the last day" for a 31st (round 13 L9) was not re-tested. The fake model's `#ask` dueDate answer changes nothing on the card (no Due line appears after "Tomorrow"): a fake limitation, check with the real model.

## Round 13 re-check

| Id | State | Evidence |
|---|---|---|
| H1 re-adding a repeat after stopping | **Fixed** | `r1.ts`: weekly series -> Does not repeat (Repeats line gone) -> same kind again ("Every Tuesday"), another kind ("Every day"), Weekdays ("Every weekday (Mon–Fri)"), Every day + final deadline 3 days ("Final deadline Nov 6 23:59") — the sheet closes only when saved, no toast, no partial save; stopping removes the future instance, starting again with Every month brings "Starts Nov 30 · Due Dec 3" (`r9.ts`). |
| M1 log says "Created" twice for a correction thread | **Mostly fixed** | one row per resolved thread with request, "You answered “…”: Tomorrow" or "Then you wrote: “urgent”", one "You approved it" (`a4.ts`, `a5.ts`); no doubled guillemets. Remaining: middle turns dropped (M3), abandoned threads (L1). |
| M2 two identical `/api/parse` per message | **Fixed** | `fill` of 20+ characters (a paste) then Enter: 1 request; a real clipboard Ctrl+V then Enter: 1; `rename task … to …` pasted: 1; three Enters in a row: 1; Escape or clearing during the reading: no late card (`a2.ts`, `a13.ts`). Enter after a "found nothing" does not re-read (`a2.ts` 4b). |
| M3 log says "Shown for approval" for applied edits | **Fixed in the log, not on the card** | rows now "Renamed “Aone” to “Aone renamed” / You approved it", "Added subtasks to “Gam”", "Marked subtasks solved in “Gam”", "Deleted task “Gam2”", "Deleted “Strolling” from your day", all "You approved it" (`a10.ts`, `a12.ts`). The card still says "change “Aone”: title" (M1). |
| M4 `#ask` in the time bar, "could not read" for text of a task | **Fixed** | `#ask Barq` -> card "How long will it take?" 20m / 1h / 2h; the tap shows "Expect: ~1h", "✓ How long will it take? — 1h", Approve starts it with ~1h (`b1.ts`); a task-like text: "The assistant found nothing to start here. A task goes in the task line instead." (RU «…Задачу добавьте в строке задач.»). |
| L1 the answer leaves no trace, busy looks enabled | **Fixed** | "✓ By when does this need to be done? — Tomorrow" stays; while busy the other options, Approve and Cancel are at 50 %, the chosen option at 100 % (`a1.ts`, qa14/a1-busy.png, a1-answered.png). |
| L2 no shortcut on Approve/Cancel, Escape in the line | **Fixed** | "Approve Enter", "Cancel Escape" on the buttons; Escape with the caret in the line closes the card and keeps the text, in the composer and the time bar (`a3.ts`, `b1.ts`). |
| L3 no cue where to answer | **Fixed** | three hints: tap ("Tap an answer to refine it."), type ("…type your answer in the field below."), both ("…tap an answer or type one in the field below."), RU the same. |
| L4 log search and wording | **Fixed** | search filters while typing (debounced, ~300 ms), "Nothing matches “zzzq”." (RU «Ничего не нашлось по «zzzq».»), placeholder "Search the log", empty "Nothing in the log yet."; an activity row is still not tappable (correct). |
| L5 log wording | **Partly** | a dismissed card says "You dismissed it; nothing was done"; "via the assistant model" became "via the assistant (model not recorded)" (L2 here); RU still quotes the model's English. |
| L6 card and log disagree about "nothing to do" | **Fixed** | both say "The assistant found nothing to do with this" (card: "… Rephrase it, or add it with New task."). |
| L7 past deadline accepted; series "9d late" before it starts | **Partly** | a series whose deadline is before its start or already passed is refused with a reason and Create/Save disabled (S1, S2, S5, S6 in `r3.ts`); rows that have not started never say "late". A plain task is still accepted (L7 here); Edit's wording (L3 here). |
| L8 final-deadline picker | **Fixed** (wording remains, L4) | chip with calendar icon and visible label "Final deadline", the calendar opens on "On a date", the message sits under the field, not while picking (qa14/r5-ondate.png). |
| L9 task screen's repeat line | **Partly** | the category tag "Personal" is on the task screen (qa14/r7-DailyFinal.png); "this one is the last" is new; still no general "one of a series" cue; the 31st case not re-tested. |
| L10 row past both deadlines | **Fixed** | "29d late · final deadline passed Oct 8 23:59", RU «окончательный срок прошёл …» (qa14/r6-now.png); a row past only the main deadline keeps "final deadline Nov 30 23:59". |
| L11 phone form covered by the bar | **Not re-tested** with activities running | see L11 here. |
| L12 typed start does not say it stops what runs | **Fixed** | "Stops: Barq" (RU «Остановит: Бег») in the card, composer and time bar (`b1.ts`, qa14/b1-stops.png). |
| L13 older items | **Unchanged** | listed as L10 here. |

## Owner requests not met

- Say what the assistant is going to change before approving (the rename/edit cards: M1) — only the log says it.
- A log that is faithful for a whole conversation (M3, L1).
- Round 11 L3/L4/L11 (toast text after Approve, a toast for To Inbox, per-route page titles): still open.

## UX heuristics walk (this round's areas)

Every control earns its place: the card now has Approve, Cancel, options and one field; the "↵" send button is the one icon-only control, with a tooltip. One way per job: tap, type, Approve are three distinct jobs and the hint says which (L3 fixed).
Platform conventions: Escape in the line and in the correction field closes the card; Enter in the line approves; Enter or Space on an option answers without approving (round 13); focus is lost after Escape in the correction field (L8).
Keyboard: hints Enter / Escape are shown on the buttons also at phone width, as everywhere else in the app (Create, Save, Done). State you can see: the answer stays ("✓ question — option"), a repeat and a final deadline and the category are on the task screen; the last repeat's row mark disagrees (L9).
Feedback and motion: the card changes height on an answer; no jump seen at 390 or 1440. Copy: the "found nothing" texts are plain and differ for the task line and the time bar; "model not recorded" (L2) and "Done" (L10) are not. Color: the card's amber question lines, the red "nothing" line and the lime Approve are calm and consistent in both themes; contrast passed axe.
Forms keep their promise: every row of the "Every form, every way in" table that this round changed was submitted from each path: composer (typed + Enter; a paste via `fill` and via the real clipboard; New task over a card; the cross; To Inbox via Alt+Enter; a command about an existing task), time bar (typed + Enter; `#ask` + a tap; a typed start over a running one; Cancel; Escape), assistant preview (Approve by button and by Enter; typed correction; tap; Approve while questions are open; Escape in the line; nothing to do), task edit sheet (stop, again same kind, another kind, with a final deadline, refused cases), New task (every refusal, then Create), Day's "Log past activity" (empty: "Say what it was."; a future end: "That is still ahead: log what already happened."), close by the row's check ("Done: BothPast · Undo"). Overlays: the toast "Done · Undo" and the card are on screen together on a phone (M2).
Visual matrix: the card, the log, the form messages at 1440 and 390, light and dark, EN and RU: no overflow, no clipped text, no contrast failure.

## What works well

- The whole assistant card: dimming while busy with the chosen option kept bright, the "✓ question — option" echo, the three hint variants, Enter/Esc on the buttons, Escape in the line, no late card after a dismissal or a cleared line, and one request per message however it arrives.
- The log now reads like a diary of decisions: dismissed, kept in Inbox, approved, renamed from -> to, "found nothing"; live search with a proper empty result; editing the line or opening the form is not recorded as a dismissal.
- Repeats: stopping and starting again in every combination, the refusals with a reason under the field and a disabled Create/Save, the "deadline has passed" wording for New task, "final deadline passed …" on rows, the calendar chip with its label, the category tag, "this one is the last".
- Offline and server-error paths still give the local-rules card; the service worker activates; 128 swept pages and 20 axe runs on the new states are clean.
