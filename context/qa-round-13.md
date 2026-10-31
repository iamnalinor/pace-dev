# QA round 13 — tappable assistant questions (M1), repeat / final-deadline lines (M2), plain-words Assistant log (M4)

Tester: Claude exploratory QA agent, 2026-10-31. Web export built from `ea1fddd` (HEAD, clean tree) into the scratchpad, served on :4193; Worker :8817
(`LLM_PROVIDER=fake`, `ENVIRONMENT=test`, fresh `--persist-to`). Accounts: 7120 RU lived-in (`seedLivedIn`), 7101..7130 fresh EN accounts.
The export was made with `expo export` directly, so there is no `sw.js` (the console shows the service-worker MIME error on every load: an artefact of this QA build, ignored below).
All scripts and screenshots: /tmp/claude-0/-home-user-pace-dev/6f77ce81-7a78-529a-8acb-0db3ef7ffece/scratchpad/qa13/ (abbreviated `qa13/`; every path below is under it).

Route sweep (`sweep.ts`): 16 routes on the RU lived-in and an EN account x 1440/390 x light/dark = 128 pages: no page error, no console error, no failed request, no horizontal
overflow, no raw key, axe (WCAG 2.2 AA) clean except `scrollable-region-focusable` on `/insights` RU 390 (round 11 L8, unchanged). axe on the assistant card with questions
(390 dark RU, 390 light EN, 1440 dark RU): no violation; option buttons are 44 px high.

