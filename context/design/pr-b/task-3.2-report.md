# Task 3.2 report: kit `Text`, `Icon`, `Link`

**Status:** DONE, with concerns below. Branch `pr-b-local` in `/home/user/pace-dev-b`. Tip `bf0c9fd`. Not pushed.

## Commits (on d4e6455)
- `c3e328b` feat(app): the kit Text. The kit Pressable now hands the press event to `onPress`.
- `6d8f5c3` feat(app): the kit Icon.
- `646f69a` feat(app): the kit Link. It is an `<a href>` on the web.
- `87dc34b` feat(app): sidebar destinations are kit Links. The sidebar and the tab bar draw kit Icons.
- `fcf4faa` lint: the `pace/kit-primitives` rule, with the exact ratchet `KIT_PRIMITIVE_WARNINGS` = 71. Design values go from 74 to 72.
- `f2dd19d` dev: gallery sections, i18n EN/RU, and the worst-case e2e entry removed.
- `bf0c9fd` docs: bug-lessons class 109, the plan's lint baseline line, spec §4.1.1 "Built (Task 3.2)" notes.

## Interfaces (for later tasks)

### `ui/text.tsx` (+ `.web.tsx`, `text-props.ts`)
`<Text role tone numeric policy lines level chrome …RN TextProps>`
- **role:** a `TypeRole` from core. It maps to the literal `text-<role>` class, plus `font-sans`. Numeric roles add `tabular-nums`.
- **tone:** `primary` (the default), `secondary`, `tertiary`, `accent`, `danger` or `warn`.
- **numeric:** adds `tabular-nums` to any role.
- **policy:** one of:
  - `wrap`: the default.
  - `truncate`: `numberOfLines` 1 with a tail ellipsis.
  - `clamp`: needs `lines`.
- **level:** 1 to 4. Sets `accessibilityRole="header"` and `aria-level`.
- **chrome:** sets `maxFontSizeMultiplier` to 1.6.
- **Always:** `style` starts with `{ flexShrink: 1, minWidth: 0 }`.
- **Web only:** a cut text (truncate or clamp) gets `dataSet.textPolicy` and a ref that writes the full value into `title`. This is what `e2e/worst-case.e2e.ts` accepts as declared. The ref is `titleRef` in `text-props.ts`.
- **Props the kit owns:** RN's `role`, `numberOfLines`, `ellipsizeMode` and `maxFontSizeMultiplier` are not passed through from callers.

### `ui/icon.tsx`
`<Icon name size tone filled label>`
- **name:** an `IconName`, lucide's kebab name such as `"chevron-right"`. The kit lists all 45 glyphs the app uses today. This file is the only place lucide is imported.
- **size:** `inline` 16, `control` 20 (the default) or `bar` 24, from `size.icon`.
- **tone:** `secondary` (the default), `primary`, `tertiary`, `accent`, `onAccent`, `danger` or `warn`.
- **filled:** sets `fill` in the icon's tone.
- **label:** sets `role="img"` and `aria-label`. Without a label the icon gets `aria-hidden`.
- **Stroke:** it is passed as `1.75 × 24 / size`, which is 1.75 on screen at every size.

### `ui/link.tsx` (+ `.web.tsx`, `link-props.ts`)
`<Link href …PressableProps (minus role, onPress, onLongPress)>`
- Built as expo-router `Link asChild` around an Anchor, which renders the kit `Pressable` with role `link`.
- **Web:** `href` and `hrefAttrs` reach react-native-web's View, so it renders `<a href>`. expo-router's `onClick` becomes the Pressable's `onPress`, because react-native-web's Pressable would override it. expo's handler then reads the modifier keys: Ctrl, Cmd or Shift-click opens a new tab, and a plain click navigates in place (NAVIGATE).
- **External addresses** (`http(s)://`) get `target="_blank" rel="noopener"`.
- **Native:** `href` is dropped and the navigation runs through `onPress`. External addresses go to `Linking.openURL`, through expo-router.

### `ui/pressable-props.ts`
`onPress` is now `(event: GestureResponderEvent) => void`, and the event is passed on. Existing `() => void` callers still type-check.

### Test router fake
`src/test/router.ts` gained a `Link` that clones its child with `href` and an `onPress` that calls `router.navigate(href)`.

