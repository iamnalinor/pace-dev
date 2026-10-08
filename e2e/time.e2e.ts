import type { Locator, Page } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

const SIZES = [
  { account: "1005", height: 844, name: "phone", width: 390 },
  { account: "1006", height: 900, name: "desktop", width: 1440 },
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

for (const size of SIZES) {
  test.describe(`time tracking, ${size.name} (${String(size.width)}px)`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("switches activities from Now and edits a button by press and hold", async ({
      page,
    }, info) => {
      await loginViaApi(page, size.account);
      await page.goto("/");
      const bar = timeBar(page);
      await bar.getByRole("button", { name: "Work" }).click();
      await expect(bar.getByRole("button", { name: "Stop" })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Work", pressed: true })).toBeVisible();
      await bar.getByRole("button", { name: "Food" }).click();
      await expect(bar.getByText(/of ~30m/u)).toBeVisible();
      await expect(bar.getByRole("button", { name: "Work", pressed: false })).toBeVisible();
      await shoot(page, `now-running-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);

      // A touch hold raises the context menu, as a right click does: both open the editor.
      await bar.getByRole("button", { name: "Commute" }).click({ button: "right" });
      const name = page.getByRole("textbox", { name: "Name" });
      await expect(name).toBeVisible();
      await name.fill("Metro");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(bar.getByRole("button", { name: "Metro" })).toBeVisible();
      await bar.getByRole("button", { name: "Stop" }).click();
      await expect(bar.getByText("Nothing running. Tap an activity to start it.")).toBeVisible();
    });

    test("logs a past block on Day and sees it in Insights", async ({ page }, info) => {
      await loginViaApi(page, size.name === "phone" ? "1007" : "1008");
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
      await expect(page.getByRole("region", { name: "Time by category" })).toBeVisible();
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
  test(`uses a ${String(width)}px screen: wide list, rows inside the panels, no sideways scroll`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ height: 960, width });
    await loginViaApi(page, "1009");
    await page.goto("/");
    const line = page.getByRole("textbox", { name: "New task" });
    await line.fill(`renew the passport ${String(width)}`);
    await line.press("Enter");
    await expect(line).toHaveValue("");
    const composer = await boxOf(page.getByRole("region", { name: "New task" }));
    const row = await boxOf(
      page.getByRole("list", { name: "Tasks" }).getByRole("listitem").first(),
    );
    expect(composer.width).toBeGreaterThan(480);
    expect(row.left).toBeGreaterThanOrEqual(composer.left - 1);
    expect(row.right).toBeLessThanOrEqual(composer.right + 1);
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
