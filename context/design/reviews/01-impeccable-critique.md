DEGRADED: single-context (no sub-agent tool is exposed to this delegated reviewer; Assessment A was written down, `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/review-01/assessment-A-notes.md`, before any detector output was read, then Assessment B ran in the same context). For the native (Android) half the method line is: design review only (detector not applicable, native platform).

# 01 — impeccable `critique` of Pace (Operate, adaptive), with summaries of the native and web audits

Reviewer **01-impeccable-critique**. Method: `dev-core/skills/impeccable` v4.8.0, verbatim: `SKILL.md`,
`reference/critique.md` (procedure, heuristic scoring, cognitive load, personas), `reference/audit.native.md`
→ [01-audit-native.md](01-audit-native.md), `reference/audit.md` → [01-audit-web.md](01-audit-web.md), with
`operate.md`, `mode-operate.md`, `craft-floor.md`, `android.md`, `ios.md`. Every surface is **Operate**; platform
`adaptive` (PRODUCT.md › Platform). `impeccable context` ran from `apps/app` and loaded PRODUCT.md, DESIGN.md and both
platform references. Evidence: the baseline set (`context/design/baseline/**`, commit 057e484, all 8 manifests
complete; only `login-server-picker` is missing, Android-only), the source, and my own runs against
`http://localhost:4173` (Telegram ids 3190/3191) in
`/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/review-01/`.

**Substitutions, stated once.** (1) critique.md wants Assessments A and B in two isolated sub-agents: this
session exposes no sub-agent tool, so they ran sequentially here (banner above). (2) critique.md's "Ask the
User" step is replaced by decisions for the spec (§ Questions to Consider), because this reviewer has no channel
to the owner: `Questions skipped: delegated reviewer without a user channel; the 5 priority issues would otherwise
require the questions, so they are written as spec decisions below.` (3) critique.md's "Persist the Snapshot"
(`.impeccable/critique/`) is skipped: the brief makes the repo read-only except these three files; there is no
trend line. (4) No Android emulator exists here, so native findings are source-based (android.md › Verifying the
build); web renders at 390 px stand in for the phone.

## Summary

**46 findings: 1 blocker · 15 major · 28 minor · 2 nit** (P0 1 · P1 15 · P2 28 · P3 2). Design Health
**23/40 (Acceptable)**; native audit **9/20 (Poor)**; web audit **11/20 (Acceptable)**. axe-core is clean on
every page I ran, and the tokens hold AA contrast in both themes: the problems are in composition, state
vocabulary and platform behaviour, not in colour values. The three things that matter most:

1. **No single shell or hierarchy grammar.** Five title placements, three desktop layout models, eyebrows over
   every tab title, cards nested in cards and hairlines on everything (01-001, 01-010, 01-011, 01-012). The
   result reads as screens assembled one at a time, not one product.
2. **Colour spent on inactive things.** The default importance "Normal" is a green tag on every row, the resting
   time bar wears four hues, the edit sheet is a wall of ~23 rainbow-outlined chips, and twelve activity
   categories share ten hues so charts cannot tell Task from Hygiene (01-004, 01-005, 01-006, 01-007).
3. **Android is the web app rendered natively.** rem = 14 px makes every target 38.5–42 dp, there is no ripple,
   no haptics, no Material navigation bar, a sheet whose grab handle cannot be dragged, no tablet layout, and
   the phone IA is missing its Calendar tab (01-037, 01-036, 01-040, 01-035, 01-038, 01-002).

---

## Design Health Score (whole product)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Running activity, elapsed time, overrun ("Still doing this?"), undo toasts and skeletons are all visible; no sync/offline status in the shell; deleting a task lands on "This task does not exist" (01-009) |
| 2 | Match System / Real World | 2 | "Week" in the nav vs "Calendar" in PRODUCT and on the time bar (01-002); preset jargon ("Extends", "Override", "Per-subtask submission"); "How broken up the time was", "Switches a day 0.3"; Stop drawn as a checkbox (01-013) |
| 3 | User Control and Freedom | 3 | Undo everywhere (event sourcing shows), Escape/outside-click/Back close sheets; but sheets cannot be swiped away (01-035) and the post-delete dead end (01-009) |
| 4 | Consistency and Standards | 2 | Five title placements, three layout models, two row containers, eleven eyebrows, back "‹" beside previous-period "‹" (01-001, 01-003, 01-010, 01-011, 01-027); Android off Material (01-040) |
| 5 | Error Prevention | 3 | Destructive actions confirmed (wipe via Telegram, delete with undo); inputs constrained by chips and pickers |
| 6 | Recognition Rather Than Recall | 2 | Icon-only task actions (⊘ for Give up), truncated owner name, 10 px Week labels, truncated event blocks (01-028, 01-016, 01-018) |
| 7 | Flexibility and Efficiency | 3 | Real accelerators shown on buttons (N, F, Ctrl+Enter, Enter/Escape), paste-to-parse; no command palette, no bulk actions, no hover |
| 8 | Aesthetic and Minimalist Design | 2 | "Normal" tags, rainbow outlines, nested cards, a permanent mechanics paragraph on Inbox, a 20-section Settings page (01-004, 01-005, 01-012, 01-015, 01-023) |
| 9 | Error Recovery | 2 | Field errors are clear and polite-live; but the post-delete page, the Telegram-widget failure in raw serif, and empty states that name nothing to do (01-009, 01-030, 01-014) |
| 10 | Help and Documentation | 1 | No contextual help beyond a few hints; empty states do not teach; tooltips only on the greyed Calendar button |
| **Total** | | **23/40** | **Acceptable** |

## Heuristic scores per screen

Scored per critique.md › Heuristics Scoring Guide on all eight combos (desktop 1440 / phone 390 × light / dark ×
EN / RU). One row per screen; the last column names the combination that scored lowest and why (the number
already includes that penalty). `n/a` where a heuristic cannot apply (read-only screens: no input to prevent or
recover from), with the total renormalised (critique.md › Mode applicability).