## Lint guard and ratchets
- **New rule `pace/kit-primitives`** (`scripts/eslint-rules/kit-primitives.ts`) has two messages:
  - `rawIcon`: any `lucide-react-native` import outside `ui/icon.tsx`, type imports included.
  - `rawLineLimit`: `numberOfLines` on a JSX element bound to React Native's `Text` outside `ui/text(.web).tsx`. Aliased imports are covered. `TextInput` is not affected.
- It runs as `warn` on all of `apps/app`. Tests and fakes are skipped.
- **Ratchet:** `KIT_PRIMITIVE_WARNINGS = 71` in `scripts/eslint-all.ts` (`rawIcon` 48, `rawLineLimit` 23), constant `KIT_PRIMITIVE_RULE` in `eslint-ratchet.ts`.
- **`DESIGN_VALUE_WARNINGS`** went from 74 to **72**. The two removed warnings are the sidebar's `active:opacity-70` and `active:opacity-80`. **`BARE_PRESSABLE_WARNINGS`** stays at 33.
- **Plan:** the dated line is under "Lint baseline" in `context/design/redesign-plan.md`.

## Callers migrated
- **Sidebar:**
  - Its destinations are now `Link href` with an `Icon`. They were `router.navigate` before; Link uses the same NAVIGATE action.
  - The New task button is the kit `Pressable` with `Icon plus tone=onAccent`.
  - The owner name is `Text policy="truncate"`.
  - Visible change: sidebar icons are 20 instead of 18.
- **Tab bar:** icons only. They stay at size `control` (20), as before. The tab bar is still a `tablist` of tabs: the links, the `bar` size and the pill belong to Task 3.10, as the spec says.
- **No other lucide sites were migrated.** See concern 1.

## Gallery
`screens/gallery/gallery-kit.tsx` now takes `data` and adds four sections:
- Type roles: every `TYPE_ROLES`, with numeric samples through `formatCount` and `formatDuration`, plus a level-2 heading.
- Text from data in a row: each project name `truncate` beside a folder icon and a `CountBadge`, and the first inbox capture `clamp 4`.
- Icons: 3 sizes × 6 tones, and an inline icon beside a footnote.
- Links: an internal link to `/`, and `data.link` (the worst-case unbreakable URL) as an external Link with `truncate`.

The section headings are now `Text level={2}`. The EN and RU keys are `dev.gallery.section.{type,textPolicy,icons,link}`, `dev.gallery.type.*`, `dev.gallery.icons.inline` and `dev.gallery.link.inside`. There is a jest smoke test, `gallery-kit.test.tsx`.

## Bug-lessons and spec
- **Bug-lessons:** class 109 ("Text from data in a flex row without a shrink rule") already existed. It got a "Kit guard (Task 3.2, F-DAT-02)" paragraph with the rule, guard and sweep, and a log row. The sweep result: 23 line limits remain, counted by the ratchet. The tags and labels (`ColorTag` first) move in Task 3.9 and the 4.x tasks.
- **Spec:** the §4.1.1 rows for Text, Icon and Link each have a "Built (Task 3.2)" note, saying what is built and what is not yet.

## Tests (all run)
- **`bun lint`:** green. The app part reports exactly 72, 33 and 71.
- **`bun test:app`:** green, 128 suites and 941 tests. New tests:
  - `text.test.tsx` (10)
  - `text.web.test.tsx` (5)
  - `icon.test.tsx` (6)
  - `link.test.tsx` (2)
  - `link.web.test.tsx` (2)
  - `gallery-kit.test.tsx` (2)
  - a Pressable event test
  - a sidebar navigate test
- **`bun test:unit`:** green. Scripts 156, core 877, client 515. New tests: `kit-primitives.test.ts` and the kit-primitives cases in `eslint-scoped-bans.test.ts`.
- **Red first:** the Text, Icon, Link and lint tests were written first and failed. I also broke the Pressable event pass-through and the Icon stroke (2 instead of the computed value) on purpose: the tests went red, then green again once restored.
- **`bun test:e2e` NOT run**, as instructed.

## Concerns
1. **The codemod the brief names was not done.** "Modify every lucide-react-native import site to Icon" conflicts with this run's rule to migrate callers only where tests need it. I followed the run's rule:
   - 48 lucide import sites remain and are counted by `KIT_PRIMITIVE_WARNINGS`. The kit files Button, IconButton, BackHeader, CheckCircle, Calendar, Sheet, SyncFrame and ScreenHeader are among them, and still take `LucideIcon` props.
   - The `Icon` name list already holds every glyph in use, so those migrations are mechanical.
   - The sizes will snap to 16, 20 or 24, and the strokes to 1.75. Some sites change visibly: the check marks at 12, 13 and 14 with strokes of 2.5 or 3, and the avatar at `size*0.5`.
