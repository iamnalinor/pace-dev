# Pace redesign spec (design overhaul, 2026-11)

Status: **draft for STOP 1**. Nothing here is built yet. The owner picks a direction (§2) and answers
the open questions (§12); then the spec is amended (Phase 3) and implemented (Phase 4,
`redesign-plan.md`).

- Evidence: `context/design/findings.md` (134 consolidated findings from 8 reviews over the
  baseline of commit `057e484`; every `F-…` id below is defined there), the reviews in
  `context/design/reviews/`, the baseline matrix in `context/design/baseline/`.
- Product truth: `PRODUCT.md` (platform `adaptive`, Operate mode on every surface; owner first).
- Incumbent system (evidence and anti-reference only): `DESIGN.md`.
- Comps: `context/design/comps/pace-directions.html`, published privately at
  https://claude.ai/artifact/9cY9i62M1UB7RNbRAfYi8Q.
- Palette draft and its generator/contrast report: `context/design/tokens/`.

**Scope.** Every screen of `apps/app` on Android (Expo), phone web (390) and desktop web (1440),
light and dark, EN and RU. **Not in scope:** new features, backend changes, information
architecture (fixed: phone tabs Now · Day · Inbox · More; desktop sidebar Now → Day → Week →
Inbox → Projects → Insights → History → Settings), marketing visuals.

**What the evidence says, in five lines.**
1. The system has tokens for colours but no *roles*: accents and hues go wherever something should
   stand out, so lime is spent 3–4 times a screen, indigo means five things, and "Normal" is a
   green tag on every row (F-COL-04…07).
2. There is no structure layer: no page template, no list/section primitives, no layer model, no
   type roles — every screen invents its header, rows, dividers and hierarchy (F-LAY-02/03/05,
   F-TYP-01/02, F-COL-08).
3. Interaction states are missing or left to defaults: no focus ring on fields, no press
   primitive, no ripple, sheets with a decorative handle that leave in one frame (F-A11Y-01,
   F-CMP-01/02, F-MOT-05).
4. Android is the web app rendered natively: 1 rem compiles to 14 px, so every target is 12.5 %
   small, with no Material affordances, no keyboard layout, no haptics (F-AND-01…06).
5. Nothing has a budget: text from data never yields or clamps, fixed chrome can squeeze the list
   to 0 px, lists are never virtualised, motion runs 750 ms on the most frequent action
   (F-DAT-01…06, F-LAY-01, F-MOT-01).

---

## 1. Design principles for Pace

Operate mode: the person is doing a task. Scanability, consistency and platform expectations
outrank expression; the brand lives in precise details (impeccable `operate.md`).

**P1 · Content is the brightest thing on screen.** Colour has a budget: the one primary action,
what runs, what is late, what is selected, and category as a thin line. Everything at rest is
neutral.
- *This means:* "Normal" importance shows nothing; idle time-bar buttons are neutral tiles; one
  filled button per view.
- *This does not mean:* a grey screen with one accent — categories keep their colours as lines and
  dots, the day's shape stays colourful on Day and Week.
- *Pace example:* the Now row «ДЗ по алгебре: №№ 290, 292» shows its project tag and due time;
  importance appears only when it is not Normal.

**P2 · One surface, grouped lists.** A screen is one ground with grouped list sections on it.
Elevation is for things that float (sheets, dialogs, popovers, toasts), never for content.
- *This means:* no cards in cards, no hairline around every container; separators only between
  rows of a group, inset to the text.
- *This does not mean:* no grouping — groups are cells on a contrasting ground.
- *Pace example:* Settings becomes an inset grouped list (rows with a trailing value or control),
  not a column of bordered boxes.

**P3 · Time is drawn as time.** Durations, clocks and counts use one formatter and tabular
figures; time spans are proportional wherever a screen shows a day.
- *This means:* the running activity's elapsed time is the largest live number on Now; Day has a
  proportional rail beside its editable rows; RU units get non-breaking spaces.
- *This does not mean:* turning lists into calendars — Day stays an editable list, the rail is its
  index.
- *Pace example:* «Пошёл в ЦСС 2:01 из ~20 мин» with 2:01 at headline size, not an 11 px tag.

**P4 · Every press answers within a frame; every overlay leaves the way it came.** One press
primitive (ripple on Android, a pressed fill on the web) and paired enter/exit motion for every
overlay, with a frequency budget.
- *This means:* check fills on pointer-down; sheets slide back down; reduced motion is gentler,
  never a broken hole.
- *This does not mean:* animating everything — keyboard navigation, list mounts, filter changes and
  day switches get no motion.
- *Pace example:* checking a task fills the circle at once, the row dissolves and the list closes up
  in ≤ 300 ms in total.

**P5 · One way per job, one place per thing.** One page template, one header per screen type, one
place for feedback (next to its cause), one name per action.
- *This means:* the title sits at the same height on every top-level screen; a toast never covers
  the next action; «Отменить» never means both Undo and Cancel.
- *This does not mean:* identical screens — Day, Week and Insights keep their own content shapes
  inside the same frame.
- *Pace example:* period navigation is one control (‹ date ›) with "Today" shown only away from
  today, on Day, Week, History and Insights alike.

**P6 · Platform-true.** Material affordances on Android (system Back and predictive back, ripple,
navigation bar, edge-to-edge insets, 48 dp, haptics); web semantics on the web (links with `href`,
headings with levels, `<title>`, `:focus-visible`, hover only with a hover pointer); HIG-grade craft
on both.
- *This means:* the tab bar is a Material navigation bar on Android and `nav` with links on the web.
- *This does not mean:* two designs — one visual system, two sets of affordances.
- *Pace example:* a sheet closes with system Back on Android, Escape and a click outside on desktop.

**P7 · Both themes, both scripts and the worst case are the design, not tests after it.** Every
token is verified in light and dark; every layout decision is checked in Russian; every text slot
has a declared policy (truncate, wrap, clamp, count).
- *This means:* a long Cyrillic project name ellipsizes with a tooltip; a 37-subtask submit button
  says «Сдать 37»; 1 284 tasks scroll at 60 fps.
- *This does not mean:* designing for the worst case first — the lived-in case leads, the worst case
  must not break.

---

## 2. Visual world

The visual world contributes only type rhythm, palette, density and one signature detail; the
shell, navigation and controls are the platform's (impeccable `mode-operate.md`). The comps render
the same Now (phone, dark and light) and Day (desktop, light) screens with Russian lived-in data in
three directions; open the comps page to compare at full size.

Process note: directions came from impeccable's `concept-seed` roll (`seed:f70fe864d626a7e4`),
which assigned the notebook direction; six catalog challengers were weighed and declined, each
donating one discipline (listed in the comps page). The decision page server cannot reach the owner
from this cloud session, so the comps are a private artifact page and the choice is made at STOP 1.

### A · Тетрадь — ink and margin (the roll's assigned direction)

The squared school notebook: cool paper, ballpoint-blue ink, a red margin rule. One cool accent
(ink blue `#2E4AD6` / `#7D93FF`) does every interactive job; red is status only (now-line, overdue).
Signature: Day sits on a faint 4-pt dot grid (only behind the timeline) with a red now-line; a
checked task is struck through in ink before it leaves; the running activity is an ink line with a
red mark at its expected length.
Risk: blue-on-white is the most familiar productivity accent; the logo moves from green to ink
blue, against the owner's feedback-4 preference for green on the logo.

### B · Линии — metro lines (impeccable's pick) — **recommended**

