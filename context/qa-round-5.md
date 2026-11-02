# QA round 5 (exploratory, web build)

Tester: Sonnet QA agent, 2026-10-12 (device timezone Europe/Moscow, "now" about 02:00). Build: fresh `build:web` of HEAD `6be2348` served on :4173 against the local Worker on :8787 (`LLM_PROVIDER=fake`, `ENVIRONMENT=test`), clean working tree. Chromium on Linux (shortcuts therefore read Ctrl, not the Mac symbol).
Accounts: 5001 (`seedLivedIn`, Russian), fresh English accounts 5002-5010. Both themes, 1440x900 and 390x844 (touch, `isMobile`), plus 1023x768, 1024x768, 768x1024 and 1440x520 for sheets.
Screenshots, videos, frame strips and scripts: `/tmp/claude-0/-home-user-pace-dev/3ca1bbcb-4ae4-5c58-a14b-80fb8b0ec97d/scratchpad/qa5/` (`shots/`, `scripts/`); in the findings `shots/x.png` means that folder. Video frame strips were made with ffmpeg from Playwright recordings (`shots/vid-*`).
Coverage: all 19 routes of the route sweep at 1440 and 390, light and dark (shots `sw-<screen>-<d|p>-<theme>.png`), with axe (WCAG 2.2 AA), console errors, failed requests, horizontal overflow, raw-key scan and target sizes on each; the composer (Enter, second Enter, Ctrl+Enter, Escape, chevron, Alt+Enter, Shift+Enter, paste, offline, empty title, RU and EN); the task page (header icons, slider drag at 1440 and 390 with a 2 s sync delay, Work left, Original message); every sheet found (close, edit, Day log, Rest, From calendar, project) at 1440, 1024, 1023, 768, 390 with Escape, click outside, the cross and a dim tap; hotkeys (Ctrl+Enter, F, N, letters in fields, hidden screens, over a sheet); the dissolve (video frames); the typed-activity draft (LLM held back 3 s); the update card (a changed `sw.js` in the gitignored `dist`); filter row behaviour; Tab order and focus rings; offline and a refused parse.
Limits: fake LLM; no Mac (the symbol variants were not seen); reduced-motion, 360/320 px and the real assistant were not re-checked; Android-only flows not covered.

## 1. Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 6 |
| low | 17 |
| cosmetic | 3 |

No console error, no failed request (except the deliberate offline run), no raw key, no horizontal overflow and no crash on any of the 19 routes at 1440 and 390 in both themes. The round-3 feedback is largely in: the palette, the filter row, the percent slider that follows the thumb, the sheets as dialogs and bottom sheets, the shortcuts and their hints, the dashed draft, the tab bar and the new header icons all work. What is left is mostly polish of the two showpiece animations (the composer unfolding and the dissolve both glitch), the paste path, focus handling after Escape, and a handful of convention breaches listed below.

## 2. Findings (most severe first)

### Medium

