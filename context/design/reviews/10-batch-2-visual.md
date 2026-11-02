# Batch 1+2 visual review (tokens v2, direction A · Тетрадь)

Reviewer: visual regression pass, read-only. Lens: apple-design (accessibility, colour roles, craft), applied to regressions only.

- BEFORE (Phase C re-baseline, v1): `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/rebaseline/<group>/<name>--<combo>.png`
- AFTER (batch 2): `/home/user/pace-dev/.cache/shots/batch-2/<group>/<name>--<combo>.png`
- Coverage: routes group, all 27 routes x 8 combos (phone and desktop, light and dark, en and ru). States group: all pairs in phone-light-ru and phone-dark-ru, desktop-light-ru and desktop-dark-en, with extra checks in the other combos. Focus group: `now` (light and dark, en). Signed-out: login, auth, app-login, not-found, app-auth. Zoomed 1:1 crops and pixel sampling for the findings below. Contrast figures are computed from sampled pixels.
- Not findings: v2 colours replacing v1, 4-pt row looseness, old component shapes. Before and after were captured at different clock times and scroll offsets (Week opens at 06:00 after, 00:00 before), so times and some copy differ. That is data drift, not regression.

## Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 2 |
| medium | 4 |
| low | 8 |

No clipping or overlap breakage and no lost targets. The migration is clean overall. Two token-application slips matter: the switch thumb in dark, and the weakened selected state of chips. Both are kit-level (Batch 3). Week blocks read well.

---

## High

### V2-01 · High · Switch thumb takes `accent.on` (near-black) in dark; ON and OFF thumbs vanish into the page
- Screens: Settings (notifications matrix, "Show night hours"), Presets "Show deleted", Preset page override toggles, calendar sheet "Parallel with current", time pickers. Combos: all dark (phone and desktop, en and ru).
- Before: `.../routes/settings--desktop-dark-en.png`, `.../states/now-calendar-tooltip--phone-dark-ru.png`. After: same names under batch-2. Zoom: crop x1000-1260, y420-580 of `settings--desktop-dark-en.png`.
- What is wrong: before, the thumb was white in both states. After, the thumb is #0B0D14 (`accent.on`) on dark. ON: a pale-periwinkle track with a near-black thumb at the right. The thumb merges with the #0D0F15 page, so the track reads as a crescent or a clipped pill. OFF: a dark thumb on a grey track, with the thumb edge barely visible. The on/off cue now relies on track colour alone. Light theme is fine (white thumb with shadow).
- Likely cause: the thumb class was `bg-accentFg`/`onColor` and was mapped mechanically to `accent.on`. In dark that token is the dark ink for text on the light accent. The thumb is not "text on accent". It needs a constant (white, or `label.primary` inverse) thumb token.
- Owner: Batch 3 kit (Switch). Add a dark-theme screenshot test for the switch.

### V2-02 · High · Selected state of chips is a faint tint with the same ring as unselected
- Screens: Add/composer form (Category, Importance, Project), task edit sheet, Preset "Extends", time pickers, date picker (selected day). Combos: all. Worst in phone-light.
- Before: `.../routes/add--phone-light-ru.png` (solid orange "Личное", solid green "Обычная", solid pink project in `states/task-edit-sheet`). After: same names.
- What is wrong: before, the selected chip was a solid hue fill with a ring. After, every chip carries a hue ring and the selected one only gets a ~12% tint (about 1.1:1 against white). In the Category and Importance rows, with six differently coloured rings side by side, it is hard to tell which one is selected. In dark, "Матанализ" (olive tint vs olive ring) is almost indistinguishable. The date-picker selected day is a pale-blue disc in light and `fill.3` on `bg.elevated` in dark, a weak step. The selection indicator is below 3:1 against its neighbours. It is also a regression of the "unclear which is chosen" kind.
- Likely cause: `bg-project-x` (selected solid) was migrated to `hue.<name>.tint` per the §9.2 row `bg-project-*/22 → tint`. That is right for tags, but selected chips need a stronger step (the 18% tint, a 2 px ring, or a solid stroke) plus a non-colour cue (check, bold weight), while unselected chips go to neutral outline.
- Owner: Batch 3 kit (Chip), then Batch 4 (Add, Preset).

---

## Medium

### V2-03 · Medium · Inbox count badge turned into a pale, nearly invisible disc; on the phone tab bar the digit sits outside it
- Screens: tab bar (all phone routes with a non-zero inbox) and the desktop sidebar "Inbox 1". Combos: all.
- Before/after: `.../states/now-check-toast--phone-light-ru.png`, `.../states/toast-to-inbox--phone-dark-ru.png`. Zoom crop (190,770)-(350,830).
- What is wrong: before, a solid blue disc with a white "1". After, accent text on `accent.quiet`: about 1.3:1 against the bar in light, a grey-blue disc in dark. On the phone the disc shrank and shifted up-right, and the "1" straddles its edge and overlaps the icon corner. It is an actionable count (things to sort) and has lost its signal. The spec's `count-badge-danger` is a solid `status.danger` with white text. Danger is correct for overdue and Urgent counts, but arguably not for an inbox count, so a solid `accent` badge is the better fix. Pick one deliberately.
- Cause: `bg-accent text-onColor` badge mapped to the quiet pair, or the removed `accentQuiet` class family mapped to `accent.quiet`.
- Owner: Batch 3 kit (CountBadge, TabBar).

