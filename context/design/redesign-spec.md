# Pace redesign spec (design overhaul, 2026-11)

Status: **draft for STOP 1**. Nothing here is built yet. **Owner decision (2026-11-01): direction A · Тетрадь.** §2's recommendation of B is superseded; §3.1 values are re-derived for A in Phase 3 (same roles and structure; ink-blue accent, red margin as status only, the same 12-hue family). The owner picks a direction (§2) and answers
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
(Urgent gets `status.danger` ink); status = a word, except «В работе» / In progress, which is a tag in the indigo hue (owner, feedback-3) (F-COL-04).
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
screens with a selection (Now, Day, Week, Inbox) and is **collapsed when nothing is selected** (the list
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

### 3.9 Component size tokens

`size.chip.max` 180 · `size.tooltip.max` 280 · `size.switch` track 52 × 32, knob 16 off / 24 on (Material 3) ·
`layout.dialog` 560 (forms; confirmations reuse `inspector.width` 400) · `layout.popover` 360 (min 280,
max 400) · `layout.rail` 80 (medium navigation rail) · `layout.navBar` 64 (phone navigation bar content
height; insets added). Extra contrast pairs for the unit test: `bg.cell` text on `status.danger` (badge),
`accent.on` on `accent.pressed`, the dashed draft `outline` on `bg.cell`, the switch knob on its off track.

### 3.10 Haptics (Android)

Through `expo-haptics` (new dependency): check-off → `Haptics.performAndroidHapticsAsync(Confirm)`;
start/stop/switch activity → `Clock_Tick`; long-press that opens a menu → `Long_Press`; a refused
action (validation) → `Reject`; destructive confirm → `Confirm`. None on the web; none on scroll,
tab switch or typing. Honours the system's touch-feedback setting (the platform does this).

---

## 4. Component spec

Every component of `apps/app/src/ui/*` and every shared row and cluster of `apps/app/src/shared/*`, drafted
against §1–3 (direction B «Линии»), §6 (motion rows are cited as "§6 ‹trigger›") and §7–8. Token names are
§3's: colour roles without a prefix (`label.secondary`, `fill.2`, `accent.quiet`, `hue.<name>.stroke`), type as
`type.<role>`, spacing as `space.n` and the layout roles of §3.3 (`row.padX`, `gutter`, `sheet.pad`), radius as
`radius.<step>`, sizes as `size.hit` / `size.hitWeb` / `icon.inline|control|bar` / `size.row.min|compact`,
motion as `duration.*` / `easing.*` / `spring.*`. "Target" means 48 × 48 dp on Android (`size.hit`) and
44 × 44 px on the web (`size.hitWeb`), reached with `hitSlop` when the visual is smaller (§3.7). Width
classes are §3.3's: compact < 600, medium 600–1023, expanded ≥ 1024.

### 4.1 Kit structure

#### 4.1.1 New primitives (§9.1 step 3)

Every component below is built from these; screens never use a raw React Native `Pressable`, `Text` or
`TextInput` (lint, §9.3 extended: F-CMP-01 "lint against a bare Pressable outside `src/ui`").

| Primitive | File | Replaces / absorbs | Contract |
|---|---|---|---|
| `Pressable` | `ui/pressable.tsx` | 63 raw pressables, 43 `active:opacity-*`, 4 disabled opacities | The §3.7 state layer, once: rest · hover `fill.1` (only `(hover: hover)`) · pressed (Android ripple `fill.3`, bounded to `shape` or borderless for icon buttons; web `fill.2` overlay, in 0 ms, out `duration.xs`) · focus-visible `focus` ring 2 px + 2 px offset following `shape` · selected (role-specific, never colour alone) · disabled (labels `label.quaternary`, fills `fill.1`, no opacity). Props: `role`, `label` (required without a text child; lint, §8), `shape` (a radius token, so ripple, overlay and ring share it), `selected`, `disabled`, `haptic` (§3.9 meanings), `onLongPress` (only beside a visible alternative, F-CMP-20). Target auto-extended to `size.hit` / `size.hitWeb`. `flexShrink: 0` (controls never shrink). Web: `user-select: none`, `-webkit-touch-callout: none` (F-WEB-10). Forced colours: `ButtonBorder`, `Highlight` (F-A11Y-04). |
| `Text` | `ui/text.tsx` | 343 `text-[Npx]`, 26 bare `numberOfLines` | `role` = a §3.2 type role (numeric roles carry `tabular-nums`); `tone` = `label.primary…tertiary`, `accent.text`, `status.*`, `hue.<n>.ink`; `yield` (4.1.2); `chrome` sets `maxFontSizeMultiplier` 1.6 (tab labels, badges, bar buttons; §3.2); `lang` for user content when known (F-A11Y-20). `minWidth: 0; flexShrink: 1` by construction. |
| `Icon` | `ui/icon.tsx` | 45 lucide icons at 7 sizes / 6 strokes | `size: inline 16 · control 20 · bar 24`, stroke `size.stroke` 1.75 `absoluteStrokeWidth`; `tone` default `label.secondary`; `filled` (selected tab, Stop); hidden from assistive tech unless `label` is given (F-A11Y-19). Ships `StopGlyph`: a filled rounded square (`radius.xs`), never lucide's outlined `Square` (F-CMP-04). |
| `Surface`, `Group`, `List` | `ui/surface.tsx`, `ui/group.tsx`, `ui/list.tsx` | cards-in-cards, bordered boxes, `row-list.tsx` | `Surface level: app · cell · inset · elevated · sidebar` (§3.1/§3.5; elevated adds `shadow.overlay` in light, the 1 px inner hairline in dark). `Group`: an inset grouped list — `bg.cell`, `radius.lg`, no border, rows divided by `separator` inset to the text start, `space.3` between groups, `section.gap` between sections. `List`: the plain list (no cell) for long feeds — FlatList-backed, virtualised above 50 rows, layout animation off above 50 rows (F-DAT-03), `collapsable={false}` kept for Android (the `RowList` fix). |
| `ListRow` | `ui/list-row.tsx` | 9 row heights, 6 divider rules, `ChoiceRow`, settings/More/notification rows | Slots `leading` (control or `icon.control`), `title`, `meta`, `trailing` (value · control · chevron). `variant: static · navigation (Link + chevron) · action · toggle (the whole row flips its switch) · select (radio, trailing check)`. Min height `size.row.min` 52 phone / `size.row.compact` 44 desktop; padding `row.padX` / `row.padY`; gap `row.gap`. Title `type.body`, meta `type.footnote` `label.secondary`, trailing value `type.numeric.value` or `type.callout` `label.secondary`. Leading and trailing align to the **first** title line, so wrapped titles top-align (F-DAT-06 centred checks). |
| `SectionHeader` | `ui/section-header.tsx` | 8 heading treatments, 11 eyebrows | `type.subhead`, sentence case, `label.secondary`, `space.7` above / `space.3` below, inset `row.padX` to line up with cell text; `level` 2 or 3 → `aria-level` (F-A11Y-05); optional trailing `count` (`formatCount`) or one action; `collapsible` renders it as a `Disclosure` trigger. |
| `ScreenHeader` | `ui/screen-header.tsx` (rewrite, 4.2.16) | `back-header.tsx`, 5 title placements | Two kinds only: `destination` (large title) and `pushed` (back + inline title). |
| `Disclosure` | `ui/disclosure.tsx` | `animated-height`, `FoldedSection`, `time-bar-fold`, "show more" toggles | Trigger (`ListRow` or `SectionHeader`) with one `ChevronRight` `icon.inline` that rotates 90° when open, `aria-expanded`; content height + fade (§6 disclosure). Content is unmounted (or `aria-hidden` and unfocusable) while closed. |
| `Presence` | `ui/presence.tsx` | ad-hoc `entering`/`exiting`, the toast's `key` cut | Mounts/unmounts with a paired §6 preset, keeps the child through its exit, calls `onExited` from the animation's completion (never a timer; F-MOT-03); `initial={false}` by default so nothing animates on first render or list mount (F-MOT-07). |
| `Sheet` | `ui/sheet.tsx` (rewrite, 4.2.21) | the phone half of today's `Sheet` | Real drag, detents, exit, dirty guard. |
| `Dialog` | `ui/dialog.tsx` | the wide half of today's `Sheet` | Centred, never from scale 0. |
| `Popover` (+ `Menu`) | `ui/popover.tsx` | centred picker dialogs on desktop, bare glyph actions | Anchored to its trigger; `role: dialog · menu · listbox`. |
| `Toast` | `ui/toast.tsx` (rewrite, 4.2.30) | sidebar dock, constant offsets | The placement rule (4.1.4). |
| `TextField` | `ui/text-field.tsx` (rewrite, 4.2.28) | `time-input.tsx`, 9 raw `TextInput`s | `purpose`, touched gate, focus ring, `<label for>`. |
| `Link`, `NavItem` | `ui/link.tsx`, `ui/nav-item.tsx` | 341 `div[role=link]` | `<a href>` through expo-router `Link asChild` on the web; external `target="_blank" rel="noopener"` (F-WEB-03, §7). |

Components born from merges (each has its entry below): `Tag` + `hue` helpers (`ui/tag.tsx`, `ui/hue.ts`, from
`color.tsx`), `Switch` (`ui/switch.tsx`, from `switch-row.tsx`), `Notice` (`ui/notice.tsx`: an inline status
notice on a `status.*Quiet` tint), `Shell` (`ui/shell.tsx` + `.web.tsx`: navigation · content · inspector, from
`split-pane.tsx` and the layout half of `screen.tsx`), `PeriodStepper` (`shared/period-stepper.tsx`, from
`week-arrows.tsx` + `back-to-today.tsx`).

Non-rendering kit files (not counted in 4.4): `motion.ts` rewritten to §3.8/§6 presets (pairs + reduced
variants); `layout.ts` → `useWidthClass(): compact · medium · expanded` (F-LAY-04); `hotkeys.ts`,
`use-hotkey(.web).tsx` kept, single-key shortcuts scoped to the list region and switchable (§8, Q6);
`confirm-focus.ts` kept (focus successor, bug-lessons 5); `tooltip-place.ts` kept and extended with the
anchor side (motion origin); `switch-size(.web).ts` deleted (the kit draws its switch); `cx.ts`,
`screen-active.ts`, `slider-props.ts`, `theme-provider.tsx` kept.

#### 4.1.2 The text-yield rule (F-DAT-02, F-DAT-06, F-DAT-07)

React Native gives every View `flexShrink: 0`, so `numberOfLines` on a Text without a bounded parent never
ellipsizes. The kit inverts the default:

1. **Text yields, controls do not.** `Text` is `min-w-0 shrink` by construction; `Pressable`, `IconButton`,
   `Switch`, `CheckCircle`, badges and buttons are `shrink-0`. In any row the text gives way before a control
   is pushed or covered.
2. **Every data text slot declares a policy** (`yield` prop; a slot rendering user or server content without
   one fails review and the worst-case e2e sweep):
   - `truncate` — one line, end ellipsis (tags, row meta, names in chrome);
   - `truncate-middle` — one line, the identifying ends kept (URLs, hosts, device and file names). React
     Native Web has no middle ellipsis, so it is computed in core: `middleTruncate(text, graphemes)` and
     `displayUrl(url)` → the host in full, `…`, the last path segment (F-DAT-11); Android may use
     `ellipsizeMode="middle"` with one line;
   - `wrap` — no limit; only identifying text in a detail view (task title on the task screen, subtask label);
   - `clamp(n)` — n lines, then "Show all" (a `Disclosure`) where the full text matters (description 6,
     Inbox capture 4, review title 3, row title 2);
   - `count` — a label built from a list collapses to a count past 3 items (`«Сдать 37»`, not 37 names;
     F-DAT-01). Counts always carry their noun through `plural()` («12 задач», never a bare «0»; owner,
     feedback-4 on Projects).
3. **UI strings (`t()`) wrap by default and are never truncated** (RU runs 15–40 % longer). Fixed chrome
   slots (tab labels, time-bar buttons) wrap to 2 lines and the container grows; nothing has a fixed height
   (F-AND-05).
4. **A truncated value is always readable somewhere**: the web `title` attribute carries the full value, the
   accessibility label carries it, and a row that truncates opens a view where it wraps (F-DAT-07).
5. **Width caps** are tokens, not per-site numbers: a tag takes at most 50 % of its row's text width; a chip
   at most `size.chip.max`.
6. **Graphemes, not code units.** Every slice of user text (initials, middle truncation, counters) goes
   through `Intl.Segmenter` (F-DAT-08; new bug-lessons class "text sliced by UTF-16 code unit").
7. **Numbers through core formatters** (`formatDuration`, `formatCount`, `formatNumber`, §3.2): RU
   non-breaking spaces, decimal comma, days past 48 h; a meta piece never breaks inside itself (F-CPY-04,
   F-LAY-08).
8. **Inputs take `maxLength` from core `LIMITS`** (one table for events, UI and assistant; F-DAT-09); a
   counter (`type.caption`, `label.secondary`, `count` of remaining) appears within 20 of the limit.
9. **Guard:** lint bans `numberOfLines` outside `ui/text.tsx`; `e2e/worst-case.e2e.ts` (§10) asserts
   `scrollWidth ≤ clientWidth`, no text box past its container or under an enabled control, and a `title` on
   every ellipsized element, at 320 / 390 / 1440 in both themes on the `worst-ru` fixtures.

#### 4.1.3 Tokens this section adds to §3 (folded into §3.9)

`size.chip.max` 180 · `size.tooltip.max` 280 · `size.switch` track 52 × 32, knob 16 off / 24 on (Material 3) ·
`layout.dialog` 560 (forms) and `inspector.width` 400 reused for confirmations and toasts · `layout.popover`
360 (min 280, max 400) · `layout.rail` 80 (medium navigation rail) · `layout.navBar` 64 (phone navigation bar
content height, insets added). New contrast pairs for the unit test: `bg.cell` text on `status.danger` (badge),
`accent.on` on `accent.pressed`, `outline` dashed draft border on `bg.cell`, the switch knob on its off track.

#### 4.1.4 Feedback placement rule (the rule §6 "toast" refers to; F-CMP-12, P5)

1. **Feedback lives next to its cause.** A refusal or validation message is an inline `FieldMessage` under
   the field or an inline note in the row — never a toast (the «Type something first.» toast over Rest and
   Sport, feedback-4). A refused row action puts the row back and states the reason under its title.
2. **A toast is only for an outcome whose cause left the screen** (a checked row dissolved, a proposal
   collapsed, a task moved to Inbox) and it names the result (`«Задача создана: …»`, `«Запущено: …»`,
   `«Записано 07:30–08:30»`; F-CPY-02) with at most one action (Undo = «Вернуть», F-CPY-03).
3. **Compact:** anchored `space.3` above the top edge of the bottom chrome, measured live (tab bar + time bar
   or the screen's footer + the safe-area inset), never a constant (`BASE_BOTTOM`/`TAB_BAR_HEIGHT` deleted).
   It never overlaps chrome or the time-bar buttons; while it shows, the scroll content's bottom inset grows
   by its height, so the next row can always be scrolled out from under it.
4. **Expanded:** anchored to the bottom of the cause's region (the content column, or the inspector when the
   action happened there), centred in it, above the time bar when that region has one; max width
   `inspector.width`. Never in the sidebar (the old dock put it ~1 000 px from its cause).
5. **Timing:** shown at the press, not after an animation (F-MOT-11); 5–10 s by length; paused while hovered,
   focused or read by a screen reader. A deleted task's Undo is **not** a toast: it sits inline in the row's
   place for 10 s and takes focus (§8, Q5; F-A11Y-02).
6. **One at a time**; a new one replaces the current one with the §6 toast pair, never a one-frame cut.

#### 4.1.5 Commit rule for forms, sheets and dialogs (F-CMP-11, PRODUCT principle 2)

Compact: the primary action fills the sticky footer of the sheet or form; a confirmation is `[Cancel] [Action]`
in equal halves. Expanded: footer actions are content-width and trailing-aligned, primary last. One commit
shortcut everywhere: ⌘/Ctrl+Enter (shown on the button the OS's way: ⌘ on a Mac, Ctrl elsewhere; feedback-3),
Enter in a single-field form, Escape closes. A dismissable sheet has no Back or Cancel button (feedback-3,
PRODUCT principle 2); Cancel exists only in confirmations.

---

### 4.2 `ui/*` components

#### 4.2.1 `animated-height.tsx` — **merge** into `Disclosure` / `Presence` (file deleted)
- **Anatomy.** A clip container whose height goes from the measured old height to the measured new height while the new content crosses in; its one user (the composer unfold) becomes `Presence preset="composerUnfold"`, the folds become `Disclosure`.
- **Tokens.** `duration.md` enter / 160 exit; `easing.enter` / `easing.exit` for appear/disappear, `easing.move` for in-place disclosure.
- **States.** N/A (not interactive).
- **Phone / desktop / Android.** Identical; Reanimated on both, verified on the web (bug-lessons 11 in reverse).
- **Motion.** §6 composer unfold and §6 disclosure (standard class); grows from the swap frame on ease-out, never from a slow start that holds a clipped frame; reduced → opacity `duration.sm`, height jumps; focus moves after layout with `preventScroll`.
- **A11y.** Collapsed content is unmounted or `aria-hidden` and unfocusable.
- **Worst case.** Content taller than the viewport: max height = the region budget (§3.3), content scrolls inside; e2e geometry sampler asserts 0 px clipped in every frame (bug-lessons 5; feedback-4 "the top text and half the button slide out of the block").
- **Fixes.** F-MOT-08, F-MOT-10, F-MOT-04, F-LAY-01.

#### 4.2.2 `back-header.tsx` — **merge** into `ScreenHeader kind="pushed"` (`BackHeader`, `HeaderTitle` deleted)
- **Anatomy / tokens / states.** As 4.2.16 (pushed kind); the separate paddings (`pt-3.5 pb-2.5 pr-4` vs `pt-6 pb-3 pr-5`) disappear.
- **Worst case.** The title slot is the only shrinking part; a long project name in the task header truncates before the action buttons (F-DAT-02 "project name runs under the edit/pause/delete icons").
- **Fixes.** F-LAY-02, F-DAT-02, F-A11Y-05, F-CMP-01.

#### 4.2.3 `button.tsx` — **rewrite** on `Pressable`
- **Anatomy.** [leading `Icon` `icon.control`] · label `type.callout` weight 600 (1 line; RU may wrap to 2, never truncated) · [`KeyHint`]. Sizes: `lg` height `size.hit` (48), radius `radius.md`, padX `space.5`; `md` height `size.hitWeb` (44), `radius.md`, padX `space.4`; `sm` visual `space.8` (32), `radius.sm`, padX `space.3`, target extended by `hitSlop`. Gap `space.3`.
- **Variants and tokens.** `primary`: `accent` fill, `accent.on` label, pressed `accent.pressed` (one per view, §3.1 usage rule); `secondary`: tonal `fill.2`, `label.primary` (no hairline: a fill marks it, §3.5); `plain`: no fill, `accent.text` label (text actions, Undo); `destructive`: `status.dangerQuiet` fill, `status.danger` label (Wipe data and Delete account both, same size and width; F-CMP-07). The 5 hand-rolled lime and 5 hand-rolled outlined buttons are replaced by these.
- **States.** rest as above · hover `fill.1` over the fill · pressed ripple `fill.3` (Android) / `fill.2` overlay or `accent.pressed` (primary) · focus-visible `focus` ring · disabled `fill.1` + `label.quaternary`, no opacity (F-COL-13) · loading: a spinner in the label colour replaces the icon, the label stays (width never jumps), `aria-busy`, focus kept through busy (`useFocusThroughBusy` kept) · selected N/A · error N/A.
- **Width.** `auto` (content) on medium/expanded; `fill` for the screen's main action on compact and inside sheets; `equal` for a split pair — **Focus and Done take equal width** (feedback-2 T8). Never per-screen widths (F-CMP-06, feedback-4 "buttons too wide on PC").
- **Hotkeys.** `KeyHint` after the label (`type.footnote`, `tabular-nums`, label colour at `label.secondary` on secondary/plain, `accent.on` on primary), formatted the OS's way (⌘/⌥/⇧ glyphs on a Mac, `Ctrl+…` elsewhere), only on text buttons, only with a keyboard (feedback-3; PRODUCT › Operating Context); `aria-keyshortcuts`.
- **Split button.** `menu` prop adds a trailing segment (`ChevronDown` `icon.inline`) opening a `Menu`; this is the visible way to "other outcomes" behind Done, the long press stays as an accelerator (F-CMP-20).
- **Phone / desktop / Android.** Android ripple bounded to `radius.md`; haptic only when the action has a §3.9 meaning (destructive confirm → Confirm). Desktop dialogs that open more UI end their label with "…" (F-CPY-07).
- **Motion.** §6 press. No scale.
- **A11y.** role `button`, name = label, `accessibilityHint` for the long press; spinner labelled by the button's text.
- **Worst case.** Data in a label only through `count` («Сдать 37», F-DAT-01); a 300-char title never goes into a label.
- **Fixes.** F-CMP-01, F-CMP-06, F-CMP-07, F-COL-07, F-COL-13, F-CMP-20, F-CMP-21 (spinner colour), F-AND-01, F-DAT-01.

#### 4.2.4 `calendar.tsx` — **rewrite**
- **Anatomy.** Month row: previous `IconButton` · month title `type.headline` (centred, live region) · next `IconButton`. Weekday row `type.caption` `label.secondary` (`aria-hidden`; every day's name is its full date). Day cells: square target `size.hit` / `size.hitWeb` (7 × 48 = 336 fits a 358 px column), number `type.numeric.value` in a `space.9` (40) visual circle (`radius.pill`), marked-day dot `space.2` below the number.
- **Tokens / states.** in-month `label.primary`; neighbouring month `label.tertiary` (still pickable; `faint` retired, F-COL-03) · today: `label.primary` 600 + 1 px `outline` ring · selected: `accent` fill + `accent.on` number (a current selection; shape, not colour, distinguishes it from today) · hover `fill.1` · pressed ripple / `fill.2` · focus-visible `focus` ring around the circle · disabled (after `max`) `label.quaternary`, no opacity · marked dot `label.secondary` (`accent.on` on the selected day) · loading/error N/A.
- **Phone / desktop / Android.** Expanded: inside a `Popover` anchored to the date value row; compact: inside a `Sheet`. Same component.
- **Motion.** None (month change and picks are §3.8 "none" class).
- **A11y.** Web `role="grid"`, rows, `gridcell` with `aria-selected`, roving tabindex, arrows move by day, PageUp/PageDown by month, Home/End to week edges; Android: day buttons with `selected` state (TalkBack). Month title is a polite live region.
- **Worst case.** RU month names («Сентябрь 2026») fit the title slot at 320; the title wraps rather than pushing the arrows.
- **Fixes.** F-COL-03, F-COL-02, F-COL-13, F-A11Y-06 (40 px days), F-AND-01 (35 dp days), F-A11Y-13.

#### 4.2.5 `check-circle.tsx` — **rewrite**
- **Anatomy.** A 24 visual circle (`icon.bar`), border `size.stroke` 1.75; the check glyph `icon.inline`; target by `hitSlop` (the `-m-[11px] mt-[-10px]` hack goes; F-AND-01). The dead `dashed` prop is deleted.
- **Tokens / states.** rest: `outline` ring (3.4 / 4.1:1 on cell) · hover `fill.1` disc · pressed: **fills on pointer-down** (`onPressIn`) in its own commit: `accent` disc + `accent.on` check (F-MOT-01) · focus-visible `focus` ring · checked at rest (Done lists, History): `label.secondary` disc + `bg.cell` check (closed tasks are neutral, so a Done list never shows a column of accent fills; §3.1 usage rule) · read-only snapshot (History "as it was"): `label.quaternary` ring, not a control (F-CMP-14) · disabled = read-only · loading/error N/A.
- **Phone / desktop / Android.** Android: borderless ripple, haptic `Confirm` on the check (§3.9). Web: `fill.2` disc on press.
- **Motion.** §6 check a task (check circle): fill + stroke draw 100 ms `easing.enter`; reduced → instant fill.
- **A11y.** role `checkbox`, `aria-checked`, label «Отметить выполненной: ‹title›».
- **Worst case.** Aligned to the centre of the title's first line, so a 2-line title does not drift it.
- **Fixes.** F-MOT-01, F-CMP-01, F-AND-01, F-A11Y-01, F-CMP-14.

#### 4.2.6 `chip.tsx` — **rewrite** (neutral chips; colour only as a dot)
- **Anatomy.** Visual height `space.8` (32), `radius.pill`, padX `space.4`; [leading: `Icon` `icon.inline` or an 8 px hue dot] · label `type.subhead` · [selected check `icon.inline`]. Target via `hitSlop`. Two kinds: `filter` (Now's project filter, toggle) and `choice` (one of ≤ 4 options in a `radiogroup`: close-sheet time, Importance, assistant answers). Six-plus option sets are not chips any more (task-fields, 4.3.10; F-CMP-08).
- **Tokens / states.** rest: `fill.2`, `label.secondary` (no 2 px coloured outline; the form's 12 coloured outlines go, F-COL-02) · hover `fill.1` on top · pressed ripple `fill.3` / `fill.2` overlay · focus-visible `focus` ring (pill-shaped) · selected: `accent.quiet` fill, `accent.text` label, leading check glyph (non-colour carrier; forced colours `Highlight`) · disabled `fill.1` + `label.quaternary` (a new prop; today none) · loading/error N/A. Project identity = an 8 px `hue.<n>.stroke` dot before the name, never a filled chip.
- **Phone / desktop / Android.** Compact: a single scrolling row with `snapToInterval`, an edge fade and `overscroll-behavior-x: contain`; expanded: the strip **wraps** (no hidden scroller), and past 2 rows the rest collapses into a «Ещё N» chip opening a `Popover` (F-DAT-02: 10 of 12 filters were unreachable by mouse). Android ripple bounded to the pill.
- **Motion.** §6 filter chip change: none for the list; the chip's own fill changes in `duration.xs`.
- **A11y.** `filter` → `checkbox` semantics (`aria-checked`), `choice` → `radio` inside a named `radiogroup` (F-A11Y-13).
- **Worst case.** Label `truncate` at `size.chip.max` 180 with `title`; a 78-char RU project chip stays 180 wide; emoji and RTL names keep `dir="auto"`; one-letter «Я» keeps min width = height.
- **Fixes.** F-COL-02, F-CMP-08, F-DAT-02, F-A11Y-13, F-AND-01, F-AND-05 (no fixed `h-8`), F-CMP-01.

#### 4.2.7 `color.tsx` — **merge** into `Tag` (`ui/tag.tsx`) + hue helpers (`ui/hue.ts`)
- **What goes.** `PROJECT_FILL`, `WASH`, `EDGE`, `OUTLINE`, `INK`, `washClass`, `inkClass`, `ColorTag`; core's `IMPORTANCE_COLORS` (importance has no colour any more). **What stays:** static class maps (NativeWind needs literals) generated from `hue.<name>.stroke|ink|tint` per theme; `hueOfProject(name)` maps the ten stored names (`coral` → `red`, schema unchanged, bug-lessons 13); `hueOfCategory(id)` gives the twelve distinct category hues (§3.1).
- **Anatomy (direction B).** Pill `radius.pill`, height `space.6` (20), padX `space.2`, label `type.caption`. `ProjectTag`: `hue.<n>.tint` fill + `hue.<n>.ink` label. `CategoryTag`: `fill.2` fill, a leading 8 px dot in `hue.<n>.stroke`, label `label.secondary`. Also exports `Dot` (8 px, `hue.<n>.stroke`) for running indicators and legends.
- **Usage.** Tags appear only in rows and cards (MetaLine, presets list, Day rows). In a header, a field or a picker the project is a **value** (dot + name), never a pill (feedback-2: «Проект на странице задачи не должен выглядеть как плашка»).
- **States.** N/A (not interactive; a tappable project is a `ListRow`/value row).
- **Phone / desktop.** Same; no `leading-4` fixed line height (F-AND-05).
- **A11y.** Text is the name; the dot is decorative; forced colours draw a `CanvasText` 1 px border so the pill survives (F-A11Y-04).
- **Worst case.** `truncate`, max 50 % of the row's text width, min one grapheme + "…", `title` on the web (78–96-char Cyrillic projects, 70-char preset: F-DAT-02); emoji-first and RTL names render in order.
- **Fixes.** F-COL-04, F-COL-06, F-COL-10, F-DAT-02, F-DAT-07, F-TYP-05 (11 px → 12), F-AND-05.

#### 4.2.8 `count-badge.tsx` — **rewrite** (small)
- **Anatomy.** Height `space.6` (20), min width `space.6`, padX `space.2`, `radius.pill`; number `type.caption2` (11/14 600, tnum; the floor), `chrome` (max scale 1.6). Clamps at «99+».
- **Tokens.** `tone="danger"` (unsorted Inbox): `status.danger` fill, text `bg.cell`; `tone="neutral"` (unread notifications): `fill.3` + `label.secondary` (§3.1 indigo reassignment).
- **States.** N/A; hidden at 0.
- **Placement.** Anchored at the icon's trailing-top corner and **grows away from the icon** (rightwards in LTR), never back over it (F-DAT-10); in a sidebar row it is the trailing slot.
- **A11y.** Hidden; the host names the count («Входящие, ждут 12»).
- **Worst case.** 120 waiting → «99+» stays inside the tab; badge counts are held until the first full pull (no 34 → 94 → 99+ climb; F-DAT-04).
- **Fixes.** F-DAT-10, F-COL-07, F-AND-05, F-TYP-05.

#### 4.2.9 `dissolve.tsx` — **rewrite** (owner request kept: Telegram-like dissolve, feedback-3; shorter, feedback-4; Q2)
- **Anatomy.** The row content in one transform layer, plus ≤ 24 specks (was 150) drawn in **one** layer (a single canvas-like view whose specks animate transforms only), colour = the row title's ink (`label.secondary`).
- **Motion.** §6 check a task (row content): opacity 1 → 0, scale 1 → 0.98, specks pass; 260 ms `easing.exit`; starts at the press (optimistic), the store write never gates it (bug-lessons 3); `onDone` fires from the animation's completion callback, never `setTimeout(DISSOLVE_MS)` (F-MOT-03; new class "timer paired with an animation"). The rows below close up per §6 (220 ms `easing.move`), overlapping the dissolve's tail. Reduced → opacity fade 160, no specks, never a blank hole.
- **States.** N/A. A refused close returns the row with a `duration.sm` fade and an inline reason (4.1.4).
- **Phone / desktop / Android.** Same component; Android haptic `Confirm` comes from the check, not here.
- **A11y.** Decorative; the list announces nothing extra (the Undo toast is the status).
- **Worst case.** The specks never mount in the same commit as the check fill (that commit made the 229 ms long task); a row dropped by the store mid-dissolve is not re-rendered (the owner's "the vanished card flickers back", feedback-4).
- **Fixes.** F-MOT-01, F-MOT-03, F-MOT-04.

#### 4.2.10 `empty-state.tsx` — **rewrite**
- **Anatomy.** Leading-aligned at `gutter`, placed where the first row would be (never vertically centred, so nothing jumps when the first row lands): [`Icon` `icon.bar` `label.tertiary`] · title `type.headline` `label.primary` · body `type.callout` `label.secondary` (what lands here, ≤ 3 lines) · one action (`Button secondary sm` or a `Link`). Inbox's permanent explanation paragraph moves into its empty state.
- **States.** N/A (the action carries its own).
- **Phone / desktop.** Same alignment on every screen (was centred on 3 screens, left on 3).
- **A11y.** Title as `SectionHeader`-level heading only when it replaces the screen's content (level 2); a list that is empty renders no `list` element (F-A11Y-18).
- **Worst case.** RU copy wraps; no data slots.
- **Fixes.** F-CMP-09, F-A11Y-18.

#### 4.2.11 `icon-button.tsx` — **rewrite** on `Pressable`
- **Anatomy.** Target `size.hit` / `size.hitWeb`; glyph `icon.bar` in app bars and headers, `icon.control` in rows; `radius.pill` shape (round state layer). The dead `surface` and `raised` variants are deleted (19 of 19 sites pass `plain`); the bell loses its border (F-CMP-06).
- **Tokens / states.** rest glyph `label.primary` (the icon is the only label, §3.6) · hover `fill.1` disc · pressed borderless ripple `fill.3` / `fill.2` disc · focus-visible round `focus` ring · disabled glyph `label.quaternary`, no opacity · loading: spinner `icon.control` in `label.secondary` (new; today none) · selected (toggle icon buttons, e.g. Week's night hours): `fill.3` disc + `aria-pressed` · error N/A.
- **Phone / desktop / Android.** Desktop: a `Tooltip` with the label and its shortcut on hover/focus (never on tap). Android: borderless ripple.
- **Motion.** §6 press, §6 tooltip.
- **A11y.** role `button`, `label` required (lint, §8).
- **Worst case.** No text slot.
- **Fixes.** F-CMP-01, F-CMP-06, F-COL-13, F-AND-01, F-A11Y-06, F-CMP-21.

#### 4.2.12 `logo.tsx` — **keep** (recoloured)
- **Anatomy.** `PaceMark`: trailing chevron in `label.secondary` (it blended into the light background, feedback-2), lead chevron in `accent` (Pace green; the owner's green on the logo, feedback-4), the dot in `label.primary`. Sizes `icon.bar` (24, sidebar) and 56 (login). `PaceLogo` wordmark `type.largeTitle`.
- **States.** N/A.
- **A11y.** `aria-hidden` when beside the word "Pace" (sidebar); labelled «Pace» when it stands alone (OAuth consent; F-A11Y-19).
- **Fixes.** F-A11Y-19, F-WEB-15 (favicon generated from the same mark), F-IDN-01 (the mark's dot as "now" is an identity item of batch 8).

#### 4.2.13 `progress-bar.tsx` — **rewrite** (becomes the single bar; absorbs the running card's hand-drawn bar)
- **Anatomy.** Track height `space.2` (4), `radius.pill`, `fill.4`; fill `label.primary` (task progress) or `hue.<category>.stroke` (running activity, the compressed "train" line of §2 B), `status.warn` past the Expect. The dead `marker` prop (the only call site passes `null`; pace is no longer tracked, feedback-2) is deleted.
- **States.** N/A.
- **Motion.** §6 progress bar value change (220 `easing.move`, reduced instant).
- **A11y.** `progressbar` with `aria-valuetext` from the same formatter as the visible text («30 %»).
- **Worst case.** Values clamp to 0–100 %; forced colours: track `CanvasText` border, fill `Highlight` (F-A11Y-04).
- **Fixes.** F-COL-01 (track 1.31:1), F-COL-10, F-A11Y-04.

#### 4.2.14 `pulse-dot.tsx` — **delete**
- Replaced by the static `Dot` from `ui/tag.tsx` in `hue.<category>.stroke` (§6 running indicator: no breathing; the live time is the motion). The duplicate of `PLACEHOLDER_BREATH` goes with it.
- **Fixes.** F-MOT-12, F-MOT-04, F-A11Y-04 (the pulse vanished in forced colours).

#### 4.2.15 `row-list.tsx` — **merge** into `List` (`ui/list.tsx`)
- The `collapsable={false}` Android fix moves into `List` (and `Group`), so every row container keeps it; rows animate only per §6 check-off close-up, the same on Android and the web.
- **Fixes.** F-MOT-02, F-DAT-03.

#### 4.2.16 `screen-header.tsx` — **rewrite** (two kinds)
- **Anatomy, `destination`.** Top `header.top`, bottom `header.bottom`, inset `gutter`: title `type.largeTitle` `label.primary` (wrap 2; RU «Входящие» fits) · subtitle `type.callout` `label.secondary` (the date on Now/Day; the period control on Week/History/Insights via `PeriodStepper`) · trailing actions: ≤ 2 `IconButton`s (`icon.bar`) + overflow `Menu`. No eyebrow (F-TYP-02).
- **Anatomy, `pushed`.** Height `size.hit` + `space.3`: back `IconButton` (`ChevronLeft` `icon.bar`, or `X` for a pane) · title `type.title1` (`truncate`, full title in `document.title` and `title`) · trailing actions.
- **Tokens / states.** Fixed (not scrolling); once content scrolls under it the header gets `bg.app` + a `separator` bottom hairline (scroll edge, F-LAY-13). Back button states per `IconButton`.
- **Phone / desktop / Android.** The title sits at the same y on every top-level destination, phone and desktop (F-LAY-02); History and Notifications use `destination`. Android: the back button mirrors system Back; predictive back belongs to the stack.
- **Motion.** None (route push carries the motion, §6 route push).
- **A11y.** Title `aria-level` 1 (F-A11Y-05); back labelled «Назад» or the parent's name.
- **Worst case.** Pushed title truncates before actions; destination title wraps to 2 lines at 320 in RU; actions never wrap under the title (the old `flex-wrap` reflow).
- **Fixes.** F-LAY-02, F-TYP-02, F-A11Y-05, F-LAY-13, F-CMP-05 (back kept apart from the period chevrons), F-DAT-02.

#### 4.2.17 `screen-scene.tsx` (+ `.web.tsx`) — **keep**
- No visual. The web keeps taking hidden screens out of the page (`display: none`), so their fields and shortcuts are unreachable. It is the natural owner of the per-route `document.title` effect hook point (§7) but renders nothing new.

#### 4.2.18 `screen.tsx` — **rewrite** (page template; layout half moves to `Shell`)
- **Anatomy.** `Surface level="app"`; `ScreenHeader`; body; optional bottom `footer` (the time bar). Content column `content.max` (720 list screens, 960 Day/Insights), side margin `gutter`. Body bottom inset = measured footer + tab bar + active toast (4.1.4), not `pb-24`.
- **Phone / desktop / Android.** Compact: header fixed, body scrolls (`List` for long content). Expanded: **the window scrolls** (`screen.web.tsx`), the column is centred, the scrollbar sits at the window edge and the wheel works over the gutters (F-WEB-05). Medium: rail + content (F-LAY-04). Region budget: fixed bottom chrome ≤ 40 % of the viewport height, above it the time bar collapses (4.3.7); at 200 % zoom it scrolls with content (F-LAY-01). Keyboard up: the tab bar hides, the focused field stays visible (`interactive-widget=resizes-content`, a `visualViewport` listener on the web, keyboard insets on Android edge-to-edge; F-AND-04).
- **States.** Loading: skeleton rows with the final row height (no CLS; F-WEB-11).
- **A11y.** `main` landmark and a skip link via `Shell` (F-A11Y-12); `overscroll-behavior-y: none` on the document (F-WEB-06).
- **Fixes.** F-LAY-01, F-LAY-02, F-LAY-03, F-LAY-04, F-WEB-05, F-WEB-11, F-AND-04, F-A11Y-12.

#### 4.2.19 `segmented.tsx` — **rewrite** (a real segmented control)
- **Anatomy.** Track `fill.2`, `radius.pill`, visual height `space.9` (40), target `size.hit`/`size.hitWeb`; equal segments; thumb inset `space.1`, radius `radius.pill` (nested rule); labels `type.subhead`. For 2–4 options only (Theme, Language, notification channel); more options use a value row + picker.
- **Tokens / states.** unselected label `label.secondary` · selected: thumb `bg.cell` (light) / `fill.4` (dark), label `label.primary` 600 (shape + weight, not colour) · hover `fill.1` on a segment · pressed ripple/overlay · focus-visible ring around the focused segment · disabled `label.quaternary` (new) · loading/error N/A.
- **Phone / desktop / Android.** Android ripple per segment; the thumb `spring.thumb`.
- **Motion.** §6 segmented/switch (thumb 160, `spring.thumb`; reduced instant).
- **A11y.** `radiogroup` named by its label (F-A11Y-13), arrow keys move the selection.
- **Worst case.** If any label would truncate (RU at 320, font scale 1.6), the control renders as a vertical `ListRow variant="select"` group instead; labels never ellipsize.
- **Fixes.** F-COL-02, F-A11Y-13, F-LAY-09, F-AND-01.

#### 4.2.20 `sheet-actions.tsx` — **merge** into the `actions` slot of `Sheet` / `Dialog`
- Implements the commit rule (4.1.5): forms → one primary (compact: full width; expanded: trailing, content width); confirmations → `[Cancel] [Action]` equal halves (was 1 : 2) with `destructive` on the action. ⌘/Ctrl+Enter on the primary of forms, never on confirmations; focus moves to Cancel when an inline confirm opens (kept).
- **Fixes.** F-CMP-11, F-CMP-07.

#### 4.2.21 `sheet.tsx` — **rewrite**; with new `dialog.tsx` and `popover.tsx`
- **Sheet (compact, and medium for forms).** `scrim` behind; surface `Surface level="elevated"`, top corners `radius.sheet`, padding `sheet.pad`. A 48 dp drag zone at the top holds the handle (`space.8` × `space.2`, `label.quaternary`, `radius.pill`). Title `type.title2` (wrap 2) · subtitle `type.callout` `label.secondary` · on the web a close `IconButton` at every width (phone web had no visible way out); on Android the handle and system Back suffice (no Back button, PRODUCT principle 2). Sticky `header` slot (a picker's Stop, its switch, its search), body scroll with `overscroll-behavior: contain`, `separator` under the header only once the body scrolls (no permanent hairlines), sticky `actions` footer; bottom padding = max(safe inset, `space.3`) + `space.3`.
- **Behaviour.** The handle is real: pan with velocity; detents `medium` (≈ 50 % of the viewport) and `large` (viewport − top inset − `space.7`) for scrolling content, one content-height detent otherwise; dismiss past 30 % of its height or ≥ 800 dp/s; release on `spring.sheet`. A dirty form does not dismiss on drag, scrim or Back: it rubber-bands and asks «Не сохранять изменения?» (`Dialog`). Lifts above the keyboard and scrolls the focused field into view.
- **Dialog (expanded).** Centred, width `layout.dialog` (forms) or `inspector.width` (confirmations), max height 85 %, `radius.xl`, `sheet.pad`; close `IconButton` top-trailing; actions trailing. The owner's "on PC a plate in the centre" (feedback-3).
- **Popover (expanded pickers and menus).** Anchored to its trigger, width `layout.popover`, `radius.lg`, max height 60 % with internal scroll; opens above a bottom-edge trigger (the time bar), flips to fit. `Menu` = `Popover role="menu"` of `ListRow`s (Pause, Give up, Delete in the task header; Inbox's Delete); on Android it is the anchored Material dropdown menu, opened by tap or long press (haptic `Long_Press`).
- **Tokens / states.** Elevated layer per §3.5 (light `shadow.overlay`; dark inner hairline, no blur); scrim `scrim` (lighter in dark than today's 55 % black, F-COL-08). Backdrop has no state layer and no focus stop.
- **Phone / desktop / Android.** Android: system Back closes, predictive back preview on 14+, the status bar dims under the scrim (§7 theme-color on the web). Web: Escape and a click outside close all three.
- **Motion.** §6 sheet (translate from its **own measured height**, scrim fades in place — the dim never rides along, feedback-2; exit 200; reduced fade 160), §6 dialog (scale 0.96 → 1 + fade, exit 0.98, never from 0), §6 popover (origin = anchor edge). The Modal stays mounted through the exit (F-MOT-05).
- **A11y.** `role="dialog"`, `aria-modal`, `aria-labelledby` → title; focus trap; initial focus on the first meaningful control (search field, first option), never the backdrop; focus returns to the trigger; the drag handle exposes `accessibilityActions` (dismiss, expand) with a label; the focus ring is not clipped (4 px overflow padding, §7).
- **Worst case.** RU title wraps to 2 lines; a 100-row picker uses `List`; a 4 000-char description inside an edit sheet scrolls in the body while the actions stay in sight.
- **Fixes.** F-CMP-02, F-CMP-13, F-MOT-05, F-MOT-06, F-MOT-09, F-A11Y-07, F-COL-08, F-WEB-06, F-AND-04, F-LAY-05, F-CMP-10, F-CMP-15, F-A11Y-01.

#### 4.2.22 `sidebar.tsx` — **rewrite** (on `NavItem`)
- **Anatomy.** Width `sidebar.width` (248), `Surface level="sidebar"`, a `separator` on its edge; padding `space.4`. Header row: `PaceMark` (`icon.bar`) + «Pace» `type.headline` + the bell (`IconButton`, `icon.control`). Second row (the account): `UserAvatar` 24 + the full Telegram name `type.callout` `label.primary` (owner, feedback-4; F-LAY-06). «Новая задача» as `Button primary md` (the accent fill: the owner named New task among the important actions that get the accent, feedback-4 / stage-8 plan) with `Plus` and its `KeyHint`; it is the shell's one filled accent, so screens inside the shell keep their own primary actions tonal until something is ready to commit (the composer's send fills only when a line is typed; F-COL-07). One entry point per screen is §5's call (F-CMP-18). Nav rows: `NavItem` height `size.hitWeb` (44), `radius.sm`, `Icon` `icon.control` + label `type.callout` + trailing `CountBadge` (Inbox, `danger`).
- **Tokens / states.** rest icon `label.secondary`, label `label.secondary` · hover `fill.1` · pressed `fill.2` · focus-visible ring · current: `fill.3` + `label.primary` 600 + a 3 px leading bar in `accent` (`radius.xs`) + `aria-current="page"`, also on pushed screens it owns (task → Now; F-A11Y-11) · disabled/loading/error N/A.
- **Phone / desktop / Android.** Expanded only. Medium: a navigation rail (`layout.rail` 80) with icon over a `type.caption` label, same states (F-LAY-04). Compact: the tab bar.
- **Motion.** None (navigation is instant; §6 tab switch).
- **A11y.** `nav` landmark named «Разделы»; rows are links with `href` (Ctrl/⌘-click opens a tab; F-WEB-03); skip link precedes it (F-A11Y-12).
- **Worst case.** Owner name: `truncate` with `title` only past ≈ 190 px — «Albert» and a 20-char name show in full; a 64-char name ends in "…"; emoji-first name → avatar initials via graphemes (4.3.3). RU labels («Аналитика», «Настройки») fit 248.
- **Fixes.** F-LAY-06, F-COL-07, F-COL-02, F-A11Y-06 (40 px rows), F-A11Y-11, F-WEB-03, F-LAY-04, F-DAT-07.

#### 4.2.23 `skeleton.tsx` — **rewrite**
- **Anatomy.** Shapes that match the final layout exactly: `row` (a 24 circle + title bar + meta bar at `size.row.min` height), `listRow` (icon + title + trailing value), `text` (paragraph bars). Bars `fill.3`, `radius.pill`, title bar height 12, meta bar 10 (inside the row's line boxes, so content replaces them without a shift).
- **States.** Loading only; shown after 300 ms of waiting (fast loads show nothing).
- **Motion.** §6 skeleton → content: shimmer 1.2 s period, ≤ 6 % luminance amplitude, content fades in 160; reduced → static bars, fade.
- **A11y.** The region is `aria-busy`; one `progressbar` labelled once («Загрузка устройств…», with "…", F-CPY-07).
- **Fixes.** F-WEB-11 (CLS), F-MOT-04, owner feedback-4 (skeletons while devices load).

#### 4.2.24 `slider.tsx` (+ `.web.tsx`) — **rewrite** (owner: "like a volume control", feedback-2; "in %, the number follows the movement, no jitter after save", feedback-3)
- **Anatomy.** Target height `size.hit`/`size.hitWeb`; track `space.2` (4) `fill.4`, fill `label.primary`; thumb 24 (`icon.bar`) `label.primary` disc with a 2 px `bg.cell` ring; value readout beside it `type.numeric.value` in **percent** («30 %», nbsp), updating live while dragging.
- **Tokens / states.** rest as above · hover (web) thumb ring `fill.1` halo · pressed/grabbed: thumb scales to 28 visually (transform, `duration.xs`, released the same way; F-MOT-14) · focus-visible `focus` ring around the thumb · disabled `fill.1` track, `label.quaternary` thumb · selected/loading/error N/A.
- **Behaviour.** The value follows the finger (no animation between steps); steps of 10 % (the stored 0–10); a tap on the track jumps there; the committed value is held until the store echoes it, so it never snaps back (feedback-3 "дергается после сохранения").
- **Phone / desktop / Android.** Android: the gesture-handler slider, haptic none. Web: the native range input kept (keyboard and AT for free) with an equal 24 px thumb in WebKit and Firefox (F-A11Y-16).
- **Motion.** §6 slider (none; thumb follows).
- **A11y.** `adjustable` / `slider`, `aria-valuetext` «30 %» from the same formatter as the readout (F-A11Y-16), increment/decrement actions.
- **Fixes.** F-A11Y-16, F-MOT-14, F-COL-01.

#### 4.2.25 `split-pane.tsx` — **merge** into the `Shell` inspector region
- The inspector (width `inspector.width` 400, min 360, max 480; `separator` on its leading edge, `Surface level="app"`) exists only on screens with a selection (Now, Week, Inbox) and is **collapsed while nothing is selected** — the list takes the width (F-LAY-03). Medium: the inspector opens as a `Sheet`. It is a labelled `region`; opening follows §6 row → inspector.
- **Fixes.** F-LAY-03, F-A11Y-12.

#### 4.2.26 `switch-row.tsx` — **rewrite**; the switch moves to `ui/switch.tsx`
- **Switch anatomy (Material 3 on both platforms, drawn by the kit; RN-web's 20 px switch and native `thumbColor` go).** Track `size.switch` 52 × 32, `radius.pill`. Off: track `fill.2` with a 2 px `outline` border, knob 16 in `outline`. On: track `accent`, knob 24 in `accent.on`.
- **SwitchRow.** A `ListRow variant="toggle"`: label `type.body`, hint `type.footnote` `label.secondary` (wrap), switch trailing; **the whole row toggles** (labels were not clickable; F-A11Y-06).
- **States.** hover `fill.1` on the row · pressed ripple on the row · focus-visible ring on the row (one stop, not two) · disabled `label.quaternary` label, `fill.1` track, `label.quaternary` knob · selected = on · loading/error N/A.
- **Phone / desktop / Android.** Same geometry; Android ripple across the row. Desktop Settings matrix of 12 channel switches becomes checkboxes (§5).
- **Motion.** §6 segmented/switch (knob `spring.thumb`).
- **A11y.** role `switch`, `aria-checked`, named by the row label; hint as description.
- **Worst case.** RU labels wrap; the switch never shrinks.
- **Fixes.** F-COL-09, F-COL-07 (indigo "on"), F-A11Y-06, F-COL-13, F-AND-01.

#### 4.2.27 `tab-bar.tsx` — **rewrite** (Material navigation bar)
- **Anatomy.** Container `bg.cell` (a fill marks it; no hairline), content height `layout.navBar` 64 + the bottom inset; four equal destinations (Now · Day · Inbox · More; IA fixed). Each: an indicator pill `space.11` × `space.8` (64 × 32) behind an `Icon` `icon.bar`, label `type.caption` (`chrome`) below.
- **Tokens / states.** unselected: outline icon `label.secondary`, label `label.secondary` · selected: `fill.3` pill, **filled** icon `label.primary`, label `label.primary` 600 (shape + fill + weight; not colour alone, F-AND-02) · pressed ripple on the pill (Android) / `fill.2` (web) · focus-visible ring around the pill · disabled/loading/error N/A. Inbox badge `danger`, anchored to the icon's trailing top, growing outward.
- **Phone / desktop / Android.** Compact only. Hidden while the keyboard is up (F-AND-04) and on full-screen forms; kept on More's destinations (nested in the More stack; F-AND-03).
- **Motion.** §6 tab switch: no screen transition; the pill moves `spring.thumb` on Android. No haptic.
- **A11y.** Web: `nav` with `<a href>` items and `aria-current="page"` (not a `tablist`; F-A11Y-11). Android: `tab` role kept for TalkBack.
- **Worst case.** «Входящие» at font scale 1.6 (max multiplier) wraps to 2 lines and the bar grows; «99+» stays inside the tab (F-DAT-10).
- **Fixes.** F-AND-02, F-A11Y-11, F-DAT-10, F-AND-04, F-AND-05, F-CMP-01, F-COL-07.

#### 4.2.28 `text-field.tsx` — **rewrite** (`TextField` with `purpose`; `TimeInput` merges in)
- **Anatomy.** Visible label `type.footnote` `label.secondary` as a web `<label for>` (clicking it focuses the field; F-A11Y-15) · field: height `size.hit` (Android) / `size.hitWeb` (web), `radius.md`, padX `space.4`, text `type.body` (16 on phone so iOS never zooms, F-WEB-09), placeholder `label.tertiary` · [leading `Icon` for search] · [trailing clear] · `FieldMessage` below: hint `type.footnote` `label.secondary`, error `type.footnote` `status.danger` with an alert glyph, counter near the limit. Multiline grows from 3 to 8 lines, then scrolls.
- **Tokens / states.** rest: `bg.inset` in a cell or `bg.cell` on the app ground + 1 px `outline` (F-COL-01) · hover border `label.tertiary` · **focus (any input method): `focus` ring 2 px + 2 px offset** (fields ring on focus, not only focus-visible; F-A11Y-01) · disabled `fill.1`, text `label.quaternary`, no border · error: border `status.danger` + message, **only after blur or a submit attempt** (touched gate in the kit; F-CMP-03 — the new-task form no longer opens red) · loading N/A · selected N/A.
- **Purposes (one prop sets the platform attributes; §7 Fields).** `title` (spellcheck, autocapitalize sentences, `enterkeyhint=done`), `text`, `multiline`, `url` (`inputmode=url`, no spellcheck/autocap), `time` (the old `TimeInput`: digits, colon added, `inputmode=numeric`, `onTime` hears only complete times, half-typed time flagged on blur), `number`, `search` (`type=search`, leading `Search` icon). `autocomplete="off"` and a `name` on every non-auth field (F-WEB-08).
- **Phone / desktop / Android.** Same; Android keyboard insets per 4.2.18.
- **A11y.** Name from the label; error linked by `aria-describedby` and announced once (polite), not live on every keystroke.
- **Worst case.** Long values scroll inside the field; URL fields show `displayUrl` when not focused; limits from core `LIMITS` (F-DAT-09).
- **Fixes.** F-A11Y-01, F-A11Y-15, F-COL-01, F-COL-03, F-CMP-03, F-WEB-08, F-WEB-09, F-AND-01, F-AND-05, F-DAT-09.

#### 4.2.29 `time-input.tsx` — **merge** into `TextField purpose="time"`
- Keeps `typeTime` and the complete-times-only contract; gains the field states it lacked (focus, error for a half-typed time, disabled) and its width becomes content-sized (`5ch` + padding), not 788 px (F-LAY-09).
- **Fixes.** F-A11Y-01, F-COL-03, F-WEB-08, F-LAY-09.

#### 4.2.30 `toast.tsx` — **rewrite** (placement rule 4.1.4)
- **Anatomy.** `Surface level="elevated"`, `radius.lg`, padding `space.3` / `space.4`; message `type.callout` `label.primary` (`clamp(2)`) · [action `Button plain sm`, `accent.text`, e.g. «Вернуть»] · dismiss `IconButton` (`X` `icon.control`, labelled «Закрыть»). Compact width = viewport − 2 × `gutter`; expanded max `inspector.width`. The old `inverse` look and the sidebar dock go.
- **States.** The action and dismiss buttons carry the state layer; the message is not pressable or focusable (F-A11Y-14). No error variant (refusals are inline).
- **Phone / desktop / Android.** Compact: also dismissed by a horizontal swipe. Offsets from measured chrome and `env(safe-area-inset-bottom)` (F-CMP-12).
- **Motion.** §6 toast (8 px rise + fade 220, exit fade + 4 px drop 160; reduced fade) through `Presence`; §6 check a task (Undo toast) starts with the dissolve.
- **A11y.** `role="status"` polite, announced once; timer pauses on hover/focus (WCAG 2.2.1).
- **Worst case.** A 300-char task title in «Готово: ‹title›» clamps to 2 lines (the 3-line clamp showed half a 4th line); the action never wraps under the text.
- **Fixes.** F-CMP-12, F-MOT-11, F-A11Y-14, F-A11Y-02, F-CPY-02, F-CPY-03, F-COL-08.

#### 4.2.31 `tooltip.tsx` (+ `.web.tsx`) — **rewrite**
- **Anatomy.** `Surface level="elevated"`, `radius.sm`, padding `space.2` / `space.3`, text `type.footnote` `label.primary` (wrap), max width `size.tooltip.max`; `z.tooltip`.
- **Behaviour (web).** Shows after 400 ms of hover (0 ms on keyboard focus, and instantly when moving from one trigger to the next); **hoverable** (the bubble takes pointer events with a short grace period), Escape dismisses, persists while hovered (WCAG 1.4.13; F-WEB-04); placed on the side facing away from the trigger's container edge, never over the screen title or a field's placeholder.
- **Touch.** No tooltip on tap (the tap runs the control; the moon toggled and popped «Ночные часы»). Where the reason matters, a tap shows an inline hint or the control's own sheet says it.
- **Owner requirement (amends the §6 tooltip row; confirm in Phase 3).** A "why unavailable" tooltip (time-bar Calendar) shows **immediately** on hover with short copy («Рядом в календаре ничего нет»), and on the phone the tap opens the picker that says it at once (feedback-4).
- **States.** N/A (not interactive).
- **Motion.** §6 tooltip (fade + 2 px from the anchor 100 / 70; reduced fade).
- **A11y.** `role="tooltip"`, trigger `aria-describedby`; Android: long-press shows the accessibility label (platform tooltip on icon buttons).
- **Worst case.** Long RU copy wraps to 3 lines inside `size.tooltip.max`; never clipped by the viewport (flip).
- **Fixes.** F-WEB-04, F-MOT-13, F-CMP-12, F-COL-12.

---

### 4.3 `shared/*` rows and clusters

#### 4.3.1 `task-row.tsx` + `task-list.tsx` — **rewrite** (`TaskRow` on `ListRow`; `TaskList` on `List` + `SectionHeader` + `Disclosure`)
- **Anatomy.** `TaskRow` = `ListRow` with leading `CheckCircle`, title `type.body` 500 `label.primary` (dimmed undated Nice-to-have: 400 `label.secondary`), `MetaLine` under it (gap `space.1`). A fixed two-line structure — title `clamp(2)`, meta one line — so rows are 66 or 88 dp, never data-dependent heights (F-LAY-08). One container and gutter on Now, the project page, History and the Task picker (F-LAY-07); groups are `Group`s with `SectionHeader`s («С дедлайном», «Без срока»). Folds («В будущем · 3», «Готово · 11») are `SectionHeader collapsible` → `Disclosure` (the old `FoldedSection` and its ChevronUp/Down swap go).
- **Tokens / states.** rest `bg.cell` in a `Group` · hover `fill.1` on the link area · pressed ripple/overlay clipped to the cell · focus-visible ring inset 2 px inside the cell · **selected** (inspector open on expanded): `selection` fill + a 3 px `accent` leading bar (`radius.xs`) + `aria-current="page"` (F-COL-02: was `raised` at 1.10:1) · checked/closed: `CheckCircle` checked-at-rest, title `label.secondary` + strikethrough · read-only snapshot rows (History) have no live check (F-CMP-14) · loading: `Skeleton row` · error: a refused close returns the row with the reason inline.
- **Behaviour.** The title area is a `Link` (`href="/task/:id"`): compact pushes the task route, expanded opens the inspector; Ctrl/⌘-click opens a tab on the web (F-WEB-03).
- **Phone / desktop / Android.** Android ripple across the row; haptic `Confirm` on check (§3.9).
- **Motion.** §6 check a task (circle 100 / row dissolve 260 / rows below close up 220 / Undo toast with the dissolve), the same `List` transition on Android **and** web (F-MOT-02); rows never animate on mount, filter change, day switch or keyboard creation (§6 frequency "none"; F-MOT-07).
- **Scale.** `List` virtualises above 50 rows and turns layout animation off there; a fold renders 50 rows and a «Показать ещё 50» row (1 284 open tasks; F-DAT-03).
- **A11y.** `list`/`listitem` only when there are items (F-A11Y-18); the row link is named by title + meta (the full values even when truncated).
- **Worst case.** 300-char RU title → 2 lines + `title`; a URL as the title breaks anywhere (`overflow-wrap: anywhere`); emoji titles; RTL fragments with `dir="auto"`; «Я» keeps the row height.
- **Owner.** The project page's list is the same list, Open / In future / Done (feedback-2 T7).
- **Fixes.** F-LAY-07, F-LAY-08, F-LAY-10, F-COL-02, F-MOT-01, F-MOT-02, F-MOT-07, F-MOT-10, F-DAT-03, F-DAT-07, F-WEB-03, F-CMP-01, F-CMP-14, F-A11Y-18, F-AND-01.

#### 4.3.2 `meta-line.tsx` — **rewrite**
- **Anatomy.** One line, in order: [`ProjectTag` or `CategoryTag`] · [importance **word**, only when not Normal] · [repeat `Icon` `icon.inline`] · the texts («до 23:59 · осталось 2 подзадачи»), `type.footnote` `label.secondary`, joined by « · » with non-breaking joins (a piece never breaks inside itself).
- **Tokens.** Importance ramp by weight (§2 raise, §3.1 usage rule): Срочно/ASAP `status.danger` 600 · Приоритет `label.primary` 600 · Необязательно `label.secondary` 400 · Обычная → nothing (Q3). Due soon (`strong`) `label.primary` 500; late `status.danger` (was orange `warn`, which now means "past expected"). Tabular figures from the numeric role inside times (F-TYP-06).
- **States.** N/A.
- **Yield.** The tag yields first (≤ 50 %), then the trailing pieces truncate at the end; due/lateness keep priority over "subtasks left"; the full meta is in the row's label and `title` (F-DAT-07). No wrapping under the tag (rows stay two lines).
- **A11y.** The repeat icon is labelled («Повторяется»); the line is read as one phrase with commas, not "dot".
- **Worst case.** 96-char project + ASAP + «просрочено на 3 д 4 ч» + repeat at 320 → tag «Электроэнцефалогр…», then «Срочно · просрочено на 3 д 4 ч», the rest cut with "…".
- **Fixes.** F-COL-04, F-COL-06, F-LAY-08, F-DAT-02, F-DAT-07, F-TYP-06, F-CPY-04.

#### 4.3.3 `user-avatar.tsx` — **rewrite**
- **Anatomy.** Circle at 24 (`icon.bar`, sidebar) or 40 (`space.9`, More); photo, or initials on `fill.3` in `label.secondary`: `type.caption2` at 24 (the 11 px floor; was 9.12 px, F-TYP-05), `type.subhead` at 40. While the photo loads: the `fill.3` circle (no shift).
- **Initials.** Graphemes via `Intl.Segmenter`, letters only (`\p{L}`), first grapheme of the first two words; no letter (emoji-only name) → a `User` icon (`icon.control`). «🦊 Лиса» → «Л».
- **States.** N/A.
- **A11y.** Decorative (`aria-hidden`) beside the visible name; labelled with the name where it stands alone.
- **Fixes.** F-DAT-08, F-TYP-05, F-COL-07 (indigo avatar), F-LAY-06.

#### 4.3.4 `week-arrows.tsx` + `back-to-today.tsx` — **merge** into `shared/period-stepper.tsx` (`PeriodStepper`)
- **Anatomy.** One control on Day, Week, History and Insights alike (P5): a `fill.2` pill track (`radius.pill`, height `space.9`) holding `‹` (`IconButton`, `ChevronLeft` `icon.control`), the range label `type.headline` tnum (on Day a button that opens the date picker: `Popover` / `Sheet` with `Calendar`), `›`; then «Сегодня» as `Button plain sm`, **present only away from today** in a slot whose width is always reserved, so nothing reflows (owner feedback-4 "Reset to today on weeks that are not ours, Day too"). The pill visually separates period chevrons from the header's back chevron (F-CMP-05). History's always-present disabled «Сейчас» goes (F-CPY-06).
- **Tokens / states.** Chevrons per `IconButton`; `›` at the present: disabled `label.quaternary` (no opacity); range label hover `fill.1` when it opens the picker; focus ring per control.
- **Phone / desktop / Android.** Compact: in the `ScreenHeader` subtitle row, never wrapping to a second row (it pushed Week's grid 48 px); expanded: header trailing.
- **Motion.** None (§6 Day ‹ › / Week ‹ ›: the new period replaces the old in place).
- **A11y.** `group` named «Период»; buttons «Предыдущая неделя» / «Следующая неделя»; the range label is a polite live region announcing the new period once.
- **Worst case.** Range label uses the short form at 320 («26 окт – 1 нояб»), never truncated.
- **Fixes.** F-CMP-05, F-CPY-06, F-LAY-02.

#### 4.3.5 `zone-banner.tsx` — **rewrite** on `Notice`
- **Anatomy.** `Notice` (a `Group`-styled block: `bg.cell`, `radius.lg`, padding `row.padX` / `row.padY`): `Globe` `Icon` `icon.control` `label.secondary` · text `type.callout` `label.primary` (wrap) naming both zones · action `Button secondary sm` «Перейти на зону устройства» (trailing on expanded, below on compact). The zone name leaves the button label (data in chrome; F-DAT-01 class).
- **States.** Action per `Button` (loading while the setting writes).
- **A11y.** `summary`/`region` named by its text; not a live region.
- **Worst case.** IANA names like `America/Argentina/ComodRivadavia` wrap in the text; the label stays short.
- **Fixes.** F-LAY-05 (bordered card), F-DAT-01 (class sweep).

#### 4.3.6 `where-sat-line.tsx` + `activity-usage.tsx` — **rewrite**
- **WhereSatLine.** `type.footnote` `label.secondary`, «Ноутбук: code 45 мин, Firefox 15 мин» via the duration formatter (nbsp), top 3 apps + «ещё N»; `truncate` (compact variant) or `clamp(2)`. The indent comes from the parent row's text inset (the row passes it), not `pl-[116px]` (which assumed the web value of `gap-3`; F-AND-01). Device and app names are data: the device name truncates in the middle when it would be cut (F-DAT-11).
- **ActivityApps / ScreenTimeSection.** `SectionHeader` («Приложения за это время», level 3 in a pane; «Экранное время», level 2 on Day) with the total as trailing `type.numeric.value`; apps as compact `ListRow`s: name `type.callout` `truncate`, devices `type.footnote` `label.secondary` `truncate`, duration trailing `type.numeric.value` in a fixed right-aligned column (F-LAY-14 class), a 4 px bar (`fill.4` track, `label.secondary` fill; indigo goes); stale-device notes `type.footnote` `label.secondary`. «Показать все N» is a `Disclosure` (it had no pressed state and a 36 px target).
- **States.** Rows static; the disclosure has the state layer; loading: `Skeleton listRow`; empty: one `type.callout` `label.secondary` line.
- **A11y.** Headings with levels (F-A11Y-05); each app row reads "app, devices, duration".
- **Fixes.** F-AND-01, F-A11Y-05, F-CMP-01, F-COL-07, F-LAY-05 (border-t sections), F-DAT-11, F-CPY-04, F-A11Y-06.

#### 4.3.7 `tracking/time-bar.tsx` (+ `time-bar-fold.tsx` **merged** into it) — **rewrite**
- **Anatomy.** A `region` «Учёт времени» at the bottom of Now: running card(s) (4.3.8) · the typed field · **four fixed buttons — Calendar, Task, Chores, Rest** (feedback-4; no ⋯ or gears anywhere), equal width, gap `space.3`, padding `gutter` / `space.3`, `Surface level="app"` with a `separator` top edge only when content scrolls under it.
- **Bar buttons.** "Large enough not to miss, always in its place" (feedback-2): min height `size.row.min` (52; grows with font scale, never fixed), `radius.md`; `Icon` `icon.control` over label `type.caption` (`chrome`, wraps to 2 lines rather than truncating). **Rest:** neutral tile `fill.2`, glyph in the button's category `hue.<n>.stroke` (Task green · Chores amber · Rest teal · Calendar slate), label `label.secondary` (F-COL-05: the four coloured 2 px outlines go). **Running its activity:** `hue.<n>.tint` fill, label `hue.<n>.ink` 600, a static `Dot` (state said in the name too: «Отдых, идёт»). **Calendar unavailable:** looks exactly like rest (it is pressable; F-COL-12); hover shows the short reason at once; tap opens its picker, which says it. States: hover `fill.1`, pressed ripple/`fill.3`, focus ring, disabled N/A, loading: the tapped button shows a spinner glyph while the calendar is read.
- **Typed field.** `TextField purpose="text"` «Чем заняты?» + send `IconButton` (`ArrowUp`, `accent.text` when there is text, `label.quaternary` when empty — not a filled accent and not ▶, which is reserved for timing; F-CMP-10, F-COL-13); Enter sends; `maxLength` from core `LIMITS` (was 200 vs 80; F-DAT-09). **The draft is outlined** (feedback-3): after Enter the typed text shows as a draft line — 1 px **dashed** `outline` border, `radius.md`, text `label.secondary`, a spinner `icon.inline` — in place of the «Ассистент разбирает текст…» caption, until the proposal (4.3.11) replaces it. The same draft treatment is used in the composer and Inbox (F-IDN-03).
- **Fold and region budget (compact).** Fixed chrome (bar + tab bar) ≤ 40 % of the viewport (§3.3). While something runs, the **four buttons stay visible** and what folds is the typed field (and running cards collapse to their one-line variant past the budget) — switching stays three taps (app → Chores → Commute; F-CMP-19, PRODUCT › Operating Context). *This replaces "Start something else" folding the buttons; §6's time-bar unfold row then applies to the field. Proposed as Q12 for §12.* While the field is focused the buttons fold away and the field + proposal stay above the keyboard (F-AND-04). At 200 % zoom / 320 px the bar scrolls with content.
- **Phone / desktop / Android.** Expanded: never folds; pickers open as `Popover`s anchored to their button (F-CMP-13); other desktop screens get the running card's one-line variant in the shell (F-LAY-12; §5). Android: haptic `Clock_Tick` on start/stop/switch (§3.9), ripple on buttons.
- **Motion.** §6 time-bar unfold (field: height + fade 220 / 160), §6 assistant preview appears, §6 start/stop activity.
- **A11y.** `region` labelled; buttons named with state; the field labelled; the draft line is a polite status «Разбираю…» announced once.
- **Worst case.** RU «Календарь» at font scale 1.6 wraps; two running activities + a proposal + the keyboard stay within the budget (the proposal scrolls internally); the toast never covers the buttons (4.1.4).
- **Fixes.** F-COL-05, F-COL-12, F-COL-13, F-CMP-06, F-CMP-10, F-CMP-13, F-CMP-19, F-IDN-03, F-LAY-01, F-LAY-12, F-DAT-09, F-AND-04, F-AND-05, F-MOT-10.

#### 4.3.8 `tracking/running-row.tsx` — **rewrite** as `RunningCard`
- **Anatomy (full).** `Surface level="cell"`, `radius.lg`, padding `space.4` (desktop adds `shadow.card`, §3.5). Line 1: static `Dot` in `hue.<category>.stroke` · name `type.body` 600 `label.primary` (`truncate`) · Stop (trailing). Line 2: elapsed `type.numeric.live` `label.primary` (h:mm, the largest live number on Now; P3) + «из ~20 мин» `type.footnote` `label.secondary` + «параллельно» word when alongside. Line 3: `ProgressBar` in the category stroke (the compressed "train" line; `status.warn` past the Expect). Past expected: a status line `type.footnote` `status.warn` «Всё ещё занимаетесь?» with `Button secondary sm` «Да, ещё».
- **Stop.** `Button secondary md` with `StopGlyph` (a **filled** square) + «Стоп», trailing, never an outlined square that reads as a checkbox (F-CMP-04); labelled «Стоп: ‹name›».
- **Compact variant (one line).** Dot · name (`truncate`) · elapsed `type.numeric.value` · Stop as `IconButton` with `StopGlyph`; used when folded past the budget, for the alongside activity, and as the desktop shell indicator.
- **States.** Stop and «Да, ещё» per `Button` (loading while writing; a refusal shows inline); card static.
- **Motion.** §6 start/switch activity (row fades in 160 / old out 110; digits change instantly), §6 stop activity (collapse 220), §6 running indicator (static dot). Haptic `Clock_Tick` on Stop.
- **A11y.** **Not a live region** (it spoke every minute; F-A11Y-10): started, stopped and past-expected are announced once; the elapsed time is in the card's label as words («2 часа 01 минута»).
- **Worst case.** 80-char label `truncate` + `title`, never under Stop (F-DAT-02); elapsed past 48 h rolls into days; Expect 1 440 → «из ~24 ч»; RU never wraps «2 ч 17 мин» onto its own line (F-LAY-08).
- **Fixes.** F-TYP-03, F-CMP-04, F-A11Y-10, F-MOT-12, F-DAT-02, F-LAY-08, F-COL-10, F-CMP-06, F-AND-01.

#### 4.3.9 Time-bar pickers: `choices-sheet.tsx`, `choice-row.tsx` — **rewrite**; `calendar-choices.tsx` — **keep** (its rows change through `ChoiceRow`)
- **Container.** Compact: `Sheet` (one content-height detent for ≤ 6 rows; `medium` → `large` for Task's list); expanded: `Popover` anchored to the tapped bar button (F-CMP-13). Title = the button's name.
- **Header.** When its activity runs: Stop as `Button secondary lg` full width with `StopGlyph` (F-CMP-04); when something else runs: `SwitchRow` «Параллельно с текущим»; Task: `TextField purpose="search"` (autofocus only with a keyboard).
- **Rows.** `ChoiceRow` → `ListRow variant="action"` inside one `Group` (the 10 bordered 48 px cards with 20 hairlines go; F-LAY-07): title `type.body` `clamp(2)` · trailing usual length «~30 мин» `type.numeric.value` `label.secondary` · running: trailing `Check` `icon.control` + «идёт» in the name. Task rows reuse `MetaLine`; calendar rows show `08:30–10:05` trailing (tnum). Empty: `EmptyState`-style line + the way on («Начать встречу без события», «Настроить календарь»).
- **States.** Row hover/pressed/focus per `ListRow`; while a pick writes, the picker freezes on its tapped state (kept) and the row shows a spinner.
- **Motion.** §6 sheet / popover; §6 start/switch on the bar after it closes.
- **A11y.** `list` named after the button; rows are buttons with state in the name.
- **Worst case.** 300-char task titles clamp to 2; 100 open tasks virtualised; RU chore names wrap.
- **Fixes.** F-CMP-13, F-CMP-04, F-LAY-07, F-LAY-05, F-COL-01 (search edge), F-A11Y-01.

#### 4.3.10 `task-fields/*` — **rewrite** (the form becomes grouped value rows; F-CMP-08)
- **Anatomy.** Title `TextField purpose="title"` first (touched gate: no error on open; F-CMP-03). Then `Group`s of **value rows** (`ListRow variant="navigation"`: label `type.body`, value trailing `type.callout` `label.secondary`, chevron `icon.inline`), each opening a picker (`Popover` expanded / `Sheet` compact): **Details** — Категория (value = category dot + name; 12 options never as chips), Важность (≤ 4 → `choice` chips inline), Проект (dot + name, not a pill: feedback-2; picker with search past 8); **When** — Начало, Срок, Оценка, Повтор, Политика срока; **Notes** — Описание (`multiline`), Ссылка (`url`); **Подзадачи** (never "Problems", feedback-4). Commit per 4.1.5; the owner's "too bulky" form (feedback-4) loses the 23–25 coloured chips.
- **Tokens / states.** Value rows: hover/pressed/focus per `ListRow`; an invalid value shows `status.danger` text in the value + a `FieldMessage` under the group after a submit attempt; selected chip per 4.2.6.
- **Per file.**

  | File | Verdict | Becomes |
  |---|---|---|
  | `task-fields.tsx` | rewrite | the grouped form above; touched/submitted gate from the kit |
  | `date-field.tsx` | rewrite | `DateRow` value «4 нояб., 23:59» + `DatePanel` (Calendar + `TextField purpose="time"`, «Очистить» `plain`, «Готово» `secondary`) inside the picker container; the zone note only when not the device's |
  | `estimate-field.tsx` | rewrite | value row «1 ч (по категории)» + options as a `select` list + a typed `TextField purpose="number"` (the 32 px pill input goes) |
  | `deadline-policy-field.tsx`, `recurrence-field.tsx` | rewrite | value rows with `select` lists; their panels lose the bordered `bg.bg` boxes; group labels tied to the group (`radiogroup` name; F-A11Y-13) |
  | `deadline-and-repeat.tsx` | keep | composition; its `FormAlert`s become `FieldMessage`s |
  | `option-row.tsx` | merge | into `ListRow` value rows / a named chip `radiogroup` |
  | `form-alert.tsx` | merge | into `TextField`'s `FieldMessage` (error / note variants, one announcement) |
  | `when-chips.tsx` | merge | into the When group's value rows |
  | `task-text-fields.tsx` | keep | now sets `purpose` (`multiline`, `url`) |
  | `subtask-list.tsx` | rewrite | see below |
  | `use-outside-press(.web).ts` | delete | `Popover` / `Sheet` own outside-press dismissal |

- **SubtaskList.** Compact `ListRow`s: leading 8 px bullet `label.tertiary` (submitted: filled `label.secondary` + «сдано» `type.footnote`), label `type.body` **wrap, top-aligned** (a 200-char label no longer centres the controls; F-DAT-06), remove `IconButton` (`X`) at full target (was 36 px / 31.5 dp; F-A11Y-06, F-AND-01) — shown on hover/focus with a fine pointer, always on touch; add row `Button plain sm` «Добавить подзадачу» + an inline `TextField` on `bg.inset`. 100 subtasks render as a plain list inside the sheet body.
- **Phone / desktop / Android.** Pickers anchor on expanded; sheets on compact; ripple on rows.
- **Motion.** §6 popover / sheet; inline panels use §6 disclosure.
- **A11y.** Every group named; value rows read "label, value, button"; errors announced once.
- **Worst case.** 78-char project → value `truncate` with `title`; a 4 000-char description grows to 8 lines then scrolls; a 2 000-char link shows `displayUrl` when blurred.
- **Fixes.** F-CMP-08, F-CMP-03, F-CMP-11, F-COL-02, F-A11Y-06, F-A11Y-13, F-DAT-06, F-AND-01, F-LAY-05.

#### 4.3.11 `assistant/action-cards.tsx`, `assistant/questions.tsx` — **rewrite** (`ProposalCard`: proposals read as proposals; PRODUCT principle 5)
- **Anatomy.** Inside the composer or the time bar, **not a card in a card** (F-LAY-05): a section separated by a `separator`, with a 2 px **dashed** leading rule in `outline` (the draft device shared with 4.3.7). Header `type.caption` `label.secondary` «Предложение ассистента». Each action: summary `type.body` 500 `label.primary` (wrap) + detail lines `type.footnote` `label.secondary`; a field the model only guessed is marked with a «?» glyph and `status.question` ink (non-colour carrier; was `warn`). Questions: `type.callout` `status.question`, options as `choice` chips in a named `radiogroup` (they were `button`s; inventory §8). Buttons: «Подтвердить» `Button primary md` with `KeyHint` ↵ — the one filled accent while the proposal shows (the composer's own send turns `plain`; two lime primaries in one card, F-COL-07) — and «Отмена» `Button plain md` with Esc. Correction: `TextField purpose="text"` + send `IconButton` `ArrowUp` (the `↵` glyph button goes; F-CMP-10).
- **States.** Approve: rest / hover / pressed / focus / disabled (`fill.1` + `label.quaternary`) / loading (spinner, label kept); Cancel and send per their kinds (all three had no pressed state; F-CMP-01). Busy dims nothing by opacity: controls go disabled.
- **Motion.** §6 assistant preview appears (fade + 4 px rise 160 / 110); §6 proposal accepted (collapse 220, the created row highlighted once in `accent.quiet` fading over 600 ms). The approval toast names the result (4.1.4; F-CPY-02).
- **A11y.** `group` named by the proposal summary; Enter approves and Escape cancels only while focus is in the composer/time bar (not page-wide); the result is announced once.
- **Worst case.** 12 actions from a pasted homework list scroll inside the region budget; a 300-char summary wraps; RU details wrap.
- **Fixes.** F-COL-07, F-CMP-01, F-CMP-10, F-LAY-05, F-IDN-03, F-CPY-02, F-A11Y-13, F-LAY-01.

#### 4.3.12 `notifications/notification-bell.tsx` — **rewrite**
- **Anatomy.** `IconButton` (no border, like every other icon button; F-CMP-06) with `Bell` (`icon.bar` in a header, `icon.control` in the sidebar) and a `CountBadge tone="neutral"` anchored to the icon's trailing top, growing outward.
- **States.** Per `IconButton`; unread changes the badge only.
- **A11y.** Label «Уведомления, 3 непрочитанных» (kept); the badge is hidden.
- **Worst case.** 120 unread → «99+», never over the glyph (F-DAT-10).
- **Fixes.** F-CMP-06, F-COL-07, F-DAT-10, F-AND-01.

---

### 4.4 Verdict summary

| Area | Keep | Rewrite | Merge | Delete |
|---|---|---|---|---|
| `ui/*` (31 entries; `+.web` pairs count once) | 2 — `logo`, `screen-scene` | 21 — `button`, `calendar`, `check-circle`, `chip`, `count-badge`, `dissolve`, `empty-state`, `icon-button`, `progress-bar`, `screen-header`, `screen`, `segmented`, `sheet`, `sidebar`, `skeleton`, `slider`, `switch-row`, `tab-bar`, `text-field`, `toast`, `tooltip` | 7 — `animated-height` → `Disclosure`/`Presence`; `back-header` → `ScreenHeader`; `color` → `Tag` + `hue`; `row-list` → `List`; `sheet-actions` → `Sheet`/`Dialog` actions; `split-pane` → `Shell` inspector; `time-input` → `TextField purpose="time"` | 1 — `pulse-dot` (static `Dot`) |
| `shared/*` (30 files) | 3 — `calendar-choices`, `deadline-and-repeat`, `task-text-fields` | 20 — `task-row`, `task-list`, `meta-line`, `user-avatar`, `zone-banner`, `where-sat-line`, `activity-usage`, `time-bar`, `running-row`, `choices-sheet`, `choice-row`, `task-fields`, `date-field`, `estimate-field`, `deadline-policy-field`, `recurrence-field`, `subtask-list`, `action-cards`, `questions`, `notification-bell` | 6 — `week-arrows` + `back-to-today` → `PeriodStepper`; `time-bar-fold` → time bar; `option-row`, `when-chips` → value rows; `form-alert` → `FieldMessage` | 1 — `use-outside-press(.web).ts` (Popover/Sheet dismissal) |
| **Total (61)** | **5** | **41** | **13** | **2** |

New files: 15 primitives (4.1.1) plus `tag.tsx`/`hue.ts`, `switch.tsx`, `notice.tsx`, `shell.tsx`(+`.web`),
`screen.web.tsx`, `shared/period-stepper.tsx`. Open items raised here for Phase 3: the tokens in 4.1.3; the
immediate "why unavailable" tooltip (amends §6 tooltip, 4.2.31); the time bar keeping its four buttons visible
while the field folds (Q12, 4.3.7).

---

## 5. Screen spec

Every route in `apps/app/app/**`, drawn in direction B «Линии» with the §3 tokens. Component names
are the working names of §4 (`ScreenHeader`, `PeriodStepper`, `Group`, `ListRow`, `SectionHeader`,
`EmptyState`, `Skeleton`, `InlineError`, `StatusLine`, `Line`, `Disclosure`, `Sheet`, `Dialog`,
`Popover`, `Menu`, `Toast`, `Button`, `IconButton`, `Segmented`, `Switch`, `Checkbox`, `TextField`,
`TimeField`, `Slider`, `Tag`, `CheckCircle`, `TaskRow`, `RunningCard`, `TrainStrip`, `DayLine`,
`TimeBar`). Measurements are px on the web and dp on Android (one unit system, §3). "390" is the
phone web viewport 390×844 and stands for Android `compact`; "1440" is the desktop web 1440×900.
Russian copy in examples is the lived-in seed (`seedLivedIn`); the worst case is reviewer 05's
fixture set (78–96-character project names, 300-character titles, 37 solved subtasks, 1 284 open
tasks, 120 captures, 80-character labels, 64-character Telegram name, emoji-first name).

### 5.0 Page template

#### 5.0.1 Shell regions per breakpoint

One shell, three regions: navigation · content · inspector (§3.3). Fixes F-LAY-02/03/04, F-AND-03;
`medium` replaces the stretched phone and lifts the portrait lock (F-LAY-04, Q8).

| | `compact` < 600 (phone, 390) | `medium` 600–1023 | `expanded` ≥ 1024 (1440) |
|---|---|---|---|
| Navigation | Material navigation bar (`NavBar`), 4 destinations Now · Day · Inbox · More; 80 dp on Android incl. the pill indicator, 64 px + `env(safe-area-inset-bottom)` on the web; `nav` with links on the web (F-AND-02, F-A11Y-11) | navigation rail 80 wide: the 8 sidebar destinations as icon + caption, New task as the rail's FAB-style top button | `Sidebar` 248 wide, `bg.sidebar`, a `separator` on its edge |
| Content | full width, gutter 16 | gutter 24, column max 720 (960 Day, Insights; Week fills) | starts at a **fixed x = 248 + 32 = 280** on every screen (F-LAY-03, 07-007); column width min(720, region − 64), 960 on Day and Insights, Week fills the region; the **window** scrolls (F-WEB-05) |
| Inspector | none: a selection pushes a screen or opens a sheet | opens as a sheet (detent medium/large) | 400 (min 360, max 480) at the right edge, only on Now, Week and Inbox, **collapsed while nothing is selected** (the content keeps the space; F-LAY-03, 07-029) |
| Fixed bottom chrome | `TimeBar` (Now only) + `NavBar`, together ≤ 40 % of the viewport height (region budget, §3.3; F-LAY-01) | same, rail instead of bar | `TimeBar` sticky at the bottom of Now's content column (column width, `bg.cell`, `shadow.card`); the same 40 % budget applies at zoom |

**Sidebar (expanded).** Top to bottom:
1. Header row 56: the Pace mark (24, Pace green, no wordmark; F-LAY-06) · the owner's **full**
   Telegram first name in `body` 600 (`Line truncate-end`, `title` with the full name; a name up
   to ~16 Latin / ~14 Cyrillic characters never truncates; owner feedback-4 «сверху Pace, а справа
   имя из профиля – Albert») · the bell `IconButton` (unread = a 8 px `status.danger` dot plus
   "N unread" in its label). No avatar in the header (one accent per region; 07-020, F-DAT-08).
2. «Новая задача» `Button` (regular, tonal `fill.2`, + icon, `N` key hint trailing) — not a filled
   accent (the view's one filled element belongs to the content; F-COL-07, owner feedback-3 «И тут
   тоже, давай в целом в палитре поменяем»).
3. Nav rows 44: icon 20 + label `body`; selected = `fill.3` + `label.primary` 600 + a 3 px leading
   bar inside the row (non-colour carrier; F-COL-02); `<a href>` with `aria-current="page"`
   (F-WEB-03). Inbox carries its waiting count trailing in `numeric.value` `label.secondary`
   («3», «99+»), never a second Inbox counter on Now (owner feedback-4).
4. Foot: the **running indicator** on every screen except Now (F-LAY-12): a 52-high cell with the
   category dot, `Line truncate-end` name, elapsed in `numeric.value`, a Stop `IconButton`; a tap
   on the name goes to Now. Under it, the offline `StatusLine` when offline (5.0.5).

**NavBar (compact).** Icons 24 with the filled variant when selected on Android, pill 64×32, labels
`caption` with `maxFontSizeMultiplier` 1.6; the Inbox badge (`caption2`, `status.danger`, «99+»
max) is anchored at the icon's right edge and grows to the right (F-DAT-10). More's destinations
(Week, Projects, Insights, History, Settings) are pushed **inside the More tab's stack**, so the
bar stays with More selected (F-AND-03); it hides only on task detail, full-screen forms and while
the soft keyboard is up (F-AND-04).

#### 5.0.2 One header per screen type

Exactly three header types (P5; fixes F-LAY-02, F-TYP-02, 07-006). No eyebrow above any title.
Every header is a `ScreenHeader`/`SheetHeader` from the kit with `aria-level` 1 for its title.

| Type | Phone (390) | Desktop (1440) | Used by |
|---|---|---|---|
| **Top-level** | a 48 top bar (leading: back chevron only when pushed from More; trailing: up to two `IconButton`s) · `largeTitle` 32/38 below it at `header.top` 8 · one subtitle row 24 (plain `callout` `label.secondary` date, or a `PeriodStepper`) · `header.bottom` 12 | `header.top` 28 · `largeTitle` 28/34 at x 280 with trailing actions on the title's line (right edge of the column) · subtitle row 24 · `header.bottom` 16 | Now, Day, Inbox, More, Week, Projects, Insights, History, Settings, Notifications (desktop) |
| **Pushed** | a 48 app bar: back (48 target) · optional context control (`Line truncate-end`) · trailing labelled actions; then `title1` 24/30 as the first content line (wraps, entity names are never cut); once it scrolls under the bar the bar shows it in `headline` and gains its `bg.app` fill + `separator` (scroll edge; F-LAY-13) | same, inside the content column (back = browser-style "‹ Projects"); in the inspector the back becomes ✕ (close) | task/[id], project/[id], presets, presets/[id], decisions, permissions, notifications (phone) |
| **Sheet / dialog** | `title2` 20/26 leading · trailing ✕ `IconButton` (always visible, also on phone web; F-CMP-02) · a real grabber above it (drag dismisses; §6) · for forms the primary action sits in this row, left of ✕ | `title2` 18/24 · ✕ trailing · the form's primary action left of ✕ with its shortcut | every sheet, dialog, the inspector's form |

Title position is top-anchored: the large title's baseline is at the same y on every top-level
screen (phone: top inset + 48 + 8 + 30; desktop: 28 + 27), whatever the subtitle row holds.

**PeriodStepper** (Day, Week, History, Insights; P5, F-CMP-05, owner feedback-4 «Reset to today на
всех неделях которые не наши. И у вкладки Day то же самое»): one row in the subtitle slot, left
aligned under the title: `‹` `IconButton` · the period label (`callout` 500, tabular; on Day it
opens the date picker: `Popover` anchored to it on desktop, `Sheet` on phone) · `›` `IconButton`
(hidden, not greyed, when the next period is in the future) · «Сегодня» / "Today" (on Week and
Insights «Эта неделя» / "This week") as a quiet text `Button` at the row's trailing end, **only away
from the current period**, in a slot reserved on the row so nothing reflows when it appears. The
back chevron never sits on this row (it lives in the top bar), so ‹ back and ‹ previous are never
neighbours. RU at 390: «‹ Воскресенье, 1 нояб. ›  Сегодня» fits (≈ 330 of 358); at 320 the label
switches to the short form «Вс, 1 нояб.».

#### 5.0.3 Content column and lists

- One ground (`bg.app`) with grouped sections (P2): a `Group` is `bg.cell`, radius `lg` 16, no
  border; rows inside are `ListRow` (min 52 phone / 44 desktop, `row.padX/Y` 16/12 · 16/10);
  separators only between rows of a group, inset to the text start (F-LAY-05, owner feedback-4 «Где-то
  есть черточки, где-то нет»). On phone, groups are inset 16 from the screen edge.
- Section header: `SectionHeader` (`subhead`, sentence case, `label.secondary`, 24 above / 8 below,
  `aria-level` 2, 3 inside panes) with an optional trailing count in `numeric.value`.
- Two list styles only: **inset grouped** (Settings, More, pickers, Projects, Inbox, Notifications,
  History, project page) and **task list** (`TaskRow` in a `Group` with its `SectionHeader`; Now,
  project page, History snapshot).
- Text slots declare a policy (P7): `wrap` · `wrap N` (clamp at N lines + «Показать всё» when the
  text is content) · `clamp N` (ellipsis, full text in `title` on the web and in the accessibility
  label) · `truncate-end` · `truncate-middle` (identifiers: URLs, hosts, device names) · `count`
  (switch to a count form instead of a list) · `fixed` (a UI string: must fit RU at 390, otherwise
  a shorter RU string — never a smaller size). All built on the kit's `Line`, which is
  `min-width: 0; flex-shrink: 1` by construction (F-DAT-02, F-DAT-07).
- Volumes the layout must hold (F-DAT-03): lists over 50 rows are virtualised (FlashList on
  Android, windowed on the web), layout animation off above 50 rows, folds page by 50.

#### 5.0.4 Where overlays come from

| Overlay | Phone | Desktop |
|---|---|---|
| Selection detail (task, Week block, capture) | pushed screen (task) or `Sheet` (Week, Inbox) | inspector |
| Editor or form (activity, edit task, close task, add a computer, connect AI) | `Sheet` from the bottom, its own height, detents medium/large when it scrolls | centred `Dialog`, width 560 (owner feedback-3 «на пк ожидается что у нас плашка появится по центру») |
| Picker for one value (date, project, category, repeat, Chores/Rest/Task choices) | `Sheet` | `Popover` anchored to its control (F-CMP-13) |
| Confirmation of a destructive action | inline in place of the control (Delete task, End session, Wipe, Delete account, remove a preset rule; Q5) | same |
| Overflow actions | `Menu` (bottom sheet list on Android) | `Menu` anchored to ⋯ |
| Transient feedback | `Toast` above the bottom chrome, measured from the real chrome height | `Toast` at the bottom of the content column, never in the sidebar (F-CMP-12, 07-004) |

The scrim fades in place while the sheet slides (owner feedback-2 «затемненная часть тоже всплывает»).
Focus enters on the first meaningful control and returns to the trigger (§8).

#### 5.0.5 Empty, loading, error, offline

- **Loading.** Local-first: once the store has hydrated, nothing loads. Before hydration, and for the
  few network reads (sessions, notifications feed, Decisions, calendar range, usage), a `Skeleton`
  appears **only after 300 ms** of waiting, built from rows of the **final heights** (so content
  replaces it without a shift; CLS ≤ 0.05 on Now and History; F-WEB-11). First paint is in the
  account's language (F-DAT-04); badges hold until the first full pull.
- **Empty.** One `EmptyState`, left-aligned to the column (never centred in a list; F-CMP-09,
  07-023): a `headline` line that says **what appears here**, one `callout` line on how it gets
  there, and **the one action** that adds it (a `Button`, regular, secondary unless the screen has
  no other filled element). No empty `<ul>` (F-A11Y-18).
- **Error.** An `InlineError` next to its cause, never a toast: `status.danger` icon 16 + one
  `callout` sentence that says what failed + «Повторить» / "Retry" text `Button`. A failed action
  on a row shows under that row; a failed read replaces the list body.
- **Offline.** A quiet `StatusLine` (`footnote`, `label.secondary`, cloud-off icon 16): «Нет сети ·
  изменения отправятся позже» / "Offline · changes will sync". Phone: directly under the header
  subtitle on top-level screens (one line, 24 high; it moves content down once, when the network
  state changes, never during a load); desktop: the sidebar foot.
  Every action still works and queues (event log); the assistant falls back to the rule parse and
  says so in one line inside the proposal (`BL/states/offline--phone-light-ru.png`); actions that
  need the server (End session, Add a computer, Export, Wipe, Delete account, OAuth) are disabled
  with the reason as their hint.
- **Not found.** An entity that no longer exists (deleted task or project, stale link): the pushed
  screen shows an `EmptyState` «Задача удалена» + «К списку» and, when the deletion happened in this
  session, the Undo. Never a header reading "No project" over "This task does not exist" (F-A11Y-02).

#### 5.0.6 Keyboard on desktop

- **Enter** commits a one-line input or an assistant proposal; **⌘/Ctrl+Enter** commits any form,
  sheet, dialog and the task's Done; **Escape** closes the topmost overlay, cancels an inline
  confirmation, folds an open composer form, closes the inspector (focus returns to the row);
  **⌥/Alt+Enter** sends the composer line to the Inbox (F-CMP-11, 07-016).
- Shortcuts are shown on the buttons that have them, in the OS's words (`⌘↵` on a Mac,
  `Ctrl+Enter` elsewhere; owner feedback-3 «хоткеи и показывать их на кнопках. И нужно учитывать ОС»),
  as a trailing `caption` key hint inside the button; icon-only controls show them in the tooltip.
- Single-key shortcuts (`N` new task, `F` focus, `T` today on period screens) work only while focus
  is not in a text field, and a Settings switch turns them off (§8, Q6; F-A11Y-03).
- `↑`/`↓` move the selection in a list that has an inspector (Now, Inbox) and in Week's blocks of a
  day; `←`/`→` change the period on period screens when focus is not in a field.
- Focus order: skip link → sidebar → header → content → inspector; every stop shows the `focus`
  ring (F-A11Y-01, F-A11Y-12).

#### 5.0.7 Russian and worst-case rules

- Every layout is checked at **390 in RU** (and 320 for the composer, time bar and task footer). RU
  runs 15–40 % longer: a `fixed` slot that does not fit gets a shorter RU string, never a smaller
  size and never a wrapped single word.
- Words wrap **between words, never inside a word**: no `word-break: break-all`, no automatic
  hyphenation in tiles; a label that cannot fit at two lines changes layout (2-up instead of 3-up)
  (F-TYP-04).
- Numbers, durations and units come from the core formatter with non-breaking spaces
  («2 ч 05 мин», «1 284», «3,3»; F-CPY-04); meta tokens are joined with « · » and a non-breaking
  space before the dot so no token starts a line alone (F-LAY-08, 07-012).
- User content is never translated or rewritten; it is marked `lang="ru"` where its script is known
  (F-A11Y-20).

---

### 5.1 Now — `(tabs)/index`

The owner's home: what to do, what runs, one line to add anything. Most used screen; drawn first.

**Layout at 390.** Top-level header: top bar with the bell trailing; `largeTitle` «Сейчас»; subtitle
«Воскресенье, 1 ноября» (`callout`, `label.secondary`). Scroll content: the composer cell → zone
notice (only when the device zone differs) → the calendar offer (when one is due) → project filter
chips (only with ≥ 2 projects in the list) → task groups («Со сроком · 3», «Без срока · 2») →
«Позже · 2» disclosure. Fixed: `TimeBar` above the `NavBar`, under the region budget. Sheets come
from the bottom (time-bar pickers, a time-bar proposal that would exceed the budget). A task tap
pushes `task/[id]`.

**Layout at 1440.** Sidebar · content column (720 at x 280) with header, composer, offer, chips,
groups, and the `TimeBar` sticky at the column's bottom · inspector (400) **only** while a task is
selected or the task form is open; collapsed otherwise, so the list keeps its width (today the
empty pane is 656 against a 535 list; F-LAY-03, 07-029). With the inspector open the content region
is 792 and the 720 column still fits.

**Hierarchy.** 1) the running activity's name and elapsed time (the largest live number on screen,
P3); 2) the first task group's titles; 3) the composer line. The title and date are orientation, not
content.

**Composer** (owner feedback-3 «набрать какой-то текст, нажать Enter … вторым Enter задача появится»;
feedback-4 «Громоздкое, мб попроще?»):
- One line in a `bg.cell` cell, radius `md` 12, no border, height 48 (grows with a pasted message up
  to 8 lines, then scrolls inside). Leading `+` `IconButton` (phone: always; desktop: only while the
  line has text, because the sidebar's «Новая задача» is the empty-form entry there; F-CMP-18).
  Placeholder «Задача или вставьте текст» (`fixed`; at 320 «Задача или текст»; F-A11Y-17). Trailing:
  «Во входящие» `IconButton` (tooltip «Во входящие · ⌥↵») and Send ↑ — a filled accent circle
  **only while the line has text** (at rest the screen has no filled accent; P1).
- **Enter → proposal.** Enter sends the line to the assistant. Pending: the line's text stays,
  greyed, inside a 1 px **dashed `outline`** boundary (the one draft treatment, shared with the
  time bar and Inbox; F-IDN-03) with «Читаю…» and a 16 spinner in place of Send. The proposal then
  unfolds inside the composer cell under the line: a `headline` sentence that says what will happen
  («Ассистент создаст «Купить батарейки»»), the facts as `ListRow`s (Категория, Проект, Срок,
  Подзадачи …) on `bg.inset` with the same dashed boundary (proposals read as proposals), the
  actions row with «Подтвердить ↵» (filled, the view's one) and «Отмена Esc» (quiet), then the
  one-line «Уточнить…» follow-up field. A second Enter approves. After approval the created row
  appears in its group with the one-time `accent.quiet` highlight (§6) and the toast names the
  result: «Задача создана: «Купить батарейки» · Вернуть» (F-CPY-02, F-CPY-03).
- **+ opens the form in place** (owner feedback-3 «если я ее раскрываю – ввод перекидывается в
  название»). Phone: the cell grows into the form (§6 composer unfold; no clipped frame, F-MOT-08),
  the typed line becomes the Title. Desktop: the form opens in the **inspector** (owner feedback-4
  «у нас энивей поле свободное справа есть, го туда перенесем»); the line stays visible, locked, as
  the draft's source. Form header: `title2` «Новая задача» · **«Создать ⌘↵»** filled `Button` at the
  right · ✕ (Escape). Enter in the Title also creates. Fields as value rows (F-CMP-08): Title
  (`TextField`, no error before the first Create attempt or blur; F-CMP-03), Importance (`Segmented`,
  4 options), Category and Project (rows with the value trailing → picker), Start · Due · Estimate
  (one row of three compact value buttons), Deadline type (`Segmented`, 2), Repeat (row → menu),
  Description (multi-line, 3 lines then grows), Link (`TextField purpose=url`), Subtasks (inline list
  with «Добавить подзадачу»; the word is Subtasks, never Problems — owner feedback-4). No "Check
  before adding" heading (owner feedback-4).
- To Inbox: the line empties and a toast «Сохранено во входящих · Вернуть» appears next to the
  composer (07-026).

**Task rows** (owner feedback-2 «тегов срочности … после проекта. Из Due убираем день недели»):
- `TaskRow` in a `Group`: `CheckCircle` (24 visual, 48 target) leading; title `body`, `clamp 2`;
  one meta line in `footnote`: project `Tag` (tint + ink, `truncate-end`, max 50 % of the row) ·
  importance word only when not Normal (Urgent in `status.danger` ink; Q3) · due «завтра 18:00 ·
  23 ч 39 мин» (`numeric.value` at footnote size, tabular) · subtasks «1 из 3» · repeat icon 16.
  The meta line never wraps: tokens drop from the right (subtasks first) and the line truncates at
  the end (F-LAY-08). Tasks with progress get a 3 px progress line under the meta line in the
  project's stroke on `fill.4`.
- Heights: 64 with a one-line title, 86 with two (phone); 56 / 76 on desktop. Selected row (desktop):
  `selection` fill + 3 px leading bar (F-COL-02).
- Check-off: the circle fills on pointer-down, the row dissolves and the list closes up in ≤ 300 ms
  total; Undo toast starts with the dissolve (§6; F-MOT-01, owner feedback-4 «чуть сократи время»).

**Calendar offer** (owner feedback-2 A4): when an accepted event starts within 10 minutes or is on,
a one-row `Group` under the composer: event title (`body` 600, `clamp 2`) · «18:30–20:00 · ауд. 214»
(`footnote`, tabular) · trailing «Отметить» (filled small — it is the view's filled element while
the offer shows; the composer's Send yields its fill when both would show) and «Пропустить» (quiet).
Skip failing shows an `InlineError` under the offer.

**Running card and the "train" strip** (`RunningCard`, the B signature on Now; F-TYP-03, F-A11Y-10):
- The top of the `TimeBar`: `bg.cell`, radius `lg` 16 (desktop adds `shadow.card`). Main row: the
  activity name in `headline` (`truncate-end`, never under the buttons; F-DAT-02) with the elapsed
  time trailing on the same line in `numeric.live` («2:01»); under them a `footnote` line «из ~20 мин»
  plus, past twice the Expect, «· Ещё занимаетесь?» in `status.warn`; trailing controls: «Да» (tonal,
  only while asked) and «Стоп» (tonal, a **filled** rounded-square glyph; F-CMP-04).
- Under the main row, the **`TrainStrip`**: a 6 px track (`fill.2`, radius 3) for the activity's
  segment; the category stroke fills it up to elapsed; a 12 px station ring (`bg.cell` centre, 3 px
  ring in the stroke) sits at the current position — the train on its segment. Scale = the Expect;
  without an Expect, the next of 1 h · 2 h · 4 h · 8 h above elapsed. Past the Expect the fill is
  full, the ring sits at the end and the text carries the warning (no red, no pulse; F-MOT-12).
- An activity running alongside: a compact row below a separator (dot in its stroke · name
  `body` 500 · elapsed `numeric.value` `label.secondary` · «параллельно» · Stop), no strip.
- Not a live region: the row announces «Запущено», «Остановлено», «Дольше ожидаемого» once.

**Time bar** (owner feedback-2 «каждая кнопка была довольно большой … и всегда находилась в своем
месте»; feedback-4 «Calendar, Task, Chores, Rest … уберем их [шестеренки] везде»):
- Under the running card: the typed field «Чем заняты?» (`TextField`, 48, `maxLength` 80 = the
  schema; F-DAT-09) with a Start ▶ `IconButton` (filled only with text). After Enter the typed text
  becomes an **outlined draft** in the field's place (1 px dashed `outline`, the text in
  `label.secondary`, «Читаю…»; owner feedback-3 «давай контуром, чтобы было видно что это как бы
  драфт»); the proposal («Запустит «Пошёл в ЦСС» · ожидание ~20 мин · остановит «Дорога»») appears
  above the field with «Подтвердить ↵» / «Отмена».
- Then **four fixed tiles**, always in this order and place: Календарь · Задача · Дела · Отдых.
  56 high, equal width ((358 − 24) / 4 ≈ 83 at 390), radius `md`, neutral `fill.2`, icon 20
  `label.secondary` over a `caption` label (`fixed`; «Календарь» ≈ 62 px fits). The running
  category's tile: `fill.3`, icon in its stroke, label 600, a 3 px bar in the stroke along its
  bottom edge, and «— идёт» in its name (F-COL-05, F-COL-02). A tap opens its picker (sheet / popover);
  long press (phone) or right click (desktop) opens it with «Параллельно с текущим» on (owner
  feedback-2 A2).
- Calendar with nothing near: the same neutral tile (never dashed or "disabled"; F-COL-12); a tap
  shows an inline hint under the tiles for 3 s, hover shows it at once on desktop: «Рядом нет событий
  в календаре» (owner feedback-4 «можнопросто про то что в календаре нет событий рядом»); on the web
  without a phone calendar: «Календарь приходит с телефона».
- **Folding under «Начать другое» (phone), driven by the region budget**, not by "opened while
  something runs" (F-CMP-19, F-LAY-01, 07-003). Budget = 40 % of the viewport height for `TimeBar` +
  `NavBar`. At 390×844: idle bar 136 + nav 64 = 200 (24 %); one activity running 230 + 64 = 294
  (35 %); two running 274 + 64 = 338 (40 %). On Android the bar is 80 dp: on the owner's Pixel 9a
  (411×923 dp, ≈ 899 usable) two running activities take 354 = 39 %. Steps when over budget, in order: (1) alongside rows
  go compact (36); (2) the field and the four tiles fold under one 44-high «Начать другое ⌃» row;
  (3) the bar becomes its one-row running summary (dot · name · elapsed · Stop), tap opens the bar
  as a sheet; at 400 % zoom it scrolls with the content. So with one or two activities on the
  owner's phone the tiles stay visible and switching is three taps (app → Дела → Дорога); the fold
  appears at 320×568, at ≥ 150 % font scale or zoom, with a time-bar proposal open, or with the
  keyboard up (then the nav bar hides and only the running summary and the focused field remain;
  F-AND-04). A time-bar proposal that would exceed the budget opens as a sheet (07-003).
  Changing the fold trigger is an owner decision (PRODUCT.md describes the fold) — see the open
  question at the end of §5.
- Desktop: the bar never folds at 100 %; running card and tiles sit side by side when the column is
  ≥ 680 wide (card 300 left, field + tiles right), stacked otherwise.

**States.** Empty: «Здесь появятся ваши задачи, ближайший срок сверху» + «Добавить задачу» (focuses
the composer); with tasks only in the future, the «Позже · 2» disclosure opens by itself. Loading:
skeleton of the composer cell, one group header and three 64-high rows (after 300 ms, before
hydration only). Error: an assistant failure shows as an `InlineError` inside the composer cell
(«Ассистент не ответил · Повторить»); a failed Skip under the offer. Offline: `StatusLine`; Enter
gives the rule parse with its one-line notice. Steady state: opening Now fires each read once
(calendar, notifications; F-DAT-12).

**Worst case / RU.** 300-character title → `clamp 2`; 78-character project → tag truncates at
50 % (05-002); 12 projects × 78 characters → chips cap at 180 and truncate; on desktop chips wrap
to two rows then «Ещё 7» opens a menu (05-006); 1 284 tasks → groups show 3 rows and «Показать ещё
50» pages, list virtualised (05-007); 80-character activity label → `truncate-end` before the
elapsed time and the buttons; two activities with Expect 1 440 → «24:00» fits `numeric.live`
(tabular, 5 characters). RU: «из ~20 мин · Ещё занимаетесь?» stays on one line at 390 (≈ 230 px);
if not, «Ещё занимаетесь?» moves to its own line (fixed 2-line max, F-LAY-08 / 07-034).

**Keyboard.** `N` new task (form in the inspector); Enter / ⌥↵ / Escape in the composer; ↑↓ select tasks, Enter opens the selection in the inspector,
`F` focuses it, ⌘↵ marks it done, Escape closes the inspector; Space toggles the check of the
focused row. Focus order: header → composer → offer → chips → rows → time bar (the time bar is
after the list in DOM order on desktop, before the nav bar on phone).

**What changes vs today and why.**
- Eyebrow «ВОСКРЕСЕНЬЕ · 1 НОЯБ.» → subtitle under the title; title at the shared top-level y
  (F-TYP-02, F-LAY-02).
- "Normal" tag removed from rows; importance only when it says something (F-COL-04, Q3); status is a
  word (feedback-3's two-greys complaint is answered by showing less, not more colour).
- Running row inverted: name + elapsed as the hero, Stop as a filled glyph, the train strip instead of
  an 11 px tag and a 4 px bar (F-TYP-03, F-CMP-04, F-IDN-01, P3).
- Time-bar tiles: neutral resting tiles, colour only on the running one; Calendar never looks
  disabled (F-COL-05, F-COL-12, owner feedback-4).
- Fold by budget; the list never drops below 50 % of the viewport (F-LAY-01, F-CMP-19, 07-003).
- One draft treatment for composer and time bar (F-IDN-03, owner feedback-3).
- Desktop: inspector collapses when empty; content starts at x 280; one New task entry (F-LAY-03,
  F-CMP-18, 07-035).
- Toast names the result and sits by the composer / above the bar (F-CPY-02, F-CMP-12, owner
  feedback-4's toast over Rest/Sport).

### 5.2 Day — `(tabs)/day`

The day as a metro line: what happened, what is missing, fix it. The B signature screen.

**Layout at 390.** Top-level header: «День», subtitle = `PeriodStepper` «‹ Воскресенье, 1 нояб. ›»
(+ «Сегодня» away from today). Content: summary cell → sleep suggestion card (phone, when usage
data proposes one) → the **day line** → «+ Записать прошедшее» row → «Календарь» section (phone:
today's accepted events with Attend/Skip) → «Время на устройствах» section. No fixed bottom chrome
except the `NavBar`. Edits open the activity `Sheet` (medium detent; time fields with
`inputmode=numeric`; above the keyboard).

**Layout at 1440.** Sidebar · content column **960** at x 280 · inspector **400** when a block or gap
is selected (collapsed otherwise), as the comp draws it: the block's details, «Где я сидел» and
Изменить / Удалить; editing opens the activity editor in the inspector (desktop) or a sheet (phone).
Same pattern as Now and Week (owner, feedback-4: "like Now — list on the left, details on the right").

**Hierarchy.** 1) the line's gaps and the running block (what needs attention: «1 ч 20 мин без
записи · Записать»); 2) block labels and durations; 3) the summary totals.

**Summary cell** (`Group`): `footnote` line «Учтено **9 ч 41 мин** · Без записи **2 ч 10 мин** · Сон
7 ч 50 мин» (numbers in `numeric.value`); a 8 px proportional 24-hour stack (segments in category
strokes, unlogged time in `fill.2`, gap of 1 px between segments); a legend line of «● Учёба 3 ч»
tokens that wraps between tokens (never inside one). Replaces the row of washed category tags
(F-COL-06).

**The day line** (`DayLine`; F-IDN-02, §2 B, P3 «Day stays an editable list, the rail is its index»):
- Three columns: time (start time «14:20», `numeric.value` at `footnote` size, 48 phone / 64
  desktop) · the rail (24 phone / 32 desktop) · the row content. Rows stay an editable list; the
  rail is drawn beside them.
- **Proportional rows.** Row height = max(row.min, minutes × k), k = 0.8 px/min phone, 1 px/min
  desktop, **capped at 3 h** (144 phone / 180 desktop). A longer block or gap is drawn at the cap
  with a scale break on the rail (two short 45° ticks in `label.quaternary`), and its own time
  range in the row says the real length. Every row shows its start in the time column, so the
  reading never depends on the scale.
- **Rail.** A block = a 6 px segment in its category stroke from the row's top to its bottom, with a
  **station ring** (12, `bg.app` centre, 3 px ring in the stroke) at its start; the running block's
  station is **open** (ring with no fill and the segment continuing as a 2 px stroke to the now
  marker). A gap = a 2 px **dashed** segment in `label.quaternary`.
- **Block row content**: label `body` 600 (`wrap 2`; the label leads, 05-019) · meta `footnote`
  «Учёба · 14:20–16:00 · из календаря» (category name in `label.secondary` beside the rail's colour,
  not a tag; P1) · trailing duration `numeric.value` («1 ч 40 мин», running in `label.primary` 600 with
  «из ~20 мин» under it in `footnote`) · no pencil glyph: the whole row is the button (hint «Изменить
  «Матанализ, лекция»»). The task link «Открыть задачу» sits on its own line under the meta, aligned to
  the label (a link outside the row button; screen readers get «Открыть задачу «ДЗ по алгебре»»).
  Usage («Chrome 52 мин, Telegram 18 мин», `clamp 1`) and the phone's "ended at" prompt follow as
  footnote lines.
- **Gap row**: «1 ч 20 мин без записи» `callout` `label.secondary` · trailing «Записать» quiet text
  `Button` in `accent.text` (indigo is gone; F-COL-07). The whole row opens the editor prefilled
  with the gap's range.
- **Now marker** (today): a 2 px `label.primary` line across rail and content at the current time
  (inside the running block or the current gap), its time «17:21» in `caption` 600 tabular in the
  time column. Static, no pulse.
- **Parallel activity = a branch.** A block that ran alongside draws a second, thinner line (4 px,
  station 10) that splits off 12 px to the right of the main line at its start and rejoins at its
  end; its row is indented to the branch and says «параллельно». A third parallel block is listed
  in the branch with «+1» on the rail.
- **Overlap = hatching, never red.** Where two non-parallel blocks overlap (an auto-logged sleep over
  a manual block; owner feedback-4 «Если есть наложения, можно потом поподвигать даты»), the
  overlapping stretch of the rail is drawn with 45° hatching in both strokes, and the later row
  carries a `footnote` «Пересекается с «Сон» на 20 мин · Поправить» (opens the editor). Red stays
  for overdue and destructive only (§3.1).
- Separators: none between rows; the rail and row spacing carry the rhythm (owner feedback-4).

**States.** Empty past day: one 24-hour gap row (drawn at the cap with a break) plus `EmptyState`
«Здесь появится ваш день: всё, что вы запускаете на «Сейчас» и записываете задним числом» →
«Записать прошедшее». Today with nothing: the gap from 00:00 to now + the same action. Loading:
skeleton rail + 4 rows (pre-hydration only). Error: the usage and calendar sections show
`InlineError` with retry; the line itself is local. Offline: `StatusLine`; edits queue.

**Worst case / RU.** 80-character label → `wrap 2` then ellipsis (05-019); a 23 h 59 min block →
capped row with a break; a 30-second block → «15:00 · 1 мин», min height; five consecutive 20-minute
blocks → five min-height rows (no pile: rows never overlap, the rail joins them); 15 h 20 min gap →
capped dashed segment. RU: «1 ч 20 мин без записи» + «Записать» fits at 390 (≈ 250 of 270); the
summary's legend wraps between tokens.

**Keyboard.** `←`/`→` previous/next day, `T` today (single-key, gated), Enter on a focused row opens
its editor; in the editor ⌘↵ saves, Escape closes. Focus order: period control →
summary → rows in time order → «Записать прошедшее» → sections.

**What changes vs today and why.**
- Equal-height rows → proportional rows with a metro rail, stations, dashed gaps, a now marker and a
  branch for parallel time (F-IDN-02, F-IDN-01, §2 B).
- Eyebrow date + three icon arrows with a greyed › → one `PeriodStepper` with «Сегодня» only away
  from today (F-CMP-05, owner feedback-4).
- Category as a washed tag above a cut label → label first, category as line + word (05-019,
  F-COL-06, F-LAY-08).
- Indigo «Log» link and durations → `accent.text` «Записать», running time in `label.primary`
  (F-COL-07).
- Pencil glyph per row removed (the row is the button; F-CMP-10, F-A11Y-19).
- Day/next-day crossfade removed; the new day replaces the old in place (F-MOT-07).
- Desktop column 960 at x 280 instead of a centred 880 scroller (F-LAY-03, F-WEB-05).

### 5.3 Inbox — `(tabs)/inbox`

What waits on the person: decisions the rules want, then captures with their guess.

**Layout at 390.** Top-level header «Входящие», subtitle «3 ждут» (`callout`, count) or none when
empty. Sections: «Разобрать» (review decisions, `Group` of `ReviewCard` rows) then «Заметки»
(captures). Tap on a capture opens its detail `Sheet` (medium detent). No fixed chrome but the
`NavBar`.

**Layout at 1440.** Sidebar · column 720 · **inspector** while a capture or decision is selected:
the full text (`wrap`), the guess as label/value rows (Категория, Проект, Срок, Важность), «Принять ⌘↵»
(filled) and «Удалить» (quiet, destructive text). Collapsed when nothing is selected.

**Hierarchy.** 1) the capture text; 2) the guess line; 3) the actions.

**Rows.** Capture row: text `body` `clamp 4` (+ «Показать всё» opens the detail; 05-010) · guess
`footnote` «Домашка · Алгебра · 4 нояб. 18:00» (importance only when not Normal) · trailing compact
«Принять» (`Button` small, **tonal**, not filled: N items must not make N accent bars; F-CMP-15) ·
Delete in a ⋯ `Menu` and as a swipe on Android, followed by an inline Undo in the row's place for
10 s. Review row: title `clamp 3`, «ждёт с пн» `footnote`, its one-tap answers as small tonal buttons.

**States.** Empty: `EmptyState` «Здесь появятся заметки, отправленные во входящие из строки ввода или
боту, и решения, которые ждут вас» → «Открыть строку ввода» (Now, composer focused). The permanent
two-line explanation is gone (F-CMP-09). Loading: 3 skeleton rows of 4-line height (pre-hydration).
Error: a failed Accept shows under its row. Offline: `StatusLine`; Accept/Delete queue.

**Worst case / RU.** 1 500-character capture → `clamp 4`; 120 captures → virtualised, no bulk action
(new feature, out of scope); 300-character review title → `clamp 3`. RU: «Принять» small fits; the
guess line truncates at the end.

**Keyboard.** ↑↓ select, Enter opens in the inspector, ⌘↵ accepts the selection, ⌘⌫ deletes it (with
the inline Undo), Escape closes the inspector.

**What changes vs today and why.** Cards with two 50/50 full-width buttons → rows with a compact
tonal Accept and Delete in a menu (F-CMP-15, 07-024); unclamped text → `clamp 4` (F-DAT-06); the
uppercase «РАЗОБРАТЬ» label → `SectionHeader` (F-TYP-02, F-A11Y-05); empty list `<ul>` removed
(F-A11Y-18); desktop gains the inspector (§3.3).

### 5.4 More — `(tabs)/more`

**Layout at 390.** Top-level header «Ещё» (no trailing action). Owner row: `Group` with the avatar
(40, `fill.3`, `label.secondary` initials from graphemes, person icon fallback; F-DAT-08) and the full
Telegram name in `headline` (`truncate-end` only past the row; never "D…"). Then an inset grouped
list: Неделя · Проекты · Аналитика · История; a second group: Настройки. Rows 52, icon 20
`label.secondary` leading, chevron 16 trailing, `<a href>` on the web. Each push stays inside the
More stack with the `NavBar` visible (F-AND-03).

**Layout at 1440.** Not shown: `/more` redirects to Now (the sidebar holds every destination). At
`medium` it is reachable only on phones.

**Hierarchy.** Destinations, then the owner's identity.

**States.** No empty/loading: the owner row is omitted until the name is known (no skeleton jump: the
row is reserved at 64 when a name is cached).

**Worst case / RU.** 64-character name → one line, `truncate-end`; emoji-first name «🦊 Лиса» → initials
«Л» (graphemes, letters only). RU labels fit.

**Keyboard.** Arrow keys move between rows (list semantics); Enter opens.

**What changes vs today and why.** Full-bleed 56 rows with hairlines → inset grouped list (F-LAY-05,
07-010); destinations keep the tab bar (F-AND-03); the indigo initial → neutral avatar (F-COL-07).

### 5.5 New task / share target — `(tabs)/add`

Not a tab (`href: null`); the share target and the manifest's "New task" shortcut (F-WEB-13).

**Layout at 390.** Exactly Now (5.1) with the composer focused: a share's text is in the line and the
keyboard is up (the time bar folds to its running summary, the nav bar hides; F-AND-04); an empty
`/add` (New task) opens the composer's form in place with the cursor in Title.

**Layout at 1440.** Now with the form open in the inspector and the cursor in Title.

**States / worst case.** A 2 000-character shared text sits in the line (grows to 8 lines, then
scrolls) and is read by the assistant on Enter; URLs in the share are kept as the task's Link by the
assistant, shown middle-truncated.

**Keyboard.** As Now; Escape folds the form back to the line with the text kept.

**What changes vs today and why.** Nothing structural; inherits Now's fixes (F-CMP-03: the empty form
opens without an error).

### 5.6 Week — `week`

The week as lived: tracked time, calendar events and device use on one proportional grid.

**Layout at 390.** Top-level header (back chevron to More in the top bar; moon `IconButton` «Ночные
часы» trailing, a `switch` with `aria-checked`, no tooltip on tap; F-WEB-04) · `largeTitle` «Неделя»
· `PeriodStepper` «‹ 26 окт. – 1 нояб. ›» + «Эта неделя» away from the current week. Body: the
**day strip** (sticky) + the grid, together filling the height between header and `NavBar` (no page
scroll; owner feedback-4 «почему оно скроллится?»). A block or event tap opens its detail `Sheet`
(owner feedback-4 «на телефонах всплывашку снизу»).

**Layout at 1440.** Sidebar · grid **fills the content region** (no 720 cap; gutter 24) · **inspector
400** with the picked block/event, **collapsed while nothing is picked** (owner feedback-4 «как в Now –
слева календарь, справа по клику инфа»; today a 400 empty pane says "Pick an event"). Grid columns:
(1192 − 48 − 56) / 7 ≈ 155 without the inspector, ≈ 98 with it.

**Hierarchy.** 1) the shape of each day (tracked blocks); 2) calendar events; 3) the selected
block's facts.

**Grid** (P3, B «the same line … as the day strip on Week»):
- Hours 07–24 by default; «Ночные часы» (moon, and the same switch in Settings) shows 00–24. Hour
  height = available height / hours, floor 18 px; only below the floor does the grid scroll
  vertically. Hour labels in a 48 gutter, `caption` tabular, hidden from assistive tech (F-A11Y-09).
- **Day strip** = the day headers: «Пн, 26» (`caption` 500; never one letter; F-TYP-05, 07-032) over a
  4 px compressed line of that day's tracked time in category strokes (the day's metro line, 24 h
  wide). Today's header is `label.primary` 600 with a 2 px underline.
- Tracked block = `hue.tint` fill + a 3 px leading stroke in the category's stroke, radius `xs` 4,
  label `caption` with **lines = floor(height / 16)** (a tall block shows its label in full, a block
  under 16 px shows colour only; F-TYP-05, 05-026). Calendar event = `bg.cell` with a 1 px dashed
  `outline` and the title in `label.primary`. Device use = a 2 px strip at the column's right edge in
  `label.quaternary`.
- **Short blocks never pile** (F-DAT-05): lanes are computed on the **drawn** rectangles (min 24);
  a run of more than 3 overlapping drawn blocks folds into one «+N» block that opens a list in the
  sheet/inspector.
- Now line: 2 px `label.primary` across today's column with the time in the gutter.
- Selected block: `selection` fill + 2 px `focus`-coloured outline + the inspector; announced
  «Пн, 26 окт., 18:31–19:16, Алгебра, №290» (F-A11Y-09).
- **Phone day strip snap** (F-LAY-11): columns are (width − 48) / 4 ≈ 85 wide at 390, so four whole
  days show; the strip and grid scroll sideways together and **snap to whole days** (`snapToInterval`
  / CSS scroll-snap), open at the snap point that shows today with as many earlier days as fit, have
  an 16 px edge fade on the side with more days instead of the "Swipe to see all days" text, and
  contain overscroll (no browser back gesture).

**Detail (inspector / sheet).** Pushed-style header inside the pane: `title2` with the block or event
title (`wrap 3`), ✕. Rows: Время «18:31–19:16 · 45 мин», Категория (line dot + name) or Календарь
(calendar name), Место (link to maps, `truncate-end`), Организатор, Участники (plural), Заметки
(`clamp 6` + «Показать всё»), «Где я сидел» bars (app name `truncate-end`, value column tabular,
fixed width), «Открыть задачу» link, and for tracked blocks «Изменить» (opens the activity editor)
and «Удалить» (inline confirm).

**States.** Empty week: the grid with no blocks plus an `EmptyState` overlaid in the grid's top-left
area: «Здесь появится ваша неделя: записанное время и события календаря с телефона» → «Открыть
«Сейчас»». Loading: calendar and usage ranges load from the network — the grid draws tracked blocks
at once and the calendar layer fades in (no skeleton over the grid; a 2 px progress line under the
day strip after 300 ms). Error: `InlineError` under the day strip «Календарь не загрузился ·
Повторить». Offline: `StatusLine`; the calendar layer shows the cached range.

**Worst case / RU.** Five 20-minute blocks in a row → «+3» fold; 80-character label in a 98-wide column
→ wraps by height, ellipsis on the last line, full label in the inspector; 23 h 59 min block → one
long block with the label in full. RU headers «Пн, 26» … «Вс, 1» fit 85 px.

**Keyboard.** ←/→ week when focus is outside the grid; inside the grid ←/→ move between days and ↑↓
between a day's blocks in time order, Enter opens the inspector, Escape closes it; `T` this week
(gated).

**What changes vs today and why.**
- Empty 400 pane → collapsed inspector (F-LAY-03, owner feedback-4).
- Piles of short blocks and 10 px one-line labels → drawn-rectangle lanes, «+N», label lines by
  height, 12 px floor (F-DAT-05, F-TYP-05).
- Full-hue fills glowing in dark → tint + stroke per theme (F-COL-10).
- Eyebrow range + greyed › + «Back to today» wrapping on phone → `PeriodStepper` (F-CMP-05, 07-017).
- Clipped first day and a text hint → whole-day snap and an edge fade (F-LAY-11).
- Day columns named, gutter hidden from AT (F-A11Y-09); moon is a switch with no tap tooltip
  (F-WEB-04).

### 5.7 Projects — `projects`

**Layout at 390.** Top-level header «Проекты» (back to More), trailing «Новый проект» text `Button`
(content width; F-CMP-06). Inset grouped list of active projects; archived ones under an «Архив · 2»
`Disclosure`. «Новый проект» inserts an inline form row at the top of the list (name `TextField`,
colour swatches as a radiogroup, «Создать ⌘↵», «Отмена Esc»); focus moves to the name field, Escape
cancels and returns focus to the button (F-A11Y-08).

**Layout at 1440.** Sidebar · column 720 · no inspector (a row navigates to the project page).

**Hierarchy.** Project names, then their open counts.

**Rows.** 52 min: a 10 px dot in the project's stroke · name `body` (`clamp 2`; 05-024) · trailing
«3 задачи» (`footnote` `label.secondary`, plural; owner feedback-4 «Я не знаю что здесь за 0, добавь
слово tasks») · chevron.

**States.** Empty: «Здесь появятся проекты — так задачи группируются на «Сейчас» и в аналитике» →
«Новый проект». Loading: 4 skeleton rows (pre-hydration). Error: a failed create shows under the
inline form.

**Worst case / RU.** 96-character name → `clamp 2`, rows 52/72 only; 12 projects fit without
virtualisation.

**Keyboard.** `N` is not rebound here (it stays "new task"); the inline form takes ⌘↵ / Escape.

**What changes vs today and why.** Washed hue slabs → rows with a colour dot (F-CMP-16); the 848-wide
"New project" button → a content-width header action (F-CMP-06, owner feedback-4 «кнопки слишком
широкие»); focus kept when the form replaces the button (F-A11Y-08); bare «0» → «0 задач».

### 5.8 Project page — `project/[id]`

**Layout at 390.** Pushed header: back «Проекты» · trailing «Изменить» (labelled). `title1` = project
name (`wrap`), under it a quiet meta line «3 открыто · 1 в срок · 0 просрочено» (`footnote`, tabular).
Then the **same task list as Now** (owner feedback-2 T7 «Список тасок проекта должен быть похож на
просто список тасок»): «Открытые · 3» → «Позже · 1» disclosure → «Готово · 5» disclosure (open
initially); rows without the project tag. «Изменить» opens a `Sheet` (name, colour, description,
Archive / Restore). Task tap pushes `task/[id]`.

**Layout at 1440.** Sidebar · column 720 · no inspector (§3.3); a row opens `task/[id]` as a pushed
page with the sidebar.

**Hierarchy.** Open tasks, then the name, then the stats line.

**States.** Empty: «Здесь появятся задачи проекта «Алгебра»» → «Добавить задачу» (opens the task form
with its existing Project field set to this project). Not found: `EmptyState` «Проект удалён» → «К проектам».
Loading: skeleton (pre-hydration).

**Worst case / RU.** 96-character name wraps in the title, ellipsizes in the app bar's condensed title;
120-character description → `clamp 3` + «Показать всё» in the edit sheet; 1 284 tasks → virtualised,
paged folds.

**Keyboard.** As Now's list (↑↓, Enter opens, Space checks); «Изменить» has no shortcut.

**What changes vs today and why.** The "Open / On time / Late" hero strip → a meta line (F-CMP-16);
bare rows on the background → the shared `TaskRow` in a `Group` with an «Открытые» header (F-LAY-07,
07-011, owner feedback-2 T7); 22 px pushed title at y 23 → the pushed template (F-LAY-02).

### 5.9 Presets — `presets/index`

**Layout at 390.** Pushed header «Шаблоны» (back to Settings). A one-line `callout` intro («Шаблон
задаёт важность, срок и повтор для новых задач»). Inset grouped list of presets: name (`truncate-end`)
· «Архив» word when archived · trailing reorder handles as two `IconButton`s ▲▼ (labels «Выше
«Домашка»» / «Ниже …») on phone, a drag handle + the same buttons on hover on desktop · chevron. Below:
«Новый шаблон из…» row → picker of the parent; «Добавить примеры» action row (only when the list is
empty); «Показывать архив» `Switch` row.

**Layout at 1440.** Sidebar · column 720 · no inspector.

**States.** Empty: «Здесь появятся шаблоны задач» → «Добавить примеры». Loading: skeleton.

**Worst case / RU.** 70-character name → `truncate-end` with `title`; 20 presets fit.

**Keyboard.** ↑↓ through rows, ⌥↑/⌥↓ move the focused preset, Enter opens.

**What changes vs today and why.** Moves to the pushed template (F-LAY-02); rows to the inset grouped
list with inset separators (F-LAY-05); reorder buttons get names (§8).

### 5.10 Preset — `presets/[id]`

**Layout at 390.** Pushed header: back «Шаблоны» · `title1` = preset name · trailing «Сохранить ⌘↵»
(filled, the view's one; the one form rule). Sections as inset groups (`SectionHeader` each, levels
2): Основное (Название `TextField`, Идентификатор read-only `bg.inset` code text, «Наследует» row →
picker), Срочность (Важность по умолчанию `Segmented`), Работа (Сдача row → menu, Режим прогресса
`Segmented`, Цвет swatches), Расписание (Срок row → `DeadlineRow`, Повтор row → menu), Поля (switch
rows; inherited values shown as the trailing value in `label.tertiary` «Как у «Домашка»»). Footer
group: «В архив» (neutral action row) and «Удалить шаблон…» (`status.danger` action row → inline
confirm).

**Layout at 1440.** Sidebar · column 720; the save button sits at the header's right, on the title
line.

**States.** New (`/presets/new?from=`): title «Новый шаблон», Name focused, no error until a Save
attempt (F-CMP-03). Not found: `EmptyState` «Шаблона нет» → «К шаблонам». Save failure: `InlineError`
at the top of the form.

**Worst case / RU.** 70-character name wraps in `title1` (2 lines), inherited-value captions
`truncate-end`. 16 switches → rows pressable as a whole (F-A11Y-06), the off knob visible (F-COL-09).

**Keyboard.** ⌘↵ saves, Escape goes back.

**What changes vs today and why.** Nested cards per section → one ground with inset groups (F-LAY-05);
uppercase eyebrow section labels → `SectionHeader` (F-TYP-02, F-A11Y-05); the Save button moves from
the form's foot to the header's right (F-CMP-11); delete becomes destructive-styled (F-CMP-07).

### 5.11 Task detail — `task/[id]` (phone screen + desktop inspector)

The task: what, when, how far, and the two actions that move it (owner feedback-2 «Focus и Done
одинаковое количество места»).

**Layout at 390 (pushed screen, no `NavBar`).** App bar 48: back · the **project control** («Алгебра ⌄»,
`body` 500 in the project's ink, `truncate-end`, never a pill; owner feedback-2 «не должен выглядеть
как плашка»; F-DAT-02) · trailing **labelled** controls: «Изменить» (text `Button`) and ⋯ (`Menu`).
Body (scroll): `title1` title (`wrap`, never clamped; 05 table) → meta line → link → stats group →
description → progress (slider tasks) → subtasks → «Исходное сообщение» disclosure. Footer pinned
above the safe area: **Focus | Done** split 50/50.

**Layout at 1440 (inspector, 400).** The same content in the inspector of Now (and of the task opened
from a notification while on Now); the back becomes ✕ «Закрыть» (Escape); the footer is pinned at the
inspector's bottom. A task opened by URL elsewhere (project page, History) is a pushed page in the
content column (720) with the same template.

**Hierarchy.** 1) the title; 2) Focus / Done; 3) due and work left; 4) subtasks.

**Header actions** (F-CMP-10, Q4, Q5, F-A11Y-02, F-CMP-20): «Изменить» opens the edit `Sheet` / `Dialog`
(all fields; owner feedback-2 «В редактировании должна быть возможность отредактировать все это»). ⋯
menu items, each a labelled row with its icon: «Закрыть иначе…» (Cancelled · Skipped · another time —
the close sheet; the visible twin of Done's long press), «Отменить задачу» (the outcome, F-CPY-03),
«Удалить задачу». No Pause in the header (Q4; owner feedback-2 «Вот эти вот Waiting тоже»). Delete
confirms inline: the menu item turns into «Удалить задачу?» with «Удалить» (destructive) and
«Отмена»; after deleting, the screen leaves to where the task was opened, focus moves to the next
row, and that row's place shows «Задача удалена · Вернуть» for 10 s (pauses on hover/focus).

**Meta line** (`footnote`): category line dot + name · status «В работе» as a `Tag` in the indigo hue
(the owner asked for In progress in blue/violet, feedback-3; the only status with a colour) · importance
word only when not Normal · «Сдача по подзадачам» when that mode is on · repeat «каждую неделю». One
line, tokens drop from the right, full set in the accessibility label. Replaces four washed tags
(F-COL-04).

**Link** (F-DAT-06, F-WEB-03): one line, `truncate-middle` «example.com/…/algebra», `accent.text`,
↗ icon 16, an `<a href target=_blank rel=noopener>`; full URL in its label.

**Stats group** (F-A11Y-13): a `Group` of label/value pairs, 2×2 at 390 and in the 400 inspector,
4×1 on a 720 pushed page: Начало «28 окт. 18:24» · Срок «4 нояб. 18:24» · Осталось работы «40 мин»
with «оценка 1 ч» under it · Затрачено «45 мин». Labels `footnote` `label.secondary`, values
`numeric.value`. "Work left" follows the slider live (owner feedback-3).

**Description**: `body`, `wrap 6` + «Показать полностью» (05-020); tap to edit in place (Cancel /
«Сохранить ⌘↵»); empty → «Добавить описание» row in `label.tertiary`. The separate pencil goes.

**Progress** (owner feedback-2 «как в переключателе громкости … перетащить», feedback-3 «го в
процентах»): a `Group` row «Прогресс» with the value trailing «40 %» (`numeric.value`, updates **while
dragging**) and a full-width `Slider` under it, steps of 10 %, thumb follows the finger (no scale
jump; F-MOT-14), `aria-valuetext` «40 %» (F-A11Y-16); a saved value never snaps back.

**Subtasks**: `SectionHeader` «Подзадачи» with «1 решено · 0 отправлено» trailing (tabular). Rows:
check (48 target) · number/label `body` (`wrap`, top-aligned when it wraps; 05-028) · trailing state
word «решено» / «отправлено пт» in `footnote`. Inset separators.

**Original message**: a `Disclosure` «Исходное сообщение», shown only when the task came from an
assistant reading (owner feedback-3); the text `wrap` in `callout` on `bg.inset`.

**Footer — Focus | Done equal.** Two `Button`s, large (52), each 50 % minus 4: «Фокус F» (secondary;
«Идёт фокус» with the filled stop glyph while focusing) and «Готово ⌘↵» (filled, the view's one).
**Submit label «Сдать N»** (F-DAT-01, P7): up to three solved subtasks whose joined names fit one line
→ «Сдать 290 и 292»; otherwise «Сдать 37» (count); always one line (`fixed` + `count` policy), the
full list in the button's accessibility hint and in the submit sheet. Done's long press opens the
close sheet (accelerator only; ⋯ → «Закрыть иначе…» is the visible way). Closed task: footer shows
«Закрыта: Готово» `footnote` + «Вернуть в работу» secondary.

**States.** Loading: pre-hydration skeleton of title (2 lines), meta, stats (2×2), 3 subtask rows.
Not found / deleted: `EmptyState` (5.0.5), never a "No project" header. Error: a failed save / submit
shows an `InlineError` above the footer. Offline: everything works locally; `StatusLine`.

**Worst case / RU.** 300-character title → wraps (13 lines at 390 is accepted: it is the identity);
78-character project in the app bar → truncates before «Изменить» and ⋯ (never under them; 05-004);
2 000-character link → one middle-truncated line; 4 000-character description → 6 lines; 100 subtasks
(37 solved, 200-character labels) → rows wrap top-aligned, list virtualised past 50, footer stays one
line «Сдать 37»; estimate 10 080 min → «7 дн.» (formatter rolls hours into days past 48 h; F-CPY-04).
At 320×568 the footer is 52 + safe area and the body keeps the rest (F-DAT-01). RU: «Фокус» /
«Готово ⌘↵» / «Сдать 37 ⌘↵» fit 175 px each; «Ctrl+Enter» on Windows drops to the tooltip when the
label plus hint exceed the half-width.

**Keyboard.** `F` focus (gated), ⌘↵ Done/Submit; «Изменить» and ⋯ get no new bindings; Escape closes
the inspector (or goes back on a pushed desktop page) when no field has focus. Focus order: back/close → project → Изменить → ⋯ → title → link → stats → description →
progress → subtasks → footer.

**What changes vs today and why.**
- Four bare glyphs (✎ ⏸ ⊘ 🗑) → «Изменить» + a labelled ⋯ menu; Pause removed; ▶/■ reserved for timing
  (F-CMP-10, Q4, owner feedback-3 «Неверная иконка … нет кнопки удаления»).
- Delete: confirm inline, leave the page, focus to the next row, Undo in place (F-A11Y-02, Q5).
- Submit label from a list → «Сдать N» (F-DAT-01, P7).
- Tags wall → one meta line; Normal hidden (F-COL-04, F-DAT-02).
- Link printed in full → middle-truncated anchor (F-DAT-06, F-WEB-03).
- Long press as the only way to close otherwise → a visible menu item (F-CMP-20).
- Slider: live %, `aria-valuetext`, no thumb jump (F-A11Y-16, F-MOT-14, owner feedback-3).
- Content edges unified on the gutter (F-LAY-10, 07-030).

### 5.12 Decisions — `decisions`

The assistant's log: every automatic decision, searchable. Reached from Notifications' header link
«Журнал ассистента».

**Layout at 390.** Pushed header «Журнал ассистента» (back to Notifications). A search `TextField`
(`purpose=search`, `inputmode=search`, full width at 390; F-WEB-08) pinned under the header. Rows in an
inset grouped list, grouped by day (`SectionHeader` «Сегодня», «Вчера», «28 окт.»): the request quote
(`callout`, `clamp 2`) · what became of it (`footnote` «Создана задача «…»» / «Отклонено»), time
trailing (tabular); a row about a task opens it.

**Layout at 1440.** Sidebar · column 720; search width = column (it is the screen's main control; the
F-LAY-09 complaint was about time fields).

**States.** Empty: «Здесь появятся решения ассистента: что он прочитал и что предложил» (no action —
it fills by itself). No match: «Ничего не найдено по «…»» + «Сбросить поиск». Loading: 6 skeleton rows
after 300 ms. Error: `InlineError` «Журнал не загрузился · Повторить». Offline: cached list + the
status line; search works on the cached rows.

**Worst case / RU.** 1 500-character request → `clamp 2`; 1 000 rows → virtualised, paged.

**Keyboard.** `/` is not bound (single key); the search field is first in the focus order; Escape
clears it.

**What changes vs today and why.** Pushed template at the shared y (F-LAY-02); empty state left-aligned
with what appears here (F-CMP-09); rows to the inset grouped list (F-LAY-05).

### 5.13 Review — `review`

A redirect to `/inbox` (old links). No screen. "To sort" is the «Разобрать» section of Inbox (5.3).
The redirect must not paint an empty frame: it resolves before first paint.

### 5.14 History — `history`

Every event, as of any moment, undoable.

**Layout at 390.** **Top-level** header (F-LAY-02: a sidebar destination, today drawn as pushed):
back to More in the top bar · «История» · `PeriodStepper` «‹ 1 нояб. 18:20 ›» with «Сейчас» replaced by
«Сегодня», shown only away from now (owner feedback-4; F-CPY-06). Sections: «Задачи на 18:20» (the
snapshot: read-only rows — no check circles, a leading 6 px state dot instead; F-CMP-14) then
«События до 18:20» (event rows).

**Layout at 1440.** Sidebar · column 720 · no inspector.

**Hierarchy.** 1) the event rows (what happened); 2) the moment selected; 3) the snapshot.