2. **The e2e suite has not run.** Three things are unverified:
   - `e2e/link.e2e.ts` is new. It checks that Ctrl/Cmd-click on the sidebar's Week opens a new tab at `/week`, that the original tab stays on `/`, and that a plain click navigates in place.
   - In `e2e/worst-case.e2e.ts` I removed the KNOWN entry `F-DAT-07 /🌿 Bartholomew/`, the sidebar owner name. It is now declared through `data-text-policy` and `title`. If the ref-set title does not take effect in the browser, that set fails.
   - The new gallery sections have not been measured by the overflow sweep or by axe.
   Run the full e2e before merge.
3. **The kit Pressable changed.** `onPress` now receives the event, which Link needs on the web. It is a small widening of Task 3.1's interface; the 3.1 review may want to see it.
4. **`absoluteStrokeWidth` is not used**, although the brief and spec name it. It is deprecated in lucide 1.52, and the lint fails on `no-deprecated`. Its replacement `nonScalingStroke` relies on `vector-effect`, which I could not check on Android. Icon computes the same viewBox stroke itself. The test checks that the stroke is 1.75 on screen at every size, not the literal prop.
5. **Link and Pressable on the web.**
   - react-native-web's Pressable replaces any `onClick` it is given, so the web Anchor reroutes expo-router's `onClick` into `onPress`.
   - Keyboard Enter on the `<a>` goes through the browser's click, which I believe works but have not checked in a browser.
   - The `<a>` carries `data-pace-press`, so it gets the hover and pressed CSS.
6. **Not built** (noted in the spec): Text's hue inks, `lang`, `truncate-middle` and `count`; Icon's `StopGlyph`; `NavItem`; links in the tab bar (Task 3.10).
7. **No code review** through `superpowers:requesting-code-review` yet. No design shots or `impeccable polish` of the gallery, because those need the e2e or a browser.

## Fix round 1 (review: Approved on conditions)