### V2-04 · Medium · Insights "No project" bar uses `label.quaternary` and reads as disabled
- Screens: Insights "Time by project". Combos: all.
- Before: `.../routes/insights--phone-light-en.png`, after: same name under batch-2. Zoom: crop (0,110)-(390,340).
- What is wrong: the bar is #B4B8C7 on white (about 1.9:1) in light and #4A4F63 on #161922 (about 2.0:1) in dark. The data bar fails the 3:1 for graphical objects. Before, it was a mid-grey that read as data. It is also lighter than the "Other" slate bar next to it, though both are "uncategorised".
- Cause: `faint` mapped to `label.quaternary` in non-text use. The §9.2 map says "non-text" is allowed, but a data mark needs ≥ 3:1. Use `hue.slate.stroke` (#717B89 / #94A0AE) or `outline`.
- Owner: Batch 4 (Insights).

### V2-05 · Medium · Week blocks (hue tint + ink): reads well in dark, edge too weak in light; narrow overlaps still truncate
- Screens: Week (phone and desktop), Day gap states. Combos: all light and dark.
- Before: `.../routes/week--desktop-light-en.png`. After: same name. Zoom: `scratchpad/cmp/weekzoom.png` (crop x230-530, y70-300).
- Verdict: yes, it reads better than the solid fills with white text (calmer, and the now-line in `status.danger` stands out). Ink on tint is legible: cyan ink on cyan tint, slate on slate. Titles stay readable at "Собираюсь". Problems: (a) in light the tint is about 1.1-1.2:1 against `bg.app`, with no stroke or border, so a block's extent is carried by text only; the spec's "1 px line in its stroke" is not applied; (b) overlapped blocks keep truncating to "Пош…", "Муз…" (unchanged from before); (c) in dark the cyan tint is the most saturated, and grey/slate blocks are close to the grid. The selected block gets a clear accent ring (good).
- Owner: Batch 4 (Week). Add the stroke edge there.

### V2-06 · Medium · RU phone running card wraps ("из ~20 мин" drops to its own line)
- Screens: Now (and everything with the running bar: add, sheets). Combos: phone-*-ru.
- Before: `.../routes/now--phone-light-ru.png` (a single row "Пошёл в ЦСС 2 ч из ~20 м"). After: same name (row 1 "2 ч", row 2 "из ~20 мин", then "Всё ещё этим занимаетесь?"). The card grew by about 20 px and the row looks unbalanced against the buttons "Да, ещё / Стоп".
- Likely cause: the copy changed from "м" to "мин" (units now spelled out) plus the larger body size and 16 px gutters in the narrow phone width. The old structure has no `numberOfLines`/shrink handling.
- Owner: Batch 3 kit (RunningCard). Fix with a column layout for ru or tabular compact units.

---

## Low

### V2-07 · Low · `bg.sidebar` is not applied: sidebar equals `bg.app` on desktop in both themes
- Measured: sidebar, list pane and detail pane all have #F4F5F9 (light) and #0D0F15 (dark). `now--desktop-dark-en.png` after; before was one flat #0B0B0C. The spec has #ECEEF4 and #0A0C11.
- Dark elevation steps: `bg.app` to `bg.cell` (#0D0F15 to #161922) reads clearly; `bg.elevated` (#1F2333) reads on sheets and toasts. Only the sidebar step is missing (only a hairline divides it). The old structure did not use the token, so this is expected until the shell is rebuilt.
- Owner: Batch 3 (Sidebar shell).

### V2-08 · Low · Focus ring is still label-primary ink (black in light, white in dark), not `focus` (accent)
- Screens: focus group, e.g. `focus/now-tab1--desktop-light-en.png`. The ring is clearly visible on both themes (good, at least 3:1), 2 px with offset. The spec says `focus` = #2E4AD6 / #ACBAFF. Unchanged from before. Sidebar ring on "Now" is tight and clips on the chip radius.
- Owner: Batch 3 (focus ring token).

### V2-09 · Low · Disabled primary buttons look washed out
- Composer "Create": white on #95A3EA = 2.4:1 in light; dark #10121A on #576191 = 3.1:1 (`add--phone-light-ru.png` / `phone-dark-ru.png`). Disabled is exempt from WCAG, but it now reads as a half-pressed button rather than disabled. The spec's disabled is `fill.1` with `label.quaternary`. This is probably still `accent` at reduced opacity.
- Owner: Batch 3 (Button).

### V2-10 · Low · Light toast and tooltip separate from content only by shadow
- `bg.cell` and `bg.elevated` are both #FFF in light. A toast over a white list card ("Добавлено во входящие", `states/toast-to-inbox--phone-light-ru.png`) is white on white with a hairline. The tooltip "Во входящие" changed from an inverse chip to an elevated one and is low-key in light. Dark is fine.
- Owner: Batch 3 (Toast, Tooltip): add a border or `separator` to elevated overlays in light.

### V2-11 · Low · Looser rows wrap the calendar chip alone (ru, phone)
- `states/task-close-as--phone-light-ru.png`: the calendar icon chip drops to a second row (it fit before). Not broken, just loose. Related: Settings notifications matrix header "Telegram / Телефон / Веб" is tighter than before.
- Owner: Batch 3 (Chip row).

### V2-12 · Low · Insights stat tiles in ru
- "Блоки фокуса короче 15 мин" is now 4 lines and "Переключени/ий в день" breaks mid-word (the mid-word break existed before, slightly worse now). `routes/insights--phone-*-ru.png`.
- Owner: Batch 4 (Insights).

### V2-13 · Low · "Normal" importance shown as a green hue tag on every task (role question)
- Everywhere (Now, Day, History, task detail). Per Q3 (Normal shows nothing; Urgent a red word, Priority bold, Low in `label.secondary`) this is a stand-in. Unchanged from before, but it makes every row carry two tags. The green is also close to the `hue.green` project family. No danger misuse found anywhere: red is limited to now-line, overdue, destructive and invalid-link states.
- Owner: Batch 4 (Task row).

### V2-14 · Low (pre-existing) · Login "Bot domain invalid" renders as an unstyled white box with a serif font in dark
- `signed-out/login--phone-dark-en.png`: the Telegram widget fallback. The same before and after, not a regression, but it is the one place the dark theme shows a hard white block. Owner: Batch 4 (Login).

### Capture notes (not UI findings)
- `states/now-assistant-question--phone-dark-ru.png` (after): the capture shows the confirmed task page instead of the question card; the state drifted. Re-shoot.
- `states/day-block-edit` and `day-gap-log` exist only in after, so no baseline.

---

## What improved
- Hierarchy is cleaner: the label.primary/secondary/tertiary split now reads as three clear steps in both themes (title, meta, tertiary captions); the old muted/faint blur is gone.
- Ink-blue accent: primary buttons, selected tab, links and focus have one role. White-on-accent is 6.9:1; dark periwinkle with dark ink reads well.
- The red margin is disciplined: now-line, overdue timers, destructive sheet and the invalid link only.
- Dark theme is more legible: `bg.cell` steps off `bg.app` (#0D0F15 / #161922) and sheets on `bg.elevated` are distinct; borders from `outline` make inputs and secondary buttons visible.
- Project and category tags (hue tint + per-theme ink) look consistent and are legible in both themes. Sheets in dark now read as raised surfaces.
- Toast in the sidebar (desktop) no longer clips its text; it now wraps to three lines.
- Week: calmer tint blocks and a clear now-line; the selected block gets an accent ring.
- Light theme backgrounds are cleaner (cool paper #F4F5F9 plus white cells) than the grey v1 canvas.

---

## Fix round (2026-11-02)

After shots: `.cache/shots/batch-2-v/` (same names as batch-2; routes, focus, and the states task-edit-sheet, toast-to-inbox, now-check-toast, task-close-as, day-pick-date, now-calendar-tooltip, time-chores-picker). Details per finding: `.superpowers/sdd/redesign-plan/visual-fix-report.md`. Bug-lessons class 112.

| Finding | Status |
|---|---|
| V2-01 switch knob | Fixed: the kit draws the switch (knob inside the track; on `accent.on` on `accent`, off `label.tertiary` on `fill.2` inside an `outline` ring). The spec's `outline` knob measures 2.7-2.9:1 on `fill.2` in light, so `label.tertiary` replaces it. |
| V2-02 selected chip | Fixed: selected = solid `accent` fill and edge with `accent.on` label; the calendar's picked day likewise. |
| V2-03 inbox badge | Fixed: `CountBadge` tone `danger` (solid `status.danger`, `bg.cell` digits, spec §4.2.8) for the Inbox, `neutral` for the bell; the tab-bar badge grows away from the icon (`left-5`). Danger, not accent, as the spec says (§3.1 "badges → status.danger"). |
| V2-04 No project bar | Fixed: `hue.slate.stroke`. |
| V2-06 RU running card | Fixed: Yes/Stop buttons `px-2`, Stop's icon gap `gap-1` (the caption and tag type roles are wider than the old px sizes). |
| V2-07 sidebar ground | Fixed: `bg-sidebar`. |
| V2-08 focus ring | Fixed: one `:focus-visible` rule in `global.css` in the `focus` role. |
| V2-05 Week, V2-09..V2-14 | Deferred to Batch 4 (Week, Insights tiles, Task row, Login) and Batch 3 (Button disabled, Toast and Tooltip borders, chip-row wrap). |
