# 05 · break-ui: worst-case data against every list, card and chip

Reviewer 05 (method: `dev-core:break-ui`, SKILL.md + CATALOG.md applied as written). The data was not
injected into components. It went in through the real boundary: `POST /api/sync/push` (`pushAsClient`)
on Telegram ids 3220–3224, plus `page.route` stubs for three API answers that no event can set (`/api/me`
first name, `/api/notifications`). The real web build (`localhost:4173`) was then screenshotted at
390×844, 1440×900 and 320×568, in light and dark, RU and EN. Scratch folder (scripts, fixtures,
screenshots): `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad/review-05/`
(`$R05` below). Scripts: `$R05/../shots/r05-fixtures.ts`, `r05-seed.ts`, `r05-shoot.ts`, `r05-deep.ts`,
`r05-lang.ts`, `r05-verify.ts`.

## Summary

**31 findings: 2 blockers, 11 major, 12 minor, 6 nits.** All overflow breaks look the same in light and
dark, because the cause is layout, not color. RU makes the truncation worse; EN shows the same breaks.

The three things that matter most:

1. **Text in a flex row never shrinks, so every long name runs past its box or under a control.**
   React Native (and RN-web, which copies it) gives every View `flexShrink: 0`. `ColorTag`, `Chip`, the
   task header's project button and the running row's tag carry `numberOfLines={1}`, but no ancestor ever
   bounds their width, so the ellipsis never fires. The result: project tags cut at the card edge on Now,
   History and preset previews; the task screen scrolls sideways (`scrollWidth 738 > 390`); the activity
   name runs under **Stop**; the project name runs under the edit, pause, cancel and delete icons. One kit
   rule fixes all of them (05-002…05-006).
2. **Text that comes from data has no clamp, so primary controls and cards grow without limit.** The
   submit button lists every solved subtask ("Сдать 100, 101, … 135 и 136"). It takes half the phone
   screen at 390 px and *the whole screen* at 320 px, where the task body ends up 0 px tall (blocker).
   A 1 200-character capture makes one inbox card two screens tall. A 2 000-character link prints in full.
   The 4 000-character description has no "show more".
3. **Nothing in the UI scales to real volume.** 1 284 open tasks are not virtualized. Expanding one
   group mounts about 1 050 rows (16 700 DOM nodes) in 4–5 s. The 10 project filter chips beyond the
   first two cannot be reached with a mouse (hidden scrollbar, vertical wheel ignored). On a large account
   the first sync shows the UI in **English for 3–5 s**, with the badge counting 34 → 94 → 99+, before it
   flips to Russian. The Week grid stacks short blocks on top of each other until their labels collide.

What held up: plural forms (every `plural()` site is right at 0/1/2/5/11/21/22/25/101/111, and the
colon pattern avoids the rest), the 99+ clamp, RTL fragments, emoji in titles and projects, one-letter
names, the two-line clamp on task-row titles, and wrapped project names in the list (see "What held up").

## Fixtures (one dataset, failures spread across rows)

