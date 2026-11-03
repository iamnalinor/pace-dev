# PR A — design pass on its new UI (review finding M8)

Date: 2026-11-03. Scope: the small UI that PR A (#53) added or changed since `98af07c`, plus the
A-era lines M8 names. Method: `docs/design.md` steps 4, 5 and 8 (tokens and kit only, pairs, the
matrix shot and reviewed). Lenses: impeccable critique/polish (hierarchy, consistency with the
app's own patterns, DESIGN.md direction A), apple-design (HIG: destructive styling, alert button
order, focus, targets), ux-copy (EN and RU: what happened, what to do). Screens PR B rebuilds were
not restyled beyond what these elements needed.

## How it was shot

- Worker: `wrangler dev --env dev --persist-to .cache/design-m8 --var ENVIRONMENT:test --var
  LLM_PROVIDER:fake` with the e2e id block, migrations applied first; web: `build:web` with
  `EXPO_PUBLIC_API_URL=http://localhost:8787 EXPO_PUBLIC_DEV_LOGIN=1`, `serve:web dist 4173`.
- Script: `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/m8/m8.spec.ts`
  (config `m8.config.ts` beside it). Each combo gets its own reset account, seeded with
  `seedLivedIn` and a `settings.updated` for its language; theme through `pace.theme`.
  Failures faked with `page.route` (usage 500, first pull 500 plus a closed socket, `/api/instance`
  naming another `apiOrigin`) and `context.setOffline` (offline pill; a task written offline for
  the Log out confirm).
- Matrix: 390×844 and 1440×900 × light and dark × EN and RU. Before:
  `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/m8/before/`
  (135 files); after:
  `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/m8/after/`
  (120 files). Names are `<state>--<phone|desktop>-<light|dark>-<en|ru>.png`, with `--el.png` for
  an element crop and `notes-*.json` for measured boxes and focus. States: `logout-before`,
  `logout-confirm`, `logout-confirm-tabfocus` (desktop), `screentime-failed`, `connect-sheet`,
  `pill-offline`, `pill-notloaded`, `preset-refusal`, `reading-issue` (before only, see L6).

## Findings

| # | Sev | Element | Finding | Status |
|---|---|---|---|---|
| F1 | medium | Log out confirm (R23-02) | At 1440 the confirm took `flex-1` beside Export data in Settings' wrapping row: the question at the row's start, Wait / Log out anyway at its far end, about 500 px apart, with nothing tying them together. Before: `logout-confirm--desktop-light-ru.png`. | fixed |
| F2 | medium | Offline and not-loaded pills (R23-09, QA21 L9) | In Russian at 390 both pills were three lines (72 px) beside the longer «Попробовать снова». The not-loaded line also said «Пробуем снова…» next to a «Попробовать снова» button: it claimed to retry by itself and offered the same thing as a button. Before: `pill-notloaded--phone-light-ru.png`, `notes-pill*--phone-*-ru.json`. | fixed |
| F3 | low+ | Day's screen-time failure (R23-08) | A full-width outlined secondary button was the loudest thing on Day, for a footer section. It was also a third look for "a read failed": Devices and the decision log use a quiet line with a text "Try again" flush under it. Before: `screentime-failed--phone-light-ru.png`. | fixed |
| F4 | low | Connect: "public address differs" line (A7, R23-11) | This instruction ("AI apps must use the address above…") was drawn in `label.tertiary`, the quietest tier, which is meant for hints. By its job it is a meta line (class 112). | fixed |
| L1 | low | Preset name refusal (A6) | The copy is right in both languages. But the sentence sits under a long form, a screen below the Name field, and the field is neither marked nor focused (R23-05). | left: owned by Task 4.8 + 3.8 (PR B rebuilds the form) |
| L2 | low | Refusal sentences in red (ReadingIssueLine, preset form, and about 12 older lines) | These are `status.danger` text at regular weight. `pairs.ts` keeps danger text at the `textSmall` tier only because it is always weight 600 (dark `#FF8274`, Lc 50–57). Spec 5.0.5's InlineError is a danger icon plus a label-coloured sentence. WCAG 4.5:1 is met; the APCA tier is not. | left: app-wide pattern, the kit's InlineError / FieldMessage in PR B (spec 4.1.4, 5.0.5) |
| L3 | low | "Try again" text buttons (Devices, decision log, now Day) | The `ghost` variant draws its label in label colour, with nothing that says it can be pressed. Spec 4.2.3's `plain` variant uses `accent.text`. | left: Button rewrite (spec 4.2.3) in PR B; all three take it at once |
| L4 | low | Pill placement | At the end of Settings the pill floats over the Log out card (1440) and over Wipe data (390). At 1440 it straddles the column (R23-13a, review #6). | left: Task 3.7 (pill restyle, content inset) |
| L5 | low | Log out confirm count | The count is a snapshot. If the outbox drains while the confirm is open (the network comes back), it still says "1 change has not synced yet". Both buttons stay safe. Collapsing the confirm under the finger would put Wipe data where Log out anyway was at 390, so the fix needs a "synced" state with its own copy. | left: proposed for Task 4.11 (Log out's server-session half): the question follows the live count and, at 0, says everything has synced, with Log out in place of "Log out anyway" |
| L6 | — | ReadingIssueLine with its ActionChip | Not reached in the browser: under a faked `unavailable/limited` answer the client's local rules always proposed an action (`???` became an activity), so the line never shows. Judged from code and its jest tests: an ActionChip from the kit, a 48 px target, copy reviewed in R23-13c. | not shot; see L2 for its colour |
| C1 | cosmetic | Key hint | Reads "Escape" where "Esc" is the platform's short form. | left: kit KeyHint (spec 4.2.3) |

### What passed

- **Confirm keyboard** (desktop, every combo, `notes-logout--desktop-*.json`):
  - Enter on Log out opens the confirm with focus on Wait, and the question is announced (the group's `aria-label` and `moveFocus` say it).
  - Tab goes to Log out anyway.
  - Escape closes the confirm and gives focus back to Log out.
  - Enter on the focused Wait is the safe default.
- **Hierarchy and HIG**: the safe action comes first and is focused. The destructive one wears the danger outline and red label; neither is a filled primary, which is right for a destructive alert. On a phone they are equal halves (spec 4.1.5); on a computer they are content-width and trailing.
- **Targets**: Wait and Log out anyway are 48 px high on both widths. The pill's Try again stays a 44 px box (`offline-pill.e2e.ts`).
- **Contrast**: no new colour pair. The roles in play are:
  - `label.primary` on `bg.app` / `bg.cell`;
  - `status.danger` on `bg.cell` (`textSmall`);
  - `label.secondary` on `bg.elevated` (`meta`);
  - `label.secondary` on `bg.app` (Day line);
  - the separator border, which is decorative.

  All of them are in `USED_PAIRS`.
- **RU at 390**:
  - The confirm's «Всё равно выйти» stays on one line with no card around it (a card's padding wrapped it, which is why the card is desktop-only).
  - The pills are two lines (54 px).
  - The Connect line is two lines.
- **Copy**: the confirm says what will happen and what to choose ("1 change has not synced yet: logging out now loses it." / «1 изменение ещё не синхронизировано: если выйти сейчас, оно пропадёт.»), with plural forms correct for one/few/many. The screen-time line ("Couldn't load screen time." + "Try again") and the preset refusal ("A preset with this name already exists. Choose another name.") both say what happened and what to do.

## What was fixed

The fixes landed in the controller's checkpoint `90eaa1a` (it was cut while this pass was in
progress, so they are not in commits of their own). The browser guard for the confirm and the
bug-lessons rows are in `7ae4d49`.

- **F1** (`apps/app/src/shared/logout-button.tsx`): on a computer the confirm is a card on a line of its own, under Export. This is the same shape as the app's other block confirms (Delete preset, Wipe data). On a phone it stays bare, since the row is already a column and a card would wrap the Russian button label.
  - Guard: `e2e/sync-state.e2e.ts` "offline, Log out asks first in a block of its own…" at 390 and 1440. It checks that the block starts under Export at its left edge, that each button is 44–55 px high, that Wait is focused, and that Escape gives focus back. It was red at 1440 against the old layout (block y 641 < 689).
- **F2** (`packages/core/src/i18n/{en,ru}/shell.ts`): the pills now use spec 5.0.5's line, "Offline · changes will sync later" / «Нет сети · изменения отправятся позже». The not-loaded line is "Your data has not loaded yet." / «Данные ещё не загрузились.», which drops the self-retry claim beside the button. The e2e filters were updated.
  - Guard: `e2e/offline-pill.e2e.ts` "in Russian at 390…", both pills ≤ 56 px. It was red at 72 px before the copy change.
- **F3** (`apps/app/src/shared/activity-usage.tsx`): the failed read is now the line plus a text "Try again" flush under it, as Devices and the decision log show it.
- **F4** (`apps/app/src/features/sessions/connect-ai-sheet.tsx`): the line moves to `label.secondary`.
- **Bug-lessons**: two rows (class 5 for F1, class 109 for F2), each with its sweep and guard.

## Verification

- `bun lint`: green. The design-value ratchet stays at 74 warnings exactly; tsc, knip, jscpd, depcruise and the migrations check pass.
- `bun test:app` on settings, day, sessions, `sync-frame.test.tsx` and `phone-controls.test.tsx`: 9 suites, 176 tests pass.
- `vitest` in core for `src/i18n` (48 tests) and `src/design` (39 tests, the pairs): pass.
- e2e with the config's own servers (my servers stopped first): `offline-pill`, `sync-state`, `login`, `sessions` and `live` give 67 passed.
- All servers were stopped at the end; :8787 and :4173 are free.
