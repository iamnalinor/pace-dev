# Exploratory QA in a browser

Tests prove what they check; this pass finds what nobody thought to check — anything broken,
weird, inconvenient, inconsistent, ugly, slow or badly worded. A cheaper model (Sonnet) acts as
a demanding user and clicks through the **web build** with Playwright, then writes a report.
Round 1 is in [`context/qa-round-1.md`](../context/qa-round-1.md) (34 findings, nothing found by
the test suites).

## When

- Before every release, and after any round of UI or flow changes (a feedback round, a new
  screen, a reworked form).
- Again after its findings are fixed: repeat until only cosmetic findings are left.

## How

1. Launch an agent with `model: "sonnet"` (background), using the prompt below. It must not
   change product code: it only writes `context/qa-round-<n>.md` and keeps its scripts and
   screenshots in the session scratchpad.
2. While it runs, run a code review of the branch in parallel (a second agent reading
   `git diff origin/main...HEAD` for real defects: security, data, logic, hooks).
3. Fix the findings with TDD (a failing unit/app/e2e test first where the bug is testable),
   commit in batches, then launch the next round.

## The prompt (fill in the round number and what changed)

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
> also use a fresh English account.
>
> Cover: every screen at 1440×900 and 390×844, light and dark (`localStorage["pace.theme"]`),
> Russian and English; the owner's scenarios in `context/feedback-*.md` and the plan's scenario
> table; every form, sheet, picker and button; open every form by hand and from each other
> entry path in the table below, then submit from each; keyboard (Tab, Enter, Escape); empty, loading,
> error and offline states; console errors and failed requests on every screen; translation
> gaps and raw keys; text overflow, contrast, tap targets; anything that contradicts itself.
> Compare with what the owner asked for and list every request that is still not met.
>
> Then walk every screen once more against the UX heuristics below and report each breach as a
> finding, even when nothing is "broken" (feedback round 3 was all of this kind, and the tests
> cannot see it):
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
> - **Visual matrix**: inspect each changed screen at 390 px and 1280 px, in both themes
>   with Russian text; wrapping and contrast can fail only in one combination.
> - **Guest language and sideways content**: check signed-out pages with a Russian browser
>   locale and verify the document language; on narrow screens, every sideways region needs
>   a visible scroll cue and a keyboard focus target.
>
> Report (English): a summary with counts by severity; findings most severe first, each with an
> id, severity (blocker/high/medium/low), screen + width + theme + language, exact steps, what
> happened vs what should happen, and a screenshot path; owner requests not met (with
> evidence); a few lines of what works well. Write it as you go; stop the servers at the end.

## Every form, every way in

A form tested from one entry path hides what the others do (bug class 2 in
[`context/bug-lessons.md`](../context/bug-lessons.md)). Each round opens every form every way below
and submits from each; a new way in gets a row and a test that submits from it.

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

## Limits

- The LLM is the fake provider: parsing findings need a check against the real model.
- The web build has no phone calendar, usage access or notifications: Android-only flows are
  checked on a device (see the release checklist in `context/`).