| Account | Content |
|---|---|
| 3220 `worst-ru` / 3221 `worst-en` | 12 projects (78–96-character Cyrillic names, `Я`, `🏠 Дом и семья`, `שלום עולם проект`, `Спорт 🏃‍♀️🏋️`, `Электроэнцефалографический`). Tasks: a 300-character Cyrillic title (the assistant's cap; events are unbounded), `Я`, a long URL as the title, an emoji title, an RTL fragment, very long words, a camera-style file name. One "detail" task with 100 subtasks (37 solved, every 10th label is 200 characters), a 4 000-character description, a 2 000-character link, an estimate of 1 439 min. 120 inbox captures (the first one 1 500 characters). A 23 h 59 m block with an 80-character label. Overlapping logged blocks, a 30-second block, a main and an alongside activity both running (Expect 1 440). A preset with a 70-character name. Two agent sessions (an 80-character name, `Я`). Stubs: a 64-character Telegram first name, an emoji-first name. Fixture JSON: `$R05/fixtures/worst-ru.json` |
| 3222 `huge` | 1 284 open tasks across 12 projects, every 11th one ASAP, two thirds of them dated |
| 3223 `empty` | A fresh account |
| 3224 `one` | Exactly one project, task, subtask, capture and block (counts at 1) |

## Data limits (Phase 1 of the skill)

| Field | Event schema (`packages/core/src/events/payloads.ts`) | Other limits | UI input | UI display |
|---|---|---|---|---|
| Task title | **unbounded** `z.string().min(1)` (:80, :128) | assistant 300 (`actions/limits.ts:16`) | no `maxLength` | row: 2 lines (`task-row.tsx:30`); detail, inbox and review card: unclamped |
| Project name | **unbounded** (:183) | assistant 100 | no `maxLength` (`project-form.tsx:45`) | `ColorTag` 1 line but never shrinks; `Chip` unclamped; header 1 line but never shrinks; list wraps |
| Preset name | **unbounded** (:201) | — | no `maxLength` (`preset-form.tsx:44`) | `ColorTag` as above |
| Description | **unbounded** (:87) | assistant 4 000 | 4 000 (`task-description.tsx:32`) | unclamped |
| Link | **unbounded** (`TaskFieldsSchema.link`, :39) | assistant 2 000; link preview 2 048 | — | full URL as body text |
| Subtasks | count and label **unbounded** (:30, :148) | assistant 100 × 200 characters | — | submit label joins every solved one |
| Close reason | **unbounded** (:156) | — | no `maxLength` | — |
| Activity label | 80 (`ACTIVITY_LABEL_MAX`, :278) | assistant 80 | sheet 80 (`activity-sheet.tsx:136`); **time bar 200** (`time-bar.tsx:85`) | 1 line |
| Estimate | **unbounded** `z.int().min(0)` (:86) | assistant 10 080 | — | `formatDuration` never rolls up to days |
| Expect | 1 440 (:268) | — | — | — |
| Device name | — | 80 (`api/schemas/cloud.ts:79`); login notice name 120 (`notify/pool.ts:17`) | 80 (`add-computer.tsx:81`) | 1 line, no tooltip |
| Telegram first name | — | **unbounded** in `UserSchema` (Telegram itself caps at 64) | — | sidebar 1 line in about 40 px |
| Server host | — | **unbounded** (DNS allows 253) | no `maxLength` | wraps, centered |
| Inbox badge | **unbounded** | — | — | clamps to 99+ (`count-badge.tsx:16`) |
| Open tasks | **unbounded**, unpaginated | — | — | not virtualized |

## Findings

`id · severity · surface · viewport/theme/lang · file:line · what · why · fix · screenshot`

### Blockers

**05-001 · blocker · Task detail footer · phone 390 and 320, desktop; both themes; RU and EN**
`apps/app/src/features/task/use-submit-title.ts:9-17`, `features/task/task-footer.tsx:70-84`.
The primary button's label is built from data: `t("task.submitSubtasks", {subtasks: joinList(every solved subtask)})`.
With 37 solved subtasks it reads "Сдать 100, 101, … 135 и 136" and grows to 20 lines. At 390×844 the
footer takes 50 % of the screen and the task body scrolls in a band about 380 px tall. At 320×568 the
button fills the viewport and **the body pane is 0 px tall: title, stats and subtasks cannot be reached**.
On desktop the label wraps to 4 lines.
Why: WCAG 2.2 SC 1.4.10 Reflow (content lost at 320 CSS px); HIG › Buttons › "keep labels succinct";
break-ui signature "long translated button label overflows".
Fix: name the count, never the list. Up to 3 names → "Сдать 3 и 4"; more → `plural()` "Сдать 37 задач",
with the full list in the accessibility hint and the submit sheet. Clamp the label to 1 line. Give the
footer a fixed height.
Screenshots: `$R05/shots/worst-ru/taskBig--phone-light.png`, `$R05/shots/worst-ru/taskBig--small-light.png`,
`$R05/shots/deep/taskBig-desktop-light-s2.png`.

**05-002 · blocker · `ColorTag` everywhere (Now, History, project page, preset preview, task detail tags, Day) · all viewports, both themes, RU and EN**
`apps/app/src/ui/color.tsx:96-106`. The tag is a `self-start` View whose Text has `numberOfLines={1}`, but
the View keeps RN's default `flexShrink: 0` and has no `max-w-full`, so the Text never gets a bounded
width and never ellipsizes. A 78-character project name runs straight through the card's right edge
(Now, History, the preset preview). On the task screen the 70-character preset tag widens the document:
**`document.scrollWidth` is 738 at a 390 px viewport, so the whole screen scrolls sideways**.
Why: WCAG 1.4.10 Reflow (scrolling in two directions); break-ui signature "text overflows its box —
flex child with `min-width:auto`"; bug-lessons class 5 (layout that unit tests cannot see).
Fix: in the kit, a tag is `max-w-full shrink` (min-width 0) and ellipsizes. Where the full name matters,
give the meta line its own row.
Screenshots: `$R05/shots/worst-ru/now--phone-light.png`, `task300--phone-light.png` (overflow probe:
`$R05/shots/worst-ru/probe-phone-light_phone-dark.json`), `$R05/shots/deep/history-phone-dark-s0.png`,
`$R05/shots/worst-ru/presetLong--phone-light.png`.

### Major

**05-003 · major · Running activity row (Now time bar) · phone and desktop, both themes, RU and EN**
`apps/app/src/shared/tracking/running-row.tsx:21-23, 47-48`. The activity label is a `ColorTag`
(05-002) inside a `flex-wrap` row, so an 80-character label (the schema maximum) **runs under the Stop
button**: text and control overlap. The alongside row does the same.
Why: break-ui signature "trailing action pushed or overlapped"; bug-lessons class 6 (something drawn over
an enabled control).
Fix: `min-w-0` on the meta column; the label as plain 1-line text that shrinks (truncated at the end, full
name in the a11y label, which it already has); Stop stays `shrink-0`.
Screenshots: `$R05/shots/worst-ru/now--phone-light.png`, `now--desktop-light.png`.

**05-004 · major · Task header (pushed screen and pane) · phone and desktop, both themes**
`apps/app/src/features/task/task-header.tsx:114-131`, `apps/app/src/ui/back-header.tsx:43`. The project
button is a Pressable that does not shrink inside `flex-1 flex-row`, and the Text inside it has
`numberOfLines={1}` without a bounded width. A long project name runs **under the edit, pause, cancel
and delete icons** (the icons are painted over the text). On the phone the name continues past the screen
edge.
Why: HIG › Layout › "don't let content collide with controls"; bug-lessons class 6.
Fix: `BackHeader`'s middle slot is `min-w-0 flex-1`, the project Pressable is `shrink min-w-0`, and the
actions are `shrink-0`.
Screenshots: `$R05/shots/worst-ru/taskBig--phone-light.png`, `$R05/shots/worst-ru/taskBig--desktop-dark.png`.

**05-005 · major · Week grid · phone and desktop, both themes**
`apps/app/src/features/week/week-grid.tsx:52` (`MIN_TARGET_PX = 24`), `:163-186`;
`packages/client/src/view-models/week.ts:118` (`lanesOf`). Lanes are computed from real start and end
times, but every block is *drawn* at least 24 px tall. At about 21–28 px per hour, consecutive 20–30
minute blocks therefore overlap by 10–15 px. Five of them stack into one pile where only the top one can
be tapped and the 10 px labels print over each other ("Подгото… / Дорога 1 / Лекция 2 / Спорт 3 / Сон 4").
Why: break-ui "overlap" case; HIG › Charts › "marks must stay distinguishable"; 44 pt targets
(HIG › Accessibility).
Fix: compute lanes on the *drawn* rectangles (inflated height), or fold a run of short blocks into one
"+3" block that opens a list.
Screenshots: `$R05/shots/worst-ru/week--phone-light.png`, `$R05/shots/worst-ru/week--desktop-dark.png`.

**05-006 · major · Now project filter (chips) · desktop 1440 above all, phone too; both themes**
`apps/app/src/features/now/project-chips.tsx:23-27`, `apps/app/src/ui/chip.tsx:374-382`. A chip is as wide
as its name (no `numberOfLines`, no max width). One 78-character project makes a chip about 900 px wide
on the phone. On desktop the strip is 559 px wide with `scrollWidth 3354`, `scrollbar-width: none`, and
**a vertical wheel does not scroll it** (scrollLeft stays 0, verified). 10 of the 12 filters can only be
reached by Tab or a horizontal trackpad swipe. There is no fade or arrow to show that more chips exist.
Why: HIG › Scroll views › "make it clear there's more content"; break-ui "one tag wider than its
container"; bug-lessons class 10 (a control that does nothing on one platform).
Fix: chips clamp at about 180 px and ellipsize (full name in `accessibilityLabel`). On wide layouts,
either a visible scroll affordance with wheel→horizontal mapping, or wrap to two rows plus "Ещё N"
opening a picker.
Screenshots: `$R05/shots/worst-ru/now--desktop-light.png`, `$R05/shots/worst-ru/now--phone-light.png`.

**05-007 · major · 1 284 tasks (Now, project page, History) · phone and desktop**
`apps/app/src/shared/task-list.tsx:155-191`, `apps/app/src/ui/row-list.tsx`. Folded groups show 3 rows
(good), but "Развернуть" mounts the whole group: 1 053 rows and 16 690 DOM nodes on the phone (1 174 rows
and 18 636 nodes on desktop) in 4.1–5.1 s. Each row is an `Animated.View` with enter, exit and layout
transitions. Scrolling afterwards: frame p95 133 ms and 35 frames over 50 ms on the phone viewport
(desktop CPU, no throttling; a mid-range Android will be slower). First row painted at 2.0 s.
Why: break-ui "1 000+ items unpaginated → virtualize or paginate"; HIG › Performance (responsiveness).
Fix: `FlatList`/`FlashList` (virtualized) for task lists, layout animation off above about 50 rows,
"Показать ещё 50" paging inside a fold. Same for the Inbox (05-010).
Data: `$R05/shots/deep/perf.json`. Screenshots: `$R05/shots/deep/huge-now-phone.png`,
`$R05/shots/deep/huge-now-expanded-phone.png`.

**05-008 · major · First sync of a large account · phone, RU account**
`apps/app/src/app-state.tsx:253-` (`useLanguage` / `LanguageReadyContext`). On the 1 297-event account the
UI renders in **English** at 1.5 s and 3 s ("Now", "With a deadline", "Expand"), with the tab badge
counting 34 → 94 → 99+. At 5 s it flips to "Сейчас". The whole screen reflows (RU strings are 15–40 %
longer) while the person may already be reading or tapping.
Why: HIG › Loading › "show content as soon as possible, but don't make it jump"; WCAG 3.1.1 Language of
Page (wrong language shown); bug-lessons class 22 (account preferences used before there is an account).
Fix: block the first paint on `settings.language` (it is the first event in every log; pull it before
the rest), or show a skeleton until the settings slice is materialized. Hold the badge until the first
full pull.
Screenshots: `$R05/shots/deep/huge-firstsync-1500.png`, `huge-firstsync-5000.png` (log in `r05-lang.ts`).

**05-009 · major · Now at 320×568 and at 200 % text · phone, RU**
`apps/app/src/screens/now-screen.tsx:68-72` with the time bar (`shared/tracking/time-bar.tsx`). The time
bar has no maximum height. With a main and an alongside activity running, at 320×568 the task list pane
shrinks to about 60 px (one row, half clipped). At browser zoom 200 % (a 195 CSS px viewport) the list
pane is 0 px. The composer's RU placeholder "Добавьте задачу или текст" wraps inside a one-line field and
is clipped. The tab label shows as "Входя…".
Why: WCAG 1.4.10 Reflow and 1.4.4 Resize Text; HIG › Layout › "prioritize the primary content".
Fix: cap the time bar (e.g. 40 % of the height, its own scroll; a single summary line when 2+ activities
run); give the placeholder `numberOfLines={1}` with a shorter RU string.
Screenshots: `$R05/shots/worst-ru/now--small-light.png`, `$R05/shots/deep/zoom200_.png`.

**05-010 · major · Inbox cards · phone and desktop, both themes**
`apps/app/src/screens/inbox-card.tsx:42`. The capture is rendered whole (`<Text>{card.text}</Text>`, no
clamp). The first card (a 1 500-character paste) is more than two screens tall. 120 cards render at once,
each with two full-width buttons (a wall of lime "Принять"). There is no virtualization and no
bulk action.
Why: break-ui "clamp multi-line previews in cards so heights stay predictable"; HIG › Lists › "keep rows
scannable".
Fix: clamp 4 lines + "Показать всё" (the full text is in the task); virtualize; consider "Принять все
догадки" for N > 10.
Screenshots: `$R05/shots/worst-ru/inbox--phone-light.png`, `$R05/shots/deep/inbox-phone-dark-s0.png`.

**05-011 · major · Task detail link · phone and desktop, both themes**
`apps/app/src/features/task/task-summary.tsx:177-186`. The link prints the full URL with `↗` as body
text: 2 000 characters take 12 lines on the phone and 17 on desktop above the tags. The part that
identifies the page (the host) is buried.
Why: break-ui "long URL: end-truncation hides the part that differs → truncate in the middle"; HIG ›
Typography (hierarchy).
Fix: one line, `host … tail` (middle-truncated), full URL in the a11y label and the link preview.
Screenshots: `$R05/shots/worst-ru/taskBig--phone-light.png`, `$R05/shots/worst-ru/taskBig--desktop-dark.png`.

**05-012 · major · Truncation with no way to read the value (web) · all, systemic**
`numberOfLines` is used in 26 places, and the overflow probe finds **0 elements with a `title`
attribute** on any screen (verified on Now desktop). Cut-off values that cannot be read anywhere else on
the page: the task-row title (2 lines), the Day row label (cut at about 13 characters on the phone), the
sidebar owner name, the session name, the Insights project name (`w-24`), the "В срок" project name, the
Week block label.
Why: break-ui signature "truncated text with no way to read it"; web-design-guidelines (truncated text
needs `title` or a tooltip); WCAG 1.3.1.
Fix: the kit's `Text` with `numberOfLines` sets `title` on the web (`.web.tsx` sibling) and keeps the full
value in the a11y label. Rows that truncate must open a detail view.
Screenshots: `$R05/shots/worst-ru/day--phone-light.png`, `$R05/shots/deep/insights-phone-dark-s1.png`.

**05-013 · major · Avatar initials (sidebar, More) · all**
`apps/app/src/shared/user-avatar.tsx:11-16`. The initials come from `part.slice(0, 1)`, a UTF-16 code
unit. For an emoji-first Telegram name ("🦊 Лиса", a common Telegram pattern) the avatar shows a **lone
surrogate `\ud83e`** (a broken glyph) plus "Л" (verified: codepoints `d83e 41b`).
Why: break-ui CATALOG › People › "emoji first: `.charAt(0)` returns half a surrogate pair".
Fix: initials from grapheme clusters (`Array.from` at least; `Intl.Segmenter` where Hermes has it),
skipping non-letters, with the person icon as fallback.
Screenshot: `$R05/shots/deep/emoji-name-sidebar.png`.

### Minor

**05-014 · minor · Insights bars · phone and desktop, RU and EN, both themes**
`apps/app/src/features/insights/insights-screen.tsx:47, 56`. The value column has no width, so each bar
ends at a different x ("27 ч 21 м" vs "1 м"): **misaligned columns**. Project names are cut at `w-24`
("Безопасность …") with no tooltip.
Why: break-ui "misaligned columns"; HIG › Charts › "align for comparison".
Fix: value `w-16 text-right tabular-nums`; name column as a fraction of the width.
Screenshots: `$R05/shots/worst-ru/insights--phone-light.png`, `$R05/shots/worst-en/insights--phone-light.png`.

**05-015 · minor · Insights "Насколько дробилось время" tiles · phone, RU and EN**
`apps/app/src/features/insights/patterns.tsx:83-92`. In three tiles at 390 the RU label breaks
mid-word ("Переключени / й в день") and EN "Typical focus block" is clipped at the bottom.
Why: break-ui "long word breaks mid-word".
Fix: two tiles per row on the phone, or shorter labels ("Переключений/день").
Screenshots: `$R05/shots/deep/insights-phone-dark-s1.png`, `$R05/shots/one/insights--phone-light.png`.

**05-016 · minor · Insights "switches per day" decimal · RU**
`packages/client/src/view-models/insights-text.ts:41` (`switchesPerDay.toFixed(1)`). Shows "3.3" and
"0.0" in Russian, where it should be "3,3".
Why: break-ui CATALOG › Numbers › locale formatting.
Fix: `Intl.NumberFormat(language, {maximumFractionDigits: 1})` (Hermes has NumberFormat).
Screenshot: `$R05/shots/one/insights--phone-light.png`.

**05-017 · minor · Sidebar owner name · desktop 1440, both themes**
`apps/app/src/ui/sidebar.tsx:165-175`. The logo, the avatar and the bell leave about 40 px, so the
64-character first name becomes "А…": one letter, with no tooltip.
Fix: move the name and avatar to their own row at the sidebar's foot (account menu), 1 line, with `title`.
Screenshot: `$R05/shots/worst-ru/now--desktop-light.png`.

**05-018 · minor · Tab bar 99+ badge · phone, both themes**
`apps/app/src/ui/tab-bar.tsx:66` (`absolute -right-3 -top-1.5`). The badge is anchored on its right, so
"99+" grows leftward and **covers the Inbox icon**.
Fix: anchor at `left: 55%` so it grows right; drop `px-1.5` for 3 characters.
Screenshot: `$R05/shots/worst-ru/day--phone-light.png`.

**05-019 · minor · Day rows · phone, RU and EN, both themes**
`apps/app/src/features/day/day-screen.tsx:94-101`. The tag and the label share a `flex-wrap` row. A short
label sits beside the tag (a one-line row), while a long one drops under it and is cut at about 13
characters (a two-line row). Row heights alternate and the label, the most important text, gets the
least room.
Fix: label first (up to 2 lines), category as a quiet meta token, the same structure for every row.
Screenshot: `$R05/shots/worst-ru/day--phone-light.png`.

**05-020 · minor · Task description · phone and desktop**
`apps/app/src/features/task/task-description.tsx:115-123`. 4 000 characters render in full. The subtasks
start about 2 600 px down.
Fix: clamp 6 lines + "Показать полностью".
Screenshot: `$R05/shots/deep/taskBig-phone-dark-s1.png`.

**05-021 · minor · Durations never roll up past hours · all**
`packages/core/src/i18n/i18n.ts:101-111` (`formatDuration`; `formatLeft` above it does roll up). An
estimate of 10 080 → "Оценка 168 ч"; the week total "36 ч 50 м".
Fix: ≥ 24 h → "7 д" / "1 д 12 ч" for estimates; keep hours for tracked totals if that is the product
choice, but decide it once.
Screenshot: `$R05/shots/worst-ru/task300--phone-light.png`.

**05-022 · minor · Input limits disagree with each other and with the schema · data**
Events accept unbounded title, project, preset, description, link, subtasks and reason (table above).
The assistant caps them, but the UI caps only the description (4 000) and the activity sheet (80), while
**the time bar's "What are you doing?" field allows 200** against `ACTIVITY_LABEL_MAX = 80`
(`apps/app/src/shared/tracking/time-bar.tsx:85` vs `packages/core/src/events/payloads.ts:278`).
Fix: one `LIMITS` table in core (title 300, project 100, preset 100, link 2 000, subtask 200,
description 4 000, label 80), used by event payloads, `maxLength` and the assistant.

**05-023 · minor · Empty account · phone and desktop**
Now ("Nothing to do right now."), Insights and Inbox each show a single muted sentence with no action or
next step.
Fix: an empty state with one primary action (Now: focus the composer; Insights: "Начать отслеживать").
Screenshots: `$R05/shots/m-empty.png`, `$R05/shots/m-empty-d.png`.

**05-024 · minor · Project list with long names · phone**
`apps/app/src/screens/projects-screen.tsx`. Names wrap to 4 lines (the right choice), but the colored
row keeps its fixed vertical padding, so a 4-line name touches the rounded edge and rows go from 56 to
112 px with uneven rhythm.
Fix: `py-3 min-h-14`, clamp to 2 lines in the list (the full name is in the header).
Screenshot: `$R05/shots/worst-ru/projects--phone-light.png`.

**05-025 · minor · Session row name · phone**
`apps/app/src/features/sessions/session-row.tsx:65`. An 80-character device name shows as
"MacBook Pro (16-inch,…". The part that tells two laptops apart is at the end.
Fix: wrap to 2 lines (the user needs it to decide what to end), or middle-truncate.
Screenshot: `$R05/shots/deep/settings-phone-dark-s1.png`.

### Nits

**05-026 · nit** · Week block label is `numberOfLines={1}` even on a 23 h 59 m (1 500 px) block:
"Подгото…" at the top of an empty violet column. `week-grid.tsx:183`. Fix: let lines = floor(height / 12).
Screenshot: `$R05/shots/worst-ru/week--phone-light.png`.

**05-027 · nit** · Week on the phone opens scrolled into the middle of a column (header "р, 28" cut).
`features/week/sideways-days.tsx`. Fix: snap the initial offset to a column edge.
Screenshot: `$R05/shots/worst-ru/week--phone-light.png`.

**05-028 · nit** · A subtask row centers the check and the number against a 7-line label (rows of 52 to
190 px). `features/task/subtask-checklist.tsx:54`. Fix: `items-start` once text can wrap.
Screenshot: `$R05/shots/deep/taskBig-phone-dark-s2.png`.

**05-029 · nit** · Group counts are `String(count)` with no grouping: a fold of 1 284 would read "1284",
not "1 284". `shared/task-list.tsx:226`. Fix: `Intl.NumberFormat`.

**05-030 · nit (code review, Android only)** · Server picker: the host goes into a centered wrapping Text
(`features/server/server-line.tsx:28-32`, `incompatible-screen.tsx:37-39`). A tailnet host like
`pace.workstation-aleksandra.tail9f8e7d.ts.net:8443` wraps into 2–3 centered lines and leaves
"· Сменить" orphaned. The instance `name` in Found is server-controlled and unbounded
(`api/schemas/instance.ts:14`). Fix: host on its own line, middle-truncated; "Сменить" as its own button.

**05-031 · nit** · Avatar initials take the first two *words*. A hyphenated name becomes "АК", while
CATALOG suggests first + last word. `user-avatar.tsx:14`. Fold into 05-013.

## Table: target · fixture · breaks at · decision proposed

| Target | Fixture value | Breaks at | Decision (per text) |
|---|---|---|---|
| Task row title (`task-row.tsx`) | 300-character RU title, URL title | holds (2 lines, ellipsis; URL breaks at `/`); no tooltip | **clamp 2** + `title` on the web |
| Row tag (`ColorTag`) | 78–96-character project, 70-character preset | every width, past the card edge | **truncate end**, shrinkable, ≤ 50 % of row width |
| Meta line (`meta-line.tsx`) | due, left, solved, repeat | wraps under tags at 390 (fine) | **wrap** (secondary line) |
| Now filter `Chip` | 78-character project ×12 | phone and desktop: chip ~900 px, 10 chips unreachable by mouse | **truncate end** ≤ 180 px; affordance or "Ещё N" |
| Task header project | 78-character project | phone and desktop: under the action icons | **truncate end** 1 line, shrink |
| Task title (detail) | 300 characters | holds (wraps 13 lines at 390) | **wrap** (identifying text) |
| Task link | 2 000-character URL | 12–17 lines | **truncate middle** 1 line |
| Description | 4 000 characters | full length | **clamp 6** + "show all" |
| Submit button label | 37 solved subtasks | 390: half the screen; 320: whole screen | **count form** ("Сдать 37 задач"), 1 line |
| Subtask label | 200 characters | 7 lines, centered check | **wrap**, top-align |
| Running activity label | 80 characters | under Stop | **truncate end** 1 line |
| Day row label | 80 characters | cut at ~13 characters on the phone | **wrap 2**, label above the category token |
| Week block label | 80 characters, 23 h 59 m, 20-minute overlaps | overlapping piles; 1 line on tall blocks | **scale lines to height**; lanes on drawn rectangles / "+N" |
| Insights bar name / value | 78-character project; 27 h vs 1 m | misaligned bars, name cut | **truncate end** name; **fixed value column** |
| Insights tiles | RU labels | mid-word break at 390 | **wrap 2** in 2-up tiles |
| Inbox card text | 1 500-character capture ×120 | 2+ screens per card | **clamp 4** + virtualize |
| Review card title | 300 characters | holds (wraps 8 lines) | **clamp 3** |
| Sidebar owner name | 64-character first name | 1440: "А…" | own row, **truncate end** + `title` |
| Tab and sidebar badge | 120 waiting | 99+ covers the tab icon | **clamp** 99+ (kept); anchor left |
| Avatar initials | "🦊 Лиса" | lone surrogate | graphemes, letters only |
| Session name | 80 characters | phone: cut at 22 characters | **wrap 2** / middle |
| Settings rows | RU labels | hold at 320 | — |
| Notifications feed | 120-character login name, 300-character digest titles | hold (wrap) | **wrap**; clamp digest titles 2 |
| Project page | 96-character name, 120-character description | hold (header wraps) | **wrap** (header), **clamp 2** in list rows |
| Presets list | 70-character name | holds (tag fits 1440; phone tag truncates via the row) | **truncate end** |
| Server picker (code) | 60+ character host | wraps centered, "Сменить" orphaned | **truncate middle** |
| Now list (1 284) | 1 284 tasks | expand: 4–5 s, 16.7 k nodes | **virtualize** + page in folds |
| Durations | 10 080 m, 0 m (30 s) | "168 ч"; 30 s → "1 м" (fine) | roll up to days for estimates |
| Numbers | 3.3, 1284 | "3.3" in RU; no grouping | `Intl.NumberFormat` |

## Proposed dev-only worst-case toggle (for Phase 4, not built: read-only review)

The skill's Phase 3 toggle, shaped for this stack so that data goes in at the real boundary (event log +
API) and nothing ships to production.

