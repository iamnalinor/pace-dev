# Exploratory QA in a browser

Tests prove what they check; this pass finds what nobody thought to check — anything broken,
weird, inconvenient, inconsistent, ugly, slow or badly worded. A cheaper model (Sonnet) acts as
a demanding user and clicks through the **web build** with Playwright, then writes a report.
Round 1 is in [`context/qa-round-1.md`](../context/qa-round-1.md) (34 findings, nothing found by
the test suites).

What a round looks at was cut down on evidence: how the 45 medium-or-worse findings of rounds
10–20 were found is in [`context/qa-optimisation-analysis.md`](../context/qa-optimisation-analysis.md).
Half of them came from checking the previous round's fixes and looking hard around each change;
the scripted matrix (every route × width × theme × language, for console errors, failed requests,
raw keys, overflow and axe) found one medium in eleven rounds and nothing in the last three. That
matrix is now an e2e test, and a round no longer scripts it.

## Two kinds of round

- **Intermediate round**: after a wave of fixes (the previous round's findings, a feedback
  round's changes, a reworked form or screen). Scoped to what changed, by the rules below.
- **Release round**: before every release. Everything, as described under "Release round".
- Again after a round's findings are fixed: an intermediate round, until only cosmetic findings
  are left. A release round that finds more than cosmetics is followed by intermediate rounds,
  and the release waits for them.
- **A server-only change still gets an intermediate round** over the screens that call what
  changed: a server rule broke the client in a way only the round's network log saw (round 15 H1,
  a read sent ~70 times a second; bug-lessons class 1). It may skip the round only when the route
  sweep's quiet window (below) covers every route that calls the changed server code and the
  review brief carried "trace the client side"; say so in the brief or the pull request, naming
  the routes.

## What the e2e suite already sweeps

`e2e/route-sweep.e2e.ts` opens every route file under `apps/app/app` (a new screen is covered
without anyone adding it) at 390 and 1440 px, in the light and the dark theme, on a lived-in
Russian account (`seedLivedIn`) and on a fresh English one, and fails on: a thrown error or
`console.error`; a request that fails or is answered 4xx/5xx; a blank page or the crash screen; a
wrong landing URL; a desktop screen without the sidebar; a raw message key; text wider than its
box, out of its button, cut to a sliver or a word broken across lines; a page that scrolls
sideways; a serious axe violation; and, once the screen has settled, any request or socket frame
sent twice within two seconds. `e2e/sync-state.e2e.ts` holds the first pull of every route and
fails on empty copy, zero totals, account values drawn from defaults or a write; and
`e2e/sheet-focus.e2e.ts` opens every sheet in the registry (`apps/app/src/ui/sheet-names.ts`) and
checks where the keyboard lands. **A round does not script these again**: it runs
`bun test:e2e route-sweep sync-state sheet-focus` against its own stack if it wants the list,
and spends its time looking at the screens with its own eyes.

## Intermediate round

