# 01 — impeccable `audit` (web variant) over the built web app

Reviewer 01-impeccable-critique · method: `reference/audit.md`, verbatim skeleton. Target: the production web
export at `http://localhost:4173` (`apps/app/dist`, commit 057e484), a seeded lived-in account (Telegram id 3190,
EN; Europe/Moscow), dark and light, widths 390 / 768 / 1024 / 1280 / 1440.
Findings use the shared ids of [01-impeccable-critique.md](01-impeccable-critique.md).

**How the evidence was produced.** Chromium (`/opt/pw-browsers/chromium`) via Playwright, emulated viewports, no
touch synthesis (gestures untested; audit.md › Responsive asks to say so). Script:
`/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/shots/r01-audit.ts`, output and
screenshots in `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/review-01/web/`
(`audit-en.json`). Per page it measured horizontal overflow, CLS (PerformanceObserver `layout-shift`, buffered,
no input), interactive targets < 24 px and < 44 px, the font files fetched, `::selection` and `caret-color`, and an
axe-core run (`wcag2a/2aa/21aa/22aa`) at 390 and 1440. The bundled detector ran two ways: the CLI on
`apps/app/dist` and `apps/app/global.css` (`detect-dist.json`), and the browser overlay (`detect.js` from
`impeccable live-server`, injected into 6 routes × 2 viewports; script `r01-overlay.ts`). The live server was
stopped with `--keep-inject` (no project file edited).

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | axe-core: **0 violations** on 16 page/viewport/theme runs; but every text field draws no focus indicator (`global.css:44-47` removes the outline, `TextField` draws nothing): WCAG 2.4.7 fails on all 11 inputs (01-032); 9.12 px avatar initials; switch targets 48×24 |
| 2 | Performance | 2 | One 3.60 MB JS chunk (796 KB gzip) for every route (01-042); CLS 0.188 on History and ~0.1 on Now at 390 px (01-041); fonts lean: 2 woff2 fetched, 67.6 KB, both preloaded |
| 3 | Theming | 3 | Full `--pace-*` variable system, dark and light both complete; drift only at the edges: `theme-color`/pre-JS background `#f4f5f7` ≠ token `#eceef2` (01-033), UA selection/scrollbar colours (01-032) |
| 4 | Responsive Design | 2 | No horizontal overflow at any width (good); but 390→1023 px is one stretched phone layout (768 px gets 4 bottom tabs, 700 px rows) and 1024+ jumps to sidebar + split (01-038, 01-010); composer icon buttons 36×36; event blocks on Week 31×65 px |
| 5 | Implementation Integrity | 2 | Detector verified: kicker above heading, sub-11 px functional text ×18, 11 px body text, 6 off-ramp font sizes; plus design-system drift the detector cannot see (layout models, nested cards) |
| **Total** | | **11/20** | **Acceptable (significant work needed)** |

## Implementation Integrity Verdict

**Fail (narrowly).** The token layer is coherent and product-specific in its two signatures (the time bar, the
dissolve on check), but the composition is not one system: three desktop layout models (01-010), five title
placements (01-011), two row containers for the same task row (01-027), eleven eyebrow sites (01-001), cards
inside cards (01-012). Detector evidence, verified in context:

| Detector rule | Where | Count | Verdict |
|---|---|---|---|
| `kicker-above-heading` (overlay) | `/insights` "Oct 26 – Nov 1" above h1 | 1 page | **True**; the same pattern on `/`, `/day`, `/week` was *not* flagged (the overlay missed it there; the LLM review found it on all four, `ui/screen-header.tsx:48-52`) |
| `undersized-ui-text` (overlay) | avatar initials 9.12 px (`shared/user-avatar.tsx:32`); Week hour labels 10 px (`features/week/week-grid.tsx:68`) | 1 + 17 | **True** (01-017, 01-018) |
| `tiny-text` (overlay) | Insights tile label 11 px (`features/insights/patterns.tsx:91`) | 1 | **True** (feeds 01-008) |
| `design-system-font-size` (CLI) | 26, 24, 18, 17, 16, 10 px in the bundle | 11 | **True**, drift from the DESIGN.md ramp (01-043; 00-inventory §3.2) |
| `design-system-color` (CLI) | `#f4f5f7` in `index.html` | 1 | **True** (01-033, known) |
| `design-system-color` (CLI) | `#1976D2`, `#2196F3`, `#009688`, `#657786`, `#AAB8C2`, `rgb(255,59,48)` … in `entry-*.js` | 15 | **False positive**: react-native-web / expo-router / library defaults compiled into the bundle, not app code (0 hex literals in `src/`, 00-inventory §8) |
| `design-system-font` (CLI) | `System`, `Sans-Serif-Medium` in the bundle | 3 | **False positive**: library font stacks |
| `bounce-easing` (CLI, advisory) | `GentleSpringConfig` in the bundle | 1 | **False positive**: reanimated's own export, unused by `ui/motion.ts` |
| `overused-font` (CLI) | Inter in `global.css` ×4 and the CSS bundle | 5 | **Overruled by the brief**: PRODUCT.md › Capabilities "Inter is the only typeface, Cyrillic included (owner, feedback 2)"; SKILL.md › How to design "The brief wins" |