**QA5-1 (medium) A paste is not read at once after any earlier line: the paste detector compares with stale text.**
Now, 1440x900, light, EN. Steps: type "Aaaa bbbb cccc dddd eeee ffff gggg" (33 chars) in the line, Alt+Enter (to Inbox; the line clears). Paste (fill) "Pay the electricity bill on Friday" (34 chars). Happened: nothing is read, the card stays on the line with Parse/To Inbox. Should: a 34 character paste is read at once and the form unfolds (the owner's "Paste → read at once"). Cause: `useComposerFlow` in `apps/app/src/features/now/composer/composer.tsx` keeps `previousRef` and never resets it in `done()`/`reset()`, so `isPasted(previous, next)` (`next.length - previous.length >= 20`) sees a difference of 1. The same happens after adding a task by Enter, Enter (previous stays at the old line). A pasted message right after a longer typed line is typed-looking and stays unread. A fresh page reads a paste correctly (focus lands in Title). Evidence: `shots/k7-paste.png` (a variant of the same state: previous line 20 chars, paste 34), second run printed 0 forms after 1.5 s.

**QA5-2 (medium) Escape or the chevron-up folds the form but the keyboard focus is lost (document.body).**
Now, 1440, light, EN. Steps: type "Call mom", Enter (the form opens, cursor in Title), Escape (or click "Back to the line"). Happened: `document.activeElement` is BODY, the line is empty-looking but not focused, typing does nothing, the next Tab starts again from the sidebar. Should: the cursor returns to the line with the text, so that Escape and then a correction is one flow (as the cursor moved line -> title on the way in). Same after "Fill in the form yourself" then "Back to the line". Evidence: output of the script; `shots/k2-after-escape.png`.

**QA5-3 (medium) The composer card does not "unfold in place": the line vanishes, the card collapses to a sliver, then the form grows; folding does the reverse.**
Now, 1440, light, EN (also RU). Steps: type "Call mom", Enter, watch (video frames at 25 fps). Happened: the line, hint and Parse button show "The assistant is reading it..." for about 0.1 s, then they disappear at once, the card shrinks from 160 px to 18 px (measured with requestAnimationFrame: 160, 18, 19, 35, 67, 117 ... 772 px over about 250 ms), and only then the form grows from the top of an empty card. On Escape the line and Parse button snap in at once on top while the form is still below it for about 6 frames (two stacked cards), then the form shrinks away. Should: one card whose height animates from the line's height to the form's, with the line fading into the title (the owner's "same card, animation of expanding/collapsing"); a structural change must not jump. Evidence: `shots/anim-enter.png`, `shots/anim-escape.png` (frame strips), `shots/vid-composer/*.webm`.

**QA5-4 (medium) The dissolve ends with a flash: the row comes back for about 0.1 s over the next divider, then fades.**
Now, 1440, light, RU (lived-in). Steps: tick "Купить продукты на неделю" (a task without subtasks). Happened: the specks fly and the row disappears (about 0.75 s), then in the next frames the whole row (circle, title, tags) reappears at full opacity on top of "В будущем · 1" and fades out; the list below jumps up only after that (no animated collapse). Should: the row stays gone after the dust, and the list closes the gap smoothly. Evidence: `shots/dissolve-ghost.png` (frames 74, 78, 80, 82), `shots/dissolve-strip2.png`.

**QA5-5 (medium) Ticking a task off cannot be undone, while deleting can.**
Now, 390 and 1440, EN. Steps: add "Undo test", tap its circle. Happened: the row dissolves and is gone, no toast, no Undo; a mis-tap on the 44 px circle (or Ctrl+Enter on the task page) closes the task for good from the person's point of view (reopening exists on the project page / History but nothing says so). The new delete button, in contrast, has "Deleted: Beta task · Undo". Should: the same Undo toast ("Done: X · Undo") for check-off, which also makes the 0.75 s dissolve safer. Evidence: `shots/chk-1200.png`.

**QA5-6 (medium) The composer form's main action and the hint to press Enter are out of sight.**
Now, 1440x900 and 390x844, EN/RU. Steps: Enter on any line. Happened: the form is taller than the pane; the time bar and quick buttons stay pinned underneath, so "Create Ctrl+Enter" is below the fold (the Problems field is cut by the bar, `shots/c3-form.png`, `shots/f4-ru-form.png`); on the phone the form shows about 550 px of a 844 px screen and Create needs a scroll (`shots/ph3-form-bottom.png`). The only line that mentions the second Enter lives in the hint of the line before it opens; the form's own header says "Read by the assistant. Check the form, then create." and nothing about Enter. Should: show "Enter to add, Esc to fold" in the form header on a computer; keep Create visible (sticky) or let the form take the empty right pane on a wide screen (it is "Pick a task to see it here" next to a cramped 560 px column).

### Low

**QA5-7 (low) The composer has no visible focus indicator.** Now, 1440, light/dark. Focusing the line (click, N, Tab): the textarea has `outline: none` and the card does not change (only the caret). WCAG 2.4.7. Same for the time bar's field. Should: a focus ring or a coloured card border. Evidence: `shots/focus-composer.png`.

**QA5-8 (low) The update card sits top-centre over the Now header, not in a corner, and the copy differs from the plan.** Now, 1440 light and 390 dark. Happened: the card (x 520-920 at 1440) covers the Inbox button and the date; on the phone it covers "Now" and the top of the composer, and in dark it is barely distinct from the page (same near-black surface, faint border) with the composer card peeking out under it. The plan says "A new version of Pace is ready · Refresh to get the latest fixes. Nothing you entered is lost."; the app says "Refresh the page to get the latest fixes." (no reassurance). "Later" hides it until the next load. Should: bottom-right on a computer / bottom on a phone, above the tab bar, with the "nothing is lost" line (the owner asked for plain words). Evidence: `shots/up-both.png`.

**QA5-9 (low) The progress slider moves in 10% steps only.** Task page, any width. The owner asked for percent: 0, 10, ..., 100 are the only values; 25% or 5% cannot be set by drag or arrow keys (the keys move one step = 10%). Should: 1% steps (or 5%), the stored model is 0-10 steps, so say so if it stays.

**QA5-10 (low) RU "Осталось" means two things on one screen.** Now (1440, RU): the row says "Срок завтра 01:53 · осталось 23 ч 59 м" (time to the deadline) and the open task card's "Осталось 36 м" is the work left. English keeps "left" in the row and "Work left" in the card. Should: "Работы осталось" or "Осталось работы". Evidence: `shots/p2-dragging.png`.

**QA5-11 (low) Touch targets under 44 px on the phone.** 390, RU/EN: filter chips 32 px high ("Все", "Алгебра", "Работа"), the "..." (More about) buttons of the quick buttons 32x32, "Да, ещё" and "Стоп" 36 px, theme/language chips 32 px, preset chips 32 px. Axe's 24 px minimum passes; the rest of the app uses 44.

**QA5-12 (low) The phone tab bar shows icons only.** 390, all screens: five icons (bolt, clock, folder, bars, gear) without captions; the active tab is told only by a darker icon, not by the accent. Week, Inbox and History have no tab and are reached by small icon buttons (Week by an unlabeled calendar icon in Day's header). Should: captions under the icons (they exist as accessible names) and the accent colour for the active tab. Evidence: `shots/sheet-p-light-1.png`.

**QA5-13 (low) Dark theme, project page: "Открыто: 1" fails contrast (3.91:1).** `/project/<id>`, 1440 and 390, dark, RU. 11 px muted text (#8a8a93) on the tinted summary card; axe `color-contrast` serious. Evidence: sweep output, `shots/sw-project-d-dark.png`.

**QA5-14 (low) Week: a two-minute block is a 2 px bar.** `/week`, 1440 and 390: "Собираюсь 00:00-00:02" renders 108x2 px (axe `target-size` serious). Should: a minimum height (e.g. 12 px) for a tappable block.

**QA5-15 (low) Keyboard: nine sidebar stops before the content, and every chip is a stop.** Now, 1440: Tab goes New task, 8 nav items, Inbox, composer ... there is no skip link; the filter chips (role radio) are three separate stops instead of one group moved by arrows. Same on every screen.

**QA5-16 (low) A change on the web reaches the server only on the next 30 s tick.** Now, any: add a task and poll `/api/sync/pull`: the task arrives 28 s later (the one extra push is the timer; no push follows the change). Local-first keeps it safe on this device (reload and offline keep the task), but the bot, MCP and a second device see nothing for up to 30 s, and a person who closes the tab inside that window relies on IndexedDB being there on the next visit. Should: push on change (debounced 1-2 s) and on page hide.

**QA5-17 (low) Clearing the title and pressing Enter adds the task titled with the original line, silently.** Composer form, 1440, EN. Empty Title + Enter closes the form and adds "Another one" (the typed line). Arguably fine, but nothing says it; a blank title should show "Title is required" or keep the form. Evidence: `shots/m2-empty-title.png`.

**QA5-18 (low) The "New task" state has no marker.** `/add` (N or the sidebar button, 1440): the page is Now with no sidebar item highlighted (neither "New task" nor "Now"); the composer shows no focus ring (QA5-7), so it is not visible that it is waiting for text. Evidence: `shots/x3-newtask.png`.

**QA5-19 (low) The right pane's "Back" button closes the pane.** Now, 1440, task selected: the chevron-left beside the project name returns to "Pick a task to see it here" (on a phone it is a real back). On a split view the label should be a close, or it should be dropped (heuristic: every control earns its place).

**QA5-20 (low) "From calendar" and its sheet on the web: a button that cannot work.** Now (1440), tap "From calendar": a sheet says nothing is in the calendar and events come from the Android app. A tracker button that is always dead on this platform, shown at the same weight as Rest/Sport/Chores. Should: hide it on the web or grey it with the reason inline.

**QA5-21 (low) Create-project is an inline form with Cancel, not a sheet.** `/projects`, 1440 light: "New project" unfolds a card with "Cancel" and "Create". The round-3 convention (cancel only in confirmations; forms are sheets with a cross) is broken here. Evidence: `shots/sh-sheet.png` (bottom right).

**QA5-22 (low) Long sheets keep the main button below the fold.** Edit task at 1440x520, 1023x768 and 390x844: the "Save Ctrl+Enter" button is the last item of the scrolling body; on a short window it is cut off (the keyboard shortcut works, a mouse user must scroll). Should: a sticky footer for the action. Evidence: `shots/bp-1023x768-edit.png`, `shots/bp-1440x520-edit.png`, `shots/ph5-edit-sheet.png`.

**QA5-23 (low) The task toast overlaps the time bar and straddles the two panes.** 1440: "Deleted: Beta task · Undo" is centred on the window, over the time bar's field and the pane divider. Better: bottom of the pane the action happened in, above the time bar. Evidence: `shots/x1-deleted-400.png`.

**QA5-24 (low) Insights: an empty chart without a message, a word broken mid-word.** `/insights`, 390 and 1440 RU: "Фокус по часам дня" is a blank frame with axis labels (no "no focus yet"), and "Переключени/й в день" wraps inside a word in the 3-tile row at 390.

### Cosmetic

- **QA5-25** Task page tags show "Normal" + state but not the category ("Personal") that the Now row shows; the focus button reads "Focusing" (a state) with a stop square while the time bar says "Stop" (two names for one action).
- **QA5-26** Close sheet: the exact-time chip is an icon-only calendar button; the preview says "Recorded 02:00 · happened 02:00" (jargon).
- **QA5-27** Project colour swatches: two near-identical yellows (positions 4 and 10); History rows each carry an "Отменить" text button whose meaning (revoke the event) is unclear next to "Cancelled" tasks.

## 3. UX heuristics walked (docs/qa.md)

- Every control earns its place: breaches QA5-19, QA5-20; fixed since round 3: the lone "All" (the row shows only with 2+ groups; selecting "Работа" and ticking its only task released the filter to "Все", the row stayed because Алгебра and a no-project task remain), "+", Back in sheets.
- One way per job: Done exists in the footer, circle and Ctrl+Enter (fine); "Focusing/Stop" twice (QA5-25).
- Platform conventions: dialog centred with a cross, Escape (also with the cursor in a field) and an outside click close at 1024 px and up; at 1023 and 768 a bottom sheet (640 px wide) with a handle that closes on the dim; on the phone the dim tap closes (tested for Close and Edit). Breach: QA5-21 (inline form with Cancel), QA5-22.
- Keyboard on a computer: Enter reads, Alt+Enter Inbox, Shift+Enter a new line, Esc folds, Ctrl+Enter adds/saves/closes/Done, F focus, N new task (from Settings it opens /add); letters typed in fields ("fn f n") do nothing; F and Ctrl+Enter on Day did not touch the task of the screen behind; over an open sheet "f" and "n" are ignored. Phone shows no hints. Breaches: QA5-2, QA5-6, QA5-7, QA5-15.
- State you can see: Normal green, In progress blue, Personal tangerine, ASAP red - no two grays side by side except "Not started"/"Paused" next to a green tag; the dashed draft outline appears while the assistant reads "Went to the gym, 20min" and becomes the filled tag when read (light and dark).
- Feedback and motion: QA5-3, QA5-4, QA5-5; the slider value never snapped back (checked every frame with a 2 s delayed sync), the number and Work left follow the thumb.
- Copy: QA5-8, QA5-10, QA5-26; offline composer line ("The assistant could not be reached: the rules filled in the form. Check it before adding.") is clear.
- Color: one indigo accent for actions, in both themes; the only shouting colours left are the orange "Всё ещё этим занимаетесь?" bar and the solid tangerine/green selected chips (acceptable).

## 4. Owner requests of feedback-3 not (fully) met

| Request | Status | Evidence |
|---|---|---|
| Enter -> same card unfolds into the form, animated; folds back animated | partly: it works, but as a swap and grow, not the same card (QA5-3) | `shots/anim-enter.png`, `anim-escape.png` |
| Paste -> read at once | partly: only when the paste is 20+ chars longer than the last typed text (QA5-1) | `shots/k7-paste.png` |
| After folding, keep typing | not met (QA5-2) | focus is BODY |
| Progress "in percent", number follows the thumb, no jump back | met, but only 10% steps (QA5-9) | `shots/p2-dragging.png` |
| Dissolve like Telegram | met with a flash at the end (QA5-4) | `shots/dissolve-ghost.png` |
| Update card with better text | partly: place and copy (QA5-8) | `shots/up-both.png` |
| "Fill in by hand" gone, form like before | met (chevron, title takes the line) | `shots/k3-by-hand.png` |
| Hotkeys shown on buttons, OS-aware | met on Linux (Ctrl); not visible Mac variant here | all screens |
| "+" removed, Settings tab, no gear on Now | met (tabs: Now, Day, Projects, Insights, Settings) | `shots/sheet-p-light-1.png` |
| Back removed, Exact/About as chips, dialog on desktop | met | `shots/s1-close-1440-en.png` |
| Wrong cancel icon, delete button | met (circle-slash, trash with Undo) | `shots/x1-deleted-400.png` |
| Tag colours (green, blue, tangerine) | met | `shots/sw-now-d-light.png` |

## 5. What works well

- The palette change is complete and calm: indigo for actions in both themes, tags readable (axe contrast clean on all routes but one), no lime anywhere.
- The slider is solid: the number and "Work left" follow the thumb every frame, the release holds its value through a 2 s slow sync, the value survives a reload.
- Sheets follow the platform: centred dialog with a cross at 1024+, bottom sheet with handle below, Escape and outside click everywhere, Ctrl+Enter acts, no Back/Cancel in the form sheets, Exact/About as two chips.
- Shortcuts are well scoped: nothing fires from the screen behind, from sheets, or while typing letters.
- The filter row and the project filter release, the typed-activity draft, the delete with Undo, the offline composer message and local persistence across a reload are all as asked.