Not testable here: a real model (no "Not in your text: …" line, no server-side "rules fallback" log row: the fake provider cannot fail), Telegram, Android, paste into the field
(a synthetic paste event does not reach React Native Web's input; not counted as tested).

## Summary

| Severity | Count |
|---|---:|
| Blocker | 0 |
| High | 1 |
| Medium | 4 |
| Low | 13 |

New this round: the 1 high, 4 medium and 12 of the lows; L13 collects round 11/12 items that are unchanged.
The three new features work as designed on the main path: option buttons answer with one tap (mouse, keyboard, phone, desktop, both themes, RU/EN), the repeat and final-deadline
lines and the repeat icon are right for every repeat kind, and the Assistant log reads in words with tappable task rows. The defects are in the edges around them.

## Findings

### H1 high — Edit: re-adding a repeat to a task whose series was stopped silently does nothing, or fails with a vague error after a partial save
Task screen -> Edit, 1440 light EN (same code path on the phone).
Steps: New task "Ser", due Nov 3, Repeat "Every week" -> Create. Open it -> Edit -> "Does not repeat" -> Save (works: the Repeats line disappears, `series.archived`). Open it -> Edit -> "Every day" -> Save.
Happened (`m2p.ts`): the sheet closes as if saved, no Repeats line appears, no `series.*` event is written (checked in the log through `/api/sync/pull`). Doing it again with "Weekdays" keeps the
sheet open with the toast "Check the values and try again." (bottom left, over the sidebar), no field marked. With "Every day" + "Main due + final deadline" (3 days) the
final deadline IS saved (the task screen shows "Final deadline Nov 8 23:59") while the repeat is not and the sheet stays open with the same toast (`m2n.ts`): a partial save.
A task that never repeated accepts the same edit (repeat only, repeat + final, final only: `m2o.ts`, all saved and shown).
Expected: a repeat chosen in Edit is saved (a new series from this task), or refused with a reason next to the field, before anything else is written; a closed sheet must mean "saved".
Screenshots: qa13/m2n-added.png, qa13/m2p-4repeatagainweekdays.png, qa13/m2p-3repeatagaineveryday.png.

### M1 medium — The Assistant log claims "Created task …" and "You approved it" for every reading in a correction thread, so one task looks created twice
`/decisions`, 1440 and 390, EN and RU. Steps: type `Eta`, Enter, type "urgent" in "Correct the assistant…", Enter, Approve (`m4i.ts`). Same with `#ask Clarify me` -> tap "Tomorrow" -> Approve.
Happened: two rows "Created task “Eta” / You wrote: “urgent” / You approved it" and "Created task “Eta” / You wrote: “Eta” / You approved it". Only one task exists (checked in the event log).
The answer row shows the raw answer text ("You wrote: “«By when does this need to be done?» — Tomorrow”", RU: "««By when …?» — Tomorrow»" with doubled guillemets and English text in a Russian row).
Expected: the superseded reading reads "Replaced by your correction" (or is folded into one row); only the approved reading says "Created" / "You approved it". The log must not say something happened that did not.
Screenshots: qa13/m4b-7130-1440-light-en-US.png, qa13/m4b-7120-390-dark-ru-RU.png.

### M2 medium — A message about an existing task is sent to the model twice (identical `/api/parse` requests), and the log gets two rows
Composer, 1440 EN. Create "Gamma"; type `rename task Gamma to Delta` (also `add to Delta: eggs, flour`, `solved in …`, `close task …`, `delete activity …`), Enter (`m4f.ts`).
Happened: two identical `POST /api/parse` ({"text":"rename task Gamma to Delta","domain":"task","thread":[]}) and two identical responses; the log shows "Suggested changing “Delta”: title" twice, "Suggested subtasks for “Delta”" twice, "Closed … as Done" twice.
A plain new task ("Gamma", "Alpha one") sends one request. With a real model this doubles the cost and latency of every edit message.
Expected: one request per message. Screenshot: qa13/m4b-7101-390-dark-en-US.png.

### M3 medium — The log says "Shown to you for approval" for edits that were approved and applied; creates say "You approved it"
`/decisions`, 390 dark EN (`m4f.ts`, `m4b.ts 7101`). Approve "rename task Gamma to Delta": the task is now "Delta" (Now list), but the log row reads "Suggested changing “Delta”: title / Shown to you for approval".
Same for "add to …" and "solved in …" (all edit kinds); only task creates and activity starts get "You approved it" (the `close task` rows do too). Also the subject uses the current title in some rows ("Delta")
and the original in others ("Created task “Gamma”" for the same task), and "…: title" does not say what changed to what.
Expected: every approved action says "You approved it"; "Renamed “Gamma” to “Delta”". Screenshot: qa13/m4b-7101-390-dark-en-US.png.

### M4 medium — The time bar cannot be asked `#ask <title>`, and text it reads as a task ends in "The assistant could not read this. Try again."
Now, 1440 light and 390 dark EN. In "What are you doing?" type `#ask Bar question`, Enter (`m1e.ts`).
Happened: red line "The assistant could not read this. Try again." under the bar, no card. The fake answers `#ask` with a `task.create`, which the activity bar rejects; so the brief's "typing `#ask` in the time bar makes the fake ask two questions" does not hold, and the bar's question path can only be checked by intercepting `/api/parse`.
With a mocked response carrying questions (`m1f.ts`) the bar card is right: chips 20m / 1h / 2h, a tap sends «How long will it take?» — 1h as a correction with `domain: "activity"` and the thread, the card is revised to "Expect: ~1h" and Approve starts it.
Expected: (a) `#ask` should produce activity questions in the bar (fake), and (b) a task-like text typed in the bar should say what to do ("This looks like a task: add it above"), not "Try again", which can never succeed.
The same sentence appears for the composer when nothing can be done (`close task Nonexistent`) while the log says "Found nothing to do in your text" (L6).
Screenshots: qa13/m1e-d-bar-card.png, qa13/m1f-m-card.png, qa13/m1f-d-card.png.

### L1 low — After a tap on an option the answer leaves no trace, and the busy state looks enabled
Composer, 1440 light EN. `#ask Buy milk`, tap "Tomorrow" (`m1a.ts`, `m1d.ts` with the parse delayed 2.5 s).
Happened: the question vanishes; the card text is unchanged ("Category: Personal / Importance: Normal", with the fake there is no deadline), so the person cannot tell whether the answer was taken. While waiting, both options dim to 50 %
(the chosen one is not distinguished) and the spinner is only in the small send button; Approve, Cancel and the correction field stay fully opaque although disabled.
Expected: echo the answer ("You answered: Tomorrow") or mark the chosen chip while busy; dim or label the other controls. Screenshots: qa13/m1d-answer-busy.png, qa13/m1a-after.png.

### L2 low — Approve and Cancel show no shortcut; Escape in the field still does not dismiss the card
Composer card, 1440. The sidebar and the task screen show "N" / "Ctrl+Enter" on buttons, the card's Approve (Enter) and Cancel (Esc) do not. Escape with the caret in the line leaves the card open (round 11 L1, unchanged); after clicking elsewhere it closes (`m4j.ts`). Screenshot: qa13/m1a-card.png.

### L3 low — A question without options gives no cue where to answer
`#ask …`, "Is this for work or home?" is only an amber line; the hint "Approve keeps what is shown. Answer the questions to refine it." does not say "type your answer below". The Approve button sits between the question and the correction field. Screenshot: qa13/m1c-390-dark-card.png.

### L4 low — Assistant log: search and empty-state wording
`/decisions`, 390 light EN (`m4k.ts`). Search runs only on Enter (no button, no hint); no match shows "No decisions yet." (should be "Nothing found"); the screen is titled "Assistant log" but the field and the empty/failed texts say "decisions" ("Search decisions", RU "Поиск по решениям", "Решений пока нет") — round 11 L7c, unchanged. A row about an activity is not tappable (correct) but looks like the others except the chevron. Screenshot: qa13/m4k-search.png.

### L5 low — Log wording
`/decisions` EN/RU. "via the assistant model" / «через модель ассистента» is vague next to "via local rules"; a card dismissed with Cancel is logged "Shown to you for approval" with no word that you dismissed it (`m4i.ts`); RU rows quote the model's English questions. Screenshot: qa13/m4b-7120-1440-light-ru-RU.png (same text).

### L6 low — The card and the log disagree about "nothing to do"
Composer, EN. `close task Nonexistent` (or `rename task Nonexistent to X`): the composer shows "The assistant could not read this. Try again." (red), the log says "Found nothing to do in your text". The first blames the assistant and asks for a retry that cannot help. Screenshot: qa13/m4c output (text), qa13/m1e-d-bar-card.png (same sentence).

### L7 low — New task accepts a past deadline without a word, and a daily series then shows a not-yet-started instance as "9d late"
New task, 1440 EN. Due Oct 20 (today Oct 31), Every day, Create (`m2i.ts`). The row says "10d late · final deadline Nov 6 23:59" and, in "In future", "Starts tomorrow 19:07 · 9d late · final deadline Nov 6 23:59": an instance that has not started is already late, and the task screen shows "Start today 19:07" after "Due Oct 20". A due date before the start is not flagged in the form. Screenshot: qa13/m2j-1440-light-en-US-TwoDatedaily.png.

### L8 low — The final-deadline picker: wrong icon, no visible label, early error far from the field
New task, 1440 light EN. "Main due + final deadline" -> "On a date": the chip "No final date set" has the play icon (the one of "Starts now"), no "Final deadline" label (only its aria-label), and the red "Set a main due date and a later final deadline." appears at once, below the Repeat chips. Screenshot: qa13/m2h-ondate.png.

### L9 low — The task screen's repeat line: no instance/series cue, "on the last day" for a 31st, no category chip
Task screen, 1440 and 390 EN/RU. "Repeats: Every month on the last day" for a task due on the 31st (a due on the 30th would read the same); the screen does not say it is one instance of a series or offer to stop it outside Edit; the header chips show "Normal · Not started" only, while the row has "Personal" too (RU the same). Wording is otherwise right (EN "Every Thursday", "Every 3 days, until Dec 10", "Every weekday (Mon–Fri)"; RU "Каждый месяц, 10‑го числа", "Окончательный срок"). Screenshots: qa13/m2g-1440-light-en-US-Every3.png, qa13/m2l-390-dark-ru-task.png.

### L10 low — A row past both deadlines says only "29d late"
Now, EN. Main due Oct 1 + 7 days (final Oct 8, both past): the row reads "29d late" and omits the final deadline that has also passed, unlike the two-stage rows that still have one ("10d late · final deadline Nov 4 23:59"). Screenshot: qa13/m2j-1440-light-en-US-now.png.

### L11 low — On a phone with activities running the New task form is an inline card, and the bar covers ~28 % of it
Now, 390x844 dark RU, "Пошёл в ЦСС"/"Музыка" running. "Новая задача" opens inside the page (a collapsible card, not a bottom sheet), the title opens in error ("Дайте задаче название."), and the running rows + "Начать другое" stay fixed over the lower 240 px, hiding the Repeat and Description fields until you scroll. Screenshot: qa13/m2s-open.png, qa13/m2r-form.png.

### L12 low — Approving a typed start does not say it stops what runs
Now, 1440 EN, "Walk" running; type "Reading" -> card "The assistant will start “Reading”" -> Approve: "Walk" disappears (replaced). The card names only the new activity. Screenshot: qa13/p3-typed-card.png.

### L13 low (unchanged from earlier rounds, re-checked)
- Round 11 L2: the New task form opens with the Title already red ("Give the task a title.") and an unlabelled chip row (`m2a-form.png`).
- Round 11 L3: the toast after Approve still says "Done" / "Undo" (`p3.ts`).
- Round 11 L4: "To Inbox" gives no toast (only the badge 0 -> 1, `p1.ts`).
- Round 11 L11: every route's `document.title` is "Pace".
- Round 11 L8: Insights RU 390 `scrollable-region-focusable`.
- Round 11 M3 remainder: the next instance of a series starts at the creation time of day (19:06), e.g. "Starts Nov 30 19:06 · Due Nov 30 23:59".
- Round 12 L1/L2/L3 not re-tested (not touched by this change).

## Owner requests

Met:
- Questions answerable with one tap (round 11 M1): options are 44 px buttons in a labelled group, Enter/Space on a focused option answers WITHOUT also approving (`m1b.ts`), a tap sends «question» — option as a correction and the answered question disappears, double taps while busy are ignored, a hint near Approve while questions are open, Approve with questions open creates exactly what the card shows. Works on 1440 and 390, light and dark, EN and RU (the hint is translated; the questions and options are the model's own words). Time bar: works with a model answer that carries questions (L1/M4 aside).
- Repeat and final deadline readable without Edit (round 11 M2): "Repeats …" and "Final deadline …" on the task screen and a repeat icon (aria-label "Repeats") on rows in Now, the future list and the time bar's Task picker, for every kind created (every day, weekdays, every N days with an end date, weekly, monthly on the 31st with an end date, two-stage after N days and on a date, past due); correct chains for monthly (Oct 31 -> Nov 30, Jan 31 -> Feb 28 2027).
- The Assistant log in words (round 11 M4): "Created task “…”", "Started “…”", "Closed “…” as Done", "Found nothing to do in your text", "You wrote: “…”", "You approved it", "Shown to you for approval", "via …"; task rows open the task (Back returns to the log); EN/RU complete, no raw keys, both widths. See M1-M3 for what it gets wrong.
- No "Assistant unavailable" banner and no slowness with the fake provider (`/api/parse` ~20 ms); the banner appears only when the call fails.

Not met / partly: re-adding a repeat in Edit (H1); one request per message (M2); a truthful log (M1, M3); `#ask` in the time bar (M4); round 10/11 items listed in L13.

## UX heuristics walk (this round's areas)

Every control earns its place: the card's "↵" send button next to the correction field is the one icon-only button without a visible label (L2 family). One way per job: answering by tap, by typing, and by Approve are three distinct jobs; "Approve keeps what is shown" makes the third explicit.
Platform conventions: the option group is keyboard reachable with a visible ring; Escape closes the card only after focus leaves the field (L2). State you can see: repeat and final deadline are now visible (M2 met); the answered question leaves no trace (L1); the log's states (shown / approved) are wrong in places (M1, M3). Feedback and motion: the card changes without animation when a question disappears (jump). Copy: L4-L6. Forms keep their promise: every composer entry path was submitted (typed + Enter, Send button, "+" over a typed line -> form with the title prefilled, To Inbox, N from the sidebar, time-bar picker/typed/Approve/Chores picker); the Edit path broke it (H1). Overlays: the "Check the values and try again." toast lands bottom-left over the sidebar and the Save button's sheet stays open (H1). Visual matrix: the new texts fit at 390 and 1440 in both themes and both languages; the only wrap issue is the phone form (L11).

## What works well
- The question block: clean labelled groups, 44 px targets, the focus ring, the translated hint, no accidental approve from Enter on an option, revised card after a tap, double-tap protection.
- The series line wording in both languages, including end dates and the clamped 31st; the repeat icon is consistent across Now, the future list and the Task picker; the Edit sheet round-trips repeat kind, interval, end date and two-stage values for a series or a plain task.
- The log is now readable by a person, tappable into the task, searchable, and identical in structure in RU.
- 128-page sweep and axe pass clean apart from the known Insights item.
