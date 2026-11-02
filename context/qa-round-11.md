# QA round 11 — assistant cards, the phone's folded time bar, recurrence

Tester: Claude exploratory QA agent, 2026-10-31. Web export built from `fcbd256` and re-built from `0c52077` (HEAD moved twice during the run;
every finding below was re-checked on `0c52077` unless it says otherwise). Stack: local Worker :8797 (`LLM_PROVIDER=fake`, `ENVIRONMENT=test`), fresh state;
web on :4183 from a private `dist` (the shared `apps/app/dist` was overwritten by another build on :8787 mid-run, so the QA build lives in the scratchpad).
To see real-model cards (category, project, deadline, estimate, importance, subtasks, questions, guessed fields) a second Worker on :8798 used
`LLM_BASE_URL` pointing at a small OpenAI-compatible mock (`mock-llm.ts`) that answers `#rich`, `#guess`, `#ask`, `#multi`, `#act` with scripted
`ModelOutput` and echoes everything else like the fake provider. All scripts and screenshots: /tmp/claude-0/-home-user-pace-dev/35bc1c82-fe54-55b9-b221-7cf8441289b9/scratchpad/qa11/
(abbreviated `qa11/` below; every path in this file is under that directory).

Route sweep (`sweep.ts`): 22 routes on the RU lived-in account and 18 on the EN fresh one, x 1440/390 x light/dark = 160 pages: no page error, no console error, no failed request,
no raw key, no horizontal page overflow. axe (WCAG 2.2 AA) on 12 routes x 4 combos x 2 languages: one violation (L8). RU text scan: no stray English except seed data.

## Summary

| Severity | Count |
|---|---:|
| Blocker | 0 |
| High | 1 |
| Medium | 6 |
| Low | 16 |

Not testable here: real model parsing (the mock stands in for it), the Telegram confirmation completing (Wipe/Delete return 503 here: no bot), the Telegram login widget
(shows "Bot domain invalid" on localhost), phone calendar/usage access/notifications, Android sleep guess (skipped as asked), a login started in one tab and finished in another.

## Findings

### H1 high — The phone's folded time bar never folds when Now opens (the round-10 M4 fix does nothing on a real load)
Now, 390x844, light and dark, RU lived-in account (activity "Пошёл в ЦСС" + parallel "Музыка" running), also EN account with "Walk" running. Open `/` (cold load or reload), wait 3 s.
Happened: the running rows, then a "Начать другое ⌄" row, and under it the field and all four buttons, fully open; the list gets ~1.5 tasks, exactly as in round 10. The chevron points
down (open). Tapping "Начать другое" folds it (and that fold looks right: running rows + one row, room for 3 tasks), so the fold works only after a manual tap.
Expected: opened on something running, the bar starts folded (commit 62e2a40 says so; the unit test mounts with the activity already in the store).
Cause (code reading): `useFold` seeds its state from `runningId` at first render; on the web the store hydrates after the first render, so the seed is `null` ("open") and
`foldedFor === null` stays open when the id arrives. Switching tabs does not help either (the Now tab stays mounted). Reproduced at `fcbd256` and `0c52077`; `t31.ts` polls the button every 500 ms for 4 s on both accounts: never folded.
Screenshots: qa11/t1-ru-390-now-settled.png (open), qa11/t3-ru-390-dark-folded.png (after a manual tap), qa11/t2-ru-390-now-after-nav.png.

### M1 medium — Assistant questions show no answer options, and are not tied to what they ask about
Now, 1440 light EN and 390 dark RU. Type `#ask Съездить в банк` (mock answers with two questions: "By when does this need to be done?" options Today/Tomorrow, and "Is this for work or home?").
Happened: the card shows both questions as plain amber lines, no options, no label of the field they concern, no way to answer but to type a correction in "Correct the assistant…".
The model's `options` (up to 6 per question) are not used anywhere in `apps/app/src/shared/assistant` or the bot. Approve stays enabled while questions are open, with no hint that approving ignores them.
Expected: option chips that apply the answer as a correction (one tap), or at least "Answer below" copy. Screenshot: qa11/t7-ru-390-dark-case1.png.

