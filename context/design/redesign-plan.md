# Pace design overhaul — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (the
> owner's choice for Phase 4) to implement this plan task-by-task. Implementers never dispatch
> subagents and get full briefs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pace's design system and restyle every screen to `redesign-spec.md` — an
Apple-grade Operate app on Android and the web, light and dark, EN and RU — without changing product
behaviour.

**Architecture:** Tokens v2 in `packages/core/src/design/tokens.json` generate every platform
value (Tailwind theme, NativeWind vars, motion constants, web literals). A new kit layer in
`apps/app/src/ui/` (state layer, type roles, list/section/header primitives, gesture sheet,
presence/disclosure) owns structure, states, motion and platform affordances; screens only compose
it. Guard rails (contrast test, no-raw-values lint, design-shots matrix, worst-case gallery) land
first so every later batch is checked mechanically.

**Tech Stack:** Bun workspaces, Expo 57 / React Native 0.86 / react-native-web 0.21, NativeWind 4,
Reanimated 4, expo-router, lucide-react-native, Vitest (core/client), jest-expo (app), Playwright +
axe (e2e), ESLint flat config, impeccable/apple-design/review-animations reviewers.

**Spec:** `context/design/redesign-spec.md` (read it in full before any task; `§` references below
point into it). Evidence: `context/design/findings.md` (`F-…` ids). Product truth: `PRODUCT.md`.

**Status:** written before STOP 1; the owner chose direction A (Тетрадь) and answered Q2–Q5 and Q7–Q12 (spec §12); Tasks 7.1–7.2 are re-specified for A's signature (notebook dot grid behind Day, red now-line, ink line under the running activity) in Phase 3. Phase 3 amends it (re-baseline after Phase C merges; the owner's
direction choice and answers to spec §12). Task contents assume the recommended direction B and the
§12 defaults; a different answer changes values, not the task list, except where noted.

## Global Constraints

- Follow `CLAUDE.md` in full: Bun only (`bun install`, `bun run`, `bunx`); `bun lint` after every
  change and fix everything; TDD at the level `docs/testing.md` names; never disable a lint rule
  inline without `-- <reason>`; never skip or delete a failing test; architecture per
  dependency-cruiser (`core` pure, apps never import each other); every UI string through `t()` (EN
  source, RU mirror); app imports use `#app/*`; web-only code in `.web.tsx` siblings or
  `src/platform/web/` stand-ins registered in `metro.config.js` `WEB_SHIMS`, never
  `Platform.OS === "web"` around a whole screen; a `.web.tsx` is never imported from its base file.
- Every colour, radius, spacing, type size, duration and easing is a token (spec §3); after batch 8
  `pace/no-raw-design-values` is `error`.
- Both themes and both scripts are first-class: every changed screen is checked in light and dark,
  EN and RU, at 390 × 844 and 1440 × 900 (design-shots matrix).
- Values copied from the spec: hit target 48 dp Android / 44 px web; focus ring 2 px + 2 px offset in
  `focus`; UI motion ≤ 300 ms; exits 0.7 × enter; easings enter `bezier(0.2,0.8,0.2,1)`, exit
  `bezier(0.4,0,1,1)`, move `bezier(0.3,0,0,1)`; type body 16/22 phone, 15/21 desktop; nothing
  functional below 11 px; `inlineRem` 16; breakpoints compact < 600 ≤ medium < 1024 ≤ expanded;
  bottom chrome ≤ 40 % of viewport height.
- Product truth is fixed: features, flows, copy meaning, IA (phone tabs Now · Day · Inbox · More;
  sidebar Now → Day → Week → Inbox → Projects → Insights → History → Settings), event sourcing,
  offline-first. No backend changes.
- Every bug found or fixed gets a `context/bug-lessons.md` entry (why tests missed it, its class, a
  sweep, a guard) in the same task (CLAUDE.md "Every bug teaches a class"). The 32 known bugs are
  listed in `findings.md` › Bugs with their classes.
- Commits end with the trailers from the current session (`Co-Authored-By: …` and
  `Claude-Session: …`); no model ids in commits or PRs. Open PRs, never merge; squash-merge only.
- Android-only behaviour (ripple, haptics, keyboard, back gesture, insets, font scale) is never
  claimed verified from the web build; each batch adds its items to the PR's "Verify on hardware"
  list (spec §11).

## Review Focus

The inputs and conditions most likely to bite the owner that no single task's tests naturally hit;
each line has its test added to the owning task.

1. **Russian text at 390 px in every changed control** — labels, tags, buttons and tiles must wrap
   words or ellipsize, never break mid-word or push a sibling off-screen. Test: the worst-case
   overflow sweep (Task 1.4 harness, extended by every screen task) asserts
   `scrollWidth ≤ clientWidth` and no text box wider than its parent on every route in RU at 390
   and 320 px.
2. **Overlays on top of the bottom chrome with two drafts open** (composer proposal + time-bar
   proposal + toast) — the list keeps ≥ 50 % of the viewport and no overlay covers an enabled
   control. Test in Task 4.2 (`e2e/overlays.e2e.ts` case "two proposals and an undo toast").
3. **Theme mismatch** (OS light, app dark and the reverse) at first paint and while a sheet is open
   — document background, `theme-color`, `color-scheme` follow the app. Test in Task 2.3.
4. **Reduced motion on the most frequent action** — check-off under `reducedMotion: "reduce"` never
   shows a blank row and the next step waits for completion. Test in Task 5.2.
5. **Keyboard-only desktop use of a sheet or dialog opened from a list** — focus starts on the first
   control, Escape closes, focus returns to the row, the ring is visible at every stop. Test in
   Task 3.6 (app) and Task 5.4/8.7 focus sweep (e2e).

## File structure (what is created, what each owns)

| Path | Responsibility |
|---|---|
| `packages/core/src/design/tokens.json` | v2 tokens (spec §3), the only source of design values |
| `packages/core/src/design/tokens.ts` | typed accessors: `color(theme, role)`, `hue(theme, name)`, `typeRole(role, size)`, `space`, `radius`, `motion`; type unions of role names |
| `packages/core/src/design/contrast.ts` | `contrastRatio`, `apcaLc(text, ground)`, `composite(top, bottom)` (rgba over hex) |
| `packages/core/src/design/pairs.ts` | the list of role pairs the UI uses, with their target (text / large / ui), read by the test |
| `packages/core/src/format/*.ts` | `formatDuration`, `formatCount`, `formatNumber`, `initials` (Intl, nbsp, graphemes) |
| `scripts/design/generate-design.ts` | generates `apps/app/src/ui/generated/tokens.ts` (Tailwind scales, vars, motion constants) and the web literals |
| `scripts/eslint-rules/no-raw-design-values.ts` | the lint rule (+ `.test.ts`, run by `bun test scripts`) |
| `apps/app/src/ui/pressable.tsx` | state layer (rest/hover/pressed/focus/selected/disabled, ripple, haptic) |
| `apps/app/src/ui/text.tsx`, `icon.tsx`, `link.tsx` | type roles, icon sizes/stroke, links with `href` |
| `apps/app/src/ui/group.tsx`, `list-row.tsx`, `section-header.tsx` | grouped lists and rows |
| `apps/app/src/ui/screen-header.tsx`, `shell.tsx` (+ `.web.tsx`) | page template, shell regions, breakpoints |
| `apps/app/src/ui/presence.tsx`, `disclosure.tsx` | paired enter/exit, disclosure |
| `apps/app/src/ui/sheet.tsx`, `dialog.tsx`, `popover.tsx` | overlays with gestures and exits |
| `apps/app/src/ui/toast.tsx`, `tooltip.tsx` (+ `.web.tsx`) | placement rule, hoverable tooltip |
| `apps/app/src/ui/text-field.tsx`, `time-input.tsx` | field purpose, touched gate, labels |
| `apps/app/src/ui/motion.ts` | presets from generated motion constants (spec §6) |
| `apps/app/src/platform/document-*.web.tsx`, `public/theme-boot.js` | the web document layer (spec §7) |
| `apps/app/app/dev/gallery.tsx` + `src/screens/gallery/*` | dev-only worst-case gallery (gated); description, link and the full sidebar are not rendered yet: later kit tasks add them |
| `e2e/design-shots.e2e.ts`, `e2e/a11y.e2e.ts`, `e2e/motion.e2e.ts`, `e2e/worst-case.e2e.ts` | the matrix and the new sweeps |