| Screen | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 | H9 | H10 | Total | Band | Weakest combo, why |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Now | 3 | 3 | 3 | 2 | 3 | 3 | 3 | 2 | 3 | 2 | 27/40 | Acceptable | phone light RU: time bar takes ~170/844 px, meta wraps "1/3 решено" alone, dashed Calendar nearly invisible in light |
| Day | 3 | 3 | 3 | 2 | 3 | 3 | 2 | 3 | 3 | 2 | 27/40 | Acceptable | desktop dark: centred 880 column beside Now's left-pinned list (01-010); phone RU: tag jumps above the title on long rows |
| Week / Calendar | 3 | 2 | 2 | 2 | 3 | 2 | 2 | 2 | 3 | 2 | 23/40 | Acceptable | phone dark EN: clipped "3 Wed" header, 10 px labels, back "‹" next to previous "‹" (01-003, 01-018, 01-019) |
| Inbox (and Review, which renders Inbox) | 3 | 2 | 3 | 2 | 3 | 3 | 2 | 2 | 3 | 3 | 26/40 | Acceptable | desktop RU: 2-line mechanics paragraph left, empty text centred under it (01-014, 01-015) |
| Projects / project | 3 | 3 | 3 | 2 | 3 | 3 | 2 | 2 | 3 | 1 | 25/40 | Acceptable | desktop dark: hue-washed slabs, hero-metric strip on the project page (01-021) |
| Presets / preset | 2 | 1 | 3 | 2 | 2 | 2 | 2 | 1 | 3 | 2 | 20/40 | Acceptable (low) | desktop dark EN: nested section cards, override switches + inherited chips, "Extends", "Per-subtask submission"; phone RU: three icon controls per row |
| Task detail, phone screen | 3 | 3 | 3 | 2 | 2 | 2 | 3 | 2 | 2 | 2 | 24/40 | Acceptable | phone light EN: four bare icons (⊘ = Give up); Delete leaves "No project / This task does not exist" (01-009, 01-028) |
| Task detail, desktop pane | 3 | 3 | 3 | 2 | 3 | 2 | 3 | 2 | 3 | 2 | 26/40 | Acceptable | desktop light EN: two cards with different insets, lime Done half the pane wide |
| Insights | 2 | 2 | 3 | 2 | n/a | 3 | 2 | 1 | n/a | 1 | 16/32 | Acceptable (50 %) | phone light RU: "Переключени|й" breaks mid-word, back "‹" beside previous "‹", Task and Hygiene both teal (01-003, 01-007, 01-008) |
| History | 3 | 2 | 4 | 2 | 2 | 3 | 2 | 2 | 3 | 2 | 25/40 | Acceptable | phone dark EN: "‹" back + "Now" + "‹ ›"; eight identical "Undo" buttons; snapshot rows look checkable (01-022) |
| Decisions (Assistant log) | 2 | 2 | 3 | 3 | n/a | 3 | 3 | 3 | n/a | 1 | 20/32 | Acceptable (63 %) | desktop dark: route "Decisions", title "Assistant log"; empty line left-aligned and silent about what lands here |
| Review | — | — | — | — | — | — | — | — | — | — | = Inbox | | `/review` renders the Inbox screen (checked: `routes/review--desktop-light-en.png`, `routes/review--phone-light-en.png`) |
| Notifications | 3 | 2 | 3 | 2 | n/a | 3 | 2 | 3 | n/a | 1 | 19/32 | Acceptable (59 %) | desktop RU: uppercase "СЕГОДНЯ" eyebrow, divider bleeds past the column, "Журнал ассистента" as unmarked grey text |
| Settings | 3 | 3 | 3 | 2 | 3 | 3 | 2 | 1 | 3 | 2 | 25/40 | Acceptable | desktop dark: 20+ sections on one page, uppercase eyebrows, 788 px field for "09:00", off switches with a dark "hole" thumb (01-023, 01-024) |
| More (phone) | 3 | 3 | 3 | 3 | n/a | 4 | 2 | 3 | n/a | 2 | 23/32 | Good (72 %) | phone dark RU: fine; "Неделя" should be the Calendar tab, not a More row (01-002) |
| Login | 1 | 2 | 3 | 2 | 3 | 3 | 2 | 2 | 1 | 2 | 21/40 | Acceptable | desktop light RU: Telegram widget failure in browser serif; phone dark: an empty hole; dev card nested in the card (01-030) |
| Onboarding (web) | 3 | 3 | 3 | 3 | n/a | 3 | 2 | 3 | n/a | 3 | 23/32 | Good (72 %) | desktop dark: lone paragraph + 560 px lime button floating mid-screen, no product mark |
| Permissions (web) | 3 | 3 | 3 | 3 | n/a | 4 | 2 | 3 | n/a | 2 | 23/32 | Good (72 %) | desktop light: a single sentence on an empty pushed page |
| Not found | 3 | 3 | 4 | 3 | n/a | 4 | 2 | 4 | 3 | 2 | 28/36 | Good (78 %) | all: clean; the button is secondary where it is the only action |

Reading the table: no main screen reaches **Good** on the full ten; the simple, single-purpose pages (More,
onboarding, permissions, not-found) score best, and the dense task surfaces (Presets, Insights, Week) worst.
Consistency (H4) is 2 on every working screen: the inconsistency is systemic, not local.

## Design Specificity Verdict

