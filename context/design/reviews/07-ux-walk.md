# 07 — UX walk: owner scenarios end to end, heuristics and inconsistency inventory

Reviewer 07-ux-walk, 2026-11-01, build at commit `057e484` (web export on `:4173`, fake LLM). Read-only.

## Summary

I walked every owner scenario in feedback 2, 3 and 4 in the web build at 390×844 and 1440×900, in light and dark, Russian and English, using six fresh seeded accounts (Telegram ids 3260–3267). I then measured 13 routes in four combinations with `getBoundingClientRect` and computed styles. **35 findings: 0 blocker · 11 major · 20 minor · 4 nit.** Of the **72 owner requests** I checked, **53 are met, 12 partly met, 2 not met, and 5 can't be checked on the web or with the fake LLM** (table below). Most of the owner's flows now work as he asked: three taps to Getting ready, Enter → proposal → Enter, centred dialogs, Back to today, OS picker, danger zone. The overhaul has to fix **consistency**: the same thing is drawn in 5–8 ways.

The three things that matter most:

1. **No page template.** Sibling screens use three different headers. On the phone, the title sits at y = 42 / 32 / 23 and the back chevron at y = 34 / 24 / 14 depending on the screen. On desktop there are two page frames: the content starts at x = 244 on Now and Week and at x = 412 on Day and the rest. History is a sidebar destination but is drawn as a pushed screen (07-006, 07-007).
2. **No list or section system.** Section headers come in 8 treatments, and every one is an `<h1>` (07-009). List rows come in 9 heights and 6 divider rules (07-010). Outlined buttons come in 5 size/radius pairs (07-013). The selected state is drawn 5 ways, 3 of them on the new-task form alone (07-015). The owner's "где-то есть черточки, где-то нет" was fixed in Day only.
3. **Copy and feedback break the owner's own rules:**
   - The update banner went back to the vague "We changed a few things" strip he rejected twice (07-002).
   - After you approve a proposal, the toast says only "Done", the word the task uses for completing (07-004).
   - In Russian, "Отменить" means both Undo and "cancel the task" (07-005).
   - An empty new-task form opens already showing a red "Give the task a title" error (07-001).

Legend for screenshot paths: **BL** = `context/design/baseline/`; **R7** = `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/review-07/shots/`.
Scripts (`r07-*.ts`) are in `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/shots/`. The raw measurements are in `.../review-07/measure-desktop-light-en_phone-light-en_desktop-light-ru_phone-light-ru.json`.

---

## Findings

`id · severity · surface · viewport/theme/lang · file:line · what · why (citation) · suggested fix · screenshot`

### Major

- **07-001 · major · New task form (composer +, sidebar New task / N) · phone + desktop, both themes, RU/EN** · `apps/app/src/shared/task-fields/task-fields.tsx:206`
  - **What:** opening the empty form by hand shows the title field with a red border and «Дайте задаче название.» / "Give the task a title." on the first frame, before any input. The error comes from `values.title.trim() === ""` with no touched or submitted flag. The same component runs the edit sheet.
  - **Why:** docs/qa.md › "Forms keep their promise"; HIG › Entering data ("validate … after people finish"); Nielsen #5 error prevention (an error shown for an untouched field reads as a mistake the person made).
  - **Fix:** show the error only after a Create attempt or a blur. While the title is empty the disabled Create already says enough.
  - **Screenshot:** R7 `s4-phone-unfold-strip.png`, R7 `s4-desktop-unfold-400.png`

- **07-002 · major · Web update banner · all web** · `packages/core/src/i18n/en/shell.ts:189`, `ru/shell.ts:190`, `apps/app/src/platform/update-banner.web.tsx:80-115`
  - **What:** a full-width strip over the app with "We changed a few things. Refresh to see them." and "Refresh". The owner rejected exactly this copy and strip in feedback 3 ("текст тоже надо улучшить"). In feedback 4 he asked for a narrow card with only «refresh page». Stage-8 plan line 56 specified "A new version of Pace" + [Refresh page]. PR #42 (`0cea8a9`) brought the old copy back.
  - **Why:** docs/qa.md › Copy ("never vague («We changed a few things»)"); PRODUCT.md › Voice.
  - **Fix:** the compact card "A new version of Pace · Refresh page" from stage-8 plan line 56. Add a test that pins the string.
  - **Screenshot:** code only. The banner needs a new service-worker version, and redeploying the shared stack is forbidden.

- **07-003 · major · Now, time bar + composer proposals together · phone 390, light, RU** · `apps/app/src/shared/tracking/time-bar.tsx` (no height cap), `time-bar-fold.tsx:17-40`
  - **What:** I sent a typed activity to the assistant, then typed a task in the composer. The time bar (running rows + fold toggle + proposal + field + four buttons) grows to 577 px (y 200–777). The composer's proposal, with its Approve button, is left inside a 122 px scroll window above it, and the task list disappears. The fold toggle "Начать другое" also stays between the running rows and the proposal.
  - **Why:** docs/qa.md › "Overlays in context" (feedback that hides the next action); HIG › Layout (keep primary content visible).
  - **Fix:** cap the bottom region on a phone. Show the time-bar proposal in a sheet, or close one proposal when the other input gets focus. Hide the fold toggle while a proposal is open.
  - **Screenshot:** R7 `s4-phone-light-ru-composer-preview.png`, R7 `s4-phone-light-ru-composer-pending.png`