The Moscow Metro map the owner reads twice a day. Every activity category and project is a line
with its own colour, shown as quiet tinted fills and short coloured strokes on a warm neutral
ground. Two tones carry the shell: neutral surfaces plus a deep "Pace green" (`#0E7A45` light,
`#45C680` dark) for actions, success and the logo — the owner's green, grown up.
Signature: **Day is drawn as a line.** Each block is a coloured segment with a station ring at its
start; a gap is a dashed segment «без записи» with its Log action; a parallel activity is a
branch line; the running block's station is open. The same line appears, compressed, under the
running activity on Now (the "train" on its segment) and as the day strip on Week.
Risk: the most colour of the three, so the colour budget (P1) must be enforced or Week and
Insights get busy; pushed further, the line becomes a transit costume (never station names, never
map chrome).

### C · Хронограф — graphite and lume (grounded alternate)

A watch dial at night: graphite and steel greys, lume chartreuse (`#C6EE45`) only where something
runs or must be pressed. Keeps the lime, as a small precise light instead of a band.
Signature: the running activity reads on a minute track (ticks, a bezel mark at the expected
length, a needle that turns amber past it); Day's hour ruler is a tick scale; durations read like a
chronograph (2:01).
Risk: closest to the incumbent (dark, dense, lime) — reviewers name near-black + acid lime as a
templated look (F-IDN-01); lime is weak as text on light and must stay a fill.

### Canon — Apple Reminders/Calendar played straight

System grouped lists, a system-blue tint, Inter at iOS metrics. Always available; the craft bar is
Reminders + Things 3.

### Recommendation: B · Линии

1. **It gives colour a job instead of a budget fight.** Pace already has two colour-carrying
   systems — 12 activity categories and user project colours — and today they collide (F-COL-06:
   Task and Hygiene share teal; category «Работа» and project «Работа» are both violet). A hue
   family with per-theme stroke/ink/tint (§3.1) and "category = line, project = tag" resolves
   both; A and C have to bolt the same family on anyway.
2. **It keeps the owner's green** on the logo and the important actions (feedback-4) without the
   "acid" bands he rejected (feedback-3), and drops indigo entirely (F-COL-07).
3. **Its signature is the product's own object.** The day as a proportional line answers F-IDN-02
   (Day does not encode time) and F-IDN-01 (nothing says Pace) with structure, not decoration;
   02-apple-design independently proposed "a proportional Day rail that also appears as a strip
   under the running row".
4. **It reads calm in both themes** in the comps; the warm neutral ground avoids both the
   incumbent's flat dark and the grey-on-grey light (F-COL-08).

Raises carried into B from the others: from A, the check-off ends in one quick stroke rather than
a long effect; from C, durations and clocks are a typographic role with tabular figures; from the
declined challengers, one grotesque for every job, state shown without colour where colour is
ambiguous (overlap hatching on Day), importance as a fixed ramp (weight, never ad-hoc colour),
nothing labelled twice, the four time-bar buttons as fixed furniture, and one accent used a handful
of times per screen.

The token *structure* below is the same for every direction; only the palette values change. §3.1
lists B's values (verified); A's and C's palettes are in the comps page and get the same
verification if chosen.

---

## 3. Token system v2

Tokens live in `packages/core/src/design/tokens.json` (core stays pure; the file's shape
changes). Generated outputs: the Tailwind theme (`apps/app/tailwind.config.js`), the NativeWind
`vars()` per theme (`apps/app/src/platform/theme.ts`), the reanimated/CSS motion constants
(`apps/app/src/ui/motion.ts`), the web document literals (`public/index.html` theme-color and
background, manifest and splash colours — generated, never hand-copied; F-WEB-02), and the
contrast unit test's pair list.

**Unit system (fixes F-AND-01).** Every size token is a number in px/dp. NativeWind's
`inlineRem` is set to 16 in `apps/app/metro.config.js` so that any remaining rem class compiles to
the same size on Android and the web, and the Tailwind theme's `spacing`, `fontSize`,
`lineHeight`, `borderRadius` and `height`/`width` scales are **replaced** (not extended) by the
token scales, so off-scale classes do not exist. Arbitrary values (`p-[13px]`, `text-[15px]`,
`rounded-[22px]`) are forbidden by lint (§9.3).

Proposed shape of `tokens.json` v2:

```jsonc
{
  "version": 2,
  "font": { "sans": "Inter", "features": { "numeric": ["tnum", "cv11"] } },
  "color": {
    "light": { "bg": {…}, "fill": {…}, "label": {…}, "separator": {…}, "outline": "…",
               "accent": {…}, "status": {…}, "focus": "…", "selection": "…", "scrim": "…",
               "shadow": {…} },
    "dark":  { … same keys … }
  },
  "hue":   { "light": { "<name>": { "stroke", "ink", "tint" } }, "dark": { … } },
  "type":  { "<role>": { "phone": { "size", "line", "weight", "tracking" },
                          "desktop": { … } } },
  "space": { "<step>": n }, "layout": { "<role>": n },
  "radius": { "<step>": n },
  "size":  { "hit": 48, "hitWeb": 44, "icon": { "inline": 16, "control": 20, "bar": 24 },
             "stroke": 1.75, "row": { "min": 52, "compact": 44 } },
  "motion": { "duration": {…}, "easing": {…}, "spring": {…}, "reduced": {…} },
  "z": { "sticky": 10, "overlay": 40, "toast": 50, "tooltip": 60 }
}
```

### 3.1 Colour roles

Values below are direction B (Lines), generated by `context/design/tokens/palette.py`
(`palette-v2-lines.json`, contrast report `palette-v2-lines-contrast.txt`). Every pair is checked
for WCAG 2.x and APCA Lc.

**Backgrounds (layer model, fixes F-COL-08).** Depth is a tonal step: light goes white-on-grey,
dark goes lighter-on-darker; shadows only in light and only for floating layers.

| Role | Light | Dark | Used for |
|---|---|---|---|
| `bg.app` | `#F2F2EF` | `#101111` | the screen ground, grouped-list background |
| `bg.cell` | `#FFFFFF` | `#1A1B1B` | grouped-list cells, the composer, the running card |
| `bg.elevated` | `#FFFFFF` + `shadow.overlay` | `#242625` + 1 px inner hairline | sheets, dialogs, popovers, toasts |
| `bg.sidebar` | `#E9ECE7` | `#0C0D0D` | the desktop sidebar (a second neutral layer, tinted to the accent) |
| `bg.inset` | `#F7F7F5` | `#151616` | fields inside cells, code/token boxes |

**Fills (alpha over whatever is below, so they compose on any layer).**
`fill.1` hover (light `rgba(21,23,21,.04)`, dark `rgba(237,237,234,.05)`), `fill.2` pressed /
neutral control (`.07` / `.08`), `fill.3` selected-neutral and the Android ripple colour
(`.11` / `.12`), `fill.4` strong neutral (tracks, `.16` / `.18`).

**Labels (four levels, like HIG).**

| Role | Light | Dark | Contrast on cell (light / dark) | Use |
|---|---|---|---|---|
| `label.primary` | `#151715` | `#EDEDEA` | 18.0 / 14.7, Lc 105 / −95 | titles, row titles, values |
| `label.secondary` | `#4A4D48` | `#C8C9C4` | 8.6 / 10.4, Lc 90 / −72 | meta lines, section headers, secondary values |
| `label.tertiary` | `#686B65` | `#A4A5A0` | 5.4 / 7.0, Lc 77 / −52 | captions, timestamps, placeholders (≥ 13 px, weight ≥ 400) |
| `label.quaternary` | `#9EA19A` | `#62635F` | 2.6 / 2.5 | **never text**: disabled glyphs, decorative strokes |