**LLM assessment (written before the detector ran).** Category-interchangeable at the composition level. Cover
the logo and the screens read as a generic dark "utility panel" to-do app: hairline cards with a header row and a
count, outlined pill chips, washed rounded tags, a lime primary, an indigo selection colour, a centred column
with an eyebrow over a 30 px title. Any task manager could ship these components unchanged. Two things are
Pace's own and specific: the **time bar** (fixed, big activity buttons with a running row that knows how long
this usually takes and asks "Still doing this?") and the **dissolve** on check-off. Both are under-designed
relative to their importance: the time bar is drawn as four rainbow-outlined boxes, and the overrun state is an
orange progress bar that shouts. The event-sourced core (everything is undoable, History shows "the tasks as they
were at 18:20") is the product's deepest idea and has almost no visual expression beyond rows of "Undo" buttons.

**Deterministic scan.** CLI on `apps/app/dist`: 32 findings (exit 2): `design-system-color` ×16 (15 are
react-native-web/expo/library colours compiled into the bundle, **false positives**; 1 true: `#f4f5f7` in
`index.html`), `design-system-font-size` ×11 (true: 26/24/18/17/16/10 px off the DESIGN.md ramp),
`design-system-font` ×3 (library stacks, false), `bounce-easing` ×1 (reanimated's own export, false),
`overused-font` (Inter; **overruled by the brief**, PRODUCT.md pins Inter). CLI on `global.css`: `overused-font`
×4 (same). Browser overlay (6 routes × 2 viewports): `kicker-above-heading` on Insights, `undersized-ui-text`
×18 (avatar 9.12 px, Week hours 10 px), `tiny-text` (Insights tile 11 px). **The detector missed** the eyebrow on
Now, Day and Week (same component), and everything compositional: nested cards, hue collisions, layout models,
copy. **The LLM missed** the 9.12 px avatar initials until the overlay flagged them.

**Visual overlays.** Injection succeeded (script tag appended, `document.title` mutated, `detect.js` loaded) in a
headless Playwright tab, so there is no `[Human]` tab for anyone to look at; overlay screenshots are in
`.../review-01/web/overlay_*.png`. The live server ran in the background and was stopped (`live-server stop
--keep-inject`).

## Overall Impression

A careful, accessible, well-tokenised app whose pieces were each fixed in response to a complaint, and it shows:
every screen is locally reasonable and globally different. The craft bar the owner set (a first-party Apple
productivity app) fails on hierarchy and calm, not on contrast. The single biggest opportunity is a **shell and
list grammar** (one title style, one grouped-list row, one inspector pane, one state vocabulary) applied to
every screen, with colour withdrawn from everything that is not running, late or selected.

## What's Working

1. **Accessibility foundations.** axe-core reports zero violations at 390 and 1440 in both themes; ink-on-wash
   tags are contrast-tested in code (`packages/core/src/design/contrast.test.ts`); labels and roles are thorough
   (99 labels, 111 roles), reduced motion is honoured in every animation.
2. **The time bar's model.** Fixed, large, always-in-place buttons (the owner's explicit wish, feedback-2) plus a
   running row that shows elapsed vs typical length ("2h of ~20m") and a one-tap "Yes, still". The information
   design is right; only its skin is wrong.
3. **Keyboard craft on desktop.** Shortcuts printed on the buttons that own them (N, F, Ctrl+Enter, Enter/Escape on
   the assistant preview), focus restored through busy states (`ui/button.tsx:132`): this is the efficiency an
   Operate surface needs, already built.

## Priority Issues

**[P1] 1. No shell grammar: titles, layouts and containers differ per screen** (01-001, 01-010, 01-011, 01-012)
- *Why it matters:* H4 is 2 on every working screen. The owner moves between Now, Day and Calendar dozens of
  times a day; the title jumps from y 60 to 46 to 27, the column from left-pinned to centred, the container from
  a card with a header row to a bare list to cards inside cards. Familiarity is the feature on Operate surfaces
  (operate.md › The product slop test).
- *Fix:* one large-title style for sidebar destinations and one inline title for detail; no eyebrows; one
  grouped inset list (one surface level, inset separators, space between groups); one desktop grid (sidebar ·
  content at a fixed measure · inspector used by every screen with selectable items).
- *Suggested command:* /impeccable layout.

**[P1] 2. Colour on inactive state** (01-004, 01-005, 01-006, 01-007, 01-025)
- *Why it matters:* "nothing shouts without a reason" (PRODUCT principle 1). Green "Normal" on every row, four
  outline hues on a resting time bar, ~23 rainbow chips in one sheet: the eye cannot find the one late task.
  The owner already rejected lime as a band (feedback-3) and asked for "a quieter colour for quiet states"
  (feedback-4).
- *Fix:* colour only for running, late, selected and the one primary action; importance shown only when not
  Normal; categories distinguishable (no shared hues) or neutral with labels; resting controls tonal.
- *Suggested command:* /impeccable quieter (then /impeccable colorize for the category set).

**[P1] 3. Android is not Material, and its sizes are wrong** (01-036, 01-037, 01-040, 01-035, 01-038)
- *Why it matters:* the phone is where the owner sets his status "in three taps" between classes; 38.5 dp
  targets and opacity-only presses are the difference between tapping and missing.
- *Fix:* one dp scale (fix `inlineRem`), 48 dp targets, a platform press layer (ripple + haptics on Android, hover +
  focus ring on the web), Material navigation bar/rail, a draggable sheet.
- *Suggested command:* /impeccable adapt.

**[P1] 4. Navigation and IA drift from product truth** (01-002, 01-003)
- *Why it matters:* PRODUCT.md fixes the phone tabs as Now · Day · Calendar · Inbox · More; the build has four
  tabs, Calendar is a pushed screen named "Week", and on Insights/Week/History the back chevron sits beside an
  identical "previous period" chevron.
- *Fix:* five tabs; one name (Calendar); period stepper as one control with the range between its arrows,
  separate from back.
- *Suggested command:* /impeccable shape.

**[P2] 5. Dead ends and silent empties** (01-009, 01-014, 01-015, 01-030)
- *Why it matters:* the end of a flow is what the person remembers (critique.md › emotional journey). Deleting a
  task from its page ends on "This task does not exist"; empty Now says "Nothing to do right now." without
  pointing at the composer; Inbox explains its mechanics in a permanent 12 px paragraph instead.
- *Fix:* pop back after delete (the undo toast is the recovery); every empty state names what appears there and
  the one action; move explanations into empty states.
- *Suggested command:* /impeccable onboard.

## Persona Red Flags

Interface type: productivity dashboard with heavy forms (critique.md › Selecting Personas → Alex, Sam, plus Casey
for the phone half). No `## Design Context` in CLAUDE.md, so no generated persona; the owner's scenarios
(PRODUCT.md › Users) are used as the walkthrough.

**Alex (power user), desktop: paste homework → create → work it.** Paste into the composer, Enter parses, Enter
approves: fast. Then: no hover anywhere, so nothing tells him which row the pointer is on; task actions are four
bare icons (Give up is ⊘); edit opens a modal with ~23 chips instead of editing in the inspector pane that is
already open beside the list; History needs one "Undo" click per event, no multi-select; the sidebar truncates
his own name to "D…".

**Sam (keyboard / low vision), desktop.** Tab reaches the sidebar with the browser's default ring (focus
screenshots `context/design/baseline/focus/*`), but in every text field the ring is removed and nothing replaces
it (`global.css:44-47`; WCAG 2.4.7). Avatar initials 9.12 px; Week hour labels and block titles 10 px; the
greyed Calendar button is a dashed 13 %-black outline that nearly vanishes in light; off switches in dark show a
near-black thumb.

