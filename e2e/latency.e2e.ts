import type { JSHandle, Locator, Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

/**
Responsiveness budget (bug-lessons class 108): from a tap to the next frame takes at most 100 ms
(p75 of nine taps, after one discarded warm-up) on a mid-range phone, which Chromium stands in
for with its CPU slowed four times. The time is what the browser itself reports for the tap's
interaction (the Event Timing API: from the input to the frame painted after its handlers), so
a handler that waits for a disk write, a heavy re-render or a long mount all count. The file is
a Playwright project of its own (`latency` in playwright.config.ts) that runs after every other
test, one test at a time, so no parallel worker slows its frames.

`BUDGET_MS` is the target and is never raised. A case over it for a reason a later task of the
redesign owns has a regression ceiling instead (`CEILINGS`, a ratchet like the lint baseline):
it fails past the ceiling, and its gap to the budget is a test annotation naming the owner.
How a later task lowers a ceiling: run the project alone five times on a fresh build
(`bunx playwright test --project latency --no-deps`), take the largest p75 of the case, multiply
by 1.25 and round up to 10 ms; a lower number replaces the ceiling (never a higher one). Once the
case is within the budget, the task deletes its entry, and the case asserts `BUDGET_MS` itself.
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

type Timing = {
  readonly interactionId: number;
  readonly duration: number;
  /** When the input happened, on the page's clock. */
  readonly startTime: number;
};

