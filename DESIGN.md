---
name: Pace
description: Incumbent visual system of the personal task and time tracker, recorded as redesign evidence (commit 057e484).
colors:
  dark-bg: "#0b0b0c"
  dark-surface: "#141416"
  dark-raised: "#1c1c1f"
  dark-line: "rgba(255, 255, 255, 0.1)"
  dark-track: "rgba(255, 255, 255, 0.12)"
  dark-fg: "#ececee"
  dark-fg2: "#b4b4bb"
  dark-muted: "#8a8a93"
  dark-faint: "#7d7d86"
  dark-accent: "#d4ff3a"
  dark-accent-fg: "#0b0b0c"
  dark-accent-text: "#d4ff3a"
  dark-accent-quiet: "#4263eb"
  dark-accent-quiet-fg: "#ffffff"
  dark-accent-quiet-text: "#91a7ff"
  dark-on-color: "#0b0b0c"
  dark-warn: "#ff8a5c"
  dark-question: "#f2c14e"
  dark-inverse: "#ececee"
  dark-inverse-fg: "#0b0b0c"
  dark-ink-blue: "#7aa2ff"
  dark-ink-violet: "#b49cff"
  dark-ink-green: "#6fd49a"
  dark-ink-amber: "#f2c14e"
  dark-ink-coral: "#ff8a8a"
  dark-ink-pink: "#ff8ac8"
  dark-ink-teal: "#5fd6d0"
  dark-ink-slate: "#9aa4b8"
  dark-ink-orange: "#ff7a45"
  dark-ink-yellow: "#e2cf55"
  light-bg: "#eceef2"
  light-surface: "#ffffff"
  light-raised: "#e1e3e9"
  light-line: "rgba(0, 0, 0, 0.13)"
  light-track: "rgba(0, 0, 0, 0.12)"
  light-fg: "#17181c"
  light-fg2: "#3c3e46"
  light-muted: "#5c5e66"
  light-faint: "#6f717a"
  light-accent: "#c5f23a"
  light-accent-fg: "#0b0b0c"
  light-accent-text: "#4d6b00"
  light-accent-quiet: "#3b5bdb"
  light-accent-quiet-fg: "#ffffff"
  light-accent-quiet-text: "#3b5bdb"
  light-on-color: "#0b0b0c"
  light-warn: "#b8441a"
  light-question: "#7a5e00"
  light-inverse: "#17181c"
  light-inverse-fg: "#ffffff"
  light-ink-blue: "#2950c4"
  light-ink-violet: "#5f42c9"
  light-ink-green: "#1b6e42"
  light-ink-amber: "#7a5800"
  light-ink-coral: "#a11d1d"
  light-ink-pink: "#a12a66"
  light-ink-teal: "#0d6b66"
  light-ink-slate: "#495366"
  light-ink-orange: "#963807"
  light-ink-yellow: "#6a5d00"
  project-blue: "#7aa2ff"
  project-violet: "#b49cff"
  project-green: "#6fd49a"
  project-amber: "#f2c14e"
  project-coral: "#ff6b6b"
  project-pink: "#ff8ac8"
  project-teal: "#5fd6d0"
  project-slate: "#9aa4b8"
  project-orange: "#ff7a45"
  project-yellow: "#e2cf55"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
  title-sheet:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  body-strong:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  micro:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "16px"
rounded:
  hairline: "1px"
  bar: "4px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  2xl: "16px"
  sheet-top: "22px"
  pill: "999px"