Dark secondary text is raised from the incumbent `fg2`/`muted` (APCA Lc 33–62, F-COL-11) to Lc 72;
tertiary to Lc 52, restricted to ≥ 13 px.

**Separators and outlines.**
- `separator` (light `rgba(21,23,21,.10)`, dark `rgba(237,237,234,.10)`) — decorative, between rows
  in a group, inset to the text start; `separator.opaque` (`#DCDDD8` / `#2E302F`) where alpha would
  stack.
- `outline` (`#8A8D86` / `#7A7C77`; 3.4:1 / 4.1:1 on cell, 3.0:1 / 4.5:1 on app) — the
  **boundary of a control** when the control has no fill that marks it (fields at rest, unselected
  segmented options, the switch track off). Fixes F-COL-01/09 (1.1–1.35:1 edges).

**Accent.** One accent, four jobs only: the primary action (one filled button per view), success /
done, the current selection where a neutral fill would be ambiguous, and links.

| Role | Light | Dark | Check |
|---|---|---|---|
| `accent` | `#0E7A45` | `#45C680` | on cell 5.4 / 7.3 |
| `accent.on` | `#FFFFFF` | `#04140B` | on accent 5.4 / 8.7 (Lc −82 / 61) |
| `accent.text` | `#0B6B3C` | `#5DD192` | on cell 6.6 / 9.0 |
| `accent.quiet` | `rgba(14,122,69,.12)` | `rgba(69,198,128,.16)` | selected fill with `accent.text` |
| `accent.pressed` | `#0A6539` | `#3AAE6F` | pressed primary button |

Indigo (`accentQuiet`) is removed; its nine jobs are reassigned: running → the activity's
category line + `label.primary` time; current nav → `fill.3` + `label.primary` + a leading
indicator; switches on → `accent`; links → `accent.text`; badges → `status.danger` (count of
unsorted) or `label.secondary` on `fill.3`; charts → the hue family; the avatar → `fill.3` with
`label.secondary` initials.

**Status.** `status.danger` `#B42318` / `#FF7B6B` (overdue, destructive, errors; 6.6 / 6.8 on
cell), `status.warn` `#9A5200` / `#F2A14A` ("still doing this?", past expected), `status.question`
`#795300` / `#F2C275` (assistant questions), `status.success` = `accent.text`; each with a `…Quiet`
tint for banners and inline notices.

**Focus, selection, scrim.**
- `focus` = `accent` (5.4 / 9.0 against cell): a 2 px ring with a 2 px offset, drawn by the kit's
  state layer on every focusable element on the web and in Android keyboard navigation (F-A11Y-01).
  In forced colours the ring maps to `Highlight`.
- `selection` `rgba(14,122,69,.18)` / `rgba(69,198,128,.26)` — text selection on the web
  (`::selection`, F-WEB-14), selected-row fill when a list has a selection (always together with a
  non-colour marker: a leading 3 px bar inside the cell or a checkmark; F-COL-02).
- `scrim` `rgba(10,12,10,.32)` / `rgba(0,0,0,.55)`.

**Hue family (fixes F-COL-06, F-COL-10).** Twelve hues on an OKLCH wheel plus slate, each with a
per-theme `stroke` (lines, dots, chart marks; ≥ 3:1 on `bg.app` in both themes), `ink` (text on
its own tint; ≥ 5.6:1) and `tint` (12 % light, 18 % dark).

| Hue | OKLCH h | Light stroke / ink | Dark stroke / ink |
|---|---|---|---|
| red | 27 | `#CE5249` / `#963730` | `#F47C70` / `#FFB5AC` |
| orange | 52 | `#C56001` / `#8E4200` | `#ED8641` / `#FEB98F` |
| amber | 78 | `#A87504` / `#795300` | `#D79700` / `#F2C275` |
| yellow | 100 | `#928103` / `#685B00` | `#BBA500` / `#DBCC75` |
| lime | 128 | `#659003` / `#466700` | `#89B645` / `#B6D98A` |
| green | 152 | `#009A4D` / `#006E35` | `#4DBF74` / `#92DFA7` |
| teal | 182 | `#009585` / `#016A5E` | `#09BEAB` / `#6DE2D0` |
| cyan | 212 | `#0390A4` / `#006775` | `#0DB8D2` / `#68DEF4` |
| blue | 250 | `#1A83DB` / `#065DA0` | `#52A9FE` / `#A2CFFF` |
| indigo | 276 | `#6873DE` / `#4951A2` | `#8D9BFF` / `#BCC7FE` |
| violet | 302 | `#9364CE` / `#694596` | `#B68CF2` / `#D6BCFE` |
| pink | 345 | `#C05296` / `#8B376B` | `#E57BBA` / `#FEADDB` |
| slate | 255 (C .025) | `#717B89` / `#4F5966` | `#94A0AE` / `#BCC5D1` |

Project colours keep their ten stored names (`blue violet green amber coral pink teal slate orange
yellow`; `coral` maps to `red`) — the event schema is not widened in this overhaul (bug-lessons
class 13). Activity categories get twelve distinct hues in `packages/core/src/tracking/categories.ts`:
work blue · study violet · task green · food orange · commute yellow · hygiene cyan · rest teal ·
chores amber · social pink · sport red · sleep indigo · other slate.

**Usage rule (P1).** Category = a line or dot in its stroke plus the name in `label.*`; project = a
tag (tint + ink); importance = a word in `label.secondary` with weight, shown only when not Normal
(Urgent gets `status.danger` ink); status (in progress, waiting) = a word, not a colour (F-COL-04).
A screen at rest shows at most one filled accent element.

### 3.2 Type

Inter only (owner, feedback-2), Latin and Cyrillic. Weights shipped: 400, 500, 600, 700 (static on
Android via `@expo-google-fonts/inter`; the web keeps the self-hosted variable font with
`font-optical-sizing: auto`). Tabular figures (`font-variant-numeric: tabular-nums` / `fontVariant:
["tabular-nums"]`) are part of the numeric roles, not a per-site class (F-TYP-06). Sizes follow
Material/HIG body sizes (16 phone, 15 desktop), ratio ≈ 1.15. Line heights are RU-safe (≥ 1.25 for
titles, ≥ 1.35 for body and meta).

| Role | Phone size/line/weight/tracking | Desktop | Use |
|---|---|---|---|
| `largeTitle` | 32/38 · 700 · −0.022em | 28/34 · 700 · −0.02em | top-level screen title (Now, Day, Week, Inbox, Projects, Insights, History, Settings, More) |
| `title1` | 24/30 · 650→600 · −0.016em | 22/28 · 600 · −0.014em | pushed-screen title (task, project, preset) |
| `title2` | 20/26 · 600 · −0.01em | 18/24 · 600 · −0.008em | sheet and dialog titles, the detail-pane title |
| `headline` | 17/22 · 600 · −0.006em | 15/20 · 600 | group headers that are headings, emphasised row titles |
| `body` | 16/22 · 400 | 15/21 · 400 | row titles, paragraphs, field text |
| `callout` | 15/20 · 400 | 14/19 · 400 | secondary paragraphs, sheet body copy |
| `subhead` | 14/19 · 500 | 13/18 · 500 | section headers of grouped lists (sentence case, `label.secondary`) |
| `footnote` | 13/18 · 400 | 12/17 · 400 | meta lines under row titles |
| `caption` | 12/16 · 500 · +0.01em | 12/16 · 500 | tags, tab labels, chart labels |
| `caption2` | 11/14 · 600 · +0.02em | 11/14 · 600 | badges only (floor: nothing functional below 11; F-TYP-05) |
| `numeric.live` | 22/26 · 600 · tnum · −0.01em | 20/24 · 600 · tnum | the running activity's elapsed time |
| `numeric.value` | 16/22 · 500 · tnum | 15/21 · 500 · tnum | durations, times and counts in rows |
| `numeric.stat` | 28/32 · 600 · tnum · −0.02em | 24/28 · 600 · tnum | Insights tile values |