**Status:** DONE. Branch `pr-b-local` in `/home/user/pace-dev-b`, tip `d2c6c4e` (on 4f33e1e, which carries Task 3.1's fix round). Not pushed.

### Commits
- `d13793b` fix(app): the kit Pressable is at least the target: 48 dp on a phone, 44 px on the web (M1).
- `8252293` fix(app): a disabled Link has no `href`. The navigate-not-push rule is now tested on the real router. Comment added on the direct `pressable.web` import (M2, M4, M7).
- `f59a00d` feat(app): Text takes `full`, the full value of a cut text that is built of parts (M3).
- `9bc02da` lint: `rawIcon` now catches re-exports and deep and dynamic imports; `rawLineLimit` catches namespace and default imports; `KIT_PRIMITIVE_WARNINGS` 71 → 10 (M6).
- `4a39c4e` test(app): the gallery's absence assertions (M5).
- `5da2a6a` refactor(app): the lucide codemod, plus the line limits that could move mechanically.
- `b9fc0db` docs: the plan's lint baseline line, bug-lessons rows for M1 and M2, spec built notes.
- `d2c6c4e` style: formatter output for the rule.

### The codemod (ruled in)
- **No lucide import is left outside `ui/icon.tsx`.** The rule now reports 0 `rawIcon`.
- **Kit components take an `IconName`:**
  - Button, IconButton and BackHeader take `IconName` props.
  - The `leading` render prop of Chip and RadioChips became `icon?: IconName`. The chip draws it at `inline` size, in tone `onAccent` when chosen and `secondary` otherwise.
  - Local component variables became name variables: `CloseIcon`, `Chevron`, `BackIcon`, the time-bar's `ICONS`, `DATE_ICONS`, the session row's `ICON`, the More rows, and the facts in picked-details.
- **Icon gained one glyph and two tones:**
  - `x` was missing from the glyph list.
  - `quaternary` is for a disabled control, such as the composer line button. It was `label.quaternary` before.
  - `inverse` (`bg.app`) is the check on a filled check circle or subtask. That colour pair already existed.
- **Sizes snapped by ruling:**
  - 12–16 became `inline` (16).
  - 18–20 became `control` (20).
  - Strokes of 2, 2.25, 2.5, 3 and 1.8 all became 1.75.
  - Button and IconButton icons grew from 18 to 20.
  - UserAvatar's glyph (it was `size × 0.5`) is now `control` for avatars of 32 or more and `inline` below.
  - The Answered row's check in assistant questions lost its `style={{ marginTop: 2 }}`. It now sits in a `View pt-0.5` (2 px top padding, the same offset).
- **Ghost Button icons stay `label.primary`,** as before.
- **Line limits:** 13 sites moved to the kit Text with a policy:
  - `activity-usage` ×2
  - `client-card`
  - `phone-section` ×2
  - Day's activity label
  - `activity-task-field`
  - `project-sheet`
  - `choice-row`
  - `insights` ×2
  - More's owner name
  - `where-sat-line` (clamp, 1 or 2 lines)

  Where a file still uses React Native's `Text`, the kit one is imported as `KitText`.
- **10 line limits remain, counted.** They need something the kit Text does not take yet:
  - a link text with `accessibilityRole="link"` (Day's task line)
  - colours from look maps (time-bar tile, week block, preset preview, OS picker, task header)
  - the tab label
  - `ColorTag`
  - the task row title (2 lines plus a dynamic class)
  - `activity-task-field`'s selected state

### Minors
1. **Target:** the kit Pressable adds `min-h-hit min-w-hit` on native and `min-h-hit-web min-w-hit-web` on the web. That makes the sidebar rows and New task 44 px on the web. Today's callers are only the sidebar, the gallery and the Link. Tested on both platforms, red first.
2. **Disabled Link:** no `href` and no `hrefAttrs` while `disabled`. Tested (red first), and the press does not navigate.
3. **Text `full` prop:** carries the title for children that are not plain text. A cut text with neither `full` nor plain-string children stays unmarked on purpose, so the sweep still reports it. Tested red and green; the spec note says so.
4. **Real-router test in `link.test.tsx`:** it opens Week from Now, presses Week again on Week, goes back, and must land on Now with `canGoBack()` false. With `push` on the RouterLink the test goes red. The sidebar test was renamed so it no longer claims more than the fake router can show.
5. **Gallery:** the empty set asserts no project names, no capture and only the internal link. It also asserts that the empty fixture really is empty.
6. **Rule coverage:** `rawIcon` now covers `export {…} from`, `export * from`, deep paths (`lucide-react-native/…`) and dynamic `import()`. A package that merely starts with the same name is ignored. `rawLineLimit` now covers `import * as RN` and `import RN` with `<RN.Text numberOfLines>`; `RN.TextInput` is not flagged. Eight new rule cases.
7. **Comment** on the direct `./pressable.web.tsx` import in `link.web.tsx`.

### Ratchets
| Ratchet | Before | Now |
|---|---|---|
| `DESIGN_VALUE_WARNINGS` | 72 | 72 |
| `BARE_PRESSABLE_WARNINGS` | 33 | 33 |
| `KIT_PRIMITIVE_WARNINGS` | 71 | **10** (all `rawLineLimit`) |

The plan has the dated line.

### Tests
- **`bun lint`:** green, with the ratchets exact. The pre-commit hook ran it again on the docs commit, also green.
- **`bun test:app`:** green, 129 suites and 976 tests.
- **`bun test:unit`:** green. Scripts 165, core 877, client 515. A one-off timeout of a type-aware rule test under load passed alone.
- **e2e:** ports 8787 and 4173 were free. `ss` is not installed in the container, so I checked `/proc/net/tcp`, `lsof` and curl instead.
  - `e2e/link.e2e.ts` plus `e2e/worst-case.e2e.ts`: **6 passed**. This covers Ctrl/⌘-click opening a new tab, and the worst-case sets with the owner-name entry removed.
  - `e2e/route-sweep.e2e.ts` filtered to "every screen on …" (both accounts × phone/desktop × light/dark, `/dev/gallery` included, with axe): **8 passed**.
  - Not run: the rest of the e2e suite, and the route sweep's long "sends nothing twice" parts.

### Remaining concerns
- **Visual changes from the codemod have not been shot.** The icons grow from 18 to 20 in Button, IconButton, the bell, the time-bar tiles and the session rows. The checks at 12–14 grow to 16 inside the check circle, the subtask check and the scope list. A design-shots pass should look at the check circle in particular.
- **The 48 dp minimum on the native Pressable applies to every future caller.** A dense control that needs to be smaller would have to opt out; there is no opt-out prop yet.
- **The full e2e suite and the code review through `superpowers:requesting-code-review` of this round are still to do.**