- **Fixtures in core, shared by e2e, app tests and the toggle:** `packages/core/src/testing/worst-case.ts`
  (beside the existing `testing.ts` / `queries/fixture.fake.ts`), exporting `worstCase(now, language)`,
  `huge(now, n = 1284)`, `one(now)`, `empty()` as event lists. These are this review's `r05-fixtures.ts`,
  moved over, with values tied to the limits table (300 / 100 / 2 000 / 4 000 / 80 / 100 subtasks).
  Imported by `e2e/support/seed.ts` and by the API route below, so knip sees real users of the file.
- **API side (the data boundary):** `POST /api/test/fixture/:name`, an `endpoint()` in
  `packages/core/src/api/endpoints.ts` next to `auth.dev` and `account.testReset`, mounted through
  `mount()` and refused with `not-found` when `config.environment === "production"` (the same guard as
  `devLogin`, `apps/api/src/auth/auth-routes.ts:274-278`). It resets the caller's store and pushes the
  fixture log. Extend `DevLoginSchema` with optional `firstName` / `name` (≤ 64 / 128) so the sidebar,
  More and avatar cases (64-character name, emoji-first name) come from a real `/api/me`, not a stub. A
  `notifications` fixture inserts a 12-task digest, a 120-character login notice, an 80-character overrun
  and a 200-character event start into the pool.
