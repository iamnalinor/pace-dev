# 02 — Apple design review (HIG conformance + craft lens)

Reviewer 02-apple-design · method: the `dev-core:apple-design` skill (five lenses + "make it less generic"),
HIG pages read from the skill's `references/hig/` and cited as `page › heading` · baseline commit 057e484,
screenshots `context/design/baseline/**` (all eight manifests complete) · code `apps/app/src/**`.

## Summary

**Rating: Needs work** (skill scale: no Critical, many High). **0 blockers · 18 major · 27 minor · 2 nit = 47 findings.**
Thesis of the product (one sentence): *open it and see at once what to do now, what is hanging and where the time
goes.* Today the design does not answer that at a glance: every screen is the same stack of hairline-bordered
rounded cards with washed pill tags, the loudest pixel on every desktop screen is the sidebar's lime "New task",
and the two things that are Pace's own — the running activity and the shape of the day — are drawn at 11–13 px.
It is remembered by nothing yet, and in dark it is literally one of the three templated looks the skill names
("near-black with one acid-green accent": `#0b0b0c` + `#d4ff3a`).

The three that matter most:
1. **Depth and modality are not built for Android/phone** — the sheet grabber is decorative (no drag, no swipe,
   no detents), sheets vanish with no exit motion, phone-web sheets have no visible way out, and in dark every
   layer (page, card, sheet, dialog, toast) sits within 1.07:1 of the next (02-007…010, 02-031).
2. **Hierarchy is inverted where it counts** — the running activity's name is an 11 px tag and its elapsed
   time 13 px; "Normal" importance is a green wash on every row; the title system has five treatments and the
   title jumps between four heights across sidebar destinations; the type scale has no Headline step
   (02-003, 02-014, 02-018, 02-028).
3. **Colour has no stable meaning** — lime is spent 3–4 times per screen, indigo means running, selected, link,
   data and "on" at once, and the ten-hue palette collides (Task vs Rest outlines are 1.01:1 apart; category
   "Работа" and project "Работа" share violet) (02-015, 02-025, 02-026).

**Scope and limits.** "Phone" screenshots are the react-native-web build at 390 px, not Android. Android-specific
findings are translated from code, using inventory §0 (NativeWind `rem` = 14 px on Android: every `h-11` is
38.5 dp, `min-h-12` 42 dp). Nothing was verified on a device; findings that depend on Android runtime behaviour
say "unverified". Labels: **HIG-conformance** = applies fully to the Android app, translated to Material where the
two disagree on platform affordances (back, system sheets, ripple, edge-to-edge); **principle** = applies to the
web (and Android) as clarity / deference / depth / hierarchy / consistency.

**HIG pages read:** `design-principles`, `accessibility`, `layout`, `typography`, `color`, `dark-mode`, `motion`,
`designing-for-ios`, `designing-for-macos`, `tab-bars`, `sidebars`, `split-views`, `lists-and-tables`, `sheets`,
`modality`, `buttons`, `toggles`, `text-fields`, `pickers`, `playing-haptics`, `branding`, `feedback`,
`loading`, `onboarding`, `privacy`, `writing`, `alerts` (headings), plus `references/cross-platform.md` and
`references/code-audit.md` (no Apple Pay, no blur/glass in the app — nothing to flag there).

## Principles snapshot (Apple's eight, first filter)

| Principle | Verdict | Evidence |
|---|---|---|
| Purpose | Partly | Now's job is clear, but the live activity and the day's shape are visually minor (02-018, 02-024) |
| Agency | Good | Undo everywhere, History, inline wipe confirmation, "Not now" on permissions |
| Responsibility | Good | Permissions one at a time with a reason; destructive actions confirmed |
| Familiarity | Weak on phone | Decorative grabber, no ripple, outlined tab icons, tab bar lost on top-level screens |
| Flexibility | Unverified | Fixed heights + fixed leading under Android font scaling (02-030); RU wraps (02-047) |
| Simplicity | Weak | Two tags per row, 25-chip forms, pencil on every Day row, four icon buttons per task |
| Craft | Uneven | Tokens and contrast tests are solid; composition (headers, rows, depth) is not |
| Delight | Misplaced | One 750 ms dust effect on the most frequent action; nothing in the time bar or Day |

---

## Findings

Format per finding: id · severity · label — title, then surface · viewport/theme/lang · file:line · what · why
(citation) · fix · screenshot. Paths under `apps/app/` unless stated.

### A. Navigation and structure

**02-001 · major · HIG-conformance — Top-level sections reached from More lose the tab bar**
- Surface: Week, Projects, Insights, History, Settings, Notifications · phone · both · EN/RU
- Where: `app/week.tsx`, `app/projects.tsx`, `app/insights.tsx`, `app/history.tsx`, `app/settings.tsx` live outside
  `app/(tabs)/` (`app/(tabs)/_layout.tsx:21-26` declares only index/day/inbox/more/add)
- What: opening Week or Projects from More pushes a full-screen route; the bottom bar disappears, so five of the
  eight sidebar destinations show no "where am I".
- Why: `tab-bars.md › Best practices`: "Make sure the tab bar is visible when people navigate to different
  sections of your app. If you hide the tab bar, people can forget which area of the app they're in." Material
  agrees for top-level destinations (hide the navigation bar only on detail/full-screen tasks).
- Fix: nest these routes in the More tab's stack (expo-router `(tabs)/more/_layout.tsx` Stack) so the bar stays;
  hide it only on the task detail and full-screen forms.
- Screenshot: `context/design/baseline/routes/week--phone-light-ru.png`, `routes/projects--phone-dark-en.png`

**02-002 · minor · HIG-conformance — Week sits in an overflow "More" tab; product IA says five tabs**
- Surface: tab bar · phone · both · EN/RU · `src/ui/tab-bar.tsx:85` (comment "Now, Day, Calendar, Inbox and More")
  vs `app/(tabs)/_layout.tsx:21-24` (four tabs)
- What: PRODUCT.md lists phone tabs Now · Day · Calendar · Inbox · More; the build ships four and buries the
  week (a daily-use screen) behind More.
- Why: `tab-bars.md › Best practices`: "Avoid overflow tabs… The More tab makes it harder for people to reach and
  notice content on tabs that are hidden." Material navigation bar allows 3–5 destinations.
- Fix: five tabs (Material max) — Calendar between Day and Inbox; More keeps Projects, Insights, History, Settings.
- Screenshot: `routes/more--phone-light-en.png`