What the detector cannot see (it reads HTML/CSS and the live DOM's computed styles, not React Native source or
intent): spacing rhythm, whether a container is a nested card, the meaning of colour (category hue collisions,
01-007), copy, IA, Android rendering (rem = 14 px), and motion quality.

## Executive Summary

- Audit Health Score: **11/20** (Acceptable).
- Issues (web-relevant subset): **P0 1 · P1 4 · P2 10 · P3 2**.
- Top issues:
  1. 01-032 — no focus indicator on any text field; UA selection, caret and scrollbars (P0, known, deepened).
  2. 01-010 / 01-038 — no structural responsive model between 390 and 1440 (P1).
  3. 01-042 — 796 KB gzip single chunk (P2).
  4. 01-041 — CLS 0.188 History, ~0.1 Now on phone (P2).
  5. 01-031 / 01-024 — sub-44 px targets (36 px icon buttons, 24 px switches) against PRODUCT's 44 pt (P2).
- Next steps: one focus-ring token and browser-surface theming; breakpoints at 600 and 1024 with a rail and a
  real list/detail; route-level code splitting; reserve list space while the store hydrates.

## Detailed Findings by Severity

**[P0] Text fields show no keyboard focus; browser surfaces unthemed** (01-032, known — deepened)
- Location: `apps/app/global.css:44-47`; no `::selection`, `caret-color` or scrollbar rule anywhere in
  `global.css`; measured `::selection` = UA default (`rgba(0,0,0,0)` computed, i.e. the UA highlight), caret =
  `fg`. Buttons and links keep the browser's default `auto` ring (see
  `context/design/baseline/focus/now-tab6--desktop-dark-en.png`), which is visible but unstyled.
- Category: Accessibility. Impact: keyboard users (the owner works at a desk with Enter/Escape flows) lose their
  place in every form. WCAG 2.4.7 Focus Visible (AA); craft-floor.md › Verify "Browser surfaces".
- Recommendation: one `:focus-visible` ring token (2 px `accentQuietText`, 2 px offset) for every focusable,
  fields included; theme `::selection`, `caret-color`, and thin scrollbars from the palette.
- Suggested command: /impeccable polish.

**[P1] No medium-width layout; 768 px is a stretched phone** (01-038)
- Location: `apps/app/src/ui/layout.ts:4`. Evidence: `.../review-01/web/en-dark-768_.png`.
- Category: Responsive. audit.md › Responsive "Missing breakpoints". /impeccable adapt.

**[P1] Three desktop layout models; empty pane wider than the list** (01-010)
- Location: `ui/screen.tsx:33`, `ui/split-pane.tsx:20-22`. At 1440 Now's list is 560 px and the empty pane
  656 px; at 1024 both are ~400 px; Day/Insights/Settings centre an 880 px column with no pane.
- Category: Responsive / Integrity. operate.md › Layout. /impeccable layout.

**[P1] Eyebrow above every tab title** (01-001) — detector `kicker-above-heading`; craft-floor.md › Refuse (ban).
/impeccable typeset.

**[P1] Back chevron beside the previous-period chevron** (01-003) — identical glyphs 40 px apart on Insights,
Week and History at 390 px. /impeccable layout.

**[P2] JS payload** (01-042) — `dist/_expo/static/js/web/entry-54a5…js` 3,603,758 B raw, 795,689 B gzip; the
`index-…js` 112 KB; CSS 23.9 KB. Every route, OAuth consent and presets included, in one chunk. The service
worker (`dist/sw.js`, workbox) caches it after the first visit, so this bites first load and every release.
audit.md › Performance "Bundle size". /impeccable optimize.

