# 09 — Phase C delta review (changed and new surfaces only)

**Scope.** Git range `057e484..HEAD` (Phase C, `origin/ccr-412ef4ac-0q2r7c`), UI files and i18n catalogs only. Evidence comes from three sources:
- the re-shot matrix `SCR/rebaseline/**`, compared pair by pair with `context/design/baseline/**`;
- my own stress run on the live Phase C stack: accounts 3290 (EN) and 3291 (RU), each with 16 sessions (3 extra sign-ins from IPv4 and IPv6 addresses, and 10 computers whose names include 80-character RU, unbreakable and emoji names), plus two overlapping calendar events with an 80-character title. Script: `SCR/shots/r09.ts`, results in `SCR/review-09/log.json`;
- axe 4 (wcag2a/aa, 21aa, 22aa).

Lenses: impeccable critique (Operate), apple-design HIG plus cross-platform, review-animations, break-ui, and a11y.

`SCR` = `/tmp/claude-0/-home-user-pace-dev/23f43a3c-f01c-576a-9968-19b7d8385587/scratchpad`. `R09` = `SCR/review-09`.

## Summary

**21 findings: 0 blocker, 3 major, 13 minor, 5 nit. axe found 0 violations** on every changed screen it ran on: Settings with 16 sessions and a confirm open, the Add-a-computer steps, the Not me confirm, Now's calendar outcome line, and login after a remote sign-out (desktop light, EN and RU).

Phase C fixed real behaviour:
- per-route `document.title`;
- the empty form no longer opens with an error;
- named sheets;
- one confirm open at a time, cancelled by Escape;
- focus no longer lost after Attend, Skip, a token or Not me;
- wrapped session names;
- toasts that say what happened.

It fixed them **one surface at a time, with no shared component**, so each fix brought a new layout or a new failure.

The three things that matter most:
1. **09-001 (major): an IPv6 address runs under the Revoke button.** This is the "text in a flex row never shrinks" class (F-DAT-02) reintroduced in code written to fix it.
2. **09-003 (major): one decision ("end this?") now has four inline-confirm layouts.** The Danger zone, a session row, a Not me in the feed and Wipe differ in alignment, widths and Escape hint. Phase C also resolved F-CMP-07 the opposite way from the evidence: Wipe and Delete were made **identical to Export and Log out** instead of destructive.
3. **09-002 (major): the session-row confirm's Cancel label overflows its own button** in any narrow window with a keyboard. RU «Отмена» spills past the left border. The cause is the 1:2 flex split plus the "Escape" key hint.

## New and changed surfaces