### M2 medium — Nothing on the task screen or the list says that a task repeats, or what its final deadline is
Now, 1440 light EN. New task → deadline Oct 31 → Repeat "Every month" → Create; open the task. Also: Edit → "Main due + final deadline" (7 days) + "Every day" → Save.
Happened: the task screen shows Start / Due / Work left / Tracked only; no "Repeats monthly" line, no "Final deadline Nov 12", no marker on the Now rows. The repeat and the final deadline exist only
inside the Edit sheet, so the person cannot tell a series from a one-off, or stop one, without opening Edit. The Task picker lists the instances as identical rows (M6).
Expected: a "Repeats every month" line (and "Final deadline …") in the details card and a repeat icon on the rows. Screenshots: qa11/t13-future-task.png, qa11/t36-after-save.png.

### M3 medium — The next instance of a monthly task with a far deadline lands on the wrong day
Now, 1440 light EN. New task "Jan31 monthly", deadline Jan 31 2027 (three months ahead), Repeat "Every month", Create (today is Oct 31).
Happened: the first instance is due Jan 31 2027; the next one "Starts Nov 30 15:27 · Due Mar 2 2027 23:59", i.e. February is skipped and the due day is the 2nd. The series shifts the start by one month and keeps
the 92-day start-to-due window. Also the next start time is the creation time of day (15:27, "Starts Nov 2 15:28" for Every N days) which the person never chose.
Expected: next due Feb 28 2027 (one period after the due date, short-month clamped). When the deadline is near the series is right: Oct 31 → Nov 30 → Dec 31 → Jan 31 → Feb 28 → Mar 31 (checked by closing each instance; no drift), and Weekdays on a Sunday due date → Monday. Screenshot: qa11/t18-now.png (list text), qa11/t15-Jan31_monthly.png.

### M4 medium — Assistant log shows internal identifiers and not what was typed
`/decisions` (Bell → Notifications → "Assistant log", or direct), 1440 and 390, EN (RU is the same). Every row reads "Assistant · parse.task.create · read" / "parse.activity.start", subtitle "Parsed by compatible; every field matched the text."
Happened: raw action keys, the provider's internal name "compatible", the same title on all rows, no text of the request, no result, rows are not tappable. The page cannot answer "what did the assistant do with my message".
Expected: "Created task “…”" / "Started “Gym”", the typed text, and the "not found in the text: project, subtasks" note in words. Screenshot: qa11/t42-d-decisions.png.

### M5 medium — Wipe / Delete confirm button text overflows its box in Russian on a phone
Settings, 390x844, dark (light too), RU. Scroll to "Опасные действия", tap "Очистить данные" or "Удалить аккаунт".
Happened: the danger button "Очистить — подтвердить в Telegram" / "Удалить — подтвердить в Telegram" wraps to 3 lines and the first and last lines are cut by the button border (text spills out of the pill);
the Cancel button sits at the same height. EN fits. Expected: the button grows with its text or stacks under Cancel full-width. Screenshots: qa11/t23-ru-m-wipe-confirm.png, qa11/t23-ru-m-delete.png.
(Round 10 M5 otherwise fixed: danger-coloured outline, both buttons say "confirm in Telegram"; the 503 error text "Could not start the confirmation. Try again." is shown in this environment.)

### M6 medium — Time bar's Task picker cannot tell same-named tasks apart
Now, 1440 and 390, EN account with recurring tasks. Tap "Task" in the bar.
Happened: six rows for three tasks: "Weekday Fri / Every3 / Jan31 monthly" and then the same three again (the future instances), each with only a title and the category chip; no due date, no "starts Nov 30". Picking the wrong one tracks time on the wrong instance.
Expected: a second line with the due date (as the Now rows have) or hide the future instances. Screenshot: qa11/t24-d-Task.png.

### L1 low — Escape in the field that opened the proposal card does not dismiss it, while Enter in the same field approves
Now, 1440, EN. Type a line in "Add a task or paste text", Enter (card shown); press Escape with the caret still in the field: nothing. Click on the card text and press Escape: the card closes. Enter in the same field approves.
So round 10 L3 is fixed only when focus is elsewhere; the usual state (caret in the field) is not covered. The "Correct the assistant…" field was not checked. Screenshot: qa11/t8-a.png.

### L2 low — New task form opens already in error and keeps the old hidden-state hints
Now, 1440, EN/RU, `N` or "New task". The empty Title is red with "Give the task a title." before any attempt; the "Starts now · No deadline · Default (30m)" chip row has no label; "Deadline type" and "Repeat" show with no deadline set (round 10 L4, unchanged). Screenshot: qa11/t10-newtask-n.png.

