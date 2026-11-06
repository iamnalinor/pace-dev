# Task 3.1 report: `Pressable` state layer (+ haptics)

**Status:** DONE (with concerns below). Branch `pr-b-local` in `/home/user/pace-dev-b`, tip `d4e6455`, not pushed.

## Commits
- `e15ccb4` feat(app): haptics port over expo-haptics (spec §3.10), silent on the web
- `a4264b4` feat(app): kit Pressable, the state layer (Android ripple fill.3, web CSS overlay, delayPressIn 0, haptics)
- `c643b8b` lint: pressedClass for active: outside ui/pressable, bare-pressable import ban with its own exact ratchet (33)
- `7645f8d` feat(app): state layer in the worst-case gallery
- `d4e6455` docs: bug-lessons class 122 (F-CMP-01), lint baseline for Task 3.1, spec §4.1.1 built note

## What was built
- `apps/app/src/platform/haptics.ts` (+ `haptics.web.ts`, a no-op): `haptic(kind)`, where kind is `confirm | tick | longPress | reject`. On Android it calls `performAndroidHapticsAsync` with Confirm, Clock_Tick, Long_Press or Reject. The call is fire-and-forget. A refusal from a phone without a vibrator is caught on purpose, with a comment saying why.
- `expo-haptics` 57.0.3 added with `bunx expo install` in apps/app. It is pinned exactly, like the other deps.
- `apps/app/src/ui/pressable-props.ts` holds the shared props and `usePressableProps`. It is used by:
  - `pressable.tsx` (native): `android_ripple` with `{ color: palette["fill.3"], borderless: ripple === "borderless", foreground: true }`.
  - `pressable.web.tsx`: `delayPressIn: 0` and `dataSet.pacePress = ripple`. Both are passed through a cast, because React Native's types know neither.
- Pressable props:
  - The interface asked for: `role`, `label`, `selected`, `disabled`, `haptic`, `ripple`, `onPress`, `onLongPress`, plus every other React Native Pressable prop as a pass-through.
  - The haptic plays on press. A `longPress` haptic plays on long press instead. No haptic plays while disabled, and none on press-in.
  - `accessibilityState` carries disabled and selected. `aria-selected` is set too, because react-native-web ignores `accessibilityState`.
  - `shrink-0` is always on.
- `global.css` gets a `[data-pace-press]` block:
  - `user-select: none`, `-webkit-touch-callout: none` and no tap highlight.
  - Hover `fill.1`, only under `(hover: hover) and (pointer: fine)`.
  - Pressed: `:active` shows `fill.2` as an inset box-shadow that follows the corners. It comes in at 0 s and goes out over 100 ms on easing.exit.
  - Disabled controls get neither hover nor pressed.
  - Forced colours: `ButtonBorder`, `Highlight` / `HighlightText`, and the ring in `Highlight`.
  - The existing global `:focus-visible` ring applies.
- Gallery: a new "State layer" section in `screens/gallery/gallery-kit.tsx`, with EN and RU keys in `i18n/*/dev.ts`. It shows rest, disabled, borderless, and selected / not-selected tabs inside a tablist.

## Lint and ratchets
- **`pressedClass`.** `pace/no-raw-design-values` gained a `pressedClass` message. Any class with an `active` variant outside `apps/app/src/ui/pressable.tsx` is reported as `pressedClass` instead of the other class checks. The total stays at **74**: the 46 `active:opacity-*` moved from `offScaleClass` to `pressedClass`. `offScaleClass` is now 15, `rawDuration` 12, `rawColor` 1. No caller was migrated, so the number is not lowered.
- **Import ban.** `no-restricted-imports` now bans React Native's `Pressable` and the `Touchable*` components in `apps/app/src/{features,shared}/**`, tests excluded. The message points to `#app/ui/pressable`. It is a warning held by a new exact ratchet, `BARE_PRESSABLE_WARNINGS = 33`, in `scripts/eslint-all.ts`.
- **Ratchet script.** `scripts/eslint-ratchet.ts` now takes a list of `{ rule, constant, allowance }` per part. Each message names its own constant.
- **Plan.** The "Lint baseline" in `context/design/redesign-plan.md` has the dated line for both numbers.

## Bug lessons and spec
- **Bug lessons.** New class **122** (numbered 118 before the merge of PR A fix round 3), "A cross-cutting state drawn by every call site on its own", with rule, sweep and guard, plus one log row for F-CMP-01.
- **Spec.** The Pressable row in §4.1.1 gets a "Built (Task 3.1)" note. It records what was built, and what is not built yet: the auto-extended target and the disabled label/fill roles.

## Tests (all run)
- `bun lint`: green. The app part reports exactly 74 design-value and 33 bare-pressable warnings.
- `bun test:unit`: green. Scripts 138, core 877, client 515, agent 54.
- `bun test:app`: green, 122 suites and 912 tests. This includes:
  - `pressable.test.tsx` (9)
  - `pressable.web.test.tsx` (4)
  - `state-layer.test.ts` (5)
  - `haptics.test.ts` (6)
- Rule and config tests: `no-raw-design-values.test.ts` (5 new cases), `eslint-ratchet.test.ts` (2 new) and `eslint-scoped-bans.test.ts` (3 new).
- I made the ripple colour and `delayPressIn` wrong on purpose: both tests went red, then green again once restored.
- `bun test:e2e` was NOT run, as instructed: the ports are taken.

