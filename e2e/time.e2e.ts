import type { Locator, Page } from "@playwright/test";

import { addTask, approve, deleteOpenTask, nowTasks } from "./support/composer.ts";
import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { controlsUnder } from "./support/geometry.ts";
import { API_URL, loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";
import { typedField } from "./support/time-bar.ts";

const SIZES = [
  { height: 844, name: "phone", width: 390 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

/** Screenshots for review land here when set (the run's output folder otherwise). */
const SHOT_DIR = process.env["E2E_SHOT_DIR"];

const shoot = async (
  page: Page,
  name: string,
  outputPath: (name: string) => string,
): Promise<void> => {
  await page.screenshot({
    fullPage: true,
    path: SHOT_DIR === undefined ? outputPath(`${name}.png`) : `${SHOT_DIR}/${name}.png`,
  });
};

/** How far above `below` the bottom of `above` ends (negative when they overlap). */
const gapAbove = async (above: Locator, below: Locator): Promise<number> => {
  const [top, bottom] = await Promise.all([above.boundingBox(), below.boundingBox()]);
  if (top === null || bottom === null) {
    throw new Error("both boxes must be on the screen");
  }
  return bottom.y - (top.y + top.height);
};

/** The air between two boxes that do not overlap, on whichever side they meet (0 if touching). */
const gapBeside = async (one: Locator, other: Locator): Promise<number> => {
  const [a, b] = await Promise.all([one.boundingBox(), other.boundingBox()]);
  if (a === null || b === null) {
    throw new Error("both boxes must be on the screen");
  }
  const across = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const along = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.max(across, along);
};

const timeBar = (page: Page) => page.getByRole("region", { name: "Time" });

for (const size of SIZES) {
  test.describe(`time tracking, ${size.name} (${String(size.width)}px)`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("on Now: every button opens its picker, a pick starts, one runs alongside, one is typed", async ({
      page,
    }, info) => {
      // Every picker, three axe passes and seven shots: longer than the default.
      test.setTimeout(90_000);
      await loginViaApi(page);
      await page.goto("/");
      await addTask(page, `Write the lab report ${size.name}`);
      const bar = timeBar(page);
      // Four buttons, nothing else: no «⋯», no switches.
      await expect(bar.getByRole("button", { name: /^(Calendar|Task|Chores|Misc)$/u })).toHaveCount(
        4,
      );
      await expect(page.getByRole("button", { name: /More about/u })).toHaveCount(0);
      await expect(bar.getByRole("switch")).toHaveCount(0);

      // Each tap opens its picker; the sheet renders outside the app's root and keeps the theme.
      await bar.getByRole("button", { name: "Calendar", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Start a meeting without an event" }),
      ).toBeVisible();
      await shoot(page, `day-picker-calendar-${size.name}`, (name) => info.outputPath(name));
      await page.keyboard.press("Escape");

      await bar.getByRole("button", { name: "Task", exact: true }).click();
      const tasks = page.getByRole("list", { name: "Task" });
      await expect(
        tasks.getByRole("button", { name: `Write the lab report ${size.name}` }),
      ).toBeVisible();
      await page.getByRole("searchbox", { name: "Find a task" }).fill("zzz");
      await expect(page.getByText("No open task matches.")).toBeVisible();
      await page.getByRole("searchbox", { name: "Find a task" }).fill("lab report");
      await shoot(page, `day-picker-task-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);
      await tasks.getByRole("button", { name: `Write the lab report ${size.name}` }).click();
      await expect(bar.getByRole("button", { name: "Task, running" })).toBeVisible();

      await bar.getByRole("button", { name: "Misc", exact: true }).click();
      const rest = page.getByRole("list", { name: "Misc" });
      await expect(rest.getByRole("button")).toHaveText([
        /Short break/u,
        /Rest/u,
        /Walk/u,
        /Workout/u,
        /Nap/u,
        /Sleep/u,
      ]);
      await shoot(page, `day-picker-rest-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);
      await rest.getByRole("button", { name: "Walk" }).click();
      await expect(bar.getByRole("button", { name: "Misc, running" })).toBeVisible();
      await expect(bar.getByText(/of ~30m/u)).toBeVisible();

      // Chores: a pick switches over from what ran.
      await bar.getByRole("button", { name: "Chores", exact: true }).click();
      await shoot(page, `day-picker-chores-${size.name}`, (name) => info.outputPath(name));
      await page.getByRole("button", { name: "Getting ready" }).click();
      await expect(bar.getByRole("button", { name: "Chores, running" })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Misc", exact: true })).toBeVisible();

      // A workout alongside, from the switch in the picker's header.
      await bar.getByRole("button", { name: "Misc", exact: true }).click();
      await page.getByLabel("Alongside what is running").click();
      await page.getByRole("button", { name: "Workout" }).click();
      await expect(bar.getByRole("button", { name: "Stop: Getting ready" })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Stop: Workout" })).toBeVisible();
      // Two running: the bar (and on a phone the nav bar) stay within 40 % of the window, the
      // second one a compact row in the same card, never a card cut under the tiles (spec §5.1,
      // design review B2; docs/design.md 2026-11-10 says what the budget guarantees). The field folds
      // once the bar is left alone over the budget.
      await expect(bar.getByTestId("running-card")).toHaveCount(1);
      await expect
        .poll(
          async () => {
            const box = await bar.boundingBox();
            return box === null ? Infinity : size.height - box.y;
          },
          { timeout: 10_000 },
        )
        .toBeLessThanOrEqual(size.height * 0.4);
      await typedField(bar, { field: "What are you doing?", unfold: "Start something else" });

      // The running button's picker offers Stop first.
      await bar.getByRole("button", { name: "Chores, running" }).click();
      await shoot(page, `day-picker-stop-${size.name}`, (name) => info.outputPath(name));
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expect(bar.getByRole("button", { name: "Stop: Getting ready" })).toHaveCount(0);
      await shoot(page, `day-bar-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);

      // Typed: it starts at once, its length becomes the Expect.
      const typed = bar.getByRole("textbox", { name: "What are you doing?" });
      await typed.fill("Пошел в ЦСС, 20мин");
      await typed.press("Enter");
      // A phone opens the proposal as a sheet (it never scrolls under the tiles, design review
      // B2); a computer shows it in the bar above the field.
      await approve(
        size.name === "phone" ? page.locator('[data-pace-sheet="time-proposal"]') : bar,
      );
      await expect(bar.getByRole("button", { name: "Stop: Пошел в ЦСС" })).toBeVisible();
      await expect(bar.getByText(/of ~20m/u)).toBeVisible();
      await bar.getByRole("button", { name: "Stop: Пошел в ЦСС" }).click();
      await bar.getByRole("button", { name: "Stop: Workout" }).click();
      await expect(bar.getByRole("button", { name: /^Stop/u })).toHaveCount(0);
    });

    test("Now keeps the full running panel with its task rows and Stop controls", async ({
      page,
    }, info) => {
      await loginViaApi(page);
      await page.goto("/");
      await addTask(page, `Planes and lines ${size.name}`);
      await expect(timeBar(page)).toBeVisible();
      await expect(timeBar(page).getByText("Walk")).toHaveCount(0);
      await timeBar(page).getByRole("button", { name: "Misc", exact: true }).click();
      await page.getByRole("list", { name: "Misc" }).getByRole("button", { name: "Walk" }).click();
      await expect(timeBar(page).getByRole("button", { name: "Misc, running" })).toBeVisible();
      const running = timeBar(page);
      await expect(running.getByText("Walk")).toBeVisible();
      const firstRow = nowTasks(page).getByRole("listitem").first();
      await expect(firstRow).toBeVisible();
      await shoot(page, `now-running-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);
      await page.goto("/day");
      await expect(page.getByRole("heading", { level: 1, name: "Day" })).toBeVisible();
      await expect(timeBar(page)).toHaveCount(0);
      // The red now line is there on every size and theme, its time inside the timeline's edge
      // (design review H4: missing on the phone and in dark; the time ran past the card).
      const margin = page.getByTestId("now-margin");
      await expect(margin).toBeVisible();
      const [line, timeline] = await Promise.all([
        margin.getByText(/^\d{2}:\d{2}$/u).boundingBox(),
        page.getByTestId("day-timeline").boundingBox(),
      ]);
      expect((line?.x ?? Infinity) + (line?.width ?? 0)).toBeLessThanOrEqual(
        (timeline?.x ?? 0) + (timeline?.width ?? 0),
      );
      await page.goto("/");
      await timeBar(page).getByRole("button", { name: "Stop: Walk" }).click();
      await expect(timeBar(page).getByRole("button", { name: "Stop: Walk" })).toHaveCount(0);
    });

    test("logs a past block on Day and sees it in Insights", async ({ page }, info) => {
      await loginViaApi(page);
      await page.goto("/day");
      await expect(page.getByRole("heading", { level: 1, name: "Day" })).toBeVisible();
      await page.getByRole("button", { name: "Log past activity" }).click();
      await page.getByRole("textbox", { exact: true, name: "What" }).fill("Lecture");
      await page.getByRole("radio", { name: "Study" }).click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Lecture")).toBeVisible();
      await shoot(page, `day-${size.name}`, (shot) => info.outputPath(shot));
      await expectNoA11yViolations(page);
      await page.goto("/insights");
      await expect(page.getByRole("group", { name: "Time by category" })).toBeVisible();
      await expect(page.getByText(/Study/u).first()).toBeVisible();
      await shoot(page, `insights-${size.name}`, (shot) => info.outputPath(shot));
      await expectNoA11yViolations(page);
    });
  });
}

const MINUTE = 60_000;

/** `activity.started` as a client pushes it, `minutesAgo` before now. */
const started = (minutesAgo: number, payload: Readonly<Record<string, unknown>>) => {
  const at = Date.now() - minutesAgo * MINUTE;
  return {
    deviceId: "e2e-time",
    id: ulid(at),
    occurredAt: new Date(at).toISOString(),
    payload: { activityId: ulid(at), ...payload },
    precision: "exact",
    recordedAt: new Date().toISOString(),
    source: "web",
    type: "activity.started",
  };
};

test.describe("the time bar's budget while it asks, phone (390px)", () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test("two running, the first past twice its Expect: the question keeps the bar within 40 %", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    const response = await pushAsClient(token, [
      started(122, { category: "other", expectMinutes: 20, label: "Went to the study centre" }),
      started(92, { alongside: true, category: "rest", label: "Music" }),
    ]);
    expect(response.ok).toBe(true);
    await page.goto("/");
    const bar = timeBar(page);
    // The state every lived-in shot is in (design review 2 N3): «Ещё занимаетесь?» on a row of its
    // own took the bar and the nav bar to 377 of 844 px. It now sits on the name's second line,
    // with "Yes, still" beside Stop, and the fold row has no gap of its own above or below.
    await expect(bar.getByText("Still doing this?")).toBeVisible();
    await expect(bar.getByRole("button", { name: "Yes, still" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Stop: Music" })).toBeVisible();
    await expect
      .poll(
        async () => {
          const box = await bar.boundingBox();
          return box === null ? Infinity : 844 - box.y;
        },
        { timeout: 10_000 },
      )
      .toBeLessThanOrEqual(844 * 0.4);
    // «Start something else» starts on the card's edge, not at a list row's inset.
    const [more, card] = await Promise.all([
      bar.getByRole("button", { name: "Start something else" }).boundingBox(),
      bar.getByTestId("running-card").boundingBox(),
    ]);
    expect(more?.x).toBe(card?.x);
    await bar.getByRole("button", { name: "Yes, still" }).click();
    await expect(bar.getByText("Still doing this?")).toHaveCount(0);
    await expect(bar.getByText(/of ~20m/u)).toBeVisible();
  });
});

/** The element's box; a missing one fails the test at once. */
const boxOf = async (locator: Locator): Promise<{ left: number; right: number; width: number }> => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("element is not on the page");
  }
  return { left: box.x, right: box.x + box.width, width: box.width };
};

for (const width of [1440, 1920]) {
  test(`uses a ${String(width)}px screen: wide list, rows inside it, no sideways scroll`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ height: 960, width });
    await loginViaApi(page);
    await page.goto("/");
    await addTask(page, `renew the passport ${String(width)}`);
    const list = nowTasks(page);
    const box = await boxOf(list);
    const row = await boxOf(list.getByRole("listitem").first());
    expect(box.width).toBeGreaterThan(480);
    expect(row.left).toBeGreaterThanOrEqual(box.left - 1);
    expect(row.right).toBeLessThanOrEqual(box.right + 1);
    const scrollWidth = await page.locator("html").evaluate((element) => element.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
    await shoot(page, `now-${String(width)}`, (shot) => info.outputPath(shot));

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByRole("textbox", { name: "Project name" }).fill(`Algebra ${String(width)}`);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: `Algebra ${String(width)}` })).toBeVisible();
    await shoot(page, `projects-${String(width)}`, (shot) => info.outputPath(shot));
  });
}