### L3 low — The toast after approving an assistant action says only "Done", the same word as the task's Done button
Now, 390 dark RU ("Готово" + "Отменить") and 1440 EN ("Done" + "Undo"). After Approve the task opens with a green "Done Ctrl+Enter" button and a toast "Done / Undo" over it: the toast reads as "task completed" and Undo as "reopen".
Closing a task says "Done: Monthly rent" (good). Expected "Task created" / "Started “Gym”". On desktop the toast covers the sidebar's bottom. Screenshots: qa11/t7-ru-390-dark-after-approve.png, qa11/t34-long-task.png.

### L4 low — "To Inbox" gives no feedback
Now, 1440, EN. Type a line, click the inbox icon: the line clears, the sidebar badge goes 0 → 1; no toast, no row, nothing says where the note went (checked at 100/400/900 ms). Screenshot: qa11/t29-to-inbox.png.

### L5 low — Still no offline indicator
Now, 390 light, EN, DevTools offline. Idle, typing a line, approving a rule-fallback card, creating a task: all work (and sync back), the rule banner "Assistant unavailable. These actions come from local rules…" is good, but nothing says the device is offline or that changes are unsynced (round 10 L9). Screenshot: qa11/t30-offline-idle.png.

### L6 low — The Calendar picker on the web talks about the phone
Now, 390 dark, EN. Tap "Calendar": "Nothing on today in the calendar your phone sends (Pace on Android, with the calendar on in Settings → Devices)." plus a "Calendar from the phone" button that leads to Devices (round 10 L7). Screenshot: qa11/t24-m-Calendar.png.

### L7 low — The same thing has two names
(a) A task's kind is "Category" in the New task form, the assistant card ("Category: Work") and the activity sheet, but "Presets" in Settings and on /presets, while activity categories (Work, Study, Sport…) are a different list also called "Category". (b) RU: "Изменить занятие" + "Удалить активность" in one sheet; "Отмена" (Settings confirmations, project form) vs "Отменить" (assistant card), and "Отменить" also means Undo in History rows and the toast. (c) "Assistant log" / "Search decisions" / "decision log" in the delete text.

### L8 low — Insights: a tile label breaks mid-word, and the page scroll area is not keyboard-focusable
Insights, 390, RU light/dark. "Переключени й в день" (round 10 note, unchanged). axe: `scrollable-region-focusable` (serious) on `/insights` RU 390: the scroll container has no focusable child. The hourly chart is one unlabeled bar. Screenshot: qa11/t39-insights-390.png.

### L9 low — The web build shows sections that can never have data
Day (1440/390): "Screen time 0m — Nothing recorded / Нет данных" under every day; the Day activity sheet: "Apps during this time — No data"; Settings → Devices copy about phones. Android-only concepts as empty sections on the web (round 10 L6/L7 family). Screenshot: qa11/sw-ru-1440-light-_day.png.

### L10 low — Tap targets
Now, 390: composer "+", "To Inbox", "Send to the assistant" are 36x36 (the rest of the app uses 44); the task screen's link under the title is 15 px high; Week blocks 26–39 px (inherent). Switches are 48x24 (meets the 24 px minimum, round 10 M2 fixed; focus ring present).

### L11 low — Every screen has the same document title
Any logged-in or guest route: `document.title` is "Pace" (Now, Day, Settings, Week…): browser tabs and history cannot tell screens apart. Document language is correct (`ru`/`en` follows the locale).

### L12 low — "Start something else" / "Начать другое" does not say whether it is open
Phone Now with something running: the row label is the same folded and open; only the chevron flips (down = open, up = folded, the opposite of the usual sheet metaphor for a bar at the bottom). Screenshots: qa11/t3-ru-390-dark-folded.png, qa11/t3-ru-390-dark-unfolded.png.

### L13 low — A title longer than 200 characters is still cut (owner: keep the typed title)
Now, 1440, EN. A 237-character line through the assistant: the card and the task title keep the first 200 characters + "…" and the whole text goes to the description (round 10 M1 was ~90, so improved by 0c52077; before it, this build cut at ~100). The manual form keeps what you type. Still not "the full typed title". Screenshot: qa11/t34-long-task.png (older build, cut at ~100); re-run on 0c52077 is `t34b.ts`.

### L14 low — A doubtful title is printed twice on the card
Now, 390 dark RU, `#multi`: "Ассистент создаст «First thing»" and the line "Задача: First thing (проверьте)" repeat each other (the title line is shown only when doubtful). Better: mark the summary itself ("(проверьте)"). Screenshot: qa11/t7-ru-390-dark-case2.png.

