# 01 — impeccable `audit` (native variant) over the React Native screens and kit

Reviewer 01-impeccable-critique · method: `reference/audit.native.md`, verbatim skeleton, scored against
`reference/android.md` and `reference/ios.md` (platform `adaptive`, PRODUCT.md › Platform). Commit 057e484.
Findings use the shared ids of [01-impeccable-critique.md](01-impeccable-critique.md) (the full table with
file:line, citation, fix and screenshot lives there); this file carries the audit's own scoring and verdict.

**Evidence limits (said once).** `android.md › Verifying the build` asks for emulator or device screenshots.
This session has no Android emulator or device, so this audit is **source-based**; the visual evidence is the
react-native-web build at 390 px (`context/design/baseline/*--phone-*`), which renders rem at 16 px, while
Android renders it at 14 px (00-inventory §0). Every size claim below that involves rem is computed from source,
not measured on hardware. `impeccable detect` does not apply to native source (audit.native.md, first
paragraph) and was not run on it.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility (TalkBack) | 2 | Labels and roles are thorough (99 `accessibilityLabel`, 111 `accessibilityRole`), reduced motion is honoured, but every `h-11` target is 38.5 dp and every `Button` 42 dp on Android (01-037); fixed-height text containers (`h-14` time-bar buttons with `numberOfLines={1}`, `h-11` fields) will clip at font scale 1.3 (unverified on device) |
| 2 | Performance | 2 | No list is virtualised: 0 `FlatList`/`FlashList`, every screen maps rows inside `ui/screen.tsx:38` `ScrollView` (01-039); one JS bundle for all routes (01-042) |
| 3 | Appearance & Theming | 3 | One token source, both schemes first-class, contrast pinned by `contrast.test.ts`; no Dynamic Color and no static-vs-dynamic decision, no tonal elevation (only `shadow-lg` on two layers), off-switch thumb uses `surface` and vanishes in dark (01-024) |
| 4 | Platform Conformance | 1 | Four kinds of violation: no ripple and no haptics although PRODUCT.md promises both (01-036); a custom tab bar without the Material indicator or 48 dp tabs (01-040); a bottom sheet that draws a grab handle but cannot be dragged (01-035); Calendar missing from the bottom bar (01-002) |
| 5 | Adaptivity | 1 | `orientation: "portrait"` lock (`app.config.ts:68`) and a single 1024 breakpoint (`ui/layout.ts:4`): a tablet or unfolded foldable gets the phone UI stretched, bottom bar untouched (01-038); no `KeyboardAvoidingView` or keyboard-controller anywhere, sheets with fields at the bottom rely on the window resize (unverified) |
| **Total** | | **9/20** | **Poor (major overhaul)** |

## Platform Conformance Verdict

**Fail.** On Android this reads as the web app rendered natively, not as a Material app with Apple-grade craft.
Specific violations:

1. **Press feedback is web-shaped.** All 63 `Pressable`s use `active:opacity-70/75/80` (21 have no pressed
   state at all, 00-inventory §8); there is no `android_ripple` anywhere. PRODUCT.md › Platform names ripple as
   an Android affordance. (01-036; android.md › The Android slop test, › Components & motion.)
2. **No haptics.** `expo-haptics` is not a dependency; checking a task off, starting and stopping an activity
   give no tactile confirmation. PRODUCT.md › Platform lists haptics. (01-036.)