**02-003 · major · principle — Five title treatments; the title jumps between sidebar destinations**
- Surface: every top-level screen · desktop + phone · both · EN/RU
- Where: `src/ui/screen-header.tsx:32,48-58` (11 px eyebrow + 30 px, `pt-6`), `src/ui/back-header.tsx:28,50`
  (22 px, `pt-3.5`), `src/screens/history-screen.tsx:167` and `src/features/notifications/notifications-screen.tsx:201`
  (sidebar destinations drawn as *pushed* screens), `src/screens/inbox-screen.tsx:23` (30 px, no eyebrow)
- What: switching sidebar rows moves the title baseline: Now/Day/Week/Insights ≈ y 60 (eyebrow + 30 px),
  Inbox/Settings ≈ y 46 (30 px), Project ≈ y 36 (22 px + chevron), History ≈ y 27 (22–24 px). The content's top
  edge moves with it. Also 6 page-title sizes in code (20/22/24/26/30/34, inventory §3.2).
- Why: `layout.md › Visual hierarchy`: "Align elements to make them easier to scan…"; `layout.md › Adaptability`:
  "Keep functionality the same… keep layout changes recognizable and familiar"; `design-principles` Familiarity.
- Fix: one `ScreenTitle` for every sidebar destination (one size, one top inset, eyebrow either always or never —
  see "less generic" §2 for replacing the eyebrow); `BackHeader` only for genuine drill-downs (project, task,
  preset). History and Notifications move to `DestinationScreen`.
- Screenshot: `routes/now--desktop-light-en.png` vs `routes/history--desktop-light-en.png` vs
  `routes/inbox--desktop-light-ru.png` vs `routes/project--desktop-light-en.png`

**02-004 · major · principle — Sidebar header is overloaded; the owner's name renders as "D…"**
- Surface: sidebar · desktop · both · EN/RU · `src/ui/sidebar.tsx:165-175`
- What: mark + 16 px wordmark + 24 px avatar + name (`flex-1`, `numberOfLines={1}`) + bell share 200 px; the name
  is truncated to one letter in every desktop screenshot. The owner asked for his Telegram name exactly there
  (feedback-4).
- Why: `branding.md › Best practices`: "Ensure branding always defers to content" and "Resist the temptation to
  display your logo throughout your app…"; `typography.md › Supporting Dynamic Type`: "Keep text truncation to a
  minimum".
- Fix: drop the wordmark (the mark alone identifies the app) or split into two rows: mark + bell / avatar + full
  name. Never truncate a short name to its initial.
- Screenshot: `routes/now--desktop-dark-ru.png` (top-left)

**02-005 · major · principle — Desktop split panes are mirror images and the empty pane wastes ~45 % of the window**
- Surface: Now, Week · desktop · both · EN/RU
- Where: `src/screens/now-screen.tsx:69` (list fixed `w-[560px] max-w-[50%]`, detail flexes) vs
  `src/ui/split-pane.tsx:21-22` (Week: grid flexes, detail fixed `w-[400px] max-w-[40%]`)
- What: at 1440 px Now gives the list 559 px and an empty 657 px pane ("Pick a task to see it here.", 14 px
  muted, centred); Week does the opposite. The assistant preview and composer are then cramped into the narrow
  column next to an idle pane.
- Why: `split-views.md › Desktop`: "Set reasonable defaults for minimum and maximum pane sizes" and "Consider
  letting people hide a pane when it makes sense"; `split-views.md › Best practices` (selection drives detail);
  owner feedback-4 ("у нас энивей поле свободное справа есть").
- Fix: one SplitPane rule for all screens: list/grid flexes with a max readable width, detail fixed at a reading
  width (≈ 420–480) and **collapsed while nothing is selected** (the list re-centres), opening on selection or
  on New task. Same component for Now, Week, Projects.
- Screenshot: `routes/now--desktop-light-en.png`, `routes/week--desktop-dark-en.png`,
  `states/now-assistant-preview--desktop-light-en.png`

**02-006 · minor · principle — On desktop the running activity exists only on Now, at the bottom edge**
- Surface: time bar · desktop · both · `src/features/now/now-screen.tsx:40` (`footer={<TimeBar />}` on Now only)
- What: on Day/Week/Insights nothing says an activity is running (Day lists it, others not); on Now the bar is
  docked to the window's bottom edge.
- Why: `feedback.md › Best practices`: "Consider integrating status feedback into your interface… near the items
  it describes"; `layout.md › Desktop`: "Avoid placing controls or critical information at the bottom of a
  window." Trade-off: the owner wants the buttons "always in their place" (feedback-2) — keep them fixed.
- Fix: keep the bar where it is on Now; add a one-line running indicator (pulse dot + label + elapsed + Stop) in
  the sidebar under New task on every desktop screen. Existing state, no new feature.
- Screenshot: `routes/day--desktop-light-en.png`, `routes/insights--desktop-dark-en.png`

### B. Sheets, dialogs, pickers

**02-007 · major · HIG-conformance — The phone sheet's grabber does nothing (no drag, no swipe-to-dismiss, no detents)**
- Surface: every sheet · phone (Android + phone web) · both · `src/ui/sheet.tsx:50-58` (handle is a plain View),
  `:134` (`Modal animationType="none"`), `:145-162` (no gesture handler)
- What: a 36×4 handle promises a draggable sheet; it cannot be dragged, flicked down or resized. A 10-row picker
  opens at 90 % height with no medium detent.
- Why: `sheets.md › Mobile`: "Include a grabber in a resizable sheet" and "Support swiping to dismiss a sheet.
  People expect to swipe vertically to dismiss a sheet…"; "consider supporting the medium detent to allow
  progressive disclosure". Material bottom sheets have the same drag handle + swipe contract. Bug-lessons class
  10 ("a control that does nothing on one platform").
- Fix: a real bottom sheet (gesture-handler pan + Reanimated, or `@gorhom/bottom-sheet`) with drag handle,
  swipe-down dismiss (confirm if the form is dirty), a medium detent for pickers and a large one for forms; keep
  backdrop tap and system Back. If the sheet stays static, remove the handle.
- Screenshot: `states/time-chores-picker--phone-dark-en.png`, `states/task-edit-sheet--phone-light-ru.png`

**02-008 · major · principle — Sheets and dialogs appear with motion but disappear in one frame**
- Surface: every sheet/dialog · phone + desktop · `src/ui/motion.ts:25-31` (only `*_ENTER` exist),
  `src/ui/sheet.tsx:134,145-148` (no `exiting`; `visible=false` unmounts the Modal)
- What: the sheet slides up 240 ms, then vanishes instantly on close; the dialog zooms in 160 ms and pops out.
- Why: `motion.md › Providing feedback`: "Strive for realistic feedback motion that follows people's gestures and
  expectations… if someone reveals a view by sliding it [in], they don't expect to dismiss the view by sliding
  it to the side" — here it is not dismissed by motion at all.