spacing:
  "0.5": "2px"
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "2.5": "10px"
  "3": "12px"
  "3.5": "14px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-accent-fg}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-fg}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "48px"
  button-ghost:
    textColor: "{colors.dark-fg2}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-warn}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "48px"
  icon-button-surface:
    backgroundColor: "{colors.dark-surface}"
    rounded: "{rounded.md}"
    size: "44px"
  chip:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-fg2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  chip-selected:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-fg}"
    rounded: "{rounded.pill}"
    height: "32px"
  color-tag:
    textColor: "{colors.dark-ink-green}"
    typography: "{typography.micro}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  count-badge:
    backgroundColor: "{colors.dark-accent-quiet}"
    textColor: "{colors.dark-accent-quiet-fg}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill}"
    height: "18px"
  text-field:
    backgroundColor: "{colors.dark-bg}"
    textColor: "{colors.dark-fg}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.dark-surface}"
    rounded: "{rounded.xl}"
    padding: "14px"
  task-row:
    textColor: "{colors.dark-fg}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.lg}"
    padding: "12px"
  task-row-selected:
    backgroundColor: "{colors.dark-raised}"
  sidebar-link:
    textColor: "{colors.dark-fg2}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "40px"
  sidebar-link-current:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-fg}"
  tab-bar:
    backgroundColor: "{colors.dark-bg}"
    textColor: "{colors.dark-muted}"
    typography: "{typography.micro}"
  tab-bar-active:
    textColor: "{colors.dark-accent-quiet-text}"
  time-bar-button:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-ink-green}"
    typography: "{typography.caption}"
    rounded: "{rounded.xl}"
    height: "56px"
  time-bar-button-running:
    backgroundColor: "{colors.dark-accent-quiet}"
    textColor: "{colors.dark-accent-quiet-fg}"
  toast:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-fg}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xl}"
  sheet-phone:
    backgroundColor: "{colors.dark-surface}"
    rounded: "{rounded.sheet-top}"
    padding: "10px 20px"
  sheet-dialog:
    backgroundColor: "{colors.dark-surface}"
    rounded: "{rounded.2xl}"
    padding: "20px"
    width: "560px"
  tooltip:
    backgroundColor: "{colors.dark-inverse}"
    textColor: "{colors.dark-inverse-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
---

<!--
Incumbent system as of commit 057e484 (2026-11-01). Evidence for the redesign, not the target.
Will be replaced by the target system after STOP 1/2.
-->

> **Incumbent system as of commit 057e484 (2026-11-01). Evidence for the redesign, not the target. Will be replaced by the target system after STOP 1/2.**
>
> Everything below describes what ships, so the redesign can see what it replaces. Nothing here is a rule for new surfaces. Where the owner has reacted to a part of this look, the reaction is cited as anti-reference (`context/feedback-*.md`).

# Design System: Pace

## Overview

**Creative North Star: "The Dark Utility Panel"** (descriptive label for the incumbent, assigned by the documenter, not confirmed by the owner)

Pace ships as a near-black (dark default) or cool-grey (light) utility surface. Every screen is one column of hairline-bordered cards and rows set in Inter, with a single high-voltage lime accent for primary actions and a second, quieter indigo accent for state: the running activity, the current tab, the count badge, the focused composer. Color otherwise comes from a ten-hue "project" palette that appears only as small washed tags and outlined chips. Density is moderate: 44 to 56 px touch targets everywhere, a 4 px spacing grid, type mostly at 11 to 15 px. One React Native tree draws Android and the web (react-native-web); the only layout switch is the 1024 px "wide" breakpoint, where a 224 px sidebar and a 400 px detail pane appear.

The system is coherent at the token level (one JSON source, `packages/core/src/design/tokens.json`, mirrored into `--pace-*` CSS variables, with WCAG contrast pinned by `packages/core/src/design/contrast.test.ts`). It is weaker at the composition level. The owner's feedback concentrates there: the lime read as "противно кислотный жёлтый" (repulsively acid yellow) when it filled a full-width banner (`context/feedback-3.md:8-12`), "два серых" (two greys) side by side read as bad design (`feedback-3.md:62-64`), Day had dividers between some rows and not others (`feedback-4.md:121-124`), and the expanded composer was "громоздкое" (bulky) (`feedback-4.md:84-90`). Some of these are fixed in code at 057e484 (the update banner is now indigo, `apps/app/src/platform/update-banner.web.tsx:81`; status and importance tags now differ in hue, `packages/core/src/design/tokens.ts:71-88`). The underlying tendencies are still there: grey on grey, a hairline on every container, and lime as the default "do it" color.

**Key Characteristics:**
- Two themes from one token file; dark is the fallback when the OS gives no preference (`apps/app/src/platform/theme.ts:33-41`).
- Two accents: lime `accent` for primary actions, indigo `accentQuiet` for state and navigation.
- Ten project hues used only as 22 % washes under contrast-checked `ink-*` text, or as 2 px outlines.
- Flat tonal layering (`bg` < `surface` < `raised`) with 1 px `line` hairlines. Only two shadows exist (toast, wide dialog).
- Inter at weights 400, 500 and 600, Latin and Cyrillic, self-hosted on the web.
- Short fades (140 to 240 ms), plus one signature: a checked task dissolves into dust over 750 ms.

## Colors

A cool neutral ramp per theme, one acid-lime action accent, one indigo state accent, and a ten-hue tag palette.