| Surface | What changed | Evidence |
|---|---|---|
| Browser tab title (web) | `DocumentHead` + `route-title.ts`: "Settings · Pace"; `color-scheme` follows the app theme | `R09/log.json` `title-*` |
| Settings › Devices and sessions | rows say kind + "Added/Signed in {time}"; name wraps whole; meta parts wrap as units; icon decorative; one confirm at a time; Escape cancels; list reloads on return/sign-in; error line re-laid | `R09/settings-sessions-tall--*`, `R09/settings-confirm--*`, `R09/pair-sessions-error-phone-ru.png` |
| Add a computer (sheet) | sticky footer **Done**; focus lands on the chosen OS; token warning = icon + fg2 text; all copy buttons secondary | `R09/add-computer-steps--*` |
| Sheet (kit) | `aria-labelledby` title; body `overscroll-contain`; footer slot; close × nudged up 4 px | same |
| Settings bottom | Export + Log out side by side (desktop) / full width (phone); Danger zone under a rule; **Wipe and Delete both `secondary`** | `SCR/rebaseline/scroll/settings-3--*`, `R09/settings-export-toast--*` |
| Settings › Notifications | web: line "notifications wait under the bell"; Android: **BackgroundHint** (battery exemption + Allow) | `R09/settings-push-web--*` |
| Export (web) | toast "Downloaded pace-YYYY-MM-DD.xlsx" | `R09/settings-export-toast--desktop-light-ru.png` |
| Notifications feed | sign-in notice says "This device" for its own; ended sessions settle as "revoked"; **Not me asks first** (inline confirm); activity names localised | `R09/notifications--*`, `R09/notifications-notme-confirm--*` |
| Now › calendar card | one card per event (keyed); after Attend/Skip an **outcome line** "✓ Attending · {title}" takes focus for 8 s | `R09/now-calendar--*`, `R09/now-calendar-outcome--*` |
| Composer | To Inbox gives a toast "Added to Inbox"; leaving the form drops its draft; title error only after typing | `SCR/rebaseline/states/toast-to-inbox--*`, `…/sidebar-new-task--*` |
| Approve toast | names what was done ("Created task “X”; …") instead of "Done" | source `use-pending-actions.ts` (not re-shot) |
| Login | **signed-out notice** "You were signed out: this session was ended on another device, or it expired." | `R09/login-ended-elsewhere--*` |
| Onboarding (Android) | 4th step **battery / background** when the push method needs it; intro lists only applicable steps | source only (web shows "Pace in the browser") |
| Day (Android) | "Last night" sleep card removed (sleep is automatic) | source |
| Assistant log | four new automatic-sleep lines (`decisions.sleep.*`) | catalog |
| Insights | the scroll body is a named keyboard stop (`role=region`, `tabIndex 0`) | `R09/insights-region-focus--desktop-light-en.png` |

## Findings

Format: `id · severity · surface · viewport/theme/lang · file:line · what · why · fix · shot`.

### Lens 4: break-ui (worst cases)

- **09-001 · major · Settings › sessions row · phone (390), both themes, EN+RU · `src/features/sessions/session-row.tsx:70-71`**
  - **What:** a session signed in from an IPv6 address shows the meta "Вход разработчика · Соединённые Штаты · 2001:0db8:85a3:0000:0000:8a2e:0370:7334". The address has no break opportunity: it runs under the 48 px Revoke button, its trailing "·" lands under the button's edge, and an empty line is left before "Вход 2 нояб.". IPv6 is the common case behind Cloudflare.
  - The part wrapper is `max-w-full flex-row` and the Text is `shrink` with no `min-w-0` / `overflow-wrap:anywhere`. The comment promises "never cut".
  - The feed renders the same address as plain joined text and wraps it correctly (`R09/notifications--phone-light-ru.png`).
  - **Why:** break-ui CATALOG › Emails, URLs, identifiers ("unbreakable strings … without `overflow-wrap: anywhere`"); WCAG 1.4.10 Reflow (content obscured at 320 CSS px); bug class F-DAT-02.
  - **Fix:** the meta parts get `min-w-0` + `overflow-wrap:anywhere` (web) or `textBreakStrategy` (Android). Better: put the IP on its own muted line and middle-truncate it, with the full value in an accessible label or tooltip. Add a property or e2e sweep that feeds an IPv6 address to every meta line.
  - **Shot:** `R09/crop-ipv6-phone-ru.png`, `R09/settings-sessions-tall--phone-light-ru.png`.

- **09-002 · major · Settings › session-row confirm · narrow window with a keyboard (390 px, fine pointer), both themes, RU worst · `session-row.tsx:118-133`, `src/ui/button.tsx:67-80`**
  - **What:** the confirm splits Cancel : action as `flex-1 : flex-[2]`, and the web build adds the "Escape" key hint inside Cancel. At 99 px wide, RU «Отмена» starts **outside the button's left border**. EN "Cancel" touches both edges with no padding.
  - Real phones (coarse pointer, `KEYBOARD === null`) are spared. A desktop window at phone width, split-screen, or an iPad with a keyboard is not.
  - **Why:** break-ui › Environment (narrow viewport, longer translations); HIG buttons › "make sure labels fit"; WCAG 1.4.4 / 1.4.10.
  - **Fix:** a kit rule that a key hint is dropped below a minimum button width, or rendered outside the button. Make the confirm's two buttons equal width (HIG alert pairing).
  - **Shot:** `R09/crop-confirm-phone-ru.png`, `R09/crop-confirm-phone-en.png`.

