# QA round 6 (exploratory, web build)

Tester: Sonnet QA agent, 2026-10-13 (device timezone Europe/Moscow, "now" about 00:00-00:30, so a few screens sit across midnight). Build: fresh `build:web` of HEAD `09a63a3` served on :4173 against the local Worker on :8787 (`LLM_PROVIDER=fake`, `ENVIRONMENT=test`), clean working tree. Chromium on Linux (shortcuts read Ctrl, not the Mac symbol).
Accounts: 6001-6030 (`seedLivedIn`, Russian, several times reset) and fresh English accounts. Both themes, 1440x900 and 390x844 (touch, `isMobile`), plus 320x640, 360x740, 768x1024, 1024x768, 1920x1080 for the time bar.
Screenshots and scripts: `/tmp/claude-0/-home-user-pace-dev/bc41968d-6fd9-550c-a37e-c7227df2b314/scratchpad/qa6/` (`shots/`, `scripts/`); in the findings `shots/x.png` means that folder.
Coverage: all routes of the route sweep (26 URLs incl. `/app/login`, `/app/auth`, `/auth`, `/oauth/authorize`, `/no-such-page`) at 1440 and 390, light and dark, RU lived-in and EN fresh (208 page loads; each with axe WCAG 2.2 AA, console errors, failed requests, horizontal overflow, raw-key scan, target sizes; shots `shots/sw-*.png`); a click-through of every visible button/link on 12 screens at both widths (no crash, no console error); the new Calendar button in every state (loading-less greyed, tap toast EN/RU at 1440 and 390, keyboard Enter, the menu by ⋯, right click and a mouse hold, one event near, two events near, an event 14 min away, a meeting without an event, the read failing, an event arriving while the page is open); `/app/login` signed in and out at both widths (tab order, both links, reload); the bot login with `?from=web` (the request is `POST /api/auth/nonce?from=web`, confirmed); deep links and reloads (`/task/<id>`, unknown ids, query and fragment, signed out, offline reload); the composer (typing, paste-like fill, Enter, second Enter, Escape, focus, the manual chevron form); the task page (check-off, slider by keys, edit sheet at 1440x520, close sheet, project picker); time-bar sheets (Rest, Sport, Chores, Calendar) and the typed activity; Day, Week, Projects (create, open, edit), History (revoke), Inbox (Alt+Enter, Accept), Devices (add a computer, EN and RU), Settings; Tab order and focus rings; a translation scan of 21 routes in both languages (Latin-only lines on RU screens, Cyrillic on EN screens: none except user content).
Limits: fake LLM; no Mac; Android-only changes (permissions walk-through, restricted settings, crash files, APK size) and the crash screen itself (nothing throws on the web) not seen; the Telegram widget could not load on `localhost` ("Bot domain invalid", a third-party iframe) so the real bot round trip was not run; the update card was not re-checked.

## 1. Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 1 |
| medium | 6 |
| low | 16 |
| cosmetic | 4 |