### Primary
- **Acid Lime** (`dark-accent` / `light-accent`): fills every primary action. That covers the `Button` primary variant (`apps/app/src/ui/button.tsx:19`), the sidebar's New task (`apps/app/src/ui/sidebar.tsx:180`), the time bar's play button (`apps/app/src/shared/tracking/time-bar.tsx:103`), the assistant's apply card (`apps/app/src/shared/assistant/action-cards.tsx:118`), the composer's Add (`apps/app/src/features/now/composer/quick-line.tsx:105`) and the logo's second chevron (via `accentText`, `apps/app/src/ui/logo.tsx:25`). Text on it is always `accent-fg` (near-black). *Anti-reference:* as a full-width band it was rejected as acid yellow (`feedback-3.md:8-15`, which also asked "в целом в палитре поменяем", change the palette in general). In `feedback-4.md:12-13` the owner accepted lime on important actions and the logo but not "везде" (everywhere).
- **Lime Ink** (`light-accent-text`): the lime pushed dark enough to read on light surfaces. Used for toast action labels (`apps/app/src/ui/toast.tsx:147`) and the logo chevron in light theme.

### Secondary
- **Quiet Indigo** (`*-accent-quiet`, with `*-accent-quiet-fg` white): state, never action. It covers the running time-bar button fill (`time-bar.tsx:131-136`), the count badge (`apps/app/src/ui/count-badge.tsx:10`), the user avatar, the update banner (`update-banner.web.tsx:81`), the focused composer border (`apps/app/src/features/now/composer/composer.tsx:102-103`) and the switch track.
- **Indigo Ink** (`*-accent-quiet-text`): the active tab and sidebar icon (`apps/app/src/ui/tab-bar.tsx:64,75`; `sidebar.tsx:121`), the progress-bar marker (`apps/app/src/ui/progress-bar.tsx:30`), "Back to today" (`apps/app/src/shared/back-to-today.tsx:27`) and Day's "Log it" (`apps/app/src/features/day/day-screen.tsx:178`).

### Tertiary
- **Project palette** (`project-*`, ten hues): category, project and importance color. A hue is never used bare as text. It appears as a 22 % wash (`TAG_TINT`, `tokens.ts:94`; `apps/app/tailwind.config.js:26`) under the matching `ink-*` text, as a 45 % edge on washed containers (`apps/app/src/ui/color.tsx:38-49`), as a full fill on a selected chip, an insights bar or the running pulse dot, and as a 2 px `ink-*` outline on an unselected chip or a resting time-bar button (`color.tsx:55-66`). Importance mapping: ASAP coral, Prioritized amber, Normal green, Nice-to-have slate. Status: only In progress is colored (blue) (`tokens.ts:71-88`).
- **Ink shades** (`*-ink-*`): the text and outline color for each hue. On dark it is the hue itself (coral lifted to `#ff8a8a`); on light it is a deep shade. `contrast.test.ts` holds ink at 4.5:1 on its wash and 3:1 as an outline on every surface.
- **Warn** (`*-warn`, orange-red) for lateness, errors and the danger button's 2 px outline. **Question** (`*-question`, amber) for things the assistant needs answered.

### Neutral
- **Pitch** (`dark-bg`) / **Cool Fog** (`light-bg`): the page, the tab bar, the sidebar, and text-field interiors (fields sit *below* their surface, `apps/app/src/ui/text-field.tsx:29`).
- **Surface** (`*-surface`): cards, sheets, toasts, secondary buttons, unselected chips.
- **Raised** (`*-raised`): selection (the current sidebar link, the selected task row, a selected neutral chip) and neutral washes.
- **Line** (`*-line`, 10 % white / 13 % black): every hairline border and divider. **Track** (`*-track`): empty bar tracks, neutral tag wash, skeleton blocks.
- **Ink ramp** (`fg` > `fg2` > `muted` > `faint`): primary text, secondary text and ghost buttons, meta and labels, placeholders and the grab handle. `muted` and `faint` sit only 0.4:1 apart in dark (`#8a8a93` vs `#7d7d86`).
- **Inverse** (`*-inverse` / `*-inverse-fg`): tooltips only (`apps/app/src/ui/tooltip.tsx:33`).

### Named Rules
**The Two Accents Rule (incumbent).** Lime means "do this", indigo means "this is on or here". The code says it outright: "lime is for the actions" (`count-badge.tsx:4-5`).

**The Washed Tag Rule (incumbent).** A project hue reaches text only through its `ink-*` shade over a 22 % wash of itself. Raw `project-*` hex never colors text.

