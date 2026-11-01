# 06 — Mobile-native review (PWA on a phone, plus the Expo app where it shares the cause)

Reviewer 06-mobile-native, method `dev-core:mobile-native` (read from disk and applied as written: the
symptom table, the fixes in §1–§11, the Baseline and the Never Ship list). Target: the production web
build at `http://localhost:4173` in mobile Chromium (`390×844`, `deviceScaleFactor 3`, `isMobile`,
`hasTouch`, Android 15 / Chrome 141 UA, `Europe/Moscow`, `ru-RU` / `en-US`), driven with
`locator.tap()`, `page.touchscreen.tap` and CDP touch events. Light, dark and both mismatched cases
(OS light with the app set to dark, and the reverse). Accounts: Telegram ids **3250** (RU) and **3251** (EN),
each seeded with `seedLivedIn`.

Screenshot prefix: `R6/` = `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/review-06/`
(also holds the raw measurements: `css-now-ru-light.json`, `routes-audit.json`, `interact.json`,
`theme.json`, and the probe scripts `shots/r06-*.ts` next to it). `B/` = `context/design/baseline/`.

## Summary

**0 blocker · 5 major · 7 minor · 2 nit**, and 11 checks that pass, each with its evidence (listed after the findings).
The things that matter most:

1. **The browser chrome follows the OS, the app follows its own toggle (06-001).** `theme-color`, `body`'s
   background and `color-scheme` are fixed in `public/index.html` per `prefers-color-scheme`. Nothing in the
   app updates them. With the OS dark and Pace set to light, the status bar is `#0b0b0c` over a `#eceef2` app
   (measured). Even when the two agree, the light value is `#f4f5f7` against the token `#eceef2`, and a
   sheet's scrim dims the app but not the status bar.
2. **Touch gestures nobody designed (06-002, 06-003).** `overscroll-behavior` is `auto` on `html`, `body`,
   `#root` and every scroller, so in a Chrome tab a pull at the top of Now, or inside a sheet, chains to
   pull-to-refresh and reloads the SPA. The phone sheet draws a grab handle but has no drag gesture on either
   platform: the sheet stayed open after a 400 px swipe down from the handle. The handle invites exactly the
   pull that reloads the page.
3. **The keyboard was never designed for (06-004).** There is no `interactive-widget` in the viewport meta
   and no `KeyboardAvoidingView` anywhere in the app. In the default Chrome mode the time bar's field
   (y 659–703) sits under a ~330 px keyboard. In `resizes-content` mode the 67 px tab bar rides above the
   keyboard and Now's list shrinks to 48 px. QA round 4 already noted: "the web build has no soft keyboard".
   No test has ever looked at this.

The incumbent web layer gets the cheap things right because react-native-web supplies them: no tap flash, no
sticky hover, no `100vh`, `touch-action: manipulation`, `viewport-fit=cover` plus safe-area insets, and a
service worker that loads offline. Everything the platform does *not* hand over for free (overscroll, the
keyboard, theme sync, press feedback, gestures, user-select) is missing. Nobody owns the mobile platform layer.

## Findings