- **07-004 · major · Toast after Approve (composer and time bar) · desktop + phone, EN/RU** · `packages/core/src/i18n/en/input.ts:212` (`"assistant.approved": "Done"`), `ru/input.ts:215`, `apps/app/src/ui/toast.tsx:107` (`DOCKED = "bottom-4 left-3 w-[200px]"`)
  - **What:** after the assistant creates a task, starts an activity or logs 07:30–08:30, the toast says only "Done · Undo". "Done" is also the task's completion button, so the toast reads as if a task was marked done. On desktop the toast is docked in the sidebar corner at x = 12, while the action happened at x ≈ 500 (composer) or in the time bar.
  - **Why:** docs/qa.md › Copy ("say what happened") and › Overlays in context; HIG › Feedback.
  - **Fix:** name the result ("Task created: …", "Started «Пошёл в ЦСС»", "Logged 07:30–08:30"). Place the toast next to the region that raised it, or at the bottom of the content column.
  - **Screenshot:** R7 `s1-desktop-light-en-3afterEnter.png`, R7 `s2-desktop-light-en-14past-preview.png`

- **07-005 · major · Undo toast and task actions · phone + desktop, RU** · `packages/core/src/i18n/ru/shell.ts:177` (`common.undo` = «Отменить»), `ru/board.ts:117` (`task.giveUp` = «Отменить или пропустить задачу…»), `ru/board.ts:50` (outcome «Отменена»)
  - **What:** after a check-off the toast reads «Готово: Подготовить квартальный отчёт · Отменить», and «Отменить» is also the verb for cancelling a task. Within one session the person sees «Отмена» (Cancel), «Отменить» (Undo) and «Отменена» (Cancelled outcome).
  - **Why:** docs/qa.md › Copy; ISO 9241-110 conformity with expectations (one word, one meaning).
  - **Fix:** use «Вернуть» (or «Отменить действие») for Undo. Keep «Отмена» for dismissing a confirmation and «Отменить задачу» for the outcome.
  - **Screenshot:** BL `states/now-check-toast--phone-light-ru.png`

- **07-006 · major · Screen headers of sibling destinations · phone 390 (all combos) + desktop** · `apps/app/src/screens/history-screen.tsx:167` (PushedScreen), `screens/destination-screen.tsx:29`, `screens/pushed-screen.tsx:26`, `ui/screen-header.tsx:55`, `ui/back-header.tsx:51`
  - **What:** the five rows of More open screens with three header templates. Measured title tops, title sizes and back-chevron tops:

    | Screens | Title top | Title size | Back chevron top |
    |---|---|---|---|
    | Week, Insights | y 42 | 30 px, with eyebrow | y 34 |
    | Projects, Settings | y 32 | 30 px | y 24 |
    | History, Presets, Notifications, project | y 23 | 22 px | y 14 |

    On desktop, History is a sidebar destination but uses the 22 px pushed header at y 14. Settings, Projects and Insights use 30 px at y 28 or 42.
  - **Why:** HIG › Navigation bars (one title style per hierarchy level); docs/qa.md › Platform conventions.
  - **Fix:** two templates only: destination (large title) and pushed (inline title + back). History moves to DestinationScreen. The eyebrow either always reserves its line or never does.
  - **Screenshot:** R7 `phone-headers-strip.png` (red line at y 42), R7 `aria-desktop_history.png` vs R7 `aria-desktop_settings.png`

- **07-007 · major · Desktop page frame · desktop 1440, all combos** · `apps/app/src/ui/screen.tsx:33` (`max-w-[880px] self-center`) vs Now/Week layouts
  - **What:** Now and Week are left-aligned (title x = 244) with a right detail pane. Day, Inbox, Projects, Insights, History, Settings and Notifications centre an 880 px column (title x = 412). Pushed pages put the title at x = 448. Going Now → Day → Week moves the title by 168 px and back.
  - **Why:** HIG › Layout (consistent alignment between sibling views); Gestalt continuity.
  - **Fix:** one desktop frame with a fixed content start (for example x = sidebar + 32). The detail pane is an optional third column, not a different page.
  - **Screenshot:** R7 `aria-desktop_.png`, R7 `aria-desktop_day.png`, R7 `aria-desktop_week.png`

- **07-009 · major · Section headings · all routes, all combos** · `ui/screen-header.tsx:54`, `ui/back-header.tsx:51`, `ui/sheet.tsx:76`, `features/now/now-task-groups.tsx:28`, `shared/activity-usage.tsx:113`, `features/insights/card.tsx:18`, `features/task/subtask-checklist.tsx:90`, `screens/history-screen.tsx:169`
  - **What:** measured treatments for the same role (size/weight, colour, case):

    | Where | Treatment |
    |---|---|
    | Now group | 13/600 fg2 |
    | Disclosures ("In future · 2", "Done · 1") | 13/500 fg2 |
    | Day "Screen time" | 17/600 fg |
    | Task "Subtasks" | 12/500 muted |
    | History "Events" | 12/500 muted |
    | Insights cards | 14/500 fg |
    | Settings, Notifications, Connect AI | 11/400 uppercase 0.66 px |
    | "Danger zone" | 14/600 warn |

    Every one is exposed as `heading level=1`: RN's `accessibilityRole="header"` becomes `aria-level=1` on react-native-web. Settings has 13 h1s.
  - **Why:** WCAG 1.3.1 Info and Relationships, 2.4.6 Headings and Labels (heading hierarchy); HIG › Typography (consistent hierarchy).
  - **Fix:** one `SectionHeader` (one size, one colour, sentence case) plus a separate quiet "eyebrow" only for dates. Pass `aria-level` 2/3 from the kit.
  - **Screenshot:** R7 `aria-desktop_settings.png`, R7 `aria-desktop_day.png`, R7 `aria-desktop_.png`