**Event rows.** `ListRow`: event sentence `body` («Задача «Квартплата» отмечена готовой») · `footnote`
«1 нояб., 18:23 · Веб» (tabular; F-TYP-06) · revoked events show «Отменено» in `label.secondary`. Undo
is **not a button on every row** (F-CMP-14): on phone, a long press or a swipe reveals «Вернуть»; on
desktop, a ⋯ `IconButton` appears on hover/focus with «Вернуть…» in its menu; both open the existing
confirm dialog (focus returns to the row).

**States.** Empty at a moment: «До этого момента ничего не было» (no action). Empty account: «Здесь
появится всё, что вы делаете: каждое действие можно вернуть». Loading: skeleton of 8 event rows (CLS
0.188 today; F-WEB-11). Error: none (local). Offline: `StatusLine`; undo queues.

**Worst case / RU.** 1 297 events → virtualised (F-DAT-03); 300-character titles in sentences →
`clamp 2`; «1 нояб., 18:23 · Телеграм-бот» fits.

**Keyboard.** ←/→ change the day, `T` today (gated), ↑↓ through events, ⌫ on a focused event opens
«Вернуть?».

**What changes vs today and why.** Pushed header at y 14 → top-level (F-LAY-02, 07-006); the always-on,
disabled «Now» button → «Сегодня» only away (F-CMP-05, F-CPY-06, owner feedback-4 «Громоздкая кнопка
которая хуй зачем нужна»); eight Undo buttons → a row action (F-CMP-14); checkable-looking snapshot →
read-only rows; layout shift removed (F-WEB-11).