for (const size of SIZES) {
  test(`a toast covers none of the time bar's buttons (${size.name})`, async ({ page }) => {
    await loginViaApi(page);
    await page.setViewportSize({ height: size.height, width: size.width });
    await page.goto("/");
    // Deleting a task says so in a toast (with Undo); the bar is below it on Now.
    await addTask(page, `Toast ${size.name}`);
    await nowTasks(page).getByText(`Toast ${size.name}`).click();
    await deleteOpenTask(page);
    const toast = page.getByTestId("toast-card");
    await expect(toast).toBeVisible();
    // In the app, not a reload: a reload would drop the toast.
    await page
      .getByRole("link", { exact: true, name: "Now" })
      .or(page.getByRole("tab", { exact: true, name: "Now" }))
      .click();
    const bar = timeBar(page);
    await expect(bar).toBeVisible();
    await expect(toast).toBeVisible();
    // Above the bar on a phone and on a computer alike: over none of its buttons.
    expect(await controlsUnder(page, '[data-testid="toast-card"]')).toEqual([]);
  });
}

test("the greyed Calendar button says why the moment the pointer is over it", async ({ page }) => {
  await loginViaApi(page);
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  const calendar = timeBar(page).getByRole("button", { exact: true, name: "Calendar" });
  await expect(calendar).toHaveAttribute("aria-describedby", /.+/u);
  await calendar.hover();
  const tooltip = page.getByRole("tooltip");
  // No toast and no delay: the bubble is there at once, right beside the button, on the first
  // side where it covers no other control (the typed field above the bar: bug class 6).
  await expect(tooltip).toBeVisible({ timeout: 300 });
  await expect(page.getByTestId("toast-card")).toHaveCount(0);
  expect(await gapBeside(tooltip, calendar)).toBeLessThan(16);
  expect(await controlsUnder(page, '[role="tooltip"]', ["Calendar"])).toEqual([]);
  await expectNoA11yViolations(page);
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
});