- **App side:** `apps/app/src/dev/worst-case-toggle.tsx`, a small segmented control fixed bottom-center
  (gray track, white active pill, system font, no animation). Segments: **Demo · Худший случай · Пусто ·
  Одно · 1 284**, plus **RU / EN** and **светлая / тёмная** switches for screenshot runs. It is rendered
  from `app/_layout.tsx` only under a build-time condition: `process.env.EXPO_PUBLIC_DEV_LOGIN === "1"`,
  which Expo inlines, so the production minifier drops the branch and the lazy `import()` chunk. The
  existing runtime `IS_DEV_LOGIN_ENABLED` (`platform/api-base.ts:26`) reads `Constants.extra` at run time,
  which keeps the code in the bundle, so do not reuse it here. The selection persists in the URL
  (`?data=worst&lang=ru`, an expo-router search param), so a reload keeps it. Choosing a segment calls the
  fixture endpoint, then `sync.syncNow()`. On Android dev builds the same control appears under
  `__DEV__`.
- **Guard for the class (bug-lessons rule):** `e2e/worst-case.spec.ts` seeds `worstCase` and visits every
  route at 390 / 1440 / 320 in both themes. It runs the overflow probe from `r05-shoot.ts`
  (`document.scrollWidth ≤ innerWidth`; no text box past its card or under an enabled control; every
  `text-overflow: ellipsis` element has `title`). It also enforces a perf budget on `huge` (expand < 1 s,
  DOM nodes < 3 000 after expand). Add a bug-lessons class: *"Text from data in a flex row without a
  shrink rule"*.