- **09-004 · minor · Settings › sessions list, many rows · all · `sessions-section.tsx` (ReadyList)**
  - **What:** 16 sessions make 16 rows, each with a full 48 px outlined Revoke or Disconnect button. Buttons are ragged on desktop (Revoke 86 px vs Disconnect 115 px). The rows are not grouped (this device / browsers and apps / computers / AI apps) and there is no count or "End all other sessions".
  - In RU on the phone, long names wrap to 4 lines and the meta to 3, so row heights run from 56 to 140 px. The section adds about 1 100 px to an already 20-section page (F-LAY-09).
  - Three "Dev login" rows differ only by IP (break-ui › Collections: identical names).
  - **Why:** HIG lists and tables › group related rows; Material lists (trailing action density); impeccable › Cognitive load (extraneous); break-ui › 1 000+ items / identical names.
  - **Fix:** group by kind with headed sub-lists; use a compact trailing text button or a row menu; add "End all other sessions"; middle-truncate names on one line with the full name on open.
  - **Shot:** `R09/settings-sessions-tall--phone-light-ru.png`, `R09/crop-desk-tall.png`.

- **09-005 · minor · Export toast · desktop, light, EN+RU · `src/features/settings/export-row.web.tsx:25`**
  - **What:** the file name uses the UTC date: `now.slice(0, 10)` on an ISO string. At 00:21 Moscow on 2 Nov the file and the toast say **pace-2026-11-01.xlsx**, while the sessions above say "Added Nov 2". The 200 px sidebar toast also breaks the name mid-date ("pace-2026-" / "11-01.xlsx").
  - **Why:** break-ui CATALOG › Time ("shows as a different day in UTC and the user's timezone"); F-CPY-04 class (formatting by hand); F-CMP-12 (toast placement).
  - **Fix:** take the date in the account zone (`formatInZone`); give the toast `overflow-wrap:anywhere` on tokens, or say "Downloaded your data (xlsx)". Pin it with a test at 00:30 in a UTC+3 zone.
  - **Shot:** `R09/settings-export-toast--desktop-light-ru.png`.

- **09-006 · minor · Running row after Attend on a long event · phone, light, RU · baseline `time-bar` row (unchanged file)**
  - **What:** Attend now routinely starts an activity named after a calendar title. An 80-character title runs under Stop and leaves an orphan dot row above it. This is F-DAT-02 unchanged, but Phase C's flow now makes it a daily path.
  - **Why:** F-DAT-02; break-ui › Labels from data.
  - **Fix:** apply F-DAT-02's row rule. Calendar-derived labels are clamped to 1 line in the bar.
  - **Shot:** `R09/now-calendar-outcome--phone-light-ru.png`.

### Lens 1: impeccable critique (Operate)

Health of the changed surfaces (Nielsen, 0–4):

| # | Heuristic | Score | Note |
|---|---|---|---|
| 1 | Visibility of system status | 3 | outcome line, export, To Inbox and signed-out now speak; the signed-out notice is styled as a tagline (09-008) |
| 3 | User control and freedom | 3 | Not me asks first; Escape cancels; To Inbox has no Undo (09-012) |
| 4 | Consistency and standards | 1 | four confirm layouts (09-003); feed and Settings describe one sign-in two ways (09-010); Danger zone styled as Log out |
| 5 | Error prevention | 3 | double-tap risk on back-to-back calendar cards (09-009) |
| 8 | Aesthetic and minimalist | 2 | button walls in sessions (09-004) and the token steps (09-011) |

Total 12/20 on the five scored heuristics (the other five are not affected by the delta).