## Typography

**Display Font:** Inter (with system-ui, sans-serif)
**Body Font:** Inter
**Label/Mono Font:** none. The tabular figures come from Inter's `tabular-nums` (44 uses).

**Character:** One neutral grotesque at three weights. Hierarchy is carried almost entirely by size steps of 1 to 2 px and by color (`fg` / `fg2` / `muted`), not by contrast of form. Inter is self-hosted as four variable woff2 subsets (Latin, Latin-ext, Cyrillic, Cyrillic-ext) so Russian never falls back (`apps/app/global.css:9-41`); the owner required this (`feedback-2.md`: "даже русский должен быть на Inter", even Russian must be in Inter).

### Hierarchy
Measured from the shipped classes. Counts of `text-[Npx]` across `apps/app/src`: 12 px ×91, 13 px ×86, 14 px ×73, 15 px ×38, 11 px ×31, 16 px and up ×22 combined.
- **Display** (600, 34 px, tight): the wordmark on the sign-in screens only (`logo.tsx:48`).
- **Headline** (600, 30 px, tight): tab-level screen titles (Now, Day, Week, Insights) (`apps/app/src/ui/screen-header.tsx:55`).
- **Title** (600, 22 px): pushed-screen titles (`apps/app/src/ui/back-header.tsx:51`). **Title-sheet** (600, 20 px): sheet and dialog titles (`apps/app/src/ui/sheet.tsx:76`).
- **Body** (500 / 400, 15 px): task-row titles (500 open, 400 `fg2` when done or dimmed, `apps/app/src/shared/task-row.tsx:24-29`), button labels (`button.tsx:101`), field text.
- **Body-sm** (400, 14 px): sidebar links, toast text, switch-row labels, empty states.
- **Label** (400, 13 px): sheet subtitles, banners, time-bar status, tooltips.
- **Caption** (400, 12 px / 16 px): meta lines (`apps/app/src/shared/meta-line.tsx:68`), field labels and hints, chip text, keyboard hints.
- **Micro** (500, 11 px / 16 px): color tags (`color.tsx:101`), tab labels, count badges.

### Named Rules
**The One Family Rule (incumbent).** Inter everywhere, Cyrillic included. Nothing else ships.

## Layout

A single centred column, at most 880 px (`apps/app/src/ui/screen.tsx:33`), on a 4 px Tailwind grid. The most used steps are 12 px (×154) and 8 px (×144), then 4 px and 16 px. Horizontal page gutter: 16 to 20 px (`mx-4` on cards, `px-5` on headers). Screen header: 24 px top, 12 px bottom, title aligned to the bottom (`screen-header.tsx:32`).

- **Phone (< 1024 px):** bottom tab bar (Now, Day, Inbox, More; 20 px icons over 11 px labels; `tab-bar.tsx:95`). The time bar is docked above it, with fixed activity buttons in a 4-up grid, each 56 px tall (`time-bar.tsx:167`). Sheets rise from the bottom with a 90 % max height and 640 px max width (`sheet.tsx:21`).
- **Wide (≥ 1024 px, `apps/app/src/ui/layout.ts:4`):** a 224 px sidebar on `bg` with a right hairline (`sidebar.tsx:162`), then a split pane: the list column, a hairline, and a 400 px (max 40 %) detail region (`apps/app/src/ui/split-pane.tsx:21-22`). Sheets become centred dialogs of max 560 px width and 85 % height (`sheet.tsx:24`). Buttons shrink to their text width except inside sheets (`button.tsx:44-56`).
- **Touch targets:** 44 px minimum everywhere, even when the visible element is smaller. The 22 px check sits in a 44 px target (`apps/app/src/ui/check-circle.tsx:28`), and the 32 px chip in a 44 px target (`apps/app/src/ui/chip.tsx:59-60`).

## Elevation & Depth

Flat, tonal and outlined. Depth is the step `bg` → `surface` → `raised`, plus a 1 px `line` border on almost every container (cards, chips, fields, sheets, toasts, headers of lists). Shadows appear on only two floating layers, and on the dark theme they are effectively invisible against `#0b0b0c`. A modal dims everything behind it with 55 % black (`sheet.tsx:43`).