### 5.15 Insights — `insights`

One week of the ledger: where the time went, what got done on time, plan against fact.

**Layout at 390.** Top-level header (back to More) · «Аналитика» · `PeriodStepper` «‹ 26 окт. – 1 нояб. ›»
+ «Эта неделя» away from the current week (Insights has none today; F-CMP-05). Content: total line →
«Время по категориям» → «Время по проектам» → «Фокус по часам дня» → «Насколько дробилось время»
(stat tiles) → «Фокус и сон» → «В срок» → «Оценки». Each section is a `Group` on the ground (no card in
card; F-LAY-05).

**Layout at 1440.** Sidebar · column **960** at x 280 · no inspector. Two-column grid of groups (464
each, gap 32): categories | projects; hours (full width); tiles (full width, 4-up when 4 exist);
focus & sleep | on time; estimates (full width).

**Hierarchy.** 1) the week's total and the category bars; 2) the stat tiles; 3) the tables.

**Bars aligned** (F-LAY-14, 05-014): every bar row is a 3-column grid — name column (35 % at 390,
180 at desktop; `Line truncate-end` with `title`) · bar (flex, 10 px, radius `xs`, anchored at zero on
`fill.2`, mark in the category/project stroke, "no project" in slate) · value column **fixed width =
the longest value of the chart**, right-aligned, `numeric.value` at footnote size. So every bar ends
on the same x and values line up. Each row is one phrase for AT: «Учёба, 3 ч 10 мин» (F-A11Y-13).

