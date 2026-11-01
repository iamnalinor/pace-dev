# 00 — Design-system inventory (pre-overhaul baseline)

Snapshot of the visual system as it is in code at commit `057e484` (2026-11-01), for the full visual
overhaul. Read-only survey: nothing under `apps/`, `packages/`, `e2e/` was changed.

**Scope.** `apps/app/src/**`, `apps/app/app/**` (tests, `src/test/`, `src/testing/`, `*.fake.*`
excluded), `apps/app/global.css`, `apps/app/public/**`, `scripts/build-web.ts`, `scripts/generate-icons.ts`;
tokens from `packages/core/src/design/tokens.json` (+ `tokens.ts`).

**Method.** Class names were extracted by a script that reads every string literal (including strings
nested in `${…}` of template literals) and keeps the Tailwind-looking tokens; colours, durations, icons and
pressables were found with ripgrep and a brace-aware JSX prop parser. Scripts:
`/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/inventory/`
(`scan.py`, `tokens_sec.py`, `type_sec.py`, `space_sec.py`, `border_sec.py`, `arb_sec.py`, `press.py`,
`comp.py`, `states.py`, `text_el.py`). Totals: **350 `<Text>` elements, 1 053 class strings, 3 333 class
tokens, 63 `Pressable`s, 11 `TextInput`s, 1 `Switch`**.

**Reading the references.** `file`:line — paths are relative to `apps/app/` unless they start with
`packages/` or `scripts/`. A line is the line where the class *string* starts (a `cx()` call spread over
lines lists each string at its own line). Classes written in a lookup table (`CONTAINER`, `PROJECT_FILL`, …)
are counted once at the table, not at every call site; call sites are listed separately where it matters.

---

## 0. Platform note that changes every number below: `rem` is 14 px on Android, 16 px on the web

NativeWind 4.2.7's metro plugin defaults `inlineRem = 14`
(`node_modules/.bun/nativewind@4.2.7…/nativewind/dist/metro/index.js:14`) and `apps/app/metro.config.js:51-54`
does not override it. Tailwind 3 sizes spacing, heights/widths, `leading-<n>`, `text-sm`, `rounded`,
`rounded-2xl` in **rem** (`tracking-*` in em), while the app writes font sizes as **arbitrary px**
(`text-[13px]`). Consequences (not verified on a device in this pass — verify first):

- Every rem-based class renders at **0.875×** on Android: `h-11` = 44 px web / **38.5 dp** Android,
  `min-h-12` (Button) = 48 / **42**, `p-4` = 16 / 14, `gap-3` = 12 / 10.5, `leading-5` = 20 / 17.5,
  `rounded-2xl` = 16 / 14, `text-sm` = 14 / 12.25.
- `px` values (`text-[13px]`, `h-[22px]`, `rounded-t-[22px]`, all tokens in `radius` — they are
  compiled as `${value}px` in `tailwind.config.js:12-14`) are identical on both.
- So the **ratio of text to its container differs per platform**, and the many "44px target" comments
  (`ui/icon-button.tsx:9`, `ui/chip.tsx:33`, `ui/check-circle.tsx:21`, `ui/back-header.tsx:9`) hold on the
  web only. Every px column below gives both values where rem is involved.

---

## 1. Tokens

### 1.1 How tokens reach the screen