- Fix: `SHEET_EXIT = SlideOutDown(200)`, `DIALOG_EXIT = FadeOut+scale 0.98 (120)`, backdrop fade-out; keep the
  Modal mounted until the exit finishes; reduced motion → fades.
- Screenshot: n/a (motion) — `states/task-close-as--desktop-dark-en.png` shows the dialog at rest

**02-009 · major · HIG-conformance — Dark mode has no elevated layer: sheet, dialog, toast and card are one tone**
- Surface: dialogs, sheets, toasts, cards · all · dark · EN/RU · `src/ui/sheet.tsx:43` (`bg-black/55`),
  `:155-158` (`bg-surface`, `shadow-lg`), `src/ui/toast.tsx:125`
- What: `surface #141416` on `bg #0b0b0c` = **1.07:1**; `raised #1c1c1f` on `surface` = **1.08:1**. A 55 % black
  dim over a near-black page changes almost nothing, the Tailwind shadow is invisible, so the Close-task dialog
  and the summary card behind it read as one plane; only a 10 %-white hairline separates them.
- Why: `dark-mode.md › Mobile`: "the system uses two sets of background colors — base and elevated… the elevated
  colors are brighter, making foreground interfaces appear to advance"; "Prefer the system background colors…
  changes from base to elevated when an interface is in the foreground, such as a popover or modal sheet."
- Fix: an `elevated` token family for modal/floating layers in dark (≈ `#1f1f23` sheet, `#26262b` raised-on-
  elevated), lighter dim in dark (≈ 40 %) and a real shadow in light; make each step ≥ 1.2:1. Material 3 does
  the same with tonal elevation.
- Screenshot: `states/task-close-as--desktop-dark-en.png`, `states/time-chores-picker--phone-dark-en.png`,
  `states/now-check-toast--phone-dark-en.png`

**02-010 · major · principle — Phone-web sheets have no visible way out**
- Surface: every sheet · phone web · both · `src/ui/sheet.tsx:21` (`maxHeight 90%`), `:83-87` (close cross only
  `isWide`)
- What: the edit sheet fills 90 % of the screen; the only exit is tapping an ≈80 px dim strip (no Escape, no
  system Back in a mobile browser, no swipe — 02-007).
- Why: `modality.md › Best practices`: "Always give people an obvious way to dismiss a modal view… people
  typically expect to find a button in the top toolbar or swipe down"; `accessibility.md › Mobility`: "Offer
  alternatives to gestures." (Android keeps system Back — acceptable there once 02-007 lands.)
- Fix: show the close cross on phone web too (top-trailing, 44 px), or a "Done" on forms; keep tap-outside.
- Screenshot: `states/task-edit-sheet--phone-light-ru.png`

**02-011 · minor · principle — Desktop pickers open as centred dialogs far from the button that opened them**
- Surface: Chores/Rest/Task/Calendar pickers, project picker · desktop · both · `src/shared/tracking/choices-sheet.tsx`
- What: tapping Chores at the bottom-left of the list opens a 560 px modal in the middle of the window.
- Why: `pickers.md › Best practices`: "Avoid switching views to show a picker. A picker works well when displayed
  in context, below or in proximity to the field people are editing… in a popover."
- Fix: on wide windows an anchored popover/menu above the time-bar button (same content), modal sheet on phone.
- Screenshot: `states/time-chores-picker--desktop-light-en.png`

**02-012 · minor · principle — Option lists are stacks of bordered boxes, not a list**
- Surface: activity pickers · all · both · `src/shared/tracking/choice-row.tsx:45`
- What: each of 10 choices is its own 48 px rounded, bordered card with 8 px gaps — 20 hairlines for one list.
- Why: `lists-and-tables.md › Style`: "Choose a table or list style that coordinates with your data and platform…
  the grouped style uses headers, footers, and additional space to separate groups"; `layout.md › Visual
  hierarchy` (group with negative space *or* containers *or* separators — not all three).
- Fix: one inset-grouped list: rows 48 dp (Android) / 44 px, separators inset to the text, duration trailing in
  tabular `muted`.
- Screenshot: `states/time-chores-picker--phone-dark-en.png`

**02-013 · minor · principle — Task form is a wall of 25+ coloured chips with two selection styles**
- Surface: edit sheet, New task pane · all · both · EN/RU
- What: Category (5 hues), Importance (4), Project (3), deadline type (2), Repeat (6, wraps to two rows); selected
  is a hue fill in three groups and a grey fill + dark outline in two. Category "Домашка" and "Матанализ" are
  both yellow; category "Работа" and project "Работа" are both violet.
- Why: `toggles.md › Desktop › Radio buttons`: "Avoid listing too many radio buttons in a set… more than about
  five options, consider… a pop-up button"; `color.md › Best practices`: "Avoid using the same color to mean
  different things."
- Fix: Repeat and Deadline type as pop-up menus showing their value; Category and Project as menus with a 8 px
  colour dot; chips only for Importance (4); one selected style for all.
- Screenshot: `states/task-edit-sheet--desktop-light-ru.png`, `states/now-composer-form--desktop-dark-ru.png`

### C. Lists, rows, the check-off, the running row

**02-014 · major · principle — "Normal" importance is a green tag on every task row**
- Surface: Now, History, Project, task detail · all · both · EN/RU · `src/shared/meta-line.tsx:61-65`
- What: every row carries two washed tags; the second is almost always "Normal"/"Обычная" in green. The default
  value is the loudest thing in the meta line, and green reads as "done/good".
- Why: `design-principles` Simplicity ("Has every element earned its place?"); `color.md › Best practices`
  (one colour, one meaning); PRODUCT principle 2 ("every control earns its place").
- Fix: show importance only when it is not Normal (ASAP, Prioritized, Nice-to-have) and not as a hue wash
  (see 02-015) — e.g. a weight/glyph prefix on the title or a `warn` word for ASAP.
- Screenshot: `routes/now--phone-light-en.png`, `routes/history--desktop-light-en.png`

**02-015 · major · principle — The ten-hue palette collides across meanings**
- Surface: time bar, Insights, task tags, forms · all · both
- What (measured): time-bar outlines **Task `#0d6b66` vs Rest `#1b6e42` = 1.01:1** apart in light (both dark
  green); Insights bars Hygiene and Task both teal; Personal (category, coral/orange) vs ASAP (importance, coral);
  category "Работа" vs project "Работа" both violet; green also = Normal importance and = Rest.
- Why: `color.md › Best practices`: "Avoid using the same color to mean different things"; `color.md › Inclusive
  color`: "Avoid relying solely on color to differentiate between objects…"