3. **Navigation bar is hand-drawn** (`ui/tab-bar.tsx:119-145`): icon colour only, no active-indicator pill, 11 px
   labels, `min-h-12` = 42 dp per tab on Android, 4 destinations where the product's fixed IA has 5 (Calendar is
   a pushed screen behind More). (01-002, 01-040; android.md › Layout & structure "Navigation bar … 3–5
   destinations", › Components & motion.)
4. **Bottom sheet without the sheet gesture** (`ui/sheet.tsx:50-58,162`): a 36×4 grab handle promises a drag
   that does not exist; dismissal is tap-outside or Back only; no exit animation (`animationType="none"`, no
   exiting transition). (01-034, 01-035; android.md › Components & motion; ios.md › Components & controls
   "honor swipe-to-dismiss".)
5. **Sizes are 12.5 % under spec on Android** because NativeWind compiles rem at 14 px (`metro.config.js:51-54`
   leaves `inlineRem` at its default): 36 pressables at `h-11` are 38.5 dp, under the 48 dp floor. (01-037;
   android.md › Touch targets.)
6. **Icon system is lucide at 7 sizes and 6 stroke widths** (00-inventory §5), not Material Symbols; acceptable
   for a cross-platform brand only if it is one stroke and one optical size, which it is not. (audit.native.md ›
   Platform Conformance "Icon drift".)
7. **Back.** System Back works through `Modal.onRequestClose` (`ui/sheet.tsx:134`) and expo-router; there is no
   `BackHandler` hijack (good). Predictive-back animation support (`enableOnBackInvokedCallback`) is not
   configured in `app.config.ts`; unverified on device.

## Executive Summary

- Audit Health Score: **9/20** (Poor).
- Issues (native-relevant subset of the shared table): **P0 0 · P1 4 · P2 6** (01-002, 01-036, 01-037, 01-038 / 01-024, 01-031, 01-034, 01-035, 01-039, 01-040), plus two unverified P2 checks (font scale, IME) and one unnumbered P3 (Dynamic Color decision).
- Top issues:
  1. 01-037 — rem = 14 px on Android shrinks every target below 48 dp (P1).
  2. 01-036 — no ripple, no haptics: the two Android affordances PRODUCT.md promises (P1).
  3. 01-038 — no medium-width layout and a portrait lock: tablets/foldables get a stretched phone (P1).
  4. 01-002 / 01-040 — bottom navigation off-IA and off-Material (P1/P2).
  5. 01-035 / 01-034 — sheet without drag, motion without exits (P2).
- Next steps: fix the unit system first (one dp scale for Android and web, tokens for heights), then rebuild
  the shell (navigation bar/rail, sheet) on platform components, then re-run this audit on an emulator.

## Detailed Findings by Severity

**[P1] Android renders rem at 14 px — every target under 48 dp** (01-037)
- Location: `apps/app/metro.config.js:51-54`; consumers: every `h-11`, `min-h-11`, `min-h-12`, `p-*`, `gap-*`.
- Category: Accessibility / Conformance. Impact: tap targets 38.5–42 dp; text-to-container ratios differ per
  platform, so web screenshots misrepresent the phone. Guideline: android.md › Touch targets (48×48 dp).
- Recommendation: set `inlineRem: 16` or express dimensions as dp tokens; re-verify on device.
- Suggested command: /impeccable adapt.

**[P1] No ripple, no haptics** (01-036)
- Location: all 63 `Pressable`s (00-inventory §7.3); no `android_ripple`, no `expo-haptics`.
- Category: Conformance. Impact: presses feel web-like; checking off and start/stop have no physical
  confirmation. Guideline: android.md › The Android slop test; PRODUCT.md › Platform.
- Recommendation: one `PressableSurface` kit primitive (ripple on Android, opacity/hover on the web), light
  haptic on check, start, stop and destructive confirms.
- Suggested command: /impeccable polish.

**[P1] Phone layout stretched on tablets; portrait lock** (01-038)
- Location: `apps/app/src/ui/layout.ts:4` (one breakpoint at 1024), `apps/app/app.config.ts:68`.
- Category: Adaptivity. Impact: on a 600–1023 dp window the four tabs spread across the width and rows run
  700 px wide (see `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/review-01/web/en-dark-768_.png`).
  Guideline: android.md › Layout & structure "never ship a phone bottom-bar untouched on a tablet".
- Recommendation: navigation rail + list/detail at ≥600 dp; sidebar at ≥1024; lift the orientation lock.
- Suggested command: /impeccable adapt.

**[P1] Bottom navigation: 4 tabs, Calendar missing** (01-002)
- Location: `apps/app/app/(tabs)/_layout.tsx:21-26`, `apps/app/src/ui/tab-bar.tsx:87-92` (its own comment at
  :149 still lists Calendar).
- Category: Conformance (and product truth). Guideline: PRODUCT.md › Operating Context; android.md › Layout.
- Suggested command: /impeccable shape.

**[P2] Grab handle without a drag gesture; sheets vanish without exit motion** (01-035, 01-034)
- Location: `apps/app/src/ui/sheet.tsx:50-58,134,162`; `apps/app/src/ui/motion.ts:16-31`.
- Category: Conformance. Guideline: ios.md › Components & controls "honor swipe-to-dismiss"; ios.md › Motion
  "dismiss reverses the entrance"; android.md › Components & motion.
- Recommendation: gesture-driven sheet (pan to dismiss with velocity), exit = reverse of entry; on the web a
  centred dialog keeps Escape/outside-click.
- Suggested command: /impeccable animate.

**[P2] Custom navigation bar off Material geometry** (01-040) — `ui/tab-bar.tsx:119-145`: no indicator pill,
42 dp tabs, 11 px labels. android.md › Components & motion. /impeccable adapt.

**[P2] Off-switch thumb disappears in dark** (01-024) — `ui/switch-row.tsx:24-25` (`thumbColor` off =
`palette.surface` `#141416` on `muted` track). android.md › Color & theming "Material color roles". /impeccable polish.

**[P2] Unvirtualised long lists** (01-039) — `ui/screen.tsx:38`; History, Notifications, Assistant log, presets
map every row. audit.native.md › Performance. /impeccable optimize.

**[P2] 36 px icon buttons (31.5 dp on Android)** (01-031) — `features/now/composer/quick-line.tsx:104`,
`shared/task-fields/subtask-list.tsx:63,104`, `ui/chip.tsx:65` (`h-8`/`h-9`, compensated only on the web).
android.md › Touch targets. /impeccable adapt.

**[P2] Fixed-height text containers vs font scale** — `shared/tracking/time-bar.tsx:160-167` (`h-14`, label
`numberOfLines={1}` `leading-[14px]`), `ui/text-field.tsx:29` (`h-11`), tab labels. RN scales `fontSize` with the
system font scale (no `allowFontScaling={false}` or `maxFontSizeMultiplier` anywhere, which is right), so at
1.3× the fixed boxes clip. Unverified: needs `adb shell settings put system font_scale 1.3`. audit.native.md ›
Accessibility "Text scaling". /impeccable harden.

**[P2] Keyboard handling unproven** — 0 `KeyboardAvoidingView`; sheets (`ui/sheet.tsx`) put fields near the
bottom (`activity-sheet.tsx:92,110`, `change-server-sheet.tsx:137`). Android Modal + adjustResize behaviour must
be verified on device. audit.native.md › Adaptivity "Keyboard/IME handling". /impeccable harden.

**[P2] Motion curves and exits** (01-034) — `DIALOG_ENTER = ZoomIn` (scale from 0, contrary to its own comment
"grows in place from slightly smaller"), no exiting transitions, no explicit ease-out. craft-floor.md › Verify
"Motion". /impeccable animate.

**[P3] Dynamic Color not decided** — android.md › Color & theming "Dynamic Color … with a static fallback". Pace
has a brand palette; the spec should state "static brand scheme, no Material You" explicitly. /impeccable colorize.

## Patterns & Systemic Issues

- **Two pixel systems** (px type, rem boxes) make Android a different design from the web at every size.
- **The kit has no platform layer**: one `Pressable` look, one sheet, one tab bar for Android and the web, with
  web behaviours (opacity press, hover tooltips, keyboard-hint labels) leaking onto Android.
- **Shell components are hand-built** where Material/HIG have an exact component (navigation bar, bottom sheet,
  switch geometry, snackbar position).

## Positive Findings

- Accessibility semantics are unusually thorough for RN: roles, labels, `aria-checked`, live regions for the
  assistant (`time-bar.tsx:72,77`), screen-reader labels for counted tabs.
- Reduced motion is honoured in every animation through `ReduceMotion.System` (`ui/motion.ts`,
  `ui/dissolve.tsx:121-125`, `ui/pulse-dot.tsx:20`).
- System Back is never hijacked; `Modal.onRequestClose` closes sheets.
- Safe-area insets are applied in the tab bar and sheets (`ui/tab-bar.tsx:161`, `ui/sheet.tsx:160`).
- Colour is fully tokenised in app code (0 hex literals in `src/`, 00-inventory §8) with a contrast test.

## Recommended Actions

1. **[P1] `/impeccable adapt`**: one dp scale on Android and web (fix `inlineRem`), 48 dp targets, rail +
   list/detail at ≥600 dp, lift the portrait lock.
2. **[P1] `/impeccable shape`**: phone IA with five tabs (Now · Day · Calendar · Inbox · More) on a Material
   navigation bar.
3. **[P1] `/impeccable polish`**: platform press layer (ripple/haptics on Android, hover/focus on the web), one
   disabled and one selected state.
4. **[P2] `/impeccable animate`**: draggable sheet, exits that reverse entries, one ease-out curve.
5. **[P2] `/impeccable optimize`**: virtualise History, Notifications, Assistant log.
6. **[P2] `/impeccable harden`**: font-scale 1.3 and IME pass on an emulator.
7. **`/impeccable polish`** last.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `/impeccable audit` after fixes to see your score improve.
