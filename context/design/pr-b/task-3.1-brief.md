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