**Hours chart**: 24 bars, single series in `hue.slate.stroke`, the peak hour labelled «18:00–19:00»
above it; axis labels `caption` at 00/06/12/18. No accent (the accent has four jobs only).

**Stat tiles never break words** (F-TYP-04, 05-015): tiles are 2-up below 500 px (each ≈ 171 at 390),
3- or 4-up above; label `footnote` `wrap 2` **between words only** (no `break-all`, no hyphenation;
«Переключений в день» wraps «Переключений / в день»), value `numeric.stat` below it, tile `bg.inset`
radius `sm` 8 inside the group (nested rule: 16 − 8). If a label still cannot
fit two lines at 2-up, the tile becomes a label/value row (`ListRow`) — never a mid-word break.
Values formatted by locale: «3,3», «0 %» (F-CPY-04, 05-016).

**Tables** («Фокус и сон», «В срок», «Оценки»): `ListRow`s with name `truncate-end` and value
trailing tabular («2 из 3», «оценка 1 ч · затрачено 45 мин»).

**States.** Empty week: `EmptyState` «Здесь появится, куда ушло время за неделю: всё, что вы
записываете на «Сейчас» и в «Дне»» → «Начать отслеживать» (Now; 05-023). Sections without data are
omitted, not shown empty. Loading: skeletons of the two bar groups after 300 ms (heavy route,
code-split; F-WEB-12). Error: none (local). Offline: works.