- **09-003 · major · inline confirms · all combos**
  - **Files:**
    - `features/settings/delete-account.tsx` (bordered warn card, 1:2 full-width buttons, no Escape hint, no Escape key);
    - `features/sessions/session-row.tsx:108-136` (no card, indented `pl-11`, right-aligned on desktop, 1:2 on phone, Escape hint);
    - `features/notifications/answers.tsx:39-77` (no card, left-aligned, auto widths, `flex-wrap`, Escape hint).
  - **What:** one decision ("end this, for good?") is drawn three ways, plus Wipe's missing Escape.
  - Phase C also left the Danger zone openers as `secondary`, the same look as Export and Log out (`delete-account.tsx:167,178`): the destructive pair is now indistinguishable from the safe pair above it, separated only by a hairline and an orange 14 px heading.
  - **Why:** impeccable › Consistency; HIG buttons › Role (destructive); HIG alerts (Cancel and destructive as an equal pair); F-CMP-07 fix direction ("both in the destructive style"); F-A11Y-08 (Escape on inline confirmations).
  - **Fix:** one kit `InlineConfirm` (question as status, Cancel focused, equal-width pair, Escape on every platform that has one, the same container everywhere) and a `destructive` opener style for Wipe and Delete.
  - **Shot:** `SCR/rebaseline/states/settings-wipe--desktop-light-en.png`, `R09/settings-confirm--desktop-light-en.png`, `R09/notifications-notme-confirm--desktop-light-en.png`, `R09/settings-export-toast--desktop-light-ru.png`.

- **09-007 · minor · Not me copy · all, EN+RU · `packages/core/src/i18n/en/notify.ts:12,44-45`, `ru/notify.ts`**
  - **What:** the opener already reads "Not me — end this session" («Это не я — завершить сеанс»). The confirm then asks "End **that** session? …" with "End session": "end" three times, "this" and "that" for the same thing.
  - The confirm never names which session, and the feed holds three identical "Signed in from Dev login" items.
  - **Why:** impeccable › Recognition over recall; docs/qa.md › Copy; HIG writing (consistent terms).
  - **Fix:** opener "Not me"; confirm "End the session on {name} ({ip})? Whoever uses it is signed out at once." with [Cancel] [End session].
  - **Shot:** `R09/notifications-notme-confirm--phone-light-ru.png`.

- **09-008 · minor · Login › signed-out notice · phone + desktop, light, EN+RU · `src/screens/login-parts.tsx:37-47`**
  - **What:** the only explanation of an involuntary sign-out is a 13 px fg2 centred line directly under the 14 px muted tagline. It reads as a second tagline, with no icon and no surface. Below it the failed Telegram widget still prints serif "Bot domain invalid" (F-CMP-17).
  - **Why:** HIG alerts / feedback (an unexpected state needs a distinct, glanceable notice); impeccable › Hierarchy (the most important line is the quietest).
  - **Fix:** a kit `Notice` (info tone, icon, tinted surface) above the sign-in actions, dismissed on the next sign-in.
  - **Shot:** `R09/login-ended-elsewhere--desktop-light-en.png`, `R09/login-ended-elsewhere--phone-light-ru.png`.

- **09-009 · minor · Now › back-to-back calendar cards · phone · `features/now/calendar-prompt.tsx:136-171`**
  - **What:** after Attend, the next overlapping event's card appears at once in the same place, with its own Attend. The outcome line pushes it down only about 40 px, so a double tap or impatient re-tap can attend the second event. This switches the running activity.
  - **Why:** Nielsen 5 (error prevention); HIG buttons ("avoid placing a new action under the finger of the last one").
  - **Fix:** hold the next card for the outcome's lifetime or enter it after ~300 ms with an entrance, and ignore presses for its first 300 ms.
  - **Shot:** `R09/now-calendar-outcome--phone-light-ru.png`.

