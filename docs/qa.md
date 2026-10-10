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
> table; every form, sheet, picker and button; keyboard (Tab, Enter, Escape); empty, loading,
> error and offline states; console errors and failed requests on every screen; translation
> gaps and raw keys; text overflow, contrast, tap targets; anything that contradicts itself.
> Compare with what the owner asked for and list every request that is still not met.
>
> Report (English): a summary with counts by severity; findings most severe first, each with an
> id, severity (blocker/high/medium/low), screen + width + theme + language, exact steps, what
> happened vs what should happen, and a screenshot path; owner requests not met (with
> evidence); a few lines of what works well. Write it as you go; stop the servers at the end.

## Limits

- The LLM is the fake provider: parsing findings need a check against the real model.
- The web build has no phone calendar, usage access or notifications: Android-only flows are
  checked on a device (see the release checklist in `context/`).
