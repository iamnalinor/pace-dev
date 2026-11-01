# Pace design overhaul: consolidated findings (the evidence base)

This file is the evidence the redesign spec is built on. It merges every finding from the eight review passes of the 2026-11 visual overhaul into one deduplicated list, grouped by theme. Each consolidated finding keeps the measured numbers, the files, the citations, the screenshots and the ids of every reviewer finding merged into it. The fix direction is one line per finding; the spec decides the details.

- **Baseline:** commit `057e484` (2026-11-01): web export on `:4173`, baseline screenshots `context/design/baseline/**` (8 manifests: phone 390 / desktop 1440 × light/dark × EN/RU), and source reads. No pass ran on an Android device or emulator. Android claims come from source and from inventory §0 (rem = 14 px). See "Verify on hardware".
- **Inputs:** `context/design/reviews/00-inventory.md` (design-system survey with no findings of its own; cited as "inventory §n"), `01-impeccable-critique.md` (+ `01-audit-native.md`, `01-audit-web.md`, which share 01's ids), `02-apple-design.md`, `03-web-design-guidelines.md`, `04-motion.md`, `05-break-ui.md`, `06-mobile-native.md`, `07-ux-walk.md`, `08-a11y.md`. Context: `PRODUCT.md`, `DESIGN.md` (incumbent system), `CLAUDE.md`, `context/bug-lessons.md`.
- **Reviewers:**
  - 01: impeccable critique and audits.
  - 02: Apple HIG and craft.
  - 03: Web Interface Guidelines (web layer).
  - 04: motion (review-animations).
  - 05: break-ui (worst-case data).
  - 06: mobile-native (PWA on a phone).
  - 07: UX walk (owner scenarios, inconsistency inventory).
  - 08: accessibility (WCAG 2.2 + APCA, measured).
- **Severity:**
  - blocker: breaks a task or fails WCAG 2.2 A/AA.
  - major: visibly wrong on a main screen, or breaks a platform convention.
  - minor: a craft gap.
  - nit: polish.
  
  A consolidated finding takes the **highest** severity any reviewer gave, and disagreements are noted beside the severity.

## Counts

| Reviewer | findings | blocker | major | minor | nit |
|---|---|---|---|---|---|
| 01 impeccable (46 numbered + 3 unnumbered native-audit items `01-N1..N3`) | 49 | 1 | 15 | 30 | 3 |
| 02 apple-design | 47 | 0 | 18 | 27 | 2 |
| 03 web guidelines (summary says 16 minor / 6 nit; its table rates 15 / 7, the table is used) | 29 | 1 | 6 | 15 | 7 |
| 04 motion | 24 | 0 | 11 | 9 | 4 |
| 05 break-ui | 31 | 2 | 11 | 12 | 6 |
| 06 mobile-native | 14 | 0 | 5 | 7 | 2 |
| 07 UX walk | 35 | 0 | 11 | 20 | 4 |
| 08 a11y | 30 | 8 | 11 | 8 | 3 |
| **Before dedup (source findings)** | **259** | **12** | **88** | **128** | **31** |
| **After dedup (consolidated)** | **134** | **10** | **59** | **54** | **11** |

Consolidated findings per theme:

| Theme | Findings |
|---|---|
| Colour | 13 |
| Type | 6 |
| Spacing/layout | 14 |
| Components | 21 |
| Motion | 15 |
| Web layer | 16 |
| Accessibility | 20 |
| Copy | 7 |
| Identity | 3 |
| Platform (Android) | 7 |
| Data-at-scale/robustness | 12 |

F-IDN-01 rests on the narrative verdicts of 01 and 02 and has no numbered source id. Each of the 259 source ids sits in exactly one consolidated finding; the appendix lists them. The three unnumbered 01-audit-native items are:
- `01-N1`: the P2 "fixed-height text containers vs font scale".
- `01-N2`: the P2 "keyboard handling unproven".
- `01-N3`: the P3 "Dynamic Color not decided".

**IA note.** 01-002 and 02-002 asked for five phone tabs with Calendar, following an older PRODUCT.md. 07-031 showed that the owner reverted that (`context/stage-8/ledger.md:96,98`). PRODUCT.md › Operating Context now records the owner's last word: phone tabs Now · Day · Inbox · More, and "Week" in the sidebar. The 5-tab fix direction is void; the residue is in F-AND-03.

**Paths.**
- Code paths are relative to `apps/app/` unless they start with `packages/` or `scripts/`. `app/` holds the expo-router routes; `public/` is `apps/app/public/`.
- `BL/` = `context/design/baseline/` (committed).
- `SCR/` = `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/`: the reviewers' raw evidence. It is temporary and not committed.
- `R7/` = `SCR/review-07/shots/`, `R08/` = `SCR/review-08/`.

---

## Top 12 (what matters most for an Apple-grade result)

1. **F-A11Y-01**: there is no designed focus state. Text fields show nothing (WCAG 2.4.7). Everything else gets the browser's default ring, drawn around an invisible 44 px box.
2. **F-AND-01**: NativeWind compiles rem at 14 px, so every Android target is 12.5 % small (38.5 / 42 / 31.5 dp). The web screenshots therefore misrepresent the phone.
3. **F-LAY-02**: there is no page template. Five title placements exist, and the title jumps between sibling destinations (y 60 / 46 / 36 / 27).
4. **F-LAY-03**: desktop has three layout models. The content edge jumps from x 244 to 412, and the empty pane (656 px) is wider than the list.
5. **F-LAY-05**: there is no container or list system. Cards sit in cards, there is a hairline on everything, and rows come in 9 heights with 6 divider rules.
6. **F-TYP-01**: there is no role-based type scale: 16 sizes, 92 % of text at 11–15 px, leading set on 35 of 345 strings.
7. **F-COL-07**: the accents have no stable meaning. Lime appears 3–4 times per screen at 17:1, and indigo means five things.
8. **F-COL-08**: there is no layer model. In dark, page, card, sheet and dialog sit within 1.07–1.11:1 of each other. Light is grey-on-grey with recessed fields.
9. **F-CMP-01**: there is no press primitive. 21 of 63 pressables give no feedback, the rest swap opacity instantly, and Android has no ripple.
10. **F-CMP-02**: sheets draw a grab handle that does nothing (no drag, swipe or detents), and phone web gives no visible way out. With F-MOT-05, sheets also vanish in one frame.
11. **F-MOT-01**: check-off is the most frequent action and takes about 1 s. The check fills 187–238 ms late, then a 750 ms dust effect runs, then an empty slot, then the rows jump.
12. **F-LAY-01**: fixed bottom chrome has no height budget. The task list reaches 0 px at 320 px wide, at 200–400 % zoom, or with two proposals open.

---

## 1. Colour

**F-COL-01 · blocker — Text fields are identified only by a 1.1–1.35:1 edge**
- **What:**
  - The field border `line` measures 1.34:1 on bg and 1.35 on surface in light; 1.25 / 1.32 in dark.
  - Inside sheets, the field fill `bg` on `surface` is 1.17 (light) / 1.08 (dark).
  - The same `line` draws neutral chips and secondary-button borders.
  - The slider and progress `track` measures 1.31–1.40.
  - The lime primary fill on light grounds measures 1.12 on bg and 1.30 on surface, so the primary button has no edge (08 contrast table).
- **Where:** every TextField, TimeInput and time-bar field, plus chips, secondary buttons and sliders · phone + desktop · both themes · EN/RU.
  - Files: `src/ui/text-field.tsx:29-31`, `src/ui/time-input.tsx:32`, `src/shared/tracking/choices-sheet.tsx:107`.
  - Tokens `line`/`track`/`bg`/`surface` in `packages/core/src/design/tokens.json`.
- **Sources:** 08-005
- **Cite:** WCAG 2.2 SC 1.4.11 Non-text Contrast.
- **Shots:** `R08/env/overlay-desktop-dark-log-past.png`, `BL/states/day-log-past--desktop-light-en.png`
- **Fix:** a control-edge token (`field-border`) at ≥ 3:1 on both grounds in each theme; `line` stays decorative only.

**F-COL-02 · blocker (08 blocker; 07 minor) — Selected state has five looks, all colour-only, and the neutral one is 1.08–1.28:1**
- **What:**
  - The selected task row and the selected sidebar link use a `raised` fill alone: 1.10 (light) / 1.16 (dark) on bg, 1.28 / 1.08 on surface.
  - Selection is drawn five ways:
    - a category-hue fill (Category, Importance);
    - a grey fill with a 2 px fg border (Project, Deadline type, Repeat, Theme, Language, "All");
    - solid indigo (OS picker, the running time button);
    - grey with a border (theme radios);
    - a `raised` fill alone (the task row and sidebar link above).
  - Every unselected chip wears its own coloured 2 px outline, so the new-task form shows 12 coloured outlines at once.
  - All of it vanishes under forced colours (F-A11Y-04).
- **Where:** split-pane task list, sidebar, chips, segmented controls, OS picker · desktop + phone · both themes · EN/RU.
  - Files: `src/shared/task-row.tsx:71`, `src/ui/sidebar.tsx:116`, `src/ui/chip.tsx:15-28`, `src/shared/task-fields/*`, `src/features/devices/computer-steps.tsx`.
  - Inventory §8 ("Selected: 5 treatments").
- **Sources:** 08-006, 07-015
- **Cite:** WCAG 1.4.11; WCAG 1.4.1 Use of Color; docs/qa.md › Color, › State you can see; PRODUCT principle 3.
- **Shots:** `BL/states/now-task-pane--desktop-light-en.png`, `R7/s1-desktop-light-en-4form.png`, `R08/env/forced-desktop_.png`
- **Fix:** one selected treatment with a non-colour carrier at ≥ 3:1 (a leading bar, outline or check) plus the ARIA state. Unselected controls stay neutral, with identity colour only as a dot.

**F-COL-03 · blocker (08-007 blocker; 02-034, 08-025 minor) — `faint` used as text fails AA in light; three placeholder colours**
- **What:**
  - Light `faint #6f717a` on `bg #eceef2` measures 4.19:1 (APCA Lc 63.6).
  - It is used on actionable 13 px calendar days from the neighbouring month, and on the kit fields' placeholders.
  - Dark `faint` measures 4.82:1 but only Lc 33.
  - Placeholders use three colours: `faint` in 2 kit fields, `muted` in 8 feature inputs, and none set in 1.
- **Where:** date picker panel, TextField, TimeInput · both viewports · light fails WCAG, dark fails APCA.
  - Files: `src/ui/calendar.tsx:35`, `src/ui/text-field.tsx:34`, `src/ui/time-input.tsx:48` vs `src/features/now/composer/quick-line.tsx:184`.
  - Inventory §8.
- **Sources:** 08-007, 02-034, 08-025
- **Cite:** WCAG 1.4.3 Contrast (Minimum); HIG accessibility › Vision (4.5:1 up to 17 pt).
- **Shots:** `BL/states/day-pick-date--desktop-light-en.png`, `BL/states/task-close-as--desktop-dark-en.png`
- **Fix:** retire `faint` as a text colour; use one `placeholder` token; make the contrast test cover every text pair in use.

**F-COL-04 · major — The default importance "Normal" is a green tag on every row**
- **What:** every task row carries two washed tags. The second is almost always "Normal"/«Обычная» in green. So the tag that says nothing is the most repeated coloured element, and green reads as "done/good". Green also means Rest.
- **Where:** Now, project, History, picker, assistant preview, task detail · all 8 combos.
  - Files: `src/shared/meta-line.tsx:61-65`; `packages/core/src/design/tokens.ts:71-88` (`IMPORTANCE_COLORS`: normal→green).
- **Sources:** 01-004, 02-014
- **Cite:** impeccable operate.md › Product constraints ("heavy color on inactive states"); HIG color › Best practices ("Avoid using the same color to mean different things"); PRODUCT principle 2; Nielsen H8.
- **Shots:** `BL/routes/now--phone-light-en.png`, `BL/states/time-task-picker--phone-light-en.png`
- **Fix:** show importance only when it is not Normal, and never as a project-hue wash.

**F-COL-05 · major — The idle time bar is the most colourful thing on Now**
- **What:** the four resting buttons have 2 px outlines in four hues, one of them dashed, at 56 px. The running button is an indigo flood. The owner asked for "a quieter colour for quiet states" (feedback-4).
- **Where:** time bar on Now (desktop bottom edge, phone dock) · all combos.
  - Files: `src/shared/tracking/time-bar.tsx:131-146,160-167`, `src/ui/color.tsx:55-66`.
- **Sources:** 01-005
- **Cite:** operate.md › Color (accent for state indicators, not decoration); PRODUCT principle 1.
- **Shots:** `BL/routes/now--desktop-dark-en.png`, `BL/empty/now--phone-dark-en.png`
- **Fix:** tonal neutral resting tiles with the activity ink on the glyph only; colour is reserved for what is running.

**F-COL-06 · major — Category and project hues collide across meanings**
- **What:**
  - Twelve activity categories share ten hues:
    - Task and Hygiene are both teal;
    - Commute, Chores and Other are all slate;
    - Rest and Sport are both green;
    - Study and Sleep are both violet.
  - The time-bar outlines for Task (`#0d6b66`) and Rest (`#1b6e42`) are 1.01:1 apart in light.
  - Category "Работа" and project "Работа" are both violet.
  - "Домашка" and "Матанализ" are both yellow.
  - Personal (a category) and ASAP (an importance) are both coral.
- **Where:** Insights charts, Week blocks, tags, time bar, task form · all.
  - Files: `packages/core/src/tracking/categories.ts:10-23`.
- **Sources:** 01-007, 02-015
- **Cite:** HIG color › Best practices, › Inclusive color; WCAG 1.4.1; dataviz categorical rule.
- **Shots:** `BL/routes/insights--desktop-dark-en.png`, `BL/empty/now--phone-light-en.png`, `BL/states/task-edit-sheet--desktop-light-ru.png`
- **Fix:** split the palettes by job: projects own the hues, and categories are identified by icon and name. Add a check to the contrast test that sibling hues stay distinct.

**F-COL-07 · major (02-026 major; 02-025, 01-045 minor) — Accent colours have no stable meaning**
- **What:**
  - Lime is spent 3–4 times per screen: sidebar New task, Done, play, send ↑, Approve.
  - At 17:1 in dark, lime is always the brightest pixel, whatever the screen's job.
  - One assistant card holds two lime primaries: Approve and the send arrow.
  - Indigo means nine things at once: the running duration, the "Log" link, the current nav item, a switch that is on, the running button, the Insights hour bars, composer focus, the update banner and the avatar.
- **Where:** desktop sidebar and panes, assistant preview, Day, tab bar, switches · both themes.
  - Files: `src/ui/sidebar.tsx:180`, `src/shared/tracking/time-bar.tsx:103,133`, `src/features/now/composer/quick-line.tsx:105`, `src/shared/assistant/action-cards.tsx:118`, `src/ui/button.tsx:19`, `src/features/day/day-screen.tsx:109,178`, `src/ui/tab-bar.tsx:64`, `src/ui/switch-row.tsx:25`.
- **Sources:** 02-026, 02-025, 01-045
- **Cite:** HIG branding › Best practices ("apply your app's accent color judiciously"); HIG color › Best practices; operate.md › Color; owner feedback-4 (green on important actions, "но не везде").
- **Shots:** `BL/states/now-task-pane--desktop-light-en.png`, `BL/states/now-assistant-preview--desktop-dark-en.png`, `BL/routes/day--desktop-light-en.png`
- **Fix:** role tokens (action / live / selected / danger / data-*) and one accent fill per view.

**F-COL-08 · major (02-009 major; 02-033 minor) — No layer model: dark is one plane, light is grey-on-grey**
- **What:**
  - **Dark:**
    - `surface #141416` on `bg #0b0b0c` measures 1.07:1; `raised` on surface measures 1.08:1.
    - The sheet against the 55 % black scrim measures 1.11:1.
    - The Tailwind `shadow-lg` is invisible, so the Close-task dialog and the card behind it read as one plane, separated only by a hairline of 10 % white.
  - **Light:**
    - The page is `#eceef2`, cards are white (1.16:1), and the sidebar is page colour.
    - Fields are filled with page colour inside a white card, so they look recessed.
    - Every plane is bordered.
  - The whole app has only two shadows (inventory §2.5).
- **Where:** sheets, dialogs, toasts, cards, fields, sidebar · all viewports · dark and light.
  - Files: `src/ui/sheet.tsx:43,155-158`, `src/ui/toast.tsx:125`, `src/ui/text-field.tsx:29`, `src/ui/sidebar.tsx:162`.
- **Sources:** 02-009, 02-033
- **Cite:** HIG dark-mode › Mobile (base vs elevated background sets); HIG color › Mobile (system vs grouped background sets); Material 3 tonal elevation.
- **Shots:** `BL/states/task-close-as--desktop-dark-en.png`, `BL/states/now-check-toast--phone-dark-en.png`, `BL/routes/now--desktop-light-en.png`
- **Fix:** a defined stack of page → group → elevated → modal, with tonal steps of ≥ 1.2:1 in each theme, a lighter scrim in dark and a real shadow in light.

**F-COL-09 · major (02 major; 01 minor) — The off switch's knob is invisible**
- **What:**
  - When off, `thumbColor` is `palette.surface`.
  - In dark, the knob `#141416` sits on a `#141416` sheet (1.0:1) or on the page (1.07:1).
  - In light, the knob is white on a white card.
  - On and off differ mainly by track colour.
  - The web switch's 48×24 target is covered in F-A11Y-06.
- **Where:** every switch: 13 on Settings, 16 on a preset, "Alongside" in pickers · Android + web · worst in dark.
  - Files: `src/ui/switch-row.tsx:24-25`, `src/ui/switch-size.web.ts`.
- **Sources:** 02-031, 01-024
- **Cite:** HIG toggles › Best practices; WCAG 1.4.11; android.md › Color & theming (Material roles).
- **Shots:** `BL/routes/settings--phone-dark-ru.png`, `SCR/review-02/switch-dark-zoom.png`
- **Fix:** the Material 3 off style (outlined track, visible knob), with the knob at ≥ 3:1 in both states.

**F-COL-10 · major (08-018 major; 02-035 minor) — Project hues are one hex value for both themes**
- **What:**
  - As marks on white, every project hue is below 3:1:

    | Hue | Contrast | Hue | Contrast |
    |---|---|---|---|
    | amber | 1.68 | violet | 2.30 |
    | yellow | 1.58 | blue | 2.49 |
    | teal | 1.75 | slate | 2.51 |
    | green | 1.82 | orange | 2.59 |
    | pink | 2.16 | coral | 2.78 |

  - These hues draw the Insights bars, the running-row progress, project dots and selected chip fills. A selected yellow chip differs from an unselected one by a 1.58:1 fill.
  - In dark, the same full-saturation fills glow as Week blocks.
- **Where:** Insights, running row, project dots, chips, Week grid · light fails contrast, dark is over-saturated.
  - Files: `src/ui/color.tsx:12-23` (`PROJECT_FILL`), `tailwind.config.js:8-10` (literal hex), `src/features/insights/insights-screen.tsx:52`, `src/shared/tracking/running-row.tsx:59`, `src/ui/chip.tsx:20`, `src/features/week/week-grid.tsx:124-140,173-183`.
- **Sources:** 08-018, 02-035
- **Cite:** WCAG 1.4.11; HIG color › Best practices ("in dark environments colors appear bright and saturated"); HIG dark-mode › Dark Mode colors.
- **Shots:** `BL/routes/insights--desktop-light-en.png`, `BL/routes/week--desktop-dark-en.png`
- **Fix:** per-theme project values: marks at ≥ 3:1 in light, tinted fills with a full-hue edge in dark.

**F-COL-11 · major — Dark secondary text passes WCAG 2 but sits at APCA Lc 33–62**
- **What:**
  - Dark `muted #8a8a93` measures Lc 38–40, `faint #7d7d86` Lc 33 and `fg2 #b4b4bb` Lc 60–62.
  - The light equivalents measure Lc 66–95.
  - 12 px meta text needs ≥ Lc 75.
  - 60 of the 77 APCA-only failures are dark rows, including ink on wash at Lc 45–55.
- **Where:** meta lines, subtitles, hints, placeholders, the hour gutter · dark · both viewports.
  - Tokens `dark.muted/faint/fg2`.
  - Files: `src/shared/meta-line.tsx:68`, `src/ui/sheet.tsx:80`, `src/features/week/week-grid.tsx:68`.
- **Sources:** 08-017
- **Cite:** APCA 0.0.98G-4g / WCAG 3 draft (Lc 60 for content, 75 for body); HIG dark-mode ("ensure sufficient contrast").
- **Shots:** `BL/routes/now--desktop-dark-en.png`; 08 contrast table, rows muted / fg2 / faint (dark)
- **Fix:** rebuild the dark ramp to APCA targets, and assert APCA beside WCAG in `contrast.test.ts`.

**F-COL-12 · minor — The unavailable Calendar button looks disabled, yet opens a dialog with stale copy**
- **What:**
  - The button's dashed 13 %-black border, on white over `#eceef2`, nearly vanishes in light.
  - It can still be pressed. It opens long copy that points to "Settings → Devices", a screen gone since stage 8.
  - The web is offered "Calendar from the phone".
  - The desktop hover tooltip is short, as the owner asked.
- **Where:** time bar · desktop + phone · worst in light · EN/RU.
  - Files: `src/shared/tracking/time-bar.tsx:139-141`, `packages/core/src/i18n/en/time.ts:59`.
- **Sources:** 01-026, 07-019
- **Cite:** WCAG 1.4.11; HIG buttons (do not look disabled when enabled); owner feedback-4 («описание слишком подробное»); docs/qa.md › Copy.
- **Shots:** `BL/routes/now--desktop-light-ru.png`, `R7/s2-phone-light-en-9cal-click.png`, `R7/s2-desktop-light-en-9cal-click.png`
- **Fix:** a resting style that does not read as disabled, and short copy that names the real place — or nothing on the web.

**F-COL-13 · minor — Disabled comes in four opacities, and disabled lime reads as olive**
- **What:** disabled controls use 30, 40, 50 or 60 % opacity. The disabled lime play button, at 50 %, turns muddy olive in dark (it looks enabled) and pale chartreuse in light.
- **Where:** time-bar play, Submit, Button, IconButton, calendar · all.
  - Files: `src/shared/tracking/time-bar.tsx:100-105`, `src/ui/button.tsx:205`, `src/ui/icon-button.tsx:38`, `src/ui/calendar.tsx:68`.
  - Inventory §2.6.
- **Sources:** 01-025, 02-027
- **Cite:** operate.md › Color ("state-rich semantic vocabulary … standardize these"); HIG toggles › Best practices.
- **Shots:** `BL/empty/now--phone-dark-en.png`, `BL/routes/now--desktop-dark-ru.png`
- **Fix:** one disabled token (neutral fill, muted glyph) for every control.

### What this says about the system (colour)
- **Tokens are named by hue, not by job.** `accent`, `accentQuiet` and ten `project-*` hues go wherever "something should stand out". So meanings pile up: indigo has nine, lime is spent 3–4 times per screen, and green means Normal, Rest and done. Then they collide across categories, projects and importance. The spec needs role tokens and a rule for when colour is allowed: running, late, selected, and the one primary action.
- **Components always paint their colour.** Inactive defaults get colour because the component has no neutral state, not because someone chose it. That covers "Normal", the resting time-bar buttons, unselected chips and the Calendar outline.
- **The contrast guard only checks text.** `contrast.test.ts` checks text tokens on bg and surface, and marks at 3:1. It never asserts composited non-text pairs (`line`, `track`, `raised` used as selection, field fill on surface, the scrim), and never checks APCA. Every colour blocker lives in that blind spot.
- **There is no layer model per theme.** Depth is "one more hairline" instead of tonal steps. That produces both the flat dark theme and the grey-on-grey light theme.
- **Light and dark were not designed separately where it matters.** Project hues are the same literal hex in both themes. The dark ramp was tuned to the WCAG 2 formula, which flatters light text on dark.
- **State has no non-colour carrier.** Selected and disabled are fills and opacities. So they fail SC 1.4.11, vanish in forced colours, and come in five and four variants respectively.

---

## 2. Type

**F-TYP-01 · major (02 major; 01-043 nit) — No role-based type scale**
- **What:**
  - The app uses 16 font sizes, from 10 to 34 px.
  - 92 % of text sits at 11–15 px, so hierarchy rests on 1–2 px steps, and nothing sits between 15 and 20 px.
  - Line height is set on only 35 of 345 sized strings, using 8 values; the rem-based ones shrink on Android.
  - There are 6 page-title sizes, 9 button-label variants and 4 input sizes.
  - The detector flags 26, 24, 18, 17, 16 and 10 px as off the DESIGN.md ramp (11 sites).
- **Where:** app-wide · all combos · 343 raw `text-[Npx]` · inventory §3, §3.1, §3.2.
- **Sources:** 02-028, 01-043
- **Cite:** HIG typography › Conveying hierarchy, › text styles (Body 17/22, Headline 17/22 semibold, Footnote 13/18); operate.md › Typography; impeccable detector `design-system-font-size`.
- **Shots:** `BL/routes/now--phone-light-en.png`, `BL/states/now-task-pane--desktop-light-en.png`
- **Fix:** about seven roles with fixed leading in px/dp; every Text takes a role, with a lint against raw sizes.

**F-TYP-02 · major — Eyebrows over titles, and eight section-heading treatments**
- **What:**
  - An 11 px uppercase, tracked eyebrow sits above the Now, Day, Week and Insights titles.
  - The same eyebrow style also labels sections at 11 sites in Settings, Notifications, the preset screen, Inbox and login.
  - Section headings measure eight ways for one role: 13/600 fg2, 13/500, 17/600, 12/500 muted (twice), 14/500, 11/400 uppercase and 14/600 warn.
  - All of them are exposed as h1 (see F-A11Y-05).
- **Where:** all routes · all combos.
  - Files: `src/ui/screen-header.tsx:48-52`, `src/screens/settings-screen.tsx:40`, `src/features/notifications/notifications-screen.tsx:233`, `src/features/presets/preset-sections.tsx:31`, `src/screens/inbox-screen.tsx:30`, `src/screens/login-parts.tsx:46`, `src/features/now/now-task-groups.tsx:28`, `src/shared/activity-usage.tsx:113`, `src/features/insights/card.tsx:18`, `src/features/task/subtask-checklist.tsx:90`, `src/screens/history-screen.tsx:169`.
- **Sources:** 01-001, 07-009
- **Cite:** impeccable craft-floor.md › Refuse ("A kicker or eyebrow above a heading. This one is a ban"); detector `kicker-above-heading`; HIG typography (consistent hierarchy).
- **Shots:** `BL/routes/now--desktop-dark-en.png`, `BL/routes/settings--desktop-dark-en.png`, `R7/aria-desktop_settings.png`
- **Fix:** no eyebrows; the date becomes trailing secondary text on the title line; one sentence-case SectionHeader.

**F-TYP-03 · major — The running row's hierarchy is inverted**
- **What:** the most important live fact on Now is what is running and for how long. That fact is an 11 px washed ColorTag and a 13 px number, while the visual mass goes to two 44 px bordered buttons, "Yes, still" and "Stop".
- **Where:** time bar running row · all · both themes · EN/RU.
  - Files: `src/shared/tracking/running-row.tsx:22-26,66-78`.
- **Sources:** 02-018
- **Cite:** HIG typography › Conveying hierarchy; HIG design-principles › Purpose.
- **Shots:** `BL/routes/now--phone-dark-ru.png`, `BL/routes/now--desktop-light-en.png`
- **Fix:** the name as strong body text, elapsed time as the hero number in tabular figures, the expectation as a caption, Stop as the trailing control.

**F-TYP-04 · major (01 major; 05 minor) — Insights stat tiles break Russian mid-word and clip English**
- **What:** in tiles a third of the width at 390 px, "Переключени|й в день" breaks mid-word and the English "Typical focus block" is clipped at the bottom. The labels are 11 px, and the tiles are nested in cards.
- **Where:** Insights, "How broken up the time was" · phone 390 · both themes · RU/EN.
  - Files: `src/features/insights/patterns.tsx:83-92`.
- **Sources:** 01-008, 05-015
- **Cite:** craft-floor.md › Verify ("Run the real copy at every breakpoint"); detector `tiny-text`; break-ui "long word breaks mid-word".
- **Shots:** `BL/routes/insights--phone-light-ru.png`, `SCR/review-05/shots/deep/insights-phone-dark-s1.png`
- **Fix:** label/value rows, or 2-up tiles, on the phone; no 3-up grid under about 500 px.

**F-TYP-05 · minor (01, 02 minor; 08-028, 05-026 nit) — Functional text below 11 px; Week labels cut to one letter**
- **What:**
  - Avatar initials render at 9.12 px.
  - Week hour labels and block titles are 10 px on full-hue fills, and truncate to "Поше…", "М…", "По…".
  - Block labels stay on one line even on a 23 h 59 m block that is 1 500 px tall.
- **Where:** sidebar avatar (desktop), Week grid (phone + desktop) · both themes · worst in RU.
  - Files: `src/shared/user-avatar.tsx:32`, `src/features/week/week-grid.tsx:68,183`.
- **Sources:** 01-017, 01-018, 02-029, 08-028, 05-026
- **Cite:** HIG accessibility › Vision (11 pt minimum); HIG typography › Supporting Dynamic Type ("keep text truncation to a minimum"); detector `undersized-ui-text` ×18; APCA 12 px content floor.
- **Shots:** `BL/routes/week--desktop-light-en.png`, `BL/routes/week--phone-light-ru.png`, `SCR/review-01/web/en-dark-1440_.png`
- **Fix:** an 11–12 px floor; a block's label lines scale with its height, and tiny blocks show colour only.

**F-TYP-06 · minor — Tabular digits are a per-site class**
- **What:**
  - Stacked times use proportional digits:
    - the deadline meta "Срок 4 нояб. 18:23";
    - History rows "1 нояб., 18:23 · Веб", 20 of them;
    - subtask numbers "290/292/293";
    - the Insights focus line.
  - 34 files already use `tabular-nums`, and it is even applied to non-numeric eyebrows.
- **Where:** meta line, History rows, subtasks, Insights · all.
  - Files: `src/shared/meta-line.tsx`, `src/features/task/subtask-checklist.tsx`, `src/features/insights/insights-screen.tsx`, history row.
- **Sources:** 03-013
- **Cite:** Web Interface Guidelines › Typography (`tabular-nums` for comparisons).
- **Shots:** `SCR/review-03/audit.json` (`nums`)
- **Fix:** a "numeric" type role that always carries tabular figures.

### What this says about the system (type)
- **Type is chosen per string, not per role.** There are 343 raw sizes, and almost none set a leading. So each screen decides its own hierarchy, and it drifts: titles, sections, buttons and stats each have 2–9 variants.
- **Size and grey are the only hierarchy devices.** Sizes differ by 1–2 px and greys sit on a ramp. So the system reaches for eyebrows, borders, cards and colour to separate things; a role scale removes most of that scaffolding.
- **There are two unit systems.** Font sizes are in px, but leading and boxes are in rem. Text-to-box ratios therefore differ between Android (rem = 14) and the web (rem = 16); see F-AND-01.
- **Numeric text has no role.** Tabular figures, Russian number-and-unit spacing and locale formats are decided per site (F-TYP-06, F-CPY-04).
- **Real copy is not run at every width.** Russian runs 15–40 % longer and breaks fixed tiles and rows (F-TYP-04, F-LAY-08).

---

## 3. Spacing / layout

**F-LAY-01 · blocker (08-002 blocker; 07-003, 05-009 major; 01-046 minor) — Fixed bottom chrome has no height budget, and the task list can reach 0 px**
- **What:**
  - On the phone, the time bar takes about 170 of 844 px with two running rows, leaving 3.5 tasks visible.
  - With an assistant proposal and a composer proposal open, it grows to 577 px (y 200–777). The composer proposal is left in a 122 px window and the list disappears.
  - At 320×568 the list is about 60 px tall.
  - At 200 % zoom (720×450 CSS px) about 120 px of list remains.
  - At 400 % zoom (360×225) the time bar and tab bar together (260 px) are taller than the viewport, so the list, the composer and the second running row cannot be reached.
  - Focused rows sit under the footer.
- **Where:** Now and every screen with the time bar · phone at 390 and 320 px, desktop at 200 and 400 % zoom · both themes · worst in RU.
  - Files: `src/shared/tracking/time-bar.tsx:259-261`, `src/shared/tracking/time-bar-fold.tsx:17-40`, `src/ui/tab-bar.tsx:95`, `src/ui/screen.tsx:40`, `src/screens/now-screen.tsx:68-72`.
- **Sources:** 08-002, 07-003, 05-009, 01-046
- **Cite:** WCAG 1.4.10 Reflow, 1.4.4, 2.4.11 Focus Not Obscured; HIG layout ("prioritize the primary content"); critique.md › Cognitive load "Single focus"; docs/qa.md › Overlays in context.
- **Shots:** `R08/env/zoom-compare.png`, `R7/s4-phone-light-ru-composer-preview.png`, `SCR/review-05/shots/worst-ru/now--small-light.png`, `BL/states/now-composer-form--phone-light-ru.png`
- **Fix:** rank the regions (content > live status > navigation) and cap fixed chrome at a set share of the height. The time bar folds to one line while typing, when two or more activities run, or on short screens.

**F-LAY-02 · major — No page template: five title placements**
- **What:**
  - Desktop title baseline by screen:

    | Screens | Title baseline (y) | Treatment |
    |---|---|---|
    | Now, Day, Week, Insights | ≈ 60 | eyebrow + 30 px |
    | Inbox, Settings, Projects | ≈ 46 | 30 px |
    | pushed screens | ≈ 36 | 22 px |
    | History | ≈ 27 | — |

  - On the phone, the five rows of More open screens whose title tops sit at y 42 / 32 / 23 and whose back chevrons sit at y 34 / 24 / 14.
  - History and Notifications are sidebar destinations, but they are drawn as pushed screens.
  - The code has six page-title sizes: 20, 22, 24, 26, 30 and 34 px.
- **Where:** every top-level screen · desktop + phone · all combos.
  - Files: `src/ui/screen-header.tsx:32,48-58`, `src/ui/back-header.tsx:28,50-51`, `src/screens/history-screen.tsx:167`, `src/features/notifications/notifications-screen.tsx:201`, `src/screens/destination-screen.tsx:29`, `src/screens/pushed-screen.tsx:26`, `src/screens/inbox-screen.tsx:23`.
- **Sources:** 01-011, 02-003, 07-006
- **Cite:** HIG layout › Visual hierarchy, › Adaptability; ios.md › Layout & structure (large titles on top level, inline on detail); HIG navigation bars; Nielsen H4.
- **Shots:** `R7/phone-headers-strip.png`, `BL/routes/history--desktop-light-en.png` vs `BL/routes/settings--desktop-dark-en.png`
- **Fix:** exactly two templates with one top inset: a destination with a large title, and a pushed screen with an inline title and back. History and Notifications move to the destination template.

**F-LAY-03 · major — Desktop has three layout models, and the empty pane outgrows the list**
- **What:**
  - At 1440 px, Now's list is 535–560 px wide beside an empty 656 px pane ("Pick a task to see it here.").
  - Week mirrors that: the grid flexes and the detail pane is fixed at 400 px.
  - Day, Inbox, Projects, Insights, History, Settings and Notifications centre an 880 px column.
  - Between sibling screens the title's x jumps from 244 to 412, or to 448 on pushed screens.
  - The assistant preview and the composer are cramped beside the idle pane.
- **Where:** desktop shell, 1024–1440 px · all combos.
  - Files: `src/ui/screen.tsx:33`, `src/screens/now-screen.tsx:69` (`w-[560px] max-w-[50%]`), `src/ui/split-pane.tsx:20-22`.
- **Sources:** 01-010, 02-005, 07-007, 07-029
- **Cite:** HIG split-views › Desktop, › Best practices; operate.md › Layout ("responsive behavior is structural"); owner feedback-4 (Week like Now, list left and info right).
- **Shots:** `BL/routes/now--desktop-dark-en.png`, `BL/routes/day--desktop-dark-en.png`, `BL/routes/week--desktop-light-en.png`, `R7/aria-desktop_.png`
- **Fix:** one desktop frame: sidebar, content at a fixed start and measure, and an optional inspector that collapses while nothing is selected.

**F-LAY-04 · major — Nothing between the phone and 1024 px: tablets get a stretched phone, and Android is locked to portrait**
- **What:** there is a single breakpoint at 1024 px. At 768 px the four tabs spread across the width and rows run 700 px long. Android also sets `orientation: "portrait"`.
- **Where:** web at 600–1023 px; Android tablets and foldables.
  - Files: `src/ui/layout.ts:4`, `app.config.ts:68`.
- **Sources:** 01-038
- **Cite:** android.md › Layout & structure ("never ship a phone bottom-bar untouched on a tablet"); audit.native.md › Adaptivity; audit.md › Responsive.
- **Shots:** `SCR/review-01/web/en-dark-768_.png`
- **Fix:** a medium breakpoint at about 600 px with a navigation rail and a list/detail layout; lift the orientation lock.

**F-LAY-05 · major — No container or list system: cards in cards, a hairline on everything, divider rules per screen**
- **What:**
  - Cards are nested in cards: the Insights tiles, composer › preview › field, the dev card inside the login card, and the preset sections.
  - Every container has a 1 px `line` border.
  - Rows come in 9 heights and 6 divider rules:

    | Where | Row height | Container / divider rule |
    |---|---|---|
    | Now | 66 px | in a card, no dividers |
    | Day | 57 px | top border, inset |
    | History | 69 px | — |
    | Notifications | 62 px | divider bleeds from x 392 to 1272 |
    | Settings (estimates) | 41 px | section dividers bleed 20 px past the column |
    | More | 56 px | full-bleed |
    | Projects | — | tinted cards with 8 px gaps |
    | Pickers | — | bordered cards, radius 12 |
    | Subtasks | — | dividers 4 px outside the content |

  - The owner's «где-то есть черточки, где-то нет» was fixed only in Day.
- **Where:** every list and container · all combos.
  - Files: `src/features/now/now-task-groups.tsx:26-27`, `src/features/insights/card.tsx:15`, `patterns.tsx:87`, `src/screens/login-parts.tsx:45`, `src/features/presets/preset-form.tsx:43,119`, `src/shared/assistant/action-cards.tsx:26,78`, `src/screens/settings-screen.tsx:37`, `src/features/notifications/notifications-screen.tsx:150`, `src/screens/projects-screen.tsx:68-85`.
  - Inventory §6.
- **Sources:** 01-012, 07-010, 02-023
- **Cite:** craft-floor.md › Refuse ("nested cards are always wrong"); HIG layout › Visual hierarchy; HIG lists-and-tables › Style; owner feedback-4.
- **Shots:** `BL/routes/insights--desktop-dark-en.png`, `R7/aria-desktop_day.png`, `R7/aria-desktop_projects.png`
- **Fix:** one surface level; two list styles (plain with inset separators, and inset grouped) and a fixed set of row heights.

**F-LAY-06 · major (02 major; the others minor) — The sidebar header is overloaded, and the owner's name shows as "D…"**
- **What:**
  - In 200 px the header holds the mark, a 16 px wordmark, a 24 px avatar, the name and the bell.
  - That leaves 22–40 px for the name, which shows as "D…", or "А…" for a 64-character name; "Albert" would also truncate.
  - An indigo avatar sits beside the green mark, so the header carries two accents.
  - The owner asked for his Telegram name exactly there (feedback-4).
- **Where:** sidebar · desktop 1024–1440 px · both themes · EN/RU.
  - Files: `src/ui/sidebar.tsx:165-175`.
- **Sources:** 02-004, 01-016, 05-017, 07-020
- **Cite:** HIG branding › Best practices ("ensure branding always defers to content"); HIG typography › Supporting Dynamic Type (minimal truncation); owner feedback-4.
- **Shots:** `BL/routes/now--desktop-dark-ru.png`, `R7/logo-zoom.png`, `SCR/review-05/shots/worst-ru/now--desktop-light.png`
- **Fix:** put the account (avatar and full name) on its own row, at the sidebar foot or as a second row; show the mark without the wordmark; never truncate a short name.

**F-LAY-07 · minor — One task row, three containers and gutters**
- **What:**
  - The same TaskRow sits in a grouped card on Now (title at x 291 desktop / 67 phone, check circle at x 22).
  - On the project page and in History it sits bare on the background (title x 446 / 54, check x 9).
  - The picker draws it as a separately bordered card.
  - Each activity picker draws its 10 choices as 48 px bordered cards with 8 px gaps: 20 hairlines for one list.
  - The project page has no "Open" header.
- **Where:** Now, project page, History, Task / Chores / Rest pickers · all.
  - Files: `src/features/now/now-task-groups.tsx:26`, `src/shared/tracking/choice-row.tsx:45`, `src/screens/project-screen.tsx`, `src/screens/history-screen.tsx`.
- **Sources:** 01-027, 02-012, 07-011
- **Cite:** operate.md › Components (consistent affordances); HIG lists-and-tables › Style; owner feedback-2 T7.
- **Shots:** `BL/states/time-task-picker--phone-light-en.png`, `BL/states/time-chores-picker--phone-dark-en.png`, `R7/aria-desktop_project_01M5YZBMFV2YTDVD6EH8TEGPWZ.png`
- **Fix:** one task-list component (group header plus rows) and one option-list row.

**F-LAY-08 · minor — Rows wrap unpredictably, and Russian breaks the rhythm**
- **What:**
  - Now's rows are 66 or 86 px tall, depending on whether "Due …" wraps.
  - In Russian, «решено» ends up alone on its own line.
  - The running row's «2 ч 17 м» / «из ~20 м» wraps onto its own line.
  - Day puts the tag above the label only on long rows, and cuts the label at about 13 characters on the phone (in both languages).
  - Week headers show «р, 28».
- **Where:** Now, running row, Day, Week · phone · worst in RU.
  - Files: `src/shared/meta-line.tsx`, `src/shared/tracking/running-row.tsx`, `src/features/day/day-screen.tsx:94-101`.
- **Sources:** 02-047, 01-029, 07-012, 07-034, 05-019
- **Cite:** HIG layout › Adaptability (text length), › Visual hierarchy; craft-floor.md › Verify "Type"; the brief (Russian runs 15–40 % longer).
- **Shots:** `BL/routes/now--phone-dark-ru.png`, `BL/routes/day--phone-light-ru.png`, `SCR/review-05/shots/worst-ru/day--phone-light.png`
- **Fix:** a fixed two-line row: a title line, then a meta line with non-breaking joins and truncation at the end. The tag goes in a fixed column or becomes a meta token.

**F-LAY-09 · minor (02-032 nit) — Settings is one 20-section page of mismatched controls**
- **What:**
  - More than 20 sections on one page, with uppercase labels and full-bleed lines.
  - Text fields 788–790 px wide hold "09:00"; the Decisions search is full-width too.
  - Notification channels are a 4×3 grid of 12 switches.
  - Add a computer, Connect AI, Export and Log out are ragged stacks of 48 px boxed buttons in different widths, and Revoke is a boxed button on its row.
  - The app theme switch is the very first row.
- **Where:** Settings (and the Decisions search) · worst on desktop, also phone · both themes.
  - Files: `src/screens/settings-screen.tsx:28,37-40,78`, `src/features/settings/notification-settings.tsx:54,180,218`.
- **Sources:** 01-023, 02-036, 02-037, 02-040, 02-032
- **Cite:** HIG lists-and-tables › Best practices; HIG toggles › Mobile / › Desktop; HIG text-fields › Best practices (size to content); HIG dark-mode › Best practices (app appearance setting); ios.md (grouped lists for settings).
- **Shots:** `BL/routes/settings--desktop-light-en.png`, `BL/scroll/settings-2--desktop-light-en.png`
- **Fix:** a grouped inset list with compact trailing values and action rows, a checkbox matrix on desktop, and Appearance moved lower down.

**F-LAY-10 · minor (07-030 nit) — Four page gutters, and edges a few px apart**
- **What:**
  - Left edges on Now (desktop / phone):

    | Element | Desktop x | Phone x |
    |---|---|---|
    | Text | 244 | 20 |
    | Cards | 240 | 16 |
    | List card | 236 | 12 |
    | Group header | 249 | 25 |
    | Rows | 291 | 67 |

  - On the task screen, the disclosure and subtasks start at 408 / 16 while the content starts at 412 / 20.
  - The inventory counts 4 gutters (20 / 16 / 12 / 8 px), 5 card paddings, and 108 half-steps off the 4 px grid.
- **Where:** Now, task screen · desktop + phone.
  - Files: `src/features/now/now-task-groups.tsx:26`, `src/shared/task-list.tsx:67,132`, `src/features/now/composer/composer.tsx:102`.
  - Inventory §4.1.
- **Sources:** 07-008, 07-030
- **Cite:** HIG layout (alignment); impeccable spacing ("one gutter").
- **Shots:** `R7/aria-desktop_.png`, `BL/routes/task-open--phone-light-ru.png`
- **Fix:** one gutter token and one inner inset, on a 4/8 grid in px/dp.

**F-LAY-11 · minor (two nits) — The phone Week day strip doesn't snap: the first day is clipped and the hint is far away**
- **What:**
  - Columns stop mid-day, so "3 Wed" and «р, 28» are cut, and the screen opens scrolled into the middle of a column.
  - Measured: scrollWidth 504, clientWidth 334, `scroll-snap-type: none`, and no edge fade.
  - The only cue is a text line at the foot of the screen ("Swipe to see all days").
  - `overscroll-behavior-x: auto` hands a fling past the end to the browser or OS.
- **Where:** Week · phone · both themes · RU/EN.
  - Files: `src/features/week/sideways-days.tsx:52-62`, `src/features/week/week-screen.tsx:116`, the header row in `src/features/week/week-grid.tsx`.
- **Sources:** 01-019, 06-009, 05-027, 07-032
- **Cite:** mobile-native §9 (`scroll-snap-type`); HIG scroll views ("indicate there is more content").
- **Shots:** `BL/routes/week--phone-dark-en.png`, `SCR/review-06/week--phone-light-ru.png`
- **Fix:** snap to whole days (native `snapToInterval`, web scroll-snap), an edge fade instead of the text hint, and contained overscroll.

**F-LAY-12 · minor — On desktop the running activity shows only on Now, at the window's bottom edge**
- **What:** only Now renders the time bar (`footer={<TimeBar />}`). Day lists the running activity; Week and Insights show nothing running.
- **Where:** desktop · both themes.
  - Files: `src/features/now/now-screen.tsx:40`.
- **Sources:** 02-006
- **Cite:** HIG feedback › Best practices; HIG layout › Desktop ("avoid placing critical information at the bottom of a window").
- **Shots:** `BL/routes/day--desktop-light-en.png`, `BL/routes/insights--desktop-dark-en.png`
- **Fix:** a one-line running indicator in the shell on every desktop screen; the bar stays fixed on Now.

**F-LAY-13 · minor — No scroll edges**
- **What:** content runs under sticky titles (Settings pills are cut under "Settings"), and the time bar slices through Now's last row.
- **Where:** Settings, Now · all · both themes.
- **Sources:** 02-044
- **Cite:** HIG layout › Visual hierarchy (scroll edge effect).
- **Shots:** `BL/scroll/settings-2--desktop-light-en.png`, `BL/routes/now--phone-dark-ru.png`
- **Fix:** give the header a fill and a hairline once content scrolls under it, and a fade above fixed bottom chrome.

**F-LAY-14 · minor — Insights bars: a misaligned value column, and names cut**
- **What:** the value column has no width, so each bar ends at a different x ("27 ч 21 м" vs "1 м"). Project names are cut at `w-24` with no tooltip.
- **Where:** Insights · phone + desktop · both themes · RU/EN.
  - Files: `src/features/insights/insights-screen.tsx:47,56`.
- **Sources:** 05-014
- **Cite:** break-ui "misaligned columns"; HIG charts (align for comparison).
- **Shots:** `SCR/review-05/shots/worst-ru/insights--phone-light.png`
- **Fix:** a fixed, right-aligned, tabular value column, and a name column sized as a fraction of the width.

### What this says about the system (layout)
- **Layout is decided per screen.** Header, frame, gutter and list are chosen by each screen. So desktop has three models, the tablet has none, and the title jumps between siblings. A shell with named regions (navigation · content · inspector) and two breakpoints lets every screen inherit the right one.
- **Desktop is the phone layout, centred.** The 880 px column, the half-empty split pane and the 1024 px-only switch all come from one assumption: the phone column is the page.
- **No region budget.** Fixed chrome (time bar, tab bar, header) has no maximum share of the height, so the content it serves is the first thing to disappear: at small sizes, at zoom, with the keyboard up, or with proposals open.
- **"Boundary by container" is the house style.** Cards, hairlines and nested panels stand in for one surface level with grouped lists, and dividers follow no rule. The owner's divider complaint was fixed locally, in Day, so the class survived everywhere else.
- **Spacing has no grid in the unit that ships.** The spacing comes in 101 distinct values, 108 half-steps and 4 gutters. Rem compiles to 14 px on Android, so even "the same" spacing differs per platform.
- **Rows are flex-wrap rows, not structured rows.** Meta lines, tags and labels wrap wherever they fit, so row height depends on data and language.

---

## 4. Components

**F-CMP-01 · major — No press primitive: instant opacity swaps, 21 of 63 pressables with no feedback, no ripple**
- **What:**
  - 43 hand-written `active:opacity-70/75/80` swaps, each instant, with no transition and no scale.
  - 21 of 63 pressables have no pressed state at all:
    - every tab;
    - the check circle;
    - the assistant's approve, cancel and ↵ buttons;
    - the task description's Cancel, Save and edit;
    - the activity-usage "show more";
    - the backdrop and the colour swatches.
  - There are 0 `android_ripple` uses.
  - React Native Web removes the browser's tap highlight, which leaves those 21 with no feedback at all.
  - On the check circle, nothing visible happens for about 200 ms (F-MOT-01).
- **Where:** app-wide · Android + web · both themes.
  - Files: `src/ui/button.tsx:203`, `src/ui/icon-button.tsx:35`, `src/ui/chip.tsx:59`, `src/ui/tab-bar.tsx:55`, `src/ui/check-circle.tsx:23`, `src/ui/sheet.tsx:40`, `src/features/now/now-task-groups.tsx:32`, `src/shared/assistant/action-cards.tsx`.
  - Inventory §7.3, §8.
- **Sources:** 01-036, 02-021, 04-020, 06-005
- **Cite:** HIG buttons › Best practices ("always include a press state for a custom button"); android.md › The Android slop test; Material › States › Pressed (ripple); review-animations STANDARDS › Physicality (scale 0.97, 160 ms ease-out); mobile-native §2, §5; PRODUCT.md › Platform.
- **Shots:** `SCR/review-06/route_--phone-light-ru.png`, `SCR/review-04/checkoff-timeline.json`
- **Fix:** one kit Touchable used by every pressable: ripple on Android, a hover-gated tint or scale on the web. Lint against a bare Pressable outside `src/ui`.

**F-CMP-02 · major (02, 06 major; 01 minor) — Sheets: a grab handle that does nothing, no swipe, no detents, no visible way out on phone web**
- **What:**
  - The 36×4 grab handle is a plain View with no pan gesture on either platform. A CDP touch swipe of 400 px from the handle left the sheet open.
  - A 10-row picker opens at 90 % height with no medium detent.
  - The close cross shows only on wide screens (`isWide`). So on phone web, the only way out of a 90 % edit sheet is an ~80 px dim strip: no Escape, no system Back in a browser.
  - In a Chrome tab, the pull the handle invites triggers pull-to-refresh (F-WEB-06).
- **Where:** every sheet · phone (Android + phone web) · both themes · EN/RU.
  - Files: `src/ui/sheet.tsx:21,49-58,83-87,134,145-162`.
- **Sources:** 02-007, 02-010, 06-003, 01-035
- **Cite:** HIG sheets › Mobile ("include a grabber in a resizable sheet", "support swiping to dismiss", medium detent); HIG modality › Best practices; HIG accessibility › Mobility; Material 3 › Bottom sheets (drag handle); bug-lessons class 10.
- **Shots:** `SCR/review-06/sheet-after-swipe--phone-light-ru.png`, `BL/states/time-chores-picker--phone-dark-en.png`, `BL/states/task-edit-sheet--phone-light-ru.png`
- **Fix:** a gesture-driven sheet (pan with velocity, detents, a guard for dirty forms) on both platforms, or no handle at all; a visible close on phone web.

**F-CMP-03 · major — An empty new-task form opens already showing an error**
- **What:**
  - Opening the form by hand (composer +, sidebar New task, or N) shows the title field red with «Дайте задаче название.» / "Give the task a title." on the first frame.
  - The error is computed from `values.title.trim() === ""` with no touched or submitted flag.
  - The same component runs the edit sheet.
- **Where:** New task form, edit sheet · phone + desktop · both themes · RU/EN.
  - Files: `src/shared/task-fields/task-fields.tsx:206`.
- **Sources:** 07-001
- **Cite:** docs/qa.md › "Forms keep their promise"; HIG entering data (validate after people finish); Nielsen H5.
- **Shots:** `R7/s4-phone-unfold-strip.png`, `R7/s4-desktop-unfold-400.png`
- **Fix:** show field errors only after a submit attempt or a blur, gated once in the kit.

**F-CMP-04 · major (02 major; 01 minor) — Stop is an outlined square, so it reads as an unchecked checkbox**
- **What:** Stop uses lucide's 14 px outline `Square`, directly under a list of round check boxes, so it reads "☐ Stop". The choices sheet does the same.
- **Where:** running row, choices sheet · all · both themes.
  - Files: `src/shared/tracking/running-row.tsx:99`, `src/shared/tracking/choices-sheet.tsx:137`.
- **Sources:** 02-016, 01-013
- **Cite:** HIG buttons › Content ("associate familiar actions with familiar icons"); Material's `stop` icon is filled; craft-floor.md › Refuse (icon system); Nielsen H2.
- **Shots:** `BL/routes/now--desktop-light-ru.png`, `BL/routes/now--desktop-light-en.png`
- **Fix:** a filled stop glyph, or text only.

**F-CMP-05 · major (01 major; 02, 07 minor) — Period navigation: back "‹" beside previous "‹", and "Back to today" in three forms**
- **What:**
  - On Insights, Week and History, the back chevron and the previous-period chevron are the same glyph, size and colour, 40 px apart.
  - History adds a grey "Now" button that is always present and disabled at the present — the owner's «громоздкая кнопка».
  - Day and Week show a quiet "Back to today" link only when away from today. Insights has none.
  - On the phone, that link wraps the controls onto a second row and pushes Week's grid down 48 px.
  - Day's and Insights' "›" stays on screen, greyed, at today.
- **Where:** Insights, Week, History, Day · every phone combo, plus History on desktop.
  - Files: `src/features/insights/insights-screen.tsx:83`, `src/features/week/week-screen.tsx:83,147-148`, `src/shared/week-arrows.tsx:20,29`, `src/ui/screen-header.tsx:37-46`, `src/shared/back-to-today.tsx:6-28`, `src/screens/history-screen.tsx:102-135`.
- **Sources:** 01-003, 02-045, 07-017
- **Cite:** ios.md › Layout & structure ("no mixed metaphors"); android.md › Layout (top app bar); Nielsen H3/H4; owner feedback-4; PRODUCT principle 2.
- **Shots:** `BL/routes/insights--phone-light-ru.png`, `BL/routes/history--phone-dark-en.png`, `R7/s3-phone-light-en-week-prev.png`
- **Fix:** one period stepper ("‹ range ›") kept separate from back, and one BackToToday on every period screen, shown only away from today and without reflow.

**F-CMP-06 · major (07 major; 01 minor) — Buttons: five geometries, and widths decided per screen**
- **What:**
  - Outlined secondary buttons come in five geometries:

    | Geometry | Used by |
    |---|---|
    | 48 px, radius 10 | kit `Button` |
    | 44 px, radius 12 | Stop, Yes still, fold toggle, New project |
    | 56 px, radius 14, 2 px border | time bar |
    | 36 px round | composer |
    | 40 px, radius 12 | sidebar New task |

  - On desktop, Projects' "New project" is 848 px wide while Settings buttons are content-width, as the owner asked.
  - On the phone, Settings buttons are full-width except Wipe (106 px) and Delete (140 px).
  - Revoke is 86 px and Disconnect 113 px, in adjacent rows.
  - The bell is the only bordered icon button; the other 19 are plain.
  - 5 hand-rolled lime buttons and 5 hand-rolled outlined buttons bypass the kit's Button.
- **Where:** desktop + phone.
  - Files: `src/ui/button.tsx`, `src/shared/tracking/running-row.tsx`, `src/shared/tracking/time-bar-fold.tsx:61`, `src/screens/projects-screen.tsx:25`, `src/shared/notifications/notification-bell.tsx:34-35`.
  - Inventory §8.
- **Sources:** 07-013, 01-044
- **Cite:** HIG buttons (consistent sizes per role); owner feedback-4 («На пк чето кнопки слишком широкие»); Nielsen H4.
- **Shots:** `R7/aria-desktop_projects.png`, `R7/s3-phone-light-en-wipe.png`, `BL/routes/now--phone-light-en.png`
- **Fix:** kit sizes (small / regular / large) on one radius scale; width as a layout rule, never per screen; the bell plain like the others.

**F-CMP-07 · major (07 major; 02 minor) — Destructive actions are the quietest controls in Settings**
- **What:** under a red "Danger zone" heading:
  - Wipe data is a neutral outlined button, identical to Log out.
  - Delete account is a borderless fg2 ghost that reads as disabled.
  - The kit's `danger` variant is never used at rest.
- **Where:** Settings › Danger zone · all combos.
  - Files: `src/features/settings/delete-account.tsx:156-179` (`secondary` at :163, `ghost` at :176), `src/ui/button.tsx:63`.
- **Sources:** 07-014, 02-038
- **Cite:** HIG buttons › Role (destructive buttons use system red); HIG action-sheets; Material › Buttons (emphasis); docs/qa.md › Color.
- **Shots:** `BL/scroll/settings-3--desktop-dark-en.png`, `BL/states/settings-add-computer--desktop-light-en.png`
- **Fix:** both actions in the destructive style, same size and same width; keep the inline Telegram confirmation.

**F-CMP-08 · major (01 major; 02 minor) — The task form is a wall of about 23–25 coloured chips**
- **What:**
  - Six groups of chips sit on one screen:
    - Category: 5 hues;
    - Importance: 4;
    - Project: 3;
    - Deadline type: 2;
    - Repeat: 6, wrapping onto two rows.
  - Each chip has a coloured 2 px outline, and the groups use two selection styles.
  - On desktop, the description field is cut off by the footer.
- **Where:** edit task sheet, composer form, New task pane · all combos, worst on phone in RU.
  - Files: `src/features/task/task-sheets.tsx`, `src/shared/task-fields/*`, `src/ui/chip.tsx:15-28`.
- **Sources:** 01-006, 02-013
- **Cite:** critique.md › Cognitive Load ("Minimal choices", "The Wall of Options"); HIG toggles › Desktop › Radio buttons (more than five → a pop-up button); HIG color › Best practices.
- **Shots:** `BL/states/task-edit-sheet--desktop-light-ru.png`, `BL/states/now-composer-form--phone-light-ru.png`
- **Fix:** rows that show the value and open a picker or menu for long sets; chips or segments only for four options or fewer; neutral outlines.

**F-CMP-09 · minor — Empty states teach nothing and are aligned three ways**
- **What:**
  - Each empty state is one muted line — "Nothing to do right now.", "Nothing to sort.", "Nothing in the log yet." — with no next action, except on Projects.
  - They are centred on Now, Inbox and Projects, and left-aligned on Day, Insights and Assistant log.
  - Inbox puts its line under a permanent 12 px, two-line paragraph explaining the mechanics ("Accept takes a note as a task with the guess under it…").
  - A fresh account shows one sentence each on Now, Insights and Inbox.
- **Where:** Now, Inbox, Day, Insights, Decisions, Projects · all combos.
  - Files: `src/ui/empty-state.tsx:13-15`, `src/features/now/now-screen.tsx:46`, `src/screens/decisions-screen.tsx:137-140`, `src/screens/inbox-screen.tsx:24`.
- **Sources:** 01-014, 01-015, 02-041, 05-023, 07-023
- **Cite:** operate.md › Components ("empty states that teach the interface"); HIG writing › Best practices ("provide clear next steps on any blank screens"); Nielsen H10.
- **Shots:** `BL/empty/now--phone-dark-en.png`, `BL/routes/inbox--desktop-dark-ru.png`, `BL/routes/decisions--desktop-dark-en.png`
- **Fix:** one EmptyState (what lands here, plus one action) aligned to the column; Inbox's explanation moves into it.

**F-CMP-10 · minor — Task actions are bare glyphs, and one glyph carries three meanings**
- **What:**
  - The task header shows four unlabelled icons: Edit, Pause, Give up (⊘, Ban) and Delete, plus a second pencil on the description.
  - The same glyph family means three different things:
    - ▶ starts a typed activity in the time bar;
    - ⏸ / ▶ pause and resume a task;
    - ▷ marks the start date.
  - The task pane's ⏸ sits next to the time bar's ▶ / ■.
  - A Pause (status `paused`) is still there after "Remove Waiting".
- **Where:** task header and task fields · all combos.
  - Files: `src/features/task/task-header.tsx:66-80`, `src/shared/tracking/time-bar.tsx:109`.
- **Sources:** 01-028, 02-042, 02-017
- **Cite:** Nielsen H6 (labels on icons); HIG buttons › Content ("consider using text"); bug-lessons class 45, applied to glyphs.
- **Shots:** `BL/routes/task-open--phone-dark-en.png`, `BL/states/now-task-pane--desktop-light-en.png`
- **Fix:** Edit as text; Pause, Give up and Delete in a labelled overflow menu; ▶ / ■ reserved for timing activities.

**F-CMP-11 · minor — The primary form action and its shortcut move from form to form**
- **What:**

  | Form | Primary action | Placement | Shortcut |
  |---|---|---|---|
  | New task | Create | top right | Enter |
  | Edit task (same fields) | Save | full-width footer | Ctrl+Enter |
  | Close task | footer action | footer | Ctrl+Enter |
  | Task pane | Done | bottom bar | — |
  | Proposal | Approve | inline | Enter |
  | Dialogs | — | full width at the bottom | — |
- **Where:** New task pane, edit sheet, close sheet, assistant proposal · desktop + phone.
  - Files: `src/features/now/composer/composer-form.tsx`, the task sheets.
- **Sources:** 02-043, 07-016
- **Cite:** HIG sheets › Mobile (Done on the trailing edge); HIG layout › Desktop; docs/qa.md › One way per job.
- **Shots:** `BL/states/now-composer-form--desktop-dark-ru.png`, `BL/states/task-edit-sheet--desktop-dark-ru.png`
- **Fix:** one placement rule per form factor and one commit shortcut.

**F-CMP-12 · minor (07-027 nit) — Transient feedback has no placement rule**
- **What:**
  - **Desktop toast:**
    - It is docked bottom-left in the 200 px sidebar (x 12), while the action happened at x ≈ 500 or about 1 000 px away.
    - Its 3-line clamp shows half of a fourth line through `py-2.5`.
  - **Phone toast:**
    - Offsets are hard-coded: `BASE_BOTTOM = 96` and `TAB_BAR_HEIGHT = 72`.
    - The real tab bar measures 67 px, and about 107 px with a 48 dp 3-button navigation inset, so the toast overlaps it by about 11 px.
  - To Inbox gives no toast; the only sign is a badge 500 px away. On touch it pops the "To Inbox" tooltip.
  - Tooltips cover the "Now" title and the time field's placeholder.
- **Where:** toasts and tooltips · desktop + phone.
  - Files: `src/ui/toast.tsx:91-107,133`, `src/ui/tab-bar.tsx:97`.
- **Sources:** 01-020, 06-008, 07-026, 07-027
- **Cite:** bug-lessons class 6; HIG feedback; docs/qa.md › Overlays in context; mobile-native §7.
- **Shots:** `BL/states/now-check-dissolve--desktop-dark-en.png`, `BL/states/toast-to-inbox--phone-light-ru.png`, `R7/s1-desktop-light-en-4form.png`
- **Fix:** feedback appears next to its source and never covers the next action; offsets are measured from the real chrome.

**F-CMP-13 · minor — Desktop pickers open as centred dialogs, far from their button**
- **What:** tapping Chores at the bottom-left opens a 560 px modal in the middle of the window.
- **Where:** Chores / Rest / Task / Calendar pickers, project picker · desktop.
  - Files: `src/shared/tracking/choices-sheet.tsx`.
- **Sources:** 02-011
- **Cite:** HIG pickers › Best practices (show in context, in a popover).
- **Shots:** `BL/states/time-chores-picker--desktop-light-en.png`
- **Fix:** an anchored popover or menu on wide windows; a sheet on the phone.

**F-CMP-14 · minor — History has an Undo button on every row, and snapshot rows look checkable**
- **What:** each screen shows 8 or more identical "Undo" text buttons. The "tasks as they were at 18:20" rows carry check circles that look live.
- **Where:** History · all.
  - Files: `src/screens/history-screen.tsx:64-87`.
- **Sources:** 01-022
- **Cite:** Nielsen H8, H2.
- **Shots:** `BL/routes/history--desktop-light-ru.png`
- **Fix:** undo from a selection or context menu; read-only snapshot rows.

**F-CMP-15 · minor — Inbox items: a lime bar per item, and Delete as heavy as Accept**
- **What:** each item has two full-width buttons split 50/50, so N items make N lime "Accept" bars.
- **Where:** Inbox · desktop + phone.
  - Files: `src/screens/inbox-card.tsx`.
- **Sources:** 07-024
- **Cite:** docs/qa.md › Color ("one calm accent"); HIG buttons (hierarchy).
- **Shots:** `R7/s3-desktop-light-en-inbox-item.png`
- **Fix:** a row with a compact trailing Accept, and Delete in an overflow menu or a swipe.

**F-CMP-16 · minor — Projects are hue slabs with a hero-metric strip**
- **What:**
  - The Projects list is a stack of full-width washed slabs.
  - The project page opens with an "Open / On time / Late" strip.
  - Four-line names keep the fixed padding and touch the rounded edge, so rows jump from 56 to 112 px.
- **Where:** Projects, project page · all.
  - Files: `src/screens/projects-screen.tsx:71-85`, `src/screens/project-screen.tsx:84-85`.
- **Sources:** 01-021, 05-024
- **Cite:** craft-floor.md › Refuse ("the hero-metric template"); operate.md › Color.
- **Shots:** `BL/routes/projects--desktop-dark-en.png`, `BL/routes/project--desktop-light-en.png`, `SCR/review-05/shots/worst-ru/projects--phone-light.png`
- **Fix:** list rows with a colour dot, clamped to 2 lines; stats as a quiet meta line.

**F-CMP-17 · minor — Login: a failed Telegram widget shows raw serif text or a blank band**
- **What:**
  - When the iframe fails, light shows "Bot domain invalid" in the browser's serif, and dark shows an empty band of about 80 px between the tagline and "Log in with the bot instead".
  - The failure is environmental on localhost, but the failure path ships.
  - The dev card is nested inside the card.
- **Where:** Login · signed out, desktop + phone.
  - Files: `src/auth/telegram-widget.web.tsx`.
- **Sources:** 01-030, 02-046
- **Cite:** HIG loading › Best practices; craft-floor.md › Verify "Browser surfaces"; Nielsen H9.
- **Shots:** `BL/signed-out/login--desktop-light-ru.png`, `BL/signed-out/login--phone-dark-en.png`
- **Fix:** reserve the button's box with a skeleton, detect the failure, show a themed message, and promote the bot login after a timeout.

**F-CMP-18 · minor — Two "New task" entry points on desktop Now**
- **What:** the sidebar's lime "New task N" and the composer's "+" (also labelled "New task") open the same form on the same screen.
- **Where:** desktop Now.
- **Sources:** 07-035
- **Cite:** docs/qa.md › One way per job; PRODUCT principle 2.
- **Shots:** `R7/aria-desktop_.png`
- **Fix:** one entry point per screen.

**F-CMP-19 · minor — Switching activity on the phone takes four taps**
- **What:** while something runs, the phone folds the buttons behind "Start something else". Switching takes app → unfold → Chores → Commute, four taps against three on desktop (owner feedback-2 A2).
- **Where:** time bar · phone.
  - Files: `src/shared/tracking/time-bar-fold.tsx:17-40`.
- **Sources:** 07-025
- **Cite:** PRODUCT.md › Operating Context (three-tap flows); owner feedback-2 A2.
- **Shots:** `R7/s2-phone-light-en-3reopen.png`, `R7/s2-phone-light-en-4chores-again.png`
- **Fix:** keep the four buttons visible and collapse the running rows instead, or make the running row itself the switcher.

**F-CMP-20 · minor — The only long press in the app is hidden**
- **What:** closing a task as cancelled, skipped or "another time" lives in a long press on Done / Submit, announced only in `accessibilityHint`. On the web, it races Chrome's text selection (F-WEB-10).
- **Where:** task footer · phone.
  - Files: `src/features/task/task-footer.tsx:74-82`; copy in `packages/core/src/i18n/en/board.ts:102`.
- **Sources:** 06-007
- **Cite:** Material › Gestures (a long press must not be the only way); HIG gestures.
- **Shots:** `SCR/review-06/route_task_01M5YZE1DQFFM2X2BEHF92W0--phone-light-ru.png`, `BL/states/task-close-as--phone-light-ru.png`
- **Fix:** a visible "other outcome" control (a split button or ⋯); the long press stays as an accelerator.

**F-CMP-21 · minor — Icons come in 7 sizes and 6 stroke widths, mixed on one screen**
- **What:**
  - Now mixes these size/stroke pairs: 18/1.75, 18/2, 16/2, 14/2 and 13/2.25.
  - The task screen mixes 20/1.75, 18/1.75, 16/2, 15/1.8 and 14/2.5.
  - The app uses 45 lucide icons, and the disclosure chevron appears at 15 px and 16 px, in muted and fg2.
  - 4 of the 5 spinners are uncoloured, so they show grey on the lime button.
- **Where:** all · inventory §5, §5.2.
- **Sources:** 07-028
- **Cite:** HIG SF Symbols / icons (consistent weight); audit.native.md › Platform conformance "Icon drift".
- **Shots:** `R7/aria-desktop_task_01M5YZBMFXXJH5BQVVVSC8JR30.png`
- **Fix:** two sizes and one stroke, through a kit Icon that is also hidden from assistive tech by default (F-A11Y-19).

### What this says about the system (components)
- **The kit has primitives for leaves, not for structure.** Button, Chip and Tag exist. Title, List, EmptyState, Touchable, Sheet-with-gestures, Disclosure and SectionHeader do not, so each screen invents its own header, rows, empty line and press state.
- **The kit is bypassed whenever a screen needs a variation.** That produced five button geometries, hand-rolled lime and outlined buttons, per-screen widths and five selected looks. Size, emphasis, width and selection belong to the kit; screens should only pick.
- **Affordances are drawn without behaviours.** A grab handle with no drag, tooltips on tap, a Stop icon that looks like a checkbox, and an action reachable only by a hidden long press. The kit should draw a handle or hint only when the gesture behind it exists.
- **Feedback has no single home.** Toasts dock in the sidebar, To Inbox has none, and offsets are constants. A rule is needed: feedback appears next to its source and never covers the next action.
- **Form behaviour is wired the naive way.** Errors bind to the value instead of an interaction, and the commit position and shortcut differ per form. A field kit with a touched/submitted gate and one commit rule fixes every form at once.
- **One way per job is not enforced.** Two New task entries, Undo on every History row, and three Back-to-today forms.

---

## 5. Motion

**F-MOT-01 · major — Checking off a task takes about a second, and most of it is empty**
- **What:**
  - Measured on phone web, after the press:

    | Milestone | Phone web | Desktop web |
    |---|---|---|
    | check fills | 238 ms | 187 ms |
    | row content gone | about 783 ms | 472 ms |
    | rows jump into place (empty slot until then) | 1064 ms | 951 ms |
    | Undo toast appears | 1117 ms | 1049 ms |

  - The check fills late because the same commit mounts 150 animated specks, a 229 ms long task.
  - The 750 ms dust adds long tasks of 108, 55, 202 and 81 ms; the worst desktop frame was 523 ms.
  - `onDone` waits for the fixed `DISSOLVE_MS` timer instead of the animation's end.
  - The circle has no press state, and there is no haptic.
  - The owner asked to shorten the pause (feedback-4).
- **Where:** rows on Now, project page and History · phone + desktop web; Android by source · both themes.
  - Files: `src/ui/dissolve.tsx:13,15-16,122-160`, `src/ui/check-circle.tsx:23-40`, `src/shared/task-list.tsx:57-65,75`.
- **Sources:** 02-019, 04-001, 04-002
- **Cite:** review-animations Std 2 (frequent actions), Std 4 (over 300 ms), Std 9; STANDARDS › Duration (press feedback 100–160 ms), › Performance; HIG motion › Providing feedback; HIG playing-haptics.
- **Shots:** `SCR/review-04/checkoff-phone-strip.png`, `SCR/review-04/checkoff-timeline.json`, `BL/states/now-check-dissolve--desktop-light-en.png`
- **Fix:** fill the check at press, in its own commit. Keep the whole sequence under about 450 ms, with the collapse overlapping the dust, at most 40 specks in one layer, and driven by completion rather than a timer. Add an e2e budget from press to checked.

**F-MOT-02 · major — Rows close up on Android but jump on the web**
- **What:**
  - `ROW_LAYOUT` does not run on the web: the row below jumps from y 327 to 241 in one frame with `transform: none` (desktop: 307 → 241).
  - Android runs it as a 200 ms layout transition with the default inOut(quad) easing.
  - The section count ("3 → 2") and the filter chip also change in that same frame.
- **Where:** Now after a check-off, Day · web vs Android.
  - Files: `src/ui/motion.ts:22`, `src/shared/task-list.tsx:76`.
- **Sources:** 04-003
- **Cite:** Std 10 (cohesion), Std 1; bug-lessons class 11 (in reverse) and class 5.
- **Shots:** `SCR/review-04/checkoff-phone-samples.json`, `SCR/review-04/checkoff-phone-strip.png`
- **Fix:** collapse the removed row's own height (or a FLIP of its siblings) in one primitive verified on both platforms; an e2e sampler asserts movement over several frames.

**F-MOT-03 · major — Reduced motion means "off", and it breaks the check-off**
- **What:**
  - `ReduceMotion.System` makes every animation instant.
  - On check-off, the row's content — check included — goes to opacity 0 at 45 ms, but the 750 ms timer is not shortened. The user sees a blank hole for about 800 ms, then the rows jump.
  - Sheets and dialogs appear and vanish with no scrim fade.
- **Where:** check-off, sheets, rows · web with `prefers-reduced-motion: reduce`; Android by source.
  - Files: `src/ui/motion.ts:10-13`, `src/ui/dissolve.tsx:121-136`.
- **Sources:** 04-004
- **Cite:** Std 8 ("gentler, not zero"); STANDARDS › Accessibility.
- **Shots:** `SCR/review-04/checkoff-phone-reduced-strip.png`
- **Fix:** a reduced variant of each preset (short opacity fades) and timers driven by completion; an e2e run under reduced motion.

**F-MOT-04 · major (04-007 major; 04-023 minor) — Motion tokens are durations without curves, spread over five places**
- **What:**
  - No preset in `motion.ts` sets an easing:
    - on the web this falls back to linear (sampled as `cubic-bezier(0,0,1,1)`, about 58 px per frame at constant speed);
    - on Android it falls back to `Easing.inOut(quad)`.
  - There are 9 durations between 140 and 900 ms; the 750, 220, 900 and 300 ms values live inside components.
  - `PulseDot` duplicates `PLACEHOLDER_BREATH`.
  - The app sets an easing explicitly in exactly one place.
  - No test checks that an animation actually runs on the web.
- **Where:** every Reanimated entrance · web + Android.
  - Files: `src/ui/motion.ts:16-31`, `dissolve.tsx:13`, `animated-height.tsx:11`, `pulse-dot.tsx:13`, `update-banner.web.tsx:19`.
  - Inventory §2.4.
- **Sources:** 04-007, 04-023
- **Cite:** Std 3 (ease-out or a strong custom curve), Std 10; STANDARDS › Easing (`--ease-out`, `--ease-drawer`).
- **Shots:** `SCR/review-04/sheets.json`, `SCR/review-04/scenes.json`
- **Fix:** one motion module that owns duration and easing tokens and paired presets; a lint rejects any builder without an easing.

**F-MOT-05 · major (02, 04 major; 01 minor) — Sheets and dialogs enter with motion and leave in one frame**
- **What:**
  - The sheet slides up over 240 ms and the dialog zooms in over 160 ms.
  - Both vanish 18–25 ms after a scrim tap or Escape: the Modal unmounts, `animationType="none"`, and there is no `exiting`.
  - The Stage 8 plan promised FadeOut / SlideOutDown (`context/plan.md:196`).
  - Day's "Log it" → Save cuts away while the timeline changes underneath.
- **Where:** every sheet and dialog · phone + desktop web; Android by source.
  - Files: `src/ui/sheet.tsx:39,134,145-148`, `src/ui/motion.ts:25-31`.
- **Sources:** 02-008, 04-006, 01-034
- **Cite:** Std 9 (a faster exit, not no exit), Std 10; HIG motion › Providing feedback; ios.md › Motion ("dismiss reverses the entrance"); Material bottom-sheet dismissal.
- **Shots:** `SCR/review-04/sheets.json`, `SCR/review-04/day-save-phone-strip.png`, `BL/states/task-close-as--desktop-dark-en.png`
- **Fix:** keep the sheet mounted through an exit of about 0.75× the entrance; under reduced motion, a fade.

**F-MOT-06 · major — The desktop dialog grows from scale 0**
- **What:**
  - `DIALOG_ENTER = ZoomIn`, whose keyframes start at `scale: 0` with no opacity change.
  - Sampled scale: 0.42 → 0.52 → … → 1 over 160 ms, linear.
  - The text is fully opaque at 40 % size.
  - The code comment says the dialog "grows in place from slightly smaller".
- **Where:** every Sheet on a wide window · desktop web.
  - Files: `src/ui/motion.ts:30-31`, `src/ui/sheet.tsx:146`.
- **Sources:** 04-005
- **Cite:** STANDARDS › Physicality ("Never scale(0)"); Std 3.
- **Shots:** `SCR/review-04/logit-open-desktop-strip.png`
- **Fix:** opacity plus scale from 0.96 to 1 over about 200 ms with ease-out, as a custom keyframe.

**F-MOT-07 · major (04-010, 04-012 major; the others minor) — Row animations fire on mount, filter changes, day switches and hotkeys**
- **What:**
  - Day's previous/next crossfades two whole timelines over 150–190 ms. The labels overprint, for example "Завтрак" over "Tracked 40m".
  - Saving "Log it" fades the gap row out while the activity fades in at the same y, garbled for about 100 ms.
  - Filter chips cut the rows that leave, while the surviving row jumps 131 px and fades in again.
  - Every list fades all its rows in at once when it mounts, and "In future" does the same.
  - Rows created with Enter or a hotkey animate in.
- **Where:** Day, Now filters, every task list, composer Enter · phone + desktop web.
  - Files: `src/features/day/day-screen.tsx:230-232,265`, `src/shared/task-list.tsx:66-101,72`, `src/features/now/now-task-groups.tsx`, `src/features/now/composer/composer-form.tsx:118-119`.
- **Sources:** 04-010, 04-012, 04-011, 04-013, 04-022
- **Cite:** Std 2 (tens of times a day; never animate keyboard actions), Std 1, Std 10; STANDARDS › Masking imperfect crossfades; escalation "everything-at-once entrance".
- **Shots:** `SCR/review-04/day-prev-phone-strip.png`, `SCR/review-04/filter-back-phone-strip.png`, `SCR/review-04/day-save-phone-strip.png`
- **Fix:** animate only the rows that a user action added or removed on the open screen; skip on mount, on a dataset change, on a filter change and for keyboard actions; use stable keys.

**F-MOT-08 · major — The composer unfolds with the form clipped**
- **What:**
  - The composer line is swapped for the 959 px form in one commit, inside a card that is still 54 px tall.
  - For the first 2–3 frames only the header shows, with "Create" cut in half (its bottom at 151 px, the card's at 144 px).
  - The height then grows from 54 to 969 px over about 250 ms on the default ease-in-out. The slow start holds the clipped state.
  - Animating `height` re-lays out the whole page on every frame.
  - The card ends up taller than the 844 px viewport.
  - On the phone, Escape does not fold it.
- **Where:** Now composer card · phone web; Android by source.
  - Files: `src/ui/animated-height.tsx:11,23-31`, `src/features/now/composer/composer.tsx:106-115`.
- **Sources:** 04-014
- **Cite:** owner feedback-4 (the unfold artefact); Std 3, Std 7, Std 10; bug-lessons class 5.
- **Shots:** `SCR/review-04/composer-unfold-phone-strip.png`
- **Fix:** crossfade the old and new content and grow on ease-out in about 220 ms from the swap frame; extend `expectStaysInside()` to assert 0 px of clipping in every frame.

**F-MOT-09 · minor (04-009 nit) — The phone sheet travels a full window height, and the first frame may flash the end state**
- **What:**
  - `SlideInDown` starts from `translateY(100vh)` on the web and from the window height on Android, not from the sheet's own height. A 623 px sheet starts 668 px down.
  - One sampled frame showed the sheet already at its final position, with `animation: none`, before the keyframes applied.
- **Where:** phone sheet · web; Android by source.
  - Files: `src/ui/motion.ts:28`, `src/ui/sheet.tsx:144-147`.
- **Sources:** 04-008, 04-009
- **Cite:** STANDARDS › Transforms (`translateY(100%)`), › Interruptibility (`@starting-style`).
- **Shots:** `SCR/review-04/logit-open-phone-strip.png`
- **Fix:** keyframes from 100 % of the sheet's own height, and mount with the start style.

**F-MOT-10 · minor — Three disclosures, three behaviours**
- **What:**
  - The time bar's "Start something else" unfolds about 150 px instantly.
  - "In future" fades its rows in linearly while the chevron icon is swapped and the content below jumps.
  - The composer animates its height.
- **Where:** phone web.
  - Files: `src/shared/tracking/time-bar.tsx:266-268`, `src/shared/task-list.tsx:140`, `src/ui/animated-height.tsx`.
- **Sources:** 04-015
- **Cite:** Std 10, Std 1.
- **Shots:** `SCR/review-04/startelse-strip.png`
- **Fix:** one Disclosure primitive: height plus opacity, a rotating chevron, and a fade under reduced motion.

**F-MOT-11 · minor — The toast has no motion and arrives last**
- **What:** the toast appears, vanishes and is replaced in one frame (`key={toast.id}`). Because it is chained after the dust, the Undo arrives 1.05–1.12 s after the press.
- **Where:** toast · phone + desktop · both themes.
  - Files: `src/ui/toast.tsx:121-130,187-195`, `src/shared/task-list.tsx:57-60`.
- **Sources:** 04-016
- **Cite:** STANDARDS frequency table; Std 6 (interruptible); owner feedback-4 («вылезает… с задержкой»).
- **Shots:** `SCR/review-04/checkoff-phone-strip.png`
- **Fix:** show the toast at press time, with a short, interruptible entrance and exit.

**F-MOT-12 · minor — The running pulse breathes at 70 % amplitude all day**
- **What:**
  - The dot pulses between opacity 1 and 0.3, 900 ms each way, forever, with ease-in-out.
  - On an idle Now, the screencast received a frame about every 16 ms.
  - On Android, a Reanimated loop keeps the UI thread busy.
- **Where:** time bar on Now and Day, Day rows · all.
  - Files: `src/ui/pulse-dot.tsx:13,19-23`, `src/shared/tracking/running-row.tsx:22`.
- **Sources:** 04-017
- **Cite:** Std 1 / Std 2, Std 10.
- **Shots:** `SCR/review-04/startelse-strip.png`
- **Fix:** a static dot (the ticking minutes already say it is alive), or a slow, small breath that pauses off-screen.

**F-MOT-13 · nit — The tooltip pops in with no fade and no origin**
- **What:** the bubble appears about 110 ms after pointerover, at full opacity in one frame. Hiding is a cut too.
- **Where:** desktop web.
  - Files: `src/ui/tooltip.web.tsx:114-125,145-151`, `src/ui/tooltip.tsx:96-113`.
- **Sources:** 04-019
- **Cite:** STANDARDS › Duration (tooltips 125–200 ms, instant after the first), Std 5 (origin-aware).
- **Shots:** `SCR/review-04/sheets.json` (`tooltip-desktop`)
- **Fix:** a 100–125 ms fade with a slight scale from the side facing the trigger, skipped when moving between triggers.

**F-MOT-14 · nit — The slider thumb jumps**
- **What:** the native thumb switches to `scale-110` in one frame, through a class swap, and the web range thumb has no active state. The release jitter reported in feedback-3 is verified fixed.
- **Where:** task progress slider · Android by source; web.
  - Files: `src/ui/slider.tsx:70-76`, `global.css:102-118`.
- **Sources:** 04-021
- **Cite:** STANDARDS › Duration (press 100–160 ms), Std 6.
- **Shots:** `SCR/review-04/slider.json`
- **Fix:** an animated thumb scale on grab and on release.

**F-MOT-15 · nit — Pushing a route is a cut on the web and a slide on Android**
- **What:** on the web, pushing and popping `/task/[id]` is a cut after about 190 ms of render latency. Android's native stack slides (login, auth and onboarding fade). Tab switches are instant on both, which is correct.
- **Where:** phone web vs Android.
  - Files: `app/_layout.tsx:60-88`, `app/(tabs)/_layout.tsx:16-19`, `src/ui/screen-scene.web.tsx:20`.
- **Sources:** 04-024
- **Cite:** Std 2, Std 10.
- **Shots:** `SCR/review-04/push-strip.png`
- **Fix:** the spec decides this consciously (an optional short push on phone web) rather than leaving it to accident.

### What this says about the system (motion)
- **The tokens are durations without curves.** Each platform picks its own default easing (linear on the web, inOut(quad) on Android), so every entrance is wrong in two different ways. The spec must own the curves and pass them everywhere.
- **Motion was designed for entrances only.** Sheets, dialogs, toasts and tooltips have no exit, and the planned exit was never built. Every primitive needs a paired entrance and exit.
- **Animations are attached to rows, not to user actions.** So they fire on mount, filter, day switch and hotkeys, which are exactly the high-frequency cases. Meanwhile the one case that needs motion (a row leaving after a check) does not animate on the web.
- **Reduced motion is a kill switch, not a profile.** Fixed timers paired with animations then break: the blank hole on check-off. Each preset needs a gentle variant, and timers should be driven by completion.
- **Nobody watches frames on the web.** The dead layout transition, the dialog growing from scale 0 and the clipped unfold all passed. The e2e geometry sampler should grow into a motion sweep that runs with normal and reduced motion.
- **Motion lives in leaf components.** The 750 ms dust, 150 views, 43 opacity classes and class-swap scales sit in leaf files. The kit needs Pressable, Disclosure, Presence and Sheet primitives that own motion.

---

## 6. Web layer

**F-WEB-01 · blocker (08 blocker; 03 major) — Every route is titled "Pace"**
- **What:**
  - `document.title` is "Pace" on every audited route in every combo, and on `/login`.
  - Route changes are therefore silent to screen readers, and tabs and history entries look the same.
  - The `title` options in `(tabs)/_layout.tsx:21-26` never reach the document.
- **Where:** all routes · web.
  - Files: `public/index.html:17`; nothing in the code sets `document.title`.
- **Sources:** 08-003, 03-004
- **Cite:** WCAG 2.4.2 Page Titled (A); Web Interface Guidelines › Navigation & State.
- **Shots:** `R08/sweep/desktop-light_settings.json`, `SCR/review-03/audit.json`
- **Fix:** a per-route title "<screen> — Pace" through `t()`, set by a web-only owner of the document; task screens use the task title as user content.

**F-WEB-02 · major — The document follows the OS, not the app theme, and theme literals drift**
- **What:**
  - `color-scheme`, `theme-color` and the body background are chosen by `prefers-color-scheme` only.
  - **OS light + app dark:**
    - `html` computes `color-scheme: normal` and the body is `rgb(244,245,247)`;
    - a white scrollbar track sits beside the dark content;
    - each load shows a light flash of about 240 ms.
  - **OS dark + app light:** the status bar is `#0b0b0c` over a `#eceef2` app.
  - With a sheet open, the app dims but the status bar stays bright.
  - Even when OS and app agree, the light value is `#f4f5f7` against the token `#eceef2`.
  - The manifest's `background_color` / `theme_color` and the native splash are `#0b0b0c` with no light variant. A light-theme user sees a black splash, then `#f4f5f7`, then `#eceef2`.
- **Where:** document chrome, scrollbars, Android status and URL bar, first paint, PWA and native splash · phone + desktop · app theme ≠ OS theme, and light.
  - Files: `public/index.html:7-9,22-32`, `src/ui/theme-provider.tsx:24-37`, `public/manifest.webmanifest:8-9`, `app.config.ts:71,82,112`.
- **Sources:** 03-002, 06-001, 03-016, 06-011, 01-033
- **Cite:** Web Interface Guidelines › Dark Mode & Theming; mobile-native §10 and Never Ship ("one theme-color for both schemes"); HIG launching; impeccable detector `design-system-color`.
- **Shots:** `SCR/review-03/scrollbar-oslight-appdark-crop.png`, `SCR/review-06/theme-os-dark-app-light--phone-ru.png`, `SCR/review-06/sheet-task-picker--phone-light-ru.png`
- **Fix:** a web owner of the document — a runtime effect plus a CSP-safe external boot script — with the literals in `index.html`, the manifest and the splash generated from tokens.

**F-WEB-03 · major — Navigation is not made of links**
- **What:**
  - The signed-in app has 0 `<a>` elements and 341 `div[role=link]` without `href`.
  - Ctrl/Cmd-click, middle-click, "Copy link" and open-in-new-tab do nothing; a Ctrl-click on Insights navigated in place.
  - The task's external URL is a div with no `href`, `target` or `rel`.
  - The pattern already exists once: `login-return-screen.web.tsx:76` uses expo-router's `<Link>`.
- **Where:** sidebar, task and project rows, More, notifications, presets, Day/Week details, Settings links · web.
  - Files: `src/ui/sidebar.tsx:112`, `src/shared/task-row.tsx:78`, `src/features/task/task-summary.tsx:179`, `src/screens/more-screen.tsx:43`, `src/screens/projects-screen.tsx:70`, `src/features/notifications/notifications-screen.tsx:56,74,204`, `src/features/presets/presets-list.tsx:64`, `src/features/day/day-screen.tsx:142`, `src/features/week/picked-details.tsx:104,139`, `src/features/settings/settings-links.tsx:22`.
- **Sources:** 03-003
- **Cite:** Web Interface Guidelines › Navigation & State, › Accessibility, › Anti-patterns.
- **Shots:** `SCR/review-03/sem.json`
- **Fix:** navigation rendered as `<a href>`, either through expo-router `Link asChild` or an `href` helper; external links get `target` and `rel`.

**F-WEB-04 · major (03 major, "blocker if every AA miss is"; 06 minor) — Tooltips cannot be hovered, and on touch they fire on tap**
- **What:**
  - The bubble has `pointerEvents="none"` and hides when the pointer leaves the trigger, so it cannot be hovered.
  - It covers neighbouring content.
  - It shows with zero delay, so moving across the bottom bar flickers one bubble after another.
  - On touch, a tap both runs the control and pops a 2.5 s bubble: tapping the moon toggled night hours and showed "Ночные часы".
- **Where:** composer, quick line, time-bar Calendar, Week · desktop pointer; phone touch.
  - Files: `src/ui/tooltip.web.tsx:150,176,211-226`, `src/features/week/week-screen.tsx:44`.
- **Sources:** 03-005, 06-010
- **Cite:** WCAG 1.4.13 Content on Hover or Focus ("hoverable"); WAI-ARIA APG Tooltip; Material › Tooltips (long press on touch); HIG (no tooltips on touch).
- **Shots:** `BL/states/now-calendar-tooltip--desktop-light-ru.png`, `SCR/review-06/tooltip-on-tap-week-moon--phone-light-ru.png`
- **Fix:** hoverable with a short grace period, a delay on first hover and instant after that; long press only on coarse pointers.

**F-WEB-05 · major — On desktop the scroller is the 880 px column**
- **What:** the scrollbar sits at x ≈ 1260, in the middle of the window. The mouse wheel does nothing over the 168 px gutters on either side: `scrollTop` stays 0 when wheeling at x 1360 and x 300. This affects Settings, History, Insights, More and every other scrolling screen.
- **Where:** every scrolling screen · desktop 1440×900 · both themes.
  - Files: `src/ui/screen.tsx:33,38`.
- **Sources:** 03-007
- **Cite:** HIG scroll views (the window scrolls from anywhere, scrollbar at its edge); Web Interface Guidelines › Safe Areas & Layout.
- **Shots:** `SCR/review-03/scrollbar-oslight-appdark-settings.png`
- **Fix:** a full-width scroll view with centred content.

**F-WEB-06 · major (06 major; 03 minor) — Pull-to-refresh can reload the app from any list or sheet**
- **What:**
  - `overscroll-behavior` is `auto` on `html`, `body`, `#root` and every scroller, sheet bodies included.
  - `body { overflow: hidden }` stops the page scrolling, not the scroll chaining.
  - In an Android Chrome tab, a pull at the top of Now or inside a sheet therefore reloads a 3 MB SPA. That loses an open picker or form and any typed draft.
  - Trackpad momentum also chains out of sheets.
- **Where:** Now, Day, History, Settings, sheet bodies · phone web · both themes.
  - Files: `global.css` (no rule), `public/index.html:20-31`.
- **Sources:** 06-002, 03-029
- **Cite:** mobile-native §6; Web Interface Guidelines › Touch & Interaction (`overscroll-behavior: contain` in sheets).
- **Shots:** `SCR/review-06/css-now-ru-light.json`, `SCR/review-06/interact.json`
- **Fix:** `overscroll-behavior: none` on the root and `contain` on sheets and inner scrollers; confirm on hardware.

**F-WEB-07 · minor — The update strip: a height animation that re-lays out the app, a Refresh that drops drafts, a 30 px target**
- **What:**
  - The strip grows by animating `height` from 0 over 300 ms (default ease-in-out, on the JS thread), so the whole app re-lays out every frame.
  - Refresh is an immediate skipWaiting plus reload. Text typed into the composer is gone after the reload, and there is no `beforeunload` anywhere.
  - The "Обновить" button is `px-3 py-1`, about 30 px tall.
  - The strip is `accentQuiet` blue while the status bar keeps the page colour, so the top shows two bands.
  - The copy is covered in F-CPY-01.
- **Where:** web update strip · phone + desktop.
  - Files: `src/platform/update-banner.web.tsx:19,76-88,94-115,151`.
- **Sources:** 03-017, 06-012, 04-018
- **Cite:** Web Interface Guidelines › Animation (animate transform and opacity only), › Forms (warn before navigating away from unsaved changes); review-animations Std 4 / Std 7; Material 48 dp and HIG 44 pt targets.
- **Shots:** `SCR/review-03` (`r03-draft` output: "value after reload: ''")
- **Fix:** a transform-based slide or a single layout push; persist or confirm dirty drafts before reloading; a 44 px target; the strip colour reaches `theme-color`.

**F-WEB-08 · minor — Field attributes are left at React Native Web's defaults**
- **What:**
  - Every non-auth field has `autocomplete="on"` and no `name`, so Chrome may offer autofill history over the composer and time fields, and paint `:-webkit-autofill` blue in dark.
  - `spellcheck="true"` is on the URL field and the five `00:00` time fields.
  - `autocapitalize="sentences"` is on the time fields.
  - Search is `type=text`.
  - The composer textarea has no `enterkeyhint`.
- **Where:** composer, quick line, task form, time fields, search · desktop + phone.
  - Files: `src/ui/text-field.tsx:25`, `src/ui/time-input.tsx:29-51`, `src/shared/task-fields/task-text-fields.tsx:27`.
- **Sources:** 03-011
- **Cite:** Web Interface Guidelines › Forms.
- **Shots:** `SCR/review-03/audit.json` (`inputs`)
- **Fix:** kit defaults by field purpose: autocomplete off; spellcheck and autocapitalize off for time, number and URL; a search input mode; `enterKeyHint`.

**F-WEB-09 · minor — Fields are 15 px, so iOS Safari zooms on focus**
- **What:** every field is 15 px; only the sheet's switch input is 16 px. iOS Safari zooms into a focused field under 16 px and stays zoomed, since zoom is correctly not locked. Android Chrome is unaffected.
- **Where:** all fields · phone web on iOS (unverified).
- **Sources:** 03-012
- **Cite:** mobile-native ("inputs that zoom the page"); Web Interface Guidelines › Anti-patterns (the cure must not be `maximum-scale`).
- **Shots:** `SCR/review-03/misc.json`, `SCR/review-06/routes-audit.json`
- **Fix:** a 16 px field size on coarse pointers, as part of the type-scale decision.

**F-WEB-10 · minor — A long press selects control labels**
- **What:** `user-select: auto` is on 18 of 18 controls on Now and on 17 of 26 controls with a text label. On Android Chrome, a long press selects the word and shows the Copy/Share toolbar with a haptic tick. It races the task footer's own long press.
- **Where:** buttons, tabs, chips, links · phone web.
  - Files: `global.css` (no rule).
- **Sources:** 06-006
- **Cite:** mobile-native §8 and Never Ship.
- **Shots:** `SCR/review-06/routes-audit.json`, `SCR/review-06/longpress-done--phone-light-ru.png`
- **Fix:** `user-select: none` and `-webkit-touch-callout: none` on controls only, never on content.

**F-WEB-11 · minor — Layout shifts on load**
- **What:**

  | Screen | Width | CLS |
  |---|---|---|
  | History | 390 (both themes) | 0.188 |
  | History | 768 | 0.182 |
  | Now | 390 | 0.096–0.113 |
  | Week | ≤ 768 | 0.045–0.064 |
  | Day | — | 0.057 |

  The lists and the time bar mount after the local store hydrates, and push content down.
- **Where:** web, phone widths · hydration.
- **Sources:** 01-041
- **Cite:** audit.md › Performance (CLS ≤ 0.1).
- **Shots:** `SCR/review-01/web/audit-en.json`
- **Fix:** reserve list and time-bar space, or show skeletons, before hydration.

**F-WEB-12 · minor — One 3.6 MB JS chunk for every route**
- **What:** `entry-54a5…js` is 3,603,758 B raw and 795,689 B gzip, including OAuth consent and presets. The service worker caches it after the first visit, so the first load and every release pay the full cost.
- **Where:** web.
  - Files: `dist/_expo/static/js/web/`.
- **Sources:** 01-042
- **Cite:** audit.md › Performance ("Bundle size").
- **Shots:** —
- **Fix:** route-level async chunks.

**F-WEB-13 · minor (06-013, 06-014 nit) — Manifest and install support are minimal**
- **What:**
  - One 512 px icon carries `"purpose": "any maskable"`, so desktop and taskbar installs draw the mark at about 50 % inside a dark square.
  - The manifest has no `id`, `lang`, `dir`, `shortcuts` (e.g. New task → `/add`) or `screenshots`, so Chrome shows the bare install sheet.
  - There is no `beforeinstallprompt` entry once the prompt has been dismissed.
- **Where:** installed PWA.
  - Files: `public/manifest.webmanifest:8-13`, `scripts/generate-icons.ts`.
- **Sources:** 03-015, 06-013, 06-014
- **Cite:** web.dev › Maskable icons, › Add a web app manifest; W3C App Manifest; mobile-native §11.
- **Shots:** `apps/app/public/icon-512.png`
- **Fix:** separate `any` and `maskable` icons, add `id` / `lang` / `shortcuts` / `screenshots`, and a quiet install row when available.

**F-WEB-14 · nit — Text selection uses the browser's blue**
- **What:** there is no `::selection` rule, so selection uses the browser highlight in both themes. 01-032 also noted that the caret and scrollbars are unthemed.
- **Where:** all.
  - Files: `global.css`.
- **Sources:** 03-027
- **Cite:** Web Interface Guidelines › Dark Mode & Theming; craft-floor.md › Verify "Browser surfaces".
- **Shots:** `SCR/review-03/field-focus-digest-dark-ru.png`
- **Fix:** selection, caret and scrollbars themed from tokens.

**F-WEB-15 · nit — Favicon order, and the .ico is not precached**
- **What:** Expo appends `<link rel="icon" href="/favicon.ico">` after the SVG link, so Chromium picks the raster. `ico` is missing from the Workbox `globPatterns`, so it is not cached for offline use.
- **Where:** `dist/index.html:11,39`, `scripts/build-web.ts:40`, `app.config.ts` (`web.favicon`).
- **Sources:** 03-023
- **Cite:** Web Interface Guidelines › Images, › Performance.
- **Shots:** —
- **Fix:** put the SVG link last (or drop `web.favicon`) and precache the `.ico`.

**F-WEB-16 · nit — The local server ignores `_headers`, so the CSP is never exercised**
- **What:** `serve-web.ts` does not send `_headers`, so an inline script would pass e2e locally and break in production. A build comment points to `src/platform/sw.web.tsx`, which does not exist.
- **Where:** `scripts/serve-web.ts:11-23`, `scripts/build-web.ts:4`, `public/_headers:5`.
- **Sources:** 03-026
- **Cite:** Web Interface Guidelines › Performance / Hydration (test what ships).
- **Shots:** —
- **Fix:** serve `_headers` locally and fix the comment.

### What this says about the system (web layer)
- **Nothing owns the document.** `ThemeProvider` paints a View, and nothing owns the `<html>` element: `color-scheme`, `theme-color`, background, `lang` at first paint, and `title`. One missing layer (a set of `document-*.web.tsx` effects plus a CSP-safe boot script) explains F-WEB-01, F-WEB-02 and F-DAT-04.
- **React Native abstractions erase web semantics by default:** `div[role=link]` with no `href`, `header` rendered as `<h1>`, a `Text` instead of `<label>`, `autocomplete="on"`, and a `tablist` used for navigation. The kit should expose semantic props once (`href`, heading `level`, `labelFor`, field purpose).
- **The mobile web baseline has no owner either.** What works today works because React Native Web ships it: tap highlight, `touch-action`, hover filtering. Everything else is missing: overscroll, `user-select`, field size, `interactive-widget`, a draft guard.
- **Desktop treats the phone column as the window.** The 880 px scroller and its dead gutters.
- **Literal values are copied by hand instead of generated from tokens.** `#f4f5f7`, `#0b0b0c`, manifest and splash colours, the favicon order: these are hand copies that have already drifted.
- **Local serving does not match production.** Without `_headers`, the CSP that shapes the document fixes is invisible to tests.

---

## 7. Accessibility

**F-A11Y-01 · blocker (01, 03, 08 blocker; 08-019 major; 03-019 minor) — No designed focus state: fields show nothing, everything else gets the browser's ring**
- **What:**
  - `global.css:43-47` removes the outline on `input` and `textarea`, and nothing replaces it. None of the 11 TextInputs shows focus.
  - Invisible Tab stops by screen: 2–3 of 33 on Now, 3–4 of 19 in the Day dialog, 5 of 58 on Settings; 9 per theme per sampled route.
  - Only the composer card rings (it turns blue). The coral Title border is its error state, not focus.
  - Every other stop gets Chromium's default `outline: auto 1px`, with three problems:
    - it is drawn around the invisible 44 px hit box, so pills and check circles get a square ring;
    - it has no offset;
    - it is clipped by `overflow: hidden` inside sheets.
  - The ring looks different in every browser.
  - Designed rings exist only on the switch and the slider.
- **Where:** every text field and pressable · desktop web (on phones the caret partly mitigates it) · both themes · EN/RU.
  - Files: `global.css:43-47,53-57,120-124`, `src/ui/text-field.tsx:27-32`, `src/ui/time-input.tsx:31-34`, `src/features/presets/number-input.tsx:31`, `src/shared/tracking/time-bar.tsx:84`, `src/ui/chip.tsx:59`, `src/ui/check-circle.tsx:28`, `src/ui/sheet.tsx:168-172`.
- **Sources:** 01-032, 03-001, 08-001, 08-019, 03-019
- **Cite:** WCAG 2.4.7 Focus Visible (AA), 2.4.11 Focus Not Obscured (AA), 2.4.13 Focus Appearance (AAA, as the target); Web Interface Guidelines › Focus States; craft-floor.md › Verify.
- **Shots:** `SCR/review-03/field-focus-digest-dark-ru.png`, `R08/focus/light-dlg-log-past-tab3.png`, `R08/focus/rings-dark.png`, `BL/focus/now-tab6--desktop-dark-en.png`
- **Fix:** one `focus` token (≥ 3:1 against the field fill and the surface), drawn by the kit on `:focus-visible` (fields on focus). It follows the visible shape and is never clipped.

**F-A11Y-02 · blocker (08 blocker; 01 major) — Deleting a task: no confirmation, a dead-end page, lost focus, and an Undo that disappears**
- **What:**
  - "Delete the task" deletes immediately.
  - The page stays open, with the header "No project" and the body "This task does not exist."
  - Focus drops to `<body>`.
  - The only recovery is an Undo in a toast, with four problems:
    - it lasts 5–10 s and does not pause on hover or focus;
    - it is docked bottom-left, about 1 000 px from the top-right Delete, outside a magnifier's view;
    - reaching it takes three Tab presses;
    - a screen-reader user hears a polite alert and has to find it.
- **Where:** task page and pane · desktop + phone · both themes.
  - Files: `src/features/task/task-header.tsx:25-32,80`, `src/features/task/task-screen.tsx:87`, `src/ui/toast.tsx:87-88,132,168`.
- **Sources:** 08-008, 01-009
- **Cite:** WCAG 2.2.1 Timing Adjustable (A), 2.4.3 Focus Order (A); Nielsen H3, H9; bug-lessons classes 5, 21.
- **Shots:** `BL/states/task-delete-confirm--desktop-light-en.png`, `R08/focus/light-dlg-delete-task-open.png`
- **Fix:** after deleting, leave the page and return to where the task was opened. Move focus to the Undo or the next row. Toasts with an action stay while focused or hovered.

**F-A11Y-03 · blocker — `n` and `f` are single-key global shortcuts, with no way to turn them off**
- **What:** printable single-character shortcuts work page-wide and are suppressed only while a text field has focus. They need no modifier, and no setting turns them off. Speech-input users trigger them by saying words that start with those letters.
- **Where:** desktop web.
  - Files: `src/ui/hotkeys.ts:35,37`, `src/ui/use-hotkey.web.tsx:40`; the hints are shown at `src/ui/sidebar.tsx:187` and `src/features/task/task-footer.tsx:23`.
- **Sources:** 08-004
- **Cite:** WCAG 2.1.4 Character Key Shortcuts (A).
- **Shots:** `BL/focus/now-tab1--desktop-light-en.png`
- **Fix:** require a modifier (as `toInbox` already does), or add a setting, or scope the keys to focus within the list.

**F-A11Y-04 · major (03-006, 08-016 major; 03-020 nit) — Forced colours erase every state drawn as a fill**
- **What:**
  - Under `forced-colors: active`:
    - System, Light and Dark look identical, and so do English and Русский;
    - primary buttons become bare text;
    - sidebar and task selection vanish;
    - Week's tracked blocks lose their box, leaving floating labels;
    - progress bars and pulse dots disappear.
  - Nothing handles `prefers-contrast: more`; separators stay at 0.10 / 0.13 alpha.
  - Focus rings do survive.
- **Where:** desktop + phone.
  - Files: `global.css` (no media query); `src/ui/button.tsx:19`, `src/ui/chip.tsx:15-22`, `src/features/week/week-grid.tsx:128-140`, `src/ui/progress-bar.tsx:25`, `src/shared/tracking/running-row.tsx:55`.
- **Sources:** 03-006, 08-016, 03-020
- **Cite:** WCAG 1.4.11; Microsoft forced-colors guidance; HIG accessibility › Increase contrast; Web Interface Guidelines › Hover & Interactive States.
- **Shots:** `SCR/review-03/forced-colors-settings.png`, `R08/env/forced-desktop_week.png`
- **Fix:** forced-colours and more-contrast layers: system colours, borders that survive, and `Highlight` for selection.

**F-A11Y-05 · major (08 major; 03 minor) — Every heading is an h1**
- **What:** React Native's `accessibilityRole="header"` without `aria-level` renders as `<h1>`. Settings has 12–13 h1s ("THEME", "LANGUAGE"…), Insights 6, a preset 5, and Notifications' "TODAY" is an h1. There are 25 header roles and no levels anywhere.
- **Where:** all routes · web.
  - Files: `src/ui/screen-header.tsx:54`, `src/screens/settings-screen.tsx:39`, `src/shared/activity-usage.tsx:73,113`, `src/features/settings/delete-account.tsx:251`.
- **Sources:** 08-010, 03-008
- **Cite:** WCAG 1.3.1, 2.4.6; Web Interface Guidelines › Accessibility.
- **Shots:** `R08/sweep/desktop-light_settings.yml`, `SCR/review-03/audit.json`
- **Fix:** the kit's ScreenTitle at level 1 and SectionTitle at levels 2–3.

**F-A11Y-06 · major (08 major; 01 minor) — Web targets are below 44 px**
- **What:**
  - 235 of 483 target instances on desktop and 47 of 285 on the phone are under 44 px in one dimension:
    - 9 sidebar rows at 199×40;
    - the composer's New task, To Inbox and Send at 36×36;
    - 26 switches at 48×24, whose row labels are not clickable;
    - task title links 42 px tall;
    - the "All" chip 42.6 px wide;
    - Week blocks 98×29–33 px on desktop and 30.9 px wide on the phone;
    - the link line 15 px tall;
    - subtask add and remove at 36 px;
    - calendar days at 40 px.
  - None is under 24 px, so WCAG 2.5.8 passes.
- **Where:** 390 + 1440 px.
  - Files: `src/ui/sidebar.tsx:115,180`, `src/features/now/composer/quick-line.tsx:98,104`, `src/ui/switch-size.web.ts:4`, `src/shared/task-row.tsx:77`, `src/features/week/week-grid.tsx:165`, `src/shared/task-fields/subtask-list.tsx:63,104`.
- **Sources:** 08-015, 01-031
- **Cite:** PRODUCT.md › Accessibility (≥ 44 pt); HIG layout / accessibility (44 pt); WCAG 2.5.5 (AAA).
- **Shots:** `R08/sweep/desktop-light_settings.png`, `R08/sweep/phone-light_week.png`
- **Fix:** a 44 px minimum target token, and switch rows pressable as a whole.

**F-A11Y-07 · major — Dialogs have no accessible name, and the backdrop is the first Tab stop**
- **What:**
  - Dialogs are `role=dialog aria-modal=true` with no `aria-label` or `aria-labelledby` (16 of 16 states measured), even though each has a visible title.
  - The full-screen backdrop is the first Tab stop. It is named "Close", exactly like the X, and its ring sits at the viewport edge, where it is invisible.
- **Where:** every sheet and dialog · both viewports.
  - Files: `src/ui/sheet.tsx:40-41,76,131-151`.
- **Sources:** 08-009
- **Cite:** WCAG 4.1.2, 2.4.7; axe best-practice `aria-dialog-name`.
- **Shots:** `R08/focus/ring-light-dlg-backdrop.png`
- **Fix:** `aria-labelledby` pointing at the title, and the backdrop taken out of the Tab order on the web.

**F-A11Y-08 · major — Focus falls to the page when a control is replaced, and inline confirmations ignore Escape**
- **What:** New project replaces its button with an inline form, and focus falls to `<body>`. The Wipe and New project inline confirmations ignore Escape; sheets are correct. Delete is covered in F-A11Y-02.
- **Where:** desktop.
  - Files: `src/screens/projects-screen.tsx:23`, `src/features/settings/delete-account.tsx`.
- **Sources:** 08-013
- **Cite:** WCAG 2.4.3; bug-lessons class 5 (the `useConfirmFocus()` rule).
- **Shots:** `R08/focus/light-dlg-new-project-open.png`
- **Fix:** a kit rule: focus moves to whatever replaces the control, and Escape cancels inline confirmations.

**F-A11Y-09 · major — The Week grid never says the day**
- **What:** a block is announced as "Алгебра, №290, 18:31–19:16", with no day. The hour gutter and the weekday row are exposed as one run of text: "07 08 09 … 26 Mon 27 Tue …".
- **Where:** Week · both viewports.
  - Files: `src/features/week/week-grid.tsx:68,165-169,243`.
- **Sources:** 08-011
- **Cite:** WCAG 1.3.1.
- **Shots:** `R08/sweep/phone-light_week.yml`
- **Fix:** day columns as named groups, block labels that include the date, and the gutter hidden from assistive tech.

**F-A11Y-10 · major — The running timer is a live region that speaks every minute**
- **What:** the whole meta block of each running activity is `accessibilityLiveRegion="polite"`, and its elapsed time changes every minute. With two activities running, a screen reader is interrupted twice a minute, indefinitely.
- **Where:** time-bar running rows · both viewports.
  - Files: `src/shared/tracking/running-row.tsx:48`.
- **Sources:** 08-012
- **Cite:** WCAG 4.1.3 (for status changes, not ticking timers), 2.2.4 (AAA).
- **Shots:** `BL/routes/now--desktop-light-en.png`
- **Fix:** only status changes are live; the timer stays out of the region.

**F-A11Y-11 · minor — The phone tab bar is a tablist used for navigation, and pushed screens lose aria-current**
- **What:** the bottom bar is a `tablist` of `tab`s that switch routes, with no tab panels; a screen reader says "tab, 1 of 4". On a pushed task screen, the sidebar still shows "Now" as current, but no item has `aria-current`.
- **Where:** phone web tab bar; desktop `/task/:id`.
  - Files: `src/ui/tab-bar.tsx:57,94-96`, `src/ui/sidebar.tsx:113`.
- **Sources:** 03-009, 08-024
- **Cite:** WAI-ARIA APG Tabs pattern; WCAG 1.3.1, 4.1.2.
- **Shots:** `R08/sweep/phone-light_.yml`
- **Fix:** on the web, a `nav` with links and `aria-current`; keep the `tab` role on Android for TalkBack.

**F-A11Y-12 · minor — No main landmark and no skip link**
- **What:**
  - Every route makes a keyboard user pass 10 sidebar stops before reaching content.
  - The only landmark is `nav`: axe reports `landmark-one-main` on 40 of 40 desktop states and `region` on 84 of 84.
  - WCAG 2.4.1 is met only through the h1.
- **Where:** desktop.
  - Files: `src/ui/split-pane.tsx:20-22`, `src/ui/screen.tsx:32`.
- **Sources:** 03-010, 08-023
- **Cite:** WCAG 2.4.1 Bypass Blocks; ARIA landmarks.
- **Shots:** `BL/focus/now-tab1--desktop-dark-en.png`
- **Fix:** `role="main"` on the content and a "Skip to content" link on wide layouts.

**F-A11Y-13 · minor — Unnamed option groups and flattened stats**
- **What:**
  - The Theme and Language radio groups have no name.
  - The "Filter by project" label sits on a ScrollView without a role, so it is dropped.
  - The task pane's stats read as one flat string: "Homework Normal In progress … Start Oct 28 18:26 Due Nov 4…".
- **Where:** Settings, Now filter, task pane.
  - Files: `src/ui/segmented.tsx:17`, `src/features/now/project-chips.tsx:24`, `src/features/task/task-summary.tsx:62-65`.
- **Sources:** 08-020
- **Cite:** WCAG 1.3.1, 4.1.2.
- **Shots:** `R08/sweep/desktop-light_task_open.yml`
- **Fix:** labelled groups, and stats as label/value pairs.

**F-A11Y-14 · minor — Toast semantics**
- **What:** the toast has `role="alert"` combined with `aria-live="polite"`. Its message is a tabbable `div tabindex=0` with no role or name, and pressing it dismisses the toast.
- **Where:** toast.
  - Files: `src/ui/toast.tsx:122-123,132`.
- **Sources:** 08-022
- **Cite:** WCAG 4.1.2.
- **Shots:** `R08/env/overlay-desktop-light-toast.png`
- **Fix:** `role="status"`, a labelled Dismiss button, and a message that is not focusable.

**F-A11Y-15 · minor — Visible field labels are not `<label>` elements**
- **What:** the label is a Text, rendered as a div. Clicking "Название" or "Описание" does not focus the field, and the field's name comes only from a duplicated `aria-label`.
- **Where:** task form, Settings · desktop web.
  - Files: `src/ui/text-field.tsx:26`.
- **Sources:** 03-028
- **Cite:** Web Interface Guidelines › Forms ("labels clickable").
- **Shots:** —
- **Fix:** a web `<label>` bound to the input.

**F-A11Y-16 · minor — The progress slider says "3" where the screen says 30 %**
- **What:**
  - The slider is named "Progress, percent done", but its range is 0–10 and it has no `aria-valuetext`, so a screen reader says "3" while the screen shows "30%".
  - The thumb is 26 px in WebKit and 22 px in Firefox.
  - The thumb has no hover or pressed state.
- **Where:** task progress · web.
  - Files: `src/ui/slider.web.tsx:22-39`, `src/features/task/work-progress.tsx:10,68-74`, `global.css:102-118`.
- **Sources:** 03-018
- **Cite:** WCAG 4.1.2, 1.3.1.
- **Shots:** —
- **Fix:** `aria-valuetext` from the same formatter as the screen, an equal thumb size in both engines, and thumb states.

**F-A11Y-17 · minor — The composer placeholder is clipped at 320 px**
- **What:** at 320×568, "Add a task or paste text" wraps inside the one-line box and is cut off. The Russian «Добавьте задачу или текст» is clipped the same way (05-009).
- **Where:** Now composer · 320 px wide.
  - Files: `src/features/now/composer/quick-line.tsx:150-184`.
- **Sources:** 08-027
- **Cite:** WCAG 1.4.10.
- **Shots:** `R08/env/reflow320_.png`
- **Fix:** a shorter placeholder at narrow widths, or a line that can grow.

**F-A11Y-18 · minor — An empty Inbox renders an empty list**
- **What:** an empty Inbox or Review renders a `<ul>` with no `listitem` (axe `aria-required-children`).
- **Where:** `src/screens/inbox-screen.tsx`.
- **Sources:** 08-021
- **Cite:** WCAG 1.3.1.
- **Shots:** `R08/sweep/desktop-light_inbox.png`
- **Fix:** render the list only when it has items.

**F-A11Y-19 · nit — Decorative icons are not hidden**
- **What:** the accessibility trees hold 448 unnamed `img` nodes, 60 of them outside a named control (the sidebar logo, the back-glyph rows). None of the visible SVGs carries `aria-hidden`.
- **Where:** lucide icons, `src/ui/logo.tsx:10`.
- **Sources:** 03-021, 08-029
- **Cite:** WCAG 1.1.1; Web Interface Guidelines › Accessibility.
- **Shots:** `R08/sweep/phone-light_week.yml`
- **Fix:** a kit Icon hidden by default, with an opt-in label.

**F-A11Y-20 · nit — Russian content is read with an English voice**
- **What:** the document is `lang="en"` while task titles are Russian, when the UI is in English.
- **Where:** task and project text.
- **Sources:** 08-030
- **Cite:** WCAG 3.1.2 (user content is partly exempt).
- **Shots:** `R08/sweep/desktop-light_.png`
- **Fix:** optionally, set `lang` per text node by detecting the script.

### What this says about the system (accessibility)
- **Accessibility is enforced only where a tool already looks.** axe is clean on 84 page states and 16 overlay states. Every failure here is one axe and `contrast.test.ts` cannot see: focus, zoom with fixed chrome, timing, titles, hotkeys, heading levels, composited contrast and live regions. Each class needs an assertion (focus sweep, zoom check, titles and headings, reduced-motion run, native-preset target sizes), not a checklist line.
- **The kit has no state layer.** Focus, selection, hover and pressed are decided per component, so focus is either removed or left to the browser. The kit needs one state model (rest, hover, pressed, focus-visible, selected, disabled) with tokens that carry contrast guarantees and a forced-colours mapping.
- **Semantics are mapped one-to-one from React Native roles, without the web's extra structure.** `header` becomes h1, navigation is a `tab`, labels on views without a role are dropped, and there is no `main` and no title. A thin web-semantics layer in the kit fixes every screen at once.
- **Focus succession is a known class that was not swept.** Bug-lessons class 5 already prescribes `useConfirmFocus()`; Delete, New project and the inline confirmations missed it.
- **Timing and recovery are tied to a toast.** Recovery from destructive actions lives in a 5–10 s toast far from its cause.

---

## 8. Copy

**F-CPY-01 · major — The update banner went back to "We changed a few things"**
- **What:**
  - The banner is a full-width strip reading "We changed a few things. Refresh to see them." with a "Refresh" button.
  - The owner rejected exactly this copy and this strip in feedback-3, and in feedback-4 asked for a narrow card with only "refresh page".
  - The stage-8 plan (line 56) specified "A new version of Pace" with [Refresh page].
  - PR #42 (`0cea8a9`) brought the old copy back.
  - The English is first person, and the Russian has no final period.
- **Where:** web update banner · all web.
  - Files: `packages/core/src/i18n/en/shell.ts:189`, `ru/shell.ts:190`, `src/platform/update-banner.web.tsx:80-115`.
- **Sources:** 07-002
- **Cite:** docs/qa.md › Copy ("never vague"); PRODUCT.md › Voice; Web Interface Guidelines › Content & Copy (second person).
- **Shots:** code only; triggering the banner needs a new service-worker version.
- **Fix:** the agreed compact card with its copy, pinned by a test.

**F-CPY-02 · major — After Approve, the toast says only "Done"**
- **What:** when the assistant creates a task, starts an activity or logs 07:30–08:30, the toast reads only "Done · Undo". "Done" is also the task-completion button, so the toast reads as if a task was closed. Its placement is covered in F-CMP-12.
- **Where:** composer and time-bar approvals · desktop + phone · EN/RU.
  - Files: `packages/core/src/i18n/en/input.ts:212` (`"assistant.approved": "Done"`), `ru/input.ts:215`.
- **Sources:** 07-004
- **Cite:** docs/qa.md › Copy ("say what happened"); HIG feedback; bug-lessons class 45.
- **Shots:** `R7/s1-desktop-light-en-3afterEnter.png`, `R7/s2-desktop-light-en-14past-preview.png`
- **Fix:** name the result: "Task created: …", "Started «…»", "Logged 07:30–08:30".

**F-CPY-03 · major — In Russian, «Отменить» means both Undo and "cancel the task"**
- **What:** after a check-off the toast reads «Готово: … · Отменить». Meanwhile `task.giveUp` is «Отменить или пропустить задачу…», the outcome is «Отменена», and Cancel is «Отмена». One session shows four forms of the word with three meanings.
- **Where:** Undo toast, task actions · phone + desktop · RU.
  - Files: `packages/core/src/i18n/ru/shell.ts:177` (`common.undo`), `ru/board.ts:50,117`.
- **Sources:** 07-005
- **Cite:** ISO 9241-110 (conformity with expectations); docs/qa.md › Copy; bug-lessons class 45.
- **Shots:** `BL/states/now-check-toast--phone-light-ru.png`
- **Fix:** Undo becomes «Вернуть» (or «Отменить действие»), Cancel stays «Отмена», and the outcome becomes «Отменить задачу».

**F-CPY-04 · minor (05-029 nit) — Numbers and units are formatted by hand**
- **What:**
  - Russian durations such as "23 ч 58 м" join number and unit with a breaking space (U+0020); the Russian catalog contains no non-breaking spaces at all.
  - «м» for minutes reads as metres; the standard abbreviation is «мин».
  - Plain spaces precede the catalog's 26 em dashes, and appear in «5 минут» and «2,5 ч».
  - Insights shows "3.3" and "0.0" in Russian, because it uses `toFixed(1)`.
  - Counts use `String(count)`, so 1 284 reads "1284".
  - `formatDuration` never rolls up past hours ("Оценка 168 ч"), while `formatLeft` does.
- **Where:** all durations, Insights, group counts · worst in RU.
  - Files: `packages/core/src/i18n/i18n.ts:82,101-111`, `packages/client/src/view-models/insights-text.ts:41`, `src/shared/task-list.tsx:226`.
- **Sources:** 03-014, 05-016, 05-021, 05-029
- **Cite:** Web Interface Guidelines › Typography (non-breaking spaces); Russian typesetting; break-ui CATALOG › Numbers.
- **Shots:** `BL/states/now-calendar-tooltip--desktop-light-ru.png`, `SCR/review-05/shots/one/insights--phone-light.png`
- **Fix:** `Intl` for numbers, one formatter that owns non-breaking spaces and units, and an i18n test that rejects `\d [а-я]`.

**F-CPY-05 · minor — The English catalog names one action two ways**
- **What:**
  - The session button says "Revoke", but its confirmation says "End this session?"; Russian uses «Завершить» throughout.
  - "Sign in" appears 6 times and "Log in" twice, opposite "Log out".
  - The notification channel is "App" in the English settings matrix, "Phone app" in the sessions list, and «Телефон» in Russian.
- **Where:** English catalog.
  - Files: `en/sessions.ts:5,14,16,18`, `en/shell.ts:39,47,55,155`, `en/notify.ts:33` vs `ru/notify.ts:35`.
- **Sources:** 07-021
- **Cite:** docs/qa.md › Copy; Material › Writing (consistent terminology).
- **Shots:** `BL/routes/settings--desktop-light-ru.png`, `R7/aria-desktop_settings.png`
- **Fix:** a glossary in the i18n folder plus a lint over the catalogs.

**F-CPY-06 · minor — "Now" has three meanings**
- **What:** "Now" names the Now screen, the close sheet's time chip, and History's jump button. Russian «Сейчас» has the same three meanings.
- **Where:** `en/shell.ts:11`, `en/board.ts:51`, `en/library.ts:17`.
- **Sources:** 07-022
- **Cite:** docs/qa.md › Copy.
- **Shots:** `R7/s3-desktop-light-en-history-prev.png`, `BL/states/task-close-as--desktop-light-ru.png`
- **Fix:** History uses Back to today, and the chip becomes "Just now" / «Только что».

**F-CPY-07 · nit — Typographic conventions**
- **What:**
  - "Loading devices" and the placeholders have no trailing "…".
  - The English catalog has 21 straight apostrophes.
  - Desktop buttons that open a dialog ("Add a computer", "Connect an AI app", "Wipe data", "Delete account") have no trailing ellipsis.
- **Where:** EN and RU catalogs.
  - Files: `packages/core/src/i18n/en/sessions.ts:6`.
- **Sources:** 03-025, 02-039
- **Cite:** Web Interface Guidelines › Typography; HIG buttons › Desktop › Push buttons (trailing ellipsis).
- **Shots:** `BL/scroll/settings-2--desktop-light-en.png`
- **Fix:** catalog edits, plus a catalog test.

### What this says about the system (copy)
- **Copy has no regression guard.** The owner's corrections came back or went stale because nothing pins them: "We changed a few things", the short Calendar hint, and Settings → Devices. Banned phrases and agreed strings need a catalog test.
- **There is no glossary.** Synonyms sit inside one catalog (Revoke/End, Sign in/Log in), and homonyms span catalogs (Done, Now, Отменить). Bug-lessons class 45 guards only `common.cancel` and `common.undo`.
- **Feedback copy describes the mechanism, not the result.** "Done", "We changed a few things". Copy should say what happened and what to do (PRODUCT.md › Voice).
- **Locale typography is hand-typed.** Number formats, units, non-breaking spaces and ellipses need one formatter and catalog rules, guarded the way `contrast.test.ts` guards colour.

---

## 9. Identity

**F-IDN-01 · major (narrative, no numbered id) — With the logo covered, nothing says Pace**
- **What:**
  - Dark `#0b0b0c` with an acid-lime `#d4ff3a` is, almost verbatim, one of the templated generated looks the apple-design skill names.
  - Around it sits a generic component kit:
    - rounded hairline cards on a grey page;
    - 22 % washed pill tags;
    - 2 px outlined chips;
    - an 11 px uppercase eyebrow over a 30 px title;
    - a second, "SaaS" indigo;
    - lucide icons at mixed strokes;
    - a dust dissolve as the one flourish.
  - The product's own objects are the smallest things on screen: the running timer, the shape of the day, the check, and the chevrons-and-dot mark.
  - The event-sourced core has no visual expression beyond rows of "Undo" buttons.
- **Where:** the whole product · all combos.
- **Sources:** narrative only — 01 › Design Specificity Verdict and its Identity note; 02 › Make this look less generic.
- **Cite:** apple-design craft lens ("make it less generic"); impeccable operate.md › Directions (the world lends type, palette and one signature move; navigation stays standard); PRODUCT.md › Brand Commitments.
- **Shots:** `BL/routes/now--desktop-dark-en.png`, `BL/routes/history--desktop-light-ru.png`
- **Fix:** choose signature elements from the product itself — time as a measured line, the mark's dot as "now", an "as of" timestamp style, proposals that look like drafts — and keep navigation and controls standard.

**F-IDN-02 · minor — Day's timeline does not encode time**
- **What:** a 15 h 20 m "not logged" gap and a 1 h block are rows of the same height (`min-h-14`). Week draws the same data proportionally.
- **Where:** Day · all.
  - Files: `src/features/day/day-screen.tsx:58,159-184`.
- **Sources:** 02-024
- **Cite:** apple-design craft lens ("does structure encode information?"); HIG layout › Visual hierarchy.
- **Shots:** `BL/routes/day--desktop-light-en.png`, `BL/routes/day--phone-dark-ru.png`
- **Fix:** a proportional day rail beside the editable rows.

**F-IDN-03 · minor — A draft does not look like a draft**
- **What:** the assistant's pending state is a spinner inside the send button in the composer, but a caption «Ассистент разбирает текст…» above the field in the time bar. The owner asked for the time-bar draft to show the text in an outline (feedback-3). Proposals appear as a lime card, not as a draft.
- **Where:** composer, time bar.
  - Files: `src/features/now/composer/quick-line.tsx`, `src/shared/tracking/time-bar.tsx`.
- **Sources:** 07-018
- **Cite:** PRODUCT principles 3 ("a draft looks like a draft") and 5 ("proposals read as proposals"); docs/qa.md › State you can see.
- **Shots:** `R7/s4-desktop-light-ru-time-pending.png`, `R7/s4-phone-light-ru-composer-pending.png`
- **Fix:** one draft/pending treatment, used on Now, in Inbox and in the time bar.

### What this says about the system (identity)
- **Signature elements were never chosen**, so the product's own objects render as generic tags and rows, and the whole reads as a template.
- **Boldness is spent in the wrong place.** Lime goes on routine controls and the one flourish sits on the most frequent action, while the running activity and the day's shape are drawn at 11–13 px.
- **The deepest product ideas have no visual language.** Event sourcing ("as of 18:20", undo anything), one log for tasks and time, and "proposals read as proposals" each need one recognisable, repeated device.
- **Identity can live inside the brief.** Inter only, the owner's green, and standard platform navigation all leave room for type rhythm, numeric styling, one "now" mark and a calm palette with a budget.

---

## 10. Platform (Android)

**F-AND-01 · major — NativeWind compiles rem at 14 px, so every Android target is 12.5 % small**
- **What:**
  - NativeWind's `inlineRem` default of 14 is not overridden, so every rem-based size shrinks:

    | Class | What uses it | Android size |
    |---|---|---|
    | `h-11` | 20 pressables, 16 `min-h-11`, every IconButton, Chip, CheckCircle and back button | 38.5 dp |
    | `min-h-12` | Button, tab-bar tabs | 42 dp |
    | — | calendar day | 35 dp |
    | `h-9` | composer icon buttons (39.5 dp with their +4 hitSlop) | 31.5 dp |

  - Only the time-bar buttons (`h-14`, 49 dp), list links (`min-h-14`) and subtask rows (52 px) reach 48 dp: 6 of 63 pressables.
  - CheckCircle's `-m-[11px]` no longer cancels its box, so rows shift by 5.5 dp.
  - `pl-[116px]` assumes the web value of `gap-3`.
  - Text-to-box ratios differ per platform, so the web screenshots misrepresent the phone.
  - All of this is computed from code and unverified on a device.
- **Where:** Android, every screen.
  - Files: `metro.config.js:51-54`; `src/ui/icon-button.tsx:35`, `src/ui/chip.tsx:59`, `src/ui/check-circle.tsx:28`, `src/ui/button.tsx:203`, `src/ui/tab-bar.tsx:59`, `src/ui/calendar.tsx:65`, `src/shared/task-fields/subtask-list.tsx:63,104`.
  - Inventory §0, §4.1, §8.
- **Sources:** 01-037, 08-014
- **Cite:** android.md › Touch targets (48×48 dp); Material 3 › Accessibility; HIG accessibility (44 pt); PRODUCT.md › Accessibility (48 dp on Android).
- **Shots:** `BL/routes/now--phone-light-en.png` (web, for the layout only)
- **Fix:** one unit system in px/dp (`inlineRem: 16` or dp tokens), plus a native-preset jest test of minimum sizes.

**F-AND-02 · major (02 major; 01 minor) — The navigation bar is hand-drawn, not Material**
- **What:**
  - Selection is shown only by an indigo icon and label plus a weight change from 400 to 500.
  - The outlined glyphs stay outlined when selected.
  - There is no active-indicator pill.
  - Labels are 11 px, tabs are `min-h-12` (42 dp), and there is no ripple.
- **Where:** tab bar · Android (and phone web) · both themes · EN/RU.
  - Files: `src/ui/tab-bar.tsx:62-80,119-145`.
- **Sources:** 02-022, 01-040
- **Cite:** HIG tab-bars › Best practices ("prefer filled symbols"); HIG accessibility › Vision (more than colour alone); Material 3 navigation bar (active indicator); android.md › Components & motion.
- **Shots:** `BL/routes/more--phone-light-en.png`, `BL/routes/now--phone-dark-ru.png`
- **Fix:** Material 3 navigation-bar geometry: an indicator pill, a filled active icon, tabs of 48 dp or more.

**F-AND-03 · major (02-001, 01-002 major; 02-002, 07-031 minor; reviewers disagree on the IA) — Destinations reached from More lose the tab bar; Calendar vs Week**
- **What:**
  - Week, Projects, Insights, History, Settings and Notifications live outside `app/(tabs)/`, which holds only index, day, inbox, more and add.
  - So opening one of them from More pushes a full-screen route with no tab bar: five of the eight sidebar destinations show no "where am I".
  - 01-002 and 02-002 asked for a fifth "Calendar" tab, following the PRODUCT.md of the time.
  - 07-031 showed that the owner reverted to Week under More (`context/stage-8/ledger.md:96,98`). PRODUCT.md › Operating Context now records four tabs: Now · Day · Inbox · More.
  - The 5-tab direction is therefore void, and the IA stays.
  - Residue: comments in `tab-bar.tsx:85,149` still say Calendar.
- **Where:** phone tab bar and More · phone (Android + web).
  - Files: `app/(tabs)/_layout.tsx:21-26`, `app/week.tsx`, `app/projects.tsx`, `app/insights.tsx`, `app/history.tsx`, `app/settings.tsx`, `src/ui/tab-bar.tsx:85-92,149`.
- **Sources:** 02-001, 01-002, 02-002, 07-031
- **Cite:** HIG tab-bars › Best practices ("make sure the tab bar is visible when people navigate"); Material navigation bar (hide only on detail screens); PRODUCT.md › Operating Context (the IA is fixed for the redesign).
- **Shots:** `BL/routes/week--phone-light-ru.png`, `BL/routes/projects--phone-dark-en.png`, `BL/routes/more--phone-dark-ru.png`
- **Fix:** keep the owner's IA, but nest More's destinations in the More stack so the bar stays; hide it only on detail screens and full-screen forms.

**F-AND-04 · major — There is no keyboard layout, so fields sit under the soft keyboard**
- **What:**
  - The viewport meta has no `interactive-widget`, and the app has no `KeyboardAvoidingView` or keyboard listener anywhere.
  - **Default Chrome mode:**
    - the time-bar field sits at y 659–703, under a keyboard of about 330 px (keyboard top ≈ 514);
    - the header pans away;
    - the AI preview card is cramped.
  - **Emulated `resizes-content` mode:** the 67 px tab bar rides above the keyboard and Now's list shrinks to 48 px.
  - **Expo SDK 57, edge-to-edge:** Android stops applying adjustResize, so bottom-pinned fields are probably covered on native too (unverified).
  - The page has no Apple status-bar metas.
- **Where:** time-bar field, composer, sheet search and time fields · phone (Chrome tab, PWA, Expo app).
  - Files: `public/index.html:5`, `src/ui/screen.tsx:46-55`, `src/ui/tab-bar.tsx:93-98`, `src/ui/sheet.tsx`, `activity-sheet.tsx:92,110`, `change-server-sheet.tsx:137`.
- **Sources:** 06-004, 03-024, 01-N2
- **Cite:** mobile-native Baseline (`interactive-widget=resizes-content`), §11 ("test with the keyboard open"); HIG keyboards ("make sure the field stays visible"); Material navigation bar (hidden while typing); audit.native.md › Adaptivity.
- **Shots:** `SCR/review-06/kbd-timebar-focused-844--phone-light-ru.png`, `SCR/review-06/kbd-timebar-resizes-content-514--phone-light-ru.png`
- **Fix:** a defined keyboard-up layout for both web and native: what folds, the tab bar hides, the focused field and its preview stay.

**F-AND-05 · minor — Fixed-height text boxes will clip under font scaling (unverified)**
- **What:**
  - Text scales with the system font size, correctly: there is no `maxFontSizeMultiplier` anywhere. But containers have fixed heights, so the text outgrows them:
    - time-bar buttons are `h-14` with `leading-[14px]` and `numberOfLines={1}`;
    - fields are `h-11` (38.5 dp), so 15 px text becomes 19.5 px at 1.3×;
    - chips are `h-8` (28 dp) with 12 px text;
    - the subtask input is `h-9`;
    - the badge is `h-[18px]`;
    - tags use `leading-4`;
    - tab labels are fixed too.
  - The web emulation at 1.3× was clean, but only because web rem is 16.
- **Where:** Android.
  - Files: `src/shared/tracking/time-bar.tsx:160-167,176`, `src/ui/text-field.tsx:29`, `src/ui/chip.tsx:63-66`, `src/shared/task-fields/subtask-list.tsx:125`, `src/ui/count-badge.tsx:10`, `src/ui/color.tsx:101`.
- **Sources:** 02-030, 08-026, 01-N1
- **Cite:** WCAG 1.4.4; HIG typography › Supporting Dynamic Type; HIG layout › Adaptability; Material › Accessibility (text scaling); audit.native.md › Accessibility ("Text scaling").
- **Shots:** `R08/env/font130_.png` (web emulation)
- **Fix:** minimum heights instead of fixed heights, no fixed leading on single-line labels, and an emulator check at 1.3× and 2.0×.

**F-AND-06 · minor — No haptics anywhere**
- **What:** `expo-haptics` is not a dependency. Check-off, starting and stopping an activity, and destructive confirmations give no tactile confirmation, although PRODUCT.md › Platform lists haptics.
- **Where:** Android, app-wide.
- **Sources:** 02-020
- **Cite:** HIG playing-haptics › Best practices; Material haptics; PRODUCT.md › Platform.
- **Shots:** —
- **Fix:** three haptic meanings (confirm, selection, warning) that respect the system setting.

**F-AND-07 · nit — Dynamic Color is not decided**
- **What:** nothing records whether Pace uses a static or a dynamic colour scheme; Pace has a brand palette.
- **Where:** Android theming.
- **Sources:** 01-N3
- **Cite:** android.md › Color & theming ("Dynamic Color … with a static fallback").
- **Shots:** —
- **Fix:** the spec states the decision explicitly (for example, "static brand scheme, no Material You").

### What this says about the system (Android)
- **The web build stands in for Android.** Rem = 14 px, no ripple, no haptics, a decorative grab handle, outlined tab icons, no keyboard avoidance. Material affordances were never specified, so nothing failed a test (bug-lessons classes 10 and 11). The spec needs an Android column for each component.
- **Two unit systems make Android a different design.** Px type in rem boxes gives the same screen different ratios on the phone, and the web screenshots everyone reviews do not show it.
- **The kit has no platform layer.** Pressing, sheets, navigation and focus are one implementation, so web behaviour leaks onto Android and touch-only behaviour leaks onto the desktop web.
- **Device-only states are never exercised.** Font scale, keyboard, predictive back, edge-to-edge insets and haptics are all unverified; emulation was the bar. Before a release, QA needs a real-phone pass (see "Verify on hardware").

---

## 11. Data at scale / robustness

**F-DAT-01 · blocker — The submit button lists every solved subtask**
- **What:**
  - The button label is built from data: `t("task.submitSubtasks", {subtasks: joinList(every solved subtask)})`.
  - With 37 solved subtasks it reads «Сдать 100, 101, … 135 и 136» and grows to 20 lines.
  - At 390×844 the footer takes half the screen, and the task body scrolls in a band of about 380 px.
  - At 320×568 the button fills the viewport and the body is 0 px tall: the title, stats and subtasks cannot be reached.
  - On desktop the label wraps to 4 lines.
- **Where:** task detail footer · phone at 390 and 320 px, desktop · both themes · RU/EN.
  - Files: `src/features/task/use-submit-title.ts:9-17`, `src/features/task/task-footer.tsx:70-84`.
- **Sources:** 05-001
- **Cite:** WCAG 1.4.10 Reflow; HIG buttons ("keep labels succinct"); break-ui "long label overflows".
- **Shots:** `SCR/review-05/shots/worst-ru/taskBig--phone-light.png`, `SCR/review-05/shots/worst-ru/taskBig--small-light.png`, `SCR/review-05/shots/deep/taskBig-desktop-light-s2.png`
- **Fix:** a count instead of a list beyond about three names, a one-line label, and the full list in the accessibility hint and the submit sheet.

**F-DAT-02 · blocker (05-002 blocker; 05-003, 05-004, 05-006 major) — Text in a flex row never shrinks: tags, labels and chips run past their boxes and under controls**
- **What:**
  - React Native and React Native Web give every View `flexShrink: 0`. `ColorTag`, `Chip`, the header's project button and the running-row tag set `numberOfLines={1}`, but no ancestor bounds their width, so the ellipsis never fires.
  - A 78-character project tag runs straight through the card edge on Now, History and the preset preview.
  - On the task screen, a 70-character preset tag widens the document: `scrollWidth` is 738 at a 390 px viewport, so the whole screen scrolls sideways.
  - An 80-character activity label runs under Stop.
  - A long project name runs under the edit, pause, cancel and delete icons, and off the screen.
  - One 78-character project makes a filter chip about 900 px wide.
  - On desktop the 559 px chip strip has a `scrollWidth` of 3354, a hidden scrollbar and no fade or arrow, and the vertical wheel does not scroll it. 10 of the 12 filters cannot be reached with a mouse.
- **Where:** Now, History, project page, preset preview, task detail and header, running row, Now filter · all viewports · both themes · RU/EN.
  - Files: `src/ui/color.tsx:96-106`, `src/shared/tracking/running-row.tsx:21-23,47-48`, `src/features/task/task-header.tsx:114-131`, `src/ui/back-header.tsx:43`, `src/features/now/project-chips.tsx:23-27`, `src/ui/chip.tsx:374-382`.
- **Sources:** 05-002, 05-003, 05-004, 05-006
- **Cite:** WCAG 1.4.10 (scrolling in two directions); HIG layout ("don't let content collide with controls"); HIG scroll views ("make it clear there's more content"); break-ui signatures; bug-lessons classes 5, 6, 10.
- **Shots:** `SCR/review-05/shots/worst-ru/now--phone-light.png`, `SCR/review-05/shots/worst-ru/task300--phone-light.png`, `SCR/review-05/shots/worst-ru/taskBig--desktop-dark.png`, `SCR/review-05/shots/worst-ru/now--desktop-light.png`
- **Fix:**
  - One kit text-line primitive that is `min-w-0 shrink` by construction, truncates at the end or middle, and sets `title` on the web.
  - Chips capped in width; controls never shrink.
  - The wheel mapped to horizontal scroll, or chips wrapped with a "more" control.

**F-DAT-03 · major (05 major; 01 minor) — No list is virtualised**
- **What:**
  - The app uses 0 FlatList or FlashList; every screen maps its rows inside a ScrollView.
  - With 1 284 open tasks, expanding a group ("Развернуть") mounts:
    - 1 053 rows and 16 690 DOM nodes on the phone;
    - 1 174 rows and 18 636 nodes on desktop;
    - in 4.1–5.1 s.
  - Each row is an Animated.View with enter, exit and layout transitions.
  - Scrolling afterwards has a p95 frame of 133 ms, with 35 frames over 50 ms, on a desktop CPU without throttling.
  - History, Notifications, the Assistant log and presets work the same way.
- **Where:** Now, project page, History, Notifications, Decisions, Inbox · phone, desktop and Android.
  - Files: `src/ui/screen.tsx:38`, `src/shared/task-list.tsx:155-191`, `src/ui/row-list.tsx`.
- **Sources:** 05-007, 01-039
- **Cite:** break-ui ("1 000+ items unpaginated → virtualize or paginate"); audit.native.md › Performance ("Unvirtualized lists"); HIG performance.
- **Shots:** `SCR/review-05/shots/deep/huge-now-expanded-phone.png`, `SCR/review-05/shots/deep/perf.json`
- **Fix:** virtualised lists, layout animation off above about 50 rows, and paging inside folds.

**F-DAT-04 · major (05 major; 03 nit) — The UI starts in English and then flips to Russian**
- **What:**
  - The static `lang="en"` and English strings render before settings load.
  - On a small Russian account, the screen paints "History" and "Nov 1, 18:29" for about 250 ms.
  - On a 1 297-event account, the UI is still English at 1.5 s and at 3 s ("Now", "With a deadline", "Expand"), while the badge counts 34 → 94 → 99+.
  - It flips to «Сейчас» at 5 s, and the whole screen reflows because Russian runs 15–40 % longer.
- **Where:** first load and first sync · phone + desktop web · Russian account.
  - Files: `src/app-state.tsx:253-` (`useLanguage` / `LanguageReadyContext`), `public/index.html:2`, `src/platform/document-language.web.tsx:6-11`.
- **Sources:** 05-008, 03-022
- **Cite:** WCAG 3.1.1 Language of Page; HIG loading ("don't make it jump"); Web Interface Guidelines › Locale & i18n; bug-lessons class 22.
- **Shots:** `SCR/review-05/shots/deep/huge-firstsync-1500.png`, `SCR/review-05/shots/deep/huge-firstsync-5000.png`, `SCR/review-03/mismatch-oslight-appdark-t2.png`
- **Fix:** first paint in the cached or account language (settings first, or a skeleton until they arrive); hold the badge until the first full pull.

**F-DAT-05 · major — The Week grid stacks short blocks into unreadable piles**
- **What:**
  - Lanes are computed from real start and end times (`lanesOf`), but every block is drawn at least 24 px tall (`MIN_TARGET_PX`).
  - At 21–28 px per hour, consecutive 20–30 minute blocks overlap by 10–15 px.
  - Five of them stack into one pile: only the top block can be tapped, and the labels print over each other.
- **Where:** Week · phone + desktop · both themes.
  - Files: `src/features/week/week-grid.tsx:52,163-186`, `packages/client/src/view-models/week.ts:118`.
- **Sources:** 05-005
- **Cite:** HIG charts (marks must stay distinguishable); HIG accessibility (44 pt targets); break-ui (overlap).
- **Shots:** `SCR/review-05/shots/worst-ru/week--phone-light.png`, `SCR/review-05/shots/worst-ru/week--desktop-dark.png`
- **Fix:** compute lanes on the drawn rectangles, or fold a run of short blocks into one "+N" block.

**F-DAT-06 · major (05-010, 05-011 major; 05-020 minor; 05-028 nit) — Text from data is never clamped**
- **What:**
  - An Inbox capture renders whole: a 1 500-character paste makes one card more than two screens tall.
  - All 120 cards render at once, each with two full-width buttons, and there is no bulk action.
  - The task link prints the full URL with ↗: 2 000 characters take 12 lines on the phone and 17 on desktop, with the host buried.
  - A 4 000-character description renders in full, so the subtasks start about 2 600 px down.
  - Subtask rows centre the check and the number against a 7-line label, giving rows from 52 to 190 px.
- **Where:** Inbox, task detail · phone + desktop · both themes.
  - Files: `src/screens/inbox-card.tsx:42`, `src/features/task/task-summary.tsx:177-186`, `src/features/task/task-description.tsx:115-123`, `src/features/task/subtask-checklist.tsx:54`.
- **Sources:** 05-010, 05-011, 05-020, 05-028
- **Cite:** break-ui (clamp multi-line previews; truncate URLs in the middle); HIG lists ("keep rows scannable").
- **Shots:** `SCR/review-05/shots/worst-ru/inbox--phone-light.png`, `SCR/review-05/shots/worst-ru/taskBig--phone-light.png`
- **Fix:** a declared length policy for each text slot: clamp with "show all", a middle-truncated host, top-aligned wrapping.

**F-DAT-07 · major — Truncated values cannot be read anywhere on the web**
- **What:**
  - `numberOfLines` is used in 26 places, and no element on any screen has a `title`.
  - Values that are cut and cannot be read anywhere else:
    - the task-row title (clamped at 2 lines);
    - the Day row label (cut at about 13 characters on the phone);
    - the sidebar owner name and the session name;
    - the Insights project name and the "В срок" project name;
    - the Week block label.
- **Where:** all screens · web · systemic.
- **Sources:** 05-012
- **Cite:** break-ui ("truncated text with no way to read it"); Web Interface Guidelines (truncated text needs a `title` or tooltip); WCAG 1.3.1.
- **Shots:** `SCR/review-05/shots/worst-ru/day--phone-light.png`, `SCR/review-05/shots/deep/insights-phone-dark-s1.png`
- **Fix:** the truncating text primitive sets `title` on the web and keeps the full value in the accessibility label; rows that truncate open a detail view.

**F-DAT-08 · major (05-013 major; 05-031 nit) — Avatar initials split an emoji into a broken glyph**
- **What:** initials come from `part.slice(0, 1)`, which takes one UTF-16 code unit. For an emoji-first name like "🦊 Лиса", the avatar shows a lone surrogate `\ud83e` (a broken glyph) next to "Л" (code points `d83e 41b`). A hyphenated name takes its first two words ("АК").
- **Where:** sidebar and More avatar · all.
  - Files: `src/shared/user-avatar.tsx:11-16`.
- **Sources:** 05-013, 05-031
- **Cite:** break-ui CATALOG › People (emoji first).
- **Shots:** `SCR/review-05/shots/deep/emoji-name-sidebar.png`
- **Fix:** initials from grapheme clusters, letters only, with the person icon as fallback.

**F-DAT-09 · minor — Input limits disagree with each other and with the schema**
- **What:** events accept an unbounded title, project, preset, description, link, subtasks and close reason. The assistant caps them, but the UI caps only the description (4 000) and the activity sheet (80). The time bar's "What are you doing?" field allows 200 characters against `ACTIVITY_LABEL_MAX = 80`.
- **Where:** data layer, forms.
  - Files: `src/shared/tracking/time-bar.tsx:85` vs `packages/core/src/events/payloads.ts:278`.
- **Sources:** 05-022
- **Cite:** break-ui Phase 1 (data limits).
- **Shots:** —
- **Fix:** one `LIMITS` table in core, used by event payloads, `maxLength` and the assistant.

**F-DAT-10 · minor — The "99+" badge covers the Inbox icon**
- **What:** the badge is anchored at `absolute -right-3 -top-1.5`, so "99+" grows leftward over the icon.
- **Where:** tab bar · phone · both themes.
  - Files: `src/ui/tab-bar.tsx:66`.
- **Sources:** 05-018
- **Cite:** bug-lessons class 6.
- **Shots:** `SCR/review-05/shots/worst-ru/day--phone-light.png`
- **Fix:** anchor the badge so it grows away from the icon.

**F-DAT-11 · minor (05-030 nit) — The identifying end of a name is cut off**
- **What:**
  - An 80-character device name shows as "MacBook Pro (16-inch,…", cutting the part that tells two laptops apart.
  - In the server picker, a tailnet host wraps into 2–3 centred lines and orphans "· Сменить".
  - The instance `name` is controlled by the server and unbounded.
- **Where:** Settings sessions (phone), server picker (Android).
  - Files: `src/features/sessions/session-row.tsx:65`, `src/features/server/server-line.tsx:28-32`, `incompatible-screen.tsx:37-39`, `api/schemas/instance.ts:14`.
- **Sources:** 05-025, 05-030
- **Cite:** break-ui (middle truncation for identifiers).
- **Shots:** `SCR/review-05/shots/deep/settings-phone-dark-s1.png`
- **Fix:** wrap to 2 lines or truncate in the middle; the host on its own line, with "Сменить" as its own button.

**F-DAT-12 · nit — Two requests fire twice on every Now load**
- **What:** `GET /api/calendar?…` and `GET /api/notifications?limit=50` each fire twice on every load of Now (Playwright request log).
- **Where:** Now · web.
- **Sources:** 07-033
- **Cite:** bug-lessons class 1 ("the network goes quiet").
- **Shots:** — (output of `r07-s4.ts`)
- **Fix:** deduplicate the hooks, and add a steady-state test that counts requests.

### What this says about the system (data at scale)
- **The kit has no rule for how text yields in a row.** React Native's `flexShrink: 0` default, plus `numberOfLines` on a Text with no bounded parent, is the root of every overflow here. One `min-w-0 shrink` text primitive, with a lint against bare `numberOfLines`, fixes the class.
- **Text from data is placed in the interface without a budget.** Button labels, links, descriptions, Inbox text, chips and badges each need a declared policy: truncate, wrap, clamp or count. Today the default is "whatever the data is".
- **Limits live in four places that disagree:** unbounded event schemas, assistant caps, two UI `maxLength`s, and a 200-vs-80 mismatch.
- **Lists and grids were built for a lived-in demo, not for volume.** There is no virtualisation, every row carries a layout animation, and Week computes lanes on the data while drawing different geometry. The spec should state the volumes: 1 284 tasks, 120 captures, 12 projects, 5 overlapping blocks.
- **Locale is applied late and formatted by hand.** The language arrives after sync, numbers go through `toFixed` and `String`, initials through `slice(0, 1)`. The spec should require `Intl`, graphemes, and a first paint in the account's language.
- **Nothing tests geometry with hostile data.** Every break here passes the current suites (bug-lessons classes 5, 6, 37). A worst-case fixture plus an e2e overflow sweep turns these instances into one guarded class.

---

## Bugs (behaviour, not just look)

These are real defects the tests missed. Classes refer to `context/bug-lessons.md`.

| # | Bug | F-id | Bug-lessons class |
|---|---|---|---|
| 1 | The submit button lists every solved subtask. With 37 it grows to 20 lines, and at 320 px the task body is 0 px tall. | F-DAT-01 | 5 (layout no unit test sees) + new class: "Text from data placed in chrome without a length policy" |
| 2 | Tags and labels never shrink. The task screen scrolls sideways (`scrollWidth` 738 > 390), the activity label runs under Stop, and the project name runs under the header icons. | F-DAT-02 | new class: "Text from data in a flex row without a shrink rule" (proposed by 05); overlaps class 6 |
| 3 | 10 of 12 project filter chips cannot be reached with a mouse: hidden scrollbar, vertical wheel ignored. | F-DAT-02 (05-006) | 10 |
| 4 | The UI shows in English for 1.5–5 s before Russian on a big account, while the badge counts 34 → 94 → 99+; about 250 ms on a small one. | F-DAT-04 | 22 |
| 5 | rem = 14 px on Android: targets are 38.5 / 42 / 31.5 dp, and CheckCircle's `-m-[11px]` shifts rows 5.5 dp. | F-AND-01 | 11 |
| 6 | Delete has no confirmation, leaves a "This task does not exist" page, drops focus to `<body>`, and offers its only recovery in a 5–10 s toast about 1 000 px away. | F-A11Y-02 | 5 (focus successor) + 21 (recovery depends on a fleeting toast) |
| 7 | New project and the inline confirmations drop focus to `<body>` and ignore Escape. | F-A11Y-08 | 5 (the rule exists; not swept) |
| 8 | The update banner copy went back to "We changed a few things" (PR #42), after the owner rejected it twice. | F-CPY-01 | new class: "Owner-corrected copy with no test pinning it" |
| 9 | The Calendar dialog points to "Settings → Devices", a screen removed in stage 8, and offers the web "Calendar from the phone". | F-COL-12 | same new class as #8 |
| 10 | An empty new-task form opens with "Give the task a title." already in red. | F-CMP-03 | 2 (tests open the form only from a typed line, which fills the title) |
| 11 | The composer unfolds with "Create" cut in half for its first frames: a variant of the stage-8 bug. | F-MOT-08 | 5 |
| 12 | Check-off: 187–238 ms from press to fill, a long task of 229 ms, an empty row until about 1 s, and the Undo last. | F-MOT-01 | 5 |
| 13 | Rows close up with a jump on the web, while Android slides; `ROW_LAYOUT` never runs on the web. | F-MOT-02 | 11 (in reverse) / 5 |
| 14 | Under reduced motion, a checked row becomes a blank hole, check included, for about 800 ms, then the rows jump. | F-MOT-03 | new class: "A timer paired with an animation instead of its completion" |
| 15 | The desktop dialog grows from scale(0), contrary to its own code comment. | F-MOT-06 | 5 |
| 16 | Sheets and dialogs vanish in one frame, although the stage-8 plan specified an exit animation. | F-MOT-05 | 5 |
| 17 | The sheet's grab handle does nothing (no drag, no swipe) on either platform. | F-CMP-02 | 10 |
| 18 | Day's previous/next crossfades two days over each other, and "Log it" overprints the gap and activity rows. | F-MOT-07 | 5 |
| 19 | Week blocks pile up: lanes are computed on the data, but blocks are drawn with a 24 px minimum height. | F-DAT-05 | 1 (one geometry decided in two places) |
| 20 | The avatar shows a lone surrogate for an emoji-first name. | F-DAT-08 | new class: "Text sliced by UTF-16 code unit" |
| 21 | The time-bar field accepts 200 characters, while the event schema allows 80. | F-DAT-09 | 1 |
| 22 | Toast offsets are hard-coded (96 / 72) while the tab bar's real height varies with insets, so the toast overlaps it with 3-button navigation. | F-CMP-12 | 6 |
| 23 | The 99+ badge covers the Inbox icon. | F-DAT-10 | 6 |
| 24 | Pull-to-refresh can reload the SPA from any list or sheet, dropping open forms and drafts. | F-WEB-06 | new class: "Browser default gesture left on (no mobile-web baseline)" |
| 25 | Refresh on the update strip reloads at once and drops unsaved composer text; there is no `beforeunload`. | F-WEB-07 | new class: "A reload path that drops unsaved drafts" |
| 26 | `theme-color`, `color-scheme` and the body background follow the OS, not the app's theme. | F-WEB-02 | 22 (same shape: the document follows the device, not the account preference) |
| 27 | The running timer is a live region, so a screen reader is interrupted every minute per running activity. | F-A11Y-10 | new class: "Live region around a ticking value" |
| 28 | `/api/calendar` and `/api/notifications` fire twice on every Now load. | F-DAT-12 | 1 |
| 29 | RU «Отменить» means both Undo and "cancel the task"; "Done" is used for both a completed task and an approved proposal. | F-CPY-03, F-CPY-02 | 45 (the guard covers `common.cancel` and `common.undo` only, not `task.giveUp` or `assistant.approved`) |
| 30 | Insights shows "3.3" in Russian, counts show "1284", and durations never pass hours ("168 ч"). | F-CPY-04 | new class: "Locale formatting by hand" |
| 31 | Fields sit under the soft keyboard (time-bar field at y 659 under a ~330 px keyboard; native has no avoidance under edge-to-edge). | F-AND-04 | 11 (device-only state never exercised; QA round 4 noted "the web build has no soft keyboard") |
| 32 | Control boundaries and states at 1.0–1.35:1: the off switch knob at 1.0:1, the selected row at 1.10:1, field edges at 1.25–1.35. | F-COL-01, F-COL-02, F-COL-09 | new class: "Contrast asserted for text tokens only, not for composited non-text states" |

---

## Owner requests not met / partly met (from 07-ux-walk)

07 checked 72 owner requests against the web build: 53 met, 12 partly met, 2 not met, and 5 that cannot be verified on the web or with the fake LLM.

**Not met (2)**

| Feedback | Request | Evidence | F-id |
|---|---|---|---|
| 3 | Update bar colour and copy | full-width strip, "We changed a few things" (`packages/core/src/i18n/en/shell.ts:189`, `src/platform/update-banner.web.tsx:80-115`); code only, since it needs a new service-worker version | F-CPY-01, F-WEB-07 |
| 4 | Update card: no Later, no detail, "refresh page", narrow | same as above; stage-8 plan line 56 specified "A new version of Pace" + [Refresh page] | F-CPY-01 |

**Partly met (12)**

| Feedback | Request | What is missing | Evidence | F-id |
|---|---|---|---|---|
| 2, T7 | Project page like a task list; Done reachable | different container and gutter; no "Open" header | `R7/aria-desktop_project_01M5YZBMFV2YTDVD6EH8TEGPWZ.png` | F-LAY-07 |
| 2, A2 | Switching ends the previous activity; parallel activities | the phone needs 4 taps; parallel only through the "Alongside" switch in pickers | `R7/s2-phone-light-en-3reopen.png`, `R7/s2-phone-light-en-4chores-again.png` | F-CMP-19 |
| 2, W2 | Device time and "where I sat" | "Apps during this · Nothing recorded" shows; no device data on the web (partly / not verifiable) | — | — |
| 2 | Remove Waiting | the header still has a Pause icon (status `paused`), `task-header.tsx:66-74` | `BL/routes/task-open--phone-dark-en.png` | F-CMP-10 |
| 3 | No "Fill in by hand"; the form expands with animation; typed text becomes the title | an empty form opens with an error | `R7/s1-desktop-light-en-4form.png`, `R7/s4-phone-unfold-strip.png` | F-CMP-03 |
| 3 | The time-bar draft is outlined while parsing | a caption instead of an outline | `R7/s4-desktop-light-ru-time-pending.png` | F-IDN-03 |
| 4 | Green on important actions and the logo, a quiet colour elsewhere | indigo for running, OS selection, switches, badges, links and the avatar, beside lime in the sidebar | `R7/logo-zoom.png` | F-COL-07, F-LAY-06 |
| 4 | Settings buttons not too wide on desktop | Settings fixed, but Projects' "New project" is 848 px | `R7/aria-desktop_projects.png` | F-CMP-06 |
| 4 | Calendar hint at once on hover or tap, and short | the desktop tooltip is right; a phone tap opens long, stale copy | `R7/s2-phone-light-en-9cal-click.png` | F-COL-12 |
| 4 | "Reset to today" only away from the current period, Day too | Day and Week are right; History keeps a disabled "Now", Insights has none | `R7/s3-desktop-light-en-history-prev.png` | F-CMP-05 |
| 4 | Day dividers consistent | met in Day, not across the app | `R7/aria-desktop_day.png` | F-LAY-05 |
| 4 | Telegram name in the sidebar | truncated to «D…» | `R7/logo-zoom.png` | F-LAY-06 |

**Met, but with a gap noted**
- Feedback 2, T8 (Focus and Done the same size): met. The header keeps an unlabelled Pause; check with the owner.
- Feedback 4, Export / Log out / Danger zone with Wipe and Delete: met, but the destructive styling is wrong (F-CMP-07).
- Feedback 4, the toast covering Rest/Sport: met on desktop, but see placement (F-CMP-12) and the "Done" copy (F-CPY-02).

**Not verifiable on the web (5)**
- Feedback 2, A4: Attend / Skip before calendar events.
- Feedback 2, A5: "From calendar" names the activity after the event (its copy is stale, F-COL-12).
- Feedback 2: dim overlay flash on sheets (not caught in frames).
- Feedback 4: exact time when the last data is more than 8 h old (no device data).
- Feedback 2, T2: pasted homework mapping (fake LLM; the UI part is met).

---

## Verify on hardware (Android)

No pass ran on a device. Use a mid-range Android 15+ phone (an older one beats a flagship). Test the Expo build, Chrome in a tab, and the installed PWA. Open the dev server by LAN IP and use `chrome://inspect`. Check both themes and RU.

1. **Unit scale.** Measure the dp size of Stop, "Yes, still", the play button, the check circle, the tab-bar tabs and a Button. Inventory §0 predicts 38.5 / 42 dp; the target is ≥ 48. Check whether rows shift about 5.5 dp around the check circle. Compare the text-to-box ratio with the web screenshot of the same screen. (F-AND-01)
2. **Font scale.** Set the system font scale to 1.3× and to maximum, plus the largest display size, in RU. Look for clipping in:
   - the tab labels ("Входящие");
   - the time-bar buttons ("Календарь", "Отдых": `h-14` with 14 px leading);
   - `h-11` fields, `h-8` chips, the 18 px badge, and tags;
   - sheet titles.
   
   Also check Chrome page zoom at 150 %. (F-AND-05)
3. **Keyboard in the Expo app (edge-to-edge).** Focus each of these fields: the time-bar "Чем заняты?", the composer, the Task picker's "Найти задачу", the Settings digest and quiet-hours times, and the activity sheet's time fields (number pad). Is the field covered? Is the tab bar shown above the keyboard? This decides whether F-AND-04 is a blocker on native. (F-AND-04)
4. **Keyboard in a Chrome tab and the PWA.**
   - Unfold the time bar and focus its field. Is it above the keyboard? Does the header slide away?
   - Type a phrase and wait for the AI preview. Are the card and its Approve button visible? (F-AND-04)
5. **Pull-to-refresh.**
   - In a Chrome tab, scroll Now to the top and drag down on the list. Does the app reload (spinner, white flash, boot)?
   - Repeat inside an open sheet with text typed in its search.
   - Repeat in the installed PWA. (F-WEB-06)
6. **Sheets.**
   - Drag a picker down by its handle in the Expo app and in Chrome. Today nothing should happen in the app, and the Chrome tab may reload.
   - System Back should close a sheet.
   - Does the sheet slide in from the full window height with a slow ease-in-out start?
   - Is closing a one-frame cut (`Modal animationType="none"`)? (F-CMP-02, F-MOT-05, F-MOT-09)
7. **Predictive back.** `predictiveBackGestureEnabled` / `enableOnBackInvokedCallback` is not configured in `app.config.ts`. Does the back gesture show a preview, and does it ever get hijacked? (01 native verdict #7; 02 platform notes)
8. **System bars and theme.**
   - Set the phone to light and Pace to dark, then the reverse. Check the status bar, the edge-to-edge navigation-bar colour, and Chrome's toolbar.
   - Open a picker. Does the status bar stay bright above the scrim?
   - Cold-start the PWA and the app in light mode and count the colours before Now appears (a black splash is expected). (F-WEB-02)
9. **Press feedback and haptics.** In the Expo app, tap a tab, a task check circle, a group header and the assistant's approve. Is there a ripple, or anything at all before the screen changes? Check-off, start and stop should give no haptic today. (F-CMP-01, F-AND-06)
10. **Long-press in Chrome.** Hold a finger on the "День" tab, a chip, the "Начать другое" toggle and a task's "Готово". Does a word get selected? Does the Copy/Share toolbar appear, with a haptic tick? On "Готово": does the close-as sheet open *and* a selection appear? (F-WEB-10, F-CMP-20)
11. **Safe areas with 3-button navigation.** In the Chrome tab, the PWA and the app:
    - Is the tab bar padded above the navigation bar?
    - Does the "В Входящие" toast, on Now and on a screen without the time bar, overlap the tab bar or the time bar? (Predicted overlap: about 11 px.)
    - With gesture navigation, does anything sit under the gesture pill, such as the Week hint? (F-CMP-12)
12. **Week day strip.** Fling the strip past Monday. Does Chrome or the OS back gesture take over? Do columns stop half-cut? (F-LAY-11)
13. **Motion on Android (claims from source).**
    - After a check-off, the row close-up should slide for 200 ms with ease-in-out (it jumps on the web) (F-MOT-02).
    - Measure dust performance with 150 views on a mid-range phone (F-MOT-01).
    - The slider thumb should jump to `scale-110` in one frame (F-MOT-14).
    - Native-stack pushes should slide (F-MOT-15).
    - The running pulse dot keeps the UI thread busy: watch battery use and frame activity with something running (F-MOT-12).
14. **Volume.** On a 1 284-task account, expand a fold. Measure the time to render and look for jank while scrolling. Repeat on History and Notifications. (F-DAT-03)
15. **Medium widths.** On a tablet or unfolded foldable, is it a stretched phone layout locked to portrait? (F-LAY-04)
16. **Switch in dark.** On Android's native Switch, does the off knob (`thumbColor = surface`) vanish on the sheet and the page? (F-COL-09)
17. **TalkBack.**
    - The tab bar should announce as tabs; keep that role on Android.
    - Sheets (an RN `Modal`, its own window) should confine TalkBack focus.
    - The running row should be audible once on a status change, not every minute.
    - The Week grid should announce the day for each block. (F-A11Y-10, F-A11Y-09, F-A11Y-11)
18. **Server picker** (Android only; missing from the baseline as `login-server-picker`). Enter a long tailnet host such as `pace.workstation-aleksandra.tail9f8e7d.ts.net:8443`. Does it wrap into centred lines and orphan "· Сменить"? (F-DAT-11)
19. **Install and update.**
    - Install from Chrome's menu: is the install sheet rich or bare?
    - Long-press the home-screen icon: there are no shortcuts today.
    - Deploy a new build: does the update strip sit under the status bar, not under the notch? Is "Обновить" (about 30 px) easy to hit? (F-WEB-13, F-WEB-07)
20. **Tap latency and offline.**
    - Tap the time-bar buttons and the tab bar quickly: does any tap feel late? React Native Web adds a 50 ms press-in delay.
    - In airplane mode, cold-start the installed PWA: does Now appear with data? (06 hardware items 11–12)

---

## Appendix: source id → consolidated finding

B = blocker, M = major, m = minor, n = nit (the source reviewer's rating). Each of the 259 ids appears exactly once.

| Reviewer | source id + severity → F-id |
|---|---|
| 01 | 01-001M→TYP-02 · 01-002M→AND-03 · 01-003M→CMP-05 · 01-004M→COL-04 · 01-005M→COL-05 · 01-006M→CMP-08 · 01-007M→COL-06 · 01-008M→TYP-04 · 01-009M→A11Y-02 · 01-010M→LAY-03 · 01-011M→LAY-02 · 01-012M→LAY-05 · 01-013m→CMP-04 · 01-014m→CMP-09 · 01-015m→CMP-09 · 01-016m→LAY-06 · 01-017m→TYP-05 · 01-018m→TYP-05 · 01-019m→LAY-11 · 01-020m→CMP-12 · 01-021m→CMP-16 · 01-022m→CMP-14 · 01-023m→LAY-09 · 01-024m→COL-09 · 01-025m→COL-13 · 01-026m→COL-12 · 01-027m→LAY-07 · 01-028m→CMP-10 · 01-029m→LAY-08 · 01-030m→CMP-17 · 01-031m→A11Y-06 · 01-032B→A11Y-01 · 01-033n→WEB-02 · 01-034m→MOT-05 · 01-035m→CMP-02 · 01-036M→CMP-01 · 01-037M→AND-01 · 01-038M→LAY-04 · 01-039m→DAT-03 · 01-040m→AND-02 · 01-041m→WEB-11 · 01-042m→WEB-12 · 01-043n→TYP-01 · 01-044m→CMP-06 · 01-045m→COL-07 · 01-046m→LAY-01 · 01-N1m→AND-05 · 01-N2m→AND-04 · 01-N3n→AND-07 |
| 02 | 02-001M→AND-03 · 02-002m→AND-03 · 02-003M→LAY-02 · 02-004M→LAY-06 · 02-005M→LAY-03 · 02-006m→LAY-12 · 02-007M→CMP-02 · 02-008M→MOT-05 · 02-009M→COL-08 · 02-010M→CMP-02 · 02-011m→CMP-13 · 02-012m→LAY-07 · 02-013m→CMP-08 · 02-014M→COL-04 · 02-015M→COL-06 · 02-016M→CMP-04 · 02-017m→CMP-10 · 02-018M→TYP-03 · 02-019M→MOT-01 · 02-020m→AND-06 · 02-021M→CMP-01 · 02-022M→AND-02 · 02-023m→LAY-05 · 02-024m→IDN-02 · 02-025m→COL-07 · 02-026M→COL-07 · 02-027m→COL-13 · 02-028M→TYP-01 · 02-029m→TYP-05 · 02-030m→AND-05 · 02-031M→COL-09 · 02-032n→LAY-09 · 02-033m→COL-08 · 02-034m→COL-03 · 02-035m→COL-10 · 02-036m→LAY-09 · 02-037m→LAY-09 · 02-038m→CMP-07 · 02-039n→CPY-07 · 02-040m→LAY-09 · 02-041m→CMP-09 · 02-042m→CMP-10 · 02-043m→CMP-11 · 02-044m→LAY-13 · 02-045m→CMP-05 · 02-046m→CMP-17 · 02-047m→LAY-08 |
| 03 | 03-001B→A11Y-01 · 03-002M→WEB-02 · 03-003M→WEB-03 · 03-004M→WEB-01 · 03-005M→WEB-04 · 03-006M→A11Y-04 · 03-007M→WEB-05 · 03-008m→A11Y-05 · 03-009m→A11Y-11 · 03-010m→A11Y-12 · 03-011m→WEB-08 · 03-012m→WEB-09 · 03-013m→TYP-06 · 03-014m→CPY-04 · 03-015m→WEB-13 · 03-016m→WEB-02 · 03-017m→WEB-07 · 03-018m→A11Y-16 · 03-019m→A11Y-01 · 03-020n→A11Y-04 · 03-021n→A11Y-19 · 03-022n→DAT-04 · 03-023n→WEB-15 · 03-024m→AND-04 · 03-025n→CPY-07 · 03-026n→WEB-16 · 03-027n→WEB-14 · 03-028m→A11Y-15 · 03-029m→WEB-06 |
| 04 | 04-001M→MOT-01 · 04-002M→MOT-01 · 04-003M→MOT-02 · 04-004M→MOT-03 · 04-005M→MOT-06 · 04-006M→MOT-05 · 04-007M→MOT-04 · 04-008m→MOT-09 · 04-009n→MOT-09 · 04-010M→MOT-07 · 04-011m→MOT-07 · 04-012M→MOT-07 · 04-013m→MOT-07 · 04-014M→MOT-08 · 04-015m→MOT-10 · 04-016m→MOT-11 · 04-017m→MOT-12 · 04-018m→WEB-07 · 04-019n→MOT-13 · 04-020M→CMP-01 · 04-021n→MOT-14 · 04-022m→MOT-07 · 04-023m→MOT-04 · 04-024n→MOT-15 |
| 05 | 05-001B→DAT-01 · 05-002B→DAT-02 · 05-003M→DAT-02 · 05-004M→DAT-02 · 05-005M→DAT-05 · 05-006M→DAT-02 · 05-007M→DAT-03 · 05-008M→DAT-04 · 05-009M→LAY-01 · 05-010M→DAT-06 · 05-011M→DAT-06 · 05-012M→DAT-07 · 05-013M→DAT-08 · 05-014m→LAY-14 · 05-015m→TYP-04 · 05-016m→CPY-04 · 05-017m→LAY-06 · 05-018m→DAT-10 · 05-019m→LAY-08 · 05-020m→DAT-06 · 05-021m→CPY-04 · 05-022m→DAT-09 · 05-023m→CMP-09 · 05-024m→CMP-16 · 05-025m→DAT-11 · 05-026n→TYP-05 · 05-027n→LAY-11 · 05-028n→DAT-06 · 05-029n→CPY-04 · 05-030n→DAT-11 · 05-031n→DAT-08 |
| 06 | 06-001M→WEB-02 · 06-002M→WEB-06 · 06-003M→CMP-02 · 06-004M→AND-04 · 06-005M→CMP-01 · 06-006m→WEB-10 · 06-007m→CMP-20 · 06-008m→CMP-12 · 06-009m→LAY-11 · 06-010m→WEB-04 · 06-011m→WEB-02 · 06-012m→WEB-07 · 06-013n→WEB-13 · 06-014n→WEB-13 |
| 07 | 07-001M→CMP-03 · 07-002M→CPY-01 · 07-003M→LAY-01 · 07-004M→CPY-02 · 07-005M→CPY-03 · 07-006M→LAY-02 · 07-007M→LAY-03 · 07-008m→LAY-10 · 07-009M→TYP-02 · 07-010M→LAY-05 · 07-011m→LAY-07 · 07-012m→LAY-08 · 07-013M→CMP-06 · 07-014M→CMP-07 · 07-015m→COL-02 · 07-016m→CMP-11 · 07-017m→CMP-05 · 07-018m→IDN-03 · 07-019m→COL-12 · 07-020m→LAY-06 · 07-021m→CPY-05 · 07-022m→CPY-06 · 07-023m→CMP-09 · 07-024m→CMP-15 · 07-025m→CMP-19 · 07-026m→CMP-12 · 07-027n→CMP-12 · 07-028m→CMP-21 · 07-029m→LAY-03 · 07-030n→LAY-10 · 07-031m→AND-03 · 07-032n→LAY-11 · 07-033n→DAT-12 · 07-034m→LAY-08 · 07-035m→CMP-18 |
| 08 | 08-001B→A11Y-01 · 08-002B→LAY-01 · 08-003B→WEB-01 · 08-004B→A11Y-03 · 08-005B→COL-01 · 08-006B→COL-02 · 08-007B→COL-03 · 08-008B→A11Y-02 · 08-009M→A11Y-07 · 08-010M→A11Y-05 · 08-011M→A11Y-09 · 08-012M→A11Y-10 · 08-013M→A11Y-08 · 08-014M→AND-01 · 08-015M→A11Y-06 · 08-016M→A11Y-04 · 08-017M→COL-11 · 08-018M→COL-10 · 08-019M→A11Y-01 · 08-020m→A11Y-13 · 08-021m→A11Y-18 · 08-022m→A11Y-14 · 08-023m→A11Y-12 · 08-024m→A11Y-11 · 08-025m→COL-03 · 08-026m→AND-05 · 08-027m→A11Y-17 · 08-028n→TYP-05 · 08-029n→A11Y-19 · 08-030n→A11Y-20 |

F-IDN-01 has no source id: it rests on 01 › Design Specificity Verdict / Identity note and 02 › Make this look less generic.