| id | sev | surface | viewport / theme / lang | file:line | what | why (citation) | suggested fix | screenshot |
|---|---|---|---|---|---|---|---|---|
| 06-001 | major | Browser chrome / status bar, every screen | phone · OS≠app theme · ru, en | `apps/app/public/index.html:7-9`, `:22-31`; `apps/app/src/ui/theme-provider.tsx:24-37` (no web side effect) | The `theme-color` metas, `body` background and `color-scheme` are chosen by `prefers-color-scheme` only. The in-app theme (`localStorage["pace.theme"]`) never reaches them. Measured: OS dark + app light gives theme-color `#0b0b0c` over a `#eceef2` app, and `body` is `#0b0b0c`. OS light + app dark gives `#f4f5f7` over `#0b0b0c`. Matching light still gives `#f4f5f7` against token `#eceef2` (known; deepened here). With a sheet open, the app dims to scrim gray and the status bar stays bright `#f4f5f7`, a hard seam at the top (`R6/sheet-task-picker--phone-light-ru.png`). At boot, `body` paints the OS color before JS loads, so a light-on-dark-OS user sees a black flash. Native controls (caret, selection handles, scrollbars, the range slider) also follow the OS through `color-scheme`, not the app. | mobile-native §10 "theme-color per color scheme … If the app switches theme with a class rather than the OS setting, update the tag from JavaScript on toggle"; Never Ship "One theme-color for both schemes"; HIG › Dark Mode › "respect the chosen appearance" | (a) A small inline boot script in `public/index.html` that reads `pace.theme`, then sets `document.documentElement.style.colorScheme`, `body` background and a single `<meta name="theme-color">` before first paint. (b) A web-only effect (`src/platform/theme-color.web.tsx`, with a no-op base `theme-color.ts`, mounted in `ThemeProvider`) that rewrites the meta, `color-scheme` and `body` background from the resolved `scheme` and the token `bg`. Optionally it also blends in the scrim color while a `Sheet` is open. Light value = token `bg`, never a literal. | `R6/theme.json` (all four cases), `R6/theme-os-dark-app-light--phone-ru.png`, `R6/sheet-task-picker--phone-light-ru.png` |
| 06-002 | major | Every scroll surface: Now list, Day, History, Settings, sheet bodies | phone · both · ru | `apps/app/global.css` (no `overscroll-behavior` anywhere); `apps/app/public/index.html:20-31` | `overscroll-behavior` is `auto` on `html`, `body`, `#root` and every measured scroller, sheet bodies included (`css-now-ru-light.json` → `scrollers[].oby`, `interact.json` → `sheet.scrollers[].oby`). `body{overflow:hidden}` stops the page from scrolling but not from chaining. A pull-down at the top of an inner scroller chains to the root, which in an Android Chrome tab is pull-to-refresh: a full reload of a 3 MB SPA. In a sheet that means losing the open picker or form, and a draft typed into it. Headless Chromium has no PTR UI, so this was proven from computed styles; confirming it is the first item in "Verify on hardware". | mobile-native §6 "Pull-to-refresh hijacks scroll → `overscroll-behavior: none` on html, body … `contain` on children"; Never Ship "touchmove + preventDefault" (don't) | `global.css`: `html, body { overscroll-behavior: none; }`. For inner surfaces, add `overscroll-behavior: contain` on the sheet body, e.g. `[data-pace-surface="sheet"] [style*="overflow"]`, or add a `data-pace-scroll` attribute to the kit's scroll views and target that. | `R6/css-now-ru-light.json`, `R6/interact.json` |
| 06-003 | major | Phone bottom sheet (every picker, form, confirm) | phone · both · ru, en | `apps/app/src/ui/sheet.tsx:49-58` (GrabHandle, a plain `View`), `:162` | The grab handle is decoration: no pan responder, no gesture-handler `Pan`, no pointer handling, on the web or on Android. A CDP touch swipe from the handle 400 px down left the sheet open (`afterSwipe: true`). Tapping the scrim does close it (pass). So the most-taught sheet gesture on both platforms does nothing, and in a browser tab it does worse (06-002). | Material 3 › Bottom sheets › "Drag handle … lets people resize or dismiss the sheet"; HIG › Sheets › "a grabber … indicates the sheet can be resized/dismissed by dragging"; review-animations: interruptible, follows the finger | Make the handle and title area a gesture-handler `Pan` (it runs on the web too) that drags the surface with the finger and rubber-bands upward. It dismisses past ~30 % of the sheet height or on a fast downward flick, otherwise it springs back. The body's `ScrollView` takes over the drag only when it is scrolled to the top. Add `touch-action: none` on the handle area in `global.css`. If that is out of scope, remove the handle; never draw an affordance without the behavior. | `R6/sheet-task-picker--phone-light-ru.png`, `R6/sheet-after-swipe--phone-light-ru.png`, `B/states/time-task-picker--phone-light-ru.png` |
| 06-004 | major | Time bar field "Чем заняты?", composer, sheet search fields (keyboard open) | phone · light · ru (layout identical in EN/dark) | `apps/app/public/index.html:5` (no `interactive-widget`); `apps/app/src/ui/screen.tsx:46-55` (footer pinned under the list); `apps/app/src/ui/tab-bar.tsx:93-98`; repo-wide: no `KeyboardAvoidingView` / keyboard listener in `apps/app/src` | Default Chrome (`resizes-visual`): the layout stays 844 px and the field sits at y 659–703, under a ~330 px keyboard (top ≈ 514). Chrome can only pan the visual viewport, so the header leaves the screen and the AI preview card that grows above the field is cramped. Emulating `resizes-content` (height 514): the field is visible at y 329, but the tab bar (67 px) stays above the keyboard and Now's task list shrinks to **48 px** (`layout514.scrollerH`), so the bar's running rows plus the field plus 4 buttons fill the screen. In a sheet with `resizes-content`, the Task picker's list keeps 279 px of 489 (works). The Expo app (SDK 57, edge-to-edge) has no keyboard avoidance at all. With edge-to-edge, Android stops applying `adjustResize`, so the bottom-pinned field is probably covered there too. Not verifiable here. | mobile-native Baseline "`interactive-widget=resizes-content` makes the software keyboard shrink the layout viewport on Android Chrome, so … bottom-pinned inputs react"; §11 "Test with the keyboard open"; Material › Navigation bar: bottom navigation is not shown over the keyboard (Google apps hide it while typing); HIG › Keyboards › "make sure the field stays visible" | `public/index.html`: viewport `…, viewport-fit=cover, interactive-widget=resizes-content`. `tab-bar.tsx`: hide while the soft keyboard is up (web: `visualViewport` height < layout height or a focused text field on a coarse pointer; native: `Keyboard` show/hide events). Time bar: fold the running rows while its field has focus. Native: wrap `Screen`'s footer and `Sheet` in `KeyboardAvoidingView` (`behavior="padding"`) or adopt `react-native-keyboard-controller`. Add a QA checklist line "keyboard open on every field" (bug-lessons guard). | `R6/kbd-timebar-focused-844--phone-light-ru.png`, `R6/kbd-timebar-resizes-content-514--phone-light-ru.png`, `R6/sheet-search-resizes-content-514--phone-light-ru.png` |
| 06-005 | major | All press feedback (Android native most of all) | phone · both · ru, en | 0 uses of `android_ripple` in `apps/app/src`. Pressables with **no** pressed style: `src/ui/tab-bar.tsx:55`, `src/ui/check-circle.tsx:23`, `src/ui/sheet.tsx:40`, `src/features/now/now-task-groups.tsx:32`, `src/shared/assistant/action-cards.tsx` (3), `src/features/week/week-grid.tsx`, `src/features/task/task-description.tsx` (3), `src/features/task/close-sheet.tsx`, `src/features/projects/color-swatches.tsx`, `src/shared/activity-usage.tsx`, `src/features/oauth/scope-list.tsx`, `src/features/task/source-text.tsx` | The only press feedback is an opacity dip: `active:opacity-70` ×30, `-80` ×12, `-75` ×1, set per call site. Twelve files have none, the bottom tabs and the task check circle among them, so a tap there gives nothing until the screen changes. On Android none of it is a ripple. On the web, react-native-web removes the browser's tap highlight (good, measured `rgba(0,0,0,0)`), so these controls are left with no feedback at all. | mobile-native §2 "make sure every tappable element has its own `:active` state, because you've just removed the only feedback the browser was giving"; §5 "Feedback on press"; Material › States › Pressed (ripple); brief: Material conventions on Android (ripple) | One `Touchable` primitive in `src/ui/` (used by Button, IconButton, rows, tabs, chips, check circle). On Android: `android_ripple={{ color: palette.pressed, borderless }}`. On the web: a pressed overlay or tint token, 100–160 ms ease-out, applied on press-in. Remove the per-site `active:opacity-*` classes. Lint guard: no bare `Pressable` outside `src/ui`. | `R6/route_--phone-light-ru.png` (tabs, check circles), `R6/interact.json` |
| 06-006 | minor | Every control's label (web) | phone · both · ru, en | `apps/app/global.css` (no `user-select` rule); react-native-web `Text` default `user-select: auto` | `user-select` is `auto` on **18/18** controls on Now, and on 17 of the 26 controls that hold a text label (`routes-audit.json → selectableLabels`). On Android Chrome a long press on a button, tab or chip label selects the word and shows the Copy/Share toolbar with a haptic tick. This is worst on the task footer's primary button, whose *own* long press (`task-footer.tsx:78`, `onLongPress={onClose}`) races Chrome's selection gesture. Headless Chromium does not run the selection gesture, so this is shown from computed styles plus a hardware check. The Expo app is not affected (RN `Text` is not selectable by default). | mobile-native §8 "Long-press selects button text → `user-select: none` on controls; never on body"; Never Ship "`user-select: none` on body" | `global.css`: `[role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="link"], button { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }`. Content (task titles in detail, descriptions, source text, errors) stays selectable. | `R6/routes-audit.json`, `R6/longpress-done--phone-light-ru.png` |
| 06-007 | minor | Long-press on the task's primary button ("Готово" / "Сдать") | phone · both · ru, en | `apps/app/src/features/task/task-footer.tsx:74-82`; copy `packages/core/src/i18n/en/board.ts:102` | The only long-press in the app is hidden. The way to "close as cancelled/skipped, another time" lives in a long press that is only announced in `accessibilityHint`, so sighted touch users never learn it. On the web it also collides with text selection (06-006). Note: the task brief's "Alongside on long press" does not exist. "Параллельно с текущим" is a switch in the picker header (`choices-sheet.tsx:211-212`), which is discoverable (pass). | Material › Gestures › "long press … should not be the only way to perform an action"; HIG › Gestures › "don't rely on a gesture as the only way" | Keep the long press as an accelerator. Add a visible "⋯ / Other outcome" affordance next to the primary button (or a split button). On the web, apply `user-select: none` per 06-006. | `R6/route_task_01M5YZE1DQFFM2X2BEHF92W0--phone-light-ru.png`, `B/states/task-close-as--phone-light-ru.png` |
| 06-008 | minor | Toast over the tab bar / time bar | phone · both · ru, en | `apps/app/src/ui/toast.tsx:91-104` | Toast offsets are hard-coded: `BASE_BOTTOM = 96` and `TAB_BAR_HEIGHT = 72`. The real tab bar is `pt 6 + 49 + max(insets.bottom, 8) + 4` (`tab-bar.tsx:97`), measured at **67 px** with a 0 inset. On a phone with 3-button navigation (≈48 dp bottom inset, which Chrome edge-to-edge and the Expo app both report), the tab bar grows to ≈107 px. The toast then overlaps it by ≈11 px with no footer and ≈35 px above Now's time bar. | mobile-native §7 "Fixed headers, bottom tab bars, toasts, and sheets are the elements that need this"; HIG › Layout › safe areas | Measure the tab bar with `onLayout` into the same context the footer height already uses, or at least add `insets.bottom` to both constants. | `B/states/toast-to-inbox--phone-light-ru.png` |
| 06-009 | minor | Week, phone: sideways day columns | phone · light · ru | `apps/app/src/features/week/sideways-days.tsx:52-62`; hint `week-screen.tsx:116` | The horizontal day scroller has no snapping: columns stop mid-day, e.g. "р, 28" cut at the left edge. Its only edge cue is a text line at the foot of the screen ("Листайте дни вбок" / "Swipe the days sideways"), far from the strip it explains. `overscroll-behavior-x: auto`, so a fling past the first day hands the gesture to the browser or OS edge gesture. Measured: scrollWidth 504 / clientWidth 334, `scroll-snap-type: none`, no mask. | mobile-native §9 "prefer `scroll-snap-type: x mandatory` on the track and `scroll-snap-align: start` … the browser's own physics beat a hand-rolled spring"; HIG › Scroll views › "indicate that there is more content" | `snapToInterval={minColumnPx}` + `decelerationRate="fast"` on native. On the web, `global.css` `[data-testid="week-days"] { scroll-snap-type: x mandatory; overscroll-behavior-x: contain }` with `scroll-snap-align: start` on columns, or a `pagingEnabled` day pager. Replace the text hint with a soft edge fade (mask) on the side that has more. | `R6/week--phone-light-ru.png`, `B/routes/week--phone-light-ru.png` |
| 06-010 | minor | Tooltips on touch (Week's moon switch; any `<Tooltip>` with the default) | phone · light · ru | `apps/app/src/ui/tooltip.web.tsx:176` (`showsOnTap = true`), `:222-226`; `src/features/week/week-screen.tsx:44` | On a touch screen a tap both runs the control and pops a dark bubble for 2.5 s (`TAP_TOOLTIP_MS`). Tapping the night-hours moon toggled the switch *and* showed "Ночные часы" over the day header. Hover itself is correctly ignored for touch (pass). | Material › Tooltips › "Plain tooltips appear on … long press" (touch); HIG: no tooltips on touch, the label has to stand on its own | On a coarse pointer, open the tooltip on long-press (≥ 450 ms, without firing `onPress`), never on tap. Then the `showsOnTap` prop goes away. | `R6/tooltip-on-tap-week-moon--phone-light-ru.png` |
| 06-011 | minor | Launch: PWA splash and Android splash | phone · light · ru, en | `apps/app/public/manifest.webmanifest:8-9`; `apps/app/app.config.ts:71`, `:82`, `:112` | `background_color` / `theme_color` are `#0b0b0c` and the native splash is `#0b0b0c` with no dark/light variant. A light-theme user launches into a black splash, then `#f4f5f7` (`body`), then `#eceef2` (app): three surfaces in the first second. A manifest cannot vary by scheme, but the native splash can (`expo-splash-screen` `dark: {…}`). | mobile-native §10 "For an installed PWA … the manifest's `theme_color`/`background_color` are the same decision"; HIG › Launching › "the launch screen should look like the first screen" | Native: splash `backgroundColor` = light token `bg` with `dark: { backgroundColor: dark bg }`. PWA: pick the token `bg` of the theme most users run, and make the boot script from 06-001 set `body` to the *app* theme so at least the second hop disappears. | — (launch, not screenshot-reachable) |
| 06-012 | minor | Update strip, phone | phone · both · ru, en | `apps/app/src/platform/update-banner.web.tsx:94-114` | The strip's only action, "Обновить / Refresh", is `px-3 py-1` around `text-sm`: about 30 px tall, below Material's 48 dp and HIG's 44 pt (WCAG 2.5.8 AA's 24 px passes). The strip is `accentQuiet` blue while the status bar above it keeps the page `bg` color (06-001), so in a browser tab the top of the screen shows two bands. Insets are handled (`paddingTop: insets.top + 10`, and the screens below get `top: 0`): pass. Could not be triggered without a second build. | Material › Accessibility › touch targets 48×48 dp; HIG › Layout › "hit targets at least 44×44 pt" | `min-h-11` (44 px) hit area via padding or `hitSlop`. Let the theme-color effect from 06-001 take the strip color while it shows. | — (code; strip not reachable on the shared stack) |
| 06-013 | nit | Manifest polish | phone | `apps/app/public/manifest.webmanifest` | No `id` (install identity falls back to `start_url`). No `screenshots` (Chrome on Android shows the richer install sheet only with `form_factor: "narrow"` screenshots). No `shortcuts` (long-press on the home-screen icon could offer "Новая задача" → `/add`, which already exists as the share target). `"purpose": "any maskable"` on one file. Core fields pass: `display: standalone`, `start_url: "/"`, `scope: "/"`, `share_target`. The 512 icon's glyph sits inside the maskable safe zone (checked visually). | web.dev › "Add a web app manifest" (id, screenshots, shortcuts); Lighthouse "maskable icon" (separate purposes) | Add `id: "/"`, two narrow screenshots (Now, Day), a `shortcuts` entry for `/add`, and split `icon-512.png` (`any`) from `icon-maskable-512.png` (`maskable`). | `apps/app/public/icon-512.png` |
| 06-014 | nit | Install prompt | phone | repo-wide: no `beforeinstallprompt` handler | Pace relies on Chrome's ambient mini-infobar or menu item. There is no "Install app" entry in More/Settings for someone who dismissed it once. | mobile-native §11 "Test as an installed PWA if that's a target" (standalone is the target: `display: standalone`) | Catch `beforeinstallprompt`, offer one quiet "Установить приложение" row in More when it is available, and hide it in `display-mode: standalone`. | — |

### Checks that pass (with evidence)

| check | result | evidence |
|---|---|---|
| Sticky hover after tap (§1) | **pass.** No `:hover` rule in any stylesheet (`css-now-ru-light.json` → `hover: []`). react-native-web's `useHover` ignores `pointerType === "touch"` (`react-native-web/dist/modules/useHover/index.js:83,95,131`). `tooltip.web.tsx` guards pointer enter/leave with `isTouch`. The update strip's `onHoverIn` goes through the same RNW hover. Hover *styling* is absent everywhere (known), so a future hover layer must be wrapped in `@media (hover: hover) and (pointer: fine)` from day one. | `R6/css-now-ru-light.json` |
| Tap highlight flash (§2) | **pass.** `-webkit-tap-highlight-color: rgba(0,0,0,0)` on `html` and on 18/18 controls (RNW reset). The cost is 06-005. | `R6/css-now-ru-light.json → btnStats.tapHighlight` |
| `100vh` vs `dvh` (§3) | **pass.** No `vh` anywhere (`vhRules: []`). `html, body, #root` use `height: 100%` with flex, and `body{overflow:hidden}` means the document never scrolls, so the URL bar does not collapse in a tab. Resizing 844 → 760: tab bar bottom = 760 exactly; sheet bottom tracks the window. | `R6/h760-now--phone-light-ru.png`, `R6/interact.json → h760` |
| 300 ms tap delay / double-tap zoom (§5) | **pass.** `width=device-width` (Chrome turns off double-tap zoom), and `touch-action: manipulation` on every *enabled* pressable (15/18 on Now; the 3 `auto` ones are disabled buttons: "Во входящие", "Отправить ассистенту", "Посмотреть действия ассистента"). Switches (`input[role=switch]`) and closed-task check circles are `auto`, which is harmless at device-width. Pinch zoom is kept: no `user-scalable=no` or `maximum-scale` (Hard Rule 4). | `R6/routes-audit.json → noManip` |
| Safe areas (§7) | **pass in code** (except the toast, 06-008). `viewport-fit=cover` is set (`index.html:5`). safe-area-context on the web reads `env(safe-area-inset-*)` (`NativeSafeAreaProvider.web.js:93-101`). Insets are applied by `screen.tsx:32` (top), `tab-bar.tsx:97`, `sheet.tsx:160`, `task-footer.tsx:55` and the update strip. All insets are 0 in emulation, so confirm on hardware. | code |
| Focus outline appearing on tap | **pass.** After tapping "Начать другое", `activeElement` is the BUTTON, `:focus-visible` false, outline `none`. Text fields show *no* focused state at all on the phone (border stays `rgba(0,0,0,0.13)`, caret only): the known `global.css:44-46` issue, which on a phone is mitigated by the caret and keyboard. | `R6/interact.json → afterTapFocus, fieldFocusStyle` |
| Scrim tap closes the sheet | **pass** (`afterScrim: false`). Android back closes it too (`onRequestClose`). | `R6/interact.json` |
| `-webkit-text-size-adjust` | **pass** (`100%`). | `R6/css-now-ru-light.json` |
| Manifest core | **pass.** `display: standalone`, `start_url: "/"`, `scope: "/"`, `share_target` → `/add`. | `apps/app/public/manifest.webmanifest` |
| Service-worker offline load | **pass.** SW `activated` and controlling after one reload. `setOffline(true)` plus navigating to `/` rendered Now with all seeded tasks from the precache and the local store. | `R6/offline-now--phone-light-ru.png`, `R6/theme.json → sw, offline` |
| Horizontal chip strip direction (Now project chips) | **pass.** A native horizontal `ScrollView`, so the browser does the axis lock, and chips bleed to the edge so a cut chip is the cue (`project-chips.tsx:23-28`). It did not overflow on the seeded account; it has no snap (fine for chips). | `R6/route_--phone-light-ru.png` |

### Inputs < 16 px (§4), measured on every route and in sheets

Every text field is **15 px**: composer `Новая задача` (textarea), time bar `Чем заняты?`, task form fields
(`Название`, `Описание`, `Ссылка` on `/add`), Settings digest times and night hours (`inputmode=numeric`),
journal search, preset name and estimate (`inputmode=decimal`), the picker's `Найти задачу`, login
`Telegram id`. Only the sheet's switch input is 16 px. **Android Chrome does not zoom on focus**, so for
the owner's phone this is not a defect. iOS Safari does zoom and stays zoomed. iOS is not a native target
(`app.config.ts:72`), but the PWA is how an iPhone would run Pace. Recorded as part of the type-scale decision rather than as a finding:
make the field size 16 px on coarse pointers (`@media (pointer: coarse) { input, textarea { font-size: 16px } }`
in `global.css`, or a 16 px field token). Keyboard hints are mostly right (`inputmode` numeric/decimal/url,
`enterkeyhint` go/search/done). The composer textarea has no `enterkeyhint`, though its Enter submits on a
phone (`platform/enter-key.ts`). Add `enterKeyHint="send"`. Evidence: `R6/routes-audit.json`, `R6/interact.json → sheet.inputs`.

## Verify on hardware

Only a real Android phone can confirm these. Use Chrome (tab **and** installed PWA) and the Expo build;
an older mid-range phone beats a flagship. Open the dev server by LAN IP and use `chrome://inspect`.

1. **Pull-to-refresh (06-002).** Chrome *tab*, Now scrolled to the top: drag down from the task list. Does
   the page reload (spinner, then a white flash, then the app boots)? Repeat inside an open sheet whose list is at the top,
   with text typed into the sheet's search. Repeat in the *installed* PWA, where Chrome's PTR behaves
   differently. After the fix, the list should bounce or glow and nothing reloads.
2. **Keyboard over the time bar (06-004).** Chrome tab and PWA: on Now, unfold the bar and tap "Чем заняты?".
   Is the field above the keyboard? Does the header slide away? Is the tab bar visible above the
   keyboard? Type a phrase and wait for the AI preview card: can you see it and its Approve button? Then
   the **Expo app** on Android 15+ (edge-to-edge): the same field, the composer, the Task picker's
   "Найти задачу", and the time fields in Settings and the activity sheet (number pad). Is anything
   covered? This decides whether 06-004 is a blocker on native.
3. **Status bar color (06-001).** Phone in light mode, Pace → Settings → theme dark (and the reverse): look
   at the status bar and Chrome's toolbar. Open any picker: does the status bar stay bright above the scrim?
   Cold-start the PWA in light mode: count the colors you see before Now appears (06-011).
4. **Long-press on labels (06-006/06-007).** Chrome: hold a finger on the tab "День", a chip, the
   "Начать другое" toggle and a task's "Готово". Does a word get selected, does the Copy/Share toolbar appear,
   is there a haptic tick? On "Готово": does the close-as sheet open *and* a selection appear?
5. **Sheet drag (06-003).** Expo app and Chrome: try to drag a picker down by its handle. Today nothing
   should happen in the app, and the tab may reload (item 1).
6. **Safe areas with 3-button navigation (06-008).** Settings → System → Gestures → 3-button navigation.
   Chrome tab, PWA and the Expo app: is the tab bar padded above the nav bar? Trigger a toast ("В
   Входящие") on Now and on a screen without a footer: does it overlap the tab bar or the time bar? In
   gesture navigation: is anything under the gesture pill, e.g. the Week hint at the foot of the screen?
7. **Press feedback (06-005).** Expo app: tap a tab, a task check circle, a group header. Is there a ripple,
   or anything at all before the screen changes? Chrome: the same.
8. **Edge gestures on Week (06-009).** Fling the day strip past Monday: does Chrome or the OS back gesture
   take over? Do columns stop half-cut?
9. **Text scaling.** Android font size at maximum plus Chrome → Settings → Accessibility → page zoom 150 % (web),
   and system font scale 1.3× (Expo app), in Russian: do the tab labels ("Входящие"), time-bar buttons
   ("Календарь", "Отдых") and sheet titles still fit? (NativeWind maps 1 rem = 14 px on Android, per
   inventory §0, which compounds with font scale.)
10. **Install and update.** Install from Chrome's menu: does the install sheet look rich or bare (06-013)?
    Long-press the home-screen icon: no shortcuts today. Deploy a new build: does the update strip appear
    under the status bar (not under the notch) in the PWA? Is "Обновить" easy to hit (06-012)?
11. **Tap latency.** Fast taps on the time-bar buttons and the tab bar: does any tap feel late? (Code says
    there is no 300 ms delay; RNW adds a 50 ms press-in delay, `PressResponder.js:74`.)
12. **Offline PWA cold start.** Airplane mode, then launch the installed PWA from the home screen: does Now
    appear with data (the emulated run says yes)?

## What this says about the system

- **The web platform layer has no owner.** `global.css` holds fonts, a focus reset and the slider. It has
  none of the skill's baseline (`overscroll-behavior`, `user-select` on controls, coarse-pointer field size,
  `interactive-widget`). What works today works because react-native-web ships it (tap highlight,
  `touch-action`, hover filtering). The spec should name a "mobile web baseline" block in `global.css` +
  `public/index.html` and a check that pins it: an e2e that reads the computed styles above at 390 px with
  `isMobile/hasTouch`. That fits bug-lessons' "add the guard that catches the class".
- **Theme is a React concern only; the document shell never hears about it.** `theme-color`,
  `color-scheme`, `body` background, the manifest and the native splash are hand-copied literals
  (`#f4f5f7`, `#0b0b0c`) that have already drifted from `tokens.json`. Fix the class: generate them from
  tokens (in `scripts/build-web.ts` or a boot script) and sync them at runtime from the resolved scheme
  (`src/platform/theme-color.web.tsx`).
- **No input state exists in the design system for "the keyboard is up".** Screens assume a fixed-height
  phone. The redesign needs a defined keyboard layout: what folds, what hides (tab bar), what stays (the
  focused field plus its preview), for the web (`interactive-widget=resizes-content` + `visualViewport`) and
  for native (keyboard avoidance under edge-to-edge).
- **Interaction feedback is styled per call site, not owned by a primitive.** 43 hand-written
  `active:opacity-*` classes, 12 files with none, 0 ripples. One `Touchable` in `src/ui/` with a pressed
  token (ripple on Android, a tint on the web) fixes the class and gives the redesign one place to set motion.
- **Affordances are drawn without behaviors.** A grab handle with no drag, tooltips on tap, an action
  reachable only by a hidden long press. The spec should list every gesture the kit supports, and the kit
  should draw a handle or a hint only when the gesture behind it exists.
- **Hard-coded geometry instead of measured geometry.** The toast uses `96`/`72` while the tab bar grows
  with insets. Anything that floats should read measured sizes from layout context, never constants.
- **Emulation was the bar.** QA round 4: "the web build has no soft keyboard". The QA procedure needs a
  real-phone pass (the list above) before a release. Device emulation cannot show PTR, the keyboard,
  selection, ripples or insets.

### Where each fix lands

| fix | file |
|---|---|
| `overscroll-behavior` root + sheet body (06-002) | `apps/app/global.css` |
| `user-select`/`-webkit-touch-callout` on controls (06-006) | `apps/app/global.css` |
| coarse-pointer 16 px fields | `apps/app/global.css` (or the field token in `tokens.json` via `tailwind.config.js`) |
| Week snap + `overscroll-behavior-x` (06-009) | `apps/app/global.css` + `src/features/week/sideways-days.tsx` |
| sheet drag handle (06-003) | `apps/app/src/ui/sheet.tsx` (gesture-handler, both platforms) + `global.css` `touch-action` |
| `interactive-widget=resizes-content`, boot theme script (06-001, 06-004) | `apps/app/public/index.html` |
| runtime `theme-color`/`color-scheme`/`body` sync (06-001) | new `apps/app/src/platform/theme-color.web.tsx` (+ no-op `theme-color.ts`), mounted from `src/ui/theme-provider.tsx` |
| hide tab bar with keyboard, fold time bar while typing (06-004) | `src/ui/tab-bar.tsx`, `src/shared/tracking/time-bar.tsx`; web keyboard detection in `src/platform/web/` (a `visualViewport` hook), native via `Keyboard` |
| native keyboard avoidance (06-004) | `src/ui/screen.tsx`, `src/ui/sheet.tsx` |
| `Touchable` primitive with ripple/tint (06-005) | `src/ui/` (new), consumed by kit and feature rows |
| tooltip on long press for touch (06-010) | `src/ui/tooltip.web.tsx` |
| toast offset from measured tab bar (06-008) | `src/ui/toast.tsx`, `src/ui/tab-bar.tsx` |
| visible "other outcome" control (06-007) | `src/features/task/task-footer.tsx` |
| update strip hit target (06-012) | `src/platform/update-banner.web.tsx` |
| manifest `id`/`screenshots`/`shortcuts`/maskable split, splash color (06-011, 06-013) | `apps/app/public/manifest.webmanifest`, `public/` icons, `apps/app/app.config.ts` (splash `dark`); colors generated from tokens in `scripts/build-web.ts` |
| install entry (06-014) | `src/platform/web/` (install hook) + More screen |