**Worst case / RU.** 78-character project names → truncate in the name column, values still aligned;
«27 ч 21 мин» vs «1 мин» → same right edge; 12 categories → 12 rows. RU tile labels at 390 2-up: all
fit in two lines.

**Keyboard.** ←/→ week, `T` this week (gated); charts are not focusable per bar (each row is one text
stop in reading order).

**What changes vs today and why.** Eyebrow range + back ‹ next to previous ‹ → top bar back and a
`PeriodStepper` (F-CMP-05); 3-up tiles breaking «Переключени|й» → 2-up word-wrapping tiles (F-TYP-04);
misaligned value column → fixed tabular column (F-LAY-14); cards in cards → groups on the ground
(F-LAY-05); RU decimals (F-CPY-04); project hues per theme (F-COL-10).

### 5.16 Notifications — `notifications`

The one notification pool (owner feedback-4: sign-ins, Deadline Digest, event start, «Still doing?»).

**Layout at 390.** Pushed from the bell on Now: back · `title1` «Уведомления» · trailing «Журнал
ассистента» text `Button` (→ Decisions). Day sections («Сегодня», «Вчера», «28 окт.»), rows in an inset
grouped list: kind icon 20 · body `body` (`wrap`; digest task titles `clamp 2` each, at most 5 listed +
«и ещё 7») · `footnote` time and delivery («пт 18:00 · Telegram, приложение»; a second line once taken
back) · answers (Attend/Skip for an event start) as small tonal buttons · digest rows link «Открыть
«Сейчас»». Unread: `label.primary` 600 title + 8 px `status.danger` dot with «новое» for AT; marked read
when seen.

