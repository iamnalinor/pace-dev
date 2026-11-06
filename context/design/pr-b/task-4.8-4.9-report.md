# Tasks 4.8, 4.9 report: Projects / presets, Insights

## Shipped
- Projects (`features/projects`): top header with a content-width «New project» button (the inline form opens at
  the top of the list, focus returns to the button), rows on `ListRow` with a hue `Dot`, the name (2 lines) and
  «3 tasks» (plural) trailing; no hero strip.
- Project page: name as the page's `title1`, one meta line «2 open · 9/11 on time · 2 late», description clamped
  to 3 lines, then the Now task list: «Tasks · n» header, «In future» and «Done» disclosures, rows without the tag.
- Presets: `ListRow` rows in a `Group` (dot, name, «Default»/«Yours»/«Deleted», chevron) with the ▲▼ buttons beside
  them (not inside the pressable row); «Start from» became «New preset» with chips that say what they do
  («Start from “Homework”»); example seed and «Show deleted» as a button and a `SwitchRow`.
- R23-05: the preset name's refusal (empty or taken) is the Name field's `error`, marked, announced, cursor sent
  back to it, cleared when the name changes.
- Insights: sections are `SectionHeader` over a borderless cell, tables are `ListRow`s, bars share one measured
  value column (every bar ends on the same x), the hours chart is one slate series, stat tiles use `numeric.stat`
  with kit `Text` labels on `bg.inset`, empty week through `EmptyState`.
- Ratchets: `DESIGN_VALUE_WARNINGS` 26, `BARE_PRESSABLE_WARNINGS` 7. Bug-lessons 133.

## Tests
Updated `screens.test`, `presets.test` (field error, `aria-invalid`, cleared on edit, new chip names). e2e (not
run): `insights.e2e.ts` (no tile word split at 390 in RU, one value column), `round6-minors` chip name.

## Deviations / Deferred
See the plan's Deferred notes under 4.8 and 4.9 and the HANDOFF register.

## Verify on hardware
Android: the Projects form's focus return with TalkBack, the measured value column after a font-scale change.
Web: Insights tiles at 320 in RU, the preset Name field refocus on a refused save.
