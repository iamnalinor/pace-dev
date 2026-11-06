# Task 3.1 re-review (bf0c9fd..4f33e1e)

Read-only review of the diff; tests and lint were not re-run (the implementer's results are taken as reported).

## Findings

- **Important 1 (ARIA per role): addressed.**
  - `selected` is typed and emitted only for tab, option, row and gridcell. `checked` is typed and emitted only for checkbox, radio and switch.
  - `stateOf` drops a state the role may not carry, so a loosely typed caller still cannot emit an invalid attribute.
  - `aria-selected` and `aria-checked` come from the same `state` object, so they cannot disagree with `accessibilityState`.
  - `LinkProps` and `AnchorProps` omit both props.
  - `pressable.markup.web.test.tsx` renders react-native-web's real markup. It pins `aria-disabled="true"`, `aria-checked` without `aria-selected` on a checkbox, and no `aria-selected` on five other roles.
  - The forced-colours selected rule now matches `aria-selected` or `aria-checked`.
- **Minor 2 (ratchet): addressed.**
  - Counts are keyed by constant, and the bare-pressable ratchet counts only messages containing `BARE_PRESSABLE_MARKER`.
  - `eslint.config.ts` and `eslint-all.ts` share the one marker constant.
  - Any other `no-restricted-imports` warning now falls into "other warnings", which stays fatal.
  - The ban also covers the gesture-handler touchables and namespace imports, and a test pins all three import forms.
- **Minor 3 (overlay): addressed.**
  - The overlay is now `[data-pace-press]::after` with `inset: 0`, `border-radius: inherit` and `pointer-events: none`.
  - Clicks are not blocked.
  - The control's own shadow and transition are no longer touched, and an opaque child can no longer hide the overlay, because `::after` paints on top.
  - The gallery gained an opaque-child case and a raised-control case.
  - The overlay is inset to the padding box, so a bordered control leaves its border uncovered, and a caller radius that differs from the outer one is slightly off. This is cosmetic.
- **Minor 4 (no `onPress`): addressed.**
  - With neither `onPress` nor `onLongPress`, the Pressable gets no press, no Android ripple, no `data-pace-press` and no haptic. This is tested.
- **Minor 5 (Space, per the controller ruling): addressed.**
  - The web Pressable owns Space for tab, checkbox, radio and switch.
  - Buttons are excluded, so react-native-web's own Space press does not fire twice.
  - The disabled gate lives in `spacePress` and receives `shared.disabled`, so it is inert when disabled. This is tested.
  - Double-fire guard: the caller's `onKeyDown` runs first. If it prevented the default, as `spacePress` does, Pressable skips its own press. The `spacePress` helper itself acts only on Space, ignores repeats, and ignores keys from a child.
  - The guard is tested with a caller that still spreads `spacePress`.
  - Shape, hit target and disabled colours are deferred to Task 3.9, per the ruling.
- **Minor 6 (forced colours): addressed.** The tests assert exact declarations on exact selectors inside the block. `outline: ButtonBorder` replaces the useless `border-color`.
- **Minor 7 (loose tests): addressed.** The web test asserts the props of the element drawn, and `aria-disabled` is pinned in the markup test.

## New issues

None blocking.

- **Minor.**
  - The Space guard relies on the caller's handler calling `preventDefault`. A caller that presses on Space by other means, without `preventDefault`, would double-fire. No such caller exists in the kit today.
  - The key event is passed to `onPress` as if it were a press event. Nothing in `apps/app/src` reads `nativeEvent` or modifiers from a press today, but a later `onPress(event)` caller that does would break on Space.
- **Nit.** `checked="mixed"` is typed for radio and switch, where ARIA does not allow it. Only a checkbox may be mixed.
- **Nit.** In forced-colours mode the overlay is hidden, so there is no hover or press cue beyond the outline. This is stated in the CSS comment and accepted.

## Verdict

Approved. Not run here and still open, per the implementer: the e2e/axe pass and the shot matrix for the new gallery cases.