---

## Batch checklist (runs at the end of every batch 1–8)

Each batch is one PR (batch 1 ships inside the batch-2 PR). Before opening or updating the PR:

- [ ] `bun lint` clean; `bun test:unit`, `bun test:app`, `bun test:api` green; `bun test:e2e` green
      for the touched areas (full run before the PR).
- [ ] Re-shoot the matrix for touched screens:
      `DESIGN_SHOTS=.cache/shots/batch-<n> DESIGN_SHOTS_ONLY=routes,states,scroll bun test:e2e e2e/design-shots.e2e.ts`;
      put before/after pairs (baseline from `context/design/baseline/`) in the PR description.
- [ ] `dev-core:impeccable` `polish` on the touched screens, then `dev-core:impeccable-finish-reviewer`
      with the spec, the comps page and the screenshots; fix material findings in one batch.
- [ ] `dev-core:apple-design` re-review of touched screens (both themes, phone + desktop, RU).
- [ ] If motion changed: review-animations (`SKILL.md` + `STANDARDS.md` read from disk) over the diff.
- [ ] QA round per `docs/qa.md` (`context/qa-round-<n>.md`), fixes with TDD, repeat until only
      cosmetic findings remain.
- [ ] Code review via `superpowers:requesting-code-review` with this plan and the spec as the brief
      and the batch's git range; work findings with `superpowers:receiving-code-review`. If the
      batch changes a client/server rule, the brief carries "trace the other side".
- [ ] PR description: what shipped, before/after shots, the "Verify on hardware" items this batch
      introduces, reviewers' open items.

---

## Batch 1 — Guard rails

### Task 1.1: Commit the design-shots matrix

**Files:**
- Create: `e2e/design-shots.e2e.ts` (from the scratchpad version used for the baseline; see spec
  header: the baseline of commit `057e484` was shot with it)
- Modify: `docs/qa.md` (one paragraph: how to re-shoot), `docs/testing.md` (row in the e2e section)

**Interfaces:**
- Produces: env `DESIGN_SHOTS=<dir>` (on), `DESIGN_SHOTS_ONLY=<groups>`, `DESIGN_SHOTS_STATES=<names>`;
  output `<dir>/<group>/<name>--<viewport>-<theme>-<lang>.png` + `manifest-<combo>.json`.

- [ ] **Step 1:** Copy the file; it imports `./support/*` and the catalogs from
      `../packages/core/src/i18n/{en,ru}.ts`. Keep it off by default (`if (SHOT_DIR !== undefined)`).
- [ ] **Step 2:** Run `DESIGN_SHOTS=.cache/shots/check bun test:e2e e2e/design-shots.e2e.ts`.
      Expected: 8 passed; every manifest lists only `login-server-picker` as missed ("Android only").
- [ ] **Step 3:** `bun lint` (the e2e lint config applies: playwright rules, no `any`). Fix.
- [ ] **Step 4:** Commit "e2e: the design review matrix (every route, state and focus stop × 2
      viewports × 2 themes × 2 languages)".

### Task 1.2: Contrast and token-shape tests for v2 (red until Task 2.1)

**Files:**
- Modify: `packages/core/src/design/contrast.ts` (add `apcaLc`, `composite`)
- Create: `packages/core/src/design/pairs.ts`, `packages/core/src/design/tokens.test.ts`
- Modify: `packages/core/src/design/contrast.test.ts`

**Interfaces:**
- Produces: `apcaLc(text: string, ground: string): number` (APCA 0.0.98G-4g, signed Lc);
  `composite(top: string, bottom: string): string` (top may be `rgba(...)`, returns `#rrggbb`);
  `USED_PAIRS: readonly { fg: ColorRole; bg: ColorRole; target: "text" | "textSmall" | "large" | "ui" }[]`.

- [ ] **Step 1: Write the failing tests.**
  - `apcaLc` reproduces the APCA reference values: `apcaLc("#888888", "#ffffff") ≈ 63.1`,
    `apcaLc("#ffffff", "#888888") ≈ -68.5`, `apcaLc("#000000", "#aaaaaa") ≈ 58.1` (±0.5).
  - `composite("rgba(14, 122, 69, 0.12)", "#ffffff") === "#e2efe9"` (rounded per channel).
  - `tokens.test.ts`: both themes define every key of `color.light` (same key set); every `hue.*`
    has `stroke`, `ink`, `tint` in both themes; the 12 category hues are pairwise ΔE(OKLab) ≥ 0.05.
  - `contrast.test.ts`: for every `USED_PAIRS` entry in both themes, composited onto its real ground:
    `text` → WCAG ≥ 4.5 and |Lc| ≥ 75; `textSmall` → ≥ 4.5 and |Lc| ≥ 50; `large` → ≥ 3 and
    |Lc| ≥ 45; `ui` → ≥ 3. Pairs from spec §3.1 tables (labels on `bg.app/cell/elevated`, accent
    pairs, outline, focus, status, every hue `ink` on its `tint` over `bg.cell`, every hue `stroke`
    on `bg.app`).
- [ ] **Step 2:** `bun test:unit`. Expected: FAIL (v2 keys absent; `apcaLc` missing).
- [ ] **Step 3:** Implement `apcaLc` and `composite` in `contrast.ts` (pure; no deps). The v2 data
      arrives in Task 2.1; keep the token tests failing until then (do not skip them: Task 2.1 is in
      the same PR, and this task is committed together with it if the branch must stay green).
- [ ] **Step 4:** Commit with Task 2.1.

### Task 1.3: The no-raw-design-values lint rule (warn)

**Files:**
- Create: `scripts/eslint-rules/no-raw-design-values.ts`, `scripts/eslint-rules/no-raw-design-values.test.ts`,
  `scripts/eslint-rules/index.ts` (plugin object `{ rules: { "no-raw-design-values": … } }`)
- Modify: `eslint.config.ts` (register as plugin `pace`, rule `pace/no-raw-design-values: "warn"`
  for `APP` files), `eslint-plugins.d.ts` (if the plugin needs a module declaration),
  `docs/linting.md` (one line)

**Interfaces:**
- Produces: rule id `pace/no-raw-design-values` with message ids `rawColor`, `rawRadius`,
  `rawFontMetric`, `rawDuration`, `arbitraryClass`, `offScaleClass`.

- [ ] **Step 1: Write the failing RuleTester cases** (`bun test scripts`):
  invalid — `style={{ color: "#fff" }}`, `"rgba(0,0,0,.5)"`, `borderRadius: 12`, `fontSize: 15`,
  `withTiming(1, { duration: 200 })`, `withDelay(120, …)`, `className="p-[13px]"`,
  `className="rounded-[22px] text-[15px]"`; valid — `className="p-5 text-body rounded-md"` (token
  classes), `style={{ borderRadius: radius.md }}`, `withTiming(1, motion.enter.md)`, string literals
  in `packages/core/src/design/**` (rule not applied there), `"#app/ui"` import strings.
- [ ] **Step 2:** Run; expect FAIL (rule missing).
- [ ] **Step 3:** Implement with ESLint's `RuleModule` API: visit `Literal`/`TemplateLiteral` in
      JSX `className` (split on whitespace; flag `[`…`]` and classes not in the generated scale list
      exported by Task 2.2 — until then, only `[`…`]`), `Property` keys `borderRadius|fontSize|lineHeight|letterSpacing`
      with numeric values, `CallExpression` of `withTiming|withSpring|withDelay|withRepeat` with
      numeric literal arguments or `duration:` numbers, and colour-like string literals
      (`/^#([0-9a-f]{3,8})$/i`, `/^(rgb|rgba|hsl|hsla)\(/i`).