## Concerns
1. **e2e not run.** The new gallery section was never checked by `e2e/worst-case.e2e.ts` or axe. Its labels are fixed `t()` strings, not data. Selected is shown only as tabs inside a `role="tablist"` to keep axe's aria rules happy. Run the full e2e before merge.
2. **The import ban counts `no-restricted-imports` as a whole** in the app part. Any future `no-restricted-imports` warning anywhere in the app counts toward `BARE_PRESSABLE_WARNINGS`. Four raw-pressable files outside features/shared are not under the ban yet: `screens/projects-screen.tsx`, `screens/more-screen.tsx`, `screens/decisions-screen.tsx` and `platform/update-banner.web.tsx`.
3. **`selected` handling.** `selected` sets `aria-selected` on the web for any role. That attribute is only valid ARIA on tab, option, row and gridcell. Radio, checkbox and switch callers should keep `checked` semantics when they migrate.
4. **`shape` is not built.** The brief's `ripple` prop stands in for the ripple half of the spec's `shape`. The auto-extended hit target, disabled colours and `spacePress` are not inside Pressable yet; callers still add `spacePress` themselves (bug-lessons class 113).
5. **CSS values are guarded by a test, not lint.** `global.css` writes `100ms` and the exit cubic-bezier as literals. `state-layer.test.ts` holds them to `motion.duration.xs` and `motion.easing.exit`.
6. **No review yet.** The review through `superpowers:requesting-code-review` and the hardware check (ripple and haptics on a real Android) are not done. On the web, the press overlay is an inset `box-shadow`, so a caller that also sets `shadow-*` on the same element would lose its shadow while hovered or pressed.

## Fix round 1 (review `task-3.1-review.md`, on top of Task 3.2 at bf0c9fd)

Fixed test-first; Task 3.2's `onPress(event)` is kept.

- **Important 1.** `selected` is typed and emitted only for tab, option, row and gridcell. The new `checked` prop (`boolean | "mixed"`) sets `accessibilityState.checked` and `aria-checked`, only for checkbox, radio and switch. The props type is generic over the role, so `selected` on a button and `checked` on a tab are type errors, pinned with `@ts-expect-error`. At runtime the markup drops a state the role may not carry. `LinkProps` and `AnchorProps` omit both: a link marks the current page with `aria-current`.
  - New `pressable.markup.web.test.tsx` renders react-native-web's real markup with `react-dom/server`. It pins `aria-disabled="true"`, `aria-selected` on a tab, `aria-checked` and no `aria-selected` on a checkbox, no `aria-selected` on any of five other roles, and no `data-pace-press` without a press.
- **Minor 2.** Ratchets are keyed by their constant. A ratchet on a rule other checks share names a `marker`. The bare-pressable ratchet counts only messages carrying `BARE_PRESSABLE_MARKER`, the ban's own message; one constant is shared by `eslint.config.ts` and the ratchet. Another restricted import now counts as an "other warning".
  - The ban also covers `react-native-gesture-handler`'s pressables. `import * as RN from "react-native"` is reported too, as ESLint does when `importNames` is set; a test pins all three import forms.
- **Minor 3.** The web overlay is now `[data-pace-press]::after`, with `inset: 0`, `border-radius: inherit` and `pointer-events: none`. Hover and pressed tint its `background-color`, so the control's own shadow and transition are untouched. Forced colours hide the overlay, draw the boundary as a `ButtonBorder` outline and the ring in `Highlight`, and draw selected or checked in `Highlight` / `HighlightText`.
  - The gallery gained a checked checkbox, an opaque child that fills the control, and a raised control with the token overlay shadow.
  - `focus-ring.test.ts` stops reading at the forced-colours block, which must stay last (pinned).
- **Minor 4.** With no `onPress` and no `onLongPress`, Pressable passes `onPress: undefined`. It then gets no Android ripple, no `data-pace-press` mark (so no hover or press) and no haptic.
- **Minor 5 (ruling).** The web Pressable owns Space for tab, checkbox, radio and switch, with the disabled gate in one place. A caller's own `onKeyDown` runs first. If it already pressed on Space, the press is not repeated: `spacePress` prevents the key's default, and Pressable checks for that. Buttons are left to react-native-web.
  - No kit-Pressable caller spreads `spacePress` today. The remaining spreads are on raw React Native Pressables, which move to the kit in their own tasks; the guard keeps any that remain on a migrated control from double-firing. Tested.
- **Minors 6–7.** The forced-colours tests assert exact declarations on exact selectors inside the block. The web test asserts the props of the element drawn; `aria-disabled="true"` is pinned in the markup test.
- **Bug lessons.** Four log rows, under classes 106, 76, 5 and 106, each with its sweep and guard. Class 122's sweep note is updated.
- **Spec and plan.** The spec's §4.1.1 Pressable row and the plan's "Lint baseline" carry fix-round-1 lines.

**Moved to Task 3.9:** `shape`, the auto-extended hit target (44 px web / 48 dp) and the disabled label/fill roles.

**Checks:**
- `bun lint`: green. Ratchets are exact and unchanged: design values 72, bare pressables 33, kit primitives 71.
- `bun test:unit`: green. Scripts 157, core 877, client 515, agent 54.
- `bun test:app`: green, 129 suites and 970 tests.
- e2e: not run, as instructed. The new gallery cases still need the worst-case e2e, axe and a look in the shot matrix.