- **09-010 · minor · one sign-in, two descriptions · all · `features/notifications/notifications-screen.tsx:47-49` vs `@pace/client` `sessionRows`**
  - **What:** the feed says "198.51.100.4 · Columbus · US" (IP first, city, ISO code). Settings says "Developer sign-in · United States · 198.51.100.4" (localised country «Соединённые Штаты», no city, IP last). The same object reads differently on the two surfaces that act on it.
  - **Why:** HIG consistency; bug-lessons class 1 (one rule decided in two places).
  - **Fix:** one `describeSignIn()` in `@pace/client` used by both, with a fixed order: kind · place · address · time.
  - **Shot:** `R09/notifications--desktop-light-en.png`, `R09/crop-desk-tall.png`.

- **09-011 · minor · Add a computer › steps · all · `features/sessions/computer-steps.tsx:98,111,129`**
  - **What:** Copy the command, Copy the token and Done are three identical secondary buttons. Copy the command was demoted from primary in Phase C ("every copy button looks the same"), so the sheet has no primary action. On desktop the once-only token warning sits at the scroll edge, half under the footer hairline.
  - **Why:** HIG buttons › Prominence (one prominent action per view); impeccable › Hierarchy.
  - **Fix:** the current step's copy is primary (after copying, the next step's). Done stays secondary in the footer. The warning goes above the token, not after its button.
  - **Shot:** `R09/add-computer-steps--desktop-light-en.png`, `R09/add-computer-steps--phone-light-ru.png`.

- **09-012 · minor · To Inbox toast · phone + desktop, RU · `features/now/composer/composer-flow.tsx:114`, `ru/input.ts` `composer.toInboxDone`**
  - **What:** the toast has no Undo, although the capture is an event and revocable. The Inbox is spelled three ways in RU: tab «Входящие», toast «во входящие», log «во «Входящих»».
  - **Why:** HIG undo; F-CPY-05 class (one name per thing); docs/qa.md › Copy.
  - **Fix:** "Added to Inbox · Undo"; one RU form (capitalised destination name).
  - **Shot:** `SCR/rebaseline/states/toast-to-inbox--phone-light-ru.png`.

- **09-013 · nit · This device row · all · `session-row.tsx` + `screens/settings-screen.tsx:155`**
  - **What:** this device's row offers "Revoke" (RU «Завершить»), and 600 px below sits "Log out": the same act under two names.
  - **Why:** HIG writing (consistent terms).
  - **Fix:** label the current row's action "Log out" or drop it.
  - **Shot:** `R09/crop-desk-tall.png`.

- **09-014 · nit · sessions error line · all · `sessions-section.tsx:27-40`**
  - **What:** the indent is fixed, but "Try again" is a ghost button in fg at body size, flush with the text. It reads as a second sentence, not an action.
  - **Why:** F-CMP-06 class (ghost as text); HIG buttons.
  - **Fix:** a link-styled or small bordered retry.
  - **Shot:** `R09/pair-sessions-error-phone-ru.png`.

### Lens 2: apple-design HIG + cross-platform

- **09-015 · minor (verify on hardware) · Onboarding › battery step, Settings › BackgroundHint · Android · `src/platform/permissions.ts:111-118`, `features/permissions/use-permissions.ts:32`**
  - **What:** Allow fires `openAutostartSettings()` and then `requestIgnoreBatteryOptimizations()`. After answering the system dialog, a second unexplained OEM screen appears underneath.
  - `ids` follows `pushStore.method` live, so a registration that lands mid-walk can change "2 of 3" to "2 of 4" (or drop the current step).
  - **Why:** Material › Permissions (one request, in context, explained first); HIG onboarding › "ask for permission only when needed"; HIG modality (one modal task at a time).
  - **Fix:** the autostart page becomes its own explained step or link ("Some phones also need Autostart → Open"). Freeze the step list when the walk-through starts.
  - **Shot:** source only (web: `SCR/rebaseline/routes/onboarding--phone-light-ru.png`).

