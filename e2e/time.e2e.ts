import type { Locator, Page } from "@playwright/test";

import { addTask } from "./support/composer.ts";
import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { API_URL, loginViaApi } from "./support/login.ts";

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

const timeBar = (page: Page) => page.getByRole("region", { name: "Time" });

for (const size of SIZES) {
  test.describe(`time tracking, ${size.name} (${String(size.width)}px)`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("on Day: every button opens its picker, a pick starts, one runs alongside, one is typed", async ({
      page,
    }, info) => {
      // Every picker, three axe passes and seven shots: longer than the default.
      test.setTimeout(90_000);
      await loginViaApi(page);
      await page.goto("/");
      await addTask(page, `Write the lab report ${size.name}`);
      await page.goto("/day");
      const bar = timeBar(page);
      // Four buttons, nothing else: no «⋯», no switches.
      await expect(bar.getByRole("button", { name: /^(Calendar|Task|Chores|Rest)$/u })).toHaveCount(
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
      await page.getByRole("textbox", { name: "Find a task" }).fill("zzz");
      await expect(page.getByText("No open task matches.")).toBeVisible();
      await page.getByRole("textbox", { name: "Find a task" }).fill("lab report");
      await shoot(page, `day-picker-task-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);
      await tasks.getByRole("button", { name: `Write the lab report ${size.name}` }).click();
      await expect(bar.getByRole("button", { name: "Task, running" })).toBeVisible();

      await bar.getByRole("button", { name: "Rest", exact: true }).click();
      const rest = page.getByRole("list", { name: "Rest" });
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
      await expect(bar.getByRole("button", { name: "Rest, running" })).toBeVisible();
      await expect(bar.getByText(/of ~30m/u)).toBeVisible();

      // Chores: a pick switches over from what ran.
      await bar.getByRole("button", { name: "Chores", exact: true }).click();
      await shoot(page, `day-picker-chores-${size.name}`, (name) => info.outputPath(name));
      await page.getByRole("button", { name: "Getting ready" }).click();
      await expect(bar.getByRole("button", { name: "Chores, running" })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Rest", exact: true })).toBeVisible();

      // A workout alongside, from the switch in the picker's header.
      await bar.getByRole("button", { name: "Rest", exact: true }).click();
      await page.getByLabel("Alongside what is running").click();
      await page.getByRole("button", { name: "Workout" }).click();
      await expect(bar.getByRole("button", { name: "Stop: Getting ready" })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Stop: Workout" })).toBeVisible();

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
      await expect(bar.getByRole("button", { name: "Stop: Пошел в ЦСС" })).toBeVisible();
      await expect(bar.getByText(/of ~20m/u)).toBeVisible();
      await bar.getByRole("button", { name: "Stop: Пошел в ЦСС" }).click();
      await bar.getByRole("button", { name: "Stop: Workout" }).click();
      await expect(bar.getByRole("button", { name: /^Stop/u })).toHaveCount(0);
    });

    test("Now shows what runs in one row above the tasks; Stop there, the row opens Day", async ({
      page,
    }, info) => {
      await loginViaApi(page);
      await page.goto("/");
      await addTask(page, `Planes and lines ${size.name}`);
      await expect(page.getByRole("region", { name: "Time" })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Running now" })).toHaveCount(0);
      await page.goto("/day");
      await timeBar(page).getByRole("button", { name: "Rest", exact: true }).click();
      await page.getByRole("list", { name: "Rest" }).getByRole("button", { name: "Walk" }).click();
      await expect(timeBar(page).getByRole("button", { name: "Rest, running" })).toBeVisible();
      await page.goto("/");
      const running = page.getByRole("region", { name: "Running now" });
      await expect(running.getByText("Walk")).toBeVisible();
      const firstRow = page.getByRole("list", { name: "Tasks" }).getByRole("listitem").first();
      await expect(firstRow).toBeVisible();
      await page.waitForFunction(() =>
        document.getAnimations().every((animation) => animation.playState !== "running"),
      );
      expect(await gapAbove(running, firstRow)).toBeGreaterThanOrEqual(0);
      await shoot(page, `now-running-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);
      await running.getByRole("link").click();
      await expect(page.getByRole("heading", { level: 1, name: "Day" })).toBeVisible();
      await page.goto("/");
      await page
        .getByRole("region", { name: "Running now" })
        .getByRole("button", { name: "Stop: Walk" })
        .click();
      await expect(page.getByRole("region", { name: "Running now" })).toHaveCount(0);
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
    const list = page.getByRole("list", { name: "Tasks" });
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
  test(`a toast floats above the time bar, not over its buttons (${size.name})`, async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.setViewportSize({ height: size.height, width: size.width });
    await page.goto("/");
    // Deleting a task says so in a toast (with Undo); it is still up on Day, where the bar is.
    await addTask(page, `Toast ${size.name}`);
    await page.getByRole("list", { name: "Tasks" }).getByText(`Toast ${size.name}`).click();
    await page.getByRole("button", { name: "Delete the task" }).click();
    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible();
    await page
      .getByRole("link", { name: "Day" })
      .or(page.getByRole("tab", { name: "Day" }))
      .click();
    const bar = timeBar(page);
    await expect(bar).toBeVisible();
    await expect(toast).toBeVisible();
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    const toastBox = await toast.boundingBox();
    const barBox = await bar.boundingBox();
    expect(toastBox).not.toBeNull();
    expect(barBox).not.toBeNull();
    expect((toastBox?.y ?? 0) + (toastBox?.height ?? 0)).toBeLessThanOrEqual(barBox?.y ?? 0);
  });
}

test("the greyed Calendar button says why the moment the pointer is over it", async ({ page }) => {
  await loginViaApi(page);
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/day");
  const calendar = timeBar(page).getByRole("button", { exact: true, name: "Calendar" });
  await expect(calendar).toHaveAttribute("aria-describedby", /.+/u);
  await calendar.hover();
  const tooltip = page.getByRole("tooltip");
  // No toast and no delay: the bubble is there at once, right above the button.
  await expect(tooltip).toBeVisible({ timeout: 300 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  const gap = await gapAbove(tooltip, calendar);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(16);
  await expectNoA11yViolations(page);
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
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
    const firstRow = page.getByRole("list", { name: "Tasks" }).getByRole("listitem").first();
    await expect(firstRow).toBeVisible();
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    expect(await gapAbove(prompt, firstRow)).toBeGreaterThanOrEqual(0);

    await prompt.getByRole("button", { name: "Attend" }).click();
    await expect(prompt).toBeHidden();
    await expect(page.getByText("That time is in the future.")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Running now" }).getByText("Colloquium"),
    ).toBeVisible();
  });
});