- [ ] **Step 4:** Run tests; PASS. Run `bun lint`; record the warning count in this plan under
      "Lint baseline" and in the PR description.
- [ ] **Step 5:** Commit "lint: pace/no-raw-design-values (warn) — the count to drive to zero".

### Task 1.4: Dev-only worst-case gallery and overflow sweep

**Files:**
- Create: `packages/core/src/testing/worst-case.ts` (fixtures: long Cyrillic titles up to schema
  max, one-letter, unbreakable URL, emoji-first name, RTL fragment, 37 subtasks, 99+ inbox, 23 h 59 m,
  0 m, 12 long project names, overlapping blocks, RU plural counts 1/2/5/11/21/22/25),
  `apps/app/app/dev/gallery.tsx`, `apps/app/src/screens/gallery/gallery-screen.tsx` (+ `gallery-sections.tsx`, `gallery-models.ts`; under `screens/` because features may not import features; the description, link and full sidebar are not rendered yet: later kit tasks add them),
  `e2e/worst-case.e2e.ts`
- Modify: `knip.jsonc` only if knip flags the route (it should not: route files are entries)

**Interfaces:**
- Consumes: kit components as they exist (the gallery is updated by each later task that changes
  a component).
- Produces: route `/dev/gallery?set=demo|worst|empty|one&lang=ru|en&theme=light|dark`; the screen
  renders TaskRow/TaskList, running card, Day rows, Week blocks, tags, chips, sidebar header,
  settings rows, sessions rows, inbox card, notification row, task header and footer from fixture
  view-models (no store writes).

- [ ] **Step 1: Write the failing e2e** `worst-case.e2e.ts`: for each `set` × 390/320/1440 × RU/EN,
      open `/dev/gallery`, assert `document.documentElement.scrollWidth <= innerWidth` and that no
      element with text has `scrollWidth > clientWidth + 1` unless it carries
      `data-text-policy="truncate"` and a `title`/tooltip; take a screenshot into the test output.
- [ ] **Step 2:** Run; FAIL (route missing).
- [ ] **Step 3:** Implement the route. Gate: the route module renders `<NotFound />` unless
      `process.env.EXPO_PUBLIC_DEV_LOGIN === "1"` (a build-time constant the bundler inlines), and
      loads the gallery screen with a lazy `import()` inside that branch so production bundles drop
      it. Selection lives in the URL params.
- [ ] **Step 4:** Run; the sweep fails on today's bugs (F-DAT-01/02) — mark those cases `test.fail()`
      with the finding id **only** in this task's commit; Tasks 3.9/4.1/4.5 remove the markers.
- [ ] **Step 5:** Commit "dev: worst-case gallery and the overflow sweep".

---

## Batch 2 — Tokens v2 (PR "Design overhaul 1/7: guard rails and tokens v2")

### Task 2.1: tokens.json v2 and typed accessors

**Files:**
- Modify: `packages/core/src/design/tokens.json`, `packages/core/src/design/tokens.ts`,
  `packages/core/src/design/pairs.ts`, `packages/core/src/tracking/categories.ts`
- Test: `tokens.test.ts`, `contrast.test.ts` (from Task 1.2), `categories.test.ts`

**Interfaces:**
- Produces (exported from `@pace/core`): `type ColorRole` (`"bg.app" | "bg.cell" | … ` every §3.1
  role), `type HueName` (12 hues + `slate`), `type TypeRole` (§3.2 roles), `color(theme, role)`,
  `hue(theme, name): { stroke; ink; tint }`, `typeRole(role, size: "phone" | "desktop")`,
  `space`, `radius`, `layout`, `motion` constant objects, `CATEGORY_HUES: Record<ActivityCategory, HueName>`,
  `projectHue(name: ProjectColorName): HueName` (`coral` → `red`).

- [ ] **Step 1:** Category test: `CATEGORY_HUES` has 12 distinct values; `work → blue`, `study → violet`,
      `task → green`, `food → orange`, `commute → lime`, `hygiene → cyan`, `rest → teal`,
      `chores → amber`, `social → pink`, `sport → red`, `sleep → indigo`, `other → slate`.
- [ ] **Step 2:** Run unit tests; FAIL (Task 1.2 tests + this one).
- [ ] **Step 3:** Write `tokens.json` v2 with the shape and values of spec §3 (colour values from
      `context/design/tokens/palette-v2-notebook.json` — direction A, the owner's choice; type, space, radius, size, motion, z from
      §3.2–3.8). Rewrite `tokens.ts` accessors; keep v1 exports as deprecated aliases only for the
      duration of Task 2.2 (deleted at its end).
- [ ] **Step 4:** Run; PASS (all pairs meet their targets — if one fails, fix the value in
      `palette.py`, regenerate, never weaken the target).
- [ ] **Step 5:** Commit "tokens v2: roles, hue family, type roles, spacing, radius, motion".

### Task 2.2: Generated platform values, `inlineRem: 16`, mechanical migration

**Files:**
- Create: `scripts/design/generate-design.ts` (+ `.test.ts`), `apps/app/src/ui/generated/tokens.ts`
  (generated, committed, header "generated by scripts/design/generate-design.ts")
- Modify: `apps/app/tailwind.config.js` (theme **replaced** from the generated scales: `colors` as
  `var(--pace-<role>)`, `spacing`, `fontSize` (role → [size, { lineHeight, letterSpacing,
  fontWeight }]), `borderRadius`, `opacity` removed where fills replace it), `apps/app/src/platform/theme.ts`
  (`vars()` from the generated per-theme map), `apps/app/metro.config.js` (`withNativeWind(config,
  { input: …, inlineRem: 16 })`), `package.json` (`design:generate` script; lint runs a check that the
  generated file is current), every `apps/app/src/**` file using v1 classes (codemod)
- Create: `scripts/design/migrate-classes.ts` (one-off codemod applying spec §9.2; deleted after use)

**Interfaces:**
- Consumes: Task 2.1 accessors.
- Produces: class names `bg-app bg-cell bg-elevated bg-sidebar bg-inset bg-fill-1..4 text-label-1..4
  border-separator border-outline bg-accent text-accent-on text-accent bg-accent-quiet text-danger
  …`, `text-largeTitle text-title1 … text-caption2 text-numeric-live …` (desktop variants via the
  `lg:` prefix generated from the desktop column), `p-0..11`, `rounded-xs..pill`; the list of valid
  classes exported for the lint rule (`GENERATED_CLASSES`).

- [ ] **Step 1:** `generate-design.test.ts`: generating twice is byte-identical; every `ColorRole`
      appears as a CSS var in both themes; `inlineRem` is 16 in the metro config (read the file).
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement the generator; run it; switch `tailwind.config.js` and `theme.ts` to the
      output; set `inlineRem: 16`.
- [ ] **Step 4:** Run the codemod (map in spec §9.2; `text-[Npx]` → nearest role by size and weight;
      half-steps → nearest `space`), then fix by hand what it cannot decide (each `raised`/`line`
      use is split by job; the codemod marks them `/* TODO(design): raised */` and the task removes
      every marker before commit).
- [ ] **Step 5:** `bun lint` (the lint rule now knows `GENERATED_CLASSES`: offScaleClass warnings
      drop), `bun test:app`, `bun test:unit`; re-shoot the matrix. Expected: screens look like the
      v2 palette on the old structure; no layout broke (compare shots); delete the v1 aliases.
- [ ] **Step 6:** Bug-lessons entry for F-AND-01 (class 11 + "two unit systems"); guard: the
      generator test pins `inlineRem`.
- [ ] **Step 7:** Commit "tokens v2 everywhere: generated theme, rem = 16 px on every platform".