### L15 low — A project the model named but the account does not have is dropped without a word
Now, 1440, fresh EN account (no projects), `#rich …` (model answers project "Работа"), and "Fix the sink in project Nope". The card has no Project line and no note; after Approve no project is created (correct, owner request), but the person who typed "in project Nope" is not told it was ignored. Screenshot: qa11/t4-en-1440-rich-card.png.

### L16 low — Inbox explanation and Telegram widget
Inbox (empty), 390, EN/RU: "Accept takes a note as a task with the guess under it (you can edit it on the task)…" is hard to parse ("с догадкой под ней"). Login on localhost shows the Telegram widget as a white serif "Bot domain invalid" box in the dark theme (environment artifact; check the widget's dark appearance on the real domain). Screenshots: qa11/m2.png, qa11/m3.png.

## Owner requests

Met:
- Cards show the fields an action sets before Approve: task create shows category, project (only when it exists), deadline with time, estimate, importance, subtasks, and `(check this)` / `(проверьте)` on guessed fields (dates/estimates without a quote in the text, unknown project, composed subtasks) in both languages; an activity shows category and "Expect: ~45m". The created task matches the card field for field (checked on the task screen). Several actions render as several cards. (qa11/t4-en-1440-rich-card.png, qa11/t5-ru-1440-case*.png)
- «ем» → Food (round 10 H1): the Day block is tagged Food. qa11/t26-day.png.
- Settings switches focus ring and 24 px targets (round 10 M2), danger-coloured Wipe/Delete confirms (round 10 M5), assistant proposal card with details (round 10 M3), full link on the task screen, Day edit sheet closes on Escape.
- "In project Nope" creates no project; rule fallback, assistant and manual form keep the same typed title.
- Recurrence on the 31st and short months: right for a near deadline (see M3 for the far one).

Not met / partly:
- Phone time bar folded while something runs: not met on load (H1).
- Full typed title: partly (limit now 200, L13).
- Assistant follow-up questions: shown, not answerable by tap (M1).
- Round 10 items unchanged: L2 (L4 then), L5 (Task as chip and field label in the Day sheet), L6, L7, L8 (sidebar user name still "D…"), L9 offline, L11 toast, Insights mid-word, `/more` and `/add` on desktop show Now.
- Not re-verified: description editor Escape (round 10 L1), Escape with the calendar open (L2), the login waiting state "Open the bot again" (M6) — the widget is unusable on localhost.

## UX heuristics walk (breaches are in the findings above)

Every control earns its place: the folded bar's toggle (L12), "Screen time" web section (L9). One way per job: "+" over a typed line vs "New task" vs N all open one form (ok); two names for one thing (L7). Platform conventions: phone sheets slide from the bottom and close on the dim, desktop dialogs centre with ✕ and close on Escape (ok); Escape on the card (L1). Keyboard: Enter/Ctrl+Enter shown on buttons, N opens the form unless typing, Tab order sensible (sidebar, list, bar), Settings switches ringed. State you can see: guessed fields in warn colour (good), doubtful title doubled (L14). Feedback: toasts (L3, L4), offline (L5). Copy: L3, L16, M4. Color: selected chips of different families fill orange/green side by side in the New task form (Personal orange + Normal green) — loud but meaningful. Forms keep their promise: every composer entry path submitted (typed + Enter, + over typed text, To Inbox, pasted multi-line, Approve by Enter, correction field, N, offline rule fallback); each created what its card/form showed. Overlays: toast covers the desktop sidebar's bottom (L3). Visual matrix: M5 only in RU at 390. Guest language: `/login`, `/onboarding`, `/oauth/authorize` follow the browser locale and set `<html lang>`; unknown and protected routes go to `/login`. Sideways content: no scroll regions besides Week blocks; L8.

## What works well

- The assistant card is clear and honest: one line per field, guessed values in the warning colour with "(check this)", the same wording as the bot, several actions as several cards, rule-fallback banner, Enter approves, a correction re-reads the whole answer.
- After Approve the task opens with exactly the card's values; activity starts keep category and expected length; «ем» is Food.
- The recurrence series is correct across short months with no drift; Weekdays and Every N days roll right; the Edit sheet shows the whole recurrence (end date, N).
- 160-page sweep and the axe pass are clean apart from L8; RU and EN are complete; both themes have good contrast; Settings switches are focusable with a visible ring.
- The folded phone bar, once folded, leaves room for three tasks and keeps Stop for every running activity.
- Offline add with rule fallback works and syncs back; Wipe/Delete are two-step, danger-coloured and say they need Telegram.