- Fix: split palettes by job: projects own the hues (user-chosen, 8–10); activity categories are monochrome +
  icon (the time-bar buttons already have icons and labels); importance never uses a project hue. Contrast test
  adds a "distinct from siblings" check (ΔE ≥ 20 between hues that can appear side by side).
- Screenshot: `empty/now--phone-light-en.png` (Task vs Rest), `routes/insights--desktop-dark-en.png`,
  `states/task-edit-sheet--desktop-light-ru.png`

**02-016 · major · HIG-conformance — "Stop" uses an outlined square: it reads as an unchecked checkbox**
- Surface: running row · all · both · EN/RU · `src/shared/tracking/running-row.tsx:99`
- What: `<Square size={14}>` outline beside "Stop", directly under a list of round check boxes — "☐ Stop".
- Why: `buttons.md › Content`: "Try to associate familiar actions with familiar icons." Stop is a *filled* square
  on every platform (Material `stop` icon is filled).
- Fix: `fill={palette.fg}` (or the activity ink), or no icon.
- Screenshot: `routes/now--desktop-light-en.png` (bottom right)

**02-017 · minor · principle — One glyph, three meanings (▶, ⏸)**
- Surface: time bar, task header, task fields · all · `src/shared/tracking/time-bar.tsx:109` (▶ = start what you
  typed), `src/features/task/task-header.tsx` (`Pause`/`Play` = pause/resume a task), task date chip (▷ = start date)