### Task 2.3: The web document follows the app theme

**Files:**
- Create: `apps/app/public/theme-boot.js`, `apps/app/src/platform/document-theme.web.tsx`,
  `apps/app/src/platform/document-theme.tsx` (no-op), `e2e/theme.e2e.ts`
- Modify: `apps/app/public/index.html` (load `theme-boot.js` before the bundle; metas generated),
  `scripts/build-web.ts` (writes generated literals into `index.html` and `manifest.json`),
  `scripts/generate-icons.ts` (splash/manifest colours from tokens), `apps/app/app/_layout.tsx`
  (mount `DocumentTheme`)

**Interfaces:**
- Produces: `<DocumentTheme scheme dimmed />` (web: sets `data-theme`, `color-scheme`, body
  background, both `theme-color` metas — dimmed while a scrim is up).

- [ ] **Step 1: Failing e2e** `theme.e2e.ts`: with `colorScheme: "light"` and
      `localStorage["pace.theme"]="dark"`, the first screenshot after `domcontentloaded` has a dark
      body background and `meta[name=theme-color]` equals `bg.app` dark; toggling the theme in
      Settings updates the meta; opening a sheet changes the meta to the scrim-composited colour;
      the reverse mismatch too.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement (CSP: external script only; values read from a generated JSON).
- [ ] **Step 4:** Run; PASS. Bug-lessons: F-WEB-02 as class 22's document variant; sweep the other
      literals (`#f4f5f7`, `#0b0b0c`, manifest, splash).
- [ ] **Step 5:** Commit.

### Task 2.4: Locale formatters in core

**Files:**
- Create: `packages/core/src/format/numbers.ts` (+ `.test.ts`), `packages/core/src/format/initials.ts` (+ `.test.ts`)
- Modify: `packages/core/src/i18n/i18n.ts` (`formatDuration`, `formatLeft`, `formatSpan` use nbsp
  and «мин»; days past 48 h), every caller of `toFixed`/`String(count)` for displayed numbers
  (sweep with grep)

**Interfaces:**
- Produces: `formatNumber(value, language, { fraction? })`, `formatCount(n, language)` (grouping:
  «1 284» with U+202F), `initials(name): string` (grapheme-safe via `Intl.Segmenter` with a
  fallback), `formatDuration(minutes, language)` → «2 ч 05 мин» / "2h 5m", «3 дн 4 ч» past 48 h.

- [ ] **Step 1: Failing tests:** `formatNumber(3.3, "ru") === "3,3"`; `formatCount(1284, "ru") === "1 284"`;
      `formatDuration(125, "ru") === "2 ч 05 мин"`; `formatDuration(10080, "ru") === "7 дн"`;
      `initials("🦊 Альберт") === "🦊"`; `initials("Albert Nalinor") === "AN"`; fast-check: `initials`
      never returns a lone surrogate.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** PASS; sweep callers (Insights tiles,
      counts, avatar). Bug-lessons: new class "Locale formatting by hand" (F-CPY-04) and "Text sliced
      by UTF-16 code unit" (F-DAT-08); guard: lint `no-restricted-syntax` on `.toFixed(` and
      `.slice(0, 1)` over display strings in `apps/app/src` (message points to the formatters).
- [ ] **Step 5:** Commit.

### Task 2.5: Instant response — the screen updates before the local write (owner, 2026-11-01)

The owner reports that taps feel late on the phone. Measured on the web build at 4× CPU throttle
(a mid-range phone): 140–360 ms from tap to the next frame (Event Timing API) for tab switch, filter
chip, check-off, open row, back. Causes found in code:
1. `packages/client/src/state.ts:213-216` — `persistLocal` awaits `eventStore.append` (SQLite on
   Android, IndexedDB on the web) **before** `integrate` updates the store, so every action's visual
   result waits for a disk transaction.
2. react-native-web delays the pressed state 50 ms (`DEFAULT_PRESS_DELAY_MS`,
   `react-native-web/dist/modules/usePressEvents/PressResponder.js:74`); NativeWind `active:` classes
   need a React re-render to show; Android has no native ripple (fixed in Task 3.1).
3. Check-off mounts the dust views in the same render as the fill (fixed in Task 5.2).

**Files:** Modify `packages/client/src/state.ts` (+ `state.test.ts`), `packages/client/src/actions/*`
only if they rely on the old order; Create `e2e/latency.e2e.ts`.
**Interfaces:** `persistLocal(event)` integrates first, then appends; if the append rejects, the event
is removed from `known`, the state is rebuilt without it, and the returned promise rejects with
`"persist_failed"` so the action answers `Result` error and the UI shows its sentence.
- [ ] Failing tests: client — with a deferred `eventStore.append`, the store version changes before
      the append resolves; when the append rejects, the state returns to the previous version and the
      action resolves `{ ok: false, error: "persist_failed" }` (bug-lessons 3: test pending →
      resolved → refused); e2e `latency.e2e.ts` — with CDP CPU throttle 4×, Event Timing duration for
      tap on a tab, a chip, a task check and a row is ≤ 100 ms (p75 of 5 taps each).
- [ ] Implement; PASS; check `rebuild` cost: if `shouldRematerialize` triggers a full rebuild on a
      plain local action, profile and fix (local actions append in order).
- [ ] Bug-lessons: new class "The visible result of an action waits for its persistence"; sweep other
      awaited writes before UI updates (settings, presets, sessions). Commit.

---

## Batch 3 — Primitives and components (PR "Design overhaul 2/7: the kit")

Every task here: jest-expo tests by role and `accessibilityState` for each state the spec names
(§4 entry of the component), the gallery (Task 1.4) updated with the component's demo/worst
variants, `impeccable polish` on the gallery screenshots after the task. Each task's spec is its
§4 entry; the Interfaces below are the names other tasks rely on.

### Task 3.1: `Pressable` state layer (+ haptics)

**Files:** Create `apps/app/src/ui/pressable.tsx` (+ `.test.tsx`), `apps/app/src/platform/haptics.ts`
(+ `haptics.web.ts` no-op); Modify `apps/app/package.json` (`expo-haptics`, Q7), `global.css`
(state-layer CSS for `:focus-visible`, hover gating, forced colours).
**Interfaces:** Produces `<Pressable role label selected disabled haptic="confirm|tick|longPress|reject" ripple="bounded|borderless" onPress onLongPress>`;
`haptic(kind)`.
- [ ] Press feedback never waits for JS: Android `android_ripple` (native, shown by the platform
      without a React render); web: `delayPressIn={0}` (react-native-web defaults to 50 ms) and the
      pressed overlay drawn by CSS `:active` on the element, not by NativeWind `active:` state; the
      lint rule bans `active:` classes outside `ui/pressable.tsx`.
- [ ] Failing tests: pressed state toggles on `pressIn`/`pressOut`; the web Pressable passes
      `delayPressIn={0}`; `disabled` blocks `onPress` and
      sets `accessibilityState.disabled`; `selected` sets `accessibilityState.selected`; Android
      preset passes `android_ripple` with `fill.3`; `haptic="confirm"` calls the haptics port once per
      press; a web snapshot has the focus-visible class.
- [ ] Implement; PASS; migrate `button`, `icon-button`, `chip`, rows to it in their own tasks.
- [ ] Bug-lessons: F-CMP-01 ("21 of 63 pressables without feedback") — guard: a lint
      `no-restricted-imports` of `Pressable`/`TouchableOpacity` from `react-native` in
      `apps/app/src/features/**` and `src/shared/**` (message: use `#app/ui/pressable`).
- [ ] Commit.

### Task 3.2: `Text` roles, `Icon`, `Link`