- **07-010 · major · List rows and dividers · desktop + phone** · `features/day/*` (57 px top-border rows), `screens/history-screen.tsx`, `features/notifications/notifications-screen.tsx`, `screens/more-screen.tsx`, `screens/projects-screen.tsx:68-85`, `shared/tracking/choices-sheet.tsx`
  - **What:** the owner asked in feedback 4 for consistent dividers. That was fixed inside Day only. Across the app (measured):
    - Now: 66 px rows, no dividers, inside a white card that has a header divider.
    - Day: 57 px, top border, inset 412–1252.
    - History events: 69 px, top border, inset.
    - Notifications: 62 px, divider bleeds to 392–1272.
    - Settings: estimate rows 41 px with top border, section dividers bleed 392–1272.
    - More (phone): 56 px, full-bleed x = 0–390.
    - Projects: 56 px tinted cards with 8 px gaps.
    - Chores, Rest and Task pickers: 48 px individually bordered cards, radius 12, 8 px gaps.
    - Subtasks: 52 px, dividers 408–1256, 4 px outside the content edge.
  - **Why:** docs/qa.md › "State you can see" / feedback 4 («Где-то есть черточки, где-то нет»); HIG › Lists and tables (one row style per list kind).
  - **Fix:** two list styles in the kit: an inset grouped list (Settings, More, pickers, Projects) and a plain list with inset hairlines (Now, project page, History, Day, Notifications). One row height per density (44 / 56 / 64). Dividers always inset to the text edge.
  - **Screenshot:** R7 `aria-desktop_day.png`, R7 `aria-desktop_projects.png`, R7 `s2-desktop-light-en-1chores-picker.png`, R7 `aria-phone_more.png`, R7 `s3-desktop-light-en-history-prev.png`

- **07-013 · major · Buttons · desktop + phone** · `ui/button.tsx` (48 px, radius 10), `shared/tracking/running-row.tsx` / `time-bar-fold.tsx:61` (44 px, radius 12), `screens/projects-screen.tsx:25` (hand-rolled 44 px, radius 12, full width), `shared/tracking/time-bar.tsx` (56 px, radius 14, 2 px border), composer icons (36 px round)
  - **What:** outlined secondary buttons come in five size/radius pairs. Width rules also conflict:
    - Desktop Settings buttons are content-width (the owner asked for this), but Projects "New project" is 848 px wide.
    - Phone Settings buttons are full-width except Wipe and Delete account, which are inline at 106 / 140 px.
    - Adjacent device rows have "Revoke" at 86 px and "Disconnect" at 113 px.
  - **Why:** feedback 4 («На пк чето кнопки слишком широкие»); HIG › Buttons (consistent sizes per role).
  - **Fix:** kit sizes small 32 / regular 44 / large 52 with one radius scale. Width is a layout rule (phone stacked full-width actions; desktop content-width), never set per screen. Move "New project" to the kit.
  - **Screenshot:** R7 `aria-desktop_projects.png`, R7 `s3-phone-light-en-wipe.png`, BL `states/settings-add-computer--desktop-light-en.png`

- **07-014 · major · Settings › Danger zone · all combos** · `apps/app/src/features/settings/delete-account.tsx:163` (`variant="secondary"`), `:176` (`variant="ghost"`)
  - **What:** under a red "Danger zone" heading, Wipe data is outlined with dark text (identical to Log out above it). Delete account is borderless fg2 text with a transparent fill. The most destructive action is styled as the least important. The kit's `danger` variant (`ui/button.tsx:63`) is not used at rest.
  - **Why:** HIG › Buttons (destructive role); Material › Buttons › emphasis; docs/qa.md › Color.
  - **Fix:** both use the destructive style (red text, quiet outline), the same size and the same width.
  - **Screenshot:** BL `states/settings-add-computer--desktop-light-en.png` (bottom), R7 `s3-phone-light-en-wipe.png`

### Minor

- **07-008 · minor · Now column edges · desktop + phone, all**
  - **What:** within one column, measured left edges:

    | Element | Desktop x | Phone x |
    |---|---|---|
    | Eyebrow / title | 244 | 20 |
    | Composer card | 240 | 16 |
    | Filter chips | 240 | 16 |
    | Task list card | 236 | 12 |
    | Time-bar field | 236 | — |
    | "In future" | 244 | 20 |
    | Group header text | 249 | 25 |
    | Row titles | 291 | 67 |

    That is three container edges four pixels apart.
  - **Why:** HIG › Layout (alignment); impeccable › spacing ("one gutter").
  - **Fix:** one gutter token. Every card shares an edge, and text inside cards shares one inset.
  - **Screenshot:** R7 `aria-desktop_.png`, R7 `aria-phone_.png`

- **07-011 · minor · Task rows outside Now · phone + desktop** · `screens/project-screen.tsx`, `screens/history-screen.tsx`
  - **What:** it is the same `TaskRow`, but Now wraps it in a grouped card and the project page and History put it bare on the background. Phone title x is 67 vs 54 and check circle x is 22 vs 9. Desktop title x is 291 vs 446. The project page has no "Open" header, only "Done · 1".
  - **Why:** feedback 2 T7 («должен быть похож на просто список тасок … неконсистентно»).
  - **Fix:** one task-list component (group header + rows) used on Now, the project page and History.
  - **Screenshot:** R7 `aria-desktop_project_01M5YZBMFV2YTDVD6EH8TEGPWZ.png`, R7 `aria-phone_.png`

- **07-012 · minor · Task row height · phone, RU worse**
  - **What:** Now rows are 86 px or 66 px depending on whether "Due …" wraps under the tags. In RU, «1/3 решено» breaks so that «решено» sits alone on a line.
  - **Why:** HIG › Lists (predictable rows); typographic orphans.
  - **Fix:** a deterministic meta layout (tags line + due line always, truncating) or no-wrap groups.
  - **Screenshot:** BL `routes/now--phone-dark-ru.png`, R7 `aria-phone_.png`

