# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

One React Native (Expo) code base ships as the Android app and, through react-native-web, as the
web app (a PWA used on phones and on desktop computers). Android gets Material platform
affordances where HIG and Material disagree (system Back and predictive back, ripple, system
sheets, edge-to-edge insets, haptics); the web follows web conventions for its form factor
(phone web at 390 px, desktop web with a sidebar, split panes and centred dialogs). The craft bar
everywhere is a first-party Apple productivity app (owner, 2026-11-01).

## Users

- **Primary: the owner** (Albert, a university student in Moscow, Europe/Moscow, writes Russian,
  reads the UI in English or Russian). He uses Pace many times a day: in the morning to set his
  status in three taps, between classes to check what is due and to attend calendar events,
  at the desk to paste homework from course chats and work through tasks, and in the evening to
  fill gaps in the day. He uses an Android phone and a desktop browser in parallel, light and
  dark. He is demanding about craft: every feedback round (`context/feedback-*.md`) is mostly
  about visual and interaction detail.
- **Secondary: a friend invited later, and self-hosters** running their own server (Phase C).
  They get correct onboarding, empty states and the server picker, but no design concessions
  beyond i18n and accessibility (owner, 2026-11-01: "Owner first").

## Product Purpose

A personal task and time tracker: open it and you see at once what to do now, what is hanging
and where the time goes. Tasks are ranked by time to deadline; time is tracked as activities
(one tap switches, gaps are logged after the fact); calendar, phone and computer usage feed the
day and the week; an LLM assistant turns free text (pasted homework, "7:30–8:30 went to the
enlistment office") into proposals the person confirms. Success: the owner opens it instead of
Todoist and a paper week, and trusts what it shows.

## Positioning

- Everything is an immutable event: nothing is lost, every action can be undone or corrected
  after the fact, and History shows it.
- Local-first: opening and checking off are instant, with or without a network.
- One log for tasks and time: a task's focus time, the day's activities, calendar events and
  where the person sat (apps per block) are the same timeline.
- The assistant proposes, the person approves; the original text is kept.
- The same account is reachable from the app, the web, a Telegram bot and MCP (Claude and other
  assistants).

## Operating Context

- Phone: one-handed, often in motion (commute, between classes), three-tap flows (app → Chores →
  Getting ready), notifications ("still doing this?" at 2× the expected length, calendar start).
- Desktop: a browser tab beside course chats; paste homework into the composer, Enter to parse,
  Enter to create; keyboard shortcuts shown on buttons (⌘ on a Mac, Ctrl elsewhere).
- Telegram bot as a parallel channel (free text, sign-in notices, Deadline Digest, wipe/delete
  confirmations).
- Navigation (owner's last word, `context/stage-8/ledger.md:96,98`): phone tabs
  Now · Day · Inbox · More (More holds Week, Projects, Insights, History, Settings); desktop
  sidebar Now → Day → Week → Inbox → Projects → Insights → History → Settings, with a New task
  button and the Telegram name in the header. ("Calendar" was tried and reverted to "Week".)

## Capabilities and Constraints

- Screens: Now (composer, task list, calendar offer, the running activity and the time bar; on a
  phone the time bar folds under "Start something else"), Day (timeline with "not logged" gaps), Week, Inbox, Projects and project pages, Presets, task
  detail (sheet on phone, split pane on desktop), Insights, History, Decisions, Review,
  Notifications feed, Settings (devices and sessions, server picker, digest times, quiet hours,
  export, wipe, delete), Login, Onboarding, Permissions, OAuth consent.
- Product truth is fixed for the redesign: features, flows, copy meaning, i18n, event sourcing,
  offline-first, the information architecture above.
- Every UI string goes through `t()`; EN is the source catalog, RU mirrors it (RU strings run
  15–40 % longer). User-entered content is never translated or rewritten.
- Inter is the only typeface, Cyrillic included (owner, feedback 2).
- Big, fixed-position buttons for the time bar: "each button large enough not to miss, always
  in its place" (owner, feedback 2).
- Terminology: Subtasks (never "Problems"), Now, Day, Week, Inbox, Focus, Done, Log it.
- Technical: Expo 57, React Native 0.86, react-native-web 0.21, NativeWind 4, Reanimated 4,
  lucide icons, expo-router; tokens live in `packages/core/src/design/tokens.json` (core stays
  pure). The web build is a PWA served by a Worker.

## Brand Commitments

- Name: **Pace**. Logo: chevrons and a dot; the owner prefers it in the green/lime accent over
  indigo (feedback 4).
- Accent history: started "direction A: dark, dense, one lime accent"; the owner called a lime
  update banner "acid yellow" (feedback 3), then asked for green on important actions and the
  logo, a quieter colour for quiet states (feedback 4). The palette is open for re-choice in the
  2026-11 overhaul.
- Voice: plain words that say what happened and what to do ("A new version is ready · Refresh"),
  never vague; short.

## Evidence on Hand

- Real usage data shape: `e2e/support/seed.ts` (`seedLivedIn`, a Russian lived-in account) and
  the artboard fixtures in `@pace/core/testing`.
- Owner feedback with screenshots described: `context/feedback-2.md`, `feedback-3.md`,
  `feedback-4.md`; QA rounds `context/qa-round-*.md`.
- README screenshots: `docs/screenshots/`.
- No testimonials, customers or metrics exist; none may be invented.

## Product Principles

1. **Instant and calm.** Nothing waits on the network; nothing shouts without a reason.
2. **Every control earns its place, one way per job.** No lone filters, no duplicate buttons, no
   Back beside a dismissable sheet.
3. **State you can see.** A draft looks like a draft, a value follows the finger, neighbouring
   tags that mean different things look different, a saved value never snaps back.
4. **Forgetfulness is normal.** Gaps, stale tasks and unsorted input are surfaced gently with one
   obvious fix ("Log it").
5. **The assistant proposes, the person decides.** Proposals read as proposals.

## Accessibility & Inclusion

- WCAG 2.2 AA (axe sweep on every page fails on serious/critical); both themes first-class.
- Hit targets ≥ 44 pt (48 dp on Android); keyboard complete on desktop (Enter submits, Escape
  closes, visible focus); reduced motion honoured.
- English and Russian are both first-class; signed-out pages follow the browser locale.