### Shadow Vocabulary
- **Float** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`, Tailwind `shadow-lg`): the toast (`toast.tsx:125`) and the wide-window dialog (`sheet.tsx:157`) only.

### Named Rules
**The Hairline-On-Everything Rule (incumbent).** Containers separate by a 1 px `line` border, not by shadow or space. This is the source of the "где-то есть черточки, где-то нет" (dashes in some places, not in others) complaint (`feedback-4.md:124`) whenever a list mixes bordered and unbordered rows.

## Shapes

Soft, fairly uniform rounding, nearly all in a 10 to 14 px band. Usage counts: `rounded-lg` 12 px ×36, `rounded-xl` 14 px ×27, `rounded-full` ×23, `rounded-md` 10 px ×16, `rounded-sm` 8 px ×7, `rounded-2xl` 16 px ×4 (wide dialog, web sign-in cards). There is one phone-sheet top radius of 22 px (`sheet.tsx:158`), and insights bars are rounded only on their right end (4 px). Borders are 1 px hairlines, except 2 px for chips, time-bar buttons and the danger button, and 1.5 px for the check circle. Dashed borders mark something unavailable or provisional: a greyed time-bar button (`time-bar.tsx:139`), calendar events on Week, the preset preview, and the dashed check circle.

## Components

### Buttons
- **Shape:** gently rounded rectangle (`rounded.md`, 10 px), at least 48 px tall, 8 px × 16 px padding, 8 px gap to an optional 18 px Lucide icon (stroke 1.75) and a trailing 12 px keyboard hint (`button.tsx:77,203`).
- **Primary:** lime fill, near-black 15 px/500 label.
- **Hover / Focus / Press:** no hover state on native, and none in the web CSS either. Press is `opacity 0.8`, disabled and busy are `opacity 0.5`, and busy swaps the label for a spinner. The web focus ring is the browser default, except on switches and the slider (2 px `fg` outline, 2 px offset; `global.css:53-57,120-124`).
- **Secondary:** `surface` fill, 1 px `line` border, `fg` label. **Ghost:** transparent, `fg2` label. **Danger:** `surface` fill, 2 px `warn` outline, `warn` label.
- **Icon button:** a 44 px square at 10 px radius, in three variants: `surface` + hairline, bare `plain`, or a 48 px `raised` fill (`apps/app/src/ui/icon-button.tsx:35`).

### Chips
- **Style:** a 32 px pill (36 px when tall), 12 px padding, 12 px text, always a 2 px border (`chip.tsx:15-22,64`).
- **State:** neutral unselected is a `line` outline on `surface` with `fg2` text; neutral selected is an `fg` outline on `raised` ("never a black pill"). Colored unselected is an `ink-*` outline with `ink-*` text; colored selected is filled with the hue with `on-color` text. `Segmented` is a row of neutral chips (`apps/app/src/ui/segmented.tsx`).

### Color Tag
An 11 px/500 label on a 22 % wash of its hue (neutral: `track`), with an 8 px radius and 1 px × 6 px padding (`color.tsx:98-101`). It carries the project or category and the importance in every meta line.

### Cards / Containers
- **Corner Style:** 14 px (`rounded.xl`).
- **Background:** `surface` (forms nested inside a card drop to `bg`, e.g. the date field).
- **Shadow Strategy:** none; see Elevation.
- **Border:** 1 px `line` (danger zone: 1 px `warn`; washed containers: the hue at 45 %).
- **Internal Padding:** 14 px is typical (`p-3.5`); insights cards use 16 px (`apps/app/src/features/insights/card.tsx:15`); banners use 12 px × 14 px (`apps/app/src/shared/zone-banner.tsx:22`). The open-task groups on Now are one bordered card with rows inside (`apps/app/src/features/now/now-task-groups.tsx:26`).

### Inputs / Fields
- **Style:** a 44 px field (96 px minimum when multiline), 12 px radius, 1 px `line` border, filled with `bg`, so it reads as recessed into its card. 15 px `fg` text, a 12 px `muted` label above, placeholder in `faint` (`text-field.tsx:25-34`).
- **Focus:** the browser outline is removed (`global.css:44-47`). The composer card swaps its border to indigo while its line has focus (`composer.tsx:102-103`); a plain `TextField` shows no focus change at all.
- **Error:** the border turns `warn`, with 12 px `warn` text below in a polite live region.

### Navigation
- **Sidebar (wide):** 224 px, `bg`, right hairline. Header: 22 px logo, a 16 px/600 wordmark, the avatar, the owner name and a bell. Then a lime New task row (40 px, 12 px radius, N hint), then eight 40 px links (18 px icon, 14 px text). The current link gets a `raised` fill, an `fg` 500 label and an indigo icon; the rest are `fg2` with `muted` icons (`sidebar.tsx:115-128`). Toasts dock at its foot (`toast.tsx:107`).
- **Tab bar (phone):** `bg` with a top hairline. Each tab is a 48 px target; active is indigo icon and label at 500, inactive is `muted`. The Inbox tab carries the count badge.

### Task Row (signature)
A 22 px check circle (1.5 px `muted` ring; checked is filled `fg` with a `bg` check), a two-line 15 px title, and a meta line of color tags + a 13 px repeat mark + 12 px `muted` text joined by " · ", with lateness in `warn` (`task-row.tsx:71-85`, `meta-line.tsx:40-79`). Padding is 12 px with a 12 px radius; the selected row gets a `raised` fill. A 3 px progress bar (`fg` fill on `track`, indigo pace marker) sits under rows with work progress (`progress-bar.tsx:25-30`). Checking a row runs the 750 ms dust **Dissolve** (`apps/app/src/ui/dissolve.tsx:13,122-124`, ease-out quad).

### Time Bar (signature)
Docked under the list, with a top hairline on `bg` (`time-bar.tsx:260`). The running row has a pulsing 8 px dot in the activity hue, breathing at 900 ms (`apps/app/src/ui/pulse-dot.tsx`), a 13 px tabular elapsed time, and a 44 px Stop. Below it sit the fixed activity buttons: 56 px, 14 px radius, a 2 px `ink-*` outline on `surface`, an 18 px icon over a 12 px label. The running button is filled indigo; a greyed button is dashed `line` with `muted` text (`time-bar.tsx:131-146,167`).

### Sheet / Dialog
Phone: a `surface` sheet with a 22 px top radius and a top hairline, a 36 × 4 px `faint` grab handle, a 20 px/600 title, and the body clipped under a hairline, with an optional footer above another hairline (`sheet.tsx:54,154-181`). Wide: a centred 560 px dialog at 16 px radius with a hairline and Float shadow, plus a 44 px close cross. Neither has a Cancel button; leaving is a tap outside, Escape or system back.

### Toast
Floats 96 px above the phone bottom, at most 480 px wide, or docks in the sidebar at 200 px. `surface` fill, 14 px radius, hairline, Float shadow, 14 px text, and a 14 px/600 lime-ink action (`toast.tsx:107-153`). It shows for 5 to 10 s, scaled to message length.

### Motion (applies to the components above)
All motion is in `apps/app/src/ui/motion.ts` and honours reduced motion. Row enter is a 180 ms fade, row exit 140 ms, the row layout shift 200 ms linear. The backdrop fades in over 180 ms; the sheet slides up over 240 ms; the dialog zooms in over 160 ms. The skeleton breathes between opacity 1 and 0.45 at 900 ms. Height animates over 220 ms (`apps/app/src/ui/animated-height.tsx:11`). The update banner slides over 300 ms. Tooltips appear on hover on the web and stay 2.5 s on tap.

## Do's and Don'ts

These are guardrails for reading this incumbent, taken from the code and from the owner's confirmed reactions. The redesign's own rules replace them.

### Do:
- **Do** keep every color in `packages/core/src/design/tokens.json` and reach it through `--pace-*` variables. The contrast test (`contrast.test.ts`) is the reason the incumbent passes AA in both themes.
- **Do** keep 44 px touch targets around visually smaller controls, as `CheckCircle` and `Chip` do.
- **Do** put hue on text only through an `ink-*` shade checked against its wash.
- **Do** keep Inter for Cyrillic as well as Latin (owner, `feedback-2.md`).
- **Do** keep each time-bar button large and in a fixed place (owner, `feedback-2.md`: "каждая кнопка была довольно большой … и всегда находилась в своём месте", every button fairly big and always in its own place).

### Don't:
- **Don't** spread the lime accent across large areas such as banners or bands. The owner called it "противно кислотный жёлтый" and asked for the palette to change (`feedback-3.md:8-15`).
- **Don't** put two neutral-grey tags side by side with different meanings (`feedback-3.md:62-64`: "Плохой дизайн: два серых", bad design: two greys).
- **Don't** mix bordered and unbordered rows in one list. Day's uneven dividers were rejected (`feedback-4.md:121-124`).
- **Don't** expand a quick-entry composer into a tall in-place form. The owner found it bulky and asked for it to move into the free right pane (`feedback-4.md:84-90`).
- **Don't** add a full-width button whose action is a no-op in the current state (a "This week" button while on this week, `feedback-4.md:114-117`).