**Casey (one-handed phone, between classes): set status, check what is due.** The time bar is in the thumb zone
(good) but takes ~170 of 844 px with two running rows, leaving 3.5 tasks visible; the composer and the bell are at
the top; Calendar is two taps deep behind More; sheets show a grab handle that does not drag; on Android every
44-px target is 38.5 dp (unverified on device, 00-inventory §0).

## Cognitive Load

Checklist (critique.md › Cognitive Load Checklist): **3 failures, moderate.**
- Fail **Minimal choices**: the edit sheet and composer form show ~23 options at once
  (`states/task-edit-sheet--desktop-light-ru.png`); a preset shows 6 sections × override switch × 2–4 chips.
- Fail **Visual hierarchy**: on Now the most saturated things are the four time-bar outlines and the "Normal"
  tags, not the task that is due tomorrow.
- Fail **Single focus** (phone): composer, filter chips, two grouped cards, two running rows, a fold button and
  the tab bar compete in 844 px.
- Pass: chunking (groups "With a deadline / No deadline"), grouping, one thing at a time (assistant preview
  approves one proposal), working memory, progressive disclosure ("In future · 2", "Original message").

## Emotional Journey

Peak: the dissolve when a task is checked, followed by "Done: … · Undo" — a real moment of relief and safety.
Valleys: the overrun state paints "Still doing this?" and a full-width orange bar after a commute ran long (a
gentle prompt drawn as an alarm, against principle 4 "forgetfulness is normal"); deleting a task ends on an
error page; a failed Telegram widget on the login card shows raw serif text. End of day: Day's "15h 20m not
logged · Log" is the right gentle nudge.

## Minor Observations

- Stop is a 14 px outline square: it reads as a checkbox beside a running timer (01-013).
- The bell is the only bordered icon button in the app (01-044).
- The assistant preview has two lime primaries (Approve and the send arrow) and an `↵` glyph button (01-045).
- Projects are full-width hue slabs; the project page opens with a washed "Open / On time / Late" strip (01-021).
- Docked toast in the 200 px sidebar shows half of a fourth line (01-020).
- History's "tasks as they were" rows carry live-looking check circles (01-022).
- Settings shows a 788 px text field for "09:00" (01-023).

## Questions to Consider (decisions for the spec)

- What if the date, the running activity and the period were the only "chrome" a screen had, and the title
  carried nothing above it? Does Pace need an eyebrow anywhere?
- What would the time bar look like if it were calm until something runs, and then the running activity owned
  the colour? Is the overrun a warning or a question?
- Could History be the signature: a scrubbable timeline ("as of 18:20") instead of a list of Undo buttons?
- Does the desktop need modals at all when an inspector pane is always present (edit, close-as, project picker)?
- Five phone tabs per PRODUCT, or is Calendar's place a decision the owner wants to revisit? (PRODUCT says fixed.)

---

## Audit summaries

### Native audit — [01-audit-native.md](01-audit-native.md): **9/20, Poor**

| Accessibility | Performance | Appearance & Theming | Platform Conformance | Adaptivity |
|---|---|---|---|---|
| 2 | 2 | 3 | 1 | 1 |

Verdict: **fail**, the Android build reads as the web app rendered natively. Root causes: rem compiled at 14 px
(every target 38.5–42 dp), opacity presses with no ripple and no haptics although PRODUCT.md promises both, a
hand-drawn navigation bar without the Material indicator and without Calendar, a bottom sheet without drag or exit
motion, a portrait lock and no layout between phone and 1024 dp, unvirtualised lists. Strengths: labels/roles,
reduced motion, safe-area insets, system Back never hijacked, fully tokenised colour.

### Web audit — [01-audit-web.md](01-audit-web.md): **11/20, Acceptable**

| Accessibility | Performance | Theming | Responsive | Implementation Integrity |
|---|---|---|---|---|
| 2 | 2 | 3 | 2 | 2 |

axe-core clean on 16 runs; no horizontal overflow at 390/768/1024/1280/1440; fonts right-sized (67.6 KB, two
preloaded subsets). Against that: no focus indicator on any text field (WCAG 2.4.7, the blocker), UA
selection/scrollbars, one 796 KB-gzip JS chunk, CLS 0.188 on History and ~0.1 on Now at 390 px, 768 px served as a
stretched phone, 36 px icon buttons and 24 px switch targets, sub-11 px text.

---

## Findings

Severity: **blocker** (P0) breaks a task or WCAG AA · **major** (P1) visibly wrong on a main screen or breaks a
platform convention · **minor** (P2) craft gap · **nit** (P3). Paths under `apps/app/` unless stated. Screenshot
paths starting with `baseline/` are under `context/design/baseline/`; `SCR/` is
`/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/review-01/`.

