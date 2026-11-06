# Task 3.2 review: kit Text, Icon, Link (d4e6455..bf0c9fd)

## Spec Compliance

Matches the brief, with one known gap (the lucide codemod, ruled out of this round) and a few unverifiable items.

- Text: `role/tone/numeric/policy/lines/level/chrome`. `truncate` sets `numberOfLines=1` and `ellipsizeMode=tail`, and every Text gets `style [{flexShrink:1,minWidth:0}]` (text-props.ts:1476, 1512). `level` gives `accessibilityRole="header"` plus `aria-level` (text-props.ts:1515-1517). Tests cover each. `policy` is a discriminated union, so `clamp` requires `lines`.
- Icon: 3 sizes from `size.icon`. Tones map to colour roles. It is hidden unless labelled (F-A11Y-19) and `filled` works. The stroke is computed as `1.75*24/size`. It deviates from the brief's literal `strokeWidth={1.75}` and `absoluteStrokeWidth`; see the ruling below.
- Link: expo-router `Link asChild` over the kit Pressable. On the web it is an `<a href>` through `href`/`hrefAttrs`. External addresses get `_blank` and `noopener`. I checked this against the installed code:
  - expo-router's `shouldHandleMouseEvent` skips `preventDefault` when ctrl, meta, alt or shift is held, and also when `currentTarget.target` is set. A modifier-click therefore falls through to the browser's own anchor behaviour. The same check means an external `_blank` link is not opened twice.
  - react-native-web's `PressResponder.onClick` (PressResponder.js:302-313) hands the click event to `onPress` and ignores only `altKey`.
  - So rerouting `onClick` to `onPress` (link.web.tsx:810-826) is correct, and the Pressable event pass-through is what makes it work.
- Lint guard: `pace/kit-primitives` (`rawIcon`, `rawLineLimit`). It is a warning under an exact ratchet (71), not an outright ban, with a dated plan line. That is the established pattern of 1.3 and 3.1. `DESIGN_VALUE_WARNINGS` 74 to 72 is lowered with a dated line, which is allowed.
- Bug-lessons: class 109 got a "Kit guard" paragraph plus a log row. The brief called it a "new class" but it already existed; the extension is fine. The sweep is honest: 23 sites remain and the ratchet counts them.
- Known gap (reported, not a finding): 48 raw lucide import sites remain, and Button, IconButton and the others still take `LucideIcon`.
- ⚠️ Not verifiable from the diff:
  - The real `class` generation for `text-numeric-*`, `text-danger` and `text-warn`. Lint is claimed green; the names exist in `scripts/design/generate-design.ts`.
  - The tab-bar "links" part of the brief (`ui/sidebar.tsx`/`tab-bar.tsx` links). The tab bar only got Icons; the report defers links to 3.10 "as the spec says". The spec text was not in the diff.
  - Everything in the browser: `e2e/link.e2e.ts`, the worst-case sweep, axe on the new gallery sections, keyboard Enter on the anchor.

### Rulings on the implementer's concerns

1. **Removed worst-case entry for the sidebar owner name: justified.**
   - The sweep (e2e/worst-case.e2e.ts:88-91) accepts a box that has `dataset.textPolicy === "truncate"` and a non-empty `title` or `aria-label`.
   - `text.web.tsx` sets both: `dataSet` plus a ref that calls `setAttribute("title", full)`. react-native-web 0.21 does not forward `title`, so the ref approach is needed.
   - The owner name is a plain string, so the title is set. If the entry had been kept, a stale KNOWN entry would likely fail.
   - It depends on the ref firing in a real browser, so the e2e must run before merge (see Issues). A ref plus `setAttribute` is a legitimate mechanism and survives re-render, because the ref callback changes with the children.
2. **Computed stroke instead of `absoluteStrokeWidth`: acceptable.** The maths equals what lucide's prop does: 1.75 on screen at every size. The test asserts the on-screen stroke at all three sizes, which is the intent of the brief's test. Cost: the brief and the spec table still say `absoluteStrokeWidth`; the spec note explains the deviation. This is a documented deviation, not a defect. Do not add `absoluteStrokeWidth` back, because lint fails on the deprecated prop.
3. **Unbuilt `truncate-middle`, `count`, hue tones, `lang`, `StopGlyph`, `NavItem`: acceptable.** None of them is in the brief's Interfaces for 3.2. The spec rows say "not yet" and name the owning task. `truncate-middle` is the one a later task (URLs) will need first, so keep it on the list.
4. **`e2e/link.e2e.ts` never run: a gate, not a defect.** The logic reads correct against expo-router and react-native-web (above). Jest cannot exercise the web branch, because under `jest-expo` `Platform.OS` is not web and `shouldHandleMouseEvent` takes its native path. link.web.test therefore checks `href`/`hrefAttrs` only. So this e2e is the only evidence for the headline constraint (Ctrl/Cmd-click opens a new tab). It must be run green in the fix round, together with the worst-case sweep and axe on the gallery.
5. **Pressable now passes the press event to `onPress`: approved.** It is the minimal widening that Link needs. The shared hook means web and native behave the same. Existing `() => void` callers still type-check. A handler taking an optional parameter of another type is rejected by `tsc`, so no caller silently receives an event. A test pins the pass-through.

