# Task 2 — Part B: two accents, the logo back to lime, a compact update card

Owner's words: «Мы в одном из обновлений поменяли цвет с акцентного зеленого на голубой. Для лого это не оч,
там зеленый круче смотрелся. На кнопках зеленый/салатовый тоже норм смотрелся, но не везде. Давай смотреть
в зависимости от места: где нужен акцент (какое-то важное действие) – вернем старый цвет, где что-то не очень
активное – оставим текущий. На лого старый цвет лучше смотрелся». And about the update card: «Later не нужен,
выделенная подпись тоже не нужна. Кнопку можно оставить refresh page. И сузить бы его, чтоб был прямоугольник».

## Tokens (packages/core/src/design/tokens.json + tokens.ts types)
- `accent` = the old lime for important actions. Dark: accent `#d4ff3a`, accentFg `#0b0b0c`, accentText `#d4ff3a`.
  Light: pick a lime fill that keeps dark text readable (e.g. `#c5f23a` or similar) with accentFg `#0b0b0c`,
  and accentText a dark olive like `#4d6b00` (readable on the light bg). History: commit 946a3b5 replaced the
  lime (`git show 946a3b5 -- packages/core/src/design/tokens.json` shows the old values — reuse them where they pass).
- New `accentQuiet` = the current indigo for quiet states: dark `#4263eb`, light `#3b5bdb`; `accentQuietFg`
  `#ffffff`; `accentQuietText` dark `#91a7ff`, light `#3b5bdb`.
- Wire the new tokens through apps/app/tailwind.config.js and apps/app/src/platform/theme.ts like the others.
- packages/core/src/design/contrast.test.ts: replace the "indigo, not lime" assertion with the new rule:
  accentFg on accent ≥ 4.5:1 and accentText on bg ≥ 4.5:1 in both themes; accentQuietFg on accentQuiet ≥ 4.5:1;
  accentQuietText on bg ≥ 4.5:1 (or 3:1 if it is only used for large/ui text — keep it 4.5).

## Who uses which (apps/app/src)
Lime `accent` (important actions): the primary `Button` variant (ui/button.tsx), the sidebar «New task»
(ui/sidebar.tsx), the time bar's ▶ start button (shared/tracking/time-bar.tsx), the update card's Refresh,
the toast action text if it is a call to action (ui/toast.tsx — use accentText), the logo mark.
Indigo `accentQuiet` (quiet states): active phone tab (ui/tab-bar.tsx), the composer's focus ring
(features/now/composer/composer.tsx `border-accent` → quiet), switches (ui/switch-row.tsx), the progress
bar (ui/progress-bar.tsx), date selection in ui/calendar.tsx, features/oauth/scope-list.tsx, the running
row duration on Day (features/day/day-screen.tsx `text-accentText` → quiet text), the running time-bar
button's fill (a running state is a state, not an action → quiet), selected chips if they use accent.
grep for `accent` across apps/app/src and decide each by this rule; list every decision in the report.

## Logo and icons
scripts/generate-icons.ts hard-codes colours (DARK.accent, LIGHT.accent, INDIGO; faviconSvg is an indigo
tile with white chevrons). Make the logo lime again: the lead chevron lime (`#d4ff3a` on dark, the light
accentText olive on light where it is drawn on a light ground), the favicon/app icon a lime tile with dark
chevrons (as before 946a3b5 — check `git show 946a3b5 -- scripts/generate-icons.ts`). Update
scripts/generate-icons.test.ts accordingly (it currently asserts no `#d4ff3a` remains — invert to the new
expectation). Run the generator (`bun scripts/generate-icons.ts` or how its header says) and commit the
regenerated assets. apps/app/src/ui/logo.tsx `PaceMark` uses palette.accentText for the lead chevron — keep
that (it becomes lime/olive automatically). apps/app/app.config.ts:123 notification colour → `#d4ff3a`? No:
Android tints the small icon with it on a light shade; use the lime for brand consistency.

## Update card (apps/app/src/platform/update-banner.web.tsx)
A compact horizontal rectangle: one row, the text «A new version of Pace» (new short key, or reuse
`update.ready` reworded to "A new version of Pace is ready") on the left and one button «Refresh page»
(lime primary, small h-8/h-9) on the right. No «Later», no detail line — delete `update.detail` and
`update.later` keys (EN + RU) and their code. Wide window: it still sits in the sidebar's foot but it may
be wider than the sidebar is fine only if it does not cover content — keep it within the sidebar width
(w-[200px] currently): if one row does not fit 200px, make the card `left-3 bottom-3` with
`flex-row items-center gap-3` and a width that fits the text and button on one line (e.g. auto width,
max ~340px) — check visually that it does not cover the Now list badly; the phone: top, centred, auto width.
Update the app test for the banner if any (search update-banner tests) — tests first.

## Verify
Take screenshots (Playwright, both themes, phone 390px and desktop 1280px) of Now (New task button,
composer focused), Day (time bar), Settings (a switch), and the update card (you can force it by
rendering the component in a test page or by mocking the waiting worker — if too hard, an app test snapshot
of the class names is enough; say which in the report). Put screenshots in
/tmp/claude-0/-home-user-pace-dev/cb223545-7465-5720-b7e6-b3fd375d3413/scratchpad/task2/ and list them in the report.
`bun lint`, `bun test:unit`, `bun test:app` green.