Rules:
- No eyebrow or kicker above a title (impeccable craft-floor ban; F-TYP-02). The date moves to a
  subtitle under the large title (Now, Day) or into the period control (Week, History, Insights).
- One section-header treatment: `subhead`, sentence case, `label.secondary`, 24 px above / 8 px
  below; announced as a heading of the right level (F-A11Y-05).
- Text sizes are `sp` on Android: `allowFontScaling` stays on, with `maxFontSizeMultiplier` 1.6 on
  chrome (tab labels, badges, time-bar buttons) and none on content; no fixed-height text boxes
  (F-AND-05).
- Numbers and units go through one formatter in core (`formatDuration`, `formatCount`,
  `formatNumber` with `Intl`): RU uses a non-breaking space before units («2 ч 05 мин», «1 284»),
  a decimal comma, and rolls hours into days past 48 h (F-CPY-04).

### 3.3 Spacing and layout

A 4-pt scale in px/dp: `space.0` 0 · `1` 2 · `2` 4 · `3` 8 · `4` 12 · `5` 16 · `6` 20 · `7` 24 ·
`8` 32 · `9` 40 · `10` 48 · `11` 64. Nothing else exists (the incumbent has 101 values; F-LAY-10).

| Layout role | Phone | Desktop | Notes |
|---|---|---|---|
| `gutter` | 16 | 32 (content column), 24 (pane) | the screen's side margin |
| `row.padX` / `row.padY` | 16 / 12 | 16 / 10 | grouped-list rows; min height 52 phone, 44 desktop |
| `row.gap` | 12 | 12 | leading control ↔ text |
| `cell.radius` gap | 8 | 8 | between groups inside one section |
| `section.gap` | 24 | 28 | between grouped sections |
| `header.top` | 8 below the top inset | 28 | large-title block |
| `header.bottom` | 12 | 16 | title block → first content |
| `sheet.pad` | 20 | 24 | sheet/dialog content padding |
| `content.max` | — | 720 (list column), 960 (Day, Insights) | readable width; the scroller is the window, not the column (F-WEB-05) |
| `sidebar.width` | — | 248 | |
| `inspector.width` | — | 400 (min 360, max 480) | the detail pane |

**Shell regions (fixes F-LAY-02/03/04).** One shell, three regions: navigation · content ·
inspector. Breakpoints: `compact` < 600 (phone: tab bar, pushed screens, sheets), `medium`
600–1023 (tablet/foldable: navigation rail + content; the inspector opens as a sheet; portrait
lock removed), `expanded` ≥ 1024 (sidebar + content + inspector). The inspector exists only on
screens with a selection (Now, Week, Inbox) and is **collapsed when nothing is selected** (the list
takes the space; F-LAY-03). **Region budget (F-LAY-01):** fixed bottom chrome (time bar + tab bar)
may take at most 40 % of the viewport height; above that the time bar collapses to its one-row
running summary, and at 200 % zoom it scrolls with content.

### 3.4 Radius

`radius.xs` 4 (hue chips in charts, the selected-row bar) · `sm` 8 (small buttons, segmented
thumb, fields inside cells, tags in A/C) · `md` 12 (buttons, fields, the composer) · `lg` 16
(grouped-list groups, the running card, popovers) · `xl` 20 (desktop dialogs) · `sheet` 28 (phone
sheet top corners) · `pill` 999 (chips, switches, badges, tags in B, the segmented track).

**Nested rule:** inner radius = outer radius − padding (min `xs`): a 16-radius group with 8 inset
holds 8-radius controls. Pill only for chips, switches, badges and tags (F-LAY-05 inventory: 12
radius classes for 5 tokens today).

### 3.5 Elevation and borders

| Element | Fill | Hairline | Shadow (light) | Dark |
|---|---|---|---|---|
| screen | `bg.app` | — | — | — |
| grouped list / card | `bg.cell` | — | — (`shadow.card` only on the desktop running card) | tonal step only |
| row separators | — | `separator`, inset to text | — | same |
| field at rest | `bg.inset` (in cells) or `bg.cell` (on app) | `outline` 1 px | — | same |
| sidebar | `bg.sidebar` | `separator` on its edge | — | same |
| sheet / dialog / popover / toast | `bg.elevated` | — | `shadow.overlay` | `bg.elevated` + 1 px `rgba(237,237,234,.08)` inner hairline, no blur shadow |
| scrim | `scrim` | — | — | — |

A hairline and a fill never both mark the same boundary. No border around cells, cards, chips at
rest, or the composer (F-LAY-05).

### 3.6 Icons

