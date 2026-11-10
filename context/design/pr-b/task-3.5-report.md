# Task 3.5 report: `Presence` and `Disclosure`

**Status:** DONE, with concerns. Branch `pr-b-local` in `/home/user/pace-dev-b`. Not pushed.
**Commits:** first `29101ca`, last `aca66e4` (docs). Task 3.4's e2e fix `7d460d3` sits after them and touches no Task 3.5 file.

## What was built
- **`ui/motion-presets.ts`**
  - `EASING.enter/exit/move`: `Easing.bezier` from the tokens.
  - `presenceFrom(preset, isReduced)`:
    - `fade` → opacity 0;
    - `rise` → opacity 0 plus `translateY` `space.3` (8);
    - `scale` → opacity 0 plus scale 0.96 (never from 0, F-MOT-06);
    - reduced → opacity only.
  - `presenceTiming`:
    - `fade` 160/110;
    - `rise` and `scale` 220/160;
    - reduced → `motion.reduced.fade` both ways.
- **`ui/use-reduced-motion.ts`**, `useIsMotionReduced()`
  - Reads the system setting through `AccessibilityInfo`: the read, plus the `reduceMotionChanged` listener.
  - Reanimated's Jest mock has no `useReducedMotion`, so the hook does not use it.
- **`ui/presence.tsx`**, `<Presence show enter exit initial onExited>`
  - The enter runs on the enter curve.
  - The exit keeps the children mounted until the exit animation's completion callback (`scheduleOnRN`) lets go and calls `onExited`. No timer is involved.
  - A `show` during the exit cancels the let-go.
  - Nothing animates on the first render unless `initial` is set.
  - Only a change of `show` animates.
- **Kit `Pressable`.** It gained `expanded`, which sets `accessibilityState.expanded` and `aria-expanded`. Tested natively and in the web markup.
- **`ui/disclosure.tsx`**, `<Disclosure open onToggle label count onShown>`
  - **Trigger:** a button with `expanded`; the label and a tabular count in `subhead` secondary; the accessible name is "label · count". It has one `chevron-right` that turns 90° on `easing.move`; with reduced motion it simply points.
  - **Content:**
    - It mounts on open, is measured, grows from 0 to the measured height while fading in (220 ms, `easing.move`), then takes back its own height.
    - On close it shrinks and fades out (160 ms, `easing.exit`), hidden from assistive tech (`aria-hidden`, `no-hide-descendants`, `pointerEvents none`), and unmounts on completion.
    - Opened again while closing, it grows back to the last measured height.
    - With reduced motion the height jumps and the fade stays.
  - `onShown` fires after the layout and the grow: callers move focus there with `preventScroll`.
- **Callers**
  - **`FoldedSection`:** Now's In future, a project's future and its done list. It is built on `Disclosure`, which takes over its raw Pressable and its ChevronUp/Down swap.
  - **The composer unfold (QA 22 carry-over):** it is now a `Presence` keyed by the card's shape ("line" / "form").
    - The card takes the new height in the swap frame, with no clip and no height tween. The content fades in.
    - The assistant's preview has its own `Presence` and is whole when it is announced.
    - Nothing animates when the composer first appears.
    - The card has `testID="composer-card"`.
  - **`ui/animated-height.tsx`** (and its test) is deleted.
- **e2e**
  - `e2e/support/geometry.ts` gained `expectDescendantsStayInside`: in every frame, every sized box inside the container must stay inside it on all four sides.
  - `overlays.e2e.ts` uses it for the form's unfold and for the preview, and then checks that Approve is wholly in the viewport.
  - `composer.e2e.ts`'s sampler measures against the card.
  - `CLIPPING_ANCESTOR` is now module-private.
- **Gallery:** `MotionSections`.
  - A `Disclosure` over the set's projects. The empty set has no fold.
  - A `Presence` card, rise in and fade out, toggled by a button.
  - EN and RU `dev.gallery.motion.*` keys; a test is included.
- **Ratchets**
  - `DESIGN_VALUE_WARNINGS` 70 → **68**: `DURATION_MS` and FoldedSection's `active:opacity-70` are gone.
  - `BARE_PRESSABLE_WARNINGS` 33 → **32**: task-list no longer imports React Native's Pressable.
  - Kit primitives stay at 10. The plan's baseline line was added.
- **Docs:** the spec's built notes for Presence and Disclosure; a bug-lessons row (class 5) for the clipped preview and unfold.

## Tests
- **Red first.** The modules were missing, and the Pressable `expanded` tests failed before the prop existed.
  - `presence.test.tsx` (6): the children are kept until the exit finishes and `onExited` fires; nothing animates on the first render; `initial` works; nothing is drawn while hidden; with reduced motion every preset is opacity-only in 160 ms, and the drawn start frame has no travel.
  - `disclosure.test.tsx` (5): expanded/collapsed with the label and count; no content while closed; the content is kept hidden until the close finishes; the 90° chevron; `onShown` fires after layout and the animation.
  - `use-reduced-motion.test.ts` (2).
  - Pressable `expanded` tests: native, and web markup.
- `bun lint`: green.
- `bun test:unit`: green (scripts 166, core 877, client 515).
- `bun test:app`: green, **139 suites, 1037 tests**.
- **e2e:**
  - The first run, on Task 3.4's tree before Task 3.5, was clean for the composer and overlays motion tests.
  - With Task 3.5, the first e2e run was valid for the earlier commits only.
  - The run that included Task 3.5 ran against another agent's server: it got `EADDRINUSE` on 4173 partway, and its results are invalid.
  - **Task 3.5's e2e is not confirmed.** Still to run: `overlays.e2e.ts` (the descendants sampler on the unfold and the preview), `composer.e2e.ts` and `worst-case.e2e.ts`.

## e2e confirmation (ports free, no EADDRINUSE in the log)
The same run as Task 3.4's confirmation, on tip `7d460d3`: **49 passed**. It covers:
- `overlays.e2e.ts`, including the descendants sampler on the form's unfold and on the preview;
- `composer.e2e.ts`;
- `worst-case.e2e.ts`, with the gallery's motion section;
- the route sweep's screen set.

This supersedes concern 1 below.

## Concerns
1. **(Resolved: see "e2e confirmation" above.)** e2e was not confirmed at first. The ports are taken by another agent.
2. **The composer no longer tweens the card's height.** It jumps in the swap frame while the content fades in. This was a deliberate choice: it is the only way to meet "no child's box leaves the card in any frame" and the half-hidden Approve carry-over. Spec §6's "height grows from the measured line height" would keep a clipped frame. The content below the card jumps with it.
3. **The time bar's unfold is not migrated.** `time-bar-fold.tsx` never used `AnimatedHeight`. Its merge into the time bar belongs to Task 4.3.7. `SectionHeader collapsible` and the "Show all" toggles are also not built yet.
4. **Not checked on hardware.** Reduced motion is read through `AccessibilityInfo`, and the measure-then-grow relies on `onLayout` (the web's ResizeObserver). Neither has been checked on Android hardware.
5. **No code review yet:** no subagents in this run.