**[P2] Layout shift on load** (01-041) — measured CLS: History 0.188 (390, both themes), 0.182 (768), 0.072–0.091
(1280/1440 dark); Now 0.096 (390 dark), 0.113 (390 light), 0.096 (768); Week 0.045–0.064 at ≤768; Day 0.057.
Insights, Settings, task, preset: 0. Cause class: lists and the time bar mount after the local store hydrates and
push content. audit.md › Performance. /impeccable optimize.

**[P2] Undersized targets** (01-031, 01-024) — measured below 44 px (PRODUCT.md › Accessibility asks ≥44 pt):
composer New task / To Inbox / Send 36×36; every switch 48×24 (13 on Settings, 16 on a preset); sidebar rows
199×40; the "All" filter chip 43×44; task rows 42 px tall as a whole; Week event blocks 31×65 and 62×29 px.
Nothing is under WCAG 2.5.8's 24 px. audit.md › Responsive "Touch targets". /impeccable adapt.

**[P2] Sub-11 px functional text** (01-017, 01-018) — detector-verified avatar 9.12 px, Week hours and block
titles 10 px. /impeccable typeset.

**[P2] Category hues collide in charts** (01-007) — `packages/core/src/tracking/categories.ts:10-23`. /impeccable colorize.

**[P2] RU text breaks mid-word in Insights tiles** (01-008) — 390 px RU. /impeccable harden.

**[P2] Docked toast clips a fourth line** (01-020) — `ui/toast.tsx:133` (`py-2.5` on a `numberOfLines={3}` Text:
react-native-web's line clamp shows the next line through the padding). /impeccable harden.

**[P2] Telegram widget failure is unthemed** (01-030) — `auth/telegram-widget.web.tsx`; serif "Bot domain
invalid" (light) / empty hole (dark). Environmental here (localhost is not the bot's domain), but the failure path
ships. /impeccable harden.

**[P3] `theme-color` light mismatch** (01-033, known) — `public/index.html:9,26`. /impeccable polish.

**[P3] Off-ramp font sizes** (01-043) — detector, 11 sites. /impeccable typeset.

## Patterns & Systemic Issues

- **States are drawn for touch only.** No hover style anywhere (known), no focus ring on fields, four disabled
  opacities, three pressed opacities (00-inventory §8): on a desktop browser the interface gives almost no
  pointer or keyboard feedback.
- **The responsive model is a single switch at 1024 px**, so tablets and narrow desktop windows get either a
  stretched phone or a cramped three-column shell.
- **Sizes sit on two scales** (rem boxes, px type) and the type ramp has 16 sizes; the detector's off-ramp
  findings are the visible tip.

## Positive Findings

- **axe-core clean**: 0 violations (any impact) across Now, Day, Week, Insights, Settings, History, a task and a
  preset, at 390 and 1440, dark and light. Contrast is pinned by tokens and it shows.
- **No horizontal overflow** at any of the five widths on eight routes.
- **Font loading is right-sized**: only the Latin and Cyrillic subsets are fetched (48.6 + 19.0 KB), both
  preloaded, `font-display: swap`, Cyrillic drawn in Inter as the owner required.
- **Skeletons, not spinners**, for sessions loading (`context/design/baseline/states/settings-sessions-loading--phone-dark-en.png`).
- **Keyboard path exists**: hotkeys shown on buttons (N, F, Ctrl+Enter, Enter/Escape on the assistant), focus
  kept through busy states (`ui/button.tsx:132`).

## Recommended Actions

1. **[P0] `/impeccable polish`**: focus ring token on every focusable (fields first), themed selection, caret,
   scrollbars; hover states.
2. **[P1] `/impeccable adapt`**: breakpoints at 600 (rail + list/detail) and 1024 (sidebar + inspector); 44 px
   targets on the web.
3. **[P1] `/impeccable layout`**: one desktop grid for every screen; period stepper separate from back.
4. **[P1] `/impeccable typeset`**: remove eyebrows; 11 px floor; a 6-role type scale.
5. **[P2] `/impeccable optimize`**: route-level async chunks; reserve list height before hydration.
6. **[P2] `/impeccable harden`**: RU overflow, toast clamp, Telegram widget failure.
7. **`/impeccable polish`** last.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `/impeccable audit` after fixes to see your score improve.