## What held up (do not touch)

- **Plurals:** all four `plural()` sites (`meta.subtasksLeft`, `projects.open`, `calendar.people`,
  `repeat.everyNDays`) are right in RU and EN at 0/1/2/5/11/21/22/25/101/111. Count strings without
  plural forms use the colon pattern ("Приближаются сроки у задач: 21") or are guarded at 1
  (`notifications-screen.tsx:50`). The `one` account reads "1 задача", "0/1 решено", "осталась 1 подзадача".
- The 99+ clamp; `tabular-nums` on counts and durations.
- RTL fragments (`שלום`, `مرحبا بالعالم`) render in correct bidi order thanks to RN-web's `dir="auto"`. An
  RTL-first project name reads RTL-first as expected.
- Emoji and ZWJ sequences in titles, project names and labels render without tofu. One-letter title,
  project, preset and session (`Я`) keep row height and alignment.
- Task-row titles clamp at 2 lines. The project list wraps instead of truncating. Desktop session names
  show in full. The review card and the login notice wrap a 300-character or 120-character text cleanly.
  Settings holds at 320 px.
- Core resolves overlapping *logged* blocks into sequential ones, so Day shows no overlap. A 30-second
  block reads "15:00 – 15:01 · 1 м". The 23 h 59 m block draws inside the column.
