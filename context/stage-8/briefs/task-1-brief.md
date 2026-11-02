# Task 1 — Part A: bugs (TDD; root cause first for each)

Each fix: a failing test first at the right level (docs/testing.md), then the fix. Commit per bug.

## 1. The composer form refuses a hand-typed task ("Type something first.")
Repro: on Now open the empty form (New task button / N, or the chevron) with an EMPTY line, type a
title in the form's Title field, press Create or Enter → toast "Type something first." and nothing is added.
Root cause: the Create button is enabled from `model.title.trim() !== "" || isInstance`
(apps/app/src/features/now/composer/composer-form.tsx ~L230) while `createFromComposer`
(packages/client/src/actions/composer-actions.ts ~L119) refuses on `model.isEmpty`, which
`composerModel` (packages/client/src/view-models/composer.ts ~L241) computes from the LINE text only.
Fix: ONE predicate `canAdd` on `ComposerModel` (true when the effective title is non-blank, or the
target is an existing instance), computed in the view-model; the button and the action both read it;
remove `isEmpty` if nothing else needs it. The refusal code for a model that cannot be added stays
`action/empty-text`.
Tests: client unit test(s) — for any model where `canAdd` is true, `createFromComposer` does not
return `action/empty-text` (cover: empty line + edited title; line text only; instance target);
an app test (jest-expo, apps/app/src/features/now/composer/composer.test.tsx) opening the form with an
empty line, typing a title and pressing Create adds the task; and an e2e test in e2e/composer.e2e.ts:
press N, type a title in the form, press Enter → the task appears in the list.

## 2. A dissolved (checked) task flashes back before it disappears
apps/app/src/shared/task-list.tsx `TaskRows` (`dissolving`, `dissolved`, `settle`) +
apps/app/src/ui/dissolve.tsx. Root cause: `settle` removes the id from `dissolving` right after
calling the async close, before the store drops the row; `Dissolve` then resets progress to 0 and
the row is visible again for some frames (and the check circle unchecks).
Fix: keep the id in `dissolving` (or a "settled" set) until the row is gone from `rows`; if the close
is refused, the row comes back (that path must keep working — it is intended). Also shorten the wait
before the rows below slide up: the reflow must start as the dust ends (when the row is removed from
rendering at DISSOLVE_MS), not after the close has been persisted. Look at apps/app/src/ui/motion.ts
(ROW_LAYOUT 200 ms) — keep the layout animation but do not add extra delay; if a delay exists, cut it.
Test: an app test that checks a row, advances timers past DISSOLVE_MS while the close action is still
pending (a deferred promise), and asserts the row stays hidden (not rendered / opacity 0) and the
check stays checked; plus refused close brings it back.

## 3. Projects list shows a bare "0"
apps/app/src/screens/projects-screen.tsx ~L65 reads `hooks.useNow().projects` (Now's filter chips,
which drop projects / return [] in common cases), so every row shows 0.
Fix: a pure view-model function in packages/client/src/view-models (e.g. in a projects view-model
file, or next to the existing project view-model) giving the open-task count per project from state
(open = what Now counts as open; reuse core's classify helpers such as isOpen / isNowTask — read
packages/core/src/queries/classify.ts). Show it as "3 tasks" / "1 task" / "No open tasks" with
plural i18n keys in EN and RU (look how other plural strings are done in packages/core/src/i18n,
e.g. search for "one:"/"few:"/"many:" or a plural helper; follow the existing mechanism).
Tests: client unit test for the counts; app test for the label.

## 4. The composer's expand animation clips its top
When the line unfolds into the form (Enter after typing, or the chevron), the top text and the top
half of the Create button slide out of the card and come back. Cause (to confirm): the form's Title
has autoFocus and mounts inside apps/app/src/ui/animated-height.tsx's `overflow:hidden` box while the
box is still at the old height; the browser scrolls the overflow-hidden ancestor to reveal the focused
input, so the header moves up until the height catches up.
Fix: focus without scrolling ancestors on the web (`focus({ preventScroll: true })` — find how the
title input is focused; RN-web TextInput autoFocus calls focus() — you may need to focus manually in
an effect with preventScroll via a .web.tsx helper), and/or reset scrollTop of the animated box to 0
on web. Verify in a real browser with Playwright (start the stack the way playwright.config.ts does,
or reuse an e2e spec) by sampling the card header's bounding box during the animation: its top must
not move above the card's top. Add that check as an e2e assertion in e2e/composer.e2e.ts if it can be
made deterministic; otherwise describe the manual verification in the report.

## 6. Toasts land over controls
apps/app/src/ui/toast.tsx is fixed at `bottom-24`; on Now it covers the time bar's buttons (and its
"⋯"). Fix: a screen with a footer (the `footer` prop of ui/screen.tsx — check how Screen renders it)
must lift the toast above that footer: e.g. a small context the Screen provides with its footer
height (measured with onLayout) that the toast host reads; the toast sits `footerHeight + 12px`
above the bottom (and above the phone tab bar as now). Test: app test that a toast shown on a screen
with a footer is positioned above the footer height.

(Bug 5, "Add a computer does nothing on phones", is out of scope here — a later task replaces that flow.)

Finish with `bun lint`, `bun test:unit`, `bun test:app` green, and the e2e specs you touched passing
(`bunx playwright test e2e/composer.e2e.ts`).
