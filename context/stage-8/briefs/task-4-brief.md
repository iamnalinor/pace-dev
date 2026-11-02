# Task 4 — Part B: Tooltip, a simpler composer, the form in the right pane on a computer, "Subtasks"

Owner's words:
- On the composer (screenshot: «bb» typed, a ⌄ chevron, the hint «Enter: the assistant fills in a form to check.
  Shift+Enter: a new line.», «Parse ↵», «To Inbox ⌥↵»): «Громоздкое, мб попроще? Стрелочка тоже какая-то странная.
  При анимке раскрытия артефакт…» (the clipping is fixed in Task 1).
- On the expanded form («Check before adding», «Create ↵», ⌃, fields…): «Чет тоже громоздкое. Смотри, у нас энивей
  поле свободное справа есть, го туда перенесем (и соответственно иконки поправим). Check before adding ну звучит
  странно. Если мы добавляем сами, то мы добавляем сами. Если нам агент предложил что-то добавить/изменить/удалить,
  мы так и говорим.»
- «Термина Problem не должно существовать, это Subtasks. И форма тоже какая-то странная» (a dashed pill «Add a problem»).
- On the Calendar button's explanation (a toast far from the button, appearing late): «Сообщение вылезает хуй пойми где
  и с задержкой. Я хочу сразу при наведении ну или на телефоне моментально после клика. И описание слишком подробное,
  можно просто про то что в календаре нет событий рядом».

## 1. Tooltip primitive (apps/app/src/ui/tooltip.tsx + tooltip.web.tsx)
`<Tooltip label="…">{trigger}</Tooltip>` anchored to its trigger (above it by default, flipping below when
there is no room, kept inside the viewport). Web with a fine pointer: shows instantly on hover and on keyboard
focus, hides on leave/blur/Escape; uses `role="tooltip"` + `aria-describedby`. Touch (phone and touch web):
shows instantly on tap of the trigger (the trigger's own onPress still runs) and hides after ~2.5 s or on the
next tap anywhere. Styling: small dark/inverse bubble (bg-inverse text-inverseFg, 13px, rounded-md, px-2 py-1,
max-width ~260px). App tests: hover shows it with no delay (fake timers: visible at 0 ms), tap shows it on
touch, Escape hides it.
Use it for: (a) the time bar's Calendar button when unavailable — replace the toast in
apps/app/src/shared/tracking/use-calendar-button.ts / time-bar.tsx with the tooltip, text shortened to EN
"No calendar events around now" / RU "В календаре рядом нет событий" (keep the noAccess variant short too:
"No access to the calendar" + keep its Permissions action path reachable: on phone, tapping the unavailable
button when the reason is noAccess may still open the permissions screen — say what you did); keep the text as
the button's accessibilityHint. (b) the composer's icon buttons (below) for their names + hotkeys.

## 2. The composer, simpler (apps/app/src/features/now/composer/*)
- One line: the input, with two icon buttons inside its right edge: Inbox (lucide Inbox/tray icon; ⌥↵ / Alt+Enter
  — hotkey label per OS from ui/hotkeys.ts) and Send (an arrow-up/CornerDownLeft icon; ↵). Their names and hotkeys
  show in the Tooltip on hover. The Send button is lime (accent) when there is text, faint when empty.
- No hint line, no chevron. The empty form opens with New task (sidebar button, N) or a small "+" icon button at
  the left/right of the line (pick one place; tooltip "New task · N"). Keep the paste-reads-at-once and
  Alt+Enter-to-Inbox behaviours; Enter still asks the assistant and opens the form with what it read.
- Remove keys that become unused (composer.quickHint, the chevron's label…), EN and RU.

## 3. The form
- Header: no «Check before adding». When the form was opened by hand: title "New task". When it holds what the
  assistant read: "Suggested by the assistant" (the next task turns this into create/change/delete wording — keep
  the header text coming from one place, e.g. a `formTitle(model)` helper). Create button stays (lime, ↵ hint);
  the fold control becomes a cross "×" with tooltip "Close · Esc" on the right pane / a chevron-up on the phone —
  your call, consistent with sheets (desktop dialogs use a cross).
- On a wide window (≥1024, `useIsWide`) the form opens in Now's right pane (apps/app/src/screens/now-screen.tsx
  `NowSplit`, which today shows the picked task's `TaskScreen`), instead of unfolding inside the list column. The
  line stays in the list column; while the form is open in the pane the pane shows the form (replacing the task
  details); closing the form or adding the task returns the pane to the previously picked task (or its empty
  state). Keep one composer state (the hook `useComposerFlow`) shared by the line and the pane — lift it into a
  small context provider in features/now if needed. On a phone the form unfolds in place as today.
- Keyboard: Enter in Title adds, ⌘↵/Ctrl+Enter adds from anywhere in the form, Esc closes — as today.

## 4. Problems → Subtasks
Grep "problem" (case-insensitive) in packages/core/src/i18n, apps/app/src, packages/client/src: every
user-facing "problem" becomes "subtask" (EN: Subtasks / Add a subtask; RU: Подзадачи / Добавить подзадачу);
identifiers named after problems get renamed too (breaking changes are fine), but do NOT rename event types or
payload fields in core events unless they say "problem" (check; if `subtasks` is already the payload name,
leave events alone). The subtask editor (apps/app/src/shared/task-fields/subtask-list.tsx): a plain list — each
subtask a row with a small circle/checkbox-like bullet, its text, and a remove "×" on hover/focus (always visible
on touch); the last row is a "+ Add subtask" text button that turns into an inline input on press (Enter adds and
keeps the input open for the next one, Escape/blur with empty text closes it). No dashed pill.

## Tests and checks
TDD: app tests for the tooltip, the composer line (Inbox button sends to Inbox; Send asks the assistant; "+"
opens an empty form titled "New task"), the pane form on a wide window (mock useIsWide), the subtask editor.
Update existing composer tests and e2e/composer.e2e.ts for the new controls (the e2e from Task 1 — N, title,
Enter — must still pass). Screenshots (Playwright; desktop 1280 light+dark, phone 390 light) of: Now with the
line, the form in the right pane, the form on a phone, the subtask editor, the Calendar button tooltip — save
under /tmp/claude-0/-home-user-pace-dev/cb223545-7465-5720-b7e6-b3fd375d3413/scratchpad/task4/ and look at them
yourself; fix what looks off. `bun lint`, `bun test:unit`, `bun test:app` green; touched e2e specs pass.
