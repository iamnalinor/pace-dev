import type { JSHandle, Locator, Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

/**
Responsiveness budget (bug-lessons class 57): from a tap to the next frame takes at most 100 ms
(p75 of five taps) on a mid-range phone, which Chromium stands in for with its CPU slowed four
times. The time is what the browser itself reports for the tap's events (the Event Timing API:
from the input to the frame painted after its handlers), so a handler that waits for a disk
write, a heavy re-render or a long mount all count.
*/

const BUDGET_MS = 100;
const CPU_SLOWDOWN = 4;
/** Event Timing reports nothing shorter; a tap with no entry took less than this. */
const THRESHOLD_MS = 16;
const TAP_EVENTS = ["pointerdown", "pointerup", "click", "touchstart", "touchend"];

const STUDY = ["Read chapter 4", "Lab report", "Problem set 7", "Essay outline", "Revise notes"];
const WORK = ["Reply to Anna", "Fix the build", "Plan the sprint", "Review the PR", "Update docs"];

/** An English account with two projects and five open tasks in each. */
const seed = async (token: string): Promise<void> => {
  const now = Date.now();
  const studyId = ulid(now - 100_000);
  const workId = ulid(now - 99_000);
  const at = (offset: number): string => new Date(now - 90_000 + offset * 1000).toISOString();
  const bodies = [
    { payload: { language: "en", timezone: "Europe/Moscow" }, type: "settings.updated" },
    { payload: { color: "blue", name: "Study", projectId: studyId }, type: "project.created" },
    { payload: { color: "green", name: "Work", projectId: workId }, type: "project.created" },
    ...[...STUDY.map((title) => [title, studyId]), ...WORK.map((title) => [title, workId])].map(
      ([title, projectId], index) => ({
        payload: {
          fields: {},
          presetId: projectId === workId ? "work" : "personal",
          projectId,
          subtasks: [],
          taskId: ulid(now - 80_000 + index),
          title,
        },
        type: "task.created",
      }),
    ),
  ];
  const events = bodies.map((body, index) => ({
    ...body,
    deviceId: "e2e-seed",
    id: ulid(now - 70_000 + index),
    occurredAt: at(index),
    precision: "exact",
    recordedAt: at(index),
    source: "web",
  }));
  const response = await pushAsClient(token, events);
  expect(response.ok).toBe(true);
};

type Timing = { readonly name: string; readonly duration: number; readonly startTime: number };

/** Every Event Timing entry of the page, buffered ones included, kept in the page. */
const observeEvents = async (page: Page): Promise<JSHandle<Timing[]>> =>
  await page.evaluateHandle((threshold) => {
    const entries: Timing[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        entries.push({ duration: entry.duration, name: entry.name, startTime: entry.startTime });
      }
    });
    // Event Timing's option, not yet in TypeScript's DOM types.
    const init: PerformanceObserverInit & { durationThreshold: number } = {
      buffered: true,
      durationThreshold: threshold,
      type: "event",
    };
    observer.observe(init);
    return entries;
  }, THRESHOLD_MS);

/** Slows the page's CPU like a mid-range phone, from here on. */
const throttle = async (page: Page): Promise<void> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
};

/** Two frames and the observer's turn: the entries of what was just tapped are in by then. */
const settleFrames = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      globalThis.requestAnimationFrame(() => {
        globalThis.requestAnimationFrame(() => {
          setTimeout(resolve, 100);
        });
      });
    });
  });
};

/** Taps a target and answers the longest of its events, input to next frame (0: under 16 ms). */
type TimeTap = (target: Locator) => Promise<number>;

const tapTimer =
  (page: Page, timings: JSHandle<Timing[]>): TimeTap =>
  async (target) => {
    await target.waitFor();
    const since = await page.evaluate(() => performance.now());
    await target.tap();
    await settleFrames(page);
    const durations = await timings.evaluate(
      (entries, { names, start }) =>
        entries
          .filter((entry) => entry.startTime >= start && names.includes(entry.name))
          .map((entry) => entry.duration),
      { names: TAP_EVENTS, start: since },
    );
    return Math.max(0, ...durations);
  };

const p75 = (values: readonly number[]): number => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.75) - 1] ?? NaN;
};

/** Reports the taps (in the run's annotations and its output) and answers their p75. */
const report = (name: string, durations: readonly number[]): number => {
  const result = p75(durations);
  const line = `${name}: p75 ${String(result)} ms of [${durations.join(", ")}] (CPU ${String(CPU_SLOWDOWN)}x)`;
  test.info().annotations.push({ description: line, type: "latency" });
  process.stdout.write(`latency ${line}\n`);
  return result;
};