test("the Calendar picker on the web offers no phone calendar to set up (QA 19 L6)", async ({
  page,
}) => {
  await loginViaApi(page);
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await timeBar(page).getByRole("button", { exact: true, name: "Calendar" }).click();
  const sheet = page.locator('[data-pace-surface="sheet"], [data-testid="popover-surface"]');
  await expect(
    sheet.getByRole("button", { name: "Start a meeting without an event" }),
  ).toBeVisible();
  await expect(sheet.getByText("Nothing on in your calendar right now.")).toBeVisible();
  await expect(sheet.getByText(/Calendar from the phone|Android/u)).toHaveCount(0);
});

test.describe("the calendar's Attend or skip on Now, phone (390px)", () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test("sits above the task rows, never over them, and Attend starts an event going on", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    await page.goto("/");
    await addTask(page, "Planes and lines homework");
    await addTask(page, "Reformat the thesis");
    // What the phone sends of its calendar: a colloquium on for an hour and a half already.
    const now = Date.now();
    const synced = await fetch(`${API_URL}/api/calendar/sync`, {
      body: JSON.stringify({
        deviceId: "e2e-phone",
        events: [
          {
            endAt: new Date(now + 90 * 60_000).toISOString(),
            id: "ev-colloquium",
            series: null,
            startAt: new Date(now - 92 * 60_000).toISOString(),
            title: "Colloquium",
          },
        ],
        from: new Date(now - 12 * 3_600_000).toISOString(),
        to: new Date(now + 12 * 3_600_000).toISOString(),
      }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    expect(synced.status).toBe(200);
    // The rows are drawn first, the card arrives after the calendar is read: the owner's order.
    await page.reload();
    const prompt = page.getByRole("region", { name: "From your calendar" });
    await expect(prompt.getByText("Colloquium")).toBeVisible();
    const firstRow = nowTasks(page).getByRole("listitem").first();
    await expect(firstRow).toBeVisible();
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    expect(await gapAbove(prompt, firstRow)).toBeGreaterThanOrEqual(0);

    await prompt.getByRole("button", { name: "Attend" }).click();
    await expect(prompt).toBeHidden();
    await expect(page.getByText("That time is in the future.")).toHaveCount(0);
    await expect(timeBar(page).getByText("Colloquium")).toBeVisible();
  });
});

test("the phone's activity sheet keeps Save in view without a scroll, Delete below the fields (QA round 25 R25-10)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await loginViaApi(page);
  await page.goto("/day");
  await page.getByRole("button", { name: "Log past activity" }).click();
  await page.getByLabel("What", { exact: true }).fill("Commute");
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await page.getByRole("button", { name: /Commute/u }).click();
  const save = page.getByRole("button", { exact: true, name: "Save" });
  await expect(save).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Delete activity" })).toBeAttached();
});