**Files:** Create `ui/text.tsx`, `ui/icon.tsx`, `ui/link.tsx` (+ tests); Modify every `lucide-react-native`
import site to `Icon` (codemod), `ui/sidebar.tsx`/`tab-bar.tsx` links.
**Interfaces:** `<Text role="body" tone="primary|secondary|tertiary|accent|danger|warn" numeric
policy="truncate|wrap|clamp" lines={n} level?>` (heading `level` → `aria-level` + role heading);
`<Icon name size="inline|control|bar" tone>` (stroke 1.75, `absoluteStrokeWidth`); `<Link href>` (web
`<a href>` via expo-router `Link asChild`).
- [ ] Failing tests: `policy="truncate"` sets `numberOfLines=1` **and** `flexShrink: 1, minWidth: 0`;
      `level={2}` renders role heading with level 2; `Icon` passes `strokeWidth={1.75}` at every size;
      `Link` renders an `a` with `href` on web (e2e: Ctrl-click opens a new page).
- [ ] Implement; PASS; lint guard: forbid `numberOfLines` on raw RN `Text` outside `ui/text.tsx`
      (F-DAT-02 class guard) and raw `lucide-react-native` imports outside `ui/icon.tsx`.
- [ ] Bug-lessons: F-DAT-02 new class "Text from data in a flex row without a shrink rule"; sweep
      every `ColorTag`/label (Task 3.9, 4.x finish it). Commit.

### Task 3.3: `Group`, `ListRow`, `SectionHeader`

**Files:** Create `ui/group.tsx`, `ui/list-row.tsx`, `ui/section-header.tsx` (+ tests); Modify
`ui/row-list.tsx` (keeps `collapsable={false}`, bug-lessons 11).
**Interfaces:** `<Group inset>` (cell bg, `radius.lg`, separators between children, inset to the text
start); `<ListRow leading title subtitle meta trailing onPress selected density="regular|compact">`
(min height 52/44, `row.padX/Y`); `<SectionHeader title count? action? level>`.
- [ ] Failing tests: separators render between rows, not before the first or after the last;
      `selected` adds the leading bar element and `accessibilityState.selected`; `SectionHeader`
      is a heading with the given level and sentence-case text unchanged.
- [ ] Implement; PASS; Commit.

### Task 3.4: `ScreenHeader` and the shell