- The 1 284-task account paints its first rows in about 2 s thanks to the 3-row folds.

## What this says about the system

- **The kit has no rule for how text yields in a row.** RN's `flexShrink: 0` default plus `numberOfLines`
  on a Text whose parent has no bounded width is the root of 05-002…05-006. The new kit needs one
  primitive (e.g. `<Line truncate="end|middle" lines={n}>`) that is `min-w-0 shrink` by construction and
  sets `title` on the web. Bare `Text` with `numberOfLines` should become lintable.
- **Text from data is placed in chrome without a budget.** The button label, link, description, inbox
  text, chip and badge each need a declared length policy: truncate, wrap, clamp or count. Today the
  default is "whatever the data is". The redesign spec should list a policy per text slot (the table above
  is a first draft).
- **Limits live in four places that disagree** (event schemas unbounded, assistant caps, two UI
  `maxLength`s, a 200-vs-80 mismatch). One core `LIMITS` table, used by payloads, forms and the assistant,
  makes the worst case knowable.
- **Lists and grids were built for a lived-in demo, not for volume.** No virtualization, a per-row layout
  animation, and lanes computed on data rather than on drawn geometry all fall over at real scale. Volume
  belongs in the spec (1 284 tasks, 120 captures, 12 projects, 5 overlapping blocks).
- **The time bar competes with the content it serves.** It has no height budget, so at 320 px or with large
  text the primary list disappears. The layout spec should rank regions (content > live status >
  navigation) and give each a minimum.
- **Locale is applied late and formatted by hand** (`toFixed`, `String(count)`, `slice(0, 1)`, language
  after sync). The spec should require `Intl` for numbers, graphemes for initials, and the first paint in
  the account's language.
- **Nothing tests geometry with hostile data** (bug-lessons classes 5, 6, 37). Every break here passes the
  current suites. The worst-case route plus the e2e overflow sweep is the guard that turns these instances
  into a class.