- **07-015 · minor · Selected state and colour noise on forms · desktop + phone, both themes** · `ui/chip.tsx`, `shared/task-fields/*`, `features/devices/computer-steps.tsx`
  - **What:** selected state is drawn as:
    - Category and Importance: filled in the category colour.
    - Project, Deadline type and Repeat: grey fill with a 2 px dark (dark theme: white) border.
    - OS picker: solid indigo.
    - Theme radios: grey with a border.
    - Time-bar running: indigo fill.

    Every unselected chip also carries its own coloured outline, so the new-task form shows 12 coloured outlines at once.
  - **Why:** docs/qa.md › Color ("one calm accent … no colour that shouts"); › State you can see.
  - **Fix:** one selected treatment (filled with the accent or the item's own colour), neutral outlines when unselected, and the colour only as a dot or swatch.
  - **Screenshot:** R7 `s1-desktop-light-en-4form.png`, BL `states/task-edit-sheet--desktop-dark-ru.png`, R7 `s3-desktop-light-en-add-computer-2.png`

- **07-016 · minor · Primary action position and shortcut**
  - **What:** new task puts "Create · Enter" top-right in the header. Edit task (same fields) puts "Save · Ctrl+Enter" as a full-width footer. Close puts its footer action on Ctrl+Enter. The proposal shows "Approve · Enter" inline.
  - **Why:** docs/qa.md › One way per job; HIG › Sheets (consistent confirm placement).
  - **Fix:** one rule: primary at the bottom on a phone and top-right on desktop. One shortcut for "commit form" (⌘/Ctrl+Enter), with Enter reserved for single-line inputs.
  - **Screenshot:** R7 `s1-desktop-light-en-4form.png`, BL `states/task-edit-sheet--desktop-dark-ru.png`

- **07-017 · minor · "Back to today" in three forms** · `shared/back-to-today.tsx:6-28`, `screens/history-screen.tsx:115-124`, `features/insights/insights-screen.tsx`
  - **What:**
    - Day and Week: a quiet blue text link "Back to today", shown only away from today (as the owner asked).
    - History: an outlined Button "Now" that is always present and disabled on the present day. This is the pattern the owner called «громоздкая кнопка которая хуй зачем нужна».
    - Insights: nothing.
    - Phone Day and Week: the link wraps the controls onto a second row, so leaving today shifts the grid down by 48 px.
  - **Why:** feedback 4 ("Reset to today" on non-current only); docs/qa.md › Every control earns its place.
  - **Fix:** one `BackToToday` on every period screen (Day, Week, Insights, History), placed where it does not reflow the header.
  - **Screenshot:** R7 `s3-desktop-light-en-week-prev.png`, R7 `s3-desktop-light-en-history-prev.png`, R7 `s3-phone-light-en-week-prev.png`, BL `states/day-previous--phone-light-ru.png`

- **07-018 · minor · Assistant pending state** · composer `features/now/composer/quick-line.tsx`, time bar `shared/tracking/time-bar.tsx`
  - **What:** the composer shows a spinner inside the send button. The time bar shows a caption «Ассистент разбирает текст…» above the field. In feedback 3 the owner asked for the time-bar draft to show the text in an outline.
  - **Why:** docs/qa.md › State you can see ("a draft looks like a draft").
  - **Fix:** one pending treatment for both inputs: the typed text shown as a dashed draft chip or row, with a progress hint.
  - **Screenshot:** R7 `s4-desktop-light-ru-time-pending.png`, R7 `s4-phone-light-ru-composer-pending.png`

- **07-019 · minor · Calendar time button · desktop + phone** · `shared/tracking/time-bar.tsx:139`, `packages/core/src/i18n/en/time.ts:59`
  - **What:** when no event is near, the button is dashed and muted (it looks disabled), but it can be pressed and opens a dialog. On desktop the hover tooltip is short ("No calendar events around now", as asked). A tap or click still opens long copy: "…your phone sends (Pace on Android, with the calendar on in Settings → Devices)". There has been no Settings → Devices screen since stage 8. The web is also offered "Calendar from the phone".
  - **Why:** feedback 4 («описание слишком подробное»); docs/qa.md › Copy; HIG › Buttons (don't look disabled when enabled).
  - **Fix:** a resting style that is not "disabled". Short copy that points at the actual place, or nothing on the web.
  - **Screenshot:** R7 `s2-desktop-light-en-9cal-click.png`, R7 `s2-phone-light-en-9cal-click.png`, R7 `s2-desktop-light-en-8cal-hover1000.png`

- **07-020 · minor · Sidebar header · desktop 1440** · `apps/app/src/ui/sidebar.tsx`
  - **What:** the Telegram name shows, but it is truncated to «D…». Avatar, name and bell leave it about 22 px, so a name like "Albert" truncates too. An indigo initials avatar also sits next to the green logo, which puts two accents in the header.
  - **Why:** feedback 4 («сверху Pace, а справа имя из профиля – Albert»).
  - **Fix:** drop the avatar or the bell from that row (the bell can go into the nav list), so the name gets the width.
  - **Screenshot:** R7 `logo-zoom.png`

- **07-021 · minor · EN catalog names one action two ways** · `en/sessions.ts:5,14,16,18`, `en/shell.ts:39,47,55,155`, `en/notify.ts:33` vs `ru/notify.ts:35`
  - **What:**
    - The session button is "Revoke", but its confirm says "End this session?" and the hint says "End anything you do not recognize". RU uses «Завершить» throughout.
    - "Sign in" appears 6 times and "Log in" twice; the counterpart of "Log out" is "Sign out".
    - The notification channel is "App" in EN, «Телефон» in RU, and "Phone app" in the sessions list.
  - **Why:** docs/qa.md › Copy; Material › Writing (consistent terminology).
  - **Fix:** a glossary in the i18n folder (Revoke→End, Sign in / Sign out, Phone app) and a lint over the catalogs.
  - **Screenshot:** BL `routes/settings--desktop-light-ru.png` vs R7 `aria-desktop_settings.png`; R7 `guest-en-US.png`

- **07-022 · minor · "Now" has three meanings** · `en/shell.ts:11`, `en/board.ts:51`, `en/library.ts:17`
  - **What:** the Now screen, the close-sheet time chip "Now", and the History jump button "Now" use the same word; RU «Сейчас» has the same three meanings.
  - **Why:** docs/qa.md › Copy.
  - **Fix:** History uses "Back to today" (07-017). Keep the chip as "Just now" / «Только что».
  - **Screenshot:** R7 `s3-desktop-light-en-history-prev.png`, BL `states/task-close-as--desktop-light-ru.png`

- **07-023 · minor · Empty states**
  - **What:** Now, Inbox and Projects centre their empty text; Day, Insights and Assistant log left-align it. Inbox puts "Nothing to sort." under a two-line explanation ("Notes kept for later and what Pace wants a decision on. Accept takes a note as a task with the guess under it …"). Only Projects offers the next action.
  - **Why:** docs/qa.md › Copy; HIG › Writing (short); impeccable › empty states.
  - **Fix:** one `EmptyState` (left-aligned in lists, one line plus an optional action). Cut the Inbox intro to one sentence.
  - **Screenshot:** R7 `empty-sheet-desktop.png`

- **07-024 · minor · Inbox item actions · desktop + phone**
  - **What:** each item has two full-width 50/50 buttons, a lime Accept and an outlined Delete. With N items there are N lime bars, and Delete carries the same weight as Accept.
  - **Why:** docs/qa.md › Color ("one calm accent"); HIG › Buttons (hierarchy).
  - **Fix:** a row with a trailing compact Accept and an overflow or swipe Delete.
  - **Screenshot:** R7 `s3-desktop-light-en-inbox-item.png`

- **07-025 · minor · Switching activity on a phone** · `shared/tracking/time-bar-fold.tsx:17-40`
  - **What:** while something runs, the phone folds the buttons behind "Start something else". Switching to Commute takes 4 taps (app, unfold, Chores, Commute) against 3 on desktop.
  - **Why:** feedback 2 A2 («захожу в приложение и протыкиваю Commute»); PRODUCT.md › three-tap flows.
  - **Fix:** keep the four buttons visible and collapse the running rows instead, or make the running row itself the switcher.
  - **Screenshot:** R7 `s2-phone-light-en-3reopen.png`, R7 `s2-phone-light-en-4chores-again.png`

- **07-026 · minor · To Inbox feedback · desktop + phone**
  - **What:** the line empties and the only signal is the badge on the sidebar or tab bar, about 500 px away on desktop. There is no toast, although the baseline set lists a "toast-to-inbox" state. On a touch tap the web tooltip "To Inbox" pops up over the bell.
  - **Why:** HIG › Feedback; docs/qa.md › Overlays in context.
  - **Fix:** a short toast "Saved to Inbox · Undo" near the composer. No hover tooltips on touch input.
  - **Screenshot:** BL `states/toast-to-inbox--desktop-light-ru.png`, R7 `s3-phone-light-en-toinbox-150.png`

- **07-028 · minor · Icon sizes and strokes on one screen**
  - **What:** Now mixes 18/1.75, 18/2, 16/2, 14/2 and 13/2.25. The task screen mixes 20/1.75, 18/1.75, 16/2, 15/1.8 and 14/2.5 (rendered SVGs measured).
  - **Why:** HIG › SF Symbols / icons (consistent weight); inventory §5.
  - **Fix:** two icon sizes (16/20) and one stroke.
  - **Screenshot:** R7 `aria-desktop_task_01M5YZBMFXXJH5BQVVVSC8JR30.png`

- **07-029 · minor · Desktop Now proportions · 1440**
  - **What:** the primary task list is 535 px wide; the empty pane ("Pick a task to see it here.") is 656 px.
  - **Why:** HIG › Layout (give primary content the space).
  - **Fix:** a flexible list column (min 520, grows) and a fixed-width pane (about 480), or let the pane collapse when empty.
  - **Screenshot:** R7 `aria-desktop_.png`

- **07-031 · minor (IA, proven) · PRODUCT.md navigation** · `PRODUCT.md` › Operating Context
  - **What:** PRODUCT.md says the phone tabs are "Now · Day · Calendar · Inbox · More" and the sidebar says "Calendar". The owner later reverted this (`context/stage-8/ledger.md:96,98`: "Calendar → back to Week", "phone tabs Now·Day·Inbox·More, Week moves into More"), and the build follows the reversal. A spec written from PRODUCT.md would bring back what the owner removed.
  - **Fix:** correct PRODUCT.md (sidebar "Week"; tabs Now · Day · Inbox · More; Week under More).
  - **Screenshot:** R7 `aria-phone_more.png`

- **07-034 · minor · Running row in RU · phone**
  - **What:** «2 ч 17 м» and «из ~20 м» wrap onto two lines, so the running row is taller in Russian than in English.
  - **Why:** brief rule (RU is 15–40 % longer); HIG › Layout (adapt without reflow).
  - **Fix:** put the expectation on the progress line, or use a compact «2:17 / ~20 м».
  - **Screenshot:** BL `routes/now--phone-dark-ru.png`

- **07-035 · minor · Two "New task" entry points on desktop Now**
  - **What:** the sidebar's lime "New task N" and the composer's "+" (also labelled "New task") open the same form on the same screen.
  - **Why:** docs/qa.md › One way per job.
  - **Fix:** on Now, let the composer's + carry the N hint and drop the duplicate, or keep the sidebar button and remove the composer +.
  - **Screenshot:** R7 `aria-desktop_.png`

### Nit

- **07-027 · nit · Tooltips over content**
  - **What:** "New task · N" from the composer + covers the "Now" title. The calendar tooltip covers the time field's placeholder.
  - **Why:** docs/qa.md › Overlays in context.
  - **Fix:** place tooltips below or beside the control, away from text.
  - **Screenshot:** R7 `s1-desktop-light-en-4form.png`, R7 `s2-desktop-light-en-8cal-hover1000.png`

- **07-030 · nit · Task screen edges**
  - **What:** the "Original message" disclosure and the subtask rows start at x = 408 (phone 16), while the content edge is x = 412 (phone 20).
  - **Fix:** a shared inset.
  - **Screenshot:** BL `routes/task-open--phone-light-ru.png`

- **07-032 · nit · Phone Week sideways cue**
  - **What:** the first visible day header is clipped («8 Wed», «р, 28») next to the "Swipe to see all days" hint.
  - **Why:** docs/qa.md › Guest language and sideways content.
  - **Fix:** snap the scroll to whole days.
  - **Screenshot:** R7 `aria-phone_week.png`, BL `states/week-event--phone-light-ru.png`

- **07-033 · nit · Duplicate requests on Now load**
  - **What:** `GET /api/calendar?…` and `GET /api/notifications?limit=50` each fire twice on every load of Now (Playwright request log).
  - **Why:** bug-lessons class 1 ("the network goes quiet").
  - **Fix:** dedupe the hooks.
  - **Screenshot:** n/a (request log in `r07-s4.ts` output)

---

## Owner requests: met / partly / not met

Status as seen in the web build. "n/v" means it can't be verified on the web or with the fake LLM.

### Feedback 2 (scenarios and small fixes)

| # | Request | Status | Evidence |
|---|---|---|---|
| T1 | Weekly homework exists ahead of time | met | Now "In future · 2" fold, R7 `aria-desktop_.png` |
| T2 | Pasted homework maps to the nearest instance, subtasks, link, hours | met in UI / n/v mapping | fake LLM; seeded task shows subtasks and link, R7 `aria-desktop_task_…png` |
| T3 | Irregular task fields from context | met | proposal lists Category/Due/Importance, R7 `s1-desktop-light-en-2preview.png` |
| T4 | AI on a visible button, quick input ≠ task form | met | ↑ button + Enter; form is a separate step in the pane, R7 `s1-desktop-light-en-4form.png` |
| T5 | Start time visible and editable; future under «In future» | met | "Starts now" chip; Start on the task; «В будущем · 2» |
| T6 | Edit every field | met | BL `states/task-edit-sheet--desktop-dark-ru.png` |
| T7 | Project page like a task list, Done reachable | partly | Done rows open; different container and gutter, no "Open" header (07-011) |
| T8 | Focus from a task, Focus and Done the same size | met | 420/420 (desktop), 175/175 (phone), R7 `s1-desktop-light-en-3afterEnter.png`; header keeps an unlabeled Pause (status), check with owner |
| A1 | Chores → Getting ready in three taps | met | 3 taps measured on both viewports, R7 `s2-phone-light-en-1chores-picker.png` |
| A2 | Switching ends the previous one; parallel | partly | phone needs 4 taps (07-025); parallel only through the "Alongside" switch in pickers |
| A3 | Rest 30m, Sport, «still doing?» at 2× | met | "Still doing this? / Yes, still", R7 `aria-desktop_.png`; Sport now Rest › Workout ~1h |
| A4 | Attend / Skip before calendar events | n/v | web has no phone calendar; nothing seeded |
| A5 | From calendar names the activity after the event | n/v (copy stale) | 07-019 |
| A6 | «Пошел в ЦСС, 20мин» | met (as a proposal) | "will start «Пошел в ЦСС» · Expect ~20m · Stops Commute", R7 `s2-desktop-light-en-12preview.png` |
| W1 | Week in the browser | met | R7 `aria-desktop_week.png` |
| W2 | Device time and "where I sat" | partly / n/v | "Apps during this · Nothing recorded" shows; no device data on the web |
| — | Remove recent activity chips | met | time bar has only 4 fixed buttons |
| — | Big buttons always in their place | met | 4 × 128×56 (desktop), 4 × 86×56 (phone) |
| — | Inter for Cyrillic | met | all RU shots |
| — | Logo blends with the background | met | olive `#4d6b00` on light, R7 `logo-zoom.png` |
| — | Progress by dragging | met | slider, value live at 40 % mid-drag (`r07-s5.ts`) |
| — | Rank by time to deadline, drop smart logic and «How Now is ordered» | met | no score card |
| — | Remove Waiting | partly | header still has a Pause (status `paused`) icon, `task-header.tsx:66-74` |
| — | Tags visible, importance after project; no weekday in Due; no «behind pace» | met | R7 `aria-desktop_.png` |
| — | Project on the task page is not a pill | met | «Алгебра ⌄» as text, BL `routes/task-open--phone-light-ru.png` |
| — | Sidebar stays on Inbox, Settings, History, project | met | all desktop shots |
| — | Dim overlay flash on sheets | n/v | not caught in frames |

### Feedback 3

| Request | Status | Evidence |
|---|---|---|
| Update bar colour and copy | **not met** | 07-002 |
| Palette change for New task | met (per feedback 4 "accent on important actions") | lime New task |
| Lone «All» filter | met | no chips without projects, R7 `s2-phone-light-en-0idle.png` |
| Enter → parse → check → Enter creates | met | Approve·Enter → task opens, R7 `s1-…-2preview.png` → `3afterEnter.png` |
| No "Fill in by hand"; form expands with animation; typed text → title | partly | + opens the form with the title carried (R7 `s1-desktop-light-en-4form.png`); an empty form opens with an error (07-001) |
| Slider steady, live, in % | met | 40 % mid-drag |
| Hotkeys on buttons, OS-aware | met | Approve Enter · Cancel Escape · Create Enter · Focus F · Done Ctrl+Enter; ⌘ on Mac (`ui/hotkeys.ts:2`) |
| Time-bar draft outlined while parsing | partly | caption instead of an outline (07-018) |
| Dissolve on check | met | R7 `s3-desktop-dissolve-strip.png` |
| Tag colours (In progress blue, Normal green, Personal orange) | met | BL `routes/task-open--phone-light-ru.png` |
| ⊘ icon and a Delete button | met | task header |
| Centred dialog on desktop | met | BL `states/task-close-as--desktop-light-ru.png`, R7 `s2-desktop-light-en-1chores-picker.png` |
| "Exact time" as buttons, not a switch | met | «Точно тогда / Примерно тогда» |
| No Back in sheets | met | all sheets (✕ on desktop, dim on phone) |
| Remove + tab; Settings in the tab bar; Settings off Now | met (through More, the owner's later IA) | R7 `aria-phone_more.png` |

### Feedback 4

| Request | Status | Evidence |
|---|---|---|
| Update card: no Later, no detail, "refresh page", narrow | **not met** | 07-002 |
| Green on important actions and the logo, quiet colour elsewhere | partly | lime primaries and logo; indigo for running, OS selection, switches, badges, links and avatar sit next to lime in the sidebar (07-020) |
| Time bar Calendar / Task / Chores / Rest, no gears | met | R7 `aria-desktop_.png` |
| Rest subtypes | met | Short break, Rest, Walk, Workout, Nap, Sleep, R7 `s2-desktop-light-en-6rest-picker.png` |
| Free text → proposals (create / edit / delete), also for past time | met for create, start and log | "will log «ходил в военкомат», 07:30–08:30", R7 `s2-desktop-light-en-14past-preview.png`; edit/delete not exercised |
| Skeletons for devices | met | BL `states/settings-sessions-loading--desktop-light-en.png` |
| Exact time when last data > 8 h | n/v | no device data |
| OS picker Windows / macOS / Linux | met | R7 `s3-desktop-light-en-add-computer-2.png` |
| Disconnect not too wide | met | 113 px |
| Add a device works on phones | met | R7 `s3-phone-light-en-add-computer-2.png` |
| Settings buttons not too wide on desktop | partly | Settings yes; Projects "New project" 848 px (07-013) |
| MCP instructions | met | BL `states/settings-connect-ai--phone-light-ru.png` |
| Devices as a list in Settings, sessions with revoke | met | R7 `s3-phone-light-en-wipe.png` |
| Export, Log out, Danger: Wipe and Delete with Telegram confirm | met (styling wrong, 07-014) | «Wipe — confirm in Telegram» |
| Notification pool, Deadline digest Telegram-only by default | met | Settings matrix |
| Sidebar order Now → Day → Week/Calendar → Inbox → Projects → Insights → History → Settings | met ("Week" per the owner's reversal; 07-031) | R7 `aria-desktop_.png` |
| Composer simpler; odd chevron gone | met | + · text · Inbox · ↑ |
| Unfold artefact (text slides out of the card) | met (not seen in 5 frames) | R7 `s4-phone-unfold-strip.png` |
| Form in the right pane; no "Check before adding"; "the assistant will…" | met | R7 `s1-desktop-light-en-4form.png`, `2preview.png` |
| Subtasks, not Problems | met | "Add a subtask"; no "problem" in the catalogs |
| Calendar hint at once on hover / tap, short | partly | desktop tooltip instant and short; phone tap opens long, stale copy (07-019) |
| Week like Now with a detail pane; phone bottom sheet | met | BL `states/week-event--desktop-light-en.png`, `--phone-light-ru.png` |
| Week not scrolling; night hours option | met | page 900 = 900; moon switch + Settings switch |
| "Reset to today" only off-period; Day too | partly | Day and Week yes; History keeps a disabled "Now", Insights none (07-017) |
| Day dividers consistent | met in Day / not across the app | 07-010 |
| "N tasks" on Projects | met | "1 task", R7 `aria-desktop_projects.png` |
| No flash on dissolve; shorter gap | met (no flash in 8 frames) | R7 `s3-desktop-dissolve-strip.png` |
| Inbox counter only in the sidebar | met | badge on the sidebar and phone tab; none on Now |
| Telegram name in the sidebar | partly | truncated to «D…» (07-020) |
| Toast covering Rest/Sport (extra screenshot) | met on desktop (docked corner) | but see 07-004 for placement |

**Totals:** 72 requests: 53 met, 12 partly, 2 not met, 5 n/v.

---

## Inconsistency inventory

Measured with DOM rectangles and computed styles at 1440×900 / 390×844, EN light unless noted.

| Thing | Variant A (where) | Variant B (where) | More variants · measured values |
|---|---|---|---|
| Page title | 30/600, −0.75 tracking (Now, Day, Week, Inbox, Projects, Insights, Settings) | 22/600, no tracking (History, Presets, Notifications, project) | task title 26/600; titles' top y = 42 / 28 / 32 / 23 / 14 by screen |
| Back chevron top (phone) | y 34 (Week, Insights) | y 24 (Projects, Settings) | y 14 (History, Presets, Notifications, project, task) |
| Desktop content start | x 244 (Now, Week) | x 412 (Day, Inbox, Projects, Insights, History, Settings, Notifications) | x 448 title of pushed pages |
| Section header | 13/600 fg2 (Now groups) | 11/400 uppercase 0.66 px muted (Settings, Notifications, Connect AI) | 17/600 fg (Day), 14/500 fg (Insights), 12/500 muted (Subtasks, History), 14/600 warn (Danger zone), 13/500 (disclosures); all `aria-level=1` |
| Task row | in a white grouped card; title x 291 / 67 (Now) | bare on the background; title x 446 / 54 (project, History) | check circle x 22 vs 9 (phone) |
| Task row height | 66 px (one meta line) | 86 px (meta wraps, phone) | RU orphan «решено» |
| List rows | 57 px, top border inset 412–1252 (Day) | 69 px, top border inset (History events) | 62 px, divider 392–1272 (Notifications); 41 px (Settings estimates); 56 px full-bleed (More); 56 px tinted cards + 8 gap (Projects); 48 px bordered cards r12 + 8 gap (pickers); 52 px 408–1256 (Subtasks); Now 66 px no dividers |
| Section dividers | inset to content (Day, History rows) | bleed 20 px past content, x 392 w 880 (Settings, Notifications) | none (Now inside card, Insights cards) |
| Outlined button | 48 px r10 (kit: Settings, History "Now", Focus) | 44 px r12 (Stop, Yes still, fold toggle, New project) | 56 px r14 2 px border (time-bar categories); 36 px round (composer icons); 40 px r12 (sidebar New task) |
| Button width | content-width (desktop Settings) | full width 848 px (desktop New project) | phone full width except Wipe 106 / Delete 140; Revoke 86 vs Disconnect 113 in adjacent rows |
| Destructive button | outlined neutral (Wipe data) | borderless fg2 text (Delete account) | kit `danger` variant unused at rest |
| Selected chip / segment | filled with category colour (Category, Importance) | grey fill + 2 px dark border (Project, Deadline type, Repeat, Theme, Language, "All") | solid indigo (OS picker, running time button) |
| Unselected chip | coloured outline per item (Category, Importance, Project, filters) | neutral outline (Deadline type, Repeat, Theme) | — |
| Primary form action | header top-right, Enter (New task) | footer full width, Ctrl+Enter (Edit, Close) | inline beside Cancel, Enter (assistant proposal) |
| "Back to today" | blue text link, only off-period (Day, Week) | outlined button "Now", always shown, disabled at present (History) | none (Insights) |
| Pending assistant | spinner in the send button (composer) | text caption above the field (time bar) | — |
| Empty state | centred grey line (Now, Inbox, Projects) | left-aligned grey line (Day, Insights, Assistant log) | Inbox appends it after a 2-line explanation |
| Icon button frame (phone) | outlined 44 px square, white fill (Now bell) | plain, no frame (Day / Week / Insights arrows, task header) | — |
| Icons on one screen | Now: 18/1.75, 18/2, 16/2, 14/2, 13/2.25 | Task: 20/1.75, 18/1.75, 16/2, 15/1.8, 14/2.5 | Settings: 18/1.75, 16/1.75, 14/1.75 |
| Toast position | docked bottom-left in sidebar, 200 px wide (desktop) | above the time bar, full width (phone) | To Inbox: no toast at all |
| Same action, two names (EN) | "Revoke" (button) | "End this session?" / "End anything…" | RU «Завершить» everywhere |
| Sign-in wording (EN) | "Sign in" ×6 | "Log in" ×2 | "Log out" (not "Sign out") |
| Notification channel | "App" (EN matrix), "Phone app" (sessions) | «Телефон» (RU matrix) | — |
| "Now" | nav destination | close-sheet time chip | History jump button |
| "Done" | task completion button | toast after an assistant approval | close outcome, devices "Done" |
| RU "Отмен-" | «Отменить» = Undo (toast) | «Отменить или пропустить задачу…» = cancel the task | «Отмена» = Cancel, «Отменена» = outcome |
| Left edges on Now (desktop / phone) | cards 240 / 16 (composer, chips) | 236 / 12 (list card, time field) | text 244 / 20 (title, In future), 249 / 25 (group header) |
| Accent | lime (New task, primaries, logo) | indigo (active nav icon, badge, avatar, running button, OS selection, switches, "Log" / "Back to today" links) | olive lime when disabled (▶ in dark looks enabled) |

---

## What this says about the system

- **There is no page template.** `ScreenHeader`, `BackHeader`, `DestinationScreen`, `PushedScreen` and the Week/Now custom headers each choose their own title size, top padding, eyebrow and back position. History was simply left on the wrong one. The spec needs exactly two header templates (destination, pushed) and one desktop frame with a fixed content edge and an optional detail column (07-006, 07-007).
- **There are no list primitives.** Each feature drew its own rows, dividers and section headers, so a fix arrives as a local patch (the Day dividers) and the class survives everywhere else. The kit needs `List` (grouped / plain), `Row` (three heights), `SectionHeader` and `EmptyState`, with inset hairlines as a rule (07-009, 07-010, 07-011, 07-023).
- **Buttons, chips and selected states aren't owned by the kit.** Five button geometries, hand-rolled outlined buttons, per-screen width decisions and five selected treatments show the kit is bypassed whenever a screen needs a variation. Sizes, emphasis (primary / secondary / quiet / destructive), width and selection belong to the kit, and screens should only pick (07-013, 07-014, 07-015).
- **Colour carries identity instead of state.** Category and project colours are drawn as outlines on every chip and time button, while the real state (running, selected) uses a second accent (indigo) next to the lime. One accent for action, neutral resting controls and identity colour only as a small swatch would remove most of the "rainbow" (07-015, 07-020).
- **Copy has no glossary and no regression guard.** The owner's corrections ("We changed a few things", short calendar hint, Settings → Devices) came back or went stale because nothing pins them. Synonyms appear inside one catalog (Revoke/End, Sign in/Log in) and homonyms across catalogs (Done, Now, Отменить). A glossary in `packages/core/src/i18n/` and a catalog test (banned phrases, one term per action, EN and RU parity) would catch this class (07-002, 07-004, 07-005, 07-019, 07-021, 07-022).
- **Feedback has no single home.** Toasts dock in the sidebar corner, To Inbox has none, pending states differ by input, tooltips cover text, and the phone's bottom region grows without a limit. The system needs one rule for where transient feedback appears: next to its source, never covering the next action. It also needs a height budget for the phone's bottom region (07-003, 07-004, 07-018, 07-026, 07-027).
- **Form validation and accessibility semantics are wired the naive way.** Errors bind to the value, not to an interaction, and every RN `header` becomes an `<h1>`. Both are kit-level defaults (a touched or submitted gate in the field kit, `aria-level` on headers) that fix every screen at once (07-001, 07-009).
