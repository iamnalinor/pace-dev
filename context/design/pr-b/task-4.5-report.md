# Task 4.5 report: Task detail

## Shipped
- `submitLabel(view, language)` in `@pace/client`: up to three short names, otherwise the count («Сдать 37»); the
  footer says it on one line, the hint carries the full list, the close sheet keeps its full title.
- Header: «Изменить» text button + ⋯ menu (popover on a computer, sheet on a phone) with «Close as…» and
  «Delete the task», which turns into «Delete the task?» with Cancel (focus) and Delete; Escape cancels the
  question before the menu. No Pause. The project is a one-line control with a chevron, truncating before the
  actions.
- Body on the kit: title1, one meta line (category dot, status `Tag` in violet, importance word when not Normal,
  per-subtask mode), middle-cut link as a real anchor, stats `Group`, description (6 lines + «Show all», tap to
  edit), progress as a `Group` row with live «40 %» and `aria-valuetext`, subtasks as `SectionHeader` + `Group`
  rows (48 check, wrapping top-aligned), «Original message» as `Disclosure`.
- Footer: Focus (filled stop while focusing) | Done equal halves, the third control beside them as before.
- Close sheet: one word per outcome in the preview («Will be recorded as», «Submitted · …»), preview on
  `bg.inset` without the rule; the ⋯ twin of Done's long press is the only way in besides «Other time…».
- Estimate and subtask-draft inputs moved onto the kit `TextField`. Ratchets lowered to 35 / 12 / 3.
- Bug-lessons 128 (text from data in chrome) and 129 (a control replaced by its confirm).

## Tests
`task.test.ts` (submitLabel worst cases), `task-screen.test.tsx` (menu, delete Cancel / Escape / Undo, `40 %`
aria-valuetext, no Pause), close-sheet copy. e2e selectors updated (Edit, More actions, Close as…, `task-menu` sheet
opener); not run locally.

## Deferred
See the plan's Task 4.5 "Deferred" note.

## Verify on hardware
Android: the ⋯ sheet and its Delete confirm with TalkBack; the footer at 320 dp with three controls.
Web: the popover anchored under ⋯, focus on Cancel after «Delete the task?», the footer at 320 with a keyboard.