| id | sev | surface | viewport/theme/lang | file:line | what | why (citation) | suggested fix | screenshot |
|---|---|---|---|---|---|---|---|---|
| 01-001 | major | Now, Day, Week, Insights titles; Settings, Notifications, Preset, Inbox, login section labels | all 8 | `src/ui/screen-header.tsx:48-52`; `src/screens/settings-screen.tsx:40`; `src/features/notifications/notifications-screen.tsx:233`; `src/features/presets/preset-sections.tsx:31`; `src/screens/inbox-screen.tsx:30`; `src/screens/login-parts.tsx:46` | 11 px uppercase tracked eyebrow over the 30 px title and as section labels: 11 sites, not one (known — deepened) | craft-floor.md › Refuse "A kicker or eyebrow above a heading. This one is a ban"; detector `kicker-above-heading` | delete; date becomes trailing secondary text in the title line; section labels become sentence-case group headers of an inset list | `baseline/routes/now--desktop-dark-en.png`, `baseline/routes/settings--desktop-dark-en.png` |
| 01-002 | major | phone navigation | phone, all | `app/(tabs)/_layout.tsx:21-26`; `src/ui/tab-bar.tsx:87-92` (comment `:149` still says Calendar); `packages/core/src/i18n/en/shell.ts:13`; `src/ui/sidebar.tsx:52-57` | 4 tabs; Calendar is a pushed screen behind More (back chevron, no tab bar) and is called "Week" in nav while PRODUCT and the time bar say Calendar | PRODUCT.md › Operating Context (fixed IA: Now · Day · Calendar · Inbox · More); android.md › Layout & structure; H4 | 5 tabs; one name, Calendar; "Week" only as a range label | `baseline/routes/more--phone-dark-ru.png`, `baseline/routes/week--phone-dark-en.png` |
| 01-003 | major | Insights, Week, History headers | phone all; History desktop | `src/features/insights/insights-screen.tsx:83`; `src/features/week/week-screen.tsx:83,147-148`; `src/shared/week-arrows.tsx:20,29`; `src/ui/screen-header.tsx:37-46` | back "‹" and previous-period "‹" are the same glyph, size and colour 40 px apart; History adds a grey "Now" pill | H4, H3; ios.md › Layout & structure "no mixed metaphors"; android.md › Layout "Top app bar for screen context" | period stepper as one control "‹ Oct 26 – Nov 1 ›" under the title; back alone in the bar | `baseline/routes/insights--phone-light-ru.png`, `baseline/routes/history--phone-dark-en.png` |
| 01-004 | major | every task row (Now, project, History, picker, preview) | all | `src/shared/meta-line.tsx:61-64`; `packages/core/src/design/tokens.ts:71-88` | default importance "Normal" is a green tag on every row: the tag that says nothing is the most repeated coloured element | H8; operate.md › Product constraints "Heavy color … on inactive states"; PRODUCT principle 2 | show importance only when not Normal | `baseline/routes/now--phone-light-en.png`, `baseline/states/time-task-picker--phone-light-en.png` |
| 01-005 | major | time bar | all | `src/shared/tracking/time-bar.tsx:131-146,160-167`; `src/ui/color.tsx:55-66` | resting buttons in four 2 px outline hues + dashed; the idle control strip is the most colourful element on Now | operate.md › Color ("Accent … state indicators only, not decoration"); owner feedback-4 "quieter colour for quiet states" | tonal neutral resting buttons, category ink on the icon only; colour reserved for the running button | `baseline/routes/now--desktop-dark-en.png`, `baseline/empty/now--phone-dark-en.png` |
| 01-006 | major | Edit task sheet, composer form | all; worst phone RU | `src/features/task/task-sheets.tsx`; `src/shared/task-fields/*`; `src/ui/chip.tsx:15-28` | ~23 chips with coloured 2 px outlines in 6 groups on one screen; description field cut by the footer on desktop | critique.md › Cognitive Load "Minimal choices", "The Wall of Options"; H8 | inset list rows with value + picker ("Category › Homework"); segmented only for ≤4 options; neutral outlines | `baseline/states/task-edit-sheet--desktop-light-ru.png`, `baseline/states/now-composer-form--phone-light-ru.png` |
| 01-007 | major | Insights charts, Week blocks, tags | all | `packages/core/src/tracking/categories.ts:10-23` | 12 categories on 10 hues: task = hygiene (teal), commute = chores = other (slate), rest = sport (green), study = sleep (violet); Insights shows Task and Hygiene in the same teal | H4; WCAG 1.4.1 (colour must not be the only, and here wrong, cue); dataviz categorical rule | no shared hues, or neutral bars with labels and one highlight | `baseline/routes/insights--desktop-dark-en.png` |
| 01-008 | major | Insights stat tiles | phone RU, both themes | `src/features/insights/patterns.tsx:87-92` | "Переключени\|й в день" breaks mid-word in a 1/3-width tile; 11 px label | craft-floor.md › Verify "Run the real copy at every breakpoint"; brief (RU +15–40 %); detector `tiny-text` | label/value rows on phone, no 3-up grid under ~500 px | `baseline/routes/insights--phone-light-ru.png` |
| 01-009 | major | task page after Delete | desktop + phone, all | `src/features/task/task-screen.tsx:87`; `src/features/task/task-header.tsx:80` | after Delete the page stays: header "No project", body "This task does not exist." | H3, H9; critique.md › Emotional journey | pop back to where the task was opened; the undo toast is the recovery | `baseline/states/task-delete-confirm--desktop-dark-en.png` |
| 01-010 | major | desktop shell | desktop 1024–1440, all | `src/ui/screen.tsx:33`; `src/ui/split-pane.tsx:20-22` | three layout models: Now list 560 + empty pane 656; Day/Insights/Settings/Projects centred 880 with dead gutters, no pane; Week grid + empty 400 pane; title x jumps 244 → 412 | H4; operate.md › Layout "Responsive behavior is structural"; owner feedback-4 (Week like Now: list left, info right) | one grid: sidebar · content at fixed measure · inspector for every screen with selectable items; empty pane never wider than its list | `baseline/routes/now--desktop-dark-en.png`, `baseline/routes/day--desktop-dark-en.png`, `baseline/routes/week--desktop-light-en.png` |
| 01-011 | major | page titles | all | `src/ui/screen-header.tsx:32,55`; `src/ui/back-header.tsx:51` | title baseline y≈60 (Now, Day), 46 (Settings, Projects, Inbox), 36 (pushed), 27 (History); 30 px vs 22 px for top-level destinations depending on phone push | H4; ios.md › Layout & structure "Large titles on top-level screens … detail screens stay inline" | one large title for destinations, one inline title for detail, same top inset | `baseline/routes/history--desktop-light-ru.png`, `baseline/routes/settings--desktop-dark-en.png` |
| 01-012 | major | containers everywhere | all | `src/features/now/now-task-groups.tsx:26-27`; `src/features/insights/card.tsx:15` + `patterns.tsx:87`; `src/screens/login-parts.tsx:45`; `src/features/presets/preset-form.tsx:43,119`; `src/shared/assistant/action-cards.tsx:26,78`; `src/screens/settings-screen.tsx:37`; `src/features/notifications/notifications-screen.tsx:150` | cards in cards (Insights tiles, composer › preview › field, login › dev card, preset sections); a 1 px line on every container; dividers bleed 20 px past the column on Settings/Notifications/subtasks | craft-floor.md › Refuse "nested cards are always wrong"; owner feedback-4 "где-то есть черточки, где-то нет" | one surface level, grouped inset lists, separators inset to text, space between groups | `baseline/routes/insights--desktop-dark-en.png`, `baseline/states/now-assistant-preview--desktop-dark-en.png` |
| 01-013 | minor | Stop | all | `src/shared/tracking/running-row.tsx:99`; `src/shared/tracking/choices-sheet.tsx:137` | Stop uses lucide `Square` outline 14 px: reads as an unchecked checkbox | H2; craft-floor.md › Refuse (icon system) | filled stop square or text-only | `baseline/routes/now--desktop-light-ru.png` |
| 01-014 | minor | empty states | all | `src/ui/empty-state.tsx:13-15`; `src/features/now/now-screen.tsx:46`; `src/screens/decisions-screen.tsx:137-140` | "Nothing to do right now." / "Nothing to sort." / "Nothing in the log yet." teach nothing; Inbox centres it, Decisions left-aligns it | operate.md › Components "Empty states that teach the interface"; H10 | one pattern: what lands here + the one action, aligned to the column | `baseline/empty/now--phone-dark-en.png`, `baseline/routes/decisions--desktop-dark-en.png` |
| 01-015 | minor | Inbox | all | `src/screens/inbox-screen.tsx:24` | permanent 12 px muted mechanics paragraph above the list | H8; operate.md › The product slop test | move into the empty state and the row actions | `baseline/routes/inbox--desktop-dark-ru.png` |
| 01-016 | minor | sidebar header | desktop all | `src/ui/sidebar.tsx:165-175` | mark + wordmark + avatar + name + bell in 200 px: the owner's name truncates to "D…" (he asked for it there, feedback-4) | H6; craft-floor.md › Verify "Type" | account (avatar + full name) at the sidebar foot | `baseline/routes/now--desktop-dark-en.png` |
| 01-017 | minor | avatar | desktop | `src/shared/user-avatar.tsx:32` | initials render at 9.12 px | detector `undersized-ui-text`; ios.md › Typography "11 pt floor" | ≥11 px | `SCR/web/en-dark-1440_.png` |
| 01-018 | minor | Week grid | all | `src/features/week/week-grid.tsx:68,183` | 10 px hour labels and block titles on full-hue fills, truncated to "Поше…", "М…" | detector `undersized-ui-text` ×17; ios.md 11 pt floor | 11–12 px, tinted blocks with ink text like tags | `baseline/routes/week--desktop-light-en.png` |
| 01-019 | minor | Week phone header | phone all | `src/features/week/week-grid.tsx` (day header row) | first day label clipped at the edge ("3 Wed"); "Swipe to see all days" hint is the only affordance | craft-floor.md › Verify "Type" (overflow); H6 | snap so the first visible day is whole | `baseline/routes/week--phone-dark-en.png` |
| 01-020 | minor | docked toast | desktop | `src/ui/toast.tsx:107,133` | 3-line clamp shows half a 4th line through `py-2.5` on the clamped Text in the 200 px dock | craft-floor.md › Verify "Type" | padding on the wrapper; toast bottom-centre of content | `baseline/states/now-check-dissolve--desktop-dark-en.png` |
| 01-021 | minor | Projects, project | all | `src/screens/projects-screen.tsx:71-85`; `src/screens/project-screen.tsx:84-85` | full-width hue-washed slabs; hero-metric strip (Open / On time / Late) | craft-floor.md › Refuse "The hero-metric template"; operate.md › Color | list rows with a colour dot; stats as a quiet meta line | `baseline/routes/projects--desktop-dark-en.png`, `baseline/routes/project--desktop-light-en.png` |
| 01-022 | minor | History | all | `src/screens/history-screen.tsx:64-87` | an "Undo" text button on every event (8+ per screen); snapshot tasks show live-looking check circles | H8; H2 | undo on selection/context menu or a trailing icon; read-only snapshot rows | `baseline/routes/history--desktop-light-ru.png` |
| 01-023 | minor | Settings | all | `src/screens/settings-screen.tsx:37-40`; `src/features/settings/notification-settings.tsx:180` | one 20+ section page, uppercase labels, full-bleed lines, a 788 px field for "09:00", Export and Sign out as two stacked buttons | ios.md › Components & controls "Grouped/inset lists for settings-shaped content"; H8 | grouped inset list; compact trailing time values; account actions as rows | `baseline/routes/settings--desktop-dark-en.png`, `baseline/states/settings-wipe--desktop-light-ru.png` |
| 01-024 | minor | switches | dark (Android, web); web all | `src/ui/switch-row.tsx:24-25`; `src/ui/switch-size.web.ts` | off thumb = `surface` #141416 on `muted` track reads as a hole; web target 48×24 | android.md › Components & motion; PRODUCT.md › Accessibility (≥44 pt) | Material-3 geometry; 44 px row target | `baseline/routes/settings--phone-dark-ru.png` |
| 01-025 | minor | disabled primary | all | `src/shared/tracking/time-bar.tsx:100-105`; `src/ui/button.tsx` | disabled lime at 50 % = muddy olive on dark, pale wash on light; 4 disabled opacities in the app | operate.md › Color "State-rich semantic vocabulary … Standardize these" | one disabled token (neutral fill, muted icon) | `baseline/empty/now--phone-dark-en.png` |
| 01-026 | minor | unavailable Calendar button | light all | `src/shared/tracking/time-bar.tsx:139-141` | dashed 13 %-black border on white over #eceef2: the control nearly disappears | craft-floor.md › Verify "Contrast"; WCAG 1.4.11 | solid tonal button, muted label, state word | `baseline/routes/now--desktop-light-ru.png` |
| 01-027 | minor | task rows in picker vs Now | all | `src/features/now/now-task-groups.tsx:26` vs `src/shared/tracking/choice-row.tsx:45` | same row is a row in one card on Now and a separately bordered card in the picker | operate.md › Components "Consistent affordances"; H4 | one list-row component | `baseline/states/time-task-picker--phone-light-en.png` |
| 01-028 | minor | task actions | all | `src/features/task/task-header.tsx:66-80` | Edit / Pause / Give up (⊘ Ban) / Delete as four bare icons | H6 "Labels on icons"; persona Jordan | keep Edit; the rest in a labelled overflow menu | `baseline/routes/task-open--phone-light-en.png` |
| 01-029 | minor | running row, Day rows | phone RU | `src/shared/tracking/running-row.tsx`; `src/features/day/day-screen.tsx` | "из ~20 м" drops to its own line; Day puts the tag above the title only on long rows | craft-floor.md › Verify "Type" | fixed two-line row: title line, meta line | `baseline/states/now-check-toast--phone-dark-ru.png`, `baseline/routes/day--phone-light-ru.png` |
| 01-030 | minor | login | signed-out all | `src/auth/telegram-widget.web.tsx` | failed Telegram iframe: "Bot domain invalid" in UA serif (light), an empty hole (dark); environmental here, but the failure path ships | H9; craft-floor.md › Verify "Browser surfaces" | detect the failed frame; themed message; bot login as the main button | `baseline/signed-out/login--desktop-light-ru.png`, `baseline/signed-out/login--phone-dark-en.png` |
| 01-031 | minor | composer and subtask icon buttons | all | `src/features/now/composer/quick-line.tsx:104`; `src/shared/task-fields/subtask-list.tsx:63,104` | 36×36 px (31.5 dp on Android) | PRODUCT.md › Accessibility; android.md › Touch targets | 44 px / 48 dp | `SCR/web/audit-en.json` (dark-390_) |
| 01-032 | blocker | text fields, browser surfaces | web all | `global.css:44-47`; no `::selection`/`caret-color`/scrollbar rule | no focus indicator on any of the 11 text inputs; UA selection and scrollbars (known — deepened: every field, plus the unthemed surfaces) | WCAG 2.4.7 (AA); craft-floor.md › Verify "Browser surfaces" | one `:focus-visible` ring token for every focusable; themed selection, caret, scrollbars | `baseline/focus/now-tab6--desktop-dark-en.png` |
| 01-033 | nit | PWA chrome | web light | `public/index.html:9,26` | `#f4f5f7` ≠ token `#eceef2` (known) | detector `design-system-color` | derive from tokens at build | — |
| 01-034 | minor | motion | all | `src/ui/motion.ts:16-31`; `src/ui/sheet.tsx:134` | no exit transitions; `DIALOG_ENTER` = reanimated `ZoomIn` from scale 0 (its comment says "slightly smaller"); no explicit ease-out; 9 durations | craft-floor.md › Verify "Motion"; operate.md › Motion; ios.md › Motion "dismiss reverses the entrance" | exits reverse entries; zoom 0.96→1; one ease-out token | code |
| 01-035 | minor | bottom sheet | phone / Android | `src/ui/sheet.tsx:50-58,162` | grab handle drawn, no pan gesture: swipe-down does nothing | ios.md › Components & controls "honor swipe-to-dismiss"; android.md › Components & motion | drag-to-dismiss or no handle | `baseline/states/time-task-picker--phone-light-en.png` |
| 01-036 | major | press feedback | Android | 63 `Pressable`s with `active:opacity-*`; 0 `android_ripple`; no `expo-haptics` | no ripple and no haptics, both promised by PRODUCT.md › Platform | android.md › The Android slop test | platform press primitive (ripple + haptics on Android, hover + focus on web) | code |
| 01-037 | major | all sizes | Android | `metro.config.js:51-54` (`inlineRem` 14) | every `h-11` target 38.5 dp, `Button` 42 dp; text/box ratios differ from the web (00-inventory §0, unverified on device) | android.md › Touch targets (48 dp) | one dp scale (`inlineRem` 16 or dp tokens) | code |
| 01-038 | major | medium widths | Android tablet/foldable, web 600–1023 | `src/ui/layout.ts:4`; `app.config.ts:68` | phone UI stretched: 4 tabs across 768 px, 700 px rows; portrait lock | android.md › Layout & structure "never ship a phone bottom-bar untouched on a tablet"; audit.native.md › Adaptivity | rail + list/detail ≥600; lift lock | `SCR/web/en-dark-768_.png` |
| 01-039 | minor | long lists | Android | `src/ui/screen.tsx:38` (ScrollView); 0 FlatList | History, Notifications, Assistant log, presets render every row | audit.native.md › Performance "Unvirtualized lists" | FlatList/FlashList | code |
| 01-040 | minor | tab bar | Android | `src/ui/tab-bar.tsx:119-145` | no active-indicator pill, 42 dp tabs, 11 px labels, no ripple | android.md › Components & motion (Material navigation bar) | M3 navigation-bar geometry | `baseline/routes/now--phone-dark-ru.png` |
| 01-041 | minor | load stability | web phone | (hydration of lists/time bar) | CLS 0.188 History, 0.096–0.113 Now at 390 px | audit.md › Performance; CLS ≤ 0.1 | reserve list height / skeleton | `SCR/web/audit-en.json` |
| 01-042 | minor | bundle | web | `dist/_expo/static/js/web/entry-54a5…js` | 3.60 MB raw / 796 KB gzip, one chunk for every route | audit.md › Performance "Bundle size" | route-level async chunks | — |
| 01-043 | nit | type ramp | all | bundle (11 detector sites) | 26/24/18/17/16/10 px off the DESIGN.md ramp; 16 sizes in use (00-inventory §3.1) | detector `design-system-font-size`; operate.md › Typography "Tighter scale ratio" | 6-role scale | — |
| 01-044 | minor | bell | phone | `src/shared/notifications/notification-bell.tsx:34-35` | the only bordered surface icon button (all 19 `IconButton`s are plain) | H4 | plain icon in the app bar | `baseline/routes/now--phone-light-en.png` |
| 01-045 | minor | assistant preview | all | `src/shared/assistant/action-cards.tsx:118`; `src/features/now/composer/quick-line.tsx:105` | two lime primaries in one card (Approve, send arrow); correction field + `↵` glyph button (↵ known) | operate.md › Color "Accent … primary actions"; craft-floor.md › Refuse "Unicode glyphs … standing in for an icon" | one primary; send neutral while a preview is open | `baseline/states/now-assistant-preview--desktop-dark-en.png` |
| 01-046 | minor | phone time bar | phone all | `src/shared/tracking/time-bar.tsx`, `time-bar-fold.tsx` | docked strip ~170/844 px with two running rows; the expanded composer form scrolls under it | critique.md › Cognitive Load "Single focus"; persona Casey | compact one-line running summary; hide while the composer form is open | `baseline/states/now-composer-form--phone-light-ru.png` |