**Files:** Create `ui/shell.tsx`, `ui/shell.web.tsx`, `ui/use-breakpoint.ts` (+ tests); Rewrite
`ui/screen-header.tsx`, `ui/screen.tsx` (+ `.web.tsx`: the window scrolls on desktop),
`ui/back-header.tsx` (merged into `ScreenHeader variant="pushed"`), `ui/split-pane.tsx` (deleted:
the shell's inspector region replaces it).
**Interfaces:** `useBreakpoint(): "compact" | "medium" | "expanded"`; `<ScreenHeader variant="top|pushed"
title subtitle? period? actions?>`; `<Shell navigation content inspector? inspectorOpen>`.
- [ ] Failing tests: `variant="top"` renders `largeTitle` and no eyebrow element; subtitle under the
      title; `variant="pushed"` renders Back + `title1`; `inspectorOpen=false` gives the content the
      full width (no empty pane); breakpoints at 600 / 1024.
- [ ] Medium width (600–1023): the sidebar becomes a navigation rail (icons + labels), the inspector
      opens as a sheet; remove the portrait lock in `apps/app/app.config.ts` (`orientation`) — Q8,
      F-LAY-04. Test: `useBreakpoint` at 800 px returns `medium` and the shell renders the rail.
- [ ] e2e (in `e2e/layout.e2e.ts`): title top y is identical (±1 px) across Now, Day, Week, Inbox,
      Projects, Insights, History, Settings at 1440 and 390 (F-LAY-02).
- [ ] Implement; PASS; Commit.

### Task 3.5: `Presence` and `Disclosure`

**Files:** Create `ui/presence.tsx`, `ui/disclosure.tsx` (+ tests); Delete `ui/animated-height.tsx`
after its callers move (Now composer form, In future, time-bar unfold, group folds).
**Interfaces:** `<Presence show enter="fade|rise|scale" exit=… onExited>` (keeps children mounted
through the exit; reduced variant = fade); `<Disclosure open onToggle label>` (chevron rotation,
height from measured content, focus moves after layout with `preventScroll`).
- [ ] Failing tests: `show=false` keeps children until `onExited` fires; with reduced motion the
      preset is opacity-only; `Disclosure` sets `accessibilityState.expanded`.
- [ ] e2e geometry sampler (extend `e2e/support/geometry.ts`): during the composer unfold no child's
      box leaves the card (F-MOT-08; bug-lessons 5).
- [ ] Implement; PASS; Commit.

### Task 3.6: `Sheet`, `Dialog`, `Popover`

**Files:** Rewrite `ui/sheet.tsx` (+ test), `ui/sheet-actions.tsx`; Create `ui/dialog.tsx`,
`ui/popover.tsx` (+ tests).
**Interfaces:** `<Sheet open onClose title detents={["medium","large"]?} dismissible>` (phone:
gesture handle, swipe past 30 % or 800 dp/s, Back closes, travels its own height, exit animation,
scrim fades in place; expanded: renders `Dialog`); `<Dialog open onClose title>` (scale 0.96→1,
Escape, click outside, ✕, focus trap, `aria-labelledby`); `<Popover anchor open onClose>` (desktop
pickers anchored to their button).
- [ ] Failing tests: close paths (handle drag simulated with gesture-handler test utils, scrim press,
      `BackHandler` event, Escape on web) each call `onClose` once; the first focusable is the first
      control, not the backdrop; focus returns to the trigger; the dialog has an accessible name.
- [ ] Review Focus line 5: keyboard-only sheet from a list row — focus start, Escape, return focus.
- [ ] Bug-lessons: F-CMP-02 (class 10: an affordance with no behaviour) and F-MOT-05/06 (class 5);
      sweep every `Modal` use. Commit.

### Task 3.7: Toast placement and Tooltip

**Files:** Rewrite `ui/toast.tsx`, `ui/tooltip.tsx`, `ui/tooltip.web.tsx`, `ui/tooltip-place.ts` (+ tests).
**Interfaces:** `toast.show({ message, action?, anchor? })` — placed above the measured bottom
chrome (time bar + tab bar + insets) or next to `anchor`; `role="status"`; `<Tooltip label>` —
hover delay 400 ms, hoverable bubble, Escape, not on tap (touch shows nothing; the control carries a
visible hint instead).
- [ ] Failing tests: the toast's bottom offset equals the measured chrome height + `space.3`; it is
      `status` and announces once; tooltip does not open on `press` on touch; stays open while the
      bubble is hovered (web test).
- [ ] e2e: extend `e2e/overlays.e2e.ts` — no toast or tooltip covers an enabled control on Now,
      Day, task (bug-lessons 6). Bug-lessons F-CMP-12 (class 6). Commit.

### Task 3.8: `TextField` and `TimeInput`

**Files:** Rewrite `ui/text-field.tsx`, `ui/time-input.tsx` (+ tests); migrate the 9 raw
`TextInput`s (inventory §7) to it.
**Interfaces:** `<TextField label purpose="title|description|url|search|time|name|token" error?
showErrorWhen="touched|submitted" multiline?>` → web attributes per spec §7 Fields; 16 px on phone
web; visible label is a `<label for>` on web.
- [ ] Failing tests: an empty required field shows no error until blurred or submitted (F-CMP-03,
      Review: class 2 — open the empty form by hand); `purpose="url"` sets `inputMode="url"`,
      `spellCheck={false}`, `autoComplete="url"`; focus ring visible on focus (web).
- [ ] Bug-lessons F-CMP-03 (class 2). Commit.

### Task 3.9: Controls — Button, IconButton, Chip, Tag, Segmented, Switch, Slider, CheckCircle, ProgressBar, CountBadge, Skeleton, EmptyState

**Files:** Rewrite each `ui/*.tsx` named in the title (+ tests); `ui/color.tsx` becomes `ui/tag.tsx`
+ `hue` helpers; delete `ui/pulse-dot.tsx` (spec §6: static running dot), `ui/dissolve.tsx` moves to
Task 5.2.
**Interfaces:** `<Button variant="primary|secondary|plain|destructive" size="regular|small"
width="hug|fill" shortcut?>` (one geometry per size: `radius.md`, heights 48/36 phone, 40/32
desktop; shortcut hint shown the OS's way on desktop); `<IconButton icon label>` (48 dp target);
`<Chip selected>` (radio semantics in a `radiogroup`); `<Tag hue|project label>` (policy truncate +
tooltip); `<Segmented options value label>`; `<Switch>` (track off uses `outline`, knob ≥ 3:1);
`<Slider value onChange format="percent">` (value text live, no thumb jump); `<CheckCircle checked
onPress>` (fills on press-in, `haptic="confirm"`, 48 dp target without negative margins);
`<CountBadge count max=99>` (does not cover the icon: offset to the icon's top-right corner);
`<Skeleton height>` (appears after 300 ms); `<EmptyState title body action?>`.
- [ ] Failing tests per component (states by role); `Tag` with a 120-char name in a 200 px parent
      ellipsizes (`numberOfLines=1`, shrink) — removes the Task 1.4 `test.fail` marker for F-DAT-02
      tags; `CountBadge` 120 → "99+".
- [ ] Bug-lessons: F-COL-09 (off switch knob, new class "contrast asserted for text only"), F-DAT-10
      (class 6). Commit.

### Task 3.10: Sidebar and TabBar

**Files:** Rewrite `ui/sidebar.tsx`, `ui/tab-bar.tsx` (+ tests), `shared/user-avatar.tsx`.
**Interfaces:** Sidebar: logo + "Pace" + the owner's name on its own line under it (truncate with
tooltip; F-LAY-06), New task (`Button primary` with `N`), nav items as `Link`s with
`aria-current`, Inbox badge; TabBar: Android Material navigation bar (filled icon + pill indicator on
the selected tab, labels always shown), web `nav` with links; height measured and published to the
toast/overlay layer.
- [ ] Failing tests: the selected tab exposes `aria-current="page"` (web) / selected (Android); a
      64-char Telegram name is not cut to one letter (the header has two lines); `deadControls()`
      over the tab bar (bug-lessons 10).
- [ ] Commit.

---

## Batch 4 — Shared rows and screens (PR "Design overhaul 3/7: screens")

Every screen task: follow the screen's §5 entry; update e2e for changed selectors; extend the
worst-case sweep and `phone-controls.test.tsx`; RU at 390 checked in shots; network steady-state
assertion for flows that write (bug-lessons 1).

### Task 4.1: TaskRow, TaskList, MetaLine

**Files:** Rewrite `shared/task-row.tsx`, `shared/task-list.tsx`, `shared/meta-line.tsx` (+ tests);
Modify `packages/client/src/view-models/now.ts` (meta parts: importance only when not Normal — Q3;
due as one formatted string).
**Interfaces:** `TaskRow` = `ListRow` with `CheckCircle` leading, title `clamp(2)`, meta line
(project `Tag`, importance word, due/left in `numeric`), trailing repeat icon; `TaskList` virtualised
(`FlatList` with `getItemLayout` from fixed row heights per density, windowing) and section headers.
- [ ] Failing tests: view-model — Normal importance yields no meta part; app — 1 284 rows render
      ≤ 40 row components initially; e2e — expanding a 1 050-row fold renders in < 500 ms and p95
      frame < 32 ms at 390 (F-DAT-03).
- [ ] Commit.

### Task 4.2: Running card, time bar, pickers

**Files:** Rewrite `shared/tracking/*` (running card, time bar, pickers, typed field) (+ tests).
**Interfaces:** Running card: category dot + name (`headline`), live time `numeric.live`, "из ~20 мин"
(`footnote`), Stop (`Button secondary` with filled-square icon), "Yes, still" when past 2×; time
bar: four fixed tiles Calendar / Task / Chores / Rest (neutral at rest; running tile shows its
category stroke), typed field with a dashed-outline draft while parsing; phone (Q12 default): the
tiles stay visible while something runs, only the typed field folds under «Начать другое», and the
whole bar folds only past the 40 % region budget (§3.3).
- [ ] Failing tests: tiles keep identical size and position with any label length (RU); the running
      name is not a tag; a long name truncates before Stop (F-DAT-02); region budget — with two
      proposals open the list keeps ≥ 50 % height (Review Focus 2, e2e in `overlays.e2e.ts`);
      start/stop calls `haptic("tick")`; the running row is not a live region and announces only
      start, stop and "past expected" once (F-A11Y-10, new bug-lessons class "Live region around a
      ticking value").
- [ ] Commit.

### Task 4.3: Now

**Files:** `src/features/now/**` (composer, quick line, form, proposals, calendar offer, filters,
now-screen) (+ tests).
- [ ] Spec §5 Now: one-line composer, Enter → proposal, + opens the form in place (title from the
      line), the form's primary action on the right with its shortcut; filters as a chip
      `radiogroup` that scrolls with a visible cue and wheel support on desktop (F-DAT-02/05-006);
      inspector collapsed when nothing is selected (F-LAY-03); one New task entry on desktop
      (F-CMP-18).
- [ ] Failing tests: every composer entry path submits (bug-lessons 2; `docs/qa.md` table rows);
      empty form opened by hand has no error before interaction; filter chips reachable by wheel
      (e2e). Commit.

### Task 4.4: Day (structure; the line signature is Task 7.1)

**Files:** `src/features/day/**` (+ tests).
- [ ] Spec §5 Day: page template, `PeriodStepper` ‹ date › with Today only away from today
      (F-CMP-05), the inspector on desktop when a block or gap is selected (collapsed otherwise), grouped rows with one divider rule, gaps as rows with Log, Log past as a row action,
      screen-time section in the same list system.
- [ ] Failing tests: Today button absent on today, present on another day; day switch replaces
      content with no crossfade (F-MOT-07). Commit.

### Task 4.5: Task detail (screen and inspector)

**Files:** `src/features/task/**` (header, footer, subtasks, progress, description, original
message, edit sheet, close sheet) (+ tests); `packages/client/src/view-models/task.ts` (submit
label).
- [ ] Spec §5 task: header actions as labelled controls (Edit, Close as…, Delete; no Pause — Q4),
      Focus and Done equal width with shortcuts, submit label «Сдать N» / "Submit N" (F-DAT-01),
      progress slider in % with live value, delete with inline confirm then Undo in place 10 s
      (Q5, F-A11Y-02), project picker as a field, not a pill.
- [ ] Failing tests: view-model `submitLabel(37 solved) === "Сдать 37"`; delete focus moves to the
      next row and Escape cancels the confirm (bug-lessons 5, 21); slider `aria-valuetext` "30 %"
      (F-A11Y-16). Bug-lessons F-DAT-01 (new class "Text from data placed in chrome without a length
      policy") and F-A11Y-02. Commit.

### Task 4.6: Week

**Files:** `src/features/week/**` (+ tests).
- [ ] Spec §5 Week: proportional grid where geometry and lanes come from one function (F-DAT-05,
      bug-lessons 1), labels ≥ 11 px, day strip snaps on phone, detail in inspector/sheet, night
      hours option, blocks announce day and time (F-A11Y-09).
- [ ] Failing tests: `layoutWeek()` (client view-model) — 5 overlapping 20-minute blocks get 5 lanes
      and drawn heights equal their lane geometry; a11y labels include the weekday. Commit.

### Task 4.7: Inbox, Review, Decisions

**Files:** `src/features/inbox/**`, `review/**`, `decisions/**` (+ tests).
- [ ] Inbox cards clamp text to 4 lines with "Show all" (F-DAT-06), Accept primary / Delete plain
      (F-CMP-15), virtualised; empty states teach (F-CMP-09); empty list renders no `list` role
      (F-A11Y-18). Commit.

### Task 4.8: Projects, project page, presets

**Files:** `src/features/projects/**`, `presets/**` (+ tests).
- [ ] Projects as a grouped list with hue dot + name + "3 tasks" (plural i18n), no hero strip
      (F-CMP-16); project page = the Now task list grouped Open / In future / Done (F-LAY-07);
      presets as grouped rows; New project button hugs (F-CMP-06). Commit.

### Task 4.9: Insights

**Files:** `src/features/insights/**` (+ tests).
- [ ] Tiles use `numeric.stat` + a label that wraps words (no mid-word breaks in RU; F-TYP-04),
      bars share one value column (F-LAY-14), period control as Day (F-CMP-05), charts use the hue
      family. Failing test: RU tile labels at 390 have no hyphenless word split (e2e text-metrics
      check). Commit.

### Task 4.10: History and Notifications

**Files:** `src/features/history/**`, `notifications/**` (+ tests).
- [ ] History rows as `ListRow` with a single trailing "Undo" only on the latest undoable event of a
      group (F-CMP-14), snapshot rows not checkbox-like; Notifications feed grouped by day,
      virtualised. Commit.

### Task 4.11: Settings

**Files:** `src/features/settings/**`, `sessions/**`, `devices/**`, `server/**` (+ tests).
- [ ] Inset grouped sections in the order of spec §5 Settings; notifications as per-channel rows or
      the compact matrix with named groups (F-LAY-09); time fields sized to content; sessions list
      with inline revoke confirm (focus to successor); danger zone with `Button destructive`
      (F-CMP-07); shortcuts listed under Settings › Keyboard (no switch: there are no single-key shortcuts any more; Q6); server line middle-ellipsizes the host
      (F-DAT-11).
- [ ] Failing tests: `deadControls()` at phone width; revoke confirm Escape returns focus. Commit.

### Task 4.12: More and the signed-out screens

**Files:** `app/(tabs)/more.tsx`, `src/screens/login-screen*.tsx`, `app/oauth/authorize.tsx`,
`app/onboarding.tsx`, `app/permissions.tsx`, `app/+not-found.tsx` (+ tests).
- [ ] More as a grouped list; pushed destinations keep the tab bar (F-AND-03 residue); login with a
      graceful Telegram-widget failure state (F-CMP-17); onboarding/permissions in the template;
      not-found with a way home. Commit.

### Task 4.13: Copy fixes and the glossary test

**Files:** `packages/core/src/i18n/{en,ru}/*.ts`, `packages/core/src/i18n/glossary.test.ts` (new).
- [ ] Failing test `glossary.test.ts`: banned phrases absent ("We changed a few things", "Settings →
      Devices"); pinned owner copy present (update banner, Calendar hint); one word per action per
      language (`common.undo` ≠ `task.giveUp` in RU; `assistant.approved` ≠ `task.done` in both;
      Revoke/End, Sign in/Log in unified) — F-CPY-01/02/03/05.
- [ ] Implement the catalog changes; PASS. Bug-lessons: new class "Owner-corrected copy with no test
      pinning it" (F-CPY-01) and extend class 45's guard. Commit.

---

## Batch 5 — Motion (PR "Design overhaul 4/7: motion")

### Task 5.1: `motion.ts` rewritten

**Files:** Rewrite `apps/app/src/ui/motion.ts` (+ test), `global.css` (CSS mirrors under
`prefers-reduced-motion`).
**Interfaces:** `motion.enter.{xs,sm,md,lg}` / `motion.exit.*` (`{ duration, easing }` from
generated constants), presets `fadeIn/Out`, `riseIn/Out`, `sheetIn/Out`, `dialogIn/Out`,
`popoverIn/Out`, `rowCloseUp`, each with `.reduced`; `useReducedMotionPreset(preset)`.
- [ ] Failing tests: every preset has an exit and a reduced variant; no duration > 300; every
      preset sets an easing (F-MOT-04). Commit.

### Task 5.2: Check-off

**Files:** `ui/dissolve.tsx` (rewrite), `shared/use-check-task.ts`, `shared/use-close-with-undo.ts`,
`shared/task-list.tsx` (+ tests); `e2e/motion.e2e.ts` (new).
- [ ] Spec §6 check-off rows: fill on press-in, fade 160 ms (owner's choice, Q2 = c), rows close up 220 ms on Android **and** web via `RowList`, Undo toast
      with the dissolve; next step on the animation's completion, never a timer (F-MOT-01/02/03).
- [ ] Failing tests: app — the check fills in the same frame as press-in; the row is removed on the
      completion callback; with a pending store write (deferred promise) the row does not flash back
      (bug-lessons 3); e2e — frame sampling: press→fill ≤ 50 ms, row gone ≤ 320 ms, rows below move
      continuously (no jump > 8 px between frames); reduced motion: no frame where the row is blank
      but occupies space (Review Focus 4).
- [ ] Bug-lessons: new class "A timer paired with an animation instead of its completion" (F-MOT-03).
      Commit.

### Task 5.3: Overlays, disclosure, route transitions, web mirrors

**Files:** `ui/sheet.tsx`, `dialog.tsx`, `popover.tsx`, `toast.tsx`, `tooltip*.tsx`, `disclosure.tsx`,
`app/_layout.tsx` and `(tabs)/_layout.tsx` (stack animation options), `screen-scene.web.tsx`.
- [ ] Spec §6 rows for sheets, dialogs, popovers, toast, tooltip, disclosure, route push (Android
      native slide + predictive back; web 12 px slide + fade), tab switch none, Day/Week switch none,
      filter none, list mount none (F-MOT-05…15).
- [ ] e2e `motion.e2e.ts`: sheet open/close both animate (frames in between); dialog first frame
      scale ≥ 0.95; route push on web has ≥ 3 intermediate frames. Commit.

### Task 5.4: Reduced-motion and focus sweeps

**Files:** `e2e/a11y.e2e.ts` (new: reduced motion run, focus sweep, zoom, titles/headings, axe with
overlays open and forced colours).
- [ ] Spec §8 "Tests that check it": all six assertions. Commit.

---

## Batch 6 — Web / PWA layer (PR "Design overhaul 5/7: web and PWA")

### Task 6.1: Document layer — title, lang at first paint, landmarks

**Files:** Create `src/platform/document-title.web.tsx` (+ base no-op); Modify `public/theme-boot.js`
(lang), `src/platform/document-language.web.tsx`, client settings bootstrap (language stored with the
session so the first paint uses it), `ui/shell.web.tsx` (main, skip link).
- [ ] Failing e2e: every route's `document.title` is «<screen> · Pace» (entity name on task/project);
      a big RU account's first screenshot after load contains no English UI string (F-DAT-04,
      bug-lessons 22); one `main` landmark and a skip link.
- [ ] Commit.

### Task 6.2: Mobile-web baseline in `global.css`

**Files:** `apps/app/global.css`, `public/index.html` (viewport `interactive-widget=resizes-content`),
`src/platform/keyboard.web.ts` (new).
- [ ] Spec §7 rows: focus-visible ring, hover gating, overscroll, user-select on controls, selection
      colour, caret, scrollbars, 16 px fields on phone web, keyboard scroll-into-view.
- [ ] Failing e2e: `overscroll-behavior-y` is `none` on `html`; field font-size ≥ 16 px at 390; a
      long press on a button selects no text (`getSelection().toString() === ""` after a 700 ms
      touch hold); with a reduced visual viewport the focused time-bar field is inside it.
- [ ] Bug-lessons: new classes "Browser default gesture left on" (F-WEB-06) and "A reload path that
      drops unsaved drafts" (Task 6.3). Commit.

### Task 6.3: Update banner, manifest, icons, favicons

**Files:** `src/platform/update-banner.web.tsx` (+ test), `public/manifest.json`,
`scripts/generate-icons.ts` (+ test), `public/favicon.svg`.
- [ ] Banner per spec §7 (copy pinned by Task 4.13, overlays without layout push, 44 px button,
      refuses to reload over a draft, `beforeunload`); manifest with `id`, separate maskable icon,
      shortcuts, screenshots, light/dark splash; SVG favicon with scheme media query; logo and icons
      in the current lime (owner, round 2: `#5E8C00` on light, `#C8F03C` on dark).
- [ ] Failing tests: banner Refresh with a non-empty composer draft shows "Save your draft first"
      and does not reload; `generate-icons.test.ts` asserts the logo's bright chevron equals the
      `logo.light` / `logo.dark` tokens (`#5E8C00` / `#C8F03C`). Commit.

### Task 6.4: Bundle splitting, layout shift, local CSP

**Files:** `apps/app/app.config.ts` / router config (async routes for Insights, History, Settings,
Week), `scripts/serve-web.ts` (apply `_headers`), skeleton heights in the kit.
- [ ] Failing e2e: first-load JS for `/` ≤ 450 KB gzipped (read from the build stats); CLS ≤ 0.05 on
      `/` and `/history` (PerformanceObserver); the CSP header is present locally (F-WEB-11/12/16).
- [ ] Commit.

---

## Batch 7 — Identity details (direction A)

Only what spec §2 names for the chosen direction (A · Тетрадь).

### Task 7.1: Day on the notebook page (direction A)

**Files:** `src/features/day/day-rail.tsx` (new) (+ test), `packages/client/src/view-models/day.ts`
(rail geometry).
**Interfaces:** `dayRail(blocks, gaps, now, zone): { items: { from; to; hue; kind: "block" | "gap" |
"parallel"; open }[]; nowAt }` (proportional, long gaps capped at 3 h with a scale break).
- [ ] Spec §2 A signature: a faint dot grid (`grid` token, 16 px pitch, only behind the timeline)
      under a proportional rail beside the editable rows; each block a tinted band with a 1 px
      "pen" line in its category stroke at its leading edge; a gap a dashed band with Log; a parallel
      activity a narrower band beside the main one; overlaps hatched, not red; **now = the red margin
      line** (`status.danger`, 1 px, with a dot and the time in `caption`).
- [ ] Failing tests: view-model — a 2 h gap is twice a 1 h block's length, a 15 h gap is capped at 3 h
      with `scaleBreak: true`; overlapping blocks yield `parallel`; app — the rail is
      `accessibilityElementsHidden` (the rows carry the semantics). Commit.

### Task 7.2: The running activity's ink line and the Week day strip

**Files:** `shared/tracking/running-card.tsx`, `src/features/week/day-strip.tsx`.
- [ ] Spec §2 A: under the running activity, a 2 px ink line (`accent`) from start to now with a red
      1 px mark at the expected length; past 2× the line turns `status.warn` with "Ещё занимаетесь?"
      (no continuous animation: it moves with the minute tick). Week's phone day strip uses the same
      ink/now vocabulary. Failing test: the mark sits at expected / max(expected × 2, elapsed) of the
      width; the line's colour switches at 2×. Commit.

### Task 7.3: Proposal highlight and the logo

**Files:** `shared/assistant/*` (proposal accepted highlight), `ui/logo.tsx`, `scripts/generate-icons.ts`.
- [ ] Spec §6 last row: accepted proposal → created row with a one-time `accent.quiet` highlight
      fading over 600 ms; logo chevrons in the current lime on both themes (owner, round 2; feedback-2/4).
- [ ] Commit.

---

## Batch 8 — Close-out (PR "Design overhaul 7/7: close-out")

### Task 8.1: Lint rule to error
- [ ] `pace/no-raw-design-values` → `"error"`; `bun lint` clean with zero warnings of the rule; the
      count history (Task 1.3 baseline → 0) in the PR. Commit.

### Task 8.2: Visual-regression goldens
- [ ] `e2e/visual.e2e.ts` with `toHaveScreenshot` over the subset in spec §9.4 (threshold 0.2 %);
      goldens committed under `e2e/__screenshots__/`; CI runs it in the e2e job. Commit.

### Task 8.3: README screenshots
- [ ] `README_SHOTS=docs/screenshots bun test:e2e e2e/readme-shots.e2e.ts`; review images; commit.

### Task 8.4: DESIGN.md from the shipped code
- [ ] Spawn `dev-core:impeccable-documenter` with the project root, the shipped artifact paths, the
      direction contract from the surface brief, `PRODUCT.md`, `document.md` and the owner's choice
      (overwrite the "target, not yet shipped" file written at STOP 2). Verify `DESIGN.md` and
      `.impeccable/design.json` both carry tokens. Commit.

### Task 8.5: CLAUDE.md "Design" paragraph
- [ ] Replace the plugin paragraph's Design bullet (and the `ux-superpowers` / Anthropic design
      bullets) with the owner's brief table: `dev-core:impeccable` as the only direction source
      (critique, audit native/web, polish, finish-reviewer, documenter), `dev-core:apple-design`,
      `dev-core:web-design-guidelines`, review-animations read from disk (`SKILL.md` + `STANDARDS.md`),
      `dev-core:break-ui` and `dev-core:mobile-native` invoked with target and question; no Anthropic
      `frontend-design`. `bun lint`. Commit.

### Task 8.6: Bug-lessons sweep
- [ ] Every bug in `findings.md` › Bugs has its entry (most were written in their fixing tasks;
      this task checks all 32 and adds the guard lines still missing to `docs/qa.md`'s checklist:
      colour budget, one filled accent per view, title height constant, sheets leave the way they
      came, RU at 390). Commit.

### Task 8.7: Final QA, review and verification
- [ ] Final QA rounds per `docs/qa.md` until only cosmetic findings remain.
- [ ] `superpowers:requesting-code-review` over `origin/main...<branch>` with this plan and the spec.
- [ ] `superpowers:verification-before-completion`: run `bun lint`, `bun test:unit`, `bun test:api`,
      `bun test:app`, `bun test:e2e` and show the outputs; re-shoot the full matrix and attach it.

---

## Phase C delta (spec §13)

Tasks listed in spec §13's table own the new surfaces Phase C added; each of those tasks reads its
row. Bugs found by the delta review (export file name in UTC, 09-001 IPv6 under Revoke, Wipe ignoring
Escape) get their bug-lessons entries in the task that fixes them.

## Batch sizes (rough)

| Batch | PR | Tasks | Size |
|---|---|---|---|
| 1 + 2 | 1/7 guard rails + tokens v2 | 1.1–1.4, 2.1–2.4 | L (codemod touches most app files) |
| 3 | 2/7 kit | 3.1–3.10 | XL |
| 4 | 3/7 screens | 4.1–4.13 | XL |
| 5 | 4/7 motion | 5.1–5.4 | M |
| 6 | 5/7 web/PWA | 6.1–6.4 | M |
| 7 | 6/7 identity | 7.1–7.3 | S–M |
| 8 | 7/7 close-out | 8.1–8.7 | M |

## Lint baseline

Task 1.3 (2026-11-01, after fix round 1 and the interval ruling): 437 warnings of `pace/no-raw-design-values` at introduction, by message id: `arbitraryClass` 424, `rawDuration` 12 (6 `.duration()` builders, 1 `duration:`, 1 `setTimeout`, 4 `*_MS`/`*DURATION` constants in files that import reanimated: `BREATH_MS`, `DISSOLVE_MS`, `DURATION_MS`, `SLIDE_MS`), `rawColor` 1 (a CSS colour name), `rawRadius` 0, `rawFontMetric` 0, `offScaleClass` not active yet (needs `GENERATED_CLASSES`, Task 2.2). Poll/debounce/timeout interval constants outside reanimated files are behaviour and are not counted. The count is an exact ratchet: `scripts/eslint-all.ts` fails the app part when the count is above `DESIGN_VALUE_WARNINGS` and when it is below it (lower the constant to the new number); never raise it.
