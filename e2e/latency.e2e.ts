import type { JSHandle, Locator, Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

/**
Responsiveness budget (bug-lessons class 57): from a tap to the next frame takes at most 100 ms
(p75 of nine taps, after one discarded warm-up) on a mid-range phone, which Chromium stands in
for with its CPU slowed four times. The time is what the browser itself reports for the tap's
interaction (the Event Timing API: from the input to the frame painted after its handlers), so
a handler that waits for a disk write, a heavy re-render or a long mount all count. The file is
a Playwright project of its own (`latency` in playwright.config.ts) that runs after every other
test, one test at a time, so no parallel worker slows its frames.
*/

const BUDGET_MS = 100;
const CPU_SLOWDOWN = 4;
/** Event Timing reports nothing shorter; a tap with no entry took less than this. */
const THRESHOLD_MS = 16;
/** Taps measured per case, after one warm-up tap that is not counted. */
const TAPS = 9;

const STUDY = [
  "Read chapter 4",
  "Lab report",
  "Problem set 7",
  "Essay outline",
  "Revise notes",
  "Practice exam",
  "Group project",
  "Seminar slides",
  "Flashcards",
  "Office hours",
];
const WORK = [
  "Reply to Anna",
  "Fix the build",
  "Plan the sprint",
  "Review the PR",
  "Update docs",
  "Book the room",
  "Send the invoice",
  "Call the bank",
  "Order paper",
  "Draft the memo",
];

/** An English account with two projects and ten open tasks in each. */
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

type Timing = { readonly interactionId: number; readonly duration: number };

/** Every Event Timing entry of an interaction (a tap), buffered ones included, kept in the page. */
const observeEvents = async (page: Page): Promise<JSHandle<Timing[]>> =>
  await page.evaluateHandle((threshold) => {
    const entries: Timing[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // `interactionId` (0 for an event that is no interaction) is not in TypeScript's DOM yet.
        const { interactionId = 0 } = entry as PerformanceEntry & { interactionId?: number };
        if (interactionId > 0) {
          entries.push({ duration: entry.duration, interactionId });
        }
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

/**
Waits until the page is quiet: no CSS animation running, then no change to the page (a
JavaScript-driven animation writes styles every frame) for two frames in a row, then an idle
moment. One tap's tail never spills into the next one's frame.
*/
const rest = async (page: Page): Promise<void> => {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  await page.evaluate(
    async ({ quietFrames, capMs }) => {
      await new Promise<void>((resolve) => {
        let isChanged = false;
        const { MutationObserver: Observer } = globalThis;
        const observer = new Observer(() => {
          isChanged = true;
        });
        observer.observe(globalThis.document.body, {
          attributes: true,
          childList: true,
          subtree: true,
        });
        const startedAt = performance.now();
        let quiet = 0;
        const frame = (): void => {
          quiet = isChanged ? 0 : quiet + 1;
          isChanged = false;
          if (quiet >= quietFrames || performance.now() - startedAt > capMs) {
            observer.disconnect();
            globalThis.requestIdleCallback(
              () => {
                resolve();
              },
              { timeout: capMs },
            );
            return;
          }
          globalThis.requestAnimationFrame(frame);
        };
        globalThis.requestAnimationFrame(frame);
      });
    },
    { capMs: 3000, quietFrames: 2 },
  );
};

/** Taps a target and answers its interaction's longest event, input to next frame (0: < 16 ms). */
type TimeTap = (target: Locator) => Promise<number>;

const tapTimer = (page: Page, timings: JSHandle<Timing[]>): TimeTap => {
  const seen = new Set<number>();
  return async (target) => {
    await target.waitFor();
    await target.tap();
    await rest(page);
    const fresh = await timings.evaluate((entries) => [...entries]);
    const byInteraction = new Map<number, number>();
    for (const { duration, interactionId } of fresh) {
      if (!seen.has(interactionId)) {
        byInteraction.set(interactionId, Math.max(byInteraction.get(interactionId) ?? 0, duration));
      }
    }
    for (const id of byInteraction.keys()) {
      seen.add(id);
    }
    return Math.max(0, ...byInteraction.values());
  };
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
  await rest(page);
  return tapTimer(page, timings);
};

/**
Times one warm-up tap (not counted: the first use of a code path) and then `TAPS` more; `step`
taps the n-th target and checks its result.
*/
const timeTaps = async (
  timeTap: TimeTap,
  step: (index: number) => { readonly target: Locator; readonly check: () => Promise<void> },
): Promise<readonly number[]> => {
  const durations: number[] = [];
  for (let index = 0; index <= TAPS; index += 1) {
    const { check, target } = step(index);
    const duration = await timeTap(target);
    await check();
    if (index > 0) {
      durations.push(duration);
    }
  }
  return durations;
};

/**
Over the budget for a reason a later task of the redesign owns (context/design/redesign-plan.md):
the budget stays, the case is expected to fail until that task lands, and then flips (an
expected failure that passes fails the run, so whoever fixes it removes the line). Marked right
before the budget check, so a step that breaks before it still fails the run. None of the four
taps writes to the local store: their time is the render they start. Numbers: Task 2.5 fix
round 1, p75 of 9 after a warm-up, the project run alone.
*/
const OVER_BUDGET: Readonly<Record<string, string>> = {
  // Each switch re-renders the screens of both tabs and lays out the one taken out of
  // display:none; Task 5.6 (render budget), the bar itself in Task 3.10.
  tab: "Task 5.6 / 3.10: a tab switch re-renders both screens",
  // Rows play Reanimated's entering and exiting animations on a filter change (F-MOT-07);
  // Task 5.3 makes the filter change instant, Task 5.6 the render.
  chip: "Task 5.3 / 5.6: rows animate on a filter change (F-MOT-07)",
  // The check mounts the dust views in the same commit as the fill; Task 5.2.
  check: "Task 5.2: the dust mounts in the check's own commit",
  // Opening pushes the task screen and renders it in the tap's commit; Task 5.3 (route push)
  // and Task 5.6 (render budget).
  row: "Task 5.3 / 5.6: the task screen renders in the tap's commit",
};

/** The budget check, expected to fail where a later task owns the cause (`OVER_BUDGET`). */
const expectWithinBudget = (name: string, durations: readonly number[]): void => {
  const result = report(name, durations);
  const owner = OVER_BUDGET[name];
  test.fail(owner !== undefined, owner);
  expect(result).toBeLessThanOrEqual(BUDGET_MS);
};

test.use({ hasTouch: true, viewport: { height: 844, width: 390 } });

test.describe("a tap shows its result within 100 ms on a slow phone (p75 of 9)", () => {
  test.describe.configure({ mode: "serial" });

  test("a tab of the phone's bar", async ({ page }) => {
    const timeTap = await openNow(page);
    const tabs = page.getByRole("tablist", { name: "Main" });
    const order = ["Day", "Now", "Inbox", "Now", "Day", "Inbox", "Day", "Now", "Inbox", "Now"];
    const durations = await timeTaps(timeTap, (index) => {
      const tab = tabs.getByRole("tab", { exact: true, name: order[index] ?? "Now" });
      return {
        check: async () => {
          await expect(tab).toHaveAttribute("aria-selected", "true");
        },
        target: tab,
      };
    });
    expectWithinBudget("tab", durations);
  });

  test("a project filter chip on Now", async ({ page }) => {
    const timeTap = await openNow(page);
    const chips = page.getByLabel("Filter by project");
    const order = ["Work", "All", "Study", "All", "Work", "Study", "All", "Work", "All", "Study"];
    const durations = await timeTaps(timeTap, (index) => {
      const chip = chips.getByRole("radio", { exact: true, name: order[index] ?? "All" });
      return {
        check: async () => {
          await expect(chip).toBeChecked();
        },
        target: chip,
      };
    });
    expectWithinBudget("chip", durations);
  });

  test("a task's check on Now", async ({ page }) => {
    const timeTap = await openNow(page);
    const durations = await timeTaps(timeTap, (index) => {
      const check = page.getByRole("checkbox", { name: `Mark ${WORK[index] ?? ""} done` });
      return {
        check: async () => {
          await expect(check).toHaveCount(0);
        },
        target: check,
      };
    });
    expectWithinBudget("check", durations);
  });

  test("a task row opening its screen", async ({ page }) => {
    const timeTap = await openNow(page);
    const durations = await timeTaps(timeTap, (index) => {
      const title = STUDY[index] ?? "";
      return {
        check: async () => {
          await expect(page.getByRole("heading", { name: title })).toBeVisible();
          await page.goBack();
          await expect(page.getByRole("link", { name: /^Reply to Anna/u }).first()).toBeVisible();
          await rest(page);
        },
        target: page.getByRole("link", { name: title }),
      };
    });
    expectWithinBudget("row", durations);
  });
});