/** Every Event Timing entry of an interaction (a tap), buffered ones included, kept in the page. */
const observeEvents = async (page: Page): Promise<JSHandle<Timing[]>> =>
  await page.evaluateHandle((threshold) => {
    const entries: Timing[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // `interactionId` (0 for an event that is no interaction) is not in TypeScript's DOM yet.
        const { interactionId = 0 } = entry as PerformanceEntry & { interactionId?: number };
        if (interactionId > 0) {
          entries.push({ duration: entry.duration, interactionId, startTime: entry.startTime });
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
    // Only this tap's input counts: an untimed step before it (closing a sheet with Escape, a
    // tap on its Close) is an interaction of its own and must not be folded into this one.
    const tappedAt = await page.evaluate(() => performance.now());
    await target.tap();
    await rest(page);
    const fresh = await timings.evaluate((entries) => [...entries]);
    const byInteraction = new Map<number, number>();
    for (const { duration, interactionId, startTime } of fresh) {
      if (!seen.has(interactionId) && startTime >= tappedAt) {
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

type Case =
  | "check"
  | "chip"
  | "dayStep"
  | "logPast"
  | "newTask"
  | "picker"
  | "row"
  | "tab"
  | "themeChip"
  | "weekStep";

/** A case's regression ceiling while a later task owns why it is over the budget. */
type Ceiling = { readonly ms: number; readonly owner: string; readonly why: string };

/**
Ceilings: the largest p75 of the case × 1.25, rounded up to 10 ms. Measured in the review of
batch 1+2 (2026-11-02, one fresh build, the project alone, 15 runs in three sets of five; the
machine's load varied between them): largest p75 tab 192, chip 304, check 248, row 192 ms (the
first set alone: 136, 240, 208, 176). Taken over all of them, so a busier runner does not fail a
case that did not regress. The check tap does write (`closeTask`), but since Task 2.5 the write
is off the frame's path; the other three taps write nothing. Each one's time is the render it
starts.
*/
const CEILINGS: Readonly<Partial<Record<Case, Ceiling>>> = {
  // Each switch re-renders the screens of both tabs and lays out the one taken out of
  // display:none; the bar itself is Task 3.10's.
  tab: { ms: 240, owner: "Task 5.6 / 3.10", why: "a tab switch re-renders both screens" },
  // Rows play Reanimated's entering and exiting animations on a filter change (F-MOT-07).
  chip: { ms: 380, owner: "Task 5.3 / 5.6", why: "rows animate on a filter change (F-MOT-07)" },
  check: { ms: 310, owner: "Task 5.2", why: "the dust mounts in the check's own commit" },
  // Task 5.3 (route push) and Task 5.6 (render budget).
  row: { ms: 240, owner: "Task 5.3 / 5.6", why: "the task screen renders in the tap's commit" },
  // QA round 22 (R22-09), measured after its fix (2026-11-02, one fresh build, the project alone
  // five times, plus one run of these six alone on the same build): largest p75 day step 128,
  // week step 208, Log past 168, theme chip 296, New task 216, picker 136 ms. Not profiled yet:
  // the reasons are Task 5.6's to find; the "why" says what the tap renders.
  dayStep: { ms: 160, owner: "Task 5.6", why: "Day renders the other date's list in the tap" },
  weekStep: { ms: 260, owner: "Task 5.6", why: "Week lays out the other week's grid in the tap" },
  logPast: { ms: 210, owner: "Task 5.6", why: "the sheet mounts its form in the tap's commit" },
  themeChip: { ms: 370, owner: "Task 5.6", why: "a theme change re-renders every mounted screen" },
  newTask: { ms: 270, owner: "Task 5.6", why: "the form mounts in the tap's commit" },
  picker: { ms: 170, owner: "Task 5.6", why: "the picker sheet mounts in the tap's commit" },
};

/** Notes how far a case with a ceiling is from the budget, and who owns closing the gap. */
const noteGap = (name: Case, result: number, ceiling: Ceiling): void => {
  const gap = result - BUDGET_MS;
  const where =
    gap > 0
      ? `${String(gap)} ms over the ${String(BUDGET_MS)} ms budget`
      : `within the ${String(BUDGET_MS)} ms budget: the owner deletes the ceiling`;
  test.info().annotations.push({
    description: `${name}: p75 ${String(result)} ms, ${where} (ceiling ${String(ceiling.ms)} ms); ${ceiling.owner}: ${ceiling.why}`,
    type: "over budget",
  });
};

/** The budget, or the case's ceiling while a later task owns its gap (`CEILINGS`). */
const expectWithinBudget = (name: Case, durations: readonly number[]): void => {
  const result = report(name, durations);
  const ceiling = CEILINGS[name];
  if (ceiling === undefined) {
    expect(result, `${name}: p75 within the budget`).toBeLessThanOrEqual(BUDGET_MS);
    return;
  }
  noteGap(name, result, ceiling);
  expect(result, `${name}: p75 within its regression ceiling`).toBeLessThanOrEqual(ceiling.ms);
};

test.use({ hasTouch: true, viewport: { height: 844, width: 390 } });

test.describe("a tap shows its result within 100 ms on a slow phone (p75 of 9)", () => {
  // One after another in one worker (the project is not fully parallel), but not "serial": a case
  // past its ceiling must not skip the others, whose numbers the next ceiling needs.
  test.describe.configure({ mode: "default" });

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

/** Goes somewhere by taps that are not timed, and waits for the page to be quiet there. */
const go = async (page: Page, steps: readonly Locator[], ready: Locator): Promise<void> => {
  for (const step of steps) {
    await step.tap();
  }
  await expect(ready).toBeVisible();
  await rest(page);
};

/**
Stepping a period back and forth: the reset button shows away from the current one and goes on
the way back, so each tap's result is the screen of the other period.
*/
const timeSteps = async (timeTap: TimeTap, page: Page, unit: "day" | "week") => {
  const back = page.getByRole("button", { name: "Back to today" });
  return await timeTaps(timeTap, (index) => {
    const isBack = index % 2 === 0;
    return {
      check: async () => {
        await expect(back).toHaveCount(isBack ? 1 : 0);
      },
      target: page.getByRole("button", { name: `${isBack ? "Previous" : "Next"} ${unit}` }),
    };
  });
};

/** Opening an overlay or a form: each tap opens it, an untimed Escape or close puts it away. */
const timeOpens = async (
  timeTap: TimeTap,
  page: Page,
  open: { readonly target: Locator; readonly shown: Locator; readonly close: () => Promise<void> },
) =>
  await timeTaps(timeTap, () => ({
    check: async () => {
      await expect(open.shown).toBeVisible();
      await open.close();
      await expect(open.shown).toHaveCount(0);
      await rest(page);
    },
    target: open.target,
  }));

/**
QA round 22 (R22-09): the other taps the person makes often, measured the same way. Their gaps
are Task 5.6's (render budget) like the four above; each has a ceiling until then.
*/
test.describe("the other frequent taps within 100 ms on a slow phone (p75 of 9)", () => {
  test.describe.configure({ mode: "default" });

  test("Day: previous and next day", async ({ page }) => {
    const timeTap = await openNow(page);
    const tabs = page.getByRole("tablist", { name: "Main" });
    await go(
      page,
      [tabs.getByRole("tab", { exact: true, name: "Day" })],
      page.getByRole("button", { name: "Previous day" }),
    );
    // The steps start on today: the reset is not there yet.
    await expect(page.getByRole("button", { name: "Back to today" })).toHaveCount(0);
    expectWithinBudget("dayStep", await timeSteps(timeTap, page, "day"));
  });

  test("Week: previous and next week", async ({ page }) => {
    const timeTap = await openNow(page);
    const tabs = page.getByRole("tablist", { name: "Main" });
    await go(
      page,
      [
        tabs.getByRole("tab", { exact: true, name: "More" }),
        page.getByRole("link", { name: "Week" }),
      ],
      page.getByRole("button", { name: "Previous week" }),
    );
    await expect(page.getByRole("button", { name: "Back to today" })).toHaveCount(0);
    expectWithinBudget("weekStep", await timeSteps(timeTap, page, "week"));
  });

  test("Day: opening Log past activity", async ({ page }) => {
    const timeTap = await openNow(page);
    const tabs = page.getByRole("tablist", { name: "Main" });
    const target = page.getByRole("button", { name: "Log past activity" });
    await go(page, [tabs.getByRole("tab", { exact: true, name: "Day" })], target);
    const what = page.getByRole("textbox", { exact: true, name: "What" });
    await expect(what).toHaveCount(0);
    const durations = await timeOpens(timeTap, page, {
      close: async () => {
        await page.keyboard.press("Escape");
      },
      shown: what,
      target,
    });
    expectWithinBudget("logPast", durations);
  });

  test("Settings: the theme chip", async ({ page }) => {
    const timeTap = await openNow(page);
    const tabs = page.getByRole("tablist", { name: "Main" });
    await go(
      page,
      [
        tabs.getByRole("tab", { exact: true, name: "More" }),
        page.getByRole("link", { name: "Settings" }),
      ],
      page.getByRole("radio", { name: "Light" }),
    );
    const order = [
      "Dark",
      "Light",
      "Dark",
      "Light",
      "Dark",
      "Light",
      "Dark",
      "Light",
      "Dark",
      "Light",
    ];
    const durations = await timeTaps(timeTap, (index) => {
      const chip = page.getByRole("radio", { exact: true, name: order[index] ?? "Light" });
      return {
        check: async () => {
          await expect(chip).toBeChecked();
        },
        target: chip,
      };
    });
    expectWithinBudget("themeChip", durations);
  });

  test("Now: opening the New task form", async ({ page }) => {
    const timeTap = await openNow(page);
    const form = page.getByRole("form", { name: "New task" });
    await expect(form).toHaveCount(0);
    const durations = await timeOpens(timeTap, page, {
      close: async () => {
        await form.getByRole("button", { name: "Close" }).tap();
      },
      shown: form,
      target: page.getByRole("button", { exact: true, name: "New task" }).last(),
    });
    expectWithinBudget("newTask", durations);
  });

  test("Now: opening a time-bar picker", async ({ page }) => {
    // Nothing runs on the seeded account, so the bar's tiles are out (no "Start something else").
    const timeTap = await openNow(page);
    const picker = page.getByRole("list", { name: "Rest" });
    await expect(picker).toHaveCount(0);
    const durations = await timeOpens(timeTap, page, {
      close: async () => {
        await page.keyboard.press("Escape");
      },
      shown: picker,
      target: page.getByRole("button", { exact: true, name: "Rest" }),
    });
    expectWithinBudget("picker", durations);
  });
});
