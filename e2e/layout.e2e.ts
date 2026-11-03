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
  await expect(page.getByRole("tablist")).toHaveCount(0);
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