1. **Every fix of the previous round**, each checked the way it was found, then its class swept:
   the same mistake on the other screens, forms and entry paths (bug-lessons "every bug teaches a
   class").
2. **Explore hard around each change**: the changed screens and flows, their edge cases, the
   states they pass through (loading, first sync, offline, error), the transitions in and out.
3. **The scope**, all of it at 390 and 1440 px:
   - the **always-on set**: Now with the task pane (and its Done, close and other-times flows),
     Settings, the shell (sidebar, tab bar, bell, toasts), signing in;
   - the **changed screens** (from `git diff --stat` by feature folder and route);
   - the screens that **read changed data**, by rule (the import graph cannot see these):

     | What changed | Also in scope |
     |---|---|
     | the assistant or parsing (composer, time bar, Telegram previews) | `/decisions` (the assistant's log) and History |
     | sync, the store, first sync, offline | every data route, in the first-sync and offline states |
     | a server rule (what may be read, answered, revoked; an error code) | every screen that calls it, with the network log open |
     | settings or presets | every screen that reads them (Day and Week for night hours, Now for presets) |
     | an app-wide rule (first sync, focus after a swap, Escape, tooltips, toasts) | every route or sheet; prefer extending the generic e2e sweep over doing it by hand |
4. **The keyboard pass** (Tab, Enter, Escape, focus after a swap) and **the heuristics walk**
   (below) over that scope.
5. **Every changed form from every entry path** in the table at the end, submitted from each.
6. **Language**: Russian is the main language of exploration (the lived-in account). English
   only for a fresh account (empty and first-run states) and for a Russian account in an English
   browser (first sync, the account's language arriving).
7. **Theme**: explore in light; take one dark screenshot of each changed screen and look at it.
8. **Last round's open lows**, given as a list in the brief: confirm each in one line (still
   there or gone), re-judge its severity against the owner's feedback, do not re-investigate.

## Release round

Every screen at 390 and 1440 px, in both themes, in Russian and English; the owner's scenarios in
`context/feedback-*.md` and the plan's scenario table; every form, sheet, picker and button; every
form from every entry path in the table below; the keyboard; empty, loading, error, first-sync and
offline states; the heuristics walk on every screen; and every owner request still not met. The
e2e sweep above stands in for the scripted matrix here too.

## How

1. Launch an agent with `model: "sonnet"` (background), using the prompt below. It must not
   change product code: it only writes `context/qa-round-<n>.md` and keeps its scripts and
   screenshots in the session scratchpad.
2. While it runs, run a code review of the branch in parallel (a second agent reading
   `git diff origin/main...HEAD` for real defects: security, data, logic, hooks). It finds what QA
   never does (races, one-shots, cut connections), and the other way round.
3. Fix the findings with TDD (a failing unit/app/e2e test first where the bug is testable),
   commit in batches, then launch the next round.
4. Before a batch PR (and before any QA round of a design batch), run the **full** `bun test:e2e`
   on a fresh build: every file and every project, latency included (a failure in `chromium`
   leaves `latency` unrun, which is not a pass). A task may run only the files it touched, but a
   change to shared classes, tokens or a kit component reaches screens no subset visits
   (bug-lessons class 11, mirrors, and 61: after Task 2.2 only subsets ran, and three failures
   waited for the batch's end).

## The prompt (fill in the round number, its kind, what changed, the fixes and the open lows)

> You are an exploratory QA tester for Pace (repo at the working directory; the UI is one
> Expo/react-native-web app in `apps/app`, the API a Cloudflare Worker in `apps/api`). Click
> through the WEB app in a real browser like a demanding user and find everything that is
> broken, weird, inconvenient, confusing, inconsistent, ugly, slow or badly worded. Be concrete.
>
> Rules: do not modify the repository except creating `context/qa-round-<n>.md`; no commits.
> Scripts, screenshots and temp files go to the session scratchpad. Bun only. Chromium is at
> `/opt/pw-browsers/chromium` (`import { chromium } from "@playwright/test"`, launch with that
> `executablePath`; never `playwright install`).
>
> Start the stack as `playwright.config.ts` does, in the background: the Worker with a fresh
> `--persist-to .cache/qa-state`, `--var ENVIRONMENT:test --var LLM_PROVIDER:fake`, an
> `ALLOWED_TELEGRAM_IDS` list with ids of your own; the web with `EXPO_PUBLIC_API_URL` and
> `EXPO_PUBLIC_DEV_LOGIN=1`, `build:web` then `serve:web dist 4173`. Sign in and seed as
> `e2e/support/login.ts` and `e2e/support/seed.ts` (`seedLivedIn`: a Russian lived-in account) do;
> also use a fresh English account. Put the token in once per tab, as `loginViaApi` does (an init
> script guarded by a `sessionStorage` mark): an init script runs again on every reload and
> navigation, so after a Log out it signs the revoked token back in, and the 401s and the "ended
> on another device" line that follow are the script's, not the app's (QA round 18 R18-02).
>
> **This is round <n>, an <intermediate | release> round.** What changed since round <n−1>:
> <the changed screens, flows and rules, from `git diff --stat` by feature folder>. The fixes of
> round <n−1> to check, each the way it was found and then across its class: <list>. Round
> <n−1>'s open lows: <list> — confirm each in one line (still there or gone) and re-judge its
> severity against the owner's feedback; do not re-investigate them.
>
> Do not script a matrix of console errors, failed requests, raw keys, overflow or axe over every
> route, width, theme and language: `e2e/route-sweep.e2e.ts` does that on every CI run. Look at
> the screens with your own eyes instead; keep the network log open while you explore.
>
> *(Intermediate round.)* Cover: every fix above; look hard around each change; the always-on
> set (Now with the task pane, Settings, the sidebar and shell, signing in), the changed screens
> and the screens that read changed data (`docs/qa.md`, "Intermediate round"), all at 1440×900
> and 390×844; the keyboard (Tab, Enter, Escape, focus after a swap) on them; every changed form,
> opened from each entry path in the table in `docs/qa.md` and submitted from each; empty,
> loading, first-sync, error and offline states of the changed screens. Explore in Russian on the
> lived-in account; use English only for a fresh account and for the Russian account in an
> English browser. Explore in light; take one dark screenshot of each changed screen and look at
> it.
>
> *(Release round.)* Cover: every screen at 1440×900 and 390×844, light and dark
> (`localStorage["pace.theme"]`), Russian and English; the owner's scenarios in
> `context/feedback-*.md` and the plan's scenario table; every form, sheet, picker and button;
> open every form by hand and from each other entry path in the table in `docs/qa.md`, then
> submit from each; keyboard (Tab, Enter, Escape); empty, loading, error, first-sync and offline
> states; tap targets; anything that contradicts itself. Compare with what the owner asked for
> and list every request that is still not met.
>
> Then walk the screens in scope once more (every screen in a release round) against the UX
> heuristics below and report each breach as a finding, even when nothing is "broken" (feedback
> round 3 was all of this kind, and the tests cannot see it):
> - **Every control earns its place**: a filter that cannot filter (a lone «All»), a button that
>   only moves the cursor, a Back next to a dismissable sheet — remove or merge.
> - **One way per job**: no two buttons that do the same thing on one screen.
> - **Platform conventions**: a phone sheet slides from the bottom and closes on the dim; a
>   desktop dialog sits in the middle with a ✕ and closes on Escape and a click outside; Cancel
>   only in confirmations; tabs hold destinations, not actions.
> - **The keyboard on a computer**: Enter submits, Escape closes, the main actions have shortcuts
>   named the OS's way (⌘ on a Mac, Ctrl elsewhere) and shown on the buttons.
> - **State you can see**: neighbouring tags in different colours when they mean different things
>   (no two grays side by side), a draft looks like a draft, a value follows the finger live.
>   Every value a form sets is readable without reopening the form (a task's repeat and final
>   deadline on its screen, a repeat mark on its rows).
> - **Feedback and motion**: a structural change (a form unfolding, a row leaving) is animated,
>   never a jump; a saved value never snaps back for a moment.
> - **Copy**: plain words that say what happened and what to do («A new version is ready ·
>   Refresh»), never vague («We changed a few things»).
> - **Color**: one calm accent for actions; no colour that shouts without a reason.
> - **Forms keep their promise**: try every entry path (empty by hand, assistant, paste,
>   New task/N, edit) and submit; anything an enabled button offers must be accepted by
>   the action, since separate UI and action decisions can disagree.
> - **Overlays in context**: check when every toast, tooltip and popup appears, where it
>   lands and which controls it covers; late or misplaced feedback hides the next action.
> - **Visual matrix**: look at each changed screen at 390 px and 1440 px with Russian text;
>   wrapping, word collisions and layout can fail only in one combination, and the sweep cannot
>   judge a layout that fits but reads wrong.
> - **Responsiveness**: run the main taps (a tab, a filter chip, a check-off, opening a row, Back,
>   a time-bar button) in a mobile context with touch on and the CPU throttled 4× (CDP
>   `Emulation.setCPUThrottlingRate`); anything that takes over 100 ms from tap to the next frame
>   (Event Timing API), or a control that shows nothing when pressed, is a finding
>   (bug-lessons class 57).
> - **Guest language and sideways content**: check signed-out pages with a Russian browser
>   locale and verify the document language; on narrow screens, every sideways region needs
>   a visible scroll cue and a keyboard focus target.
>
> Report (English): a summary with counts by severity; the previous round's fixes, each
> confirmed or reopened; findings most severe first, each with an id, severity
> (blocker/high/medium/low), screen + width + theme + language, exact steps, what happened vs
> what should happen, and a screenshot path; the open lows, one line each; owner requests not met
> (with evidence); a few lines of what works well. Write it as you go; stop the servers at the
> end.

## Every form, every way in

A form tested from one entry path hides what the others do (bug class 2 in
[`context/bug-lessons.md`](../context/bug-lessons.md)). A release round opens every form every way
below and submits from each; an intermediate round does it for every form that changed. A new way
in gets a row and a test that submits from it.

| Form | Ways in | Where a test submits from it |
|---|---|---|
| Composer (Now) | typed line + Enter; Send; + over a typed line; + over an empty line; New task request (N, the sidebar); pasted text; a share (`/add`); the assistant's reading (parsed, rules when it is down, queued); To Inbox | `composer.test.tsx`, `now-screen.test.tsx`, `e2e/composer.e2e.ts` |
| Task edit sheet | the task screen's Edit; the wide pane's Edit | `task-screen.test.tsx` |
| Close / submit sheet | the row's check on Now; the task screen's Done / Submit; "Close as…" (Cancelled · Skipped); a pill; a typed date and time | `close-sheet.test.tsx`, `close-times.test.ts` |
| Day's activity sheet | a block (edit); a gap's Log; Log past; a time ahead of now or into the next block | `activity-sheet.test.tsx`, `day-screen.test.tsx` |
| Time bar | each button's picker (Calendar, Task, Chores, Rest); the typed field + Enter or ▶; Alongside; a re-pick of what runs; Stop | `time-bar.test.tsx`, `e2e/time.e2e.ts` |
| Assistant preview (composer, time bar, Telegram) | Approve (button, Enter); a typed correction; a tap on a question's option (`#ask <title>`: in the task line the fake model asks one question with options and one without, in the time bar "How long?"); Approve while questions are open; Escape in the line; a paste followed by Enter (one request); text with nothing to do or start; a stale option button in Telegram | `composer.test.tsx`, `time-bar.test.tsx`, `preview.test.ts`, `bot.int.test.ts`, `e2e/assistant.e2e.ts` |
| Calendar event | Now's offer (Attend, Skip); Day's row (Attended, Skip, Every time); the Calendar picker; the feed; Telegram; a phone notification's button | `now-screen.test.tsx`, `day-phone.test.tsx`, `notify.int.test.ts`, `bot.int.test.ts`, `notifications.test.ts` (the phone buttons) |
| Projects / presets | new; edit; archive and restore; extend a preset | `projects.test.tsx`, `presets.test.tsx` |
| Settings | each switch and time; the push picker (Auto, Google, Pace checks, Off; offline; another Firebase project) | `settings.test.tsx` |
| Add a computer, Connect an AI app (Settings → Devices and sessions) | Settings at phone and desktop width; each OS; revoke and disconnect with the inline confirm | `features/sessions/sessions.test.tsx`, `e2e/sessions.e2e.ts` |

## The design review matrix

After a design batch (and before the next one is planned) re-shoot the screenshot matrix and
compare it with the baseline in [`context/design/baseline/`](../context/design/baseline/):
`DESIGN_SHOTS=.cache/shots/<batch> bun test:e2e e2e/design-shots.e2e.ts` against the running
stack (about ten minutes; add `PLAYWRIGHT_CHROMIUM_EXECUTABLE` in a sandbox). Output is
`<dir>/<group>/<name>--<viewport>-<theme>-<lang>.png` plus `manifest-<combo>.json`; every manifest
must list only `login-server-picker` as missed (it is Android only), any other miss is a renamed
control and the script needs the new label. `DESIGN_SHOTS_ONLY=states` and
`DESIGN_SHOTS_STATES=day-gap-log,day-block-edit` re-shoot part of it. Shoot into `.cache/`
(git-ignored); only a new baseline is committed under `context/design/baseline/`.

## Limits

- The LLM is the fake provider: parsing findings need a check against the real model.
- The web build has no phone calendar, usage access or notifications: Android-only flows are
  checked on a device (see the release checklist in `context/`).
- The route sweep judges what a script can: a layout that fits but reads wrong, a word collision
  in Russian or a control that does nothing useful still needs eyes.