The entry file and the polyfills are clean: the app starts, every route loads by a direct URL and by reload, `/task/<id>` deep links work, the service worker serves the shell offline, and there is no console error and no failed request on any screen (only a warning on right click, QA6-17). The `?from=web` nonce is sent. No raw key and no untranslated line on any screen in either language; the `devices.*` move left nothing behind. The new Calendar button works end to end (one near event starts at once, several open the picker, the menu lists today's events). The big problem of this round is its explanation: the toast that says what the greyed button does and why not now is cut off in the middle on every width and in both languages, so the "why" is never readable (QA6-1). Next come three smaller contradictions around the same button and sign-in (QA6-2, QA6-3, QA6-4), and three older owner-facing gaps that are still open (QA6-5 to QA6-7).

## 2. Findings (most severe first)

### High

**QA6-1 (high) The Calendar button's toast is cut off mid-sentence: the reason "why not now" is never visible, and the toast covers the button it explains.**
Now, 1440x900 light EN, 390x844 dark EN, 390 and 1440 RU (all). Steps: sign in on a fresh account (no calendar sent), tap the greyed "Calendar" / «Календарь» (or focus it and press Enter). Happened: the toast holds `time.calendar.what` + the reason (about 150 characters) but `ToastBar` renders it with `numberOfLines={2}`: at 1440 (480 px toast) EN shows "...There is nothing in the calendar within 15 minute..." with a third line peeking under the box; at 390 EN the middle is replaced by an ellipsis ("There is ... nothing in the calendar within 15 minutes of now" half clipped); in RU the second sentence is lost entirely ("«Календарь» запускает встречу из календаря, которая идёт сейчас или в пределах 15 ..." at 390 and 1440). With no access the Permissions action is shown but the sentence that explains it is again clipped. The toast sits over the time bar (QA5-23 still open): at 390 it covers the text field and the Calendar button itself; it vanishes after 4.9 s, shorter than the time to read 150 characters. In dark mode on the phone its surface is barely different from the page. Should: the whole message visible (no line limit for this toast, or a shorter text: one sentence, as asked: "Starts the meeting that is on now or within 15 minutes. Nothing near now."), above the time bar, shown long enough (about 8 s for 150 chars). Evidence: `shots/cal-d-toast.png`, `shots/cal-p-toast.png`, `shots/cal-ru-d-toast.png`, `shots/cal-ru-p-toast.png`, `shots/cal-noaccess-p.png`.

### Medium

**QA6-2 (medium) While a meeting runs, the greyed Calendar button is "on" but washed out, and a tap on it stops the meeting silently.**
Now, 1440 light EN (also 390). Steps: ⋯ on Calendar -> "Start a meeting without an event" (the activity "Meeting" starts); look at the button; tap it. Happened: the button turns blue (selected, `aria-checked=true`) but keeps the greyed 0.6 opacity because no event is near: the label is nearly invisible; a tap neither explains nor stays: it ends the meeting with no toast (the row "Meeting 0m Stop" disappears). The rest of the new design says a greyed button only explains. Should: not greyed while its own activity runs (or a tap gives the same toast and stops only through the Stop button). Also two ways to stop the same thing (the button and "Stop"). Evidence: `shots/cal5-a.png`, `shots/cal5-b.png`.

**QA6-3 (medium) On the web the "no access" toast sends the person to a page that says no permission exists.**
Now, 1440 and 390, RU (EN identical). Steps: with the Worker unreachable or `/api/calendar` failing (offline, a 500), reload and tap Calendar. Happened: `calendarToday` turns any failed read into `access: "denied"`, so the toast says «У Pace пока нет доступа к календарю: разрешите его в «Настройки → Разрешения»» with a «Разрешения» action; the action opens `/permissions`, which says «Браузеру разрешения не нужны. Уведомления, календарь и экранное время настраиваются в Pace на телефоне с Android.» Should: on the web a failed read says "The calendar could not be loaded" (no Permissions action), as "loading"/"offline", not "no access". Evidence: `shots/cal-noaccess-d.png`, `shots/cal-perms-d.png`.

**QA6-4 (medium) Signed out, most deep links open an empty shell instead of the login: a task link says "This task does not exist."**
390 and 1440, light, EN. Steps: open `/task/<a real id>` (a link from a notification or the bot) in a browser that is not signed in, or after the session expired. Happened: no redirect; the page shows "No project | This task does not exist." (no sidebar on the phone). The same for `/project/<id>` ("Project not found."), and `/week`, `/inbox`, `/history`, `/presets`, `/devices`, `/permissions` render with empty data ("Nothing in Pace yet at that moment."). `/`, `/day`, `/settings`, `/projects`, `/add` do redirect to `/login`. Should: every signed-in screen redirects to `/login?next=<path>` (the login already honours `next`), so the person lands on the task after signing in. Evidence: `shots/out-390-taskABC.png`, `shots/out-1440-taskABC.png`.

**QA6-5 (medium) History: one tap on «Отменить» revokes an event for good, with no confirmation and no way back.**
`/history`, 1440 light RU. Steps: tap «Отменить» on «Активность начата · Музыка». Happened: at once the row turns «Отменено», a new top row «Исправление: отозвано» appears, the running activity is gone; no toast, no Undo, and the correction row itself has no button (a revocation cannot be revoked). The button is a plain text link repeated on every row (also the label is unclear next to the "Cancelled" task status, QA5-27). The delete button on the task page has "Deleted · Undo"; this one is the same kind of action. Should: "Event undone · Undo" toast or a confirmation, and a clearer label ("Revoke" / «Отозвать событие»). Evidence: `shots/hist-after-revoke.png`.

**QA6-6 (medium) The owner asked not to show "recorded" when it equals the event time; the Close sheet still shows it.**
Task page -> "Cancel or skip task…", 1440 light EN. Happened: the preview reads "Outcome Cancelled / Recorded 00:20 · happened 00:20" (identical times). The owner's message of 2026-10-08: «если время не отличается от времени recorded в евент логе нет смысла показывать recorded». Should: show "Recorded ... · happened ..." only when they differ (otherwise one time), and drop the jargon (QA5-26). Evidence: `shots/task-close.png`.

**QA6-7 (medium) Ticking a task off still cannot be undone (QA5-5 is open).**
Now, 1440 EN. Steps: add three tasks, tick the first circle. Happened: the row dissolves and is gone, no toast and no Undo (`getByRole("alert")` stays empty); deleting a task has one. Should: "Done: X · Undo". Evidence: `shots/task-tick-1.png`.

### Low

**QA6-8 (low) The Calendar button does not notice an event that arrives while the page is open.**
Now, 1440, EN. Steps: open Now; the phone sends an event running now (`POST /api/calendar/sync`); wait 40 s. Happened: still greyed (opacity 0.6) after 5, 20 and 40 s and a tap still says "nothing within 15 minutes" (the read happens on mount and at every ten minutes of the clock, not on tap, focus or the live-sync "changed" message); after a reload it is live (opacity 1). Should: re-read on tap (and on window focus) before saying "nothing now".

**QA6-9 (low) The greyed state is only an opacity: contrast 2.58:1 (light) and 2.73:1 (dark), and a screen reader hears "Calendar, switch, off".**
Now, all widths, both themes (axe `color-contrast` serious on `/` and `/add` in every sweep run). The button is `role="switch"` with `aria-checked=false` and no `aria-disabled` or description, so the reason is only in the toast, and it stays a Tab stop. Should: `aria-disabled` plus a description of the reason (or a real "unavailable" look that keeps 4.5:1 for the label), and not a "switch" for a command. Evidence: sweep results, `shots/cal-d-timebar.png`.

**QA6-10 (low) `/app/login` ("Back to Pace"): a dead button on a computer, a statement that may be false, a hard-coded host.**
1440 and 390, both themes, signed in and out. Happened: (1) "Open Pace" is an `intent://pace.nalinor.dev/app/login#Intent;...` link: on a computer (and any non-Android browser) a click does nothing visible (`net::ERR_ABORTED`, the page stays), and the host is fixed to production, so on another domain the button targets the wrong app link; the intent has no fallback URL if the app is not installed. (2) The text says "You are logged in" to a browser that is signed out (e.g. Telegram's in-app browser); its second button "Use Pace in the browser" then lands on the login form. (3) The link target is 16 px high. (4) A signed-in computer shows the screen with the sidebar (it is not in the bare list, unlike `/app/auth`). (5) RU has two near-identical labels «Открыть Pace» and «Открыть Pace в браузере». Should: hide or explain the button off Android, add `S.browser_fallback_url`, say "Login done in Telegram" instead. Evidence: `shots/applogin-out-d.png`, `shots/applogin-in-d.png`, `shots/applogin-out-p.png`.

**QA6-11 (low) The language ignores the browser and the account: login screen always English, `<html lang="en">`, every title "Pace".**
Login, 1440 and 390, a browser with `ru-RU`: the sign-in screen is English (the language is read from the account after sign-in; a Russian-speaking person's first screen is English). On the Russian account `document.documentElement.lang` stays `en` (screen readers read Russian with the English voice) and `document.title` is "Pace" on every route (tabs and browser history are indistinguishable). Should: `navigator.language` as the signed-out default; set `lang` and a per-screen title.

**QA6-12 (low) RU "Календарь" is cut to "Календ..." at 320 px.**
Now, 320x640 light RU. The new one-line label is wider than the 68 px button (the tab labels «Аналитика» and «Настройки» also touch each other). At 360 and up it fits. Should: allow the font to shrink, or the buttons to use the width the ⋯ takes. Evidence: `shots/size-320-crop.png`.

**QA6-13 (low) The time bar's field has no visible focus (QA5-7 fixed for the composer only).**
Now, 1440 light. Clicking "What are you doing?" / Tab: `outline: none` and the card does not change. Evidence: `shots/kbd2-timefield-focus.png`.

**QA6-14 (low) The progress slider still moves in 10% steps (QA5-9).**
Task page, 1440: ArrowRight 0% -> 10% -> 20%; `<input type=range max=10 step=1>`. The owner asked for percent.

**QA6-15 (low) The manual form shows an error before anything was typed.**
Now, 1440 dark RU and 390 light RU: the chevron next to the line opens "Проверьте перед добавлением" (nothing was read, nothing to check) with the Title in red «Дайте задаче название.» and Create looking disabled. Should: no error on an untouched field; a header like "New task". Evidence: `shots/sh-d-composer-open.png`.

**QA6-16 (low) Create and edit project are inline forms with Cancel (QA5-21 is open).**
`/projects` and `/project/<id>`, both widths: "New project" and the pencil unfold a card with Cancel/Create or Cancel/Save instead of a sheet. Also the colour palette still has two near yellows. Evidence: `shots/day-d-newproject.png`, `shots/proj-edit.png`.

**QA6-17 (low) Every right click on a time-bar button logs a console warning.**
Now, 1440 EN: right click on Rest, Sport or Calendar prints `[warning] Cannot record touch end without a touch start.` (react-native-web's responder; the menu itself opens fine, and so does a mouse hold of 800 ms). Not an error, but the console is otherwise clean.

**QA6-18 (low) Week on a phone cuts the week at Thursday with no cue; the scroll area is not keyboard reachable.**
`/week` 390 EN: columns Mon-Thu are visible, "16 Fr" is half cut, Sat and Sun need a sideways scroll nobody hints at; axe `scrollable-region-focusable` (serious) on the empty week at both widths. Evidence: sweep `sw-en-p-light-_week.png`.

**QA6-19 (low) Insights: an empty chart without a message, a word broken mid-word (QA5-24 is open).**
`/insights` 390 RU: "Фокус по часам дня" is a blank frame, "Переключени/й в день" still wraps inside a word. Evidence: `shots/sheet-ru-p-light-0.png`.

**QA6-20 (low) Menus with one option, and a vague label.**
Now, 1440 EN: right click or ⋯ on Rest opens a dialog whose only item is "Rest ~30m" (the "Alongside what is running" switch only exists when something runs); the Calendar menu's second item "Calendar from the phone" does not say it opens Settings → Devices (it leads to `/devices`). Should: no menu when it adds nothing; "Set up the phone's calendar".

**QA6-21 (low) The Calendar button and the Attend/Skip card do the same job for the same event.**
Now, 1440 light EN with an event running: "Daily standup 23:59-00:29 [Attend][Skip]" on top and the now-active Calendar button below both start it. One way per job (docs/qa.md). Evidence: `shots/cal3-d-one.png`.

**QA6-22 (low) Inbox gives no feedback.**
`/inbox`: Alt+Enter on the line only bumps the small counter; "Accept" turns a note into a task and the list just says "Nothing to sort." (no toast, no link to the task); the explaining paragraph ("Accept takes a note as a task with the guess under it (you can edit it on the task); Delete drops it.") is heavy. Evidence: `shots/inbox-1440-accepted.png`.

**QA6-23 (low) Keyboard: nine sidebar stops before the content, every ⋯ a stop (QA5-15).**
Now, 1440: Tab goes New task, 8 nav items, Inbox, the line, ... and 8 stops in the time bar (4 buttons and their 4 ⋯), the greyed Calendar included. No skip link.

### Cosmetic

- **QA6-24** Content widths differ by screen at 1440: Settings 560 px, Day 560, Devices 840 left-aligned, Inbox full width with a heading without Back; the Back chevron exists on Devices/History/Presets and not on Inbox.
- **QA6-25** Sign-in-adjacent screens disagree: `/auth` is bare text with a button, `/app/auth` a card with a large logo, `/oauth/authorize` a card with a small left logo, `/app/login` a card with a large logo.
- **QA6-26** The task page tags show "Normal · In progress" but not the category ("Personal") the Now row shows (QA5-25); the composer form's two hint lines ("Enter adds the task, Esc folds the form back." and "Read by the assistant...") repeat each other and the second is indented 4 px.
- **QA6-27** Add a computer: the "Lost it? ..." note is in warning orange, the only orange on a calm screen; two computers with the same name can be added without a word.

## 3. UX heuristics walked (docs/qa.md)

- Every control earns its place: breaches QA6-20 (menus with one option), QA6-21 (two buttons for one event). The lone filter chip and Back-next-to-dismiss are gone.
- One way per job: QA6-2 (button and Stop), QA6-21.
- Platform conventions: dialogs centred with a cross at 1440, bottom sheets on the phone, Escape and dim close them (Calendar, Rest, Sport, Chores, Close, Edit, Project, Add a computer all checked); breach: inline forms with Cancel (QA6-16), and the toast over the time bar (QA6-1).
- The keyboard on a computer: Enter reads, Alt+Enter Inbox, Esc folds and the cursor returns to the line (fixed since round 5), N opens `/add` from Day and Settings, Ctrl+Enter, F shown on buttons; breaches: QA6-13, QA6-23.
- State you can see: the greyed state is visible but not readable as a state (QA6-9) and not honest while its activity runs (QA6-2); the dashed draft and tag colours are fine.
- Feedback and motion: QA6-7, QA6-5, QA6-22 (silent actions).
- Copy: QA6-1 (two clipped sentences, the first awkward: "Calendar starts the meeting from your calendar that is on now"), QA6-3 (wrong remedy), QA6-6 (jargon), QA6-10 ("You are logged in" to a signed-out browser).
- Color: one indigo accent; QA6-27 only.

## 4. Owner requests not (fully) met

| Request | Status | Evidence |
|---|---|---|
| Hide "recorded" when it equals the event time (2026-10-08) | not met in the Close sheet | QA6-6, `shots/task-close.png` |
| Progress "in percent" (feedback 3) | partly: 10% steps only | QA6-14 |
| Undo for mistakes ("Ничего не теряется"; the delete has Undo) | partly: check-off and history revoke have none | QA6-7, QA6-5 |
| Calendar button: "one line", "a tap on the greyed one says what it does and why not now" (this round) | partly: one line except at 320 RU; the explanation is clipped | QA6-1, QA6-12 |
| Forms as sheets, no Cancel (feedback 3 convention) | partly: project forms inline with Cancel | QA6-16 |
| Interface in the owner's language | partly: sign-in and `lang` ignore it | QA6-11 |
| Telegram bot "Return to Pace" lands usefully | partly: the landing page's button is dead outside Android and its sentence can be untrue | QA6-10 |
| Everything else of feedback 2 and 3 checked this round (palette, tabs with names, composer in place with focus back, dialogs, tag colours, hotkeys on buttons, Chores/Sport pickers, parallel activity by ⋯/right click/hold, Attend/Skip, typed activity) | met | screens above |

## 5. What works well

- The new entry file is invisible: no console error, no failed request, deep links, reloads and offline shell all fine; `?from=web` is on the nonce call.
- The Calendar button's logic is right where it can be seen: one event near starts at once, several open a picker, an event 14 minutes away counts, "ended long ago" and "far away" do not; the menu always lists today and offers a meeting without an event.
- Translations: nothing raw, nothing mixed in either language on 21 routes; the moved `devices.*` strings render in both.
- Round 5 fixes hold: the composer's focus ring and cursor after Escape, the form's Create at the top, tab bar captions, 44 px targets (the target scan finds none under 44 on the phone), the toast for delete, live sync, the week blocks' height, "Work left" wording.
- Dark theme is consistent on every screen; contrast is clean except the new greyed button.

## 6. Resolution (PR 41)

Fixed before the release: QA6-1 (shorter Calendar text, toast up to three lines and on screen
about 60 ms a character), QA6-2 (the Calendar button is on, not greyed, while its own activity
runs), QA6-3 (a failed read on the web is "nothing near", not "no access"), QA6-8 (a tap on the
greyed button reads the calendar again), QA6-9 (contrast: no opacity, a dashed border), QA6-10
(off Android one button leading to the site; the intent takes the page's host and falls back to
the site; "Telegram has confirmed the login"; a 44 px link; distinct RU labels; no sidebar).
Left open, not from this PR: QA6-4..7 and the older QA5 items, as follow-ups.