**Layout at 1440.** Reached from the sidebar's bell: **top-level** header (no back) in the column 720;
no inspector.

**States.** Empty: «Здесь появятся уведомления: входы в аккаунт, дайджест сроков, начало событий»
→ «Настроить уведомления» (Settings › Уведомления). Loading: 6 skeleton rows after 300 ms. Error:
`InlineError` «Уведомления не загрузились · Повторить» in place of the list. Offline: cached feed.

**Worst case / RU.** 120-character login device name → `wrap`; 12-task digest → 5 + «и ещё 7»;
300-character digest titles → `clamp 2`; 500 items → virtualised.

**Keyboard.** ↑↓ through rows, Enter follows a row's link.

**What changes vs today and why.** Pushed header at y 23 and «TODAY» as an h1 → the shared templates
and `SectionHeader` level 2 (F-LAY-02, F-A11Y-05); divider bleeding 880 → inset separators (F-LAY-05);
list virtualised (F-DAT-03).

### 5.17 Settings — `settings`

An inset grouped list with trailing values and controls (P2; F-LAY-09, owner feedback-4).

**Layout at 390.** Top-level header (back to More) · «Настройки». Sections as `Group`s with a
`SectionHeader` (level 2) and an optional `footnote` footer under the group. Every row is a `ListRow`:
label leading, value or control trailing; a whole row is pressable for switches (F-A11Y-06). Pickers
open as sheets.

