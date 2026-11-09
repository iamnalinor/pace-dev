import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

/** The destinations whose large title must sit at one y (spec §5.0.2, F-LAY-02). */
const DESTINATIONS = [
  "/",
  "/day",
  "/week",
  "/inbox",
  "/projects",
  "/insights",
  "/history",
  "/settings",
] as const;

const VIEWPORTS = [
  { height: 900, width: 1440 },
  { height: 844, width: 390 },
] as const;

/** The top of the screen's level-1 title as drawn. */
const titleTop = async (page: Page, path: string): Promise<number> => {
  await page.goto(path);
  const title = page.getByRole("heading", { level: 1 }).first();
  await expect(title).toBeVisible();
  const box = await title.boundingBox();
  if (box === null) {
    throw new Error(`no box for the title of ${path}`);
  }
  return box.y;
};

for (const viewport of VIEWPORTS) {
  test(`every destination's title sits at the same y at ${String(viewport.width)} (F-LAY-02)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loginViaApi(page);
    const tops: Record<string, number> = {};
    for (const path of DESTINATIONS) {
      tops[path] = await titleTop(page, path);
    }
    const first = tops["/"] ?? NaN;
    for (const path of DESTINATIONS) {
      expect(
        Math.abs((tops[path] ?? NaN) - first),
        `${path} ${JSON.stringify(tops)}`,
      ).toBeLessThanOrEqual(1);
    }
  });
}

test("a tablet's window (800) has the navigation rail and no tab bar (spec §5.0.1, F-LAY-04)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1100, width: 800 });
  await loginViaApi(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(8);
  await expect(page.getByTestId("tab-bar")).toHaveCount(0);
  // A destination is top level beside the rail: no Back.
  await nav.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
});

test("the skip link is the first stop and moves the keyboard into main (F-A11Y-12)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await loginViaApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("a phone turned sideways (844 × 390) reaches every rail destination by scrolling the rail", async ({
  page,
}) => {
  await page.setViewportSize({ height: 390, width: 844 });
  await loginViaApi(page);
  await page.goto("/");
  const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
  await expect(links).toHaveCount(8);
  const all = await links.all();
  for (const link of all) {
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport({ ratio: 1 });
  }
  // The last one is really pressable from there.
  await links.last().click();
  await expect(page).toHaveURL(/\/settings$/u);
});

test("at 1440 the wheel over the gutter scrolls a long screen (F-WEB-05, the region scroller)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await loginViaApi(page);
  await page.goto("/settings");
  const title = page.getByRole("heading", { level: 1, name: "Settings" });
  await expect(title).toBeVisible();
  const scrolled = async (): Promise<number> =>
    await page.evaluate(() =>
      Math.max(
        ...[...globalThis.document.querySelectorAll("*")].map((element) => element.scrollTop),
      ),
    );
  expect(await scrolled()).toBe(0);
  // The right gutter, past the column: no control there, only the region's scroller.
  await page.mouse.move(1440 - 40, 600);
  await page.mouse.wheel(0, 400);
  await expect.poll(scrolled).toBeGreaterThan(0);
});

test("a phone keeps the tab bar on More's destinations, More current, and Back leads to More (spec §4.2.27, F-AND-03)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await loginViaApi(page);
  const bar = page.getByTestId("tab-bar");
  const more = bar.getByRole("link", { exact: true, name: "More" });
  for (const name of ["Week", "Projects", "Insights", "History", "Settings"]) {
    await page.goto("/more");
    await page.getByRole("link", { exact: true, name }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(bar).toBeVisible();
    await expect(more).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/more$/u);
  }
  // A destination opened straight by its address goes back to More as well.
  await page.goto("/notifications");
  await expect(bar).toBeVisible();
  await expect(more).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/more$/u);
});