| Step | Where | What |
|---|---|---|
| Source | `packages/core/src/design/tokens.json` | `fonts`, `radius`, `project`, `dark`, `light` |
| Typed | `packages/core/src/design/tokens.ts` | `PaletteName` (30), `ProjectColorName` (10), `RadiusName` (5); `IMPORTANCE_COLORS` (asap→coral, prioritized→amber, normal→green, nice_to_have→slate), `STATUS_COLORS` (in_progress→blue), `inkOf()`, `TAG_TINT = 0.22` |
| Guard | `packages/core/src/design/contrast.test.ts` | text tokens ≥4.5:1 on bg/surface, marks ≥3:1 on bg/surface/raised, accentFg/accentQuietFg ≥4.5:1, ink on 22 % wash ≥4.5:1, `onColor` on solid project ≥4.5:1 |
| Tailwind | `apps/app/tailwind.config.js:5-7` | every key of `tokens.dark` → colour `<name>` = `var(--pace-<name>)` (so **`light` must mirror `dark`'s keys**) |
| | `tailwind.config.js:8-10` | `project-<name>` = **literal hex** (same in both themes, not a variable) |
| | `tailwind.config.js:11-13` | `borderRadius.<name>` = `${n}px` — **overrides Tailwind's own `sm/md/lg/xl`**; `2xl`, `DEFAULT`, `full` stay Tailwind's |
| | `tailwind.config.js:24` | `opacity: { 22: "0.22" }` (TAG_TINT) |
| | `tailwind.config.js:26` | `fontFamily.sans = [Inter, system-ui, sans-serif]` |
| Variables | `src/platform/theme.ts:44-51` | `paletteVariables(scheme)` → `{"--pace-bg": …}`; `paletteVars()` wraps in NativeWind `vars()` |
| Root | `src/ui/theme-provider.tsx:28,32` | `palette = tokens[scheme]`; root `<View className="flex-1 bg-bg" style={paletteVars(scheme)}>` |
| Re-declared (portals) | `src/ui/sheet.tsx:140`, `src/ui/tooltip.web.tsx:151` | `style={paletteVars(scheme)}` again, because Modal / `createPortal` render outside the root |
| Navigator | `app/_layout.tsx:48,69` | `contentStyle: { backgroundColor: palette.bg }`; `StatusBar` style from `scheme` (`:90`) |
| Web CSS | `apps/app/global.css` | `var(--pace-fg)` ×7, `--pace-surface` ×2, `--pace-track` ×2, `--pace-share` (slider fill, set inline in `src/ui/slider.web.tsx:36`) |
| JS colour access | `useTheme().palette.<name>` | the only JS route (no `tokens.dark.x` anywhere in the app); 86 reads, see the `palette.` column |

### 1.2 Palette tokens (`dark` / `light`) — values and every use

Columns: `bg-`/`text-`/`border-` = Tailwind class uses (incl. `active:` variants), `palette.` = JS reads
through `useTheme()`, CSS var = `var(--pace-<name>)` in `global.css`.

| token | dark | light | `bg-` | `text-` | `border-` | other class | `palette.` (JS) | CSS var | total | references |
|---|---|---|---|---|---|---|---|---|---|---|
| `bg` | `#0b0b0c` | `#eceef2` | 36 | 0 | 0 | 0 | 3 | 0 | **39** | `app/_layout.tsx`:55,69; `src/app-state.tsx`:208; `src/auth/route-gate.tsx`:35; `src/features/now/composer/composer-pane.tsx`:8; `src/features/oauth/client-card.tsx`:19; `src/features/permissions/onboarding-screen.tsx`:29,256; `src/features/permissions/onboarding-screen.web.tsx`:12; `src/features/presets/number-input.tsx`:31; `src/features/server/incompatible-screen.tsx`:27; `src/features/task/close-preview.tsx`:60; `src/features/task/subtask-checklist.tsx`:25; `src/platform/update-banner.web.tsx`:137; `src/screens/app-link-screen.web.tsx`:26; `src/screens/auth-screen.tsx`:43,61; `src/screens/crash-screen.tsx`:27; `src/screens/login-return-screen.web.tsx`:18; `src/screens/login-screen.tsx`:114; `src/screens/login-screen.web.tsx`:113; `src/screens/not-found-screen.tsx`:13; `src/screens/now-screen.tsx`:68; `src/screens/oauth-screen.web.tsx`:18; `src/shared/assistant/action-cards.tsx`:26,78; `src/shared/assistant/questions.tsx`:55; `src/shared/task-fields/date-field.tsx`:104; `src/shared/task-fields/recurrence-field.tsx`:135; `src/shared/tracking/choices-sheet.tsx`:107; `src/shared/tracking/time-bar.tsx`:260; `src/ui/check-circle.tsx`:39; `src/ui/screen.tsx`:32; `src/ui/sidebar.tsx`:162; `src/ui/split-pane.tsx`:20; `src/ui/tab-bar.tsx`:95; `src/ui/text-field.tsx`:29; `src/ui/theme-provider.tsx`:32; `src/ui/time-input.tsx`:32 |
| `surface` | `#141416` | `#ffffff` | 40 | 0 | 0 | 0 | 2 | 2 | **44** | (see per-file table below) |
| `raised` | `#1c1c1f` | `#e1e3e9` | 15 | 0 | 0 | 0 | 0 | 0 | **15** | `src/features/insights/patterns.tsx`:87; `src/features/oauth/client-card.tsx`:14; `src/features/presets/presets-list.tsx`:35; `src/features/projects/color-swatches.tsx`:34; `src/features/server/change-server-sheet.tsx`:54; `src/features/sessions/code-text.tsx`:13; `src/features/sessions/session-row.tsx`:60; `src/features/task/project-sheet.tsx`:37; `src/screens/login-parts.tsx`:52; `src/shared/assistant/questions.tsx`:55; `src/shared/task-row.tsx`:71; `src/ui/chip.tsx`:17; `src/ui/color.tsx`:83; `src/ui/icon-button.tsx`:37; `src/ui/sidebar.tsx`:116 |
| `line` | `rgba(255, 255, 255, 0.1)` | `rgba(0, 0, 0, 0.13)` | 1 | 0 | 91 | 0 | 0 | 0 | **92** | (see per-file table below) |
| `track` | `rgba(255, 255, 255, 0.12)` | `rgba(0, 0, 0, 0.12)` | 11 | 0 | 0 | 0 | 0 | 2 | **13** | `global.css`:86,93; `src/features/insights/insights-screen.tsx`:50; `src/features/insights/patterns.tsx`:101; `src/features/task/task-summary.tsx`:99; `src/shared/tracking/choices-sheet.tsx`:134; `src/shared/tracking/running-row.tsx`:55; `src/ui/color.tsx`:98; `src/ui/progress-bar.tsx`:25; `src/ui/skeleton.tsx`:40,44,50; `src/ui/slider.tsx`:67 |
| `fg` | `#ececee` | `#17181c` | 4 | 115 | 8 | 0 | 9 | 7 | **143** | (see per-file table below) |
| `fg2` | `#b4b4bb` | `#3c3e46` | 1 | 52 | 0 | 0 | 16 | 0 | **69** | (see per-file table below) |
| `muted` | `#8a8a93` | `#5c5e66` | 1 | 152 | 6 | 0 | 28 | 0 | **187** | (see per-file table below) |
| `faint` | `#7d7d86` | `#6f717a` | 1 | 3 | 0 | 0 | 9 | 0 | **13** | `src/features/insights/insights-screen.tsx`:52; `src/features/now/composer/quick-line.tsx`:115; `src/features/presets/override-row.tsx`:52; `src/features/presets/presets-list.tsx`:75; `src/features/settings/settings-links.tsx`:32; `src/features/task/task-summary.tsx`:69; `src/screens/decisions-screen.tsx`:78; `src/screens/more-screen.tsx`:51; `src/ui/calendar.tsx`:35; `src/ui/logo.tsx`:17; `src/ui/sheet.tsx`:55; `src/ui/text-field.tsx`:34; `src/ui/time-input.tsx`:48 |
| `accent` | `#d4ff3a` | `#c5f23a` | 6 | 0 | 0 | 0 | 0 | 0 | **6** | `src/features/now/composer/quick-line.tsx`:105; `src/features/task/task-description.tsx`:48; `src/shared/assistant/action-cards.tsx`:118; `src/shared/tracking/time-bar.tsx`:103; `src/ui/button.tsx`:19; `src/ui/sidebar.tsx`:180 |
| `accentFg` | `#0b0b0c` | `#0b0b0c` | 0 | 5 | 0 | 0 | 5 | 0 | **10** | `src/features/now/composer/quick-line.tsx`:95; `src/features/task/task-description.tsx`:52; `src/shared/assistant/action-cards.tsx`:124; `src/shared/tracking/time-bar.tsx`:109; `src/ui/button.tsx`:26,33,61; `src/ui/sidebar.tsx`:183,184 |
| `accentText` | `#d4ff3a` | `#4d6b00` | 0 | 1 | 0 | 0 | 1 | 0 | **2** | `src/ui/logo.tsx`:25; `src/ui/toast.tsx`:147 |
| `accentQuiet` | `#4263eb` | `#3b5bdb` | 10 | 0 | 4 | 0 | 2 | 0 | **16** | `src/features/now/composer/composer.tsx`:103; `src/features/oauth/scope-list.tsx`:43; `src/features/sessions/os-picker.tsx`:97,105; `src/features/week/week-grid.tsx`:138; `src/features/week/week-screen.tsx`:51; `src/platform/update-banner.web.tsx`:81; `src/shared/activity-usage.tsx`:31; `src/shared/tracking/time-bar.tsx`:133; `src/shared/user-avatar.tsx`:28; `src/ui/calendar.tsx`:66; `src/ui/count-badge.tsx`:10; `src/ui/switch-row.tsx`:25 |
| `accentQuietFg` | `#ffffff` | `#ffffff` | 1 | 8 | 0 | 0 | 8 | 0 | **17** | `src/features/oauth/scope-list.tsx`:46; `src/features/sessions/os-picker.tsx`:106,112; `src/features/week/week-grid.tsx`:138; `src/features/week/week-screen.tsx`:58; `src/platform/update-banner.web.tsx`:93,108,109,112; `src/shared/tracking/time-bar.tsx`:135,174; `src/shared/user-avatar.tsx`:32; `src/ui/calendar.tsx`:33,82; `src/ui/count-badge.tsx`:13; `src/ui/switch-row.tsx`:18,24 |
| `accentQuietText` | `#91a7ff` | `#3b5bdb` | 2 | 9 | 2 | 0 | 2 | 0 | **15** | `src/features/day/activity-task-field.tsx`:111; `src/features/day/day-screen.tsx`:109,178; `src/features/notifications/notifications-screen.tsx`:80; `src/features/server/server-line.tsx`:31; `src/features/week/picked-details.tsx`:92; `src/features/week/week-grid.tsx`:132,138; `src/shared/activity-usage.tsx`:143; `src/shared/back-to-today.tsx`:27; `src/ui/calendar.tsx`:82; `src/ui/progress-bar.tsx`:30; `src/ui/sidebar.tsx`:121; `src/ui/tab-bar.tsx`:64,75 |
| `onColor` | `#0b0b0c` | `#0b0b0c` | 0 | 2 | 0 | 0 | 0 | 0 | **2** | `src/features/week/week-grid.tsx`:134; `src/ui/chip.tsx`:26 |
| `warn` | `#ff8a5c` | `#b8441a` | 2 | 27 | 5 | 0 | 1 | 0 | **35** | `src/auth/telegram-widget.web.tsx`:105; `src/features/now/composer/composer.tsx`:75; `src/features/oauth/client-card.tsx`:40; `src/features/oauth/consent-flow.tsx`:78,140; `src/features/presets/number-input.tsx`:32; `src/features/presets/override-row.tsx`:55; `src/features/presets/preset-form.tsx`:210; `src/features/projects/project-form.tsx`:71; `src/features/sessions/computer-steps.tsx`:87; `src/features/sessions/sessions-section.tsx`:102; `src/features/settings/delete-account.tsx`:197,251,256; `src/features/settings/timezone-row.tsx`:33; `src/features/task/when-picker.tsx`:46; `src/features/week/week-grid.tsx`:264; `src/screens/app-link-screen.web.tsx`:30; `src/screens/decisions-screen.tsx`:22; `src/screens/login-screen.tsx`:48,126; `src/screens/login-screen.web.tsx`:127; `src/shared/assistant/action-cards.tsx`:32; `src/shared/meta-line.tsx`:18; `src/shared/task-fields/estimate-field.tsx`:73; `src/shared/task-fields/form-alert.tsx`:8; `src/shared/tracking/running-row.tsx`:52,59; `src/shared/tracking/time-bar.tsx`:77; `src/ui/button.tsx`:17,24,31,63; `src/ui/text-field.tsx`:31,40 |
| `question` | `#f2c14e` | `#7a5e00` | 0 | 2 | 0 | 0 | 0 | 0 | **2** | `src/features/presets/recurrence-row.tsx`:93; `src/shared/assistant/questions.tsx`:28 |
| `inverse` | `#ececee` | `#17181c` | 2 | 0 | 0 | 0 | 0 | 0 | **2** | `src/ui/tooltip.tsx`:33; `src/ui/tooltip.web.tsx`:153 |
| `inverseFg` | `#0b0b0c` | `#ffffff` | 0 | 2 | 0 | 0 | 0 | 0 | **2** | `src/ui/tooltip.tsx`:34; `src/ui/tooltip.web.tsx`:155 |
| `ink-blue` | `#7aa2ff` | `#2950c4` | 0 | 1 | 1 | 0 | 0 | 0 | **2** | `src/ui/color.tsx`:57,70 |
| `ink-violet` | `#b49cff` | `#5f42c9` | 0 | 1 | 1 | 0 | 0 | 0 | **2** | `src/ui/color.tsx`:64,77 |
| `ink-green` | `#6fd49a` | `#1b6e42` | 0 | 1 | 1 | 0 | 0 | 0 | **2** | `src/ui/color.tsx`:59,72 |
| `ink-amber` | `#f2c14e` | `#7a5800` | 0 | 1 | 1 | 0 | 0 | 0 | **2** | `src/ui/color.tsx`:56,69 |
| `ink-coral` | `#ff8a8a` | `#a11d1d` | 0 | 1 | 1 | 0 | 0 | 0 | **2** | `src/ui/color.tsx`:58,71 |
| `ink-pink` | `#ff8ac8` | `#a12a66` | 0 | 1 | 1 | 0 | 0 | 0 | **2** | `src/ui/color.tsx`:61,74 |
| `ink-teal` | `#5fd6d0` | `#0d6b66` | 0 | 1 | 1 | 0 | 0 | 0 | **2** | `src/ui/color.tsx`:63,76 |
| `ink-slate` | `#9aa4b8` | `#495366` | 0 | 1 | 2 | 0 | 0 | 0 | **3** | `src/features/week/week-grid.tsx`:139; `src/ui/color.tsx`:62,75 |
| `ink-orange` | `#ff7a45` | `#963807` | 0 | 1 | 1 | 0 | 0 | 0 | **2** | `src/ui/color.tsx`:60,73 |
| `ink-yellow` | `#e2cf55` | `#6a5d00` | 0 | 1 | 1 | 0 | 0 | 0 | **2** | `src/ui/color.tsx`:65,78 |

UNUSED: []

- **`surface`** (44): `global.css`:109,117; `src/features/day/activity-task-field.tsx`:51; `src/features/insights/card.tsx`:15; `src/features/now/calendar-prompt.tsx`:28; `src/features/now/composer/composer.tsx`:102; `src/features/now/now-task-groups.tsx`:26; `src/features/oauth/consent-flow.tsx`:126; `src/features/presets/preset-form.tsx`:43,119; `src/features/presets/preset-sections.tsx`:26; `src/features/presets/presets-list.tsx`:102; `src/features/projects/project-form.tsx`:44; `src/features/sessions/os-picker.tsx`:97,105; `src/features/settings/delete-account.tsx`:197; `src/features/task/source-text.tsx`:35; `src/features/task/task-description.tsx`:27; `src/features/task/task-summary.tsx`:190; `src/features/task/work-progress.tsx`:61; `src/screens/app-link-screen.web.tsx`:27; `src/screens/decisions-screen.tsx`:124; `src/screens/inbox-card.tsx`:41; `src/screens/login-parts.tsx`:45; `src/screens/login-return-screen.web.tsx`:19; `src/screens/login-screen.web.tsx`:114; `src/screens/project-screen.tsx`:85; `src/screens/review-card.tsx`:18; `src/shared/assistant/action-cards.tsx`:165; `src/shared/notifications/notification-bell.tsx`:35; `src/shared/tracking/choice-row.tsx`:45; `src/shared/tracking/time-bar.tsx`:84,139,141; `src/shared/zone-banner.tsx`:22; `src/ui/button.tsx`:17,20; `src/ui/chip.tsx`:17,21; `src/ui/icon-button.tsx`:36; `src/ui/sheet.tsx`:155; `src/ui/slider.tsx`:72; `src/ui/switch-row.tsx`:24; `src/ui/toast.tsx`:125
- **`line`** (92): `src/features/day/activity-task-field.tsx`:51; `src/features/day/day-screen.tsx`:199,267; `src/features/day/phone-section.tsx`:198; `src/features/insights/card.tsx`:15; `src/features/insights/patterns.tsx`:48; `src/features/notifications/notifications-screen.tsx`:150; `src/features/now/calendar-prompt.tsx`:28; `src/features/now/composer/composer.tsx`:103; `src/features/now/now-task-groups.tsx`:26,27; `src/features/oauth/client-card.tsx`:14; `src/features/oauth/consent-flow.tsx`:126; `src/features/oauth/dev-identity.tsx`:20; `src/features/oauth/scope-list.tsx`:34; `src/features/permissions/permission-card.tsx`:130; `src/features/permissions/permissions-screen.tsx`:37; `src/features/presets/number-input.tsx`:32; `src/features/presets/override-row.tsx`:34; `src/features/presets/preset-form.tsx`:43,119; `src/features/presets/preset-preview.tsx`:24; `src/features/presets/preset-sections.tsx`:26; `src/features/presets/presets-list.tsx`:62,102; `src/features/projects/project-form.tsx`:44; `src/features/server/change-server-sheet.tsx`:54; `src/features/sessions/code-text.tsx`:13; `src/features/sessions/os-picker.tsx`:97; `src/features/settings/category-estimates.tsx`:22; `src/features/settings/settings-links.tsx`:23; `src/features/task/project-sheet.tsx`:37; `src/features/task/subtask-checklist.tsx`:54; `src/features/task/task-description.tsx`:27; `src/features/task/task-footer.tsx`:57,69; `src/features/task/task-summary.tsx`:190; `src/features/task/work-progress.tsx`:61; `src/features/week/week-grid.tsx`:250,255; `src/screens/app-link-screen.web.tsx`:27; `src/screens/decisions-screen.tsx`:63,70,124; `src/screens/history-screen.tsx`:47; `src/screens/inbox-card.tsx`:41; `src/screens/login-parts.tsx`:45; `src/screens/login-return-screen.web.tsx`:19; `src/screens/login-screen.web.tsx`:114; `src/screens/more-screen.tsx`:44,76; `src/screens/now-screen.tsx`:69; `src/screens/project-screen.tsx`:85; `src/screens/projects-screen.tsx`:25; `src/screens/review-card.tsx`:18; `src/screens/settings-screen.tsx`:37; `src/shared/activity-usage.tsx`:30,72,111; `src/shared/assistant/action-cards.tsx`:26,78,89,131,165; `src/shared/assistant/questions.tsx`:55; `src/shared/notifications/notification-bell.tsx`:35; `src/shared/task-fields/date-field.tsx`:104; `src/shared/task-fields/estimate-field.tsx`:73; `src/shared/task-fields/recurrence-field.tsx`:135; `src/shared/task-list.tsx`:132; `src/shared/tracking/choice-row.tsx`:45; `src/shared/tracking/choices-sheet.tsx`:107; `src/shared/tracking/running-row.tsx`:69,93; `src/shared/tracking/time-bar-fold.tsx`:61; `src/shared/tracking/time-bar.tsx`:84,139,260; `src/shared/zone-banner.tsx`:22; `src/ui/button.tsx`:20; `src/ui/chip.tsx`:17; `src/ui/icon-button.tsx`:36; `src/ui/sheet.tsx`:157,158,174,181; `src/ui/sidebar.tsx`:162; `src/ui/split-pane.tsx`:21; `src/ui/tab-bar.tsx`:95; `src/ui/text-field.tsx`:31; `src/ui/time-input.tsx`:32; `src/ui/toast.tsx`:125
- **`fg`** (143): `global.css`:54,64,85,99,107,115,121; `src/features/day/activity-task-field.tsx`:56,112; `src/features/day/day-screen.tsx`:98,109,281; `src/features/day/phone-section.tsx`:55,202,306; `src/features/insights/card.tsx`:18; `src/features/insights/insights-screen.tsx`:56,69,104; `src/features/insights/patterns.tsx`:92,130,136; `src/features/notifications/answers.tsx`:19; `src/features/notifications/notifications-screen.tsx`:63; `src/features/now/calendar-prompt.tsx`:32; `src/features/now/composer/ai-status.tsx`:45,81,94; `src/features/now/composer/composer-form.tsx`:126; `src/features/now/composer/quick-line.tsx`:155; `src/features/oauth/client-card.tsx`:26; `src/features/oauth/consent-flow.tsx`:129,134; `src/features/oauth/scope-list.tsx`:48; `src/features/permissions/onboarding-screen.tsx`:60,134,154,165; `src/features/permissions/onboarding-screen.web.tsx`:14; `src/features/permissions/permission-card.tsx`:15,72; `src/features/permissions/permissions-screen.tsx`:45; `src/features/presets/number-input.tsx`:31; `src/features/presets/preset-form.tsx`:124; `src/features/presets/preset-preview.tsx`:35; `src/features/projects/color-swatches.tsx`:45; `src/features/server/change-server-sheet.tsx`:44; `src/features/server/incompatible-screen.tsx`:31; `src/features/sessions/code-text.tsx`:13; `src/features/sessions/computer-steps.tsx`:16; `src/features/sessions/connect-ai-sheet.tsx`:44,67; `src/features/sessions/session-row.tsx`:65,106; `src/features/settings/category-estimates.tsx`:24; `src/features/settings/delete-account.tsx`:202; `src/features/settings/notification-settings.tsx`:49; `src/features/settings/settings-links.tsx`:29; `src/features/settings/timezone-row.tsx`:24; `src/features/task/close-preview.tsx`:29,30; `src/features/task/project-sheet.tsx`:37,47,50; `src/features/task/source-text.tsx`:35; `src/features/task/subtask-checklist.tsx`:21,71; `src/features/task/task-summary.tsx`:68,173; `src/features/task/when-picker.tsx`:87; `src/features/task/work-progress.tsx`:63,64; `src/features/week/picked-details.tsx`:90,202,280; `src/features/week/week-grid.tsx`:244; `src/screens/auth-screen.tsx`:44; `src/screens/crash-screen.tsx`:28; `src/screens/decisions-screen.tsx`:37,39,124; `src/screens/history-screen.tsx`:50,95; `src/screens/inbox-card.tsx`:42; `src/screens/login-parts.tsx`:52,83; `src/screens/login-screen.tsx`:45; `src/screens/more-screen.tsx`:50,60; `src/screens/not-found-screen.tsx`:14; `src/screens/project-screen.tsx`:27; `src/screens/projects-screen.tsx`:30,31; `src/screens/review-card.tsx`:19; `src/shared/activity-usage.tsx`:20,73,113; `src/shared/assistant/action-cards.tsx`:29,78,93,137; `src/shared/assistant/questions.tsx`:55,58; `src/shared/meta-line.tsx`:17; `src/shared/task-fields/estimate-field.tsx`:72; `src/shared/task-fields/subtask-list.tsx`:53,125; `src/shared/task-row.tsx`:27; `src/shared/tracking/choice-row.tsx`:49,57; `src/shared/tracking/choices-sheet.tsx`:112,137,138; `src/shared/tracking/running-row.tsx`:24,75,99,100; `src/shared/tracking/time-bar.tsx`:84; `src/ui/back-header.tsx`:51; `src/ui/button.tsx`:27,63; `src/ui/calendar.tsx`:35,67,128; `src/ui/check-circle.tsx`:35; `src/ui/chip.tsx`:17,26; `src/ui/icon-button.tsx`:43; `src/ui/logo.tsx`:30,48; `src/ui/progress-bar.tsx`:27; `src/ui/screen-header.tsx`:55; `src/ui/sheet.tsx`:76; `src/ui/sidebar.tsx`:128,167; `src/ui/slider.tsx`:68,72; `src/ui/switch-row.tsx`:47; `src/ui/text-field.tsx`:29; `src/ui/time-input.tsx`:32; `src/ui/toast.tsx`:133
- **`fg2`** (69): `src/features/day/day-screen.tsx`:143,202,203; `src/features/insights/insights-screen.tsx`:47,66; `src/features/insights/patterns.tsx`:42,91,122,123,127; `src/features/now/composer/quick-line.tsx`:95; `src/features/now/now-task-groups.tsx`:28,43; `src/features/oauth/client-card.tsx`:36; `src/features/oauth/consent-flow.tsx`:32,145; `src/features/permissions/onboarding-screen.tsx`:63,157; `src/features/permissions/onboarding-screen.web.tsx`:17; `src/features/permissions/permission-card.tsx`:16; `src/features/permissions/permissions-screen.web.tsx`:11; `src/features/presets/override-row.tsx`:36; `src/features/presets/presets-list.tsx`:35; `src/features/server/incompatible-screen.tsx`:34; `src/features/sessions/connect-ai-sheet.tsx`:70; `src/features/sessions/os-picker.tsx`:106,112; `src/features/sessions/session-row.tsx`:62; `src/features/settings/delete-account.tsx`:226; `src/features/task/source-text.tsx`:26; `src/features/task/task-description.tsx`:44,118; `src/features/task/task-header.tsx`:126; `src/features/task/task-summary.tsx`:106,180; `src/features/task/when-picker.tsx`:87; `src/features/week/week-grid.tsx`:93,139; `src/features/week/week-screen.tsx`:58; `src/screens/crash-screen.tsx`:31; `src/screens/decisions-screen.tsx`:22; `src/screens/login-return-screen.web.tsx`:21; `src/screens/project-screen.tsx`:26,134; `src/screens/projects-screen.tsx`:85; `src/screens/review-card.tsx`:22; `src/shared/activity-usage.tsx`:26,116,126; `src/shared/assistant/action-cards.tsx`:32; `src/shared/assistant/questions.tsx`:80,81; `src/shared/notifications/notification-bell.tsx`:41; `src/shared/task-fields/date-field.tsx`:66; `src/shared/task-fields/estimate-field.tsx`:42; `src/shared/task-list.tsx`:137; `src/shared/task-row.tsx`:27,70; `src/shared/tracking/time-bar-fold.tsx`:64,65; `src/shared/tracking/time-bar.tsx`:157; `src/shared/zone-banner.tsx`:24; `src/ui/back-header.tsx`:40; `src/ui/button.tsx`:25; `src/ui/chip.tsx`:28; `src/ui/color.tsx`:87; `src/ui/icon-button.tsx`:43; `src/ui/screen-header.tsx`:44; `src/ui/sidebar.tsx`:128
- **`muted`** (187): `src/auth/telegram-widget.web.tsx`:110,114; `src/features/day/activity-sheet.tsx`:58; `src/features/day/activity-task-field.tsx`:46,59,82; `src/features/day/day-screen.tsx`:93,115,118,172,175,323; `src/features/day/phone-section.tsx`:103,199,208,296; `src/features/insights/insights-screen.tsx`:120; `src/features/insights/patterns.tsx`:64; `src/features/notifications/answers.tsx`:19; `src/features/notifications/notifications-screen.tsx`:64,158,168,210,233; `src/features/now/calendar-prompt.tsx`:33; `src/features/now/composer/ai-status.tsx`:39,88; `src/features/now/composer/composer-form.tsx`:147; `src/features/now/composer/quick-line.tsx`:155,184; `src/features/now/now-task-groups.tsx`:30,47,49; `src/features/oauth/client-card.tsx`:29; `src/features/oauth/consent-flow.tsx`:39,137; `src/features/oauth/dev-identity.tsx`:21; `src/features/oauth/scope-list.tsx`:25,43; `src/features/permissions/onboarding-screen.tsx`:119,124,132,133; `src/features/permissions/permission-card.tsx`:23,72; `src/features/permissions/permissions-screen.tsx`:40,71; `src/features/presets/deadline-row.tsx`:93,103; `src/features/presets/number-input.tsx`:43; `src/features/presets/override-row.tsx`:37; `src/features/presets/preset-form.tsx`:64; `src/features/presets/preset-preview.tsx`:27,31; `src/features/presets/preset-sections.tsx`:31; `src/features/presets/presets-list.tsx`:35,103; `src/features/presets/recurrence-row.tsx`:43,53; `src/features/server/change-server-sheet.tsx`:43; `src/features/server/incompatible-screen.tsx`:37; `src/features/server/server-line.tsx`:28; `src/features/sessions/computer-steps.tsx`:17; `src/features/sessions/connect-ai-sheet.tsx`:46,73; `src/features/sessions/session-row.tsx`:69; `src/features/sessions/sessions-section.tsx`:50,127; `src/features/settings/category-estimates.tsx`:18; `src/features/settings/notification-settings.tsx`:34,39,149,152,157,175,217,229; `src/features/settings/settings-links.tsx`:30; `src/features/settings/timezone-row.tsx`:28; `src/features/task/close-preview.tsx`:25; `src/features/task/close-sheet.tsx`:101; `src/features/task/give-up-fields.tsx`:43; `src/features/task/project-sheet.tsx`:44; `src/features/task/source-text.tsx`:28,30; `src/features/task/subtask-checklist.tsx`:21,67,71,74,90,93; `src/features/task/task-description.tsx`:119,124; `src/features/task/task-footer.tsx`:58; `src/features/task/task-header.tsx`:133; `src/features/task/task-summary.tsx`:67; `src/features/task/when-picker.tsx`:42,71; `src/features/week/picked-details.tsx`:83,119,266,283; `src/features/week/week-grid.tsx`:68,244; `src/features/week/week-screen.tsx`:116; `src/screens/app-link-screen.web.tsx`:43; `src/screens/auth-screen.tsx`:63; `src/screens/crash-screen.tsx`:34,38; `src/screens/decisions-screen.tsx`:51,130,137,140; `src/screens/history-screen.tsx`:54,62,169,185,189; `src/screens/inbox-card.tsx`:43; `src/screens/inbox-screen.tsx`:24,30; `src/screens/login-parts.tsx`:46,84; `src/screens/login-return-screen.web.tsx`:31; `src/screens/login-screen.tsx`:117; `src/screens/login-screen.web.tsx`:117; `src/screens/more-screen.tsx`:49; `src/screens/not-found-screen.tsx`:17; `src/screens/now-screen.tsx`:27; `src/screens/presets-screen.tsx`:12; `src/screens/review-card.tsx`:23; `src/screens/settings-screen.tsx`:40; `src/shared/activity-usage.tsx`:23,77,82,121,149; `src/shared/assistant/action-cards.tsx`:83,167; `src/shared/assistant/questions.tsx`:152; `src/shared/meta-line.tsx`:31,68; `src/shared/task-fields/date-field.tsx`:116,129; `src/shared/task-fields/deadline-policy-field.tsx`:61,106,182; `src/shared/task-fields/estimate-field.tsx`:82; `src/shared/task-fields/form-alert.tsx`:15; `src/shared/task-fields/option-row.tsx`:14; `src/shared/task-fields/recurrence-field.tsx`:174; `src/shared/task-fields/subtask-list.tsx`:19,53,57,73,109,110,147,186; `src/shared/task-list.tsx`:138; `src/shared/tracking/choice-row.tsx`:55,84; `src/shared/tracking/choices-sheet.tsx`:108,115; `src/shared/tracking/running-row.tsx`:28,33; `src/shared/tracking/time-bar.tsx`:72,93,139,157; `src/shared/where-sat-line.tsx`:31; `src/ui/button.tsx`:32,34; `src/ui/calendar.tsx`:145; `src/ui/check-circle.tsx`:35; `src/ui/empty-state.tsx`:15; `src/ui/screen-header.tsx`:49; `src/ui/sheet.tsx`:80; `src/ui/sidebar.tsx`:121,170; `src/ui/switch-row.tsx`:25,49; `src/ui/tab-bar.tsx`:64,75; `src/ui/text-field.tsx`:25,44

Observations on the palette:

- **No palette token is unused**, but 7 are used only once or twice outside lookup tables:
  `accentText` (2: `ui/logo.tsx:25` stroke, `ui/toast.tsx:147` action label — the dark theme's lime
  link colour appears nowhere else), `onColor` (2), `question` (2), `inverse`/`inverseFg` (2 each, both
  the tooltip bubble), and the ten `ink-*` (each used only in `ui/color.tsx` maps `OUTLINE` :55-66 and
  `INK` :68-79; `ink-slate` also `features/week/week-grid.tsx:139`).
- **Duplicated values** (one value, several names): dark `accent` = `accentText` = `#d4ff3a`; dark
  `accentFg` = `onColor` = `bg` = `#0b0b0c` (light `accentFg` = `onColor` = `#0b0b0c` too, but light
  `bg` differs); `accentQuietFg` = `#ffffff` in both themes; light `accentQuiet` = `accentQuietText` =
  `#3b5bdb`; dark `inverse` = `fg`; dark `question` = `project.amber` = `ink-amber` = `#f2c14e`; dark
  `ink-*` = `project.*` for 9 of 10 colours (coral differs: `#ff8a8a` vs `#ff6b6b`).
- **Near-duplicates**: dark `muted #8a8a93` vs `faint #7d7d86` (≈5 % luminance apart); light `muted
  #5c5e66` vs `faint #6f717a`. Both are used for icons and placeholders interchangeably (§5, §7).
- `line` is used as a **fill** once — `shared/activity-usage.tsx:30` `bg-line` as a progress track — while
  every other track uses `bg-track` (11×).
- The sheet grab handle reads `palette.faint` into an inline `backgroundColor` (`ui/sheet.tsx:55`) instead
  of the class `bg-faint` that exists (`features/insights/insights-screen.tsx:52`).
- `accentQuietFg` gets **hex-alpha suffixes** appended in JS: `${palette.accentQuietFg}1a` (10 %) and
  `${palette.accentQuietFg}66` (40 %) (`src/platform/update-banner.web.tsx:108-109`) — only valid because
  the token is a 6-digit hex; it would break for an `rgba()` token.

### 1.3 Project colours (`project.*`) — same hex in both themes

| token | value (both themes) | dark `ink-` | light `ink-` | roles in `@pace/core` |
|---|---|---|---|---|
| `blue` | `#7aa2ff` | `#7aa2ff` | `#2950c4` | STATUS in_progress; default for a new project (`screens/projects-screen.tsx:38`) |
| `violet` | `#b49cff` | `#b49cff` | `#5f42c9` | — |
| `green` | `#6fd49a` | `#6fd49a` | `#1b6e42` | IMPORTANCE normal; permission "on" (`features/permissions/permission-card.tsx:24`) |
| `amber` | `#f2c14e` | `#f2c14e` | `#7a5800` | IMPORTANCE prioritized |
| `coral` | `#ff6b6b` | `#ff8a8a` | `#a11d1d` | IMPORTANCE asap; permission "blocked" (`permission-card.tsx:22`) |
| `pink` | `#ff8ac8` | `#ff8ac8` | `#a12a66` | — |
| `teal` | `#5fd6d0` | `#5fd6d0` | `#0d6b66` | — |
| `slate` | `#9aa4b8` | `#9aa4b8` | `#495366` | IMPORTANCE nice_to_have; week calendar events (`features/week/week-grid.tsx:139`) |
| `orange` | `#ff7a45` | `#ff7a45` | `#963807` | — |
| `yellow` | `#e2cf55` | `#e2cf55` | `#6a5d00` | — |

All ten are reachable (a user picks any of them in `features/projects/color-swatches.tsx:44`). Every class
lives in one static map in `src/ui/color.tsx` (NativeWind can only compile literal class names):

| map | classes | opacity modifier | lines | consumers (call sites) |
|---|---|---|---|---|
| `PROJECT_FILL` | `bg-project-<c>` ×10 | — | `ui/color.tsx:12-23` | `ui/chip.tsx:20`; `features/insights/patterns.tsx:19,20`; `features/insights/insights-screen.tsx:52`; `features/task/project-sheet.tsx:44`; `features/projects/color-swatches.tsx:44`; `features/week/week-grid.tsx:131`; `shared/tracking/running-row.tsx:22,59` |
| `WASH` | `bg-project-<c>/22` ×10 | `/22` = `TAG_TINT` (`tailwind.config.js:24`) | `ui/color.tsx:25-36` | `ColorTag` (`ui/color.tsx:98`), `washClass()` |
| `EDGE` | `border-project-<c>/45` ×10 | `/45` (Tailwind default step) | `ui/color.tsx:38-49` | `washClass()` only |
| `OUTLINE` | `border-ink-<c>` ×10 | — | `ui/color.tsx:55-66` | `ui/chip.tsx:20-21`; `shared/tracking/time-bar.tsx:141` |
| `INK` | `text-ink-<c>` ×10 | — | `ui/color.tsx:68-79` | `inkClass()` |
| `washClass(c)` | WASH + EDGE, else `bg-raised` | | `ui/color.tsx:82-83` | `screens/project-screen.tsx:85`; `screens/projects-screen.tsx:73`; `features/task/task-summary.tsx:88,99`; `features/day/phone-section.tsx:49` |
| `inkClass(c)` | INK, else `text-fg2` | | `ui/color.tsx:86-87` | `ui/chip.tsx:28`; `screens/projects-screen.tsx:81`; `features/task/task-summary.tsx:89,106`; `features/task/task-header.tsx:126`; `features/permissions/permission-card.tsx:22,24`; `features/day/phone-section.tsx:52`; `shared/tracking/time-bar.tsx:143` |
| `ColorTag` | WASH or `bg-track` + `inkClass` | | `ui/color.tsx:90-107` | `features/presets/presets-list.tsx:71`; `features/day/day-screen.tsx:96,285`; `shared/meta-line.tsx:60,62`; `shared/tracking/running-row.tsx:23` |

Other opacity modifiers: `bg-black/55` (sheet backdrop, `ui/sheet.tsx:43`) — the only colour class that is
not a token.

### 1.4 Radius (`radius.*`) and every radius class

| token | px (both platforms) | class |
|---|---|---|
| `sm` | 8 | `rounded-sm` |
| `md` | 10 | `rounded-md` |
| `lg` | 12 | `rounded-lg` |
| `xl` | 14 | `rounded-xl` |
| `pill` | 999 | `rounded-pill` |

| class | px | count | references |
|---|---|---|---|
| `rounded-lg` | 12 (token lg) | 36 | `src/features/day/activity-task-field.tsx`:51,105; `src/features/insights/patterns.tsx`:87; `src/features/oauth/client-card.tsx`:14; `src/features/oauth/dev-identity.tsx`:20; `src/features/presets/number-input.tsx`:31; `src/features/server/change-server-sheet.tsx`:54; `src/features/sessions/code-text.tsx`:13; `src/features/sessions/os-picker.tsx`:96; `src/features/task/close-preview.tsx`:60; `src/features/task/project-sheet.tsx`:36; `src/features/task/source-text.tsx`:35; `src/features/task/task-description.tsx`:40,48,109; `src/screens/decisions-screen.tsx`:124; `src/screens/projects-screen.tsx`:25; `src/shared/assistant/action-cards.tsx`:26,78,89,118,131; `src/shared/task-row.tsx`:71; `src/shared/tracking/choice-row.tsx`:45; `src/shared/tracking/choices-sheet.tsx`:107,134; `src/shared/tracking/running-row.tsx`:69,93; `src/shared/tracking/time-bar-fold.tsx`:61; `src/shared/tracking/time-bar.tsx`:84,103; `src/ui/calendar.tsx`:65; `src/ui/sidebar.tsx`:115,180; `src/ui/text-field.tsx`:29; `src/ui/time-input.tsx`:32 |
| `rounded-xl` | 14 (token xl) | 27 | `src/features/day/phone-section.tsx`:49; `src/features/insights/card.tsx`:15; `src/features/now/calendar-prompt.tsx`:28; `src/features/now/composer/composer.tsx`:102; `src/features/now/now-task-groups.tsx`:26; `src/features/oauth/consent-flow.tsx`:126; `src/features/presets/preset-form.tsx`:43,119; `src/features/presets/preset-preview.tsx`:24; `src/features/presets/preset-sections.tsx`:26; `src/features/presets/presets-list.tsx`:102; `src/features/projects/project-form.tsx`:44; `src/features/settings/delete-account.tsx`:197; `src/features/task/task-description.tsx`:27; `src/features/task/task-summary.tsx`:190; `src/features/task/work-progress.tsx`:61; `src/screens/inbox-card.tsx`:41; `src/screens/login-parts.tsx`:45; `src/screens/project-screen.tsx`:84; `src/screens/projects-screen.tsx`:72; `src/screens/review-card.tsx`:18; `src/shared/assistant/action-cards.tsx`:165; `src/shared/task-fields/date-field.tsx`:104; `src/shared/task-fields/recurrence-field.tsx`:135; `src/shared/tracking/time-bar.tsx`:167; `src/shared/zone-banner.tsx`:22; `src/ui/toast.tsx`:125 |
| `rounded-full` | 9999 (TW default) | 23 | `src/features/now/composer/quick-line.tsx`:104; `src/features/presets/preset-preview.tsx`:31; `src/features/projects/color-swatches.tsx`:33,43; `src/features/sessions/session-row.tsx`:60; `src/features/task/subtask-checklist.tsx`:20; `src/shared/activity-usage.tsx`:30,31; `src/shared/task-fields/subtask-list.tsx`:19; `src/shared/tracking/running-row.tsx`:55,58; `src/shared/user-avatar.tsx`:28; `src/ui/calendar.tsx`:81; `src/ui/check-circle.tsx`:28,34; `src/ui/count-badge.tsx`:10; `src/ui/pulse-dot.tsx`:29; `src/ui/skeleton.tsx`:40,44,50; `src/ui/slider.tsx`:67,68,72 |
| `rounded-md` | 10 (token md) | 16 | `src/features/now/composer/composer-form.tsx`:144; `src/features/oauth/client-card.tsx`:19; `src/features/oauth/scope-list.tsx`:34; `src/features/week/week-grid.tsx`:173; `src/features/week/week-screen.tsx`:50; `src/platform/update-banner.web.tsx`:98; `src/screens/login-parts.tsx`:52; `src/shared/back-to-today.tsx`:24; `src/shared/notifications/notification-bell.tsx`:34; `src/shared/task-fields/subtask-list.tsx`:63,104; `src/ui/button.tsx`:203; `src/ui/icon-button.tsx`:35; `src/ui/toast.tsx`:140; `src/ui/tooltip.tsx`:33; `src/ui/tooltip.web.tsx`:153 |
| `rounded-sm` | 8 (token sm) | 7 | `src/features/presets/presets-list.tsx`:34; `src/features/task/task-summary.tsx`:88,98; `src/ui/color.tsx`:98; `src/ui/progress-bar.tsx`:25,27; `src/ui/sheet.tsx`:54 |
| `rounded-r` | 0.25rem right corners (TW default) | 4 | `src/features/insights/insights-screen.tsx`:50,52; `src/features/insights/patterns.tsx`:101,103 |
| `rounded-pill` | 999 (token pill) | 4 | `src/features/task/project-sheet.tsx`:43; `src/shared/assistant/questions.tsx`:54; `src/shared/task-fields/estimate-field.tsx`:72; `src/ui/chip.tsx`:64 |
| `rounded-2xl` | 1rem = 16 web / 14 native (TW default, NOT a token) | 4 | `src/screens/app-link-screen.web.tsx`:27; `src/screens/login-return-screen.web.tsx`:19; `src/screens/login-screen.web.tsx`:114; `src/ui/sheet.tsx`:157 |
| `rounded-t` | 0.25rem top corners (TW default) | 1 | `src/features/insights/patterns.tsx`:55 |
| `rounded` | 0.25rem = 4 web / 3.5 native (TW default) | 1 | `src/features/oauth/scope-list.tsx`:42 |
| `rounded-[1px]` | 1 arbitrary | 1 | `src/ui/progress-bar.tsx`:30 |
| `rounded-t-[22px]` | 22 arbitrary | 1 | `src/ui/sheet.tsx`:158 |

Non-class radii: `global.css:56,82,92,98` `999px`; `global.css:108,116` `50%`; `global.css:123` `8px`
(slider focus ring); `shared/user-avatar.tsx:24` `borderRadius: size / 2`; `ui/dissolve.tsx:78`
`borderRadius: speck.size / 2`; `public/favicon.svg:2` and `scripts/generate-icons.ts:67` `rx="30"` (of 120).

Summary: **12 distinct radius classes** for 5 tokens; `rounded-pill` (4) and `rounded-full` (23) are two
names for the same shape; `rounded-2xl` (4: three web login cards + the wide sheet dialog) and
`rounded-t-[22px]` (phone sheet) are off-token; `rounded`/`rounded-r`/`rounded-t` (Tailwind's 4 px / 3.5 dp)
are used by the insights bars and the OAuth checkbox.

### 1.5 Fonts (`fonts.sans = "Inter"`)

- `font-sans` appears **349×** — on 329 of 350 `<Text>` elements; the other 21 take it from a constant
  (`TIME_COLUMN`, `STEP`, `NOTE`, `FACT_TEXT`, `LINK_TEXT`) or are nested texts that inherit
  (`features/server/server-line.tsx:31`, `features/week/picked-details.tsx:114`).
- Android embeds `Inter_400Regular`, `500Medium`, `600SemiBold`, **`700Bold`** (`app.config.ts:119-142`);
  the web loads four variable woff2 subsets, weight 100–900 (`global.css:9-41`), two of them preloaded
  (`public/index.html:15-16`).
- Weights actually used: 400 (implicit + `font-normal` ×2), `font-medium` 500 (44), `font-semibold` 600
  (27). **`font-bold` is never used — the 700 TTF ships unused.**
- `scripts/generate-icons.ts:60` draws the wordmark with `font-family="Inter, system-ui, sans-serif"`
  `font-weight="600" font-size="88" letter-spacing="-0.04em"`.

---

## 2. Raw values outside the tokens

### 2.1 Colour literals

| where | value | is it a token? | note |
|---|---|---|---|
| `src/ui/sheet.tsx:43` | `bg-black/55` | no | sheet/dialog backdrop; same in both themes |
| `src/platform/update-banner.web.tsx:108` | `` `${palette.accentQuietFg}1a` `` | token + raw alpha | hover fill of the Reload button |
| `src/platform/update-banner.web.tsx:108` | `"transparent"` | keyword | resting fill |
| `src/platform/update-banner.web.tsx:109` | `` `${palette.accentQuietFg}66` `` | token + raw alpha | its border |
| `src/ui/button.tsx:18` | `bg-transparent` | keyword | ghost variant |
| `public/index.html:8` | `#0b0b0c` | = dark `bg` | `theme-color` (dark) |
| `public/index.html:9` | `#f4f5f7` | **no** (light `bg` is `#eceef2`) | `theme-color` (light) |
| `public/index.html:26` | `#f4f5f7` | **no** | pre-JS body background, light |
| `public/index.html:30` | `#0b0b0c` | = dark `bg` | pre-JS body background, dark |
| `public/manifest.webmanifest:8` | `#0b0b0c` | = dark `bg` | `background_color` (no light variant possible) |
| `public/manifest.webmanifest:9` | `#0b0b0c` | = dark `bg` | `theme_color` |
| `public/favicon.svg:2` | `#d4ff3a` | = dark `accent` | tile |
| `public/favicon.svg:3` | `rgba(0,0,0,.3)` | no | trailing chevron |
| `public/favicon.svg:4` | `#0b0b0c` | = dark `bg` | lead chevron |
| `scripts/generate-icons.ts:20` | `#d4ff3a`, `#ececee`, **`#6a6a74`** | accent, fg, **not a token** | dark icon palette (`track` here means the faint chevron) |
| `scripts/generate-icons.ts:22` | `#4d6b00`, `#17181c`, **`#b9bcc6`** | light accentText, fg, **not a token** | light icon palette |
| `scripts/generate-icons.ts:23` | `#ffffff` ×3 | — | monochrome (notification) icon |
| `scripts/generate-icons.ts:24` | `#0b0b0c` | = dark `bg` | |
| `scripts/generate-icons.ts:25` | `#d4ff3a` | = dark `accent` | |
| `scripts/generate-icons.ts:67` | `rgba(0,0,0,.3)` | no | favicon trailing chevron |
| (outside the brief, same family) `app.config.ts:71,82,112` | `#0b0b0c` | = dark `bg` | splash / adaptive icon / status background |
| (outside the brief) `app.config.ts:150` | `#d4ff3a` | = dark `accent` | Android notification colour |

`scripts/build-web.ts` holds no design values. The in-app mark (`src/ui/logo.tsx:17`) draws its trailing
chevron in `palette.faint` (`#7d7d86` / `#6f717a`), the generated icons in `#6a6a74` / `#b9bcc6`: **the
logo has two different greys** depending on where it is shown.

### 2.2 Numeric style literals (inline `style`, constants)

| where | value | role |
|---|---|---|
| `src/ui/sheet.tsx:21` | `maxHeight: "90%", maxWidth: 640, width: "100%"` | phone sheet frame |
| `src/ui/sheet.tsx:24-29` | `maxHeight: "85%", maxWidth: 560, width: "92%"` | wide dialog frame |
| `src/ui/sheet.tsx:160` | `paddingBottom: isWide ? 20 : Math.max(insets.bottom, 12) + 12` | sheet bottom padding |
| `src/features/task/task-footer.tsx:54` | `paddingBottom: Math.max(insets.bottom, 12) + 8` | footer bottom padding (sheet uses +12) |
| `src/ui/tab-bar.tsx:97` | `paddingBottom: Math.max(insets.bottom, 8) + 4` | tab bar bottom |
| `src/features/permissions/onboarding-screen.tsx:30` | `paddingBottom: insets.bottom + 24, paddingTop: insets.top + 32` | onboarding |
| `src/platform/update-banner.web.tsx:91` | `paddingTop: insets.top + 10` | update banner |
| `src/ui/screen.tsx:32` | `paddingTop: insets.top` | screen |
| `src/shared/assistant/questions.tsx:80` | `marginTop: 2` | optical nudge of a check icon |
| `src/shared/user-avatar.tsx:24,29,33` | `width/height: size`, `borderRadius: size/2`, `fontSize: size * 0.38` | avatar (sizes 44 default, 24 in `ui/sidebar.tsx:168`) |
| `src/ui/switch-size.web.ts:4` | `height: 24` | web switch (RNW draws 20) |
| `src/ui/tooltip.web.tsx:123` | `zIndex: 1000` | only z-index in the app |
| `src/ui/slider.tsx:9` | `THUMB = 26` | native slider thumb (web: 26 webkit / **22** moz, `global.css:104-105,113-114`) |
| `src/ui/toast.tsx:91,93,95` | `BASE_BOTTOM = 96`, `TAB_BAR_HEIGHT = 72`, `FOOTER_GAP = 12` | toast offset — **72 is a guess at the tab bar's height**, which is really `min-h-12` + `pt-1.5` + max(inset, 8) + 4 |
| `src/ui/toast.tsx:107-108` | `bottom-4 left-3 w-[200px]` / `inset-x-4 mx-auto max-w-[480px]` | docked / floating toast |
| `src/ui/layout.ts:4` | `WIDE_MIN_WIDTH = 1024` | the single breakpoint |
| `src/features/now/composer/quick-line.tsx:32,34` | `MIN_INPUT_HEIGHT = 44`, `MAX_INPUT_HEIGHT = 212` | composer line |
| `src/features/week/week-grid.tsx:53,284,285` | `MIN_TARGET_PX = 24`, `LABELS_PX = 28`, `BOTTOM_PX = 24` | week grid |
| `src/features/week/week-screen.tsx:25,28` | `HOUR_FLOOR_PX = 18`, `PHONE_COLUMN_PX = 72` | week grid |
| `src/features/sessions/os-picker.tsx:17` | `MARK_SIZE = 16` | OS glyphs |
| `src/ui/tab-bar.tsx:33-34`, `src/ui/sidebar.tsx:32` | `ICON_SIZE = 20`, `STROKE = 1.75` (×2) | nav icons |
| `src/ui/dissolve.tsx:15-18,40-45` | `COLUMNS 30`, `ROWS 5`, `SWEEP 0.5`, speck size 2–4.5, drift 14–54 × 8–42 | dust effect |

### 2.3 Arbitrary Tailwind values (other than font sizes)

| prefix | class | count | references |
|---|---|---|---|
| border | `border-[1.5px]` | 5 | `src/features/oauth/scope-list.tsx`:42; `src/features/presets/preset-preview.tsx`:31; `src/features/task/subtask-checklist.tsx`:20; `src/shared/task-fields/subtask-list.tsx`:19; `src/ui/check-circle.tsx`:34 |
| flex | `flex-[2]` | 3 | `src/features/sessions/session-row.tsx`:117; `src/features/task/when-picker.tsx`:30; `src/ui/sheet-actions.tsx`:45 |
| flex | `flex-[3]` | 1 | `src/features/task/when-picker.tsx`:19 |
| gap | `gap-[18px]` | 1 | `src/ui/sheet.tsx`:175 |
| gap | `gap-[5px]` | 2 | `src/features/presets/preset-preview.tsx`:32; `src/shared/task-row.tsx`:80 |
| h | `h-[18px]` | 2 | `src/features/oauth/scope-list.tsx`:42; `src/ui/count-badge.tsx`:10 |
| h | `h-[22px]` | 3 | `src/features/presets/preset-preview.tsx`:31; `src/features/task/subtask-checklist.tsx`:20; `src/ui/check-circle.tsx`:34 |
| h | `h-[26px]` | 1 | `src/ui/slider.tsx`:72 |
| h | `h-[3px]` | 2 | `src/ui/progress-bar.tsx`:25,27 |
| h | `h-[9px]` | 1 | `src/ui/progress-bar.tsx`:30 |
| leading | `leading-[14px]` | 1 | `src/shared/tracking/time-bar.tsx`:176 |
| leading | `leading-[17px]` | 2 | `src/features/sessions/computer-steps.tsx`:17; `src/features/sessions/connect-ai-sheet.tsx`:73 |
| leading | `leading-[18px]` | 6 | `src/features/sessions/code-text.tsx`:13; `src/features/sessions/computer-steps.tsx`:87; `src/features/sessions/sessions-section.tsx`:127; `src/shared/zone-banner.tsx`:24; `src/ui/tooltip.tsx`:34; `src/ui/tooltip.web.tsx`:155 |
| leading | `leading-[20px]` | 3 | `src/features/sessions/computer-steps.tsx`:16; `src/features/sessions/connect-ai-sheet.tsx`:44,70 |
| leading | `leading-[21px]` | 1 | `src/features/server/incompatible-screen.tsx`:34 |
| m | `-m-[11px]` | 1 | `src/ui/check-circle.tsx`:28 |
| max-w | `max-w-[260px]` | 2 | `src/ui/tooltip.tsx`:33; `src/ui/tooltip.web.tsx`:153 |
| max-w | `max-w-[40%]` | 1 | `src/ui/split-pane.tsx`:22 |
| max-w | `max-w-[400px]` | 3 | `src/screens/app-link-screen.web.tsx`:27; `src/screens/login-return-screen.web.tsx`:19; `src/screens/login-screen.web.tsx`:114 |
| max-w | `max-w-[430px]` | 1 | `src/screens/oauth-screen.web.tsx`:19 |
| max-w | `max-w-[440px]` | 1 | `src/features/server/incompatible-screen.tsx`:29 |
| max-w | `max-w-[480px]` | 4 | `src/screens/crash-screen.tsx`:31,34,38; `src/ui/toast.tsx`:108 |
| max-w | `max-w-[50%]` | 1 | `src/screens/now-screen.tsx`:69 |
| max-w | `max-w-[560px]` | 1 | `src/features/permissions/onboarding-screen.web.tsx`:13 |
| max-w | `max-w-[640px]` | 1 | `src/features/now/composer/composer-pane.tsx`:12 |
| max-w | `max-w-[880px]` | 1 | `src/ui/screen.tsx`:33 |
| min-h | `min-h-[52px]` | 1 | `src/features/task/subtask-checklist.tsx`:54 |
| min-w | `min-w-[120px]` | 1 | `src/shared/task-fields/estimate-field.tsx`:72 |
| min-w | `min-w-[18px]` | 1 | `src/ui/count-badge.tsx`:10 |
| mt | `mt-[-10px]` | 1 | `src/ui/check-circle.tsx`:28 |
| mx | `mx-[13px]` | 1 | `src/ui/slider.tsx`:67 |
| pl | `pl-[116px]` | 4 | `src/features/day/day-screen.tsx`:139; `src/features/day/phone-section.tsx`:103,129; `src/shared/where-sat-line.tsx`:33 |
| pt | `pt-[15px]` | 1 | `src/ui/sheet.tsx`:175 |
| rounded | `rounded-[1px]` | 1 | `src/ui/progress-bar.tsx`:30 |
| rounded-t | `rounded-t-[22px]` | 1 | `src/ui/sheet.tsx`:158 |
| top | `-top-[3px]` | 1 | `src/ui/progress-bar.tsx`:30 |
| tracking | `tracking-[-0.04em]` | 1 | `src/features/oauth/consent-flow.tsx`:129 |
| tracking | `tracking-[0.06em]` | 11 | `src/features/notifications/notifications-screen.tsx`:233; `src/features/oauth/dev-identity.tsx`:21; `src/features/oauth/scope-list.tsx`:25; `src/features/permissions/permissions-screen.tsx`:40; `src/features/presets/preset-preview.tsx`:27; `src/features/presets/preset-sections.tsx`:31; `src/features/sessions/connect-ai-sheet.tsx`:46; `src/screens/inbox-screen.tsx`:30; `src/screens/login-parts.tsx`:46; `src/screens/settings-screen.tsx`:40; `src/ui/screen-header.tsx`:49 |
| w | `w-[104px]` | 1 | `src/features/day/day-screen.tsx`:59 |
| w | `w-[18px]` | 1 | `src/features/oauth/scope-list.tsx`:42 |
| w | `w-[200px]` | 1 | `src/ui/toast.tsx`:107 |
| w | `w-[22px]` | 3 | `src/features/presets/preset-preview.tsx`:31; `src/features/task/subtask-checklist.tsx`:20; `src/ui/check-circle.tsx`:34 |
| w | `w-[26px]` | 1 | `src/ui/slider.tsx`:72 |
| w | `w-[3px]` | 1 | `src/features/week/week-grid.tsx`:93 |
| w | `w-[400px]` | 1 | `src/ui/split-pane.tsx`:22 |
| w | `w-[560px]` | 1 | `src/screens/now-screen.tsx`:69 |
| w | `w-[86px]` | 1 | `src/features/day/phone-section.tsx`:199 |

`text-[Npx]` font sizes (15 distinct, 343 occurrences) are listed in section 3.

TOTAL arbitrary: 62 distinct classes, 430 occurrences.

### 2.4 Motion — durations, easings, timers

| where | value | easing | reduced motion | what |
|---|---|---|---|---|
| `src/ui/motion.ts:16` | `ROW_ENTER` FadeIn **180 ms** | reanimated default | `ReduceMotion.System` | row appears (`shared/task-list.tsx:72`, `features/day/day-screen.tsx:265`) |
| `src/ui/motion.ts:19` | `ROW_EXIT` FadeOut **140 ms** | default | System | row leaves (`shared/task-list.tsx:75`, `day-screen.tsx:265`) |
| `src/ui/motion.ts:22` | `ROW_LAYOUT` LinearTransition **200 ms** | linear | System | rows re-flow (`task-list.tsx:76`, `day-screen.tsx:265`); off on Now (`features/now/now-task-groups.tsx:55,67`, `now-screen.tsx:49`) |
| `src/ui/motion.ts:25` | `BACKDROP_ENTER` FadeIn **180 ms** | default | System | sheet dim (`ui/sheet.tsx:39`) |
| `src/ui/motion.ts:28` | `SHEET_ENTER` SlideInDown **240 ms** | default | System | phone sheet (`ui/sheet.tsx:146`) |
| `src/ui/motion.ts:31` | `DIALOG_ENTER` ZoomIn **160 ms** | default | System | wide dialog (`ui/sheet.tsx:146`) |
| `src/ui/motion.ts:37` | `PLACEHOLDER_BREATH` **900 ms**, to opacity 0.45, repeat ∞ reverse | default | System | skeleton (`ui/skeleton.tsx:30`) |
| `src/ui/pulse-dot.tsx:13,20` | `BREATH_MS = 900`, to opacity **0.3** | default | System | running dot — duplicates `PLACEHOLDER_BREATH` with another opacity, outside `motion.ts` |
| `src/ui/animated-height.tsx:11,31` | `DURATION_MS = 220` | default | System | composer card height |
| `src/platform/update-banner.web.tsx:19,84-86` | `SLIDE_MS = 300` | default | System | update banner height |
| `src/ui/dissolve.tsx:13,122-125` | `DISSOLVE_MS = 750` | **`Easing.out(Easing.quad)`** (only explicit easing) | System | checked row turns to dust |
| `app/_layout.tsx:72,73,86` | `animation: "fade"` | native stack | OS | login / auth / gate screens |
| `src/ui/sheet.tsx:134` | `Modal animationType="none"` | — | — | modal itself does not animate |
| `src/ui/toast.tsx:87-88,168` | `visibleMs = clamp(60 ms × chars, 5 000, 10 000)` | — | — | toast lifetime |
| `src/ui/tooltip-place.ts:23` | `TAP_TOOLTIP_MS = 2500` | — | — | tap tooltip lifetime (`ui/tooltip.tsx:64-66`, `ui/tooltip.web.tsx:101-103`) |
| `src/auth/telegram-widget.web.tsx:10,91` | `SLOW_AFTER_MS = 4000` | — | — | "slow" notice for the Telegram widget |
| `src/screens/decisions-screen.tsx:84,95` | `SEARCH_PAUSE_MS = 350` | — | — | search debounce |
| `src/shared/tracking/time-bar-fold.tsx:10` | `BAR_USE_MS = 5000` | — | — | when the time bar folds |
| `src/features/sessions/add-computer.tsx:16,42` | `FOCUS_RETRY_MS = 50` | — | — | focus retry |
| `src/shared/new-task-request.ts:10` | `NEW_TASK_REQUEST_MS = 2000` | — | — | |

No CSS `transition`/`animation`/`@keyframes` anywhere (`global.css`, `public/`); no `withSpring`,
`withDelay` or `withSequence`; no hover/press transitions — every pressed state is an instant opacity swap.
Durations in use: **140, 160, 180, 200, 220, 240, 300, 750, 900** ms (9 values, 6 of them for "a UI
element appears/changes size").

### 2.5 Shadows, elevation, hairlines

- `shadow-lg` ×2: `src/ui/sheet.tsx:157` (wide dialog only) and `src/ui/toast.tsx:125`. On Android
  NativeWind turns it into `elevation`/shadow props whose colour is black in both themes.
- **No** `elevation`, `shadowColor/Offset/Opacity/Radius` props, `StyleSheet.hairlineWidth`, `divide-*`,
  `ring-*`, `outline-*` classes, and no divider component. Every divider is a 1 px `border-t`/`border-b`/
  `border-r` in `border-line` (§6).

### 2.6 Opacity literals

| kind | value | where |
|---|---|---|
| pressed | `active:opacity-70` ×30, `active:opacity-80` ×12, `active:opacity-75` ×1 | §7.3 |
| disabled / dimmed | `opacity-30` (`ui/calendar.tsx:68`), `opacity-40` (`ui/icon-button.tsx:38`; `features/week/week-grid.tsx:93` decorative), `opacity-50` (`ui/button.tsx:205`, `shared/assistant/action-cards.tsx:75,119,132`, `shared/assistant/questions.tsx:44`, `shared/tracking/time-bar.tsx:104`, `features/task/subtask-checklist.tsx:22`), `opacity-60` (`features/presets/override-row.tsx:46`) | 4 different "disabled" strengths |
| other | `opacity-90` unpicked week block (`features/week/week-grid.tsx:132`) | |
| JS | `0.45` skeleton (`ui/motion.ts`/`skeleton.tsx:30`), `0.3` pulse (`ui/pulse-dot.tsx:20`), `0`/`1` tooltip measuring (`ui/tooltip.tsx:106`, `ui/tooltip.web.tsx:119`), `0`/`1` subtask remove button (`shared/task-fields/subtask-list.tsx:71`), computed in `ui/dissolve.tsx:65,144` | |

---

## 3. Type scale actually in use

All sizes except `text-sm` are arbitrary px, so they are the same on both platforms; `leading-4/5/6`,
`text-sm` and `tracking-tight` are rem/em-based (§0).

### Font sizes

| class | px | count | references |
|---|---|---|---|
| `text-sm` | 0.875rem (14 web / 12.25 native) | 2 | `src/platform/update-banner.web.tsx`:93,112 |
| `text-[10px]` | 10 | 2 | `src/features/week/week-grid.tsx`:68,183 |
| `text-[11px]` | 11 | 31 | `src/features/day/day-screen.tsx`:115; `src/features/insights/patterns.tsx`:64,91; `src/features/notifications/notifications-screen.tsx`:168,233; `src/features/oauth/dev-identity.tsx`:21; `src/features/oauth/scope-list.tsx`:25; `src/features/permissions/permissions-screen.tsx`:40; `src/features/presets/preset-preview.tsx`:27; `src/features/presets/preset-sections.tsx`:31; `src/features/presets/presets-list.tsx`:34; `src/features/sessions/connect-ai-sheet.tsx`:46; `src/features/settings/notification-settings.tsx`:39; `src/features/task/task-summary.tsx`:67,69,89,105; `src/features/week/week-grid.tsx`:243; `src/features/week/week-screen.tsx`:116; `src/screens/inbox-screen.tsx`:30; `src/screens/login-parts.tsx`:46; `src/screens/project-screen.tsx`:26; `src/screens/settings-screen.tsx`:40; `src/shared/activity-usage.tsx`:23,82,149; `src/ui/calendar.tsx`:145; `src/ui/color.tsx`:101; `src/ui/count-badge.tsx`:13; `src/ui/screen-header.tsx`:49; `src/ui/tab-bar.tsx`:74 |
| `text-[12px]` | 12 | 91 | `src/auth/telegram-widget.web.tsx`:114; `src/features/day/activity-sheet.tsx`:58; `src/features/day/activity-task-field.tsx`:46; `src/features/day/day-screen.tsx`:59,143; `src/features/day/phone-section.tsx`:52,103,199,208,296; `src/features/insights/insights-screen.tsx`:47,56,66,69; `src/features/insights/patterns.tsx`:42,122,123,127,130,136; `src/features/notifications/notifications-screen.tsx`:64,158; `src/features/now/composer/ai-status.tsx`:39,81,88,94; `src/features/now/now-task-groups.tsx`:30,43; `src/features/oauth/client-card.tsx`:29; `src/features/permissions/onboarding-screen.tsx`:119; `src/features/presets/deadline-row.tsx`:93,103; `src/features/presets/override-row.tsx`:37,52,55; `src/features/presets/preset-form.tsx`:64; `src/features/presets/presets-list.tsx`:103; `src/features/presets/recurrence-row.tsx`:43,53,93; `src/features/sessions/code-text.tsx`:13; `src/features/sessions/computer-steps.tsx`:17; `src/features/sessions/connect-ai-sheet.tsx`:73; `src/features/settings/category-estimates.tsx`:18; `src/features/settings/notification-settings.tsx`:217; `src/features/settings/settings-links.tsx`:30; `src/features/task/close-preview.tsx`:29; `src/features/task/give-up-fields.tsx`:43; `src/features/task/subtask-checklist.tsx`:74,90,93; `src/features/task/task-summary.tsx`:180; `src/features/task/when-picker.tsx`:42,46,71; `src/features/week/picked-details.tsx`:119; `src/screens/crash-screen.tsx`:34,38; `src/screens/decisions-screen.tsx`:51; `src/screens/history-screen.tsx`:54,62,169,185; `src/screens/inbox-card.tsx`:43; `src/screens/inbox-screen.tsx`:24; `src/screens/presets-screen.tsx`:12; `src/screens/review-card.tsx`:23; `src/shared/activity-usage.tsx`:26,126; `src/shared/meta-line.tsx`:68; `src/shared/task-fields/date-field.tsx`:129; `src/shared/task-fields/deadline-policy-field.tsx`:61,106,182; `src/shared/task-fields/form-alert.tsx`:8,15; `src/shared/task-fields/option-row.tsx`:14; `src/shared/task-fields/recurrence-field.tsx`:174; `src/shared/task-fields/subtask-list.tsx`:57,186; `src/shared/tracking/running-row.tsx`:28,33,52; `src/shared/tracking/time-bar.tsx`:176; `src/shared/where-sat-line.tsx`:31; `src/ui/button.tsx`:77; `src/ui/chip.tsx`:70; `src/ui/switch-row.tsx`:49; `src/ui/text-field.tsx`:25,40,44 |
| `text-[13px]` | 13 | 86 | `src/auth/telegram-widget.web.tsx`:105,110; `src/features/day/activity-task-field.tsx`:82; `src/features/day/day-screen.tsx`:108,175,178; `src/features/day/phone-section.tsx`:306; `src/features/notifications/answers.tsx`:19; `src/features/notifications/notifications-screen.tsx`:80,210; `src/features/now/calendar-prompt.tsx`:33; `src/features/now/composer/ai-status.tsx`:45; `src/features/now/composer/composer.tsx`:75; `src/features/now/now-task-groups.tsx`:28; `src/features/permissions/onboarding-screen.tsx`:124,166; `src/features/permissions/permission-card.tsx`:16,72,135; `src/features/permissions/permissions-screen.tsx`:71; `src/features/server/change-server-sheet.tsx`:43; `src/features/server/incompatible-screen.tsx`:37; `src/features/server/server-line.tsx`:28; `src/features/sessions/computer-steps.tsx`:87; `src/features/sessions/os-picker.tsx`:111; `src/features/sessions/session-row.tsx`:69; `src/features/sessions/sessions-section.tsx`:127; `src/features/settings/category-estimates.tsx`:24; `src/features/settings/delete-account.tsx`:226,256; `src/features/settings/notification-settings.tsx`:34,149,152,157,175,229; `src/features/settings/timezone-row.tsx`:28,33; `src/features/task/close-preview.tsx`:25,30; `src/features/task/close-sheet.tsx`:101; `src/features/task/source-text.tsx`:26; `src/features/task/subtask-checklist.tsx`:67; `src/features/task/task-description.tsx`:44,52; `src/features/task/task-footer.tsx`:58; `src/features/task/work-progress.tsx`:64; `src/features/week/picked-details.tsx`:283; `src/screens/app-link-screen.web.tsx`:43; `src/screens/decisions-screen.tsx`:22,137,140; `src/screens/login-parts.tsx`:84; `src/screens/login-return-screen.web.tsx`:31; `src/screens/login-screen.tsx`:48,126; `src/screens/login-screen.web.tsx`:127; `src/screens/projects-screen.tsx`:85; `src/shared/activity-usage.tsx`:20,77,116,121,143; `src/shared/assistant/action-cards.tsx`:32,167; `src/shared/assistant/questions.tsx`:28,58,81,152; `src/shared/back-to-today.tsx`:27; `src/shared/task-fields/date-field.tsx`:116; `src/shared/task-fields/estimate-field.tsx`:72; `src/shared/task-list.tsx`:137; `src/shared/tracking/choice-row.tsx`:55; `src/shared/tracking/running-row.tsx`:24,75,100; `src/shared/tracking/time-bar-fold.tsx`:64; `src/shared/tracking/time-bar.tsx`:72,77; `src/shared/zone-banner.tsx`:24; `src/ui/calendar.tsx`:75; `src/ui/sheet.tsx`:80; `src/ui/sidebar.tsx`:170; `src/ui/tooltip.tsx`:34; `src/ui/tooltip.web.tsx`:155 |
| `text-[14px]` | 14 | 73 | `src/features/day/activity-task-field.tsx`:56,111,112; `src/features/day/day-screen.tsx`:98,203,281,323; `src/features/day/phone-section.tsx`:202; `src/features/insights/card.tsx`:18; `src/features/insights/insights-screen.tsx`:104,120; `src/features/notifications/notifications-screen.tsx`:63; `src/features/oauth/client-card.tsx`:36,40; `src/features/oauth/consent-flow.tsx`:32,39,78,137,140,145; `src/features/oauth/scope-list.tsx`:48; `src/features/permissions/onboarding-screen.web.tsx`:17; `src/features/permissions/permissions-screen.tsx`:45; `src/features/permissions/permissions-screen.web.tsx`:11; `src/features/presets/override-row.tsx`:36; `src/features/presets/preset-form.tsx`:124,210; `src/features/projects/project-form.tsx`:71; `src/features/sessions/computer-steps.tsx`:16; `src/features/sessions/connect-ai-sheet.tsx`:44,70; `src/features/sessions/session-row.tsx`:106; `src/features/sessions/sessions-section.tsx`:50,102; `src/features/settings/delete-account.tsx`:202,251; `src/features/settings/notification-settings.tsx`:49; `src/features/settings/timezone-row.tsx`:24; `src/features/task/source-text.tsx`:35; `src/features/task/task-description.tsx`:118,119; `src/features/task/work-progress.tsx`:63; `src/features/week/picked-details.tsx`:90,93,202,266; `src/screens/app-link-screen.web.tsx`:30; `src/screens/auth-screen.tsx`:63; `src/screens/crash-screen.tsx`:31; `src/screens/history-screen.tsx`:50,95,189; `src/screens/login-return-screen.web.tsx`:21; `src/screens/login-screen.tsx`:117; `src/screens/login-screen.web.tsx`:117; `src/screens/not-found-screen.tsx`:17; `src/screens/now-screen.tsx`:27; `src/screens/project-screen.tsx`:134; `src/screens/projects-screen.tsx`:31; `src/screens/review-card.tsx`:19,22; `src/shared/activity-usage.tsx`:73; `src/shared/assistant/action-cards.tsx`:29; `src/shared/task-fields/subtask-list.tsx`:53,110,125; `src/shared/tracking/choice-row.tsx`:84; `src/ui/empty-state.tsx`:15; `src/ui/sidebar.tsx`:127,184; `src/ui/switch-row.tsx`:47; `src/ui/toast.tsx`:133,147 |
| `text-[15px]` | 15 | 38 | `src/features/day/phone-section.tsx`:55; `src/features/notifications/answers.tsx`:19; `src/features/now/calendar-prompt.tsx`:32; `src/features/now/composer/composer-form.tsx`:127; `src/features/now/composer/quick-line.tsx`:154; `src/features/permissions/onboarding-screen.tsx`:63,157,165; `src/features/permissions/permission-card.tsx`:15; `src/features/presets/number-input.tsx`:31; `src/features/presets/preset-preview.tsx`:35; `src/features/server/change-server-sheet.tsx`:44; `src/features/server/incompatible-screen.tsx`:34; `src/features/sessions/connect-ai-sheet.tsx`:67; `src/features/sessions/session-row.tsx`:65; `src/features/settings/settings-links.tsx`:29; `src/features/task/project-sheet.tsx`:47; `src/features/task/subtask-checklist.tsx`:71; `src/features/task/task-header.tsx`:125; `src/features/task/task-summary.tsx`:68; `src/screens/auth-screen.tsx`:44; `src/screens/decisions-screen.tsx`:37,39,124; `src/screens/inbox-card.tsx`:42; `src/screens/login-parts.tsx`:52,83; `src/screens/login-screen.tsx`:45; `src/screens/projects-screen.tsx`:81; `src/shared/task-row.tsx`:26; `src/shared/tracking/choice-row.tsx`:49; `src/shared/tracking/choices-sheet.tsx`:112,138; `src/shared/tracking/time-bar.tsx`:84; `src/ui/button.tsx`:101; `src/ui/calendar.tsx`:128; `src/ui/text-field.tsx`:29; `src/ui/time-input.tsx`:32 |
| `text-[16px]` | 16 | 3 | `src/features/insights/patterns.tsx`:92; `src/screens/more-screen.tsx`:50; `src/ui/sidebar.tsx`:167 |
| `text-[17px]` | 17 | 1 | `src/shared/activity-usage.tsx`:113 |
| `text-[18px]` | 18 | 3 | `src/features/oauth/client-card.tsx`:26; `src/screens/more-screen.tsx`:60; `src/screens/project-screen.tsx`:27 |
| `text-[20px]` | 20 | 4 | `src/features/now/composer/composer-form.tsx`:127; `src/features/week/picked-details.tsx`:280; `src/screens/crash-screen.tsx`:28; `src/ui/sheet.tsx`:76 |
| `text-[22px]` | 22 | 3 | `src/features/permissions/onboarding-screen.web.tsx`:14; `src/features/server/incompatible-screen.tsx`:31; `src/ui/back-header.tsx`:51 |
| `text-[24px]` | 24 | 3 | `src/features/oauth/consent-flow.tsx`:129,134; `src/screens/not-found-screen.tsx`:14 |
| `text-[26px]` | 26 | 3 | `src/features/permissions/onboarding-screen.tsx`:60,154; `src/features/task/task-summary.tsx`:173 |
| `text-[30px]` | 30 | 1 | `src/ui/screen-header.tsx`:55 |
| `text-[34px]` | 34 | 1 | `src/ui/logo.tsx`:48 |

### Line heights

| class | value | count | references |
|---|---|---|---|
| `leading-5` | 1.25rem (20 web / 17.5 native) | 19 | `src/features/permissions/onboarding-screen.web.tsx`:17; `src/features/permissions/permissions-screen.web.tsx`:11; `src/features/settings/category-estimates.tsx`:18; `src/features/settings/delete-account.tsx`:202; `src/features/task/source-text.tsx`:35; `src/features/task/task-description.tsx`:118; `src/features/week/picked-details.tsx`:90,93; `src/screens/decisions-screen.tsx`:22,37,39; `src/shared/assistant/action-cards.tsx`:29,32,167; `src/shared/assistant/questions.tsx`:28,81,152; `src/shared/task-fields/deadline-policy-field.tsx`:106; `src/ui/empty-state.tsx`:15 |
| `leading-[18px]` | [18px] | 6 | `src/features/sessions/code-text.tsx`:13; `src/features/sessions/computer-steps.tsx`:87; `src/features/sessions/sessions-section.tsx`:127; `src/shared/zone-banner.tsx`:24; `src/ui/tooltip.tsx`:34; `src/ui/tooltip.web.tsx`:155 |
| `leading-[20px]` | [20px] | 3 | `src/features/sessions/computer-steps.tsx`:16; `src/features/sessions/connect-ai-sheet.tsx`:44,70 |
| `leading-[17px]` | [17px] | 2 | `src/features/sessions/computer-steps.tsx`:17; `src/features/sessions/connect-ai-sheet.tsx`:73 |
| `leading-4` | 1rem (16 web / 14 native) | 2 | `src/shared/meta-line.tsx`:68; `src/ui/color.tsx`:101 |
| `leading-6` | 1.5rem (24 web / 21 native) | 1 | `src/features/now/composer/quick-line.tsx`:154 |
| `leading-[21px]` | [21px] | 1 | `src/features/server/incompatible-screen.tsx`:34 |
| `leading-[14px]` | [14px] | 1 | `src/shared/tracking/time-bar.tsx`:176 |

### Weights / family

| class | value | count | references |
|---|---|---|---|
| `font-sans` | Inter | 349 | (on nearly every Text; see below for Text without it) |
| `font-medium` | 500 | 44 | `src/features/day/activity-task-field.tsx`:111; `src/features/day/day-screen.tsx`:98,178; `src/features/day/phone-section.tsx`:52,306; `src/features/insights/card.tsx`:18; `src/features/now/calendar-prompt.tsx`:32; `src/features/now/now-task-groups.tsx`:43; `src/features/permissions/permission-card.tsx`:15; `src/features/presets/preset-preview.tsx`:36; `src/features/server/server-line.tsx`:31; `src/features/sessions/os-picker.tsx`:112; `src/features/sessions/session-row.tsx`:65; `src/features/task/subtask-checklist.tsx`:90; `src/features/task/task-header.tsx`:125; `src/features/task/task-summary.tsx`:89,106; `src/features/week/week-grid.tsx`:134; `src/platform/update-banner.web.tsx`:112; `src/screens/decisions-screen.tsx`:37; `src/screens/history-screen.tsx`:169,185; `src/screens/login-parts.tsx`:83; `src/screens/login-screen.tsx`:45; `src/screens/more-screen.tsx`:60; `src/screens/projects-screen.tsx`:81; `src/screens/review-card.tsx`:19; `src/shared/assistant/action-cards.tsx`:124; `src/shared/back-to-today.tsx`:27; `src/shared/meta-line.tsx`:17; `src/shared/task-list.tsx`:137; `src/shared/task-row.tsx`:27; `src/shared/tracking/choices-sheet.tsx`:138; `src/shared/tracking/running-row.tsx`:52; `src/shared/tracking/time-bar.tsx`:135; `src/ui/button.tsx`:101; `src/ui/calendar.tsx`:128; `src/ui/chip.tsx`:26; `src/ui/color.tsx`:101; `src/ui/count-badge.tsx`:13; `src/ui/sidebar.tsx`:128,184; `src/ui/tab-bar.tsx`:75 |
| `font-semibold` | 600 | 27 | `src/features/now/composer/composer-form.tsx`:126; `src/features/now/now-task-groups.tsx`:28; `src/features/oauth/client-card.tsx`:26; `src/features/oauth/consent-flow.tsx`:129,134; `src/features/permissions/onboarding-screen.tsx`:60,154; `src/features/permissions/onboarding-screen.web.tsx`:14; `src/features/server/incompatible-screen.tsx`:31; `src/features/sessions/connect-ai-sheet.tsx`:67; `src/features/settings/delete-account.tsx`:251; `src/features/task/task-description.tsx`:52; `src/features/task/task-summary.tsx`:173; `src/features/week/picked-details.tsx`:280; `src/features/week/week-grid.tsx`:244; `src/screens/crash-screen.tsx`:28; `src/screens/not-found-screen.tsx`:14; `src/shared/activity-usage.tsx`:73,113; `src/shared/user-avatar.tsx`:32; `src/ui/back-header.tsx`:51; `src/ui/calendar.tsx`:33; `src/ui/logo.tsx`:48; `src/ui/screen-header.tsx`:55; `src/ui/sheet.tsx`:76; `src/ui/sidebar.tsx`:167; `src/ui/toast.tsx`:147 |
| `font-normal` | 400 | 2 | `src/features/presets/preset-preview.tsx`:36; `src/ui/button.tsx`:77 |

### Tracking

| class | value | count | references |
|---|---|---|---|
| `tracking-[0.06em]` | 0.06em | 11 | `src/features/notifications/notifications-screen.tsx`:233; `src/features/oauth/dev-identity.tsx`:21; `src/features/oauth/scope-list.tsx`:25; `src/features/permissions/permissions-screen.tsx`:40; `src/features/presets/preset-preview.tsx`:27; `src/features/presets/preset-sections.tsx`:31; `src/features/sessions/connect-ai-sheet.tsx`:46; `src/screens/inbox-screen.tsx`:30; `src/screens/login-parts.tsx`:46; `src/screens/settings-screen.tsx`:40; `src/ui/screen-header.tsx`:49 |
| `tracking-tight` | -0.025em | 3 | `src/features/task/task-summary.tsx`:173; `src/ui/logo.tsx`:48; `src/ui/screen-header.tsx`:55 |
| `tracking-[-0.04em]` | -0.04em | 1 | `src/features/oauth/consent-flow.tsx`:129 |

### Other text treatments

| class | count | references |
|---|---|---|
| `uppercase` | 11 | `src/features/notifications/notifications-screen.tsx`:233; `src/features/oauth/dev-identity.tsx`:21; `src/features/oauth/scope-list.tsx`:25; `src/features/permissions/permissions-screen.tsx`:40; `src/features/presets/preset-preview.tsx`:27; `src/features/presets/preset-sections.tsx`:31; `src/features/sessions/connect-ai-sheet.tsx`:46; `src/screens/inbox-screen.tsx`:30; `src/screens/login-parts.tsx`:46; `src/screens/settings-screen.tsx`:40; `src/ui/screen-header.tsx`:49 |
| `tabular-nums` | 44 | `src/features/day/day-screen.tsx`:59,108; `src/features/day/phone-section.tsx`:199; `src/features/insights/insights-screen.tsx`:56,69; `src/features/insights/patterns.tsx`:64,92,130,136; `src/features/notifications/notifications-screen.tsx`:64,158; `src/features/now/calendar-prompt.tsx`:33; `src/features/now/now-task-groups.tsx`:30; `src/features/oauth/dev-identity.tsx`:21; `src/features/oauth/scope-list.tsx`:25; `src/features/permissions/onboarding-screen.tsx`:119; `src/features/permissions/permissions-screen.tsx`:40; `src/features/presets/deadline-row.tsx`:103; `src/features/presets/number-input.tsx`:31; `src/features/presets/preset-preview.tsx`:27; `src/features/presets/preset-sections.tsx`:31; `src/features/settings/timezone-row.tsx`:24; `src/features/task/close-preview.tsx`:29; `src/features/task/subtask-checklist.tsx`:67; `src/features/task/task-summary.tsx`:68; `src/features/task/work-progress.tsx`:64; `src/features/week/week-grid.tsx`:68,243; `src/screens/login-parts.tsx`:46,52; `src/screens/project-screen.tsx`:27; `src/screens/projects-screen.tsx`:85; `src/screens/settings-screen.tsx`:40; `src/shared/activity-usage.tsx`:26,116; `src/shared/task-fields/date-field.tsx`:129; `src/shared/tracking/choice-row.tsx`:55; `src/shared/tracking/running-row.tsx`:24; `src/ui/button.tsx`:77; `src/ui/calendar.tsx`:75,145; `src/ui/count-badge.tsx`:13; `src/ui/screen-header.tsx`:49; `src/ui/time-input.tsx`:32 |
| `underline` | 4 | `src/features/day/day-screen.tsx`:143; `src/features/notifications/notifications-screen.tsx`:80; `src/features/week/picked-details.tsx`:92; `src/screens/login-return-screen.web.tsx`:31 |
| `line-through` | 1 | `src/shared/task-row.tsx`:28 |

### Size × weight × leading × tracking combos (per class string)

| size | weight | leading | tracking/case | count | references |
|---|---|---|---|---|---|
| `text-sm` | 400 | - | - | 1 | `src/platform/update-banner.web.tsx`:93 |
| `text-sm` | font-medium | - | - | 1 | `src/platform/update-banner.web.tsx`:112 |
| `text-[10px]` | 400 | - | - | 2 | `src/features/week/week-grid.tsx`:68,183 |
| `text-[11px]` | 400 | - | - | 17 | `src/features/day/day-screen.tsx`:115; `src/features/insights/patterns.tsx`:64,91; `src/features/notifications/notifications-screen.tsx`:168; `src/features/presets/presets-list.tsx`:34; `src/features/settings/notification-settings.tsx`:39; `src/features/task/task-summary.tsx`:67,69,105; `src/features/week/week-grid.tsx`:243; `src/features/week/week-screen.tsx`:116; `src/screens/project-screen.tsx`:26; `src/shared/activity-usage.tsx`:23,82,149; `src/ui/calendar.tsx`:145; `src/ui/tab-bar.tsx`:74 |
| `text-[11px]` | 400 | - | uppercase tracking-[0.06em] | 11 | `src/features/notifications/notifications-screen.tsx`:233; `src/features/oauth/dev-identity.tsx`:21; `src/features/oauth/scope-list.tsx`:25; `src/features/permissions/permissions-screen.tsx`:40; `src/features/presets/preset-preview.tsx`:27; `src/features/presets/preset-sections.tsx`:31; `src/features/sessions/connect-ai-sheet.tsx`:46; `src/screens/inbox-screen.tsx`:30; `src/screens/login-parts.tsx`:46; `src/screens/settings-screen.tsx`:40; `src/ui/screen-header.tsx`:49 |
| `text-[11px]` | font-medium | - | - | 2 | `src/features/task/task-summary.tsx`:89; `src/ui/count-badge.tsx`:13 |
| `text-[11px]` | font-medium | leading-4 | - | 1 | `src/ui/color.tsx`:101 |
| `text-[12px]` | 400 | - | - | 77 | `src/auth/telegram-widget.web.tsx`:114; `src/features/day/activity-sheet.tsx`:58; `src/features/day/activity-task-field.tsx`:46; `src/features/day/day-screen.tsx`:59,143; `src/features/day/phone-section.tsx`:103,199,208,296; `src/features/insights/insights-screen.tsx`:47,56,66,69; `src/features/insights/patterns.tsx`:42,122,123,127,130,136; `src/features/notifications/notifications-screen.tsx`:64,158; `src/features/now/composer/ai-status.tsx`:39,81,88,94; `src/features/now/now-task-groups.tsx`:30; `src/features/oauth/client-card.tsx`:29; `src/features/permissions/onboarding-screen.tsx`:119; `src/features/presets/deadline-row.tsx`:93,103; `src/features/presets/override-row.tsx`:37,52,55; `src/features/presets/preset-form.tsx`:64; `src/features/presets/presets-list.tsx`:103; `src/features/presets/recurrence-row.tsx`:43,53,93; `src/features/settings/notification-settings.tsx`:217; `src/features/settings/settings-links.tsx`:30; `src/features/task/close-preview.tsx`:29; `src/features/task/give-up-fields.tsx`:43; `src/features/task/subtask-checklist.tsx`:74,93; `src/features/task/task-summary.tsx`:180; `src/features/task/when-picker.tsx`:42,46,71; `src/features/week/picked-details.tsx`:119; `src/screens/crash-screen.tsx`:34,38; `src/screens/decisions-screen.tsx`:51; `src/screens/history-screen.tsx`:54,62; `src/screens/inbox-card.tsx`:43; `src/screens/inbox-screen.tsx`:24; `src/screens/presets-screen.tsx`:12; `src/screens/review-card.tsx`:23; `src/shared/activity-usage.tsx`:26,126; `src/shared/task-fields/date-field.tsx`:129; `src/shared/task-fields/deadline-policy-field.tsx`:61,182; `src/shared/task-fields/form-alert.tsx`:8,15; `src/shared/task-fields/option-row.tsx`:14; `src/shared/task-fields/recurrence-field.tsx`:174; `src/shared/task-fields/subtask-list.tsx`:57,186; `src/shared/tracking/running-row.tsx`:28,33; `src/shared/where-sat-line.tsx`:31; `src/ui/chip.tsx`:70; `src/ui/switch-row.tsx`:49; `src/ui/text-field.tsx`:25,40,44 |
| `text-[12px]` | font-medium | - | - | 6 | `src/features/day/phone-section.tsx`:52; `src/features/now/now-task-groups.tsx`:43; `src/features/task/subtask-checklist.tsx`:90; `src/screens/history-screen.tsx`:169,185; `src/shared/tracking/running-row.tsx`:52 |
| `text-[12px]` | 400 | leading-[17px] | - | 2 | `src/features/sessions/computer-steps.tsx`:17; `src/features/sessions/connect-ai-sheet.tsx`:73 |
| `text-[12px]` | 400 | leading-5 | - | 2 | `src/features/settings/category-estimates.tsx`:18; `src/shared/task-fields/deadline-policy-field.tsx`:106 |
| `text-[12px]` | 400 | leading-[18px] | - | 1 | `src/features/sessions/code-text.tsx`:13 |
| `text-[12px]` | 400 | leading-4 | - | 1 | `src/shared/meta-line.tsx`:68 |
| `text-[12px]` | 400 | leading-[14px] | - | 1 | `src/shared/tracking/time-bar.tsx`:176 |
| `text-[12px]` | font-normal | - | - | 1 | `src/ui/button.tsx`:77 |
| `text-[13px]` | 400 | - | - | 69 | `src/auth/telegram-widget.web.tsx`:105,110; `src/features/day/activity-task-field.tsx`:82; `src/features/day/day-screen.tsx`:108,175; `src/features/notifications/answers.tsx`:19; `src/features/notifications/notifications-screen.tsx`:80,210; `src/features/now/calendar-prompt.tsx`:33; `src/features/now/composer/ai-status.tsx`:45; `src/features/now/composer/composer.tsx`:75; `src/features/permissions/onboarding-screen.tsx`:124,166; `src/features/permissions/permission-card.tsx`:16,72,135; `src/features/permissions/permissions-screen.tsx`:71; `src/features/server/change-server-sheet.tsx`:43; `src/features/server/incompatible-screen.tsx`:37; `src/features/server/server-line.tsx`:28; `src/features/sessions/os-picker.tsx`:111; `src/features/sessions/session-row.tsx`:69; `src/features/settings/category-estimates.tsx`:24; `src/features/settings/delete-account.tsx`:226,256; `src/features/settings/notification-settings.tsx`:34,149,152,157,175,229; `src/features/settings/timezone-row.tsx`:28,33; `src/features/task/close-preview.tsx`:25,30; `src/features/task/close-sheet.tsx`:101; `src/features/task/source-text.tsx`:26; `src/features/task/subtask-checklist.tsx`:67; `src/features/task/task-description.tsx`:44; `src/features/task/task-footer.tsx`:58; `src/features/task/work-progress.tsx`:64; `src/features/week/picked-details.tsx`:283; `src/screens/app-link-screen.web.tsx`:43; `src/screens/decisions-screen.tsx`:137,140; `src/screens/login-parts.tsx`:84; `src/screens/login-return-screen.web.tsx`:31; `src/screens/login-screen.tsx`:48,126; `src/screens/login-screen.web.tsx`:127; `src/screens/projects-screen.tsx`:85; `src/shared/activity-usage.tsx`:20,77,116,121,143; `src/shared/assistant/questions.tsx`:58; `src/shared/task-fields/date-field.tsx`:116; `src/shared/task-fields/estimate-field.tsx`:72; `src/shared/tracking/choice-row.tsx`:55; `src/shared/tracking/running-row.tsx`:24,75,100; `src/shared/tracking/time-bar-fold.tsx`:64; `src/shared/tracking/time-bar.tsx`:72,77; `src/ui/calendar.tsx`:75; `src/ui/sheet.tsx`:80; `src/ui/sidebar.tsx`:170 |
| `text-[13px]` | 400 | leading-5 | - | 6 | `src/screens/decisions-screen.tsx`:22; `src/shared/assistant/action-cards.tsx`:32,167; `src/shared/assistant/questions.tsx`:28,81,152 |
| `text-[13px]` | 400 | leading-[18px] | - | 5 | `src/features/sessions/computer-steps.tsx`:87; `src/features/sessions/sessions-section.tsx`:127; `src/shared/zone-banner.tsx`:24; `src/ui/tooltip.tsx`:34; `src/ui/tooltip.web.tsx`:155 |
| `text-[13px]` | font-medium | - | - | 4 | `src/features/day/day-screen.tsx`:178; `src/features/day/phone-section.tsx`:306; `src/shared/back-to-today.tsx`:27; `src/shared/task-list.tsx`:137 |
| `text-[13px]` | font-semibold | - | - | 2 | `src/features/now/now-task-groups.tsx`:28; `src/features/task/task-description.tsx`:52 |
| `text-[14px]` | 400 | - | - | 53 | `src/features/day/activity-task-field.tsx`:56,112; `src/features/day/day-screen.tsx`:203,281,323; `src/features/day/phone-section.tsx`:202; `src/features/insights/insights-screen.tsx`:104,120; `src/features/notifications/notifications-screen.tsx`:63; `src/features/oauth/client-card.tsx`:36,40; `src/features/oauth/consent-flow.tsx`:32,39,78,137,140,145; `src/features/oauth/scope-list.tsx`:48; `src/features/permissions/permissions-screen.tsx`:45; `src/features/presets/override-row.tsx`:36; `src/features/presets/preset-form.tsx`:124,210; `src/features/projects/project-form.tsx`:71; `src/features/sessions/session-row.tsx`:106; `src/features/sessions/sessions-section.tsx`:50,102; `src/features/settings/notification-settings.tsx`:49; `src/features/settings/timezone-row.tsx`:24; `src/features/task/task-description.tsx`:119; `src/features/task/work-progress.tsx`:63; `src/features/week/picked-details.tsx`:202,266; `src/screens/app-link-screen.web.tsx`:30; `src/screens/auth-screen.tsx`:63; `src/screens/crash-screen.tsx`:31; `src/screens/history-screen.tsx`:50,95,189; `src/screens/login-return-screen.web.tsx`:21; `src/screens/login-screen.tsx`:117; `src/screens/login-screen.web.tsx`:117; `src/screens/not-found-screen.tsx`:17; `src/screens/now-screen.tsx`:27; `src/screens/project-screen.tsx`:134; `src/screens/projects-screen.tsx`:31; `src/screens/review-card.tsx`:22; `src/shared/task-fields/subtask-list.tsx`:53,110,125; `src/shared/tracking/choice-row.tsx`:84; `src/ui/sidebar.tsx`:127; `src/ui/switch-row.tsx`:47; `src/ui/toast.tsx`:133 |
| `text-[14px]` | 400 | leading-5 | - | 9 | `src/features/permissions/onboarding-screen.web.tsx`:17; `src/features/permissions/permissions-screen.web.tsx`:11; `src/features/settings/delete-account.tsx`:202; `src/features/task/source-text.tsx`:35; `src/features/task/task-description.tsx`:118; `src/features/week/picked-details.tsx`:90,93; `src/shared/assistant/action-cards.tsx`:29; `src/ui/empty-state.tsx`:15 |
| `text-[14px]` | font-medium | - | - | 5 | `src/features/day/activity-task-field.tsx`:111; `src/features/day/day-screen.tsx`:98; `src/features/insights/card.tsx`:18; `src/screens/review-card.tsx`:19; `src/ui/sidebar.tsx`:184 |
| `text-[14px]` | 400 | leading-[20px] | - | 3 | `src/features/sessions/computer-steps.tsx`:16; `src/features/sessions/connect-ai-sheet.tsx`:44,70 |
| `text-[14px]` | font-semibold | - | - | 3 | `src/features/settings/delete-account.tsx`:251; `src/shared/activity-usage.tsx`:73; `src/ui/toast.tsx`:147 |
| `text-[15px]` | 400 | - | - | 23 | `src/features/day/phone-section.tsx`:55; `src/features/notifications/answers.tsx`:19; `src/features/now/composer/composer-form.tsx`:127; `src/features/permissions/onboarding-screen.tsx`:63,157,165; `src/features/presets/number-input.tsx`:31; `src/features/presets/preset-preview.tsx`:35; `src/features/server/change-server-sheet.tsx`:44; `src/features/settings/settings-links.tsx`:29; `src/features/task/project-sheet.tsx`:47; `src/features/task/subtask-checklist.tsx`:71; `src/features/task/task-summary.tsx`:68; `src/screens/auth-screen.tsx`:44; `src/screens/decisions-screen.tsx`:124; `src/screens/inbox-card.tsx`:42; `src/screens/login-parts.tsx`:52; `src/shared/task-row.tsx`:26; `src/shared/tracking/choice-row.tsx`:49; `src/shared/tracking/choices-sheet.tsx`:112; `src/shared/tracking/time-bar.tsx`:84; `src/ui/text-field.tsx`:29; `src/ui/time-input.tsx`:32 |
| `text-[15px]` | font-medium | - | - | 10 | `src/features/now/calendar-prompt.tsx`:32; `src/features/permissions/permission-card.tsx`:15; `src/features/sessions/session-row.tsx`:65; `src/features/task/task-header.tsx`:125; `src/screens/login-parts.tsx`:83; `src/screens/login-screen.tsx`:45; `src/screens/projects-screen.tsx`:81; `src/shared/tracking/choices-sheet.tsx`:138; `src/ui/button.tsx`:101; `src/ui/calendar.tsx`:128 |
| `text-[15px]` | 400 | leading-6 | - | 1 | `src/features/now/composer/quick-line.tsx`:154 |
| `text-[15px]` | 400 | leading-[21px] | - | 1 | `src/features/server/incompatible-screen.tsx`:34 |
| `text-[15px]` | font-semibold | - | - | 1 | `src/features/sessions/connect-ai-sheet.tsx`:67 |
| `text-[15px]` | font-medium | leading-5 | - | 1 | `src/screens/decisions-screen.tsx`:37 |
| `text-[15px]` | 400 | leading-5 | - | 1 | `src/screens/decisions-screen.tsx`:39 |
| `text-[16px]` | 400 | - | - | 2 | `src/features/insights/patterns.tsx`:92; `src/screens/more-screen.tsx`:50 |
| `text-[16px]` | font-semibold | - | - | 1 | `src/ui/sidebar.tsx`:167 |
| `text-[17px]` | font-semibold | - | - | 1 | `src/shared/activity-usage.tsx`:113 |
| `text-[18px]` | font-semibold | - | - | 1 | `src/features/oauth/client-card.tsx`:26 |
| `text-[18px]` | font-medium | - | - | 1 | `src/screens/more-screen.tsx`:60 |
| `text-[18px]` | 400 | - | - | 1 | `src/screens/project-screen.tsx`:27 |
| `text-[20px]` | font-semibold | - | - | 3 | `src/features/week/picked-details.tsx`:280; `src/screens/crash-screen.tsx`:28; `src/ui/sheet.tsx`:76 |
| `text-[20px]` | 400 | - | - | 1 | `src/features/now/composer/composer-form.tsx`:127 |
| `text-[22px]` | font-semibold | - | - | 3 | `src/features/permissions/onboarding-screen.web.tsx`:14; `src/features/server/incompatible-screen.tsx`:31; `src/ui/back-header.tsx`:51 |
| `text-[24px]` | font-semibold | - | - | 2 | `src/features/oauth/consent-flow.tsx`:134; `src/screens/not-found-screen.tsx`:14 |
| `text-[24px]` | font-semibold | - | tracking-[-0.04em] | 1 | `src/features/oauth/consent-flow.tsx`:129 |
| `text-[26px]` | font-semibold | - | - | 2 | `src/features/permissions/onboarding-screen.tsx`:60,154 |
| `text-[26px]` | font-semibold | - | tracking-tight | 1 | `src/features/task/task-summary.tsx`:173 |
| `text-[30px]` | font-semibold | - | tracking-tight | 1 | `src/ui/screen-header.tsx`:55 |
| `text-[34px]` | font-semibold | - | tracking-tight | 1 | `src/ui/logo.tsx`:48 |

### `font-sans` strings with no size class (size comes from a parent template, a sibling string in `cx()`, or RN default 14)

- `src/features/now/composer/composer-form.tsx`:126 — `flex-1 font-sans font-semibold text-fg`
- `src/shared/assistant/action-cards.tsx`:78 — `min-h-11 flex-1 rounded-lg border border-line bg-bg px-3 font-sans text-fg`
- `src/shared/assistant/action-cards.tsx`:93 — `font-sans text-fg`
- `src/shared/assistant/action-cards.tsx`:124 — `font-sans font-medium text-accentFg`
- `src/shared/assistant/action-cards.tsx`:137 — `font-sans text-fg`
- `src/shared/user-avatar.tsx`:32 — `font-sans font-semibold text-accentQuietFg`

### size class without `font-sans` in the same string

- `src/features/now/composer/composer-form.tsx`:127 — `text-[20px]`
- `src/features/now/composer/composer-form.tsx`:127 — `pl-1 text-[15px]`

### 3.1 Derived scale

| step (px) | uses | share | typical role |
|---|---|---|---|
| 10 | 2 | 0.6 % | week-grid hour labels |
| 11 | 31 | 9 % | eyebrows / section labels (uppercase), tags, tab labels, badges, meta |
| **12** | 91 | 26 % | hints, meta, field labels, chips |
| **13** | 86 | 25 % | secondary body, small buttons, tooltips |
| **14** | 73 | 21 % | body, toasts, list text (+ `text-sm` 14 web / 12.25 Android ×2) |
| 15 | 38 | 11 % | primary row titles, inputs, Button label |
| 16 | 3 | | sidebar wordmark, More rows, insight tile value |
| 17 | 1 | | one section heading |
| 18 | 3 | | stat value, OAuth client name, More owner name |
| 20 | 4 | | sheet / dialog / crash title, composer form title |
| 22 | 3 | | pushed-screen title, onboarding (web) and incompatible titles |
| 24 | 3 | | consent and not-found titles |
| 26 | 3 | | onboarding title, task title |
| 30 | 1 | | tab screen title |
| 34 | 1 | | login wordmark |

**15 sizes** (16 with `text-sm`); 11–15 px carry 319 of 345 sized strings (92 %); the 10 sizes from 16
to 34 serve 27 strings. Line height is set on only **35 of 345** sized strings, with **8 different values**
(`leading-4/5/6` = 16/20/24 web but 14/17.5/21 Android, plus `[14px] [17px] [18px] [20px] [21px]`).

### 3.2 Same role, different type

| role | variants found |
|---|---|
| Screen / page title | 30 semibold tight (`ui/screen-header.tsx:55`) · 22 semibold (`ui/back-header.tsx:51`, `features/server/incompatible-screen.tsx:31`, `features/permissions/onboarding-screen.web.tsx:14`) · 26 semibold (`features/permissions/onboarding-screen.tsx:60,154`) · 26 semibold tight (`features/task/task-summary.tsx:173`) · 24 semibold (`features/oauth/consent-flow.tsx:134`, `screens/not-found-screen.tsx:14`) · 24 semibold `-0.04em` (`consent-flow.tsx:129`) · 20 semibold (`screens/crash-screen.tsx:28`) |
| Sheet / dialog title | 20 semibold (`ui/sheet.tsx:76`, `features/week/picked-details.tsx:280`) · **20 regular, no `font-sans` in the same string** (`features/now/composer/composer-form.tsx:126-127`) |
| Section heading | 17 semibold (`shared/activity-usage.tsx:113`) · 15 semibold (`features/sessions/connect-ai-sheet.tsx:67`) · 14 semibold (`shared/activity-usage.tsx:73`; `features/settings/delete-account.tsx:251` in warn) · 14 medium (`features/insights/card.tsx:18`, `screens/review-card.tsx:19`) · 13 semibold fg2 (`features/now/now-task-groups.tsx:28`) · 13 medium (`features/day/phone-section.tsx:306`, `shared/task-list.tsx:137`) · 12 medium muted (`features/task/subtask-checklist.tsx:90`, `screens/history-screen.tsx:169,185`) · 11 uppercase `0.06em` (11×, e.g. `features/notifications/notifications-screen.tsx:233`, `ui/screen-header.tsx:49`) — **8 treatments** |
| Stat value (with an 11 px fg2 label) | 18 regular (`screens/project-screen.tsx:27`) · 16 regular (`features/insights/patterns.tsx:92`) |
| Button label | 15 medium (`ui/button.tsx:101`) · 15 medium (`shared/tracking/choices-sheet.tsx:138`) · 14 medium (`ui/sidebar.tsx:184`) · **no size = RN default 14** medium (`shared/assistant/action-cards.tsx:124`, `:137`, `:93`) · 14 semibold accentText (`ui/toast.tsx:147`) · 13 semibold (`features/task/task-description.tsx:52`) · 13 medium (`shared/back-to-today.tsx:27`) · 13 regular (`shared/tracking/running-row.tsx:75,100`, `shared/tracking/time-bar-fold.tsx:64`, `task-description.tsx:44`) · 12 (`ui/chip.tsx:70`) |
| Text input | 15 (`ui/text-field.tsx:29`, `ui/time-input.tsx:32`, `shared/tracking/time-bar.tsx:84`, `shared/tracking/choices-sheet.tsx:112`, `screens/login-parts.tsx:52`) · 15 / `leading-6` (`features/now/composer/quick-line.tsx:154`) · 14 (`shared/task-fields/subtask-list.tsx:125`) · 13 (`shared/task-fields/estimate-field.tsx:72`) · unset = 14 (`shared/assistant/action-cards.tsx:78`) |
| Navigation row title | 16 (`screens/more-screen.tsx:50`) · 15 (`features/settings/settings-links.tsx:29`, `screens/decisions-screen.tsx:37` medium) · 15 medium (`screens/projects-screen.tsx:81`, task row `shared/task-row.tsx:26-27`) · 14 (`ui/sidebar.tsx:127`) |
| Tag | 11 medium `leading-4` `px-1.5 py-px` (`ui/color.tsx:98-101`) · 11 regular `px-1.5 py-0.5` (`features/presets/presets-list.tsx:34`) · 11 medium `px-2 py-1` (`features/task/task-summary.tsx:88-89`) |
| Chip | comment says "36px with 13px text" for `tall` (`ui/chip.tsx:52`), code uses `text-[12px]` for both (`ui/chip.tsx:70`) |

Other: `tabular-nums` (44) is also applied to non-numeric eyebrows (`ui/screen-header.tsx:49`);
`tracking-tight` only on 30/34/26 titles, not on 24/22/20 ones; `text-sm` (rem) is used only by the web
update banner (`platform/update-banner.web.tsx:93,112`), the only non-px font size.

---

## 4. Spacing actually in use

Values are Tailwind steps × 4 px on the web and × 3.5 dp on Android (§0); arbitrary values are exact.

| class | value (px) | flag | count | references |
|---|---|---|---|---|
| `p-2` | 8 web / 7 native |  | 1 | `src/features/now/composer/composer-form.tsx`:251 |
| `p-3` | 12 web / 10.5 native |  | 9 | `src/features/insights/patterns.tsx`:87; `src/features/oauth/dev-identity.tsx`:20; `src/features/presets/preset-preview.tsx`:24; `src/features/sessions/code-text.tsx`:13; `src/features/task/close-preview.tsx`:60; `src/features/task/source-text.tsx`:35; `src/shared/assistant/action-cards.tsx`:165; `src/shared/task-fields/date-field.tsx`:104; `src/shared/task-fields/recurrence-field.tsx`:135 |
| `p-3.5` | 14 web / 12.25 native | half-step | 10 | `src/features/day/phone-section.tsx`:49; `src/features/presets/preset-form.tsx`:43,119; `src/features/presets/presets-list.tsx`:102; `src/features/projects/project-form.tsx`:44; `src/features/task/task-description.tsx`:27; `src/features/task/task-summary.tsx`:190; `src/screens/inbox-card.tsx`:41; `src/screens/project-screen.tsx`:84; `src/screens/review-card.tsx`:18 |
| `p-4` | 16 web / 14 native |  | 4 | `src/features/insights/card.tsx`:15; `src/features/oauth/client-card.tsx`:14; `src/features/settings/delete-account.tsx`:197; `src/screens/login-parts.tsx`:45 |
| `px-1` | 4 web / 3.5 native |  | 13 | `src/features/now/composer/ai-status.tsx`:37,81,88,93; `src/features/now/now-task-groups.tsx`:38; `src/features/presets/presets-list.tsx`:65; `src/features/task/subtask-checklist.tsx`:54,89; `src/features/week/week-grid.tsx`:173; `src/screens/inbox-screen.tsx`:30; `src/shared/task-fields/estimate-field.tsx`:104; `src/shared/tracking/time-bar.tsx`:167; `src/ui/tab-bar.tsx`:95 |
| `px-1.5` | 6 web / 5.25 native | half-step | 5 | `src/features/now/composer/composer.tsx`:102; `src/features/now/composer/quick-line.tsx`:154; `src/features/presets/presets-list.tsx`:34; `src/ui/color.tsx`:98; `src/ui/count-badge.tsx`:10 |
| `px-2` | 8 web / 7 native |  | 12 | `src/features/notifications/notifications-screen.tsx`:205; `src/features/sessions/os-picker.tsx`:96; `src/features/task/task-summary.tsx`:88,98; `src/screens/history-screen.tsx`:172; `src/screens/login-return-screen.web.tsx`:31; `src/shared/back-to-today.tsx`:24; `src/shared/task-list.tsx`:67,132; `src/ui/sidebar.tsx`:165; `src/ui/tooltip.tsx`:33; `src/ui/tooltip.web.tsx`:153 |
| `px-3` | 12 web / 10.5 native |  | 33 | `src/features/day/activity-task-field.tsx`:51,82,105; `src/features/now/now-task-groups.tsx`:27; `src/features/oauth/scope-list.tsx`:34; `src/features/presets/number-input.tsx`:31; `src/features/server/change-server-sheet.tsx`:54; `src/features/server/server-line.tsx`:23; `src/features/task/project-sheet.tsx`:36; `src/features/week/week-grid.tsx`:299; `src/platform/update-banner.web.tsx`:98; `src/screens/decisions-screen.tsx`:124; `src/screens/login-parts.tsx`:52; `src/shared/assistant/action-cards.tsx`:26,78,89,118,131; `src/shared/assistant/questions.tsx`:54; `src/shared/task-fields/estimate-field.tsx`:72; `src/shared/tracking/choices-sheet.tsx`:107; `src/shared/tracking/running-row.tsx`:69,93; `src/shared/tracking/time-bar-fold.tsx`:61; `src/shared/tracking/time-bar.tsx`:84,260; `src/ui/chip.tsx`:64; `src/ui/sidebar.tsx`:115,162,180; `src/ui/text-field.tsx`:29; `src/ui/time-input.tsx`:32; `src/ui/toast.tsx`:140 |
| `px-3.5` | 14 web / 12.25 native | half-step | 6 | `src/features/now/calendar-prompt.tsx`:28; `src/features/presets/preset-sections.tsx`:26; `src/features/task/work-progress.tsx`:61; `src/shared/tracking/choice-row.tsx`:45; `src/shared/tracking/choices-sheet.tsx`:134; `src/shared/zone-banner.tsx`:22 |
| `px-4` | 16 web / 14 native |  | 21 | `src/features/now/project-chips.tsx`:25; `src/features/presets/preset-form.tsx`:214; `src/features/presets/presets-list.tsx`:134; `src/features/task/subtask-checklist.tsx`:88; `src/features/task/task-description.tsx`:40,48; `src/features/task/task-footer.tsx`:57,69; `src/platform/update-banner.web.tsx`:81; `src/screens/app-link-screen.web.tsx`:26; `src/screens/decisions-screen.tsx`:121,135; `src/screens/history-screen.tsx`:116; `src/screens/inbox-screen.tsx`:27,39; `src/screens/login-return-screen.web.tsx`:18; `src/screens/login-screen.web.tsx`:113; `src/screens/oauth-screen.web.tsx`:19; `src/screens/projects-screen.tsx`:64,72; `src/ui/button.tsx`:203 |
| `px-5` | 20 web / 17.5 native |  | 19 | `src/features/day/day-screen.tsx`:196,263,280,323; `src/features/insights/insights-screen.tsx`:101; `src/features/notifications/notifications-screen.tsx`:150,233; `src/features/permissions/onboarding-screen.web.tsx`:12; `src/features/permissions/permission-card.tsx`:130; `src/features/permissions/permissions-screen.tsx`:37,71; `src/features/permissions/permissions-screen.web.tsx`:11; `src/features/task/task-summary.tsx`:169; `src/screens/history-screen.tsx`:169,184; `src/screens/more-screen.tsx`:44; `src/screens/settings-screen.tsx`:37,146; `src/ui/sheet.tsx`:155 |
| `px-6` | 24 web / 21 native |  | 11 | `src/features/now/composer/composer-pane.tsx`:9; `src/features/oauth/consent-flow.tsx`:126; `src/features/permissions/onboarding-screen.tsx`:29; `src/features/server/incompatible-screen.tsx`:27; `src/features/week/picked-details.tsx`:277; `src/screens/app-link-screen.web.tsx`:27; `src/screens/crash-screen.tsx`:27; `src/screens/login-return-screen.web.tsx`:19; `src/screens/login-screen.tsx`:114; `src/screens/login-screen.web.tsx`:114; `src/screens/not-found-screen.tsx`:13 |
| `px-8` | 32 web / 28 native |  | 2 | `src/features/week/picked-details.tsx`:265; `src/screens/auth-screen.tsx`:43 |
| `px-10` | 40 web / 35 native |  | 1 | `src/ui/empty-state.tsx`:13 |
| `py-0.5` | 2 web / 1.75 native | half-step | 1 | `src/features/presets/presets-list.tsx`:34 |
| `py-1` | 4 web / 3.5 native |  | 10 | `src/features/day/day-screen.tsx`:143; `src/features/now/composer/composer.tsx`:102; `src/features/server/change-server-sheet.tsx`:54; `src/features/sessions/session-row.tsx`:175; `src/features/task/task-summary.tsx`:88,98; `src/platform/update-banner.web.tsx`:98; `src/ui/toast.tsx`:125; `src/ui/tooltip.tsx`:33; `src/ui/tooltip.web.tsx`:153 |
| `py-1.5` | 6 web / 5.25 native | half-step | 1 | `src/shared/activity-usage.tsx`:18 |
| `py-2` | 8 web / 7 native |  | 13 | `src/features/day/activity-task-field.tsx`:82; `src/features/day/day-screen.tsx`:58; `src/features/day/phone-section.tsx`:198; `src/features/oauth/scope-list.tsx`:34; `src/features/server/change-server-sheet.tsx`:41; `src/features/settings/settings-links.tsx`:23; `src/features/task/task-description.tsx`:109; `src/screens/history-screen.tsx`:189; `src/shared/activity-usage.tsx`:138; `src/shared/assistant/action-cards.tsx`:26; `src/shared/tracking/choice-row.tsx`:45; `src/ui/button.tsx`:203; `src/ui/skeleton.tsx`:39 |
| `py-2.5` | 10 web / 8.75 native | half-step | 7 | `src/features/now/composer/quick-line.tsx`:154; `src/platform/update-banner.web.tsx`:81; `src/screens/decisions-screen.tsx`:63,70; `src/screens/history-screen.tsx`:47; `src/ui/text-field.tsx`:30; `src/ui/toast.tsx`:133 |
| `py-3` | 12 web / 10.5 native |  | 6 | `src/features/notifications/notifications-screen.tsx`:150; `src/features/now/calendar-prompt.tsx`:28; `src/features/presets/override-row.tsx`:34; `src/screens/login-return-screen.web.tsx`:31; `src/shared/task-row.tsx`:71; `src/shared/zone-banner.tsx`:22 |
| `py-4` | 16 web / 14 native |  | 3 | `src/features/permissions/permission-card.tsx`:130; `src/features/permissions/permissions-screen.tsx`:37; `src/screens/settings-screen.tsx`:37 |
| `py-6` | 24 web / 21 native |  | 2 | `src/features/day/day-screen.tsx`:323; `src/screens/settings-screen.tsx`:146 |
| `py-8` | 32 web / 28 native |  | 5 | `src/features/oauth/consent-flow.tsx`:126; `src/screens/app-link-screen.web.tsx`:27; `src/screens/login-return-screen.web.tsx`:19; `src/screens/login-screen.web.tsx`:114; `src/screens/oauth-screen.web.tsx`:19 |
| `py-px` | 1px |  | 1 | `src/ui/color.tsx`:98 |
| `pt-0.5` | 2 web / 1.75 native | half-step | 1 | `src/features/week/picked-details.tsx`:82 |
| `pt-1` | 4 web / 3.5 native |  | 4 | `src/features/presets/preset-sections.tsx`:26; `src/features/sessions/sessions-section.tsx`:102; `src/features/settings/notification-settings.tsx`:35; `src/features/task/task-screen.tsx`:32 |
| `pt-1.5` | 6 web / 5.25 native | half-step | 1 | `src/ui/tab-bar.tsx`:95 |
| `pt-2` | 8 web / 7 native |  | 6 | `src/features/now/composer/ai-status.tsx`:81,88,93; `src/features/presets/deadline-row.tsx`:92; `src/features/presets/recurrence-row.tsx`:75; `src/features/settings/category-estimates.tsx`:22 |
| `pt-2.5` | 10 web / 8.75 native | half-step | 3 | `src/features/presets/preset-sections.tsx`:31; `src/shared/tracking/time-bar.tsx`:260; `src/ui/sheet.tsx`:158 |
| `pt-3` | 12 web / 10.5 native |  | 3 | `src/features/task/task-footer.tsx`:57,69; `src/ui/sheet.tsx`:181 |
| `pt-3.5` | 14 web / 12.25 native | half-step | 2 | `src/features/task/work-progress.tsx`:61; `src/ui/back-header.tsx`:29 |
| `pt-[15px]` | 15px exact (arbitrary) | ARBITRARY | 1 | `src/ui/sheet.tsx`:175 |
| `pt-4` | 16 web / 14 native |  | 4 | `src/features/notifications/notifications-screen.tsx`:233; `src/features/presets/preset-form.tsx`:214; `src/screens/history-screen.tsx`:184; `src/shared/activity-usage.tsx`:72 |
| `pt-5` | 20 web / 17.5 native |  | 4 | `src/features/now/composer/composer-pane.tsx`:9; `src/shared/activity-usage.tsx`:111; `src/ui/sheet.tsx`:157; `src/ui/sidebar.tsx`:162 |
| `pt-6` | 24 web / 21 native |  | 2 | `src/features/week/picked-details.tsx`:277; `src/ui/screen-header.tsx`:32 |
| `pt-7` | 28 web / 24.5 native |  | 1 | `src/features/week/week-grid.tsx`:65 |
| `pb-1` | 4 web / 3.5 native |  | 4 | `src/features/presets/preset-sections.tsx`:31; `src/features/task/subtask-checklist.tsx`:89; `src/screens/history-screen.tsx`:169,185 |
| `pb-1.5` | 6 web / 5.25 native | half-step | 2 | `src/features/notifications/notifications-screen.tsx`:233; `src/features/task/work-progress.tsx`:61 |
| `pb-2` | 8 web / 7 native |  | 5 | `src/features/day/day-screen.tsx`:139; `src/features/day/phone-section.tsx`:103,129; `src/features/now/project-chips.tsx`:25; `src/shared/where-sat-line.tsx`:32 |
| `pb-2.5` | 10 web / 8.75 native | half-step | 2 | `src/shared/tracking/time-bar.tsx`:260; `src/ui/back-header.tsx`:29 |
| `pb-3` | 12 web / 10.5 native |  | 6 | `src/features/day/day-screen.tsx`:280; `src/features/permissions/permissions-screen.tsx`:71; `src/features/permissions/permissions-screen.web.tsx`:11; `src/screens/decisions-screen.tsx`:121; `src/screens/history-screen.tsx`:116; `src/ui/screen-header.tsx`:32 |
| `pb-4` | 16 web / 14 native |  | 1 | `src/ui/sidebar.tsx`:162 |
| `pb-6` | 24 web / 21 native |  | 2 | `src/features/presets/preset-form.tsx`:197; `src/features/presets/presets-list.tsx`:134 |
| `pb-8` | 32 web / 28 native |  | 1 | `src/shared/activity-usage.tsx`:111 |
| `pb-10` | 40 web / 35 native |  | 1 | `src/features/week/picked-details.tsx`:277 |
| `pb-24` | 96 web / 84 native |  | 2 | `src/features/now/composer/composer-pane.tsx`:9; `src/ui/screen.tsx`:40 |
| `pl-1` | 4 web / 3.5 native |  | 3 | `src/features/now/composer/composer-form.tsx`:127; `src/shared/task-fields/subtask-list.tsx`:43,119 |
| `pl-2` | 8 web / 7 native |  | 3 | `src/shared/task-fields/deadline-policy-field.tsx`:105; `src/ui/back-header.tsx`:30; `src/ui/screen-header.tsx`:33 |
| `pl-3` | 12 web / 10.5 native |  | 3 | `src/features/presets/deadline-row.tsx`:92; `src/features/presets/recurrence-row.tsx`:75; `src/shared/task-row.tsx`:71 |
| `pl-4` | 16 web / 14 native |  | 1 | `src/ui/toast.tsx`:125 |
| `pl-5` | 20 web / 17.5 native |  | 2 | `src/ui/back-header.tsx`:30; `src/ui/screen-header.tsx`:33 |
| `pl-11` | 44 web / 38.5 native |  | 1 | `src/features/sessions/session-row.tsx`:103 |
| `pl-[116px]` | 116px exact (arbitrary) | ARBITRARY | 4 | `src/features/day/day-screen.tsx`:139; `src/features/day/phone-section.tsx`:103,129; `src/shared/where-sat-line.tsx`:33 |
| `pr-1` | 4 web / 3.5 native |  | 1 | `src/ui/toast.tsx`:125 |
| `pr-2` | 8 web / 7 native |  | 1 | `src/shared/task-fields/subtask-list.tsx`:104 |
| `pr-3` | 12 web / 10.5 native |  | 2 | `src/features/week/week-screen.tsx`:115; `src/shared/task-row.tsx`:71 |
| `pr-4` | 16 web / 14 native |  | 1 | `src/ui/back-header.tsx`:29 |
| `pr-5` | 20 web / 17.5 native |  | 1 | `src/ui/screen-header.tsx`:32 |
| `-m-[11px]` | 11px exact (arbitrary) | ARBITRARY | 1 | `src/ui/check-circle.tsx`:28 |
| `mx-3` | 12 web / 10.5 native |  | 2 | `src/features/now/now-task-groups.tsx`:26; `src/shared/task-list.tsx`:132 |
| `mx-[13px]` | 13px exact (arbitrary) | ARBITRARY | 1 | `src/ui/slider.tsx`:67 |
| `mx-4` | 16 web / 14 native |  | 11 | `src/features/now/calendar-prompt.tsx`:28; `src/features/now/composer/composer.tsx`:102; `src/features/presets/preset-form.tsx`:43,119; `src/features/presets/preset-preview.tsx`:24; `src/features/presets/preset-sections.tsx`:26; `src/features/task/source-text.tsx`:17; `src/features/task/work-progress.tsx`:61; `src/screens/project-screen.tsx`:45,84; `src/shared/zone-banner.tsx`:22 |
| `mx-5` | 20 web / 17.5 native |  | 13 | `src/features/day/phone-section.tsx`:49,146,287,296,305; `src/features/presets/preset-form.tsx`:210; `src/features/task/task-description.tsx`:27,109; `src/screens/inbox-screen.tsx`:24; `src/screens/more-screen.tsx`:58; `src/screens/presets-screen.tsx`:12; `src/screens/project-screen.tsx`:134; `src/shared/activity-usage.tsx`:111 |
| `mx-auto` | auto |  | 2 | `src/screens/oauth-screen.web.tsx`:19; `src/ui/toast.tsx`:108 |
| `-my-1` | 4 web / 3.5 native |  | 1 | `src/ui/chip.tsx`:59 |
| `-my-1.5` | 6 web / 5.25 native | half-step | 1 | `src/ui/chip.tsx`:59 |
| `mt-[-10px]` | -10px exact (arbitrary) | ARBITRARY | 1 | `src/ui/check-circle.tsx`:28 |
| `mt-1` | 4 web / 3.5 native |  | 3 | `src/features/week/picked-details.tsx`:283; `src/ui/screen-header.tsx`:55; `src/ui/sheet.tsx`:80 |
| `-mt-1.5` | 6 web / 5.25 native | half-step | 2 | `src/features/week/picked-details.tsx`:285; `src/ui/sheet.tsx`:84 |
| `mt-2` | 8 web / 7 native |  | 1 | `src/shared/task-list.tsx`:128 |
| `mt-3` | 12 web / 10.5 native |  | 5 | `src/features/presets/preset-form.tsx`:210; `src/features/presets/preset-preview.tsx`:24; `src/features/presets/preset-sections.tsx`:26; `src/ui/sheet.tsx`:170,174 |
| `mt-4` | 16 web / 14 native |  | 4 | `src/features/day/phone-section.tsx`:287,296,305; `src/features/presets/preset-form.tsx`:119 |
| `mt-5` | 20 web / 17.5 native |  | 1 | `src/shared/activity-usage.tsx`:111 |
| `mt-px` | 1px |  | 1 | `src/features/presets/preset-preview.tsx`:31 |
| `mb-1` | 4 web / 3.5 native |  | 3 | `src/features/now/composer/quick-line.tsx`:223,238; `src/features/oauth/scope-list.tsx`:25 |
| `mb-2` | 8 web / 7 native |  | 1 | `src/screens/projects-screen.tsx`:72 |
| `mb-3` | 12 web / 10.5 native |  | 13 | `src/features/day/phone-section.tsx`:49,146; `src/features/now/calendar-prompt.tsx`:28; `src/features/now/composer/composer.tsx`:102; `src/screens/inbox-screen.tsx`:24; `src/screens/more-screen.tsx`:58; `src/screens/presets-screen.tsx`:12; `src/screens/project-screen.tsx`:134; `src/screens/projects-screen.tsx`:25,36; `src/shared/zone-banner.tsx`:22; `src/ui/sidebar.tsx`:165,180 |
| `mb-4` | 16 web / 14 native |  | 4 | `src/screens/inbox-screen.tsx`:27; `src/screens/project-screen.tsx`:45,84; `src/ui/sheet.tsx`:54 |
| `mr-1` | 4 web / 3.5 native |  | 1 | `src/features/day/day-screen.tsx`:281 |
| `-mr-2` | 8 web / 7 native |  | 2 | `src/features/week/picked-details.tsx`:285; `src/ui/sheet.tsx`:84 |
| `mr-auto` | auto |  | 1 | `src/features/projects/project-form.tsx`:76 |
| `gap-0.5` | 2 web / 1.75 native | half-step | 14 | `src/features/insights/patterns.tsx`:48; `src/features/notifications/notifications-screen.tsx`:38; `src/features/now/calendar-prompt.tsx`:31; `src/features/now/composer/quick-line.tsx`:222,238; `src/features/permissions/permission-card.tsx`:14; `src/features/task/task-summary.tsx`:65; `src/screens/decisions-screen.tsx`:63,75; `src/screens/history-screen.tsx`:49; `src/screens/project-screen.tsx`:23; `src/shared/activity-usage.tsx`:40; `src/shared/tracking/time-bar.tsx`:167; `src/ui/tab-bar.tsx`:59 |
| `gap-1` | 4 web / 3.5 native |  | 34 | `src/auth/telegram-widget.web.tsx`:103; `src/features/day/activity-task-field.tsx`:62; `src/features/day/day-nav.tsx`:36; `src/features/day/day-screen.tsx`:94; `src/features/day/phone-section.tsx`:305; `src/features/insights/insights-screen.tsx`:82; `src/features/insights/patterns.tsx`:87,128,134; `src/features/notifications/notifications-screen.tsx`:48; `src/features/now/composer/ai-status.tsx`:44; `src/features/now/now-task-groups.tsx`:38; `src/features/oauth/consent-flow.tsx`:133; `src/features/permissions/permissions-screen.tsx`:37; `src/features/presets/presets-list.tsx`:62; `src/features/projects/color-swatches.tsx`:23; `src/features/sessions/connect-ai-sheet.tsx`:66; `src/features/settings/notification-settings.tsx`:33; `src/features/task/task-header.tsx`:119; `src/features/task/work-progress.tsx`:61; `src/features/week/picked-details.tsx`:85,201; `src/features/week/week-screen.tsx`:75; `src/screens/history-screen.tsx`:116; `src/screens/login-screen.tsx`:44; `src/shared/assistant/action-cards.tsx`:26; `src/shared/task-fields/subtask-list.tsx`:185; `src/shared/tracking/choice-row.tsx`:48; `src/shared/tracking/running-row.tsx`:48; `src/ui/back-header.tsx`:29; `src/ui/calendar.tsx`:155; `src/ui/screen-header.tsx`:36; `src/ui/sidebar.tsx`:162; `src/ui/skeleton.tsx`:37 |
| `gap-[5px]` | 5px exact (arbitrary) | ARBITRARY | 2 | `src/features/presets/preset-preview.tsx`:32; `src/shared/task-row.tsx`:80 |
| `gap-1.5` | 6 web / 5.25 native | half-step | 39 | `src/features/day/activity-sheet.tsx`:57,59; `src/features/day/day-screen.tsx`:280; `src/features/notifications/answers.tsx`:63; `src/features/notifications/notifications-screen.tsx`:150; `src/features/now/composer/ai-status.tsx`:48,93; `src/features/now/project-chips.tsx`:25; `src/features/permissions/permission-card.tsx`:69; `src/features/presets/choice-chips.tsx`:26; `src/features/presets/preset-form.tsx`:63; `src/features/presets/recurrence-row.tsx`:42; `src/features/sessions/os-picker.tsx`:87,96; `src/features/settings/notification-settings.tsx`:216; `src/features/task/close-preview.tsx`:60; `src/features/task/give-up-fields.tsx`:21,44; `src/features/task/source-text.tsx`:21; `src/features/task/task-summary.tsx`:87,98; `src/features/task/when-picker.tsx`:72; `src/shared/activity-usage.tsx`:18; `src/shared/assistant/questions.tsx`:78; `src/shared/task-fields/deadline-policy-field.tsx`:109,183; `src/shared/task-fields/estimate-field.tsx`:104; `src/shared/task-fields/option-row.tsx`:13,15; `src/shared/task-fields/recurrence-field.tsx`:55,115; `src/shared/task-fields/when-chips.tsx`:22; `src/shared/task-list.tsx`:132; `src/shared/tracking/running-row.tsx`:93; `src/shared/tracking/time-bar-fold.tsx`:61; `src/ui/back-header.tsx`:43; `src/ui/chip.tsx`:64; `src/ui/segmented.tsx`:17; `src/ui/text-field.tsx`:24 |
| `gap-2` | 8 web / 7 native |  | 98 | `src/auth/telegram-widget.web.tsx`:108; `src/features/day/activity-sheet.tsx`:183; `src/features/day/activity-task-field.tsx`:45,51; `src/features/day/day-screen.tsx`:95; `src/features/day/phone-section.tsx`:49,56,198; `src/features/insights/patterns.tsx`:83; `src/features/notifications/answers.tsx`:64; `src/features/now/calendar-prompt.tsx`:37; `src/features/now/composer/ai-status.tsx`:37; `src/features/now/composer/composer-form.tsx`:122; `src/features/now/now-task-groups.tsx`:29; `src/features/oauth/dev-identity.tsx`:20; `src/features/oauth/scope-list.tsx`:24; `src/features/permissions/onboarding-screen.tsx`:33; `src/features/permissions/permission-card.tsx`:130; `src/features/presets/deadline-row.tsx`:55,92; `src/features/presets/override-row.tsx`:34; `src/features/presets/preset-form.tsx`:119,214; `src/features/presets/preset-preview.tsx`:24; `src/features/presets/presets-list.tsx`:65,102; `src/features/projects/project-form.tsx`:75; `src/features/sessions/connect-ai-sheet.tsx`:45; `src/features/sessions/session-row.tsx`:103,111,175; `src/features/sessions/sessions-section.tsx`:130; `src/features/settings/category-estimates.tsx`:22,23; `src/features/settings/delete-account.tsx`:154,225; `src/features/settings/notification-settings.tsx`:35,48,148,174,179,228; `src/features/settings/timezone-row.tsx`:23; `src/features/task/give-up-fields.tsx`:42; `src/features/task/project-sheet.tsx`:82; `src/features/task/source-text.tsx`:17; `src/features/task/task-description.tsx`:37,109; `src/features/task/task-footer.tsx`:69; `src/features/task/task-summary.tsx`:170; `src/features/task/when-picker.tsx`:17,18,70; `src/features/week/picked-details.tsx`:278; `src/screens/history-screen.tsx`:47; `src/screens/inbox-card.tsx`:44; `src/screens/login-parts.tsx`:45; `src/screens/login-screen.tsx`:115; `src/screens/login-screen.web.tsx`:115; `src/screens/project-screen.tsx`:84; `src/screens/projects-screen.tsx`:25; `src/screens/review-card.tsx`:18,28; `src/screens/settings-screen.tsx`:37; `src/shared/activity-usage.tsx`:19,72; `src/shared/assistant/action-cards.tsx`:75,113,118,131; `src/shared/task-fields/date-field.tsx`:115,134; `src/shared/task-fields/deadline-policy-field.tsx`:55,105,181; `src/shared/task-fields/recurrence-field.tsx`:54,114,173; `src/shared/task-fields/subtask-list.tsx`:104; `src/shared/task-fields/task-fields.tsx`:53; `src/shared/tracking/calendar-choices.tsx`:31; `src/shared/tracking/choice-row.tsx`:77; `src/shared/tracking/choices-sheet.tsx`:107,134; `src/shared/tracking/running-row.tsx`:21,47; `src/shared/tracking/time-bar.tsx`:52,81,224,260,268; `src/ui/button.tsx`:203; `src/ui/calendar.tsx`:116; `src/ui/sheet-actions.tsx`:37; `src/ui/sheet.tsx`:74; `src/ui/sidebar.tsx`:165,180; `src/ui/skeleton.tsx`:41 |
| `gap-2.5` | 10 web / 8.75 native | half-step | 7 | `src/features/now/calendar-prompt.tsx`:28; `src/screens/inbox-card.tsx`:41; `src/screens/inbox-screen.tsx`:27,39; `src/shared/task-fields/subtask-list.tsx`:43,119; `src/shared/zone-banner.tsx`:22 |
| `gap-3` | 12 web / 10.5 native |  | 71 | `src/features/day/activity-sheet.tsx`:88; `src/features/day/day-screen.tsx`:58; `src/features/insights/card.tsx`:15; `src/features/insights/insights-screen.tsx`:43,65,101; `src/features/insights/patterns.tsx`:120,126; `src/features/notifications/notifications-screen.tsx`:154; `src/features/now/now-task-groups.tsx`:74; `src/features/oauth/client-card.tsx`:14,15; `src/features/oauth/consent-flow.tsx`:38,82,127; `src/features/oauth/scope-list.tsx`:34; `src/features/permissions/onboarding-screen.tsx`:161; `src/features/permissions/permission-card.tsx`:86,134; `src/features/permissions/permissions-screen.tsx`:44; `src/features/presets/override-row.tsx`:35; `src/features/presets/preset-form.tsx`:43; `src/features/presets/preset-preview.tsx`:30; `src/features/presets/recurrence-row.tsx`:75; `src/features/projects/project-form.tsx`:44; `src/features/server/change-server-sheet.tsx`:41,130; `src/features/server/incompatible-screen.tsx`:30; `src/features/sessions/add-computer.tsx`:73; `src/features/sessions/computer-steps.tsx`:46; `src/features/sessions/session-row.tsx`:176; `src/features/sessions/sessions-section.tsx`:126; `src/features/settings/category-estimates.tsx`:17; `src/features/settings/delete-account.tsx`:197,250; `src/features/settings/notification-settings.tsx`:230; `src/features/settings/settings-links.tsx`:23; `src/features/task/close-preview.tsx`:24; `src/features/task/give-up-fields.tsx`:20; `src/features/task/project-sheet.tsx`:36; `src/features/task/subtask-checklist.tsx`:54; `src/features/task/task-description.tsx`:27; `src/features/task/task-footer.tsx`:57; `src/features/task/task-summary.tsx`:130,190,191,196; `src/features/week/picked-details.tsx`:81,131; `src/screens/auth-screen.tsx`:61; `src/screens/decisions-screen.tsx`:70; `src/screens/history-screen.tsx`:48; `src/screens/login-parts.tsx`:81; `src/screens/login-screen.tsx`:69; `src/screens/login-screen.web.tsx`:55; `src/screens/more-screen.tsx`:44,58; `src/screens/not-found-screen.tsx`:13; `src/screens/projects-screen.tsx`:72; `src/screens/settings-screen.tsx`:146; `src/shared/activity-usage.tsx`:111,112; `src/shared/assistant/action-cards.tsx`:165; `src/shared/task-fields/date-field.tsx`:104; `src/shared/task-row.tsx`:71; `src/shared/tracking/choice-row.tsx`:45; `src/ui/empty-state.tsx`:13; `src/ui/sheet.tsx`:170; `src/ui/sidebar.tsx`:115; `src/ui/skeleton.tsx`:39; `src/ui/toast.tsx`:125 |
| `gap-3.5` | 14 web / 12.25 native | half-step | 2 | `src/features/now/composer/composer-form.tsx`:251; `src/shared/task-fields/task-fields.tsx`:199 |
| `gap-4` | 16 web / 14 native |  | 9 | `src/features/now/composer/composer-form.tsx`:251; `src/features/permissions/onboarding-screen.web.tsx`:13; `src/features/presets/presets-list.tsx`:134; `src/features/task/task-summary.tsx`:169; `src/features/week/picked-details.tsx`:277; `src/screens/auth-screen.tsx`:43; `src/screens/crash-screen.tsx`:27; `src/ui/logo.tsx`:43; `src/ui/switch-row.tsx`:45 |
| `gap-[18px]` | 18px exact (arbitrary) | ARBITRARY | 1 | `src/ui/sheet.tsx`:175 |
| `gap-5` | 20 web / 17.5 native |  | 5 | `src/features/oauth/consent-flow.tsx`:126; `src/features/permissions/onboarding-screen.tsx`:32; `src/features/task/task-screen.tsx`:32; `src/screens/app-link-screen.web.tsx`:27; `src/screens/login-return-screen.web.tsx`:19 |
| `gap-6` | 24 web / 21 native |  | 1 | `src/screens/login-screen.web.tsx`:114 |
| `gap-8` | 32 web / 28 native |  | 2 | `src/features/server/incompatible-screen.tsx`:29; `src/screens/login-screen.tsx`:114 |
| `gap-x-1.5` | 6 web / 5.25 native | half-step | 1 | `src/shared/meta-line.tsx`:59 |
| `gap-x-2` | 8 web / 7 native |  | 2 | `src/features/sessions/sessions-section.tsx`:49; `src/shared/assistant/questions.tsx`:36 |
| `gap-x-3` | 12 web / 10.5 native |  | 1 | `src/ui/screen-header.tsx`:32 |
| `gap-x-4` | 16 web / 14 native |  | 2 | `src/platform/update-banner.web.tsx`:81; `src/shared/activity-usage.tsx`:124 |
| `gap-y-1` | 4 web / 3.5 native |  | 2 | `src/shared/activity-usage.tsx`:124; `src/shared/meta-line.tsx`:59 |
| `gap-y-1.5` | 6 web / 5.25 native | half-step | 1 | `src/platform/update-banner.web.tsx`:81 |
| `gap-y-2` | 8 web / 7 native |  | 1 | `src/ui/screen-header.tsx`:32 |
| `inset-x-4` | 16 web / 14 native |  | 1 | `src/ui/toast.tsx`:108 |
| `top-0` | 0 web / 0 native |  | 1 | `src/features/week/week-grid.tsx`:268 |
| `top-0.5` | 2 web / 1.75 native | half-step | 1 | `src/shared/notifications/notification-bell.tsx`:42 |
| `-top-[3px]` | 3px exact (arbitrary) | ARBITRARY | 1 | `src/ui/progress-bar.tsx`:30 |
| `-top-1.5` | 6 web / 5.25 native | half-step | 1 | `src/ui/tab-bar.tsx`:68 |
| `left-0` | 0 web / 0 native |  | 3 | `src/features/week/week-grid.tsx`:93,255,264 |
| `left-1.5` | 6 web / 5.25 native | half-step | 1 | `src/features/week/week-grid.tsx`:268 |
| `left-3` | 12 web / 10.5 native |  | 1 | `src/ui/toast.tsx`:107 |
| `right-0` | 0 web / 0 native |  | 2 | `src/features/week/week-grid.tsx`:255,264 |
| `right-0.5` | 2 web / 1.75 native | half-step | 2 | `src/features/week/week-grid.tsx`:268; `src/shared/notifications/notification-bell.tsx`:42 |
| `-right-3` | 12 web / 10.5 native |  | 1 | `src/ui/tab-bar.tsx`:68 |
| `bottom-0` | 0 web / 0 native |  | 1 | `src/features/week/week-grid.tsx`:268 |
| `bottom-1` | 4 web / 3.5 native |  | 1 | `src/ui/calendar.tsx`:81 |
| `bottom-4` | 16 web / 14 native |  | 1 | `src/ui/toast.tsx`:107 |

STEPS: [('[-10px]', 1), ('0.5', 16), ('1', 79), ('[5px]', 2), ('1.5', 53), ('2', 146), ('2.5', 19), ('[11px]', 1), ('3', 154), ('[13px]', 1), ('3.5', 20), ('[15px]', 1), ('4', 65), ('[18px]', 1), ('5', 45), ('6', 18), ('7', 1), ('8', 10), ('10', 2), ('11', 1), ('24', 2), ('[116px]', 4), ('px', 2), ('auto', 3)]

### 4.1 Derived scale

| step | web px | Android dp | uses |
|---|---|---|---|
| 0.5 | 2 | 1.75 | 16 |
| 1 | 4 | 3.5 | 79 |
| 1.5 | 6 | 5.25 | 53 |
| 2 | 8 | 7 | 146 |
| 2.5 | 10 | 8.75 | 19 |
| **3** | 12 | 10.5 | 154 |
| 3.5 | 14 | 12.25 | 20 |
| 4 | 16 | 14 | 65 |
| 5 | 20 | 17.5 | 45 |
| 6 | 24 | 21 | 18 |
| 7 | 28 | 24.5 | 1 |
| 8 | 32 | 28 | 10 |
| 10 | 40 | 35 | 2 |
| 11 | 44 | 38.5 | 1 |
| 24 | 96 | 84 | 2 |
| `px` | 1 | 1 | 2 |
| arbitrary | 5, 11, 13, 15, 18, 116, −10 | same | 11 |

**647 spacing classes, 101 distinct.** Off a 4 px grid: **108 half-steps** (0.5/1.5/2.5/3.5 → 2/6/10/14 px)
and **11 arbitrary** values. A 2-4-8-12-16-20-24-32 scale would cover 509 of 647 (79 %).

Flags:

- Horizontal screen gutter: `px-5`/`mx-5`/`pl-5`/`pr-5` (20) on headers and most sections, `px-4`/`mx-4`
  (16) on cards (zone banner `shared/zone-banner.tsx:22`, composer `features/now/composer/composer.tsx:102`,
  toast `ui/toast.tsx:108`, projects `screens/projects-screen.tsx:64`), `mx-3`/`px-3` (12) on Now's groups
  (`features/now/now-task-groups.tsx:26`, `shared/task-list.tsx:132`), `px-2` (8) on the task list
  (`shared/task-list.tsx:67`). Four gutters for one page edge.
- Card padding: `p-3` (9), `p-3.5` (10), `p-4` (4), `px-3.5 py-3` (zone banner), `px-3 py-2`
  (`shared/assistant/action-cards.tsx:26`).
- The sheet uses three arbitrary values in a row: `gap-[18px] pt-[15px]` (`ui/sheet.tsx:175`) and
  `rounded-t-[22px]` (`:158`).
- Indent `pl-[116px]` ×4 = the Day time column (`w-[104px]`, `features/day/day-screen.tsx:59`) + `gap-3`
  (12 px **on the web only**: on Android `gap-3` is 10.5, so the indent is off by 1.5 dp).
- `-m-[11px] mt-[-10px]` (`ui/check-circle.tsx:28`) hand-cancel a 44 px target around a 22 px circle —
  exact on the web, wrong on Android where `h-11` is 38.5.
- Raw JS paddings (§2.2) mix `+4`, `+8`, `+10`, `+12`, `+24`, `+32` over the safe-area insets.

---

## 5. Icons

`lucide-react-native` 1.52.0, **47 importing files, 45 distinct icons** (+ `LucideIcon` type ×8). Custom
SVGs: `PaceMark` (`src/ui/logo.tsx`, `react-native-svg`, strokes 16 in a 120 box, sizes 56 default /
40 `features/oauth/consent-flow.tsx:128` / 22 `ui/sidebar.tsx:166`), OS marks (`features/sessions/os-picker.tsx:23-73`,
16 px, filled paths, colours passed as `ink`/`cutout` from the palette `:105-106`). The check circle
(`ui/check-circle.tsx`) is a bordered `View` + lucide `Check`, not an SVG. Five `ActivityIndicator`
spinners: four take no colour, i.e. the platform grey/teal (`ui/button.tsx:216` — also on the lime primary,
`screens/auth-screen.tsx:62`, `screens/login-parts.tsx:82`, `auth/telegram-widget.web.tsx:109`), one takes
the icon colour (`features/now/composer/quick-line.tsx:112`).

Icons imported (count = importing files): ChevronRight 8, ChevronDown 7, X 6, ChevronUp 6, ChevronLeft 6,
Check 6, Plus 5, CalendarDays 5, Pencil 4, Square 3, Play 3, Inbox 3, Clock 3, Zap 2, Timer 2, Settings 2,
History 2, Folder 2, ChartColumn 2, CalendarRange 2, and once each: Video, Users, User, Trash2,
SquareTerminal, Smartphone, Search, Repeat, Plug, Pause, Moon, MapPin, Laptop, House, Globe, ExternalLink,
Ellipsis, Coffee, CalendarClock, Bell, Ban, ArrowUp, AlignLeft.

### 5.1 Every rendered icon with its props

lucide defaults: `size 24`, `strokeWidth 2`, `color currentColor` (= black on native without a colour).

| where | icon | size | stroke | colour |
|---|---|---|---|---|
| `ui/button.tsx:99` | any (Button `icon`) | 18 | 1.75 | accentFg / warn / fg |
| `ui/icon-button.tsx:43` | any (19 call sites, list in §7) | 18 | 1.75 | fg2 (plain) / fg |
| `ui/back-header.tsx:40` | ChevronLeft / X | 20 | 1.75 | fg2 |
| `ui/screen-header.tsx:44` | ChevronLeft | 20 | 1.75 | fg2 |
| `ui/tab-bar.tsx:63-67` | Zap, Clock, Inbox, Ellipsis | 20 | 1.75 | accentQuietText / muted |
| `ui/sidebar.tsx:120-124` | 8 destinations | 18 | 1.75 | accentQuietText / muted |
| `ui/sidebar.tsx:183` | Plus | 18 | 1.75 | accentFg |
| `ui/check-circle.tsx:39` | Check | 14 | 2.5 | bg |
| `features/task/subtask-checklist.tsx:25` | Check | 14 | 2.5 | bg |
| `features/oauth/scope-list.tsx:46` | Check | 12 | **3** | accentQuietFg |
| `features/task/project-sheet.tsx:50` | Check | 18 | 2 (default) | fg |
| `shared/tracking/choice-row.tsx:57` | Check | 16 | 2 (default) | fg |
| `shared/assistant/questions.tsx:80` | Check | 16 | 2 | fg2 (+ `marginTop: 2`) |
| `screens/more-screen.tsx:49` | 5 destinations | **20** | 1.75 | muted |
| `screens/more-screen.tsx:51` | ChevronRight | 16 | 1.75 | faint |
| `screens/decisions-screen.tsx:78` | ChevronRight | 16 | 1.75 | faint |
| `features/presets/presets-list.tsx:75` | ChevronRight | 16 | 1.75 | faint |
| `features/settings/settings-links.tsx:32` | ChevronRight | 16 | 1.75 | faint |
| `features/day/activity-task-field.tsx:59` | ChevronDown | 16 | 2 (default) | muted |
| `features/task/task-header.tsx:133` | ChevronDown | 16 | 2 | muted |
| `features/task/source-text.tsx:28,30` | ChevronUp / Down | 16 | 2 | muted |
| `shared/task-list.tsx:138` | ChevronUp / Down | 16 | 2 | muted |
| `features/now/now-task-groups.tsx:47,49` | ChevronUp / Down | **15** | 2 (default) | muted |
| `shared/tracking/time-bar-fold.tsx:65` | ChevronUp / Down | 16 | 2 (default) | **fg2** |
| `features/day/day-screen.tsx:118` | Pencil | 16 | 1.75 | muted |
| `features/task/task-description.tsx:124` | Pencil | **15** | **1.8** | muted |
| `features/day/day-screen.tsx:202` | Plus | 16 | 1.75 | fg2 |
| `screens/projects-screen.tsx:30` | Plus | 16 | 2 (default) | fg |
| `shared/task-fields/subtask-list.tsx:109` | Plus | 16 | 2 | muted |
| `shared/task-fields/subtask-list.tsx:73` | X | 16 | 2 | muted |
| `features/now/composer/composer-form.tsx:147` | X (CloseIcon) | 20 | 1.75 | muted |
| `features/now/composer/quick-line.tsx:114-118` | Plus / ArrowUp / … | 18 | 2.25 lime / 1.75 | accentFg / fg2 / faint (disabled) |
| `features/sessions/session-row.tsx:62` | Laptop / Smartphone / Globe / Plug / SquareTerminal | 18 | 1.75 | fg2 |
| `features/week/picked-details.tsx:83` | CalendarDays, MapPin, User, Users, AlignLeft | 16 | 1.75 | muted |
| `features/week/week-screen.tsx:57-61` | Moon | 18 | 1.75 | accentQuietFg / fg2 |
| `features/task/when-picker.tsx:87` | CalendarDays (Chip `leading`) | 16 | 2 (default) | fg / fg2 |
| `shared/task-fields/date-field.tsx:66` | CalendarDays / CalendarClock / Play (Chip `leading`) | **14** | 1.75 | fg2 |
| `shared/task-fields/estimate-field.tsx:42` | Clock (Chip `leading`) | **14** | 1.75 | fg2 |
| `shared/meta-line.tsx:31` | Repeat | **13** | **2.25** | muted |
| `shared/tracking/time-bar.tsx:109` | Play (filled) | 16 | 2 (default) | accentFg + `fill` |
| `shared/tracking/time-bar.tsx:174` | Timer / Coffee / CalendarDays / … | 18 | 2 (default) | accentQuietFg / fg2 / muted |
| `shared/tracking/running-row.tsx:99` | Square | 14 | 2 (default) | fg |
| `shared/tracking/choices-sheet.tsx:108` | Search | 16 | 2 (default) | muted |
| `shared/tracking/choices-sheet.tsx:137` | Square | 14 | 2 (default) | fg |
| `shared/notifications/notification-bell.tsx:41` | Bell | 18 | 1.75 | fg2 |
| `ui/logo.tsx:20,28` | PaceMark paths | 22–56 | 16/120 | faint, accentText, fg |

Icon passing: `IconButton` ×19 (all `variant="plain"`), `Button icon=` ×2
(`features/task/task-footer.tsx:24`, `features/week/picked-details.tsx:173`), `Fact icon=` ×5
(`picked-details.tsx:132,136,150,155,167`), menu tables in `ui/sidebar.tsx:44-84`, `ui/tab-bar.tsx:23-28`,
`screens/more-screen.tsx:29-33`, `features/sessions/session-row.tsx:23`.

### 5.2 Counts

| size | rendered sites | | stroke | rendered sites |
|---|---|---|---|---|
| 12 | 1 | | 1.75 (explicit) | 18 (+ 3 via `STROKE`, + 1 conditional) |
| 13 | 1 | | 1.8 | 1 |
| 14 | 6 | | 2 (explicit) | 7 |
| 15 | 3 | | 2 (lucide default, no prop) | 13 |
| 16 | 21 | | 2.25 | 1 (+1 conditional) |
| 18 | 10 (incl. Button, IconButton, sidebar) | | 2.5 | 2 |
| 20 | 5 (incl. tab bar) | | 3 | 1 |
| 22 / 24 / 40 / 56 | PaceMark / UserAvatar | | 16 (logo, 120 box) | 2 |

**7 icon sizes (12–20) and 6 stroke widths (1.75, 1.8, 2, 2.25, 2.5, 3)** for 45 icons. About half of the
icons set `strokeWidth={1.75}` (21 sites + 1 conditional) and half draw at 2 (7 explicit, 13 by default), often within one screen (Day: Pencil 1.75
`day-screen.tsx:118` next to ChevronDown 2 `activity-task-field.tsx:59`). The same disclosure chevron is
drawn at 15 and 16 px, in `muted` and `fg2`. The trailing row chevron is consistent (16 / 1.75 / faint, 4×).
Colour always comes from `palette.*` (no hard-coded icon colour); placeholder-like icons use `muted`, row
chevrons `faint`.

---

## 6. Borders, shadows, elevation, surfaces

### Border / shadow / opacity classes

| class | count | references |
|---|---|---|
| `border-line` | 91 | `src/features/day/activity-task-field.tsx`:51; `src/features/day/day-screen.tsx`:199,267; `src/features/day/phone-section.tsx`:198; `src/features/insights/card.tsx`:15; `src/features/insights/patterns.tsx`:48; `src/features/notifications/notifications-screen.tsx`:150; `src/features/now/calendar-prompt.tsx`:28; `src/features/now/composer/composer.tsx`:103; `src/features/now/now-task-groups.tsx`:26,27; `src/features/oauth/client-card.tsx`:14; `src/features/oauth/consent-flow.tsx`:126; `src/features/oauth/dev-identity.tsx`:20; `src/features/oauth/scope-list.tsx`:34; `src/features/permissions/permission-card.tsx`:130; `src/features/permissions/permissions-screen.tsx`:37; `src/features/presets/number-input.tsx`:32; `src/features/presets/override-row.tsx`:34; `src/features/presets/preset-form.tsx`:43,119; `src/features/presets/preset-preview.tsx`:24; `src/features/presets/preset-sections.tsx`:26; `src/features/presets/presets-list.tsx`:62,102; `src/features/projects/project-form.tsx`:44; `src/features/server/change-server-sheet.tsx`:54; `src/features/sessions/code-text.tsx`:13; `src/features/sessions/os-picker.tsx`:97; `src/features/settings/category-estimates.tsx`:22; `src/features/settings/settings-links.tsx`:23; `src/features/task/project-sheet.tsx`:37; `src/features/task/subtask-checklist.tsx`:54; `src/features/task/task-description.tsx`:27; `src/features/task/task-footer.tsx`:57,69; `src/features/task/task-summary.tsx`:190; `src/features/task/work-progress.tsx`:61; `src/features/week/week-grid.tsx`:250,255; `src/screens/app-link-screen.web.tsx`:27; `src/screens/decisions-screen.tsx`:63,70,124; `src/screens/history-screen.tsx`:47; `src/screens/inbox-card.tsx`:41; `src/screens/login-parts.tsx`:45; `src/screens/login-return-screen.web.tsx`:19; `src/screens/login-screen.web.tsx`:114; `src/screens/more-screen.tsx`:44,76; `src/screens/now-screen.tsx`:69; `src/screens/project-screen.tsx`:85; `src/screens/projects-screen.tsx`:25; `src/screens/review-card.tsx`:18; `src/screens/settings-screen.tsx`:37; `src/shared/activity-usage.tsx`:72,111; `src/shared/assistant/action-cards.tsx`:26,78,89,131,165; `src/shared/assistant/questions.tsx`:55; `src/shared/notifications/notification-bell.tsx`:35; `src/shared/task-fields/date-field.tsx`:104; `src/shared/task-fields/estimate-field.tsx`:73; `src/shared/task-fields/recurrence-field.tsx`:135; `src/shared/task-list.tsx`:132; `src/shared/tracking/choice-row.tsx`:45; `src/shared/tracking/choices-sheet.tsx`:107; `src/shared/tracking/running-row.tsx`:69,93; `src/shared/tracking/time-bar-fold.tsx`:61; `src/shared/tracking/time-bar.tsx`:84,139,260; `src/shared/zone-banner.tsx`:22; `src/ui/button.tsx`:20; `src/ui/chip.tsx`:17; `src/ui/icon-button.tsx`:36; `src/ui/sheet.tsx`:157,158,174,181; `src/ui/sidebar.tsx`:162; `src/ui/split-pane.tsx`:21; `src/ui/tab-bar.tsx`:95; `src/ui/text-field.tsx`:31; `src/ui/time-input.tsx`:32; `src/ui/toast.tsx`:125 |
| `border` | 60 | `src/features/day/activity-task-field.tsx`:51; `src/features/day/phone-section.tsx`:49; `src/features/insights/card.tsx`:15; `src/features/now/calendar-prompt.tsx`:28; `src/features/now/composer/composer.tsx`:102; `src/features/now/now-task-groups.tsx`:26; `src/features/oauth/client-card.tsx`:14; `src/features/oauth/consent-flow.tsx`:126; `src/features/oauth/dev-identity.tsx`:20; `src/features/oauth/scope-list.tsx`:34; `src/features/presets/number-input.tsx`:31; `src/features/presets/preset-form.tsx`:43,119; `src/features/presets/preset-preview.tsx`:24; `src/features/presets/preset-sections.tsx`:26; `src/features/presets/presets-list.tsx`:102; `src/features/projects/project-form.tsx`:44; `src/features/server/change-server-sheet.tsx`:54; `src/features/sessions/code-text.tsx`:13; `src/features/settings/delete-account.tsx`:197; `src/features/task/project-sheet.tsx`:36,44; `src/features/task/task-description.tsx`:27; `src/features/task/task-summary.tsx`:190; `src/features/task/work-progress.tsx`:61; `src/features/week/week-grid.tsx`:139; `src/platform/update-banner.web.tsx`:98; `src/screens/app-link-screen.web.tsx`:27; `src/screens/decisions-screen.tsx`:124; `src/screens/inbox-card.tsx`:41; `src/screens/login-parts.tsx`:45; `src/screens/login-return-screen.web.tsx`:19; `src/screens/login-screen.web.tsx`:114; `src/screens/project-screen.tsx`:84; `src/screens/projects-screen.tsx`:25,72; `src/screens/review-card.tsx`:18; `src/shared/assistant/action-cards.tsx`:26,78,89,131,165; `src/shared/assistant/questions.tsx`:55; `src/shared/notifications/notification-bell.tsx`:35; `src/shared/task-fields/date-field.tsx`:104; `src/shared/task-fields/estimate-field.tsx`:72; `src/shared/task-fields/recurrence-field.tsx`:135; `src/shared/tracking/choice-row.tsx`:45; `src/shared/tracking/choices-sheet.tsx`:107; `src/shared/tracking/running-row.tsx`:69,93; `src/shared/tracking/time-bar-fold.tsx`:61; `src/shared/tracking/time-bar.tsx`:84; `src/shared/zone-banner.tsx`:22; `src/ui/button.tsx`:20; `src/ui/icon-button.tsx`:36; `src/ui/sheet.tsx`:157; `src/ui/text-field.tsx`:29; `src/ui/time-input.tsx`:32; `src/ui/toast.tsx`:125 |
| `opacity-70` | 30 | `src/features/day/day-screen.tsx`:58; `src/features/notifications/notifications-screen.tsx`:57,205; `src/features/now/composer/composer-form.tsx`:144; `src/features/now/composer/quick-line.tsx`:104; `src/features/presets/presets-list.tsx`:65; `src/features/server/server-line.tsx`:23; `src/features/settings/settings-links.tsx`:23; `src/features/task/project-sheet.tsx`:36; `src/features/task/subtask-checklist.tsx`:54; `src/features/task/task-header.tsx`:119; `src/screens/decisions-screen.tsx`:70; `src/screens/more-screen.tsx`:44; `src/screens/projects-screen.tsx`:25,72; `src/shared/back-to-today.tsx`:24; `src/shared/task-fields/subtask-list.tsx`:63,104; `src/shared/task-list.tsx`:132; `src/shared/task-row.tsx`:80; `src/shared/tracking/choice-row.tsx`:45; `src/shared/tracking/choices-sheet.tsx`:134; `src/shared/tracking/running-row.tsx`:69,93; `src/shared/tracking/time-bar-fold.tsx`:61; `src/ui/back-header.tsx`:37; `src/ui/calendar.tsx`:65; `src/ui/screen-header.tsx`:41; `src/ui/sidebar.tsx`:115; `src/ui/toast.tsx`:140 |
| `border-t` | 24 | `src/features/day/day-screen.tsx`:199,267; `src/features/day/phone-section.tsx`:198; `src/features/notifications/notifications-screen.tsx`:150; `src/features/permissions/permission-card.tsx`:130; `src/features/permissions/permissions-screen.tsx`:37; `src/features/presets/override-row.tsx`:34; `src/features/settings/category-estimates.tsx`:22; `src/features/settings/settings-links.tsx`:23; `src/features/task/task-footer.tsx`:57,69; `src/features/week/week-grid.tsx`:255; `src/screens/decisions-screen.tsx`:63,70; `src/screens/history-screen.tsx`:47; `src/screens/more-screen.tsx`:76; `src/shared/activity-usage.tsx`:72,111; `src/shared/task-list.tsx`:132; `src/shared/tracking/time-bar.tsx`:260; `src/ui/sheet.tsx`:158,174,181; `src/ui/tab-bar.tsx`:95 |
| `border-2` | 13 | `src/features/projects/color-swatches.tsx`:45; `src/features/sessions/os-picker.tsx`:96; `src/features/week/week-grid.tsx`:132,138; `src/shared/assistant/questions.tsx`:55; `src/shared/tracking/time-bar.tsx`:167; `src/ui/button.tsx`:17; `src/ui/calendar.tsx`:67; `src/ui/chip.tsx`:17,20,21; `src/ui/slider.tsx`:72 |
| `opacity-80` | 12 | `src/features/day/activity-task-field.tsx`:51; `src/features/sessions/os-picker.tsx`:96; `src/features/week/week-screen.tsx`:50; `src/platform/update-banner.web.tsx`:98; `src/shared/assistant/questions.tsx`:43; `src/shared/notifications/notification-bell.tsx`:34; `src/shared/tracking/time-bar.tsx`:103,167; `src/ui/button.tsx`:203; `src/ui/chip.tsx`:59; `src/ui/icon-button.tsx`:35; `src/ui/sidebar.tsx`:180 |
| `border-fg` | 8 | `src/features/projects/color-swatches.tsx`:45; `src/features/task/project-sheet.tsx`:37; `src/features/task/subtask-checklist.tsx`:21; `src/shared/assistant/questions.tsx`:55; `src/ui/calendar.tsx`:67; `src/ui/check-circle.tsx`:35; `src/ui/chip.tsx`:17; `src/ui/slider.tsx`:72 |
| `opacity-50` | 7 | `src/features/task/subtask-checklist.tsx`:22; `src/shared/assistant/action-cards.tsx`:75,119,132; `src/shared/assistant/questions.tsx`:44; `src/shared/tracking/time-bar.tsx`:104; `src/ui/button.tsx`:205 |
| `border-b` | 6 | `src/features/insights/patterns.tsx`:48; `src/features/now/now-task-groups.tsx`:27; `src/features/presets/presets-list.tsx`:62; `src/features/task/subtask-checklist.tsx`:54; `src/screens/more-screen.tsx`:44; `src/screens/settings-screen.tsx`:37 |
| `border-muted` | 6 | `src/features/oauth/scope-list.tsx`:43; `src/features/presets/preset-preview.tsx`:31; `src/features/task/project-sheet.tsx`:44; `src/features/task/subtask-checklist.tsx`:21; `src/shared/task-fields/subtask-list.tsx`:19; `src/ui/check-circle.tsx`:35 |
| `border-dashed` | 5 | `src/features/oauth/dev-identity.tsx`:20; `src/features/presets/preset-preview.tsx`:24; `src/features/week/week-grid.tsx`:139; `src/shared/tracking/time-bar.tsx`:139; `src/ui/check-circle.tsx`:36 |
| `border-[1.5px]` | 5 | `src/features/oauth/scope-list.tsx`:42; `src/features/presets/preset-preview.tsx`:31; `src/features/task/subtask-checklist.tsx`:20; `src/shared/task-fields/subtask-list.tsx`:19; `src/ui/check-circle.tsx`:34 |
| `border-warn` | 5 | `src/features/presets/number-input.tsx`:32; `src/features/settings/delete-account.tsx`:197; `src/shared/task-fields/estimate-field.tsx`:73; `src/ui/button.tsx`:17; `src/ui/text-field.tsx`:31 |
| `border-accentQuiet` | 4 | `src/features/now/composer/composer.tsx`:103; `src/features/oauth/scope-list.tsx`:43; `src/features/sessions/os-picker.tsx`:97; `src/shared/tracking/time-bar.tsx`:133 |
| `border-r` | 3 | `src/screens/now-screen.tsx`:69; `src/ui/sidebar.tsx`:162; `src/ui/split-pane.tsx`:21 |
| `opacity-40` | 2 | `src/features/week/week-grid.tsx`:93; `src/ui/icon-button.tsx`:38 |
| `border-accentQuietText` | 2 | `src/features/week/week-grid.tsx`:132,138 |
| `shadow-lg` | 2 | `src/ui/sheet.tsx`:157; `src/ui/toast.tsx`:125 |
| `opacity-75` | 1 | `src/features/day/activity-task-field.tsx`:105 |
| `opacity-60` | 1 | `src/features/presets/override-row.tsx`:46 |
| `opacity-90` | 1 | `src/features/week/week-grid.tsx`:132 |
| `border-l` | 1 | `src/features/week/week-grid.tsx`:250 |
| `opacity-30` | 1 | `src/ui/calendar.tsx`:68 |

### Surface treatments (class strings with a background fill)

| fill | border | radius | shadow | count | references |
|---|---|---|---|---|---|
| `bg-accent` | none | rounded-lg | none | 4 | `src/features/task/task-description.tsx`:48; `src/shared/assistant/action-cards.tsx`:118; `src/shared/tracking/time-bar.tsx`:103; `src/ui/sidebar.tsx`:180 |
| `bg-accent` | none | none | none | 2 | `src/features/now/composer/quick-line.tsx`:105; `src/ui/button.tsx`:19 |
| `bg-accentQuiet` | border-accentQuiet | none | none | 3 | `src/features/oauth/scope-list.tsx`:43; `src/features/sessions/os-picker.tsx`:97; `src/shared/tracking/time-bar.tsx`:133 |
| `bg-accentQuiet` | none | none | none | 3 | `src/features/week/week-screen.tsx`:51; `src/platform/update-banner.web.tsx`:81; `src/ui/calendar.tsx`:66 |
| `bg-accentQuiet` | none | rounded-full | none | 3 | `src/shared/activity-usage.tsx`:31; `src/shared/user-avatar.tsx`:28; `src/ui/count-badge.tsx`:10 |
| `bg-accentQuiet` | border-2 border-accentQuietText | none | none | 1 | `src/features/week/week-grid.tsx`:138 |
| `bg-bg` | none | none | none | 22 | `app/_layout.tsx`:55; `src/app-state.tsx`:208; `src/auth/route-gate.tsx`:35; `src/features/now/composer/composer-pane.tsx`:8; `src/features/permissions/onboarding-screen.tsx`:29,256; `src/features/permissions/onboarding-screen.web.tsx`:12; `src/features/server/incompatible-screen.tsx`:27; `src/platform/update-banner.web.tsx`:137; `src/screens/app-link-screen.web.tsx`:26; `src/screens/auth-screen.tsx`:43,61; `src/screens/crash-screen.tsx`:27; `src/screens/login-return-screen.web.tsx`:18; `src/screens/login-screen.tsx`:114; `src/screens/login-screen.web.tsx`:113; `src/screens/not-found-screen.tsx`:13; `src/screens/now-screen.tsx`:68; `src/screens/oauth-screen.web.tsx`:18; `src/ui/screen.tsx`:32; `src/ui/split-pane.tsx`:20; `src/ui/theme-provider.tsx`:32 |
| `bg-bg` | border border-line | rounded-lg | none | 4 | `src/shared/assistant/action-cards.tsx`:26,78; `src/shared/tracking/choices-sheet.tsx`:107; `src/ui/time-input.tsx`:32 |
| `bg-bg` | border | rounded-lg | none | 2 | `src/features/presets/number-input.tsx`:31; `src/ui/text-field.tsx`:29 |
| `bg-bg` | border border-line | rounded-xl | none | 2 | `src/shared/task-fields/date-field.tsx`:104; `src/shared/task-fields/recurrence-field.tsx`:135 |
| `bg-bg` | border-t border-line | none | none | 2 | `src/shared/tracking/time-bar.tsx`:260; `src/ui/tab-bar.tsx`:95 |
| `bg-bg` | none | rounded-md | none | 1 | `src/features/oauth/client-card.tsx`:19 |
| `bg-bg` | none | rounded-lg | none | 1 | `src/features/task/close-preview.tsx`:60 |
| `bg-bg` | border border-line | none | none | 1 | `src/shared/assistant/questions.tsx`:55 |
| `bg-bg` | border-r border-line | none | none | 1 | `src/ui/sidebar.tsx`:162 |
| `bg-inverse` | none | rounded-md | none | 2 | `src/ui/tooltip.tsx`:33; `src/ui/tooltip.web.tsx`:153 |
| `bg-raised` | none | none | none | 6 | `src/features/presets/presets-list.tsx`:35; `src/features/projects/color-swatches.tsx`:34; `src/shared/task-row.tsx`:71; `src/ui/color.tsx`:83; `src/ui/icon-button.tsx`:37; `src/ui/sidebar.tsx`:116 |
| `bg-raised` | border border-line | rounded-lg | none | 3 | `src/features/oauth/client-card.tsx`:14; `src/features/server/change-server-sheet.tsx`:54; `src/features/sessions/code-text.tsx`:13 |
| `bg-raised` | border-2 border-fg | none | none | 2 | `src/shared/assistant/questions.tsx`:55; `src/ui/chip.tsx`:17 |
| `bg-raised` | none | rounded-lg | none | 1 | `src/features/insights/patterns.tsx`:87 |
| `bg-raised` | none | rounded-full | none | 1 | `src/features/sessions/session-row.tsx`:60 |
| `bg-raised` | border-fg | none | none | 1 | `src/features/task/project-sheet.tsx`:37 |
| `bg-raised` | none | rounded-md | none | 1 | `src/screens/login-parts.tsx`:52 |
| `bg-surface` | border border-line | rounded-xl | none | 17 | `src/features/insights/card.tsx`:15; `src/features/now/calendar-prompt.tsx`:28; `src/features/now/now-task-groups.tsx`:26; `src/features/oauth/consent-flow.tsx`:126; `src/features/presets/preset-form.tsx`:43,119; `src/features/presets/preset-sections.tsx`:26; `src/features/presets/presets-list.tsx`:102; `src/features/projects/project-form.tsx`:44; `src/features/task/task-description.tsx`:27; `src/features/task/task-summary.tsx`:190; `src/features/task/work-progress.tsx`:61; `src/screens/inbox-card.tsx`:41; `src/screens/login-parts.tsx`:45; `src/screens/review-card.tsx`:18; `src/shared/assistant/action-cards.tsx`:165; `src/shared/zone-banner.tsx`:22 |
| `bg-surface` | border border-line | rounded-lg | none | 4 | `src/features/day/activity-task-field.tsx`:51; `src/screens/decisions-screen.tsx`:124; `src/shared/tracking/choice-row.tsx`:45; `src/shared/tracking/time-bar.tsx`:84 |
| `bg-surface` | border border-line | rounded-2xl | none | 3 | `src/screens/app-link-screen.web.tsx`:27; `src/screens/login-return-screen.web.tsx`:19; `src/screens/login-screen.web.tsx`:114 |
| `bg-surface` | border border-line | none | none | 3 | `src/shared/notifications/notification-bell.tsx`:35; `src/ui/button.tsx`:20; `src/ui/icon-button.tsx`:36 |
| `bg-surface` | border-line | none | none | 2 | `src/features/sessions/os-picker.tsx`:97; `src/screens/project-screen.tsx`:85 |
| `bg-surface` | none | none | none | 2 | `src/shared/tracking/time-bar.tsx`:141; `src/ui/sheet.tsx`:155 |
| `bg-surface` | border | rounded-xl | none | 1 | `src/features/now/composer/composer.tsx`:102 |
| `bg-surface` | border border-warn | rounded-xl | none | 1 | `src/features/settings/delete-account.tsx`:197 |
| `bg-surface` | none | rounded-lg | none | 1 | `src/features/task/source-text.tsx`:35 |
| `bg-surface` | border-dashed border-line | none | none | 1 | `src/shared/tracking/time-bar.tsx`:139 |
| `bg-surface` | border-2 border-warn | none | none | 1 | `src/ui/button.tsx`:17 |
| `bg-surface` | border-2 border-line | none | none | 1 | `src/ui/chip.tsx`:17 |
| `bg-surface` | border-2 | none | none | 1 | `src/ui/chip.tsx`:21 |
| `bg-surface` | border-2 border-fg | rounded-full | none | 1 | `src/ui/slider.tsx`:72 |
| `bg-surface` | border border-line | rounded-xl | shadow-lg | 1 | `src/ui/toast.tsx`:125 |
| `bg-track` | none | rounded-full | none | 5 | `src/shared/tracking/running-row.tsx`:55; `src/ui/skeleton.tsx`:40,44,50; `src/ui/slider.tsx`:67 |
| `bg-track` | none | rounded-r | none | 2 | `src/features/insights/insights-screen.tsx`:50; `src/features/insights/patterns.tsx`:101 |
| `bg-track` | none | none | none | 2 | `src/features/task/task-summary.tsx`:99; `src/ui/color.tsx`:98 |
| `bg-track` | none | rounded-lg | none | 1 | `src/shared/tracking/choices-sheet.tsx`:134 |
| `bg-track` | none | rounded-sm | none | 1 | `src/ui/progress-bar.tsx`:25 |

(The fill/border table reads class strings; components that build a surface from several strings in
`cx()` — `Chip`, `Button`, `IconButton` — appear with their parts split, e.g. `ui/chip.tsx:17` without its
radius at `:64`.)

Findings:

- **Border width**: `border` 1 px (60), `border-2` (13: chips, danger button, slider thumb, week picked
  item, running time button), `border-[1.5px]` (5: check circle, subtask checks, preset preview, scope
  checkbox). Three widths; a checkbox ring (1.5) is thinner than a chip ring (2) and a today ring
  (`ui/calendar.tsx:67`, 2).
- **Border colour**: `border-line` 91 of 137 border-colour classes (21 of the 137 sit in the colour maps); `border-fg` 8 (selected neutral chip,
  today, checked circle, slider thumb); `border-muted` 6 (unchecked circles); `border-warn` 5 (errors,
  danger); `border-accentQuiet` 4; `border-accentQuietText` 2; `border-ink-*` via `OUTLINE`; project `/45`
  edges via `washClass`.
- **Dividers** are all `border-line` 1 px: `border-t` 24, `border-b` 6, `border-r` 3, `border-l` 1. Lists use
  both conventions — `border-b` under each row (`screens/more-screen.tsx:44`, `features/presets/presets-list.tsx:62`)
  vs `border-t` over each row (`features/settings/settings-links.tsx:23`, `screens/decisions-screen.tsx:63,70`,
  `shared/task-list.tsx:132`).
- **Surface recipe**: a card is `bg-surface border border-line` + radius (25×: `rounded-xl` 17, `rounded-lg` 4,
  `rounded-2xl` 3, toast 1) and gets **no shadow**;
  the only shadows are the wide dialog and the toast. Elevation is expressed by fill steps
  `bg` → `surface` → `raised`, but nested panels go *down* to `bg-bg` inside sheets (date and recurrence
  panels `shared/task-fields/date-field.tsx:104`, `recurrence-field.tsx:135`; action cards
  `shared/assistant/action-cards.tsx:26`) and inputs sit on `bg-bg` in `TextField`/`TimeInput`/choices search
  but on `bg-surface` in the time-bar task field (`shared/tracking/time-bar.tsx:84`) and on `bg-raised`
  without a border on login (`screens/login-parts.tsx:52`).
- **Card radius**: `rounded-xl` (17 surface cards + 2 `bg-bg` panels + composer + danger zone), `rounded-lg`
  (4 surface cards, 3 raised code/identity boxes, 1 `bg-bg` preview, the action cards), `rounded-2xl` (3 web login
  cards + the wide dialog) — 3 radii for "card"; inputs use `rounded-lg` (7), `rounded-md` (login), `rounded-pill`
  (estimate) or none (subtask, choices search inner field).
- **Selected state** is drawn five ways: `bg-raised` (task row `shared/task-row.tsx:71`, sidebar
  `ui/sidebar.tsx:116`), `border-2 border-fg bg-raised` (neutral chip `ui/chip.tsx:17`, question option
  `shared/assistant/questions.tsx:55`), project fill (coloured chip `ui/chip.tsx:20`), `bg-accentQuiet`
  (calendar day `ui/calendar.tsx:66`, OS picker, scope checkbox, running time button
  `shared/tracking/time-bar.tsx:133`, week night toggle `features/week/week-screen.tsx:51`), `border-2
  border-accentQuietText` (week item `features/week/week-grid.tsx:132,138`).

---

## 7. Component state matrix

Legend: ✔ = implemented (evidence), ✖ = missing, — = not applicable. "Focus-visible" means a visible
keyboard-focus style drawn by the app; react-native-web leaves `Pressable`s to the browser's default
outline, and `global.css:43-47` removes the outline from every `input`/`textarea`, so text fields show
**nothing** on focus unless the component draws it. "Hover" means a pointer-hover style (no `hover:`
class exists anywhere; `use-hotkey.web.tsx:15` only detects a fine pointer).

### 7.1 `src/ui/*`

| component | default | hover | pressed | focus-visible | disabled | loading | selected | error | phone vs desktop | a11y role / label |
|---|---|---|---|---|---|---|---|---|---|---|
| `button.tsx` | 4 variants `CONTAINER` :16-21, `LABEL` :23-28, `HINT` :30-35; `min-h-12 rounded-md px-4 py-2` :203 | ✖ | `active:opacity-80` :203 | ✖ (focus tracked only to restore it after busy, `useFocusThroughBusy` :132-153, `onFocus` :209) | `opacity-50` :205, `aria-disabled` :201, `disabled` :207 | `busy` → `ActivityIndicator` :216 (no colour → grey on accent), `aria-busy` :200 | — | `danger` variant `border-2 border-warn` :17 (destructive, not error) | wide + `auto` → `alignSelf:flex-start` :49-56; `ButtonWidthContext` `fill` in sheets | role `button` :199; name = children (`accessibilityLabel` only on spinner :216); `accessibilityHint` :197; `aria-keyshortcuts` :114-118 |
| `icon-button.tsx` | `h-11 w-11 rounded-md` :35; variants `surface` :36, `raised` :37 (**both unused: all 19 call sites pass `plain`**) | ✖ | `active:opacity-80` :35 | ✖ | `opacity-40` :38, `aria-disabled` :33, `disabled` :40 | ✖ | ✖ | — | — | `button` :32, label :31, hint :30 |
| `chip.tsx` | outer `h-11` target `-my-1(.5)` :59, pill `h-8`/`h-9` `rounded-pill px-3` :63-66, text 12 px :70 | ✖ | `active:opacity-80` :59 | ✖ | ✖ (no prop) | ✖ | ✔ `chipFill` :15-22 (`border-2 border-fg bg-raised` neutral / project fill), `chipText` :24-29, `aria-checked` :58 | ✖ | — | `radio` :57, label :56 |
| `segmented.tsx` | Chip row `gap-1.5` :17 | via Chip | via Chip | ✖ | ✖ | — | via Chip `selected` :24 | — | — | `radiogroup` :17, no group label |
| `switch-row.tsx` | native `Switch` :20; thumb `accentQuietFg`/`surface` :24, track `accentQuiet`/`muted` :25; web knob :18 | ✖ | native | ✔ web only `global.css:53-57` (`2px var(--pace-fg)`) | ✖ (no prop) | — | on/off colours :24-25 | — | web height 24 (`switch-size.web.ts:4`), native size on phone | label on Switch :21; row text 14/12 :47,49 |
| `slider.tsx` | track `mx-[13px] h-2 rounded-full bg-track` :67, fill `bg-fg` :68, thumb `h-[26px] w-[26px] border-2 border-fg bg-surface` :72 | — | `scale-110` while dragging :73 | — (native) | ✖ | — | — | — | phone only | `adjustable` :55, label :54, `aria-valuemin/max/now` :57-59, a11y actions :53 |
| `slider.web.tsx` | browser range input, `global.css:71-118` (track 8 px, thumb **26 webkit / 22 moz**) | ✖ (cursor only `global.css:77`) | ✖ | ✔ `global.css:120-124` | ✖ | — | — | — | web only | native input, `aria-label` :23 |
| `text-field.tsx` | `rounded-lg border bg-bg px-3 text-[15px]`, `h-11` / `min-h-24 py-2.5` multiline :29-31 (in-file) | ✖ | — | ✖ (outline removed `global.css:44-47`; no focused border) | ✖ (`editable={false}` not styled) | — | — | ✔ `border-warn` :31 + warn text with live region :40 | — | label Text :25 = `accessibilityLabel` :27; placeholder `palette.faint` :34 |
| `time-input.tsx` | `h-11 rounded-lg border border-line bg-bg px-3 text-[15px] tabular-nums` :32 | ✖ | — | ✖ | ✖ | — | — | ✖ (half-typed time not flagged) | — | label :30; placeholder `faint` :48 |
| `calendar.tsx` | day `h-10 flex-1 rounded-lg` :65; title 15 medium :128; weekdays 11 muted :145 | ✖ | `active:opacity-70` :65 | ✖ | `opacity-30` :68, `aria-disabled` :62 | — | ✔ `bg-accentQuiet` :66 + `text-accentQuietFg` :33, `aria-selected` :63; today `border-2 border-fg` :67; marked dot :79-84 | — | — | day `button` :61 (not `radio`/gridcell), label = full date :60; month title live region :127; prev/next IconButtons :118,132 |
| `check-circle.tsx` | 22 px `border-[1.5px] border-muted` :34-36 inside 44 px target `-m-[11px] mt-[-10px]` :28 | ✖ | ✖ | ✖ | `aria-disabled`/`disabled` when no `onPress` :27,29 (no visual) | — | ✔ `border-fg bg-fg` + Check 14/2.5 :35,39; `dashed` :36 | — | — | `checkbox` :25, `aria-checked` :26, label :24 |
| `sheet.tsx` | phone: `rounded-t-[22px] border-t border-line pt-2.5` :158, grab handle `h-1 w-9 rounded-sm` + `palette.faint` :54-55; wide: `rounded-2xl border border-line pt-5 shadow-lg` :157; `bg-surface px-5` :155; title 20 semibold :76; subtitle 13 :80; body `border-t` + `gap-[18px] pt-[15px]` :174-175; footer `border-t pt-3` :181 | — | backdrop ✖ | ✖ | — | — | — | — | ✔ bottom sheet + `SHEET_ENTER` vs centred dialog + `DIALOG_ENTER` :146; close X only on wide :83-87; frames :21 / :24-29; bottom padding :160 | backdrop `button` + `closeLabel` :40-41; `accessibilityViewIsModal`; `role="form"` + label when `formLabel` :151; title `header` :76 |
| `sheet-actions.tsx` | `flex-row gap-2` :37; cancel `flex-1` secondary :39-41, action `flex-[2]` :45 | via Button | via Button | ✖ | `isDisabled` :48 | `isBusy` :47 | — | `isDestructive` → `danger` :51 | — | via Button |
| `toast.tsx` | `absolute rounded-xl border border-line bg-surface py-1 pl-4 pr-1 shadow-lg` :125; text 14 :133; action 14 semibold accentText :147 | ✖ | action `active:opacity-70` :140; **message pressable ✖** :132 | ✖ | — | — | — | — (no error variant) | ✔ docked in sidebar `w-[200px]` vs floating `max-w-[480px]` :107-108,190; bottom offset :98-104 | `alert` + polite live region :122-123; message pressable **no role/label** :132; action `button` :139 |
| `tooltip.tsx` | bubble `max-w-[260px] rounded-md bg-inverse px-2 py-1`, 13/18 inverseFg :33-34 | — | shown on touch end :170 | — | — | — | — | — | phone: tap, 2.5 s | none on the bubble (visual only) |
| `tooltip.web.tsx` | same bubble :153-155, portal + `zIndex 1000` :114-125 | ✔ shows on `onPointerEnter` :211 | tap on touch :222-226 | ✔ shows on keyboard focus `:focus-visible` :32,206 | — | — | — | — | web | `role="tooltip"` :157, `aria-describedby` wiring `useDescribedBy` :193; Escape :198 |
| `skeleton.tsx` | rows `min-h-14 gap-3 py-2`, `bg-track` bars `rounded-full` :39-52 | — | — | — | — | ✔ breathing `PLACEHOLDER_BREATH` :30 | — | — | — | `progressbar` + label :34 |
| `progress-bar.tsx` | `h-[3px] rounded-sm bg-track` :25, fill `bg-fg` :27, marker `h-[9px] w-0.5 rounded-[1px] bg-accentQuietText` :30 | — | — | — | — | — | — | — | — | `progressbar`, label, `aria-value*` :20-24 |
| `pulse-dot.tsx` | `h-2 w-2 rounded-full` + caller colour :29 | — | — | — | — | ✔ breath 900 ms → 0.3 :19-23 | — | — | — | none (decorative) |
| `count-badge.tsx` | `h-[18px] min-w-[18px] rounded-full bg-accentQuiet px-1.5` :10, 11 medium `tabular-nums` :13, `99+` :14 | — | — | — | — | — | — | — | — | none (host names the count) |
| `empty-state.tsx` | `flex-1 items-center justify-center gap-3 px-10` :13; text 14 `leading-5` muted :15 | — | — | — | — | — | — | — | — | none |
| `screen-header.tsx` | `pb-3 pr-5 pt-6`, `pl-5` / `pl-2` with back :32-33; eyebrow 11 uppercase :49; title 30 semibold :55 | ✖ | back `active:opacity-70` :41 | ✖ | — | — | — | — | actions wrap under the title on narrow :32 | back `button` + label :39-40; title `header` :54 |
| `back-header.tsx` | `pb-2.5 pr-4 pt-3.5`, `pl-5`/`pl-2` :29-30 — **different paddings from `ScreenHeader`** (`pt-6 pb-3 pr-5`) | ✖ | `active:opacity-70` :37 | ✖ | — | — | — | — | — | `button` + label :35-36; `HeaderTitle` 22 `header` :51 |
| `sidebar.tsx` | `w-56 gap-1 border-r border-line bg-bg px-3 pb-4 pt-5` :162; link `h-10 rounded-lg px-3` :115; new task `h-10 rounded-lg bg-accent` :180 | ✖ | `active:opacity-70` :115 / `-80` :180 | ✖ | — | — | ✔ `bg-raised` + `font-medium text-fg` + accentQuietText icon :116,121,128; `aria-current="page"` :113 | — | wide only | `navigation` + label :161-163; links `link` :112; new task `button` :179 |
| `tab-bar.tsx` | `flex-row border-t border-line bg-bg px-1 pt-1.5` :95; tab `min-h-12 flex-1 gap-0.5` :59; icon 20/1.75 :63-67; label 11 :74 | ✖ | **✖ (no `active:`)** :59 | ✖ | — | — | ✔ accentQuietText icon + `font-medium` label :64,75; `aria-selected` :58 | — | phone only (`null` on wide :134) | `tablist` + label :94-96; `tab` :57; badge in label :56 |
| `split-pane.tsx` | `flex-row bg-bg`; main `border-r border-line` :21; side `w-[400px] max-w-[40%]` :22 | — | — | — | — | — | — | — | wide only | side `region` + label :22 |
| `screen.tsx` | `bg-bg`, `max-w-[880px]` column :33, body `pb-24` :40 | — | — | — | — | — | — | — | column capped on wide | none |
| `screen-scene(.web).tsx` | context only / web `display:none` when not focused `.web.tsx:8-9,20` | — | — | — | — | — | — | — | web hides inactive screens | — |
| `row-list.tsx` | `collapsable={false}` wrapper :12 | — | — | — | — | — | — | — | Android-specific fix | passes props |
| `dissolve.tsx` | specks in caller colour, 750 ms, `Easing.out(quad)` :13,122-125 | — | — | — | — | — | — | — | — | none |
| `animated-height.tsx` | clip + 220 ms height :11,31 | — | — | — | — | — | — | — | — | none |
| `logo.tsx` | `PaceMark` 56 :10, strokes `faint`/`accentText`/`fg` :17,25,30; `PaceLogo` wordmark 34 semibold tight :48 | — | — | — | — | — | — | — | — | wordmark `header` + label :46-47; mark unlabeled |
| `color.tsx` | maps (§1.3); `ColorTag` `rounded-sm px-1.5 py-px` :98, 11 medium `leading-4` :101 | — | — | — | — | — | — | — | — | none |

### 7.2 `src/shared/*`

| component | default | hover | pressed | focus-visible | disabled | loading | selected | error | phone vs desktop | a11y role / label |
|---|---|---|---|---|---|---|---|---|---|---|
| `task-row.tsx` | `flex-row gap-3 rounded-lg py-3 pl-3 pr-3` :71; title 15 medium / fg2 :26-27; `gap-[5px]` :80 | ✖ | `active:opacity-70` on the text area :80 | ✖ | — | dissolve on check :70 | ✔ `bg-raised` :71, `aria-current="page"` :79; checked → `line-through` fg2 :28 | — | selection visible on wide (split pane) | text `link` :78 (no label prop: name = content); check via `CheckCircle` label :74 |
| `task-list.tsx` | list `px-2` :67; folded header `mx-3 h-11 border-t border-line px-2` :132, 13 medium fg2 :137 | ✖ | `active:opacity-70` :132 | ✖ | — | — | `aria-expanded` :131 | — | — | `list`/`listitem` :67,77; header `button` :130 |
| `meta-line.tsx` | `gap-x-1.5 gap-y-1` :59; text 12 `leading-4` muted :68; tones `strong`/`warn` :15-19 | — | — | — | — | — | — | lateness `text-warn` :18 | — | Repeat mark `img` + label :30 |
| `user-avatar.tsx` | photo `borderRadius: size/2` :24 / initials `bg-accentQuiet` + `fontSize: size*0.38` :28-33 | — | — | — | — | ✖ (no placeholder while the photo loads) | — | falls back to initials on error :20-22 | 44 (More) / 24 (sidebar) | photo label :19; initials none |
| `week-arrows.tsx` | two `IconButton plain` :19,27 | ✖ | via IconButton | ✖ | next `disabled` :28 → `opacity-40` | — | — | — | — | labels via IconButton |
| `zone-banner.tsx` | `mx-4 mb-3 gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3` :22; 13/18 fg2 :24 | — | via Button | — | — | — | — | — | — | `summary` :21 |
| `back-to-today.tsx` | `h-11 rounded-md px-2` :24; 13 medium accentQuietText :27 | ✖ | `active:opacity-70` :24 | ✖ | — | — | — | — | — | `button` :23 |
| `where-sat-line.tsx` | 12 muted, `pb-2`, `pl-[116px]` :31-33 | — | — | — | — | — | — | — | — | none |
| `activity-usage.tsx` | sections `border-t border-line pt-4/pt-5` :72,111; heading 14/17 semibold :73,113; bar `h-1 bg-line` / `bg-accentQuiet` :30-31 | ✖ | **✖** "show more" `self-start py-2` :136-138 | ✖ | — | — | — | — | — | headings `header` :73,113; toggle `button` :137 (≈36 px tall) |
| `tracking/time-bar.tsx` | footer `border-t border-line bg-bg px-3 pb-2.5 pt-2.5` :260; buttons `h-14 rounded-xl border-2 px-1` :167; label 12/14 :176; task input `h-11 rounded-lg border bg-surface` :84; start `h-11 w-11 rounded-lg bg-accent` :103 | ✖ (tooltip on hover via `Tooltip` :161) | `active:opacity-80` :103,167 | ✖ | start `opacity-50` only when empty :104 (busy disables without a visual :106); greyed button `border-dashed border-line` + muted :139 | `pending.busy` text :71-72 | ✔ running `border-accentQuiet bg-accentQuiet` :133 | `alert` warn text :77 | fold only on phone (`time-bar-fold.tsx:32`) | buttons `button` + label + hint :163-165; region :259-261 |
| `tracking/running-row.tsx` | `PulseDot` + `ColorTag` + 13 fg :22-24; progress `h-1 bg-track` :55; stop `h-11 rounded-lg border border-line px-3` :93 | ✖ | `active:opacity-70` :69,93 | ✖ | — | — | — | long run `text-warn` :52, `bg-warn` bar :59 | — | `button` :68,92; stop label :91; still-yes no label prop :67 |
| `tracking/choice-row.tsx` | `min-h-12 rounded-lg border border-line bg-surface px-3.5 py-2` :45; 15 fg / 13 muted :49,55 | ✖ | `active:opacity-70` :45 | ✖ | ✖ | — | running → Check 16 :57 (no fill change) | — | — | `button` + label :43-44; `list` :77 |
| `tracking/choices-sheet.tsx` | search `h-11 rounded-lg border border-line bg-bg px-3` :107; stop `min-h-12 rounded-lg bg-track px-3.5` :134 | ✖ | stop `active:opacity-70` :134 | ✖ (search has no focused state) | — | — | — | — | search autofocus on wide only :105,111 | search label :110; stop `button` + label :132-133 |
| `tracking/time-bar-fold.tsx` | `min-h-11 rounded-lg border border-line px-3`, 13 fg2 :61-64 | ✖ | `active:opacity-70` :61 | ✖ | — | — | — | — | never folds on wide :32 | `button` :59 (no label prop) |
| `tracking/calendar-choices.tsx` | `ChoiceRow`s :94 | via ChoiceRow | | | | | `isRunning` :90 | | | |
| `task-fields/date-field.tsx` | Chip + leading icon 14 :64-66; panel `rounded-xl border border-line bg-bg p-3` :104 | via Chip | via Chip | ✖ | — | — | Chip `selected` :68,112 | — | — | via Chip/Calendar/TimeInput |
| `task-fields/estimate-field.tsx` | Chips :40,108; typed `h-8 min-w-[120px] rounded-pill border px-3 text-[13px]` :72 | ✖ | via Chip | ✖ | — | — | Chip `selected` :44,113 | ✔ `border-warn` :73 | — | `radiogroup` + label :103-105; input label :70 |
| `task-fields/deadline-policy-field.tsx` | Chips :111-128,184-192; TextField :142 | via Chip | via Chip | ✖ | — | — | Chip `selected` :124,136,188,196 | via TextField | — | labels 12 muted :61,182 (not tied to the group) |
| `task-fields/recurrence-field.tsx` | Chips :56-65,116-125; TextField :77; panel `rounded-xl border bg-bg p-3` :135 | via Chip | via Chip | ✖ | — | — | ✔ | `FormAlert` :178 | — | label 12 muted :174 |
| `task-fields/deadline-and-repeat.tsx` | composition | | | | | | `isChosen` :30-31 | `FormAlert` :61 | | |
| `task-fields/form-alert.tsx` | 12 warn :8 / 12 muted :15 | — | — | — | — | — | — | ✔ `role="alert"` + live :8 | — | ✔ |
| `task-fields/option-row.tsx` | label 12 muted :14, chips `gap-1.5` :15 | | | | | | | | | `radiogroup` + label :15 |
| `task-fields/subtask-list.tsx` | row `min-h-9 gap-2.5 pl-1` :43; remove `h-9 w-9 rounded-md` :63; add `h-9 rounded-md pr-2` :104; input `h-9` no border :125 | ✔ remove button appears on hover/focus with a keyboard `isShowsRemove` :38-40,44,71 (opacity 0/1) | `active:opacity-70` :63,104 | ✖ (input) | — | — | sent dot `bg-muted` :19 | — | always visible without a keyboard :40 | `list`/`listitem` :50,188; buttons labelled :61-62,102-103; **targets 36 px web / 31.5 dp** |
| `task-fields/task-fields.tsx` | `gap-3.5` :199; Chips :101-149; TextField :205 | via Chip | | ✖ | | | ✔ | `error` → TextField :206 | | |
| `task-fields/task-text-fields.tsx`, `when-chips.tsx` | TextFields :17,25 / chip row `gap-1.5` :22 | | | | | | | | | |
| `assistant/action-cards.tsx` | card `gap-1 rounded-lg border border-line bg-bg px-3 py-2` :26; container `rounded-xl border bg-surface p-3` :165; approve `min-h-11 rounded-lg bg-accent px-3` :118 (**a hand-rolled primary button, not `Button`**) | ✖ | **✖** on all three buttons :86,114,127 | ✖ | ✔ `opacity-50` :75,119,132, `disabled` :90,121,134 (↵ button not dimmed itself) | busy dims the row :75 | — | doubtful line `text-warn` :32 | — | `group` + label :25-27; buttons `button` + label; correction input label :77 (no font size :78) |
| `assistant/questions.tsx` | question 13/20 `text-question` :28; options `h-8 rounded-pill px-3` :54 inside `h-11` :43 | ✖ | `active:opacity-80` :43 | ✖ | `opacity-50` on unchosen while busy :44, `disabled` :46 | busy :142 | ✔ `border-2 border-fg bg-raised` vs `border border-line bg-bg` :55, `accessibilityState.selected` :41 | — | — | `group` + label :34; options `button` (not `radio`) :40 |
| `notifications/notification-bell.tsx` | `h-11 w-11 rounded-md`, `surface` variant adds `border border-line bg-surface` :33-36; Bell 18/1.75 fg2 :41; badge `right-0.5 top-0.5` :42 | ✖ | `active:opacity-80` :34 | ✖ | — | — | — | — | `surface` on phone header (`features/now/now-header.tsx:20`), `plain` in sidebar (`ui/sidebar.tsx:175`) | `button` + unread-aware label :27-32 |

### 7.3 Every `Pressable` / `TextInput` / `Switch` (generated)

`role` = `accessibilityRole`/`role`; `label prop` = an explicit `accessibilityLabel`/`aria-label` (a
pressable without one is named by its text content, which is fine for text buttons and wrong for icon-only
ones); `height` is rem (§0).

| file:line | tag | role | label prop | active | disabled | dim | height | radius |
|---|---|---|---|---|---|---|---|---|
| `src/features/day/activity-task-field.tsx`:47 | Pressable | button | yes | active:opacity-80 | - | opacity-80 | min-h-11 | rounded-lg |
| `src/features/day/activity-task-field.tsx`:101 | Pressable | radio | yes | active:opacity-75 | - | opacity-75 | min-h-11 | rounded-lg |
| `src/features/day/day-screen.tsx`:87 | Pressable | button | no | **none** | - | - | - | - |
| `src/features/day/day-screen.tsx`:171 | Pressable | button | no | **none** | - | - | - | - |
| `src/features/day/day-screen.tsx`:197 | Pressable | button | no | **none** | - | - | - | - |
| `src/features/notifications/notifications-screen.tsx`:55 | Pressable | link | no | active:opacity-70 | - | opacity-70 | min-h-11 | - |
| `src/features/notifications/notifications-screen.tsx`:73 | Pressable | link | no | **none** | - | - | min-h-11 | - |
| `src/features/notifications/notifications-screen.tsx`:203 | Pressable | link | no | active:opacity-70 | - | opacity-70 | min-h-11 | - |
| `src/features/now/composer/composer-form.tsx`:141 | Pressable | button | yes | active:opacity-70 | - | opacity-70 | h-11 | rounded-md |
| `src/features/now/composer/quick-line.tsx`:98 | Pressable | button | yes | active:opacity-70 | yes | opacity-70 | h-9 | rounded-full |
| `src/features/now/composer/quick-line.tsx`:150 | TextInput | **none** | yes | **none** | - | - | - | - |
| `src/features/now/now-task-groups.tsx`:32 | Pressable | button | yes | **none** | - | - | min-h-11 | - |
| `src/features/oauth/scope-list.tsx`:31 | Pressable | checkbox | no | **none** | - | - | min-h-11 | rounded-md |
| `src/features/presets/number-input.tsx`:28 | TextInput | **none** | yes | **none** | - | - | h-11 | rounded-lg |
| `src/features/presets/presets-list.tsx`:63 | Pressable | link | no | active:opacity-70 | - | opacity-70 | min-h-14 | - |
| `src/features/projects/color-swatches.tsx`:28 | Pressable | radio | yes | **none** | - | - | h-11 | rounded-full |
| `src/features/server/server-line.tsx`:20 | Pressable | button | yes | active:opacity-70 | - | opacity-70 | min-h-11 | - |
| `src/features/sessions/os-picker.tsx`:91 | Pressable | radio | yes | active:opacity-80 | - | opacity-80 | h-11 | rounded-lg |
| `src/features/settings/settings-links.tsx`:21 | Pressable | link | no | active:opacity-70 | - | opacity-70 | min-h-14 | - |
| `src/features/task/close-sheet.tsx`:94 | Pressable | button | no | **none** | - | - | h-11 | - |
| `src/features/task/project-sheet.tsx`:31 | Pressable | radio | yes | active:opacity-70 | - | opacity-70 | min-h-12 | rounded-lg |
| `src/features/task/source-text.tsx`:18 | Pressable | button | no | **none** | - | - | min-h-11 | - |
| `src/features/task/subtask-checklist.tsx`:49 | Pressable | checkbox | yes | active:opacity-70 | yes | opacity-70 | min-h-[52px] | - |
| `src/features/task/task-description.tsx`:38 | Pressable | button | no | **none** | yes | - | min-h-11 | rounded-lg |
| `src/features/task/task-description.tsx`:46 | Pressable | button | no | **none** | yes | - | min-h-11 | rounded-lg |
| `src/features/task/task-description.tsx`:106 | Pressable | button | yes | **none** | - | - | min-h-11 | rounded-lg |
| `src/features/task/task-header.tsx`:114 | Pressable | button | yes | active:opacity-70 | yes | opacity-70 | h-11 | - |
| `src/features/week/week-grid.tsx`:165 | Pressable | button | yes | **none** | - | - | - | rounded-md |
| `src/features/week/week-screen.tsx`:45 | Pressable | switch | yes | active:opacity-80 | - | opacity-80 | h-11 | rounded-md |
| `src/platform/update-banner.web.tsx`:96 | Pressable | button | no | active:opacity-80 | - | opacity-80 | - | rounded-md |
| `src/screens/decisions-screen.tsx`:67 | Pressable | button | no | active:opacity-70 | - | opacity-70 | - | - |
| `src/screens/decisions-screen.tsx`:122 | TextInput | **none** | yes | **none** | - | - | min-h-11 | rounded-lg |
| `src/screens/login-parts.tsx`:49 | TextInput | **none** | yes | **none** | - | - | h-12 | rounded-md |
| `src/screens/login-return-screen.web.tsx`:31 | Link | **none** | no | **none** | - | - | - | - |
| `src/screens/more-screen.tsx`:41 | Pressable | link | yes | active:opacity-70 | - | opacity-70 | min-h-14 | - |
| `src/screens/projects-screen.tsx`:23 | Pressable | button | no | active:opacity-70 | - | opacity-70 | h-11 | rounded-lg |
| `src/screens/projects-screen.tsx`:68 | Pressable | link | yes | active:opacity-70 | - | opacity-70 | min-h-14 | rounded-xl |
| `src/shared/activity-usage.tsx`:136 | Pressable | button | no | **none** | - | - | - | - |
| `src/shared/assistant/action-cards.tsx`:76 | TextInput | **none** | yes | **none** | - | - | min-h-11 | rounded-lg |
| `src/shared/assistant/action-cards.tsx`:86 | Pressable | button | yes | **none** | yes | - | min-h-11 | rounded-lg |
| `src/shared/assistant/action-cards.tsx`:114 | Pressable | button | yes | **none** | yes | opacity-50 | min-h-11 | rounded-lg |
| `src/shared/assistant/action-cards.tsx`:127 | Pressable | button | yes | **none** | yes | opacity-50 | min-h-11 | rounded-lg |
| `src/shared/assistant/questions.tsx`:38 | Pressable | button | yes | active:opacity-80 | yes | opacity-50,opacity-80 | h-11 | - |
| `src/shared/back-to-today.tsx`:22 | Pressable | button | no | active:opacity-70 | - | opacity-70 | h-11 | rounded-md |
| `src/shared/notifications/notification-bell.tsx`:26 | Pressable | button | yes | active:opacity-80 | - | opacity-80 | h-11 | rounded-md |
| `src/shared/task-fields/estimate-field.tsx`:69 | TextInput | **none** | yes | **none** | - | - | h-8 | rounded-pill |
| `src/shared/task-fields/subtask-list.tsx`:60 | Pressable | button | yes | active:opacity-70 | - | opacity-70 | h-9 | rounded-md |
| `src/shared/task-fields/subtask-list.tsx`:101 | Pressable | button | yes | active:opacity-70 | - | opacity-70 | h-9 | rounded-md |
| `src/shared/task-fields/subtask-list.tsx`:121 | TextInput | **none** | yes | **none** | - | - | h-9 | - |
| `src/shared/task-list.tsx`:129 | Pressable | button | no | active:opacity-70 | - | opacity-70 | h-11 | - |
| `src/shared/task-row.tsx`:77 | Pressable | link | no | active:opacity-70 | - | opacity-70 | - | - |
| `src/shared/tracking/choice-row.tsx`:41 | Pressable | button | yes | active:opacity-70 | - | opacity-70 | min-h-12 | rounded-lg |
| `src/shared/tracking/choices-sheet.tsx`:109 | TextInput | **none** | yes | **none** | - | - | h-11 | - |
| `src/shared/tracking/choices-sheet.tsx`:131 | Pressable | button | yes | active:opacity-70 | - | opacity-70 | min-h-12 | rounded-lg |
| `src/shared/tracking/running-row.tsx`:67 | Pressable | button | no | active:opacity-70 | - | opacity-70 | h-11 | rounded-lg |
| `src/shared/tracking/running-row.tsx`:90 | Pressable | button | yes | active:opacity-70 | - | opacity-70 | h-11 | rounded-lg |
| `src/shared/tracking/time-bar-fold.tsx`:58 | Pressable | button | no | active:opacity-70 | - | opacity-70 | min-h-11 | rounded-lg |
| `src/shared/tracking/time-bar.tsx`:82 | TextInput | **none** | yes | **none** | - | - | h-11 | rounded-lg |
| `src/shared/tracking/time-bar.tsx`:98 | Pressable | button | yes | active:opacity-80 | yes | opacity-50,opacity-80 | h-11 | rounded-lg |
| `src/shared/tracking/time-bar.tsx`:162 | Pressable | button | yes | active:opacity-80 | - | opacity-80 | h-14 | rounded-xl |
| `src/ui/back-header.tsx`:34 | Pressable | button | yes | active:opacity-70 | - | opacity-70 | h-11 | - |
| `src/ui/button.tsx`:196 | Pressable | button | no | active:opacity-80 | yes | opacity-50,opacity-80 | min-h-12 | rounded-md |
| `src/ui/calendar.tsx`:59 | Pressable | button | yes | active:opacity-70 | yes | opacity-30,opacity-70 | h-10 | rounded-lg |
| `src/ui/check-circle.tsx`:23 | Pressable | checkbox | yes | **none** | yes | - | h-11 | rounded-full |
| `src/ui/chip.tsx`:55 | Pressable | radio | yes | active:opacity-80 | - | opacity-80 | h-11,h-11 | - |
| `src/ui/icon-button.tsx`:29 | Pressable | button | yes | active:opacity-80 | yes | opacity-40,opacity-80 | h-11,h-12 | rounded-md |
| `src/ui/screen-header.tsx`:38 | Pressable | button | yes | active:opacity-70 | - | opacity-70 | h-11 | - |
| `src/ui/sheet.tsx`:40 | Pressable | button | yes | **none** | - | - | - | - |
| `src/ui/sidebar.tsx`:106 | Pressable | link | yes | active:opacity-70 | - | opacity-70 | h-10 | rounded-lg |
| `src/ui/sidebar.tsx`:177 | Pressable | button | yes | active:opacity-80 | - | opacity-80 | h-10 | rounded-lg |
| `src/ui/switch-row.tsx`:20 | Switch | **none** | yes | **none** | - | - | - | - |
| `src/ui/tab-bar.tsx`:55 | Pressable | tab | yes | **none** | - | - | min-h-12 | - |
| `src/ui/text-field.tsx`:26 | TextInput | **none** | yes | **none** | - | - | min-h-24,h-11 | rounded-lg |
| `src/ui/time-input.tsx`:29 | TextInput | **none** | yes | **none** | - | - | h-11 | rounded-lg |
| `src/ui/toast.tsx`:132 | Pressable | **none** | no | **none** | - | - | - | - |
| `src/ui/toast.tsx`:138 | Pressable | button | no | active:opacity-70 | - | opacity-70 | h-11 | rounded-md |

**21 of 63 pressables have no pressed state** (3 of them are full-row/backdrop targets where that is
arguably fine: `ui/sheet.tsx:40`, `ui/toast.tsx:132`, `features/week/week-grid.tsx:165`); **0 of 11 text
inputs have a focused style** except the composer card, which rings in `border-accentQuiet` while its line
has focus (`features/now/composer/composer.tsx:103`). Pressable heights (first height class on the pressable itself): `h-9` 3, `h-10` 3, `h-11` 20, `min-h-11` 16,
`min-h-12` 5, `h-14` 1, `min-h-14` 4, `min-h-[52px]` 1, unset 10. Pressable radii: `rounded-lg` 20,
`rounded-md` 12, `rounded-full` 3, `rounded-xl` 2, none 26 (chips carry theirs on an inner view).

### 7.4 Component use census (generated)

`variant` as passed (`(default)` = prop omitted); `[...]` = notable props passed at that site.

| component | variant | sites | where |
|---|---|---|---|
| `AnimatedHeight` | `(default)` | 1 | src/features/now/composer/composer.tsx:106 |
| `BackHeader` | `(default)` | 2 | src/features/task/task-header.tsx:107; src/screens/pushed-screen.tsx:26 |
| `Button` | `(default)` | 20 | src/features/day/phone-section.tsx:58[width]; src/features/now/calendar-prompt.tsx:39[width]; src/features/now/composer/composer-form.tsx:133[disabled,hotkey]; src/features/oauth/consent-flow.tsx:94[disabled,width]; src/features/permissions/onboarding-screen.tsx:51[width]; src/features/permissions/onboarding-screen.tsx:110[width]; src/features/permissions/onboarding-screen.tsx:149[width]; src/features/permissions/onboarding-screen.web.tsx:18[width]; src/features/presets/preset-form.tsx:215; src/features/projects/project-form.tsx:80; src/features/server/change-server-sheet.tsx:148[busy]; src/features/server/change-server-sheet.tsx:153[busy,disabled]; src/features/sessions/add-computer.tsx:91[busy,hotkey]; src/features/sessions/computer-steps.tsx:65; src/features/task/task-footer.tsx:75[width,hotkey]; src/screens/app-link-screen.web.tsx:35[width]; src/screens/crash-screen.tsx:42[width]; src/screens/inbox-card.tsx:46[width]; src/screens/login-return-screen.web.tsx:22[width]; src/screens/login-screen.tsx:70[busy,width] |
| `Button` | `danger` | 1 | src/features/sessions/session-row.tsx:118[busy,width] |
| `Button` | `ghost` | 19 | src/features/day/activity-sheet.tsx:217; src/features/day/phone-section.tsx:130; src/features/day/phone-section.tsx:147; src/features/day/phone-section.tsx:212; src/features/day/phone-section.tsx:228; src/features/permissions/onboarding-screen.tsx:54[width]; src/features/permissions/onboarding-screen.tsx:113[width]; src/features/permissions/permissions-screen.tsx:48; src/features/presets/preset-form.tsx:104; src/features/projects/project-form.tsx:77; src/features/server/change-server-sheet.tsx:162[disabled]; src/features/sessions/sessions-section.tsx:51; src/features/settings/delete-account.tsx:169; src/features/settings/delete-account.tsx:230; src/screens/history-screen.tsx:66; src/screens/login-parts.tsx:90[width]; src/screens/login-screen.web.tsx:66[busy,width]; src/screens/project-screen.tsx:48; src/shared/task-fields/date-field.tsx:136 |
| `Button` | `secondary` | 37 | src/features/day/phone-section.tsx:75[width]; src/features/day/phone-section.tsx:288; src/features/now/calendar-prompt.tsx:49[width]; src/features/oauth/consent-flow.tsx:84[disabled,width]; src/features/oauth/dev-identity.tsx:30[disabled,width]; src/features/permissions/permission-card.tsx:88; src/features/permissions/permission-card.tsx:106; src/features/presets/presets-list.tsx:137; src/features/server/incompatible-screen.tsx:41; src/features/sessions/computer-steps.tsx:77; src/features/sessions/computer-steps.tsx:95; src/features/sessions/connect-ai-sheet.tsx:50; src/features/sessions/session-row.tsx:113[width]; src/features/sessions/session-row.tsx:179; src/features/sessions/sessions-section.tsx:131; src/features/sessions/sessions-section.tsx:140; src/features/settings/delete-account.tsx:156; src/features/settings/export-row.web.tsx:14[busy]; src/features/settings/notification-settings.tsx:198; src/features/settings/timezone-row.tsx:36; src/features/task/task-footer.tsx:22[icon,width,hotkey]; src/features/task/task-footer.tsx:61; src/features/week/picked-details.tsx:172[icon]; src/features/week/picked-details.tsx:207; src/screens/auth-screen.tsx:45[width]; src/screens/history-screen.tsx:117[disabled]; src/screens/inbox-card.tsx:56[width]; src/screens/login-parts.tsx:58[busy,disabled,width]; src/screens/login-parts.tsx:86[width]; src/screens/login-screen.tsx:79[width]; src/screens/not-found-screen.tsx:20[width]; src/screens/review-card.tsx:30; src/screens/settings-screen.tsx:56; src/screens/settings-screen.tsx:148; src/shared/task-fields/date-field.tsx:145; src/shared/zone-banner.tsx:27; src/ui/sheet-actions.tsx:40[width] |
| `Button` | `{answerVariant(answer, index)}` | 1 | src/features/notifications/answers.tsx:66[busy,disabled] |
| `Button` | `{isDestructive ? "danger" : "primary"}` | 1 | src/ui/sheet-actions.tsx:46[busy,disabled,width,hotkey] |
| `Calendar` | `(default)` | 3 | src/features/day/day-nav.tsx:76[selected]; src/shared/task-fields/date-field.tsx:105[selected]; src/shared/task-fields/recurrence-field.tsx:136[selected] |
| `CheckCircle` | `(default)` | 1 | src/shared/task-row.tsx:72 |
| `Chip` | `(default)` | 31 | src/features/day/activity-sheet.tsx:61[color,selected]; src/features/now/composer/ai-status.tsx:52[selected]; src/features/now/composer/ai-status.tsx:99[selected]; src/features/now/composer/composer-form.tsx:72[selected]; src/features/now/composer/composer-form.tsx:82[selected]; src/features/now/project-chips.tsx:29[selected]; src/features/now/project-chips.tsx:38[color,selected]; src/features/presets/choice-chips.tsx:29[color,selected]; src/features/task/close-sheet.tsx:27[tall,selected]; src/features/task/give-up-fields.tsx:23[tall,selected]; src/features/task/give-up-fields.tsx:46[selected]; src/features/task/when-picker.tsx:74[tall,selected]; src/features/task/when-picker.tsx:85[tall,color,selected,leading]; src/shared/task-fields/date-field.tsx:64[color,selected,leading]; src/shared/task-fields/deadline-policy-field.tsx:111[selected]; src/shared/task-fields/deadline-policy-field.tsx:120[selected]; src/shared/task-fields/deadline-policy-field.tsx:128[selected]; src/shared/task-fields/deadline-policy-field.tsx:184[selected]; src/shared/task-fields/deadline-policy-field.tsx:192[selected]; src/shared/task-fields/estimate-field.tsx:40[color,selected,leading]; src/shared/task-fields/estimate-field.tsx:108[selected]; src/shared/task-fields/recurrence-field.tsx:56[selected]; src/shared/task-fields/recurrence-field.tsx:65[selected]; src/shared/task-fields/recurrence-field.tsx:116[selected]; src/shared/task-fields/recurrence-field.tsx:125[selected]; src/shared/task-fields/task-fields.tsx:101[color,selected]; src/shared/task-fields/task-fields.tsx:115[color,selected]; src/shared/task-fields/task-fields.tsx:128[selected]; src/shared/task-fields/task-fields.tsx:137; src/shared/task-fields/task-fields.tsx:142[color,selected]; src/ui/segmented.tsx:19[selected] |
| `ColorTag` | `(default)` | 6 | src/features/day/day-screen.tsx:96[color]; src/features/day/day-screen.tsx:285[color]; src/features/presets/presets-list.tsx:71[color]; src/shared/meta-line.tsx:60[color]; src/shared/meta-line.tsx:62[color]; src/shared/tracking/running-row.tsx:23[color] |
| `CountBadge` | `(default)` | 3 | src/shared/notifications/notification-bell.tsx:43; src/ui/sidebar.tsx:133; src/ui/tab-bar.tsx:69 |
| `Dissolve` | `(default)` | 1 | src/shared/task-row.tsx:70[color] |
| `EmptyState` | `(default)` | 9 | src/features/notifications/notifications-screen.tsx:218; src/features/notifications/notifications-screen.tsx:221; src/features/now/now-screen.tsx:46; src/features/task/task-screen.tsx:87; src/screens/inbox-screen.tsx:25; src/screens/preset-screen.tsx:48; src/screens/project-screen.tsx:106; src/screens/project-screen.tsx:138; src/screens/projects-screen.tsx:66 |
| `HeaderTitle` | `(default)` | 1 | src/screens/pushed-screen.tsx:31 |
| `IconButton` | `plain` | 19 | src/features/day/day-nav.tsx:43[icon]; src/features/day/day-nav.tsx:51[icon]; src/features/day/day-nav.tsx:59[icon,disabled]; src/features/presets/presets-list.tsx:77[icon,disabled]; src/features/presets/presets-list.tsx:84[icon,disabled]; src/features/settings/notification-settings.tsx:188[icon]; src/features/task/task-header.tsx:66[icon]; src/features/task/task-header.tsx:68[icon]; src/features/task/task-header.tsx:78[icon]; src/features/task/task-header.tsx:80[icon]; src/features/week/picked-details.tsx:286[icon]; src/screens/history-screen.tsx:126[icon]; src/screens/history-screen.tsx:134[icon,disabled]; src/screens/project-screen.tsx:114[icon]; src/shared/week-arrows.tsx:19[icon]; src/shared/week-arrows.tsx:27[icon,disabled]; src/ui/calendar.tsx:118[icon]; src/ui/calendar.tsx:132[icon,disabled]; src/ui/sheet.tsx:85[icon] |
| `NotificationBell` | `(default)` | 1 | src/features/now/now-header.tsx:20 |
| `NotificationBell` | `plain` | 1 | src/ui/sidebar.tsx:175 |
| `PaceLogo` | `(default)` | 4 | src/screens/app-link-screen.web.tsx:28; src/screens/login-return-screen.web.tsx:20; src/screens/login-screen.tsx:116; src/screens/login-screen.web.tsx:116 |
| `PaceMark` | `(default)` | 3 | src/features/oauth/consent-flow.tsx:128; src/ui/logo.tsx:44; src/ui/sidebar.tsx:166 |
| `PaceSwitch` | `(default)` | 3 | src/features/presets/override-row.tsx:38; src/features/settings/notification-settings.tsx:54; src/ui/switch-row.tsx:52 |
| `ProgressBar` | `(default)` | 1 | src/features/presets/preset-preview.tsx:47 |
| `PulseDot` | `(default)` | 1 | src/shared/tracking/running-row.tsx:22 |
| `RowList` | `(default)` | 2 | src/features/day/day-screen.tsx:263; src/shared/task-list.tsx:67 |
| `Screen` | `(default)` | 9 | src/features/day/day-screen.tsx:318; src/features/now/now-screen.tsx:40; src/features/task/task-screen.tsx:86; src/features/task/task-screen.tsx:103; src/features/week/week-screen.tsx:144; src/screens/destination-screen.tsx:27; src/screens/inbox-screen.tsx:23; src/screens/more-screen.tsx:74; src/screens/pushed-screen.tsx:24 |
| `ScreenHeader` | `(default)` | 6 | src/features/day/day-screen.tsx:311; src/features/now/now-header.tsx:18; src/features/week/week-screen.tsx:147; src/screens/destination-screen.tsx:29; src/screens/inbox-screen.tsx:23; src/screens/more-screen.tsx:74 |
| `Segmented` | `(default)` | 3 | src/features/settings/notification-settings.tsx:150; src/screens/settings-screen.tsx:79; src/screens/settings-screen.tsx:89 |
| `Sheet` | `(default)` | 11 | src/features/day/activity-sheet.tsx:266; src/features/day/day-nav.tsx:68; src/features/server/change-server-sheet.tsx:122; src/features/sessions/add-computer.tsx:71; src/features/sessions/connect-ai-sheet.tsx:38; src/features/task/close-sheet.tsx:74; src/features/task/project-sheet.tsx:81; src/features/task/task-sheets.tsx:277; src/features/week/picked-details.tsx:250; src/screens/history-screen.tsx:77; src/shared/tracking/choices-sheet.tsx:218 |
| `SheetActions` | `(default)` | 6 | src/features/day/activity-sheet.tsx:284; src/features/presets/preset-form.tsx:129; src/features/settings/delete-account.tsx:208; src/features/task/close-sheet.tsx:78; src/features/task/task-sheets.tsx:280; src/screens/history-screen.tsx:80 |
| `Skeleton` | `(default)` | 1 | src/features/sessions/sessions-section.tsx:45 |
| `Slider` | `(default)` | 1 | src/features/task/work-progress.tsx:68 |
| `SplitPane` | `(default)` | 1 | src/features/week/week-screen.tsx:197 |
| `SwitchRow` | `(default)` | 6 | src/features/presets/presets-list.tsx:141; src/features/presets/recurrence-row.tsx:135; src/features/presets/rows.tsx:149; src/features/sessions/calendar-sync-row.tsx:46; src/screens/settings-screen.tsx:98; src/shared/tracking/choices-sheet.tsx:212 |
| `TextField` | `(default)` | 23 | src/features/day/activity-sheet.tsx:90; src/features/day/activity-sheet.tsx:108; src/features/day/activity-sheet.tsx:133; src/features/day/activity-task-field.tsx:63; src/features/now/composer/composer-form.tsx:183; src/features/oauth/dev-identity.tsx:24; src/features/presets/deadline-row.tsx:57; src/features/presets/preset-form.tsx:44; src/features/presets/preset-form.tsx:52; src/features/presets/recurrence-row.tsx:95; src/features/projects/project-form.tsx:45; src/features/projects/project-form.tsx:61; src/features/server/change-server-sheet.tsx:131; src/features/sessions/add-computer.tsx:75; src/features/task/give-up-fields.tsx:35; src/features/task/task-description.tsx:28; src/features/task/when-picker.tsx:20; src/features/task/when-picker.tsx:31; src/shared/task-fields/deadline-policy-field.tsx:142; src/shared/task-fields/recurrence-field.tsx:77; src/shared/task-fields/task-fields.tsx:205; src/shared/task-fields/task-text-fields.tsx:17; src/shared/task-fields/task-text-fields.tsx:25 |
| `TimeInput` | `(default)` | 5 | src/features/presets/deadline-row.tsx:68; src/features/presets/recurrence-row.tsx:54; src/features/settings/notification-settings.tsx:180; src/features/settings/notification-settings.tsx:218; src/shared/task-fields/date-field.tsx:119 |
| `Tooltip` | `(default)` | 4 | src/features/now/composer/composer-form.tsx:137; src/features/now/composer/quick-line.tsx:97; src/features/week/week-screen.tsx:44; src/shared/tracking/time-bar.tsx:161 |
| `UserAvatar` | `(default)` | 2 | src/screens/more-screen.tsx:59; src/ui/sidebar.tsx:168 |

Hand-rolled duplicates of the kit: primary-looking `bg-accent` pressables outside `Button` —
`shared/assistant/action-cards.tsx:118`, `features/task/task-description.tsx:48`, `ui/sidebar.tsx:180`,
`shared/tracking/time-bar.tsx:103`, `features/now/composer/quick-line.tsx:105`; bordered secondary pressables
outside `Button` — `shared/assistant/action-cards.tsx:89,130`, `shared/tracking/running-row.tsx:69,93`,
`shared/tracking/time-bar-fold.tsx:61`; a ghost one — `features/task/task-description.tsx:40`; 9 raw `TextInput`s besides
`TextField`/`TimeInput` (§7.3), each with its own height, radius, fill and placeholder colour.

---

## 8. Summary of problems

- **Two pixel systems.** Font sizes are arbitrary px (343 `text-[Npx]`), but spacing, heights, `leading-*`,
  `rounded-2xl` and `text-sm` are rem, which NativeWind compiles at **14 px on Android vs 16 px on the web**
  (§0). On the phone every rem class is 12.5 % smaller: the 36 pressables at `h-11`/`min-h-11` are
  **38.5 dp** (not 44), `Button` is 42 dp (not 48), and text-to-container ratios differ per platform. Verify
  on a device before anything else.
- **Colours are tokenised in app code, not around it.** 0 hex literals in `src/`/`app/`; 4 non-token colour
  expressions there (`bg-black/55` backdrop, two hex-alpha suffixes glued onto `accentQuietFg`,
  `"transparent"`). Outside: 21 colour literals in `public/` + `scripts/generate-icons.ts` (+4 in
  `app.config.ts`), of which **4 values match no token**: `#f4f5f7` ×2 (light theme-color / pre-JS
  background — the light `bg` token is `#eceef2`), `#6a6a74` and `#b9bcc6` (logo greys; the in-app mark uses
  `faint` `#7d7d86`/`#6f717a`), `rgba(0,0,0,.3)` ×2.
- **Palette: 30 tokens, 0 unused, but thin and duplicated.** 7 tokens are used at most twice outside lookup
  maps (`accentText`, `onColor`, `question`, `inverse`, `inverseFg`, plus `ink-*` only via `color.tsx`); 8
  value duplications across names (e.g. dark `accent` = `accentText`, `accentFg` = `onColor` = `bg`, light
  `accentQuiet` = `accentQuietText`); `muted` and `faint` are ≈5 % apart and used interchangeably
  (placeholders: `faint` 2, `muted` 8, unset 1; icons: `muted` 28, `faint` 9). `line` doubles as a track fill once.
- **Radius: 12 classes for 5 tokens.** `rounded-pill` (4) and `rounded-full` (23) are the same shape; 3
  off-token radii (`rounded-2xl` ×4, `rounded-t-[22px]`, `rounded-[1px]`) and Tailwind's 4 px default ×6.
  One role, several radii: card = xl / lg / 2xl (3), button = md (`Button`, `IconButton`) / lg (5 hand-rolled
  accent buttons, sidebar) / full (composer) (3), text input = lg / md / pill / none (4).
- **Type: 16 font sizes, 92 % of text in 11–15 px.** 10 display sizes (16–34) serve 27 strings; line height
  is set on 35 of 345 sized strings with 8 different values; "section heading" has **8 treatments**
  (17/15/14/14/13/13/12 px, 11 px uppercase), "page title" 6 sizes (20/22/24/26/30, wordmark 34), "button
  label" 9 variants (12–15 px, 400–600, 3 colours), text inputs 4 sizes (13/14/15/unset); stat values 16 vs 18;
  6 strings have `font-sans` and no size (RN default 14); the tall `Chip` is documented as 13 px but renders
  12 px.
- **Spacing: 647 classes, 101 distinct values.** 108 half-steps (2/6/10/14 px) and 11 arbitrary values
  (5, 11, 13, 15, 18, 116, −10 px) sit off a 4 px grid; a 2-4-8-12-16-20-24-32 scale covers 79 %. Four
  page gutters (20/16/12/8 px), five card paddings, three bottom-inset formulas (+12, +8, +4), two header
  paddings (`ScreenHeader` `pt-6 pb-3 pr-5` vs `BackHeader` `pt-3.5 pb-2.5 pr-4`).
- **Arbitrary Tailwind values: 62 distinct classes, 430 uses** (47 / 87 without font sizes), incl. the sheet's
  `gap-[18px] pt-[15px] rounded-t-[22px]`, `pl-[116px]` ×4 that silently assumes the web value of `gap-3`,
  and `-m-[11px] mt-[-10px]` that only cancels a 44 px target on the web.
- **Icons: 45 lucide icons at 7 sizes (12–20 px) and 6 stroke widths** (1.75, 1.8, 2, 2.25, 2.5, 3); 21 sites
  set 1.75, 20 draw at 2 (7 explicit, 13 by lucide default) — often side by side on one screen; the disclosure chevron is drawn at
  15 and 16 px in `muted` and `fg2`. 4 of 5 spinners use the platform colour (grey on the lime button).
- **Depth and edges.** 3 border widths (1, 1.5, 2 px); `border-line` is 91 of 137 border colours; dividers
  go on top of rows in some lists and under them in others; only **2 shadows** in the app (wide dialog,
  toast), no elevation, no hairline, no divider component; nested panels inside sheets step *down* to `bg-bg`.
  Inputs sit on `bg-bg` (5), `bg-surface` (time bar) or borderless `bg-raised` (login).
- **States drawn inconsistently.** Selected: 5 treatments (`bg-raised`; `border-2 border-fg` + raised;
  project fill; `bg-accentQuiet`; `border-2 border-accentQuietText`). Disabled: 4 opacities (30/40/50/60).
  Pressed: 3 opacities (70/75/80) and an instant swap, no transition.
- **States missing.** Hover: none as a style (only the subtask remove reveal, the update banner's Reload
  fill and the web tooltip). Focus-visible: only the switch and the slider (`global.css`) and the composer
  card; **0 of the other 10 text inputs show focus** — `global.css:44-47` removes the outline and
  `TextField`/`TimeInput` draw nothing; no `Pressable` has an app-drawn focus ring. **21 of 63 pressables have
  no pressed state** (incl. every tab of the tab bar, the check circle, the assistant's approve/cancel/↵,
  the task description's Cancel/Save/edit, the "show more" of activity usage). No disabled state in `Chip`,
  `Segmented`, `PaceSwitch`, `Slider`, `TextField`, `TimeInput`; no loading state in `IconButton`; no error
  state in `TimeInput`; `ActivityIndicator` uncoloured.
- **Kit drift.** `IconButton`'s `surface` and `raised` variants are dead (19 of 19 call sites use `plain`); 5
  hand-rolled lime buttons, 5 hand-rolled outlined buttons and 1 ghost bypass `Button` (and its pressed/disabled/busy
  states); 9 raw `TextInput`s bypass `TextField` with 5 heights (32/36/44/min-44/48 px web) and 3 placeholder
  colours.
- **Small targets.** 3 pressables at `h-9` (36 px web / 31.5 dp) plus the activity-usage toggle (`py-2`
  around 13 px text); sidebar rows `h-10` (desktop only); on Android all 36 `h-11` targets are below 44.
- **Motion: 9 durations** (140–900 ms; six of them for "appears/resizes"), one explicit easing, `PulseDot`
  re-implements `PLACEHOLDER_BREATH` outside `motion.ts`; all honour reduced motion. The toast offset
  hard-codes `TAB_BAR_HEIGHT = 72` instead of measuring the tab bar.
- **Accessibility roles.** The toast's message pressable has no role/label; calendar days and assistant
  answer options are `button`s although they act as a single choice (`radio`); `Segmented` has no group
  label; `PaceMark` is unlabeled where it stands alone (sidebar, consent).
- **Fonts.** Inter 700 is embedded on Android but `font-bold` is never used (weights 400/500/600 only).