test("the phone's activity sheet scrolls an error under To into view above the pinned Save (QA round 26 R26-01)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  // Yesterday noon on the page's clock: Log past offers 11:30–12:00.
  const noon = new Date();
  noon.setDate(noon.getDate() - 1);
  noon.setHours(12, 0, 0, 0);
  await page.clock.setFixedTime(noon);
  await loginViaApi(page);
  await page.goto("/day");
  const save = page.getByRole("button", { exact: true, name: "Save" });
  await page.getByRole("button", { name: "Log past activity" }).click();
  await page.getByLabel("What", { exact: true }).fill("Commute");
  await save.click();
  await expect(page.getByRole("button", { name: /Commute/u })).toBeVisible();
  // 10:00 to noon runs into Commute: said under To, four lines in its half of the row.
  await page.getByRole("button", { name: "Log past activity" }).click();
  await page.getByLabel("What", { exact: true }).fill("Nap");
  await page.getByLabel("From", { exact: true }).fill("10:00");
  await page.getByLabel("To", { exact: true }).fill("12:00");
  const body = page.getByTestId("overlay-body");
  expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
  await save.click();
  const error = page
    .getByRole("alert")
    .filter({ hasText: "That runs into the next activity: move its start first." });
  await expect(error).toBeInViewport({ ratio: 1 });
  // Whole above the footer's Save, not under it: the body moved to show it.
  await expect.poll(async () => await gapAbove(error, save)).toBeGreaterThanOrEqual(0);
  expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