**Layout at 1440.** Sidebar · column 720 · no inspector. Value fields are sized to their content (a
time field is 88 wide, never 790; F-LAY-09); action buttons are content-width (owner feedback-4 «На пк
чето кнопки слишком широкие»); dialogs for Add a computer and Connect an AI app.

**Section order** (identity and daily use first, appearance lower — F-LAY-09; destructive last):

1. **Аккаунт и язык.** Owner row (avatar + full Telegram name + «Telegram» `footnote`). «Язык»
   `Segmented` English | Русский (trailing on desktop, full-width under the label on phone). «Часовой
   пояс» value «Europe/Moscow»; when the device differs, the footer reads «На этом устройстве
   Europe/Berlin» in `status.warn` with an action row «Перейти на Europe/Berlin».
2. **Уведомления.** Desktop: a **compact matrix** — rows = kinds (Входы, Дайджест сроков, Начало
   события, Ещё занимаетесь?), columns = Telegram · Приложение · Веб, `Checkbox` cells 44 with
   column headers in `caption` (`role=table`, each checkbox named «Дайджест сроков в Telegram»).
   Phone: **per-kind rows** — kind label with its channels as the trailing value («Telegram»,
   «Telegram, приложение», «Выключено»); a tap opens a small sheet with three `Switch` rows (the RU
   column headers «Приложение» do not fit a 48 column at 390). Then: «Доставка на этот телефон»
   (Android) value «Автоматически» → picker, with its status footer («Google недоступен, используется
   фоновая проверка»). «Время дайджеста» rows: each time a compact `TimeField` (88) with a remove
   `IconButton`, then «Добавить время» action row; footer «Присылаем задачи, до срока которых меньше
   суток». «Тихие часы»: one row «С 23:00 до 08:00» with two compact `TimeField`s.