lucide-react-native only, `absoluteStrokeWidth`, **stroke 1.75 at every size** (F-CMP-21: 7 sizes,
6 strokes today). Sizes: `icon.inline` 16 (inside meta lines, next to `footnote`), `icon.control`
20 (buttons, rows, sidebar, fields), `icon.bar` 24 (tab bar, app-bar actions). Colour:
`label.secondary` by default, `label.primary` when the icon is the only label of a control, the
accent only when the icon is the primary action. Alignment: the icon's optical centre sits on the
cap-height centre of the adjacent text (`alignItems: center` on a row whose height equals the
text's line box). No glyphs as icons (`↵`, `⋯`; F-CMP-10). Stop is a filled rounded square on a
neutral button, never an outlined square (F-CMP-04). Filled icon variant for the selected tab on
Android (Material).

### 3.7 Hit targets, focus and press

- Minimum target 48 × 48 dp on Android, 44 × 44 px on the web; small visuals extend with
  `hitSlop` (never by growing the glyph). Adjacent targets ≥ 8 dp apart (F-AND-01, F-A11Y-06).
- **State layer** (one implementation in the kit, `ui/pressable.tsx`): rest · hover (`fill.1`,
  only under `(hover: hover)`) · pressed (Android: ripple `fill.3`, borderless for icon buttons;
  web: `fill.2` overlay, in 0 ms, out `motion.duration.xs`) · focus-visible (`focus` ring) ·
  selected (role-specific, never colour alone) · disabled (labels drop to `label.quaternary`, fills
  to `fill.1`; one disabled treatment, no opacity on accent fills: F-COL-13).
- Forced colours: the state layer maps selected to `Highlight`/`HighlightText`, the focus ring to
  `Highlight`, control boundaries to `ButtonBorder` (F-A11Y-04).

### 3.8 Motion tokens

| Token | Value | CSS mirror |
|---|---|---|
| `duration.xs` | 100 ms (press, hover, tooltip exit) | `100ms` |
| `duration.sm` | 160 ms (fades, tooltip, segmented/switch thumb) | `160ms` |
| `duration.md` | 220 ms (disclosure height, toast, row close-up) | `220ms` |
| `duration.lg` | 280 ms (sheet/dialog enter, route push) | `280ms` |
| exits | 0.7 × enter: 70 / 110 / 160 / 200 ms | |
| `easing.enter` | `Easing.bezier(0.2, 0.8, 0.2, 1)` (strong ease-out) | `cubic-bezier(.2,.8,.2,1)` |
| `easing.exit` | `Easing.bezier(0.4, 0, 1, 1)` (ease-in) | `cubic-bezier(.4,0,1,1)` |
| `easing.move` | `Easing.bezier(0.3, 0, 0, 1)` (in-place change) | `cubic-bezier(.3,0,0,1)` |
| `spring.sheet` | `{ damping: 30, stiffness: 320, mass: 1 }` (drag release) | `280ms easing.enter` |
| `spring.thumb` | `{ damping: 24, stiffness: 420 }` | `160ms easing.move` |
| `reduced` | travel and scale replaced by an opacity fade of `duration.sm`; never 0 for a change that carries meaning | `@media (prefers-reduced-motion: reduce)` |

Nothing UI-level exceeds 300 ms (F-MOT-04). Every preset is a pair (enter + exit) and has a reduced
variant; fixed timers are never paired with animations — the next step waits for the animation's
completion callback (F-MOT-03).

**Frequency classes (review-animations standard 2).**

| Class | Actions | Motion |
|---|---|---|
| none | keyboard navigation and hotkeys, list mount, filter change, day/week switch content, typing, focus moves, sort | instant; no entering animations on rows |
| reduced (100+/day) | check-off, start/stop/switch activity, tab switch, chip toggle | ≤ 220 ms, short travel or none, opacity-led |
| standard | sheets, dialogs, popovers, disclosure, toast, route push, inspector open | `duration.lg`/`md` with paired exits |
| delight | none in this overhaul beyond the check-off's dissolve (owner request, feedback-3), kept ≤ 300 ms | |

### 3.9 Haptics (Android)

Through `expo-haptics` (new dependency): check-off → `Haptics.performAndroidHapticsAsync(Confirm)`;
start/stop/switch activity → `Clock_Tick`; long-press that opens a menu → `Long_Press`; a refused
action (validation) → `Reject`; destructive confirm → `Confirm`. None on the web; none on scroll,
tab switch or typing. Honours the system's touch-feedback setting (the platform does this).

---

## 4. Component spec

<!-- §4 is drafted against §1–3 and inserted below. -->

## 5. Screen spec

<!-- §5 is drafted against §1–4 and inserted below. -->

## 6. Motion spec

Every transition in the app. "Reduced" is the `prefers-reduced-motion` / Android "Remove
animations" variant. Durations and easings are §3.8 tokens.

| Trigger | Element | Freq. | Enter | Exit | Duration | Easing | Reduced | Platform notes |
|---|---|---|---|---|---|---|---|---|
| press (any control) | state layer | 100+ | ripple / fill on pointer-down, 0 ms | fade out | out 100 | exit | same | Android: `android_ripple` via the kit; web: overlay |
| hover (web, hover pointer) | state layer | high | `fill.1` | fade | 100 / 70 | move | same | `@media (hover:hover)` only |
| check a task | check circle | 100+ | fill + check stroke draw on pointer-down | — | 100 | enter | instant fill | haptic Confirm on Android |
| check a task | row content | 100+ | — | dissolve: opacity 1→0, scale 1→0.98, a light particle pass (≤ 24 specks, transform-only, one layer) | 260 | exit | opacity fade 160, no particles | starts on press (optimistic); the store write does not gate it (bug-lessons 3) |
| check a task | rows below | 100+ | close up (layout) | — | 220 | move | instant | the same `RowList` transition on Android **and** web (F-MOT-02); next step on animation end, not a timer |
| check a task | Undo toast | 100+ | slide 8 px + fade, starts with the dissolve | fade | 220 / 160 | enter / exit | fade only | anchored above the bottom chrome, never covering the next row's check |
| start / switch activity | running card | 100+ | the new row fades in at its place; time digits roll? **no** — they change instantly | old row fades | 160 / 110 | enter / exit | opacity only | haptic Clock_Tick |
| stop activity | running card | 100+ | — | row collapses (height) | 220 | move | instant | |
| time-bar unfold ("Start something else", phone) | time-bar panel | 10+/day | height + fade | reverse | 220 / 160 | enter / exit | opacity | max height = region budget (§3.3) |
| composer unfold (Enter / +) | composer form | 10+/day | height grows from the measured line height, content fades in after 60 ms; focus moves **after** layout (`preventScroll`) | reverse | 220 / 160 | enter / exit | opacity | e2e geometry sampler: nothing leaves the card (bug-lessons 5; F-MOT-08) |
| assistant preview appears | preview card | 10+/day | fade + 4 px rise inside the composer | fade | 160 / 110 | enter / exit | opacity | |
| filter chip change | list | 10+/day | none (instant swap) | none | 0 | — | — | rows never re-enter (F-MOT-07) |
| "In future · n" / "Show more" / group fold | disclosure | 10+/day | chevron rotates 90°, content height + fade | reverse | 220 / 160 | move | opacity | one `Disclosure` primitive (F-MOT-10) |
| Day ‹ › / Week ‹ › / date pick | content | 10+/day | none: the new day replaces the old in place | — | 0 | — | — | no crossfade of two days (F-MOT-07) |
| tab switch (phone) | screen | 100+ | none (Material: no transition between top-level destinations; web: none) | — | 0 | — | — | selected tab's indicator pill moves `spring.thumb` (Android) |
| route push / pop (task, project, preset, More items) | screen | 10+/day | Android: native stack slide (react-native-screens default, Material shared-axis X); web: 12 px slide + fade | reverse | 280 / 200 | enter / exit | fade 160 | predictive back preview on Android 14+ |
| row → inspector (desktop) | inspector | 10+/day | content fades in, pane width does not animate when already open; opening from collapsed slides the pane 16 px + fade | reverse | 220 / 160 | enter / exit | fade | |
| sheet (phone) | sheet + scrim | standard | sheet translates from its **own height** (measured), scrim fades in place | sheet down, scrim fades; drag release uses `spring.sheet` with velocity | 280 / 200 | enter / exit | fade 160 | drag handle is real: swipe down dismisses past 30 % or 800 dp/s; detents medium/large where content scrolls (F-CMP-02, F-MOT-09) |
| dialog (desktop) | dialog + scrim | standard | scale 0.96→1 + fade | scale 1→0.98 + fade | 220 / 160 | enter / exit | fade | never from scale 0 (F-MOT-06) |
| popover / picker (desktop) | popover | standard | scale 0.98→1 + fade from the anchor's edge (transform-origin = anchor) | fade | 160 / 110 | enter / exit | fade | anchored to its button, not centred (F-CMP-13) |
| tooltip | tooltip | high | fade + 2 px from the anchor, after 400 ms hover delay (0 on keyboard focus) | fade | 100 / 70 | enter / exit | fade | hoverable bubble, Escape dismisses (WCAG 1.4.13; F-WEB-04); not on tap — tap shows an inline hint (F-WEB-04) |
| toast | toast | 10+/day | 8 px rise + fade | fade + 4 px drop | 220 / 160 | enter / exit | fade | placement rule §4 (F-CMP-12) |
| segmented / switch | thumb | 10+/day | thumb slides | — | 160 | `spring.thumb` | instant | |
| slider | thumb | rare | follows the finger (no animation); value text updates live | — | 0 | — | — | no `scale-110` jump (F-MOT-14) |
| skeleton → content | skeleton | per load | skeleton shimmer off; content fades in | — | 160 | enter | no shimmer, fade | shimmer 1.2 s period, ≤ 6 % luminance amplitude; shown only after 300 ms of waiting |
| progress bar value change | bar fill | rare | width animates | — | 220 | move | instant | |
| running indicator | dot | always | **static** dot in the category stroke; no breathing pulse (F-MOT-12) | — | — | — | — | the live time is the motion |
| update banner (web) | banner | rare | slides in **over** content (no layout push), 8 px + fade | fade | 220 / 160 | enter / exit | fade | F-WEB-07 |
| proposal accepted (assistant) | preview → row | 10+/day | the preview collapses, the created row appears with a 1-time `accent.quiet` highlight that fades over 600 ms | — | 220 + 600 | move | highlight without fade | "proposals read as proposals" (P5 product principle) |

---

## 7. Web / PWA layer spec

Fixes land only in the web layer: `.web.tsx` siblings, `apps/app/global.css`,
`apps/app/src/platform/web/` stand-ins (registered in `metro.config.js` `WEB_SHIMS`),
`apps/app/public/`, `scripts/build-web.ts`. Never `Platform.OS === "web"` around a whole screen.

| Item | Spec | Lands in | Findings |
|---|---|---|---|
| Theme at first paint | a CSP-safe external `public/theme-boot.js` (inline scripts are blocked by `_headers`) reads `localStorage["pace.theme"]` and sets `data-theme`, `color-scheme`, the body background and both `theme-color` metas before React loads | `public/theme-boot.js`, `public/index.html`, `build-web.ts` | F-WEB-02 |
| Theme while running | `src/platform/document-theme.web.tsx` keeps `theme-color` (and the dimmed value while a sheet's scrim is up), `color-scheme` and the background in sync with the in-app toggle; native sibling is a no-op | new `.web.tsx` + base | F-WEB-02 |
| Literals | `#f4f5f7`, `#0b0b0c`, manifest `background_color`/`theme_color` and splash colours are generated from tokens by `build-web.ts` and `scripts/generate-icons.ts` | build scripts | F-WEB-02 |
| Document title | `src/platform/document-title.web.tsx`: `«<screen> · Pace»`, task/project pages use the entity's name, in the account language | new `.web.tsx` | F-WEB-01 |
| `<html lang>` at first paint | theme-boot also sets `lang` from the stored account language (falls back to the device language); the app never paints English first on a Russian account (fixes the 1.5–5 s flip; store the language with the session) | `theme-boot.js`, `document-language.web.tsx`, client settings bootstrap | F-DAT-04 |
| Links | the kit's `Link`/`NavItem` render `<a href>` through expo-router `Link` (`asChild`) so Ctrl/⌘-click and middle-click open new tabs; external URLs get `target="_blank" rel="noopener"` | `ui/nav-item.tsx`, `ui/link.tsx` | F-WEB-03 |
| Headings | `ScreenHeader` and `SectionHeader` take `level` (1 for the screen title, 2 for sections, 3 inside panes) → `aria-level` | kit | F-A11Y-05 |
| Landmarks | `main` around content, `nav` for sidebar/tab bar, a skip link to main (visible on focus) | `ui/shell.web.tsx` | F-A11Y-12 |
| Focus | `global.css`: remove the blanket `outline: none`; `:focus-visible` ring from `--pace-focus` (2 px + 2 px offset, radius follows the element), never on mouse click; inside sheets the ring is not clipped (sheet content has `overflow: visible` padding of 4 px) | `global.css`, kit state layer | F-A11Y-01 |
| Hover | every hover style inside `@media (hover: hover) and (pointer: fine)` | `global.css`, state layer | F-WEB-04 |
| Scroller | the window scrolls on desktop (the content column is not a scroll box), so the scrollbar sits at the window edge and the wheel works over the gutters | `ui/screen.web.tsx` | F-WEB-05 |
| Overscroll | `html, body { overscroll-behavior-y: none }` (no pull-to-refresh reload) and `overscroll-behavior: contain` on sheets and inner scrollers | `global.css` | F-WEB-06 |
| Keyboard | viewport meta adds `interactive-widget=resizes-content`; focused fields scroll into view above the keyboard (`visualViewport` listener in `src/platform/keyboard.web.ts`) | `public/index.html`, new `.web.ts` | F-AND-04 |
| Safe areas | `viewport-fit=cover` kept; tab bar, sheets, toast and update banner pad with `env(safe-area-inset-*)`; toast offset is measured from the real chrome height, not a constant | kit | F-CMP-12 |
| Text selection on controls | `user-select: none; -webkit-touch-callout: none` on buttons, chips, tabs, rows; text in content stays selectable | `global.css` | F-WEB-10 |
| Selection colour, caret, scrollbars | `::selection { background: var(--pace-selection) }`, `caret-color: var(--pace-accent)`, `scrollbar-color` from `label.quaternary`/transparent, `color-scheme` per theme | `global.css` | F-WEB-14 |
| Fields | 16 px text on phone web (no iOS zoom; F-WEB-09); `autocomplete`, `autocapitalize`, `spellcheck`, `inputmode`, `enterkeyhint` per field purpose through the kit's `TextField purpose=…` (title: `spellcheck`, `autocapitalize=sentences`; URL: `inputmode=url`, no spellcheck; time: `inputmode=numeric`); visible labels are `<label for>` | kit | F-WEB-08, F-A11Y-15 |
| Numerals | `font-variant-numeric: tabular-nums` comes from the numeric type roles | tokens → classes | F-TYP-06 |
| Fonts | keep self-hosted Inter variable (Latin + Cyrillic `unicode-range`, `font-display: swap`, preload of the Latin + Cyrillic files actually used); `font-optical-sizing: auto` | `global.css`, `public/fonts` | — |
| Update banner | compact card «Pace обновился · Обновить страницу» / "A new version of Pace · Refresh page" (owner's feedback-4 copy), overlays without layout push, 44 px Refresh; Refresh is disabled with "Save your draft first" while a composer/time-bar draft is non-empty, and `beforeunload` guards drafts | `update-banner.web.tsx`, i18n | F-CPY-01, F-WEB-07 |
| Manifest | separate `any` and `maskable` icons, `id`, `lang`/`dir` per build, `screenshots` (from design-shots), two `shortcuts` (New task, Day), light and dark splash | `public/manifest.json`, `generate-icons.ts` | F-WEB-13 |
| Layout shift | reserve space for async rows (skeletons with the final row height), fonts preloaded, no late header swaps; CLS ≤ 0.05 on Now and History | kit, screens | F-WEB-11 |
| Bundle | route-level code splitting via expo-router's async routes for the heavy screens (Insights, History, Settings, Week); target first-load JS ≤ 450 KB gz | `app.config.ts` / router | F-WEB-12 |
| Local CSP | `scripts/serve-web.ts` applies `_headers` so tests see the production CSP | `serve-web.ts` | F-WEB-16 |
| Tooltip | hoverable, dismissable with Escape, persistent while hovered (WCAG 1.4.13); delay 400 ms; touch shows an inline hint instead | `tooltip.web.tsx` | F-WEB-04 |
| Favicon | SVG favicon with `prefers-color-scheme` inside, PNG fallbacks, `.ico` precached | `public/` | F-WEB-15 |

---

## 8. Accessibility spec

- **Contrast targets.** Text: WCAG 2.x ≥ 4.5:1 (≥ 3:1 for ≥ 18.66 px bold / 24 px) **and** APCA
  |Lc| ≥ 75 for body (`body`, `callout`), ≥ 60 for `footnote`/`subhead`, ≥ 50 for `caption` and
  `label.tertiary` text at ≥ 13 px; non-text UI (control boundaries, focus ring, selected markers,
  chart marks, switch knob vs track) ≥ 3:1 against every ground it sits on (WCAG 1.4.11). Measured
  on composited colours (tints and alpha fills blended onto their real ground).
- **Focus.** Every interactive element shows the `focus` ring on keyboard focus (2.4.7, 2.4.13 AA
  appearance: 2 px, ≥ 3:1). Focus order follows the visual order (sidebar → header → content →
  inspector). Dialogs and sheets trap focus, start on the first meaningful control (not the
  backdrop; F-A11Y-07), return focus to the trigger on close; a control replaced by another hands
  focus to its successor (`useConfirmFocus`, bug-lessons 5; F-A11Y-08); deleting a task moves focus
  to the next row and shows the Undo inline in its place for 10 s, pausing on hover/focus
  (F-A11Y-02).
- **Names and roles.** Every icon-only control has `accessibilityLabel` (enforced by a lint rule
  over `IconButton` and `Pressable` without text children); dialogs are named by their title
  (`aria-labelledby`); option groups (segmented, chip groups) are `radiogroup` with a name; the
  phone tab bar is `navigation` with links on the web and Material navigation-bar semantics on
  Android, the selected destination `aria-current="page"` (F-A11Y-11); headings have levels
  (F-A11Y-05); Week blocks announce their day and time (F-A11Y-09); stats announce "value label"
  as one phrase (F-A11Y-13).
- **Live regions.** Toasts are `status` (polite) and announce once; the running timer is **not** a
  live region — its row announces state changes (started, stopped, past expected) once
  (F-A11Y-10).
- **Shortcuts.** Single-key shortcuts (`n`, `f`) only while focus is in the app's list region and
  not in a text field, and a Settings switch turns single-key shortcuts off (2.1.4; F-A11Y-03);
  modifier shortcuts (⌘/Ctrl+Enter etc.) stay.
- **Targets.** ≥ 48 dp Android / 44 px web (§3.7).
- **Zoom and reflow.** At 200 % and at 320 CSS px the task list keeps ≥ 50 % of the viewport
  height (region budget §3.3); at 400 % the time bar scrolls with content (1.4.10; F-LAY-01).
- **Reduced motion, forced colours, text spacing.** §3.8 reduced variants; §3.7 forced-colours
  mapping; 1.4.12 text-spacing override must not clip (already passes; keep a test).
- **Language.** `lang` on the document follows the account; Russian user content inside an English
  UI is marked `lang="ru"` where the language is known (task titles parsed from Russian text)
  (F-A11Y-20, nit).
- **Tests that check it** (§10): a contrast unit test over `tokens.json` (every role pair in §3.1,
  both themes, WCAG and APCA, composited); e2e: axe with every sheet/dialog open and in forced
  colours; a focus sweep (Tab through Now, Day, task pane, Week, Settings, one sheet: every stop has
  a visible ring of ≥ 2 px and ≥ 3:1, order matches DOM-visual order); a zoom check (200 %, 320 px:
  list height ≥ 50 % viewport); `document.title` and heading levels per route; a reduced-motion run
  of the check-off and sheet (no blank row, completion-driven); jest: kit target sizes ≥ 48 dp on
  the Android preset.

---

## 9. Migration plan

### 9.1 Order

1. **Guard rails** — commit `e2e/design-shots.e2e.ts`; the contrast unit test over v2 tokens (red
   first); the no-raw-values lint rule at `warn` with the count recorded; the dev-only worst-case
   route; `inlineRem: 16`.
2. **Tokens v2** — `tokens.json` v2 + generated Tailwind theme, `vars()`, motion constants, web
   literals; the old→new map applied mechanically (§9.2); categories get 12 hues.
3. **Primitives** — `Pressable` (state layer), `Text` roles, `Icon`, `Surface`/`Group`,
   `ListRow`, `SectionHeader`, `ScreenHeader`, `Disclosure`, `Presence`, `Sheet` (gestures +
   exit), `Dialog`, `Popover`, `Toast` placement, `TextField` (purpose, touched gate), `Link`.
4. **Components** — every file in `apps/app/src/ui/*` and the shared rows (`task-row`, `meta-line`,
   `tracking/*`, `task-fields/*`, `assistant/*`, `notifications/*`) to §4.
5. **Screens** — §5, one at a time, Now and Day first.
6. **Motion** — `motion.ts` rewritten to §3.8 and §6; reduced-motion e2e.
7. **Web/PWA layer** — §7.
8. **Identity details** — the Day line, the running "train", the logo and favicon in Pace green,
   the proposal highlight; only what §2 names.
9. **Close-out** — lint rule to `error`; visual-regression goldens; README screenshots; `DESIGN.md`
   regenerated from the shipped code; `CLAUDE.md` Design paragraph; bug-lessons entries; final QA.

### 9.2 Old → new token map

| Old (`tokens.json` v1 / class) | New | Note |
|---|---|---|
| `bg` | `bg.app` | |
| `surface` | `bg.cell` | |
| `raised` | `fill.3` (selected neutral) or `bg.elevated` (overlays) | decided per use; the incumbent used it for both (F-COL-02) |
| `line` | `separator` (decorative) / `outline` (control boundary) | split by job |
| `track` | `fill.4` | |
| `fg` | `label.primary` | |
| `fg2` | `label.secondary` | |
| `muted` | `label.secondary` (text ≥ 13 px meta) or `label.tertiary` | the incumbent used muted/faint interchangeably |
| `faint` | `label.tertiary` (text) / `label.quaternary` (non-text) | `faint` as text fails AA (F-COL-03) |
| `accent` (lime) | `accent` (Pace green) | |
| `accentFg` | `accent.on` | |
| `accentText` | `accent.text` | |
| `accentQuiet` (indigo) / `accentQuietFg` / `accentQuietText` | removed; per-job replacements in §3.1 | |
| `onColor` | `accent.on` or hue `ink` | |
| `warn` | `status.warn` / `status.danger` | split: past-expected vs late/destructive |
| `question` | `status.question` | |
| `inverse` / `inverseFg` | `label.primary` on `bg.elevated` (toast) | toast becomes an elevated surface |
| `project.<name>` | `hue.<name>.stroke` | `coral` → `red` |
| `ink-<name>` | `hue.<name>.ink` | per theme now |
| `bg-project-*/22` | `hue.<name>.tint` | 12 % / 18 % |
| `radius.sm/md/lg/xl` 8/10/12/14 | `radius.sm` 8 / `md` 12 / `lg` 16 / `xl` 20 | 10 and 14 disappear |
| `rounded-full` / `rounded-pill` | `radius.pill` | |
| `rounded-2xl`, `rounded-t-[22px]`, `rounded-[1px]` | `radius.lg` / `radius.sheet` / `radius.xs` | |
| `text-[Npx]` (343 uses) | the type role classes (`text-body`, `text-footnote`, …) | |
| spacing half-steps and arbitrary values | nearest `space.*` step | 108 half-steps, 11 arbitrary |
| `motion.ts` durations 140–900 | `duration.*` + `easing.*` pairs | |

### 9.3 The lint rule (Hard rule 3)

A custom ESLint rule `pace/no-raw-design-values` in the repo's ESLint plugin set (`eslint.config.ts`,
types in `eslint-plugins.d.ts`), over `apps/app/src/**` and `apps/app/app/**`:
- hex/`rgb(`/`rgba(`/`hsl(` string literals and colour names outside `packages/core/src/design`;
- numeric `borderRadius`, `fontSize`, `lineHeight`, `letterSpacing` in style objects;
- numeric `duration`, `withTiming(…, { duration: <number> })`, `withSpring` configs, `withDelay(<number>)`,
  `setTimeout` inside files that import reanimated;
- Tailwind arbitrary values (`[...]`) in `className` strings, and classes outside the token scales.
Starts at `warn` (count recorded in the plan's first task), flips to `error` in the close-out task;
inline disables need `-- <reason>` (repo rule). `bun lint` enforces it.

### 9.4 Visual regression and documentation

- `e2e/design-shots.e2e.ts` (committed in batch 1) re-shoots the matrix after each batch;
  before/after pairs go into each PR description.
- After STOP 2 is released and batch 8 lands: Playwright `toHaveScreenshot` goldens over a
  focused subset of the matrix (every route × desktop/phone × light/dark in EN, plus RU for Now,
  Day, Settings, task) with a 0.2 % pixel threshold, committed under `e2e/__screenshots__/`.
- `README_SHOTS=docs/screenshots bun test:e2e e2e/readme-shots.e2e.ts` refreshes the README images
  (they are stale since 2026-10-08).
- `DESIGN.md` is regenerated from the shipped code by `dev-core:impeccable-documenter` at the end
  (marked "target, not yet shipped" from STOP 2 until then).
- `CLAUDE.md` "Design" paragraph is rewritten to the plugin table of the owner's brief.

---

## 10. Test plan

Per `docs/testing.md`; behaviour changes start with a failing test.

| Level | What moves there | Files |
|---|---|---|
| unit (`bun test:unit`) | the contrast table over `tokens.json` v2 (every §3.1 pair, both themes, WCAG and APCA, composited tints and fills) so a bad colour fails the build; token shape (every theme has every key); 12 distinct category hues (ΔE OKLab ≥ 8 between any two); the number/duration formatters (RU nbsp, decimal comma, days past 48 h, grapheme-safe initials); text-length policies of the view-models (submit label «Сдать 37») | `packages/core/src/design/contrast.test.ts`, `tokens.test.ts`, `i18n.test.ts`, `packages/client/src/view-models/*.test.ts` |
| app (`bun test:app`, jest-expo) | every kit component's states (rest, pressed, disabled, selected, loading, error) by role and `accessibilityState`; labels on icon-only controls; target sizes ≥ 48 on the Android preset; Sheet dismiss paths (handle drag, scrim, Back); TextField's touched gate (no error before interaction; F-CMP-03); toast placement from measured chrome; `deadControls()` over every redesigned phone screen (bug-lessons 10) | `apps/app/src/ui/*.test.tsx`, `src/features/**/*.test.tsx` |
| e2e (`bun test:e2e`, Playwright + axe) | the design-shots matrix (manual review, then goldens); axe with overlays open and in forced colours; focus sweep; zoom/reflow; titles and heading levels; reduced-motion check-off and sheet; motion geometry sampler for composer unfold, sheet and check-off (nothing leaves its container, no blank row); worst-case overflow sweep on the dev fixtures (`scrollWidth ≤ clientWidth` everywhere, no text past its box); network steady-state after the redesigned flows (no request repeated; bug-lessons 1) | `e2e/design-shots.e2e.ts`, `e2e/a11y.e2e.ts`, `e2e/motion.e2e.ts`, `e2e/worst-case.e2e.ts` |
| QA (Sonnet, `docs/qa.md`) | a round after every batch; the new checklist lines: colour budget per screen, one filled accent per view, title height constant across destinations, sheets leave the way they came, RU at 390 for every changed screen | `context/qa-round-<n>.md` |

---

## 11. Verify on hardware (Android)

The owner's checklist, merged from every review (`findings.md` › Verify on hardware), plus what
this spec introduces. Use the Expo build, Chrome in a tab and the installed PWA, both themes, RU.

1. **Sizes after `inlineRem: 16`:** Stop, "Yes, still", ▶, the check circle, tab-bar tabs and a
   Button measure ≥ 48 dp; rows do not shift around the check circle.
2. **Font scale 1.3× and max** in RU: nothing clips in tab labels, time-bar buttons, chips, badges,
   tags, sheet titles; the running card grows instead of clipping.
3. **Keyboard (edge-to-edge):** the time-bar field, composer, Task picker search, Settings time
   fields and the activity sheet's time fields stay visible above the keyboard; the tab bar hides
   while typing.
4. **Sheets:** dragging the handle down dismisses; system Back closes; the sheet slides from its own
   height and slides back; detents snap on long pickers.
5. **Predictive back** (Android 14+): the preview shows on pushed screens and sheets; never hijacked.
6. **System bars:** the status and navigation bars follow the in-app theme in both mismatched cases;
   the status bar dims under a scrim; cold start shows no wrong-theme flash.
7. **Ripple and haptics:** every control ripples; check-off gives a Confirm tick, start/stop a
   Clock tick; no haptic on scroll or tab switch; disabled when the system turns touch feedback off.
8. **Navigation bar:** the Material navigation bar with a filled icon and pill indicator on the
   selected tab; TalkBack announces destinations.
9. **Long press in Chrome:** no text selection or callout on controls.
10. **Safe areas with 3-button navigation:** tab bar, toast and sheets clear the system bar.
11. **Motion:** check-off ≤ 300 ms with no frame drops on a mid-range phone; rows close up smoothly;
    no pulse animation running while something is tracked (battery).
12. **Volume:** a 1 284-task account scrolls without jank; History and Notifications too.
13. **Medium widths:** a tablet or unfolded foldable shows the rail layout and rotates.
14. **Switch in dark:** the off knob is visible on sheets and the page.
15. **Server picker** (Android only): a long tailnet host ellipsizes in the middle and keeps
    "Change" on its line.
16. **Install and update:** rich install sheet, shortcuts on long-press, the update card clears the
    status bar and its button is ≥ 44 px.

---

## 12. Open questions for the owner

Answer "defaults" to accept every recommended default.

| # | Question | Options | Recommended default | Consequence |
|---|---|---|---|---|
| Q1 | Which visual world? | A Тетрадь (ink blue) · **B Линии (metro, Pace green)** · C Хронограф (lime) · Canon (Apple straight) | **B** | B: categories/projects become a hue family, logo stays green, indigo goes. A: logo and actions turn ink blue. C: closest to today, lime stays. |
| Q2 | Check-off effect | **keep a short dissolve (≤ 300 ms, particles light)** · ink strike-through then collapse (A-style) · plain fade + collapse | **short dissolve** | Keeps your feedback-3 request (Telegram-like dissolve) while fixing the 1-second wait you flagged in feedback-4. |
| Q3 | "Normal" importance on rows | **hide it (show only Urgent / Priority / Low)** · keep as a grey word | **hide** | Rows get quieter; importance still visible when it matters and always in the task's detail. |
| Q4 | Status "Paused" (the Pause icon in the task header) | **remove the header Pause; pausing stays in the close-as menu** · keep | **remove** | You asked to remove Waiting in feedback-2; the icon is a leftover (F-CMP-10). |
| Q5 | Delete a task | **confirm inline ("Delete" → "Delete task?" in place), then Undo in the row for 10 s** · keep one-tap delete + toast | **inline confirm** | Fixes the accessibility blocker F-A11Y-02 without a modal. |
| Q6 | Single-key shortcuts `n` / `f` | **keep, but only outside text fields, with a switch in Settings** · move to ⌘/Ctrl+key only | **keep + switch** | WCAG 2.1.4 compliant; your muscle memory stays. |
| Q7 | Haptics on Android | **yes (check-off, start/stop, long-press, refusal)** · no | **yes** | Adds `expo-haptics`; respects the system setting. |
| Q8 | Tablets / foldables (medium width) | **navigation rail + content, rotation unlocked** · keep the phone layout locked to portrait | **rail** | Removes the portrait lock in `app.config.ts`. |
| Q9 | Dynamic Color (Material You) on Android | **no: Pace keeps its own palette** · tint neutrals from the wallpaper | **no** | Consistent look across Android and the web. |
| Q10 | Baseline/golden screenshots in git | **goldens only for the focused subset (§9.4); the full matrix stays reproducible by script** · commit every re-shoot | **subset** | The baseline you asked to commit stays; later re-shoots don't add 50 MB per batch. |
| Q11 | Update banner copy | **"A new version of Pace · Refresh page" / «Вышла новая версия Pace · Обновить страницу»** · your wording | **as given** | Restores your feedback-4 text and pins it with a test. |