- **09-016 · nit · Settings › web push line · phone + desktop · `features/settings/notification-settings.tsx:134`**
  - **What:** the explanation of the **Web** column is a footnote under the whole channel matrix. On a phone it sits about 200 px below the column header it explains.
  - **Why:** HIG layout › proximity.
  - **Fix:** an (i) on the Web column header, or the line as the matrix caption.
  - **Shot:** `R09/settings-push-web--phone-dark-ru.png`.

- **09-017 · nit · BackgroundHint copy · Android, EN+RU · `i18n/en|ru/shell.ts` `permissions.background*`**
  - **What:** "~15 minutes" uses a tilde in UI copy. RU «проверять в фоне» has no object ("check what?").
  - **Why:** F-CPY-07 class; docs/qa.md › Copy.
  - **Fix:** "within about 15 minutes" / «в течение примерно 15 минут»; «Разрешите Pace работать в фоне».
  - **Shot:** catalog.

### Lens 3: review-animations

- **09-018 · minor · Now › outcome line · all · `calendar-prompt.tsx:24-66`**
  - **What:** the line is inserted and removed in one frame. On removal (blur or after 8 s), everything below jumps up about 40 px (phone) or 16 px (desktop), possibly under the pointer. The card swap on the same press is also a cut.
  - **Why:** STANDARDS › Valid purposes ("preventing jarring change"); Standard 1 (justified motion: here motion is *missing* where it prevents a jump); Standard 7 (if added, opacity plus a transform, not height).
  - **Fix:** the outcome replaces the card in its own slot (crossfade within the card's height, 150–200 ms ease-out), so nothing below moves. Removal fades, and the slot collapses with a layout transition.
  - **Shot:** `R09/now-calendar-outcome--desktop-light-en.png`.

- **09-019 · nit · inline confirms open and close · all · `session-row.tsx`, `answers.tsx`**
  - **What:** opening a confirm grows the row by 70–110 px in one frame. Ending a session removes the row in one frame (F-MOT-02 class, now in a list of 16).
  - **Why:** Standard 1 / STANDARDS › Cohesion; Standard 9 (deliberate destructive actions may take a beat; system responses snap).
  - **Fix:** the kit `InlineConfirm` (09-003) owns a 160–200 ms ease-out height and opacity reveal, honouring reduced motion (opacity only). The list uses the shared row-collapse.
  - **Shot:** `R09/settings-confirm--phone-light-ru.png`.

### Lens 5: a11y

axe found 0 violations on the five changed screens (`R09/log.json` `axe-*`). Labels, names and focus moves were checked by probe:
- sheet named "Add a computer" / «Добавить компьютер»;
- focus after token creation → the chosen OS radio;
- focus after Attend → the outcome status;
- Escape on the Not me and session confirms → focus back on the opener;
- the remote sign-out lands on `/login` with a `role=status` line.

- **09-020 · minor · outcome line + Insights region (new focus targets) · desktop + phone, both themes · `calendar-prompt.tsx:47-60`, `src/ui/screen.tsx:48-52`**
  - **What:** both new focus targets get the browser's 1 px `auto` ring (rgb 16,16,16 / 238,238,238).
    - On Now it is a square box hugging two lines of 13 px text, touching the composer above and the filter chips below (no `mt`).
    - On Insights it draws round the whole 880 × 810 column. Its bottom edge is off-screen, and focusing scrolls "27m tracked" under the header.
  - **Why:** WCAG 2.4.7; 2.4.13 (focus appearance, AAA guidance used by the spec); F-A11Y-01 (no designed focus state), now with two more instances.
  - **Fix:** the spec's focus token (2 px, offset, radius) for every `tabIndex` target. For the region, use an inset ring or a "focused" header hairline instead of a column outline, and add `mt-3` to the outcome line.
  - **Shot:** `R09/now-calendar-outcome--desktop-light-en.png`, `R09/insights-region-focus--desktop-light-en.png`.

- **09-021 · minor · document titles · web · `src/platform/route-title.ts:11,17,21`**
  - **What:**
    - every task reads "Task · Pace" (history entries indistinguishable);
    - a single project reads "Projects · Pace";
    - login reads "**Sign in to Pace · Pace**";
    - an unknown route reads "Pace".
  - **Why:** WCAG 2.4.2 Page Titled (the title describes topic or purpose); F-WEB-01 fix direction ("task screens use the task title as user content").
  - **Fix:** a title provider per screen: the task or project title (user content, untranslated) then "· Pace"; login "Sign in · Pace"; not-found "Not found · Pace".
  - **Shot:** `R09/log.json` keys `title-/task/…`, `title-/project/…`, `signedout-title-*`.

## Status of the baseline F-ids where Phase C touched the files

| F-id | Status | Evidence / note |
|---|---|---|
| F-WEB-01 page titles | **partly fixed** | per-route "Screen · Pace" in EN/RU; task, project, login and not-found are wrong (09-021) |
| F-WEB-02 document follows OS | **partly** | `color-scheme` now follows the app theme after hydration (`document-head.web.tsx:23`); `theme-color`, body background, first-paint flash and manifest unchanged |
| F-CMP-07 danger zone quiet | **partly** | Delete no longer reads as disabled and is set apart by a rule; but both are `secondary`, identical to Export/Log out, the opposite of the fix direction (09-003) |
| F-CMP-03 empty form shows error | **fixed** | `task-fields.tsx:191-212`; `SCR/rebaseline/states/sidebar-new-task--desktop-light-ru.png` |
| F-CPY-02 Approve toast "Done" | **fixed (source)** | `use-pending-actions.ts` `doneLines`; not re-shot. Many approved actions join with "; " into one long toast (unverified) |
| F-CMP-12 feedback placement | **partly** | To Inbox now toasts (12 L10); placement unchanged (desktop x 12, ~1 000 px from Export) and two more toasts use it (09-005) |
| F-MOT-11 toast motion | unchanged | more callers |
| F-A11Y-07 dialog name / backdrop stop | **partly** | sheets named via `aria-labelledby` (probe: `dialog "Add a computer"`); the backdrop Pressable is still a Tab stop (`sheet.tsx:38`) |
| F-A11Y-08 inline confirm Escape / focus | **partly** | session-row and Not me confirms take Escape and return focus; Wipe/Delete and New project still ignore Escape |
| F-A11Y-01 focus state | unchanged, **+2 instances** | 09-020 |
| F-A11Y-19 decorative icons | **partly** | session-kind icon and token warning icon now `aria-hidden` |
| F-DAT-02 text never shrinks | **partly / new instance** | session names and meta wrap now; IPv6 meta overflows (09-001); running row unchanged (09-006) |
| F-DAT-11 identifying end cut | **partly** | session names wrap whole (no cut); the server picker is untouched |
| F-WEB-06 pull-to-refresh | **partly** | sheet body `overscroll-contain` (`sheet.tsx:113`); root and lists unchanged |
| F-CMP-02 sheet handle / no close on phone web | unchanged | Add-computer steps gain a sticky Done; generic sheets still have no visible close at 390 px |
| F-MOT-05 sheet exit in one frame | unchanged | `sheet.tsx` has `entering` only |
| F-LAY-09 Settings is one long page | **made worse** | +push line, +BackgroundHint, sessions list unbounded (~1 100 px with 16 rows on phone RU) |
| F-CMP-06 button geometries | **mixed** | Settings bottom now consistent (pair or full width); confirms add three new layouts (09-003) |
| F-LAY-13 scroll edges | unchanged | Settings pills still cut under the title (`SCR/rebaseline/scroll/settings-3--desktop-dark-en.png`) |
| F-CMP-17 login widget serif | unchanged | `R09/login-ended-elsewhere--*` |
| F-WEB-04 tooltips on touch | unchanged | To Inbox tooltip still pops on tap above the toast (`SCR/rebaseline/states/toast-to-inbox--phone-light-ru.png`) |
| F-COL-07 accent meanings | unchanged | the OS picker's chosen segment is a saturated indigo fill |
| F-CPY-04 hand formatting | **new instance** | export filename date in UTC (09-005) |
| F-CPY-05 one name per thing | **new instance** | Inbox × 3 in RU (09-012); "Revoke" vs "Log out" (09-013) |
| F-CPY-07 typography | **new instance** | "~15 minutes" (09-017) |
| (no F-id) calendar card focus, QA 15/16 | **fixed** | focus → outcome status, never the next card's Attend (probe) |
| (no F-id) sessions list stale, QA 15 M1 | **fixed** | reloads on return and on sign-in notices |
| (no F-id) Delete reads disabled, Done scrolled away, token warning red | **fixed** | see rows above; Done in footer; warning in fg2 with a warn icon |

Every other F-id is outside the delta: no Phase C UI file overlaps it.

## New components and screens the spec must cover

1. **InlineConfirm** (kit): question as status, equal-width Cancel and destructive pair, Escape, focus contract, container, motion. Used by session rows, Not me, Wipe, Delete and New project.
2. **Sign-in notice** in the feed. States: open (Not me), own ("This device", no actions), ended elsewhere (settled "revoked"), resolved, failed. Meta line order shared with Settings.
3. **Session row and Devices list**: kind, name (wrap or middle-truncate), meta parts, trailing action, loading skeleton, error and retry, grouping, many rows, "End all others".
4. **Add-a-computer flow**: name step, then token steps (OS segmented picker, code blocks, copy buttons, once-only warning) and a **sheet footer slot** (sticky Done).
5. **Outcome line** ("settled card"): what replaces an answered card (calendar Attend/Skip, feed answers), its focus, duration and motion.
6. **Signed-out notice** on login (and a general `Notice` component: info, warn, error).
7. **Battery / background step** in Android onboarding, plus **BackgroundHint** in Settings › Notifications (with the OEM autostart sub-step).
8. **Web notifications explainer** in the channel matrix (Web column).
9. **Toasts with content**: export done (file name), Added to Inbox (+ Undo), multi-action Approve summary. Placement and length rules.
10. **Focusable scroll region** (Insights): its focus appearance.
11. **Document title** pattern (screen title or user content · Pace).
12. **Automatic sleep** with no Day card: its four Assistant-log lines (`decisions.sleep.*`, up to 80 chars RU) and how an automatic entry looks on Day and Week.

## What this says about the system

- **Fixes land per surface because the kit has no pattern for them.** Every QA item became a local layout. Confirm, notice, outcome line and the footer action each exist two to four times. The spec has to ship `InlineConfirm`, `Notice`, `OutcomeLine` and `SheetFooter` as kit parts with tests, or Phase D repeats this.
- **"Text from data" still has no row policy.** New code wrote `shrink` and comments promising "never cut", and the first IPv6 address broke it. The guard has to be structural: a `MetaLine` / `DataText` primitive with `min-w-0` and anywhere-wrap, plus an e2e sweep that injects the break-ui catalog (IPv6, unbreakable names, 80-char RU) into every list.
- **Destructive emphasis is a token question, not a per-screen choice.** Phase C made "consistent" mean "same variant as neighbours", and the danger zone lost its meaning. The spec needs a `destructive` role (opener and confirm) distinct from `danger` text.
- **Focus moves are now correct, but the focus look is still undesigned.** Every new `tabIndex` target inherits the browser ring. One focus token in the kit fixes F-A11Y-01 and 09-020 together.
- **State changes are cuts.** Cards swap, lines appear and go, rows grow and vanish in one frame. Motion has to be owned by the components above (slot crossfade, height reveal, row collapse), not added per call site.
- **One object, two describers.** The sign-in meta and the Inbox name are spelled per surface (09-010, 09-012). Descriptions belong in `@pace/client` and `t()`, decided once.
- **Time and zone remain hand-formatted at the edges** (export filename). Any date that reaches the person goes through the zone-aware formatter, with a property test across midnight in UTC+3.