## Strengths

- The yield rule (`flexShrink:1, minWidth:0`) is in the primitive, so class 109 stops depending on each site remembering it. The policy API makes truncation explicit and keeps UI strings from being cut by default.
- Real web semantics: the `<a href>` anchor, `rel`/`target` for external addresses, the `data-pace-press` hook for state-layer CSS, and the `onClick`-to-`onPress` reroute explained against react-native-web.
- The lint rule is small and tested (invalid/valid cases, aliased `Text`, `TextInput` left alone, tests skipped). The ratchet, the plan line and the bug-lessons row stay consistent: 72/33/71.
- Gallery coverage: type roles, truncate and clamp beside controls with worst-case data, icon sizes and tones, an internal and an external Link. Strings go through `t()`, EN and RU.
- Honest report: it lists the codemod, the e2e and the stroke deviation up front.

## Issues

### Critical
None.

### Important
None new. Conditions on approval:
- The fix round must do the lucide codemod (known gap).
- It must also run `bun test:e2e` for `link.e2e.ts`, `worst-case.e2e.ts` (the owner-name removal) and the axe sweeps over the new gallery sections. Until then the Ctrl/Cmd-click constraint and the title mechanism are reasoned, not proved.

### Minor
1. apps/app/src/ui/sidebar.tsx:1128 and 1234: the destination rows and the New task button are `h-10` (40 px). The global target is 44 px on the web. This is not a regression (it was `h-10` before), and the Pressable's auto-extended target is still "not yet" (spec: "Tasks 3.2+"). Fix: give the kit Pressable the `size.hitWeb`/`size.hit` minimum (or at least `min-h` here) now that the first real callers have moved.
2. apps/app/src/ui/link.web.tsx:810-826: a `disabled` Link still renders `<a href>`. react-native-web's `onClick` only stops propagation when disabled, for a non-button role, so the browser would still follow the href. `LinkProps` inherits `disabled`. Fix: drop `href` when disabled, or omit `disabled` from `LinkProps`.
3. apps/app/src/ui/text.web.tsx:1760: `dataSet.textPolicy` is attached only when `titleRef` returns a ref, so it is tied to the children being a plain string or number. A truncated text with JSX children gets neither marker and the sweep flags it. That is arguably right (rule 4 needs a title), but it is implicit. Fix: let the caller pass the full value (`title` prop or `fullText`), or document the limit in the spec note.
4. apps/app/src/ui/sidebar.test.tsx:979-984: "navigated to rather than pushed" asserts on the test router fake (`Link` stand-in calls `router.navigate`), so it is circular. The real expo-router Link is only covered by link.test (arrival at `/week`). Fix: add a real-router test that opens an already-open destination and shows it is not stacked, or reword the test name.
5. apps/app/src/screens/gallery/gallery-kit.test.tsx:80-84: "shows nothing it has no data for" only counts links, and no project row is asserted absent. Fix: assert `queryByText` on the sections that need data.
6. scripts/eslint-rules/kit-primitives.ts:2315, 2324: `rawIcon` matches only an exact-source `ImportDeclaration`. `export ... from "lucide-react-native"`, `lucide-react-native/dist/...` deep imports and `import * as RN` + `<RN.Text numberOfLines>` get through. Fix: also match `ExportNamedDeclaration` sources and prefix-match the source, and handle the namespace form. Low risk today, since the ratchet counts exactly.
7. apps/app/src/ui/link.web.tsx:800: it imports `./pressable.web.tsx` directly. That is legal, since it is not the Link's own base, but it hard-wires the web Pressable. The reason is that jest does not swap. Fix: add a one-line comment saying so.
8. `title` duplicates the visible text for assistive technology on web. This is harmless for a text that is cut, and it is the spec rule 4 mechanism. No change needed unless axe complains.

## Assessment

**Task quality: Approved**, conditional on the fix round (codemod) and a green e2e run.

The three primitives match the brief's interfaces and the spec. The Pressable event widening is the right and minimal change. The web anchor logic holds up when checked against expo-router 57 and react-native-web 0.21 source. The lint guard, ratchets, plan line and bug-lessons are consistent, and the unbuilt items are all outside the brief and recorded in the spec. What remains is verification, not design: nothing about the web Link behaviour or the removed worst-case entry has been exercised in a browser, so the e2e run is a hard gate before merge.