3. **Задачи.** «Оценки по категориям»: one row per category with a compact duration value → picker.
   «Шаблоны» row → `/presets` (chevron).
4. **Устройства и сеансы** (owner feedback-4 «показывать устройства опрятным списком прямо здесь …
   все активные сессии … с возможностью ревокнуть каждый. Да и MCP можно сюда же»). Footer hint: «Всё,
   что входит в ваш аккаунт. Завершите то, чего не узнаёте». Rows: kind icon (телефон, браузер,
   компьютер, ИИ-приложение) · name `body` (`wrap 2`, then `truncate-middle`; 05-025, F-DAT-11) ·
   `footnote` «Компьютер · данные 11 ч 29 мин назад», or the exact time «данные 31 окт., 06:12» once the
   last data is older than 8 h (owner feedback-4) · «Это устройство» word instead of an action for the
   current session · trailing «Завершить» quiet text `Button` (one width for every row; owner
   feedback-4 «Кнопка disconnect слишком широкая»). **Revoke confirms inline**: the row's trailing area
   becomes «Завершить сеанс?» with «Завершить» (destructive) and «Отмена»; Escape cancels; on success
   the row leaves and focus moves to the next row (F-A11Y-08; EN uses "End session" throughout,
   F-CPY-05). Phone: «Календарь с этого телефона» `Switch` row at the top of the group. Loading:
   three skeleton rows of the final height (owner feedback-4 «на этапе загрузки показываем
   скелетоны»). Error: `InlineError` «Список не загрузился · Повторить».
   Two action rows close the group (`accent.text`, + icon):
   - **«Добавить компьютер…»** → `Sheet` / `Dialog` «Добавить компьютер»: Name `TextField`
     (default «Мой компьютер»), «Создать», then an **OS picker** `Segmented` Windows · macOS · Linux
     (a `radiogroup` named «Система»; selected = the segmented thumb + `label.primary`, never solid
     indigo; owner feedback-4 «сверху пикер Windows / MacOS / Linux … и под каждого конкретную
     инструкцию»), then the numbered steps for that OS with the command in a `bg.inset` code box
     (Inter with `tnum`, one line that scrolls horizontally, a «Скопировать» button beside it) and «Открыть activitywatch.net» link.
   - **«Подключить ИИ-приложение…»** → `Sheet` / `Dialog` with the MCP URL in a code box +
     «Скопировать», per-client steps (Claude, others) as `Disclosure`s, and the footer «Доступ можно
     завершить здесь же, в списке сеансов» (owner feedback-4 «добавь кнопку по которой мы показываем
     инструкцию»).
5. **Внешний вид.** «Тема» `Segmented` Системная · Светлая · Тёмная (a named radiogroup; F-A11Y-13).
   «Ночные часы на неделе» `Switch` row with footer «Неделя показывает сутки целиком, с 00 до 24».
   «Клавиши одной буквой» `Switch` row (desktop; §8, Q6) with footer «N — новая задача, F — фокус».
6. **Разрешения** (Android). Row «Разрешения» value «2 из 4 включены» → `/permissions`.
7. **Сервер** (Android). Row «Сервер» with the host as a `truncate-middle` value
   («pace.workstation-al…ts.net:8443»; F-DAT-11). Read-only here; footer «Сменить сервер можно на экране
   входа». (Today the server line exists only on Login; see the open question.)
8. **Экспорт** (web). Action row «Скачать всё в Excel (.xlsx)» (owner feedback-4 «Export data … по
   нажатию на нее скачиваем эксель табличку»); while preparing, the row shows a 16 spinner and is
   disabled.
9. **Выйти.** One action row «Выйти», `label.primary`, centred text (neutral, not destructive).
10. **Опасная зона.** `SectionHeader` «Опасная зона» in `label.secondary` (the danger is in the
    rows, not the heading). Two action rows in `status.danger` text, same size and width (F-CMP-07,
    07-014): «Стереть данные…» and «Удалить аккаунт…». Each confirms inline in its row («Стереть все
    задачи, время и настройки? Аккаунт останется» + «Стереть» destructive / «Отмена»), then shows the
    Telegram 2FA waiting state in the same row («Подтвердите в Telegram…» + spinner + «Отмена»;
    owner feedback-4 «Оба подтверждаем сначала на сайте, а потом в тг боте»). Escape cancels at
    every step (F-A11Y-08).

**Hierarchy.** Section headers, then row labels, then values. Nothing filled at rest (P1): switches
on are `accent`, the only accent at rest.

**States.** Loading: only the sessions group and the push status read the network (skeleton rows
after 300 ms). Error: inline per group. Offline: the server-bound rows (sessions actions, Add a
computer, Connect AI, Export, Wipe, Delete) are disabled with «Нужна сеть» as their hint; local
settings (theme, language, notifications, digest times) save and queue.

**Worst case / RU.** 80-character device name → 2 lines then middle truncation; 64-character owner
name → `truncate-end`; RU labels «Доставка на этот телефон», «Ещё занимаетесь?» fit at 390 with a
trailing value (values truncate first, labels wrap to 2 lines); a long tailnet host → middle
truncation on one line.

**Keyboard.** Tab through rows; Space toggles a switch/checkbox; arrow keys move within a segmented
control and within the notification matrix (grid navigation); Enter activates action rows; Escape
cancels inline confirmations.

**What changes vs today and why.**
- 20 bordered sections with uppercase labels → inset groups with sentence-case headers (F-LAY-09,
  F-TYP-02, F-A11Y-05).
- 788-wide fields for «09:00» → compact time fields (F-LAY-09).
- 12 switches in a 4×3 grid of indigo switches → a checkbox matrix on desktop, per-kind rows on phone
  (F-LAY-09, F-COL-07, F-COL-09).
- Ragged stacks of 48 px boxed buttons → action rows (F-CMP-06, owner feedback-4).
- Wipe/Delete styled as neutral/ghost → destructive rows of equal size (F-CMP-07).
- Revoke as a boxed button with "End this session?" → «Завершить» everywhere, inline confirm (F-CPY-05).
- Theme moves from the first row to Appearance (F-LAY-09).
- Rows that open a dialog end in «…» («Добавить компьютер…», «Стереть данные…»; F-CPY-07).
- OS picker selection no longer solid indigo (F-COL-02, 07-015).
- Desktop scroller is the window (F-WEB-05).

### 5.18 Login — `login`

**Layout at 390.** Bare (no shell). One centred column (max 400, gutter 24), vertically centred: the
Pace mark (48, Pace green) with the wordmark «Pace» (`title1`) and the subtitle (`callout`,
`label.secondary`); then the sign-in area: **web** — the Telegram widget in a **reserved 48-high box**
(skeleton while loading; after 6 s or on failure a themed `callout` line «Виджет Telegram не
загрузился» replaces it and «Войти через бота» becomes the filled button; F-CMP-17); «Войти через
бота» secondary below. **Android** — «Открыть Telegram» (filled, large, full column width) and «Войти
через браузер» (secondary). Waiting state (bot): spinner + «Ждём подтверждения в Telegram» + hint +
«Открыть бота снова» + «Отмена». Errors under the buttons in `status.danger` `callout`. Android foot:
the server line «Сервер: pace.nalinor.dev» (`truncate-middle`) with «Сменить» as its own text button
(F-DAT-11) → change-server sheet. Dev login only in dev builds, as plain rows (not a card in a card).

**Layout at 1440.** The same column centred in the window on `bg.app`; no sidebar.

**Hierarchy.** The way in (the one filled button), then the product name, then the server line.

**States.** Server incompatible: the refusal («Приложение и сервер не совпадают» + reason) replaces the
error line; buttons stay. Offline: «Нет сети — войти не получится» and the buttons disabled.

**Worst case / RU.** Language follows the browser locale (signed out). A 253-character host → one line,
middle truncation. RU «Открыть Telegram» fits.

**Keyboard.** Tab: widget/primary → secondary → server; Enter activates; Escape cancels the waiting
state.

**What changes vs today and why.** Raw serif "Bot domain invalid" / blank band → reserved box,
detected failure, promoted bot login (F-CMP-17); nested dev card removed (F-LAY-05); server line no
longer wraps and orphans «Сменить» (F-DAT-11); EN uses "Log in" consistently (F-CPY-05).

### 5.19 Login return — `app/login`

Web only (Android rewrites the link before routing). Where the bot's "Return to Pace" lands when
Android did not open the app.

**Layout at 390 / 1440.** Bare centred column (max 400): mark + `title1` «Вернитесь в Pace» +
`callout` body; «Открыть приложение» (filled, large) and «Продолжить в браузере» (secondary link
button).

**States.** No token: `InlineError` «Ссылка устарела» + «На экран входа».

**Keyboard.** Primary is focused first; Enter opens the app.

**What changes vs today and why.** The heading duplicated as the wordmark (`PaceLogo heading=… wordmark=…`
with the same text) → mark + one `title1` (P5 one name per thing); otherwise the shared signed-out
template.

### 5.20 App link — `app/auth`

Web fallback of the App Link: hands the login token to the app via `intent://`.

**Layout at 390 / 1440.** Bare centred column: mark + `title1` «Открыть Pace» + «Открыть в приложении»
(filled) + `footnote` fallback line «Если приложение не открылось, войдите в браузере» with the link.

**States.** Missing token: `InlineError` (alert) «В ссылке нет кода входа» + «На экран входа».

**What changes vs today and why.** Shared signed-out template; the alert gets the error pattern (5.0.5).

### 5.21 Auth landing — `auth/index`

Landing of `pace://auth?token=…` and `/app/auth?token=…`: signs in, then leaves.

**Layout at 390 / 1440.** Bare, centred: a 24 spinner + «Входим…» (`callout`), shown only after 300 ms
(a fast sign-in shows nothing). Invalid link: `EmptyState`-style block «Ссылка для входа недействительна»
+ «На экран входа» (filled).

**What changes vs today and why.** The 300 ms rule (no spinner flash); error in the shared pattern.

### 5.22 Telegram return — `auth/telegram`

Web only: Telegram's login redirect target; stores the signed login and goes back. No UI of its own:
it renders the same delayed «Входим…» as 5.21 so a slow redirect never shows a blank frame, and
`document.title` is «Вход · Pace» (F-WEB-01).

### 5.23 OAuth consent — `oauth/authorize`

Web only: an MCP client asks for access to the account.

**Layout at 390.** Bare centred column (max 430): mark + «Pace»; `title2` «Разрешить «Claude» доступ к
аккаунту?»; `callout` body (what it can do); identity line «Вы вошли как Альберт» (`footnote`,
`truncate-end`) or the Telegram widget box (reserved, as Login) when signed out; actions row:
«Отклонить» (secondary) and «Разрешить» (filled) right-aligned on desktop, stacked full width on phone
(Allow on top). Redirecting state: spinner + «Возвращаемся в «Claude»…».

**Layout at 1440.** The same column centred.

**Hierarchy.** Who asks and what for, then who you are, then the decision.

**States.** Invalid request: `InlineError` «Запрос на доступ неверен» (no actions). Offline: actions
disabled.

**Worst case / RU.** A 100-character client name → `wrap 2` in the title (it is the identity of the
requester), `truncate-end` in the redirect line.

**Keyboard.** No default button: Enter does nothing until a button is focused (a grant must be a
deliberate act); Tab order Deny → Allow; Escape does nothing (the page is the whole flow).

**What changes vs today and why.** Shared signed-out template and widget fallback (F-CMP-17); title
hierarchy fixed (F-A11Y-05).

### 5.24 Onboarding — `onboarding`

Android first run: every permission Pace will ask for, one at a time.

**Layout at 390.** Bare full screen (no `NavBar`), gutter 24. Step indicator «Шаг 2 из 4» (`footnote`)
at the top; `title1` (step title) + `callout` why; for usage access the three-step guide (current step
in `label.primary`, others `label.secondary`); actions pinned at the bottom above the safe area: the
step's action (filled, large, full width) and «Пропустить» (quiet). Intro: the list of permissions as
an inset group (icon, name, one-line why) + «Продолжить» / «Не сейчас». Summary: each permission with
its state word («Включено», «Выключено») + «Начать».

**Layout at 1440.** Not reachable (web never shows it); if opened, the same column centred (max 480).

**States.** A system dialog refused: the step says so in `status.warn` `callout` with «Открыть
настройки».

**Worst case / RU.** RU step titles wrap (`wrap`); the pinned actions never cover the text (the body
scrolls).

**What changes vs today and why.** Shared type roles and buttons; actions pinned above the safe area;
state as words, not colour (F-COL-02).

### 5.25 Permissions — `permissions`

**Layout at 390.** Pushed header «Разрешения» (back to Settings) + a `callout` intro. Inset grouped
list: one row per permission — name `body`, why `footnote` (`wrap`), state word trailing («Включено» /
«Выключено»), and when off an action row under it «Включить» / «Открыть настройки». Usage access
shows the three-step guide inside its group. A second section «Повторяющиеся события» (the calendar
series answered "every time" on Day): rows with «Забыть» quiet button → inline confirm.

**Layout at 1440.** Not shown on the web (Android only).

**States.** Empty series list: section omitted. Loading: none (local).

**What changes vs today and why.** Cards → grouped rows (F-LAY-05); coloured state classes → words
(F-COL-02); pushed template (F-LAY-02).

### 5.26 Not found — `+not-found`

**Layout at 390 / 1440.** Inside the shell when signed in (sidebar / nav bar stay, nothing selected),
bare when signed out. Column-aligned `EmptyState`: `title2` «Такой страницы нет» · `callout`
«Адрес /tasks/123 не найден» (path `truncate-middle`) · «На главную» (filled). `document.title` «Не
найдено · Pace».

**What changes vs today and why.** 24 px ad-hoc header → `title2` with `aria-level` 1 (F-TYP-01,
F-A11Y-05); left-aligned to the column (F-CMP-09).

---

*(The open questions this section raised are folded into §12: S5-1 → Q12; S5-2 decided — Day gets the inspector; S5-3 decided — the project page keeps pushing the task screen; S5-4 decided — Settings › Server is read-only (no new flow); S5-5 decided — «В работе» is an indigo tag, per the owner's feedback-3.)*

---

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
| tooltip | tooltip | high | fade + 2 px from the anchor, after 400 ms hover delay (0 on keyboard focus, and 0 for the "why unavailable" hint on a disabled control — owner, feedback-4) | fade | 100 / 70 | enter / exit | fade | hoverable bubble, Escape dismisses (WCAG 1.4.13; F-WEB-04); not on tap — tap shows an inline hint (F-WEB-04) |
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

**Owner answers, 2026-11-01** (round 1): Q1 → **A · Тетрадь**. Q2 → **a, strike-through** (leaning; demos of all three published to compare). Q3 → **a, hide Normal**, and mark "Low" (Необязательно) differently from Urgent/Priority so it draws no attention (three options shown in the accents demo; pending). Q4 → a. Q5 → a. Q6 → **b, modifier shortcuts** (see the browser caveat below; pending). Q7 → a. Q8 → a. Q9 → pending (demo published). Q10 → a. Q11 → a. Q12 → a, leaning (demo published). Logo: the owner prefers a bright logo; options in the accents demo (pending).

Demos (private artifacts; sources in `context/design/comps/demos/`): check-off a/b/c — https://claude.ai/artifact/XEftj2wtbmCVeTsfH6c2LP, https://claude.ai/artifact/9xe8ZPtaEHF5TDhN1d9XJ5, https://claude.ai/artifact/GNkXkPcMVk2h2p8vwbeddJ; Material You — https://claude.ai/artifact/NvUXXnTDvVTRNjuTA5JXEk; phone time bar — https://claude.ai/artifact/KLvpgUhDtYmQsLQHNo7Rha; accents, logo and low-importance marks — https://claude.ai/artifact/BSjfceFA52AasjsVm5vmyZ.

Q6 caveat: browsers reserve Ctrl+N (new window) and give Ctrl+F to page search, so the web app cannot take them; the modifier options are Alt+N / Alt+F (⌥N / ⌥F on a Mac, matched by key code) or Ctrl+Shift+… .

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
| Q12 | Phone time bar while something runs | **the four tiles stay visible; only the typed field folds under «Начать другое»; the whole bar folds only when the 40 % region budget is exceeded (small screens, zoom, keyboard, open proposals)** · keep today's fold of the whole bar | **tiles visible** | Switching stays at three taps (feedback-2, F-CMP-19); PRODUCT.md's fold description is updated. |