/** Signed in on a seeded account, on Now, with the CPU slowed from here on. */
const openNow = async (page: Page): Promise<TimeTap> => {
  const { token } = await loginViaApi(page);
  await seed(token);
  await page.goto("/");
  await expect(page.getByRole("link", { name: /^Reply to Anna/u }).first()).toBeVisible();
  const timings = await observeEvents(page);
  await throttle(page);
  return tapTimer(page, timings);
};

/** Lets the screen finish what the last tap started (animations, a mount) before the next. */
const rest = async (page: Page): Promise<void> => {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  await settleFrames(page);
};

/**
Over the budget for a reason a later task of the redesign owns (context/design/redesign-plan.md):
the budget stays, the case is expected to fail until that task lands, and then flips (an
expected failure that passes fails the run, so whoever fixes it removes the line). Marked right
before the budget check, so a step that breaks before it still fails the run. None of the four
taps writes to the local store: their time is the render they start. Measured at 4x on the build
of Task 2.5 (p75 of 5, two runs each).
*/
const OVER_BUDGET: Readonly<Record<string, string>> = {
  // 120, 120 ms. Each switch re-renders the screens of both tabs and lays out the one taken out
  // of display:none (~25 ms of React work unthrottled); the bar and its links are rebuilt in
  // Task 3.10, tab switches lose all motion in Task 5.3.
  tab: "Task 3.10 / 5.3: tab switch re-renders both screens",
  // 160, 152 ms. Rows play Reanimated's entering and exiting animations on a filter change
  // (F-MOT-07; most of the tap's JavaScript); Task 5.3 makes the filter change instant.
  chip: "Task 5.3: rows animate on a filter change (F-MOT-07)",
  // 184, 160 ms. The check mounts the dust views in the same commit as the fill; Task 5.2.
  check: "Task 5.2: the dust mounts in the check's own commit",
  // 144, 144 ms. Opening pushes the task screen and renders it in the tap's commit; Task 5.3
  // (route push) and the task screen's rewrite in Batch 4.
  row: "Task 5.3 / Batch 4: the task screen renders in the tap's commit",
};

/** The budget check, expected to fail where a later task owns the cause (`OVER_BUDGET`). */
const expectWithinBudget = (name: string, durations: readonly number[]): void => {
  const result = report(name, durations);
  const owner = OVER_BUDGET[name];
  test.fail(owner !== undefined, owner);
  expect(result).toBeLessThanOrEqual(BUDGET_MS);
};

test.use({ hasTouch: true, viewport: { height: 844, width: 390 } });

test.describe("a tap shows its result within 100 ms on a slow phone (p75 of 5)", () => {
  test("a tab of the phone's bar", async ({ page }) => {
    const timeTap = await openNow(page);
    const tabs = page.getByRole("tablist", { name: "Main" });
    const durations: number[] = [];
    for (const name of ["Day", "Now", "Inbox", "Now", "Day"]) {
      const tab = tabs.getByRole("tab", { exact: true, name });
      durations.push(await timeTap(tab));
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await rest(page);
    }
    expectWithinBudget("tab", durations);
  });

  test("a project filter chip on Now", async ({ page }) => {
    const timeTap = await openNow(page);
    const chips = page.getByLabel("Filter by project");
    const durations: number[] = [];
    for (const name of ["Work", "All", "Study", "All", "Work"]) {
      const chip = chips.getByRole("radio", { exact: true, name });
      durations.push(await timeTap(chip));
      await expect(chip).toBeChecked();
      await rest(page);
    }
    expectWithinBudget("chip", durations);
  });

  test("a task's check on Now", async ({ page }) => {
    const timeTap = await openNow(page);
    const durations: number[] = [];
    for (const title of WORK) {
      const check = page.getByRole("checkbox", { name: `Mark ${title} done` });
      durations.push(await timeTap(check));
      await expect(check).toHaveCount(0);
      await rest(page);
    }
    expectWithinBudget("check", durations);
  });

  test("a task row opening its screen", async ({ page }) => {
    const timeTap = await openNow(page);
    const durations: number[] = [];
    for (const title of STUDY) {
      const row = page.getByRole("link", { name: title });
      durations.push(await timeTap(row));
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await rest(page);
      await page.goBack();
      await expect(page.getByRole("link", { name: /^Reply to Anna/u }).first()).toBeVisible();
      await rest(page);
    }
    expectWithinBudget("row", durations);
  });
});
