import type { Locator, Page } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

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

const timeBar = (page: Page) => page.getByRole("region", { name: "Time" });

/** A press held until `opened` shows, as a finger does it (the long press fires while held). */
const hold = async (page: Page, target: Locator, opened: Locator): Promise<void> => {
  await target.hover();
  await page.mouse.down();
  await expect(opened).toBeVisible();
  await page.mouse.up();
};

for (const size of SIZES) {
  test.describe(`time tracking, ${size.name} (${String(size.width)}px)`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("switches activities from Now and edits a button by press and hold", async ({
      page,
    }, info) => {
      await loginViaApi(page);
      await page.goto("/");
      const bar = timeBar(page);
      // Work asks for details first: what exactly, which task; Start begins it.
      await bar.getByRole("switch", { name: "Work" }).click();
      // A sheet renders outside the app's root: it must still carry the theme (contrast).
      await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
      await expectNoA11yViolations(page);
      await page.getByRole("button", { name: "Start" }).click();
      await expect(bar.getByRole("button", { name: "Stop" })).toBeVisible();
      await expect(bar.getByRole("switch", { name: "Work" })).toBeChecked();
      await bar.getByRole("switch", { name: "Food" }).click();
      await expect(bar.getByText(/of ~30m/u)).toBeVisible();
      await expect(bar.getByRole("switch", { name: "Work" })).not.toBeChecked();
      await shoot(page, `now-running-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);

      const change = page.getByRole("button", { name: "Change the button" });
      await hold(page, bar.getByRole("switch", { name: "Commute" }), change);
      await change.click();
      const name = page.getByRole("textbox", { name: "Name" });
      await name.fill("Metro");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(bar.getByRole("switch", { name: "Metro" })).toBeVisible();
      await bar.getByRole("button", { name: "Stop" }).click();
      await expect(bar.getByRole("textbox", { name: "What are you doing?" })).toBeVisible();
    });

    test("logs a past block on Day and sees it in Insights", async ({ page }, info) => {
      await loginViaApi(page);
      await page.goto("/day");
      await expect(page.getByRole("heading", { level: 1, name: "Day" })).toBeVisible();
      await page.getByRole("button", { name: "Log past activity" }).click();
      await page.getByRole("textbox", { name: "What" }).fill("Lecture");
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
    const line = page.getByRole("textbox", { name: "New task" });
    await line.fill(`renew the passport ${String(width)}`);
    await line.press("Enter");
    await expect(line).toHaveValue("");
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
