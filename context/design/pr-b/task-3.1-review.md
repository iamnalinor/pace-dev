# Task 3.1 review (4553d9a..d4e6455)

### Spec Compliance
- ✅ Android native ripple, fill.3, foreground, bounded/borderless: pressable.tsx:647-660; pinned by pressable.test.tsx via nativeForegroundAndroid (real RN props, not a mock of the component).
- ✅ Web `delayPressIn: 0` (pressable.web.tsx:797) and CSS `:active` overlay, no `active:` class (global.css:64-80); RNW emits aria-disabled for `disabled` (checked in react-native-web Pressable index.js:125), so the `:not([aria-disabled="true"])` gating works.
- ✅ Hover only under (hover:hover) and (pointer:fine); out `duration.xs`/`easing.exit` (held to tokens by state-layer.test.ts); user-select/touch-callout; forced-colours block.
- ✅ disabled blocks onPress + accessibilityState.disabled; selected sets accessibilityState.selected; haptic once per press, none disabled, longPress kind on long press; haptics port + web no-op; expo-haptics pinned exactly.
- ✅ Lint: `pressedClass` (class-checks.ts:1451) outside ui/pressable.tsx; bare-pressable import ban (eslint.config.ts:1064) with its own exact ratchet 33; plan "Lint baseline" dated line; bug-lessons class 122 with sweep/guard.
- ⚠️ Brief item "a web snapshot has the focus-visible class" replaced by a `data-pace-press` dataSet assertion (pressable.web.test.tsx:715); the ring itself is the pre-existing global `:focus-visible` (global.css:57), the forced-colours ring is a string-contains test. Acceptable substitution, but nothing pins that the ring actually shows on a Pressable.
- ⚠️ Not verifiable here: e2e/axe on the gallery section, Android ripple on a *disabled* control (RN may still show native ripple feedback), hardware haptics. Implementer says e2e not run.
- ❌/partial vs spec §4.1.1 contract (implementer-declared): `shape`, auto-extended hit target (44 px web / 48 dp), disabled label/fill roles, Space via `spacePress` are not in Pressable; `label` not enforced when no text child. Brief 3.1 does not list them, so not a brief miss, but the global constraints (targets, Space, disabled treatment) are unmet until callers/tasks add them; confirm the plan assigns each to a named later task.

### Strengths
- Platform-drawn feedback (native ripple, CSS :active) so nothing waits for React; clean split into pressable-props.ts shared by both files; web-only code in `.web.tsx`.
- Tests assert real behaviour (responder grant/release with fake timers, real RN ripple props, mutation-checked by implementer); CSS held to motion tokens in both directions; hover-outside-media-block negative check.
- Ratchet refactor generic and tested (own constant named per message, "other warnings" still fatal); rule tests cover compound variants (`dark:active:`) and the `inactive:` false-positive.
- Haptic refusal swallowed with a stated reason; fire-and-forget.

### Issues
**Critical:** none.

**Important**
1. pressable-props.ts:421-426 (and global.css:91): `aria-selected` is emitted for every role. On the web it is invalid ARIA for button/radio/checkbox/switch (axe aria-allowed-attr), and the forced-colours "selected" rule hangs on it. Pressable offers no `checked`/`expanded`, and `accessibilityState` is in `Owned` (omitted), so radio/checkbox/switch callers have no sanctioned way to express state. Fix: emit `aria-selected` only for tab/option/row/gridcell (type `selected` accordingly) and add `checked` (-> accessibilityState.checked + aria-checked) before Task 3.2+ migrate callers; add a web test for a checkbox not carrying aria-selected.

**Minor**
2. eslint-ratchet.ts:1345 / eslint-all.ts:1189: `BARE_PRESSABLE_RULE = "no-restricted-imports"` counts every `no-restricted-imports` warning in the app part, so any future unrelated restricted import silently eats the allowance (and the "lower the constant" advice would mislead). Fix: count by message prefix (or use a dedicated custom message id / `no-restricted-syntax` selector) rather than rule id. Also `import * as RN` and gesture-handler touchables escape the ban; screens/projects, more, decisions and update-banner.web are outside it (documented).
3. global.css:77-80: the overlay is an inset box-shadow painted under children, so a child with an opaque background hides it, and a caller's `shadow-*`/elevation is replaced while hovered/pressed; the `transition: box-shadow` also overrides a caller's transition. The gallery tries only plain boxes. Add a gallery case with an opaque child and an elevated Pressable (break-ui), or move the overlay to a `::after` pseudo with `inset:0; border-radius:inherit; pointer-events:none`.
4. pressable-props.ts:431: `onPress` is always defined, so a Pressable given no `onPress` still ripples/hovers/plays its haptic as if actionable. Pass `undefined` when the caller has none.
5. Space: callers must still add `spacePress` themselves (class 113 risk repeats across every migrated control). Pressable could attach it for tab/checkbox/radio/switch roles with the disabled gate in one place.
6. state-layer.test.ts:884: the forced-colours test only checks that three system-colour names appear anywhere in the block; `border-color: ButtonBorder` does nothing on a borderless control. Weak but harmless.
7. pressable.web.test.tsx:761: `mockSeen.find(... aria-selected === true)` is loose (any recorded render); assert on the specific element's props. No test pins that `disabled` yields `aria-disabled="true"` on web, which the CSS gating depends on.

### Implementer concerns, ruled
- Ratchet counting all restricted-imports: valid, Minor (2).
- `aria-selected` on any role: valid, Important (1).
- Unbuilt shape/hit-target/disabled/Space: accepted as scoped out by the brief; must be owned by named later tasks (Minor 5 + spec note).
- CSS motion literals guarded by a test: acceptable (two-way equality with tokens).
- Inset-shadow overlay vs `shadow-*`: valid, Minor (3), fix before elevated controls migrate.

### Assessment
Task quality: Needs fixes (one Important). The state layer, tests and ratchets are well built and match the brief; the unconditional `aria-selected` / missing `checked` is an API-level accessibility defect that every migrated radio/checkbox/switch caller would inherit, so fix it now while there are no callers.