- Why: `buttons.md › Content` (familiar icons for familiar actions); bug-lessons class 45 ("one word for two
  actions on one screen") applies to glyphs: the task pane's ⏸ sits next to the time bar's ▶/■.
- Fix: reserve ▶/■ for activity timing only; task pause = a text action or a snooze glyph; start date = a calendar
  glyph.
- Screenshot: `states/now-task-pane--desktop-light-en.png`, `routes/task-open--phone-dark-en.png`

**02-018 · major · principle — The running row's hierarchy is inverted**
- Surface: time bar · all · both · EN/RU · `src/shared/tracking/running-row.tsx:22-26` (label as `ColorTag` 11 px,
  elapsed 13 px), `:66-78` (two 44 px bordered buttons)
- What: the single most important live fact on Now — *what* is running and *for how long* — is an 11 px washed
  tag and a 13 px number; the visual mass is "Yes, still" and "Stop". In RU on phone "из ~20 м" wraps onto its
  own line.
- Why: `typography.md › Conveying hierarchy`: "Adjust font weight, size, and color as needed to emphasize important
  information"; `design-principles` Purpose.
- Fix: label as plain text 15–16/600, elapsed 20/600 tabular, Expect as `muted` caption; tag replaced by the pulse
  dot in the activity ink; Stop as the row's trailing control (see signature §3).
- Screenshot: `routes/now--phone-dark-ru.png`, `routes/now--desktop-light-en.png`

**02-019 · major · HIG-conformance — The check-off: no press state, no haptic, a 750 ms effect on the most frequent action**
- Surface: task rows · all · both · `src/ui/check-circle.tsx:23-40` (no `active:` style), `src/ui/dissolve.tsx:13`
  (`DISSOLVE_MS = 750`), `src/shared/task-list.tsx:75`
- What: tapping the circle gives no immediate press feedback, fills it near-black (`fg`), then 150 specks drift for
  750 ms before the list closes up; the owner reported flicker and asked for less wait (feedback-4).
- Why: `motion.md › Providing feedback`: "In apps, generally avoid adding motion to UI interactions that occur
  frequently" and "Let people cancel motion… don't make people wait for an animation to complete";
  `buttons.md › Best practices`: "Always include a press state for a custom button";
  `playing-haptics.md › Best practices`: "prefer playing short haptics that complement discrete events."
- Fix: press = circle scales 0.92 + tint; on release the circle fills with the accent and the check draws
  (≤ 150 ms) + a light confirm haptic (Android `CONFIRM`); title strike draws left→right (≈ 180 ms); row collapses
  (≈ 220 ms). Undo toast as today. See "less generic" §4.
- Screenshot: `states/now-check-dissolve--desktop-light-en.png`, `states/now-check-toast--phone-dark-en.png`

**02-020 · minor · HIG-conformance — No haptics anywhere**
- Surface: app-wide · Android · `grep expo-haptics src → 0`
- Why: `playing-haptics.md › Best practices`: "Prefer using haptics to complement other feedback… Use haptics
  consistently… Make haptics optional." Material uses haptic confirm on toggles, long-press and completion.
- Fix: one `haptics.ts` with three meanings — confirm (check-off, start/stop activity), selection (chip/segment,
  detent snap), warning (destructive confirm) — respecting the system setting.
- Screenshot: n/a

**02-021 · major · HIG-conformance — No ripple on Android; a third of the pressables have no pressed state**
- Surface: app-wide · Android (and web) · `grep android_ripple src → 0`; inventory §8: 21 of 63 pressables have no
  pressed state (every tab, the check circle, assistant approve/cancel/↵), the rest use opacity 0.7/0.75/0.8
- Why: `buttons.md › Best practices`: "Always include a press state for a custom button. Without a press state, a
  button can feel unresponsive." Material's platform press affordance is the ripple.
- Fix: one `Touchable` wrapper used by every pressable: `android_ripple={{ color: fg@12%, foreground: true,
  borderless: false }}` on Android; hover tint + `active` darken on the web (`(hover: hover)` media only).
- Screenshot: n/a (interaction)

**02-022 · major · HIG-conformance — Tab-bar selection is colour (+ 400→500 weight) only; icons stay outlined**
- Surface: tab bar · phone · both · EN/RU · `src/ui/tab-bar.tsx:62-80`
- What: selected = indigo icon and label; unselected = `muted`. Same outlined Lucide glyph, no indicator.
- Why: `tab-bars.md › Best practices`: "Prefer filled symbols or icons for consistency with the platform";
  `accessibility.md › Vision`: "Convey information with more than color alone." Material 3 navigation bar marks
  the active destination with an indicator pill behind the icon.
- Fix: Android: M3 active indicator (64×32 pill, `raised`/accent-container) + filled icon variant; web phone: the
  same indicator. Badge stays.
- Screenshot: `routes/more--phone-light-en.png`, `routes/day--phone-dark-ru.png`

**02-023 · minor · principle — Every list draws its rows differently**
- Surface: Now (rows in a bordered card with section header bars), Project/History (bare rows), History events and
  Day (hairline between rows), Settings estimates (hairlines + pills), pickers (boxed rows), Projects (washed cards)
- Why: `layout.md › Visual hierarchy`: "Group related items… use negative space, container shapes, or separator
  lines"; owner feedback-4: "Где-то есть черточки, где-то нет".
- Fix: one `List` primitive with two styles only — *plain* (separators inset to text start, no card) for content
  lists, *inset grouped* (rounded group on a grouped background) for settings and forms.
- Screenshot: `routes/now--desktop-light-en.png`, `routes/project--desktop-light-en.png`,
  `routes/history--desktop-light-en.png`, `routes/projects--phone-dark-en.png`

**02-024 · minor · principle — Day's "timeline" does not encode time**
- Surface: Day · all · both · `src/features/day/day-screen.tsx:58` (`ROW = "min-h-14 …"`), `:159-184` (GapRow)
- What: a 15 h 20 m "not logged" gap and a 1 h block are rows of the same height; the day's shape is invisible,
  while Week draws the same data proportionally.
- Why: skill craft lens ("Does structure encode information?"); `layout.md › Visual hierarchy` (order and weight
  by importance).
- Fix: a proportional day rail beside the rows (see "less generic" §3). Rows stay for editing.
- Screenshot: `routes/day--desktop-light-en.png`, `routes/day--phone-dark-ru.png`

**02-025 · minor · principle — Indigo means five things**
- Surface: app-wide · `src/features/day/day-screen.tsx:109` (running duration), `:178` ("Log" link),
  `src/ui/tab-bar.tsx:64` / `src/ui/sidebar.tsx:121` (current nav), `src/ui/switch-row.tsx:25` (switch on),
  `src/shared/tracking/time-bar.tsx:133` (running button), Insights hour bars, composer focus border, update banner
- Why: `color.md › Best practices`: "if you use your brand color to indicate that a borderless button is
  interactive, using the same or similar color to stylize noninteractive text is confusing."
- Fix: one accent for *interactive* (links, switches, selected), the activity's own ink + pulse for *running*,
  data palette for charts, neutral for current nav (fg on raised).
- Screenshot: `routes/day--desktop-light-en.png` (blue "Log" and blue "2h"), `routes/insights--desktop-dark-en.png`

**02-026 · major · principle — Lime is spent 3–4 times per screen; the sidebar's New task outshouts the view's primary action**
- Surface: desktop sidebar + panes · both · `src/ui/sidebar.tsx:180`, `src/shared/tracking/time-bar.tsx:103`,
  `src/features/now/composer/quick-line.tsx:105`, `src/shared/assistant/action-cards.tsx:118`, `src/ui/button.tsx:19`
- What: Now + task pane shows New task, Done, and the play button (olive when disabled) in lime; with the
  assistant preview also the send ↑ and Approve. In dark the lime is 17:1 against the page — always the
  brightest thing on screen, whatever the screen's job.
- Why: `branding.md › Best practices`: "Apply your app's accent color judiciously… Minimize its use on controls and
  instead use it intentionally for primary actions or status indicators"; `color.md › Liquid Glass color`:
  "Refrain from adding color to the background of multiple controls." Owner: green on important actions, "но не
  везде" (feedback-4).
- Fix: New task becomes a neutral row (icon + label + N hint); one accent fill per view — that view's primary
  action; send/play are neutral until enabled, then accent *icon* not fill.
- Screenshot: `states/now-task-pane--desktop-light-en.png`, `states/now-assistant-preview--desktop-light-en.png`

**02-027 · minor · principle — Disabled lime is 50 % opacity: olive in dark, pale chartreuse in light**
- Surface: time-bar play, Submit · all · `src/shared/tracking/time-bar.tsx:102-105` (`opacity-50`); inventory: 4
  disabled opacities (30/40/50/60)
- Why: `toggles.md › Best practices` ("Make sure the visual differences in a toggle's state are obvious") applied
  to enabled/disabled; a half-transparent accent reads as a different colour, not as "not yet".
- Fix: disabled = `track` fill + `muted` glyph, one token for every control.
- Screenshot: `routes/now--desktop-dark-ru.png` (play button)

### D. Typography

**02-028 · major · principle — The type scale has no Headline step and almost no leading**
- Surface: app-wide · inventory §3: 16 sizes, 92 % of text at 11–15 px, line height set on 35 of 345 sized strings
  (8 values), 8 "section heading" treatments
- What: row title 15/500, meta 12, tags 11, eyebrows 11 uppercase, buttons 15/500 — size steps of 1–2 px carry the
  hierarchy; nothing sits between 15 and 20/22. On Android the px sizes stay but every container shrinks 12.5 %.
- Why: `typography.md › Conveying hierarchy` ("Adjust font weight, size, and color…"); `typography.md › Using
  system fonts › text styles` — iOS Large: Body 17/22, Headline 17/22 semibold, Subhead 15/20, Footnote 13/18,
  Caption 12/16; macOS Body 13/16; `accessibility.md › Vision` (mobile default 17 pt, min 11).
- Fix: seven roles with fixed leading, e.g. phone: LargeTitle 28/34 · Title 20/25 · Headline 17/22 600 · Body
  16/22 · Subhead 14/19 · Footnote 13/18 · Caption 12/16; desktop one step down. 11 px only for tab labels and
  badges. Every `Text` takes a role, never a raw `text-[Npx]` (lint rule).
- Screenshot: `routes/now--phone-light-en.png`, `states/now-task-pane--desktop-light-en.png`

**02-029 · minor · HIG-conformance — Week labels at 10 px truncate to one letter on the phone**
- Surface: Week · phone + desktop · both · RU worst · `src/features/week/week-grid.tsx:68` (hours), `:183` (blocks)
- What: block titles "По…", "М…", "Собира…"; hour labels 10 px.
- Why: `accessibility.md › Vision` table: mobile minimum 11 pt; `typography.md › Supporting Dynamic Type`: "Keep
  text truncation to a minimum".
- Fix: 11–12 px; a block shows title only when ≥ 28 px tall and time+title when ≥ 44, else just its colour; tap
  shows the rest (already does).
- Screenshot: `routes/week--phone-light-ru.png`, `routes/week--desktop-dark-en.png`

**02-030 · minor · HIG-conformance — Fixed heights + fixed leading will clip under Android font scaling (unverified)**
- Surface: time-bar buttons `src/shared/tracking/time-bar.tsx:167,176` (`h-14`, `leading-[14px]`,
  `numberOfLines={1}`), tags `src/ui/color.tsx:101` (`leading-4`), tab labels; no `maxFontSizeMultiplier` in `src`
- Why: `typography.md › Supporting Dynamic Type`: "Make sure your app's layout adapts to all font sizes";
  `layout.md › Adaptability`: "Be prepared for text-size changes… containers may need to grow in height".
- Fix: `min-h` instead of `h`, no fixed leading on single-line labels, `maxFontSizeMultiplier≈1.3` on tab/tag
  labels only; check at Android's largest font + display size.
- Screenshot: n/a (device check)

### E. Colour, contrast, dark mode

**02-031 · major · HIG-conformance — The off switch's knob is invisible**
- Surface: every switch · all · both (worst dark) · `src/ui/switch-row.tsx:24` (`thumbColor` off = `palette.surface`)
- What (measured): dark knob `#141416` on a `#141416` sheet = **1.0:1**, on the `#0b0b0c` page **1.07:1**; light: a
  white knob on a white card. Off reads as a grey half-pill; on/off differ mainly by track colour.
- Why: `toggles.md › Best practices`: "Make sure the visual differences in a toggle's state are obvious… Avoid
  relying solely on different colors to communicate state"; WCAG 2.2 SC 1.4.11 (3:1 for state indicators).
- Fix: off knob `fg2`/white with a hairline ring, track `track` + 1 px `line` outline (Material 3 off style); on knob
  white on accent.
- Screenshot: `routes/settings--phone-dark-ru.png`, zoom `…/scratchpad/review-02/switch-dark-zoom.png`,
  `states/time-chores-picker--phone-dark-en.png`

**02-032 · nit · HIG-conformance — App-level appearance switch at the top of Settings**
- Surface: Settings · all · `src/screens/settings-screen.tsx:28,78`
- Why: `dark-mode.md › Best practices`: "Avoid offering an app-specific appearance setting." Trade-off: the owner
  uses both themes and the web has no per-site OS setting — keep it, default System, move it from the first row
  to an Appearance group lower down.
- Screenshot: `routes/settings--desktop-light-en.png`

**02-033 · minor · principle — Light theme: three grey planes, every one bordered; fields recessed below their card**
- Surface: app-wide · light · `src/ui/text-field.tsx:29` (`bg-bg` inside `surface`), `src/ui/sidebar.tsx:162`
- What: page `#eceef2`, card `#ffffff` (1.16:1), sidebar = page colour, field = page colour inside a white card;
  each separated by a hairline. "Grey on grey" (feedback-3) is structural, not a token value.
- Why: `color.md › Mobile`: system vs *grouped* background sets — "use the grouped background colors when you have
  a grouped table view; otherwise, use the system set"; `dark-mode.md › Text` ("Use system views to draw text
  fields").
- Fix: content screens (Now, Day, Inbox, History) on a plain white page with plain lists; grouped grey only for
  Settings/forms; fields filled with a faint tint of `fg` (not the page colour) with a focus ring; sidebar a
  distinct tone or translucent.
- Screenshot: `routes/now--desktop-light-en.png`, `states/task-edit-sheet--desktop-light-ru.png`

**02-034 · minor · principle — Placeholder text below AA in light theme**
- Surface: TextField, TimeInput · light · `src/ui/text-field.tsx:34`, `src/ui/time-input.tsx:48`
- What: `faint #6f717a` on the field fill `bg #eceef2` = **4.19:1** (< 4.5:1); dark `#7d7d86` on `#0b0b0c` = 4.82:1.
  Other inputs use `muted` (5.57:1) — 3 placeholder colours.
- Why: `accessibility.md › Vision` (4.5:1 up to 17 pt); WCAG 1.4.3.
- Fix: one placeholder token = `muted`.
- Screenshot: `states/task-close-as--desktop-dark-en.png` (Reason field), `routes/settings--desktop-light-en.png`

**02-035 · minor · principle — Week blocks in dark are full-saturation fills**
- Surface: Week · dark · `src/features/week/week-grid.tsx:124-140,173-183`
- What: teal/slate/green blocks at full hue on `#0b0b0c` glow; the grid draws every hour × day cell.
- Why: `color.md › Best practices`: "In dark environments, colors appear bright and saturated. Adjust app colors…";
  `dark-mode.md › Dark Mode colors` ("not necessarily inversions of their light counterparts").
- Fix: dark blocks = 30–40 % hue fill with a 3 px left edge in the full hue and `fg` text; hour lines only,
  day separators hairline at 6 %.
- Screenshot: `routes/week--desktop-dark-en.png`

### F. Settings, forms, buttons

**02-036 · minor · principle — Notification channels are a 4×3 grid of 12 switches**
- Surface: Settings › Notifications · all · both · `src/features/settings/notification-settings.tsx:54`
- Why: `toggles.md › Mobile`: "Use the switch toggle style only in a list row"; `toggles.md › Desktop ›
  Checkboxes`: "Use a checkbox instead of a switch if you need to present a hierarchy of settings."
- Fix: desktop: checkboxes in the matrix; phone: one row per kind showing "Telegram, App" with a chevron to three
  checkboxes (or the matrix with checkboxes).
- Screenshot: `routes/settings--desktop-light-en.png`, `routes/settings--phone-dark-ru.png`

**02-037 · minor · principle — Text-field widths ignore their content**
- Surface: Settings › Digest times (790 px fields for "09:00"), Decisions search · desktop ·
  `src/features/settings/notification-settings.tsx:180,218`
- Why: `text-fields.md › Best practices`: "To the extent possible, match the size of a text field to the quantity
  of anticipated text."
- Fix: time values as 96 px time fields or time chips in a row with a remove ×; search capped at the list width.
- Screenshot: `routes/settings--desktop-light-en.png`

**02-038 · minor · principle — Destructive actions are the quietest controls in Settings**
- Surface: Settings › Danger zone · all · both · `src/features/settings/delete-account.tsx:156-179` (`secondary` Wipe,
  `ghost` Delete account)
- What: "Danger zone" heading is orange, but "Delete account" is a grey ghost label that reads as disabled.
- Why: `buttons.md › Role`: "a destructive button uses the system red"; `action-sheets.md`: "Make destructive
  choices visually prominent. Use the destructive style…"
- Fix: both as `warn`-ink text actions (rows in a grouped list); the inline confirmation (`states/settings-wipe`)
  is good — keep it.
- Screenshot: `scroll/settings-3--desktop-dark-en.png`

**02-039 · nit · principle — Desktop buttons that open a dialog have no trailing ellipsis**
- Surface: "Add a computer", "Connect an AI app", "Wipe data", "Delete account" · desktop · EN/RU catalogs
- Why: `buttons.md › Desktop › Push buttons`: "Append a trailing ellipsis to the title when a push button opens
  another window, view, or app."
- Fix: add "…" to those labels in both catalogs.
- Screenshot: `scroll/settings-2--desktop-light-en.png`

**02-040 · minor · principle — Settings actions are ragged stacks of 48 px boxed buttons**
- Surface: Settings › Devices/Export/Log out · all · both
- What: Add a computer / Connect an AI app side by side, then Export data and Log out stacked, each a different
  width, each a white bordered box; Revoke a 48 px box on the session row.
- Why: `lists-and-tables.md › Best practices`: "Prefer displaying text in a list or table"; `layout.md › Visual
  hierarchy` (align to scan).
- Fix: action rows in inset-grouped sections (label leading, chevron/ellipsis trailing); Revoke as a trailing text
  action.
- Screenshot: `scroll/settings-2--desktop-light-en.png`

### G. Content, states, flow

**02-041 · minor · principle — Empty states are one muted line, aligned three different ways**
- Surface: Inbox (centred, under a 12 px system-centric paragraph), Decisions and Day (left), Now (centred) · all
- Why: `writing.md › Best practices`: "Provide clear next steps on any blank screens"; skill Lens 5: "Names come from
  what people control and recognize, not from how the system is built" ("Accept takes a note as a task with the
  guess under it…").
- Fix: one `EmptyState` (17/600 line + one sentence + optional action), left-aligned with the content column;
  the Inbox paragraph moves into the empty state and shortens.
- Screenshot: `routes/inbox--desktop-light-ru.png`, `routes/decisions--desktop-dark-ru.png`, `empty/now--phone-light-en.png`

**02-042 · minor · principle — Task detail: four unlabeled glyph buttons and a second pencil**
- Surface: task header · all · both · `src/features/task/task-header.tsx` (Pencil, Pause, Ban, Trash2) + description
  pencil
- Why: `buttons.md › Content`: "Consider using text when a short label communicates more clearly than an icon";
  "⊘" for "Give up" and "⏸" for a task are not familiar.
- Fix: "Edit" as a text action; Pause / Give up / Delete in an overflow menu (Material top app bar ⋮; desktop
  "⋯" menu); one edit entry point.
- Screenshot: `routes/task-open--phone-dark-en.png`, `states/now-task-pane--desktop-light-en.png`

**02-043 · minor · principle — The primary action moves between panes**
- Surface: New-task pane (Create top-trailing), task pane (Done in a bottom bar), dialogs (full-width at the bottom)
  · desktop · both
- Why: `sheets.md › Mobile`: "the Done button belongs on the trailing edge" (of the top bar); `layout.md ›
  Desktop`: avoid critical controls at the bottom of a window; `design-principles` Familiarity.
- Fix: phone/Android: bottom full-width primary (thumb reach, Material); desktop panes and dialogs: one place
  (top-trailing *or* bottom-trailing), the same everywhere.
- Screenshot: `states/now-composer-form--desktop-dark-ru.png` vs `states/now-task-pane--desktop-light-en.png`

**02-044 · minor · principle — No scroll edges: content runs under the sticky title and is guillotined by the time bar**
- Surface: Settings (pills cut under "Settings"), Now (last row cut by the bar) · all · both
- Why: `layout.md › Visual hierarchy`: "Differentiate controls from content… use a scroll edge effect to visually
  elevate controls above content."
- Fix: sticky headers get the page fill + a hairline that appears on scroll; the time bar gets a 12 px top fade.
- Screenshot: `scroll/settings-2--desktop-light-en.png`, `routes/now--phone-dark-ru.png`

**02-045 · minor · principle — "Now"/"›" buttons that do nothing stay on screen, greyed**
- Surface: History "Now" when at now, Day/Insights "›" at today · all · `src/screens/history-screen.tsx:102-135`
- Why: owner feedback-4 ("Громоздкая кнопка которая хуй зачем нужна…"); PRODUCT principle 2; `tab-bars.md › Best
  practices` reasoning (stable layout) argues for keeping the arrows, so: keep ‹ › in place, hide only "Now".
- Fix: "Back to now" appears only when away from now (as Day already does with Back to today).
- Screenshot: `routes/history--desktop-light-en.png`

**02-046 · minor · principle — Login: a blank band where the Telegram button should be**
- Surface: Login · desktop + phone · both · signed-out
- What: when the Telegram widget has not loaded, the card shows ≈ 80 px of nothing between the tagline and "Log in
  with the bot instead".
- Why: `loading.md › Best practices`: "Show something as soon as possible… people can interpret the lack of content
  as a problem with your app."
- Fix: reserve the widget's box with a skeleton of the button's shape; after a timeout, promote the bot link.
- Screenshot: `signed-out/login--desktop-dark-en.png`

**02-047 · minor · principle — Russian breaks row rhythm**
- Surface: Now meta lines (orphan "решено" on its own line), running row ("из ~20 м" wraps), Day ("Другое" tag
  stacks above its label on one row only), Week day headers ("р, 28") · phone · RU
- Why: `layout.md › Adaptability`: "Locale-based internationalization features like… text length"; `layout.md ›
  Visual hierarchy` (alignment).
- Fix: meta line as one `Text` with non-breaking joins (`·` + NBSP) and truncation of the least important part;
  Day rows put the tag in a fixed leading column; Week headers use 2-letter weekday + day.
- Screenshot: `routes/now--phone-dark-ru.png`, `routes/day--phone-dark-ru.png`, `routes/week--phone-light-ru.png`

---

## What works (keep it through the redesign)

- **Tokens with a contrast test** (`packages/core/src/design/contrast.test.ts`): text ≥ 4.5:1, ink on wash ≥ 4.5:1 in
  both themes. Extend it (elevation steps, sibling-hue distinctness, placeholder) rather than replace it.
- **Reduced motion honoured everywhere** (`src/ui/motion.ts`, `pulse-dot.tsx`): every animation passes
  `ReduceMotion.System`.
- **Fixed, labelled time-bar buttons** in a stable grid — the owner's explicit requirement and correct per
  `accessibility.md › Mobility` (size + spacing). Keep the positions; change the styling (02-015).
- **Inline destructive confirmation** with Cancel + "confirm in Telegram" (`states/settings-wipe--desktop-light-en.png`)
  matches `alerts.md` ("include a Cancel button").
- **Permission flow on Android**: one permission per screen, reason first, then the system dialog, with "Not now".
  HIG `privacy.md › Pre-alert screens` asks for a single button; Material's rationale pattern allows declining —
  Material wins here, keep "Skip".
- **Split-pane selection** stays highlighted in the list (`split-views.md › Best practices`), keyboard hints on
  buttons, visible browser focus on pressables (`focus/now-tab10--desktop-dark-en.png`).
- **Inter with Cyrillic self-hosted** — keep the family; use more of it (below).

## Platform notes

- **Android translation checklist** (verify on a device; the web build cannot show these — bug-lessons class 11):
  predictive Back (no `predictiveBackGestureEnabled` in `app.config.ts`), edge-to-edge navigation-bar colour per
  theme, sheet drag/swipe (02-007), ripple (02-021), M3 nav indicator (02-022), haptics (02-020), font scale
  (02-030), and every `h-11` control at 38.5 dp < 48 dp (inventory §0) — the Stop, "Yes, still", play and check
  targets on Now are all 38.5 dp.
- **Desktop web** follows web conventions, judged by macOS principles: hover states (known gap), sidebar hide
  (`sidebars.md › Best practices` — optional), anchored menus/popovers instead of centred dialogs for pickers
  (02-011), ellipsis on view-opening buttons (02-039).

---

## Make this look less generic

**What is templated today.** Dark default `#0b0b0c` + one acid-lime accent is, verbatim, one of the three
generated looks the skill warns about ("near-black with one acid-green or vermilion accent"). Around it is the
shadcn-era kit: rounded-xl cards with 1 px hairlines on a grey page, 22 % washed pill tags, 2 px outlined chips,
an 11 px uppercase tracked eyebrow over every title, a second "SaaS indigo" for state, and a dust/"Thanos"
dissolve as the one flourish. None of it comes from the subject (time, a day, pace), so it could be any to-do
app. The product's own artifacts — a running timer, the strip of a day, a check, a chevron-and-dot mark — are
drawn as the smallest things on screen.

Operate mode, no new features, no marketing: identity lives in type, rhythm, two colours and four precise moments.

1. **Two colours, one meaning each.** Neutrals do the work (plain white/near-black pages, no card unless grouped).
   **Pace green** (the owner's logo colour, re-tuned for AA — e.g. light `#2f7d32`-range ink / `#3fbf5a`-range fill,
   dark `#7ee08a`-range; final values from the palette reviewer) means exactly "go / done": the view's one primary
   action, the check fill, the logo dot, the play glyph. Drop indigo; current nav = `fg` on `raised`; links = `fg`
   underlined or accent ink. Project hues stay in the content layer (dots, the Day rail, Week blocks) —
   `branding.md`: "consider moving it into the content layer".
2. **Type with a point of view, inside Inter.** Use Inter's optical-size build (Inter Display) for the large title
   and the hero numbers only, tight tracking (-0.02 em); `tnum` + Inter's open-digit set (`ss01`/`cv` alternates)
   for every time, duration and count, so numbers read as instruments. Replace the 11 px uppercase eyebrow with the
   date set on the title line in `fg2` tabular figures ("Now · Sun 1 Nov"). Seven roles (02-028), nothing else.
3. **The signature: one "now" mark, from the logo's dot.** The mark is two chevrons and a dot; the dot is *now*.
   Use exactly that dot (same size ratio, the activity's ink) as: the running pulse in the time bar, the "now"
   marker on Week (instead of the orange-red line) and on the Day rail, and the running indicator in the sidebar
   (02-006). Pair it with a **Day rail**: a 6–8 px proportional vertical strip of the day beside Day's rows
   (blocks in their ink, unlogged time as fine diagonal hatching rather than dashed boxes, the dot at the current
   minute); the same strip, horizontal and 3 px, sits under the running row on Now as the "where today went"
   line, with the running segment ending at the dot. The elapsed time beside it is the hero number (20/600 tnum).
   Boldness is spent there; everything around it is quiet.
4. **The check-off as the defining moment, made precise.** Circle 22 → press scale 0.92; on release it fills
   Pace green and the check stroke draws in ~120 ms; the title's strike draws left→right in ~180 ms; a light
   confirm haptic; the row closes in ~220 ms. Under 0.5 s, cancellable by Undo, reduced-motion → instant fill +
   fade. It replaces the 750 ms dust (decoration, `motion.md`: avoid motion on frequent interactions).
5. **Spacing rhythm.** One 4-pt grid in **dp/px, not rem** (fixes inventory §0), one gutter (16 phone / 24 desktop),
   row heights 52 (two-line) / 44 (one-line), section spacing 24, title-to-content 16. Radii collapse to three:
   8 (controls), 12 (groups, sheets top 16), full (avatars, dots). Hairlines only as list separators.
6. **Time-bar buttons.** Keep the fixed 4-up grid; draw them as quiet neutral tiles with the activity glyph in its
   ink and the label in `fg`; the running one gets a 2 px inset bar in its ink + the dot, not an indigo flood.
7. **Remove one accessory.** The hairline around every container (and the section header bars inside the Now
   card). After that: the pencil on every Day row (the row is already the button) and the default "Normal" tag.

Check against a different brief: a habit tracker or a notes app would not get "a dot from the logo that marks now
on a proportional day strip, with timers set as instruments" — the plan is specific to Pace. Navigation and controls
remain platform components (tab bar, sidebar, sheets, menus).

---

## What this says about the system

- **There is no layer model.** Depth is "one more hairline" instead of a defined stack (page → group → elevated →
  modal) with tonal steps per theme; that single gap produces the dark-mode flatness, the grey-on-grey light theme,
  recessed fields and nested cards (02-009, 02-033, 02-023).
- **Colour tokens are named by hue, not by job.** `accent` / `accentQuiet` / ten `project-*` hues are applied
  wherever "something should stand out", so meanings pile up and collide (02-014, 02-015, 02-025, 02-026). The
  spec needs role tokens (`action`, `live`, `selected`, `danger`, `data-*`) and a test that siblings stay distinct.
- **The kit has primitives for leaves, not for structure.** Button, Chip, Tag exist; Title, List (plain/grouped),
  EmptyState, Sheet-with-gestures, Touchable-with-feedback do not — so each screen invents its header, rows,
  empty line and press state (02-003, 02-021, 02-023, 02-041).
- **Type is chosen per string, not per role.** 343 raw `text-[Npx]` with little leading means hierarchy is decided
  locally and drifts (02-018, 02-028); a role scale enforced by lint fixes the class.
- **The web build stands in for Android.** rem = 14 px, no ripple, no haptics, decorative grabber, outlined tab
  icons: Material affordances were never specified, so nothing failed a test (bug-lessons classes 10, 11). The
  spec needs an explicit Android column per component.
- **Motion is entrance-only and spent in the wrong place.** Every overlay enters and none exits; the only
  flourish sits on the most frequent action (02-008, 02-019). Define enter/exit pairs and one signature moment.
- **Signature elements were never chosen.** The product's own objects (the running timer, the day's shape, the
  mark's dot) are rendered as generic tags and rows, which is why the whole reads as a template.