Also noted for the orchestrator (not a design finding): `impeccable live-server` writes
`.impeccable/live/server.json`; something staged it while my server ran (`git show :.impeccable/live/server.json`
shows my pid 24823) and `live-server stop` deleted the file, so the index now holds a stale entry (`AD`). It should be
unstaged, not committed. I made no git changes.

## What this says about the system

- **Fixes were made per complaint, not per class.** Each feedback round fixed the screen in the screenshot
  (the banner colour, Day's dividers, the Week pane), so the same mistake survives on the next screen. The spec
  needs composition rules (title, list, inspector, empty state), not more tokens.
- **There is no hierarchy device except size steps of 1–2 px and grey ramps**, so the system reaches for
  borders, eyebrows, cards and colour to separate things. One surface level with inset grouped lists and a
  real 6-role type scale removes most of that scaffolding.
- **Colour has no budget.** Ten project hues, twelve category mappings, two accents, warn and question all
  draw on the same small surfaces; inactive defaults ("Normal", resting buttons, unselected chips) get colour
  because the component always paints it. The spec should state when colour is allowed: running, late,
  selected, the one primary action.
- **State vocabulary is missing as a layer**: no hover, no focus ring on fields, four disabled and three
  pressed looks, five selected looks. One state token set, applied by the kit primitives, fixes classes.
- **One React Native tree with no platform layer.** Android gets web presses, web sheets and web sizes (rem =
  14 px); the web gets touch-only states. The kit needs a thin platform layer (press, sheet, navigation, focus)
  so "Material on Android, web conventions on the web" is a component property, not a per-screen decision.
- **Layout is decided per screen**, so the desktop has three models and the tablet none. A shell with named
  regions (navigation · content · inspector) and two breakpoints makes every screen inherit the right one.
- **Product truth drifted in the shell** (Calendar tab, Review = Inbox, "Week" vs "Calendar"): the spec should
  carry the IA as a checked list the nav components render from.

### Identity note: what reads as templated, and what could be Pace's own (Operate, no new features)

**Templated / default now:** the dark utility-panel look itself (near-black, hairline cards, lime CTA, indigo
selection); the eyebrow-over-title header; outlined pill chips and washed rounded tags as the universal
vocabulary; the hero-metric strip on the project page; the stat tiles on Insights; the centred "Nothing here"
empty line; Inter at 11–15 px with grey ramps for hierarchy; lucide icons at mixed strokes. With the logo covered,
nothing says Pace.

**Where Pace's recognisable details can live** (operate.md › Directions: the world lends type, palette,
density and one signature move; navigation and controls stay standard):
- **Signature move: time as a measured line.** Pace's truth is "one log for tasks and time". The time bar's
  running row, Day's timeline, a task's tracked-vs-estimate and the Week grid can share one drawn element: a
  thin elapsed-vs-typical rule (the "2h of ~20m" relationship) with the same tick, the same "now" marker and
  the same "not logged" gap treatment everywhere. Calm until it runs over; then the rule, not the screen, changes.
- **The "as of" timestamp as a typographic device.** Event sourcing is the deepest product idea; History's
  "tasks as they were at 18:20" and the editable `occurredAt` could share one tabular-figure time stamp style
  (Inter tabular numerals, one weight, one place in the row) so time reads as Pace's material across Now, Day,
  History and the assistant's proposals.
- **Proposals look like proposals** (PRODUCT principle 5): the assistant's draft rows could have one distinct,
  quiet "draft" treatment (dashed check, the original text kept visible beneath) used identically on Now, Inbox
  and Day, instead of a lime card.
- **Palette with a budget:** a calm neutral shell (light and dark from the use scene: desk by day, phone in the
  evening, so both first-class), the owner's green kept for the logo and the one primary action (feedback-4),
  one state colour for "running", warn only for late. Categories identified by name and icon first, hue second.
- **Density as craft:** a fixed two-line row (title; meta in tabular figures) set to a strict 4/8 rhythm, the
  same in Now, the picker, project and History, so the product feels like one instrument rather than a set of
  screens.
