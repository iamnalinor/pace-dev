import { devices, type Page } from "@playwright/test";

import { addTask, formByHand, nowTasks, taskForm } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

/**
The tags that held focus over the frames a sheet spends placing it (it tries for 30): sampled in
the page, every frame for 45 of them.
*/
const focusedOverFrames = async (page: Page): Promise<readonly string[]> =>
  await page.locator("body").evaluate(async (body) => {
    const view = body.ownerDocument.defaultView;
    const seen = new Set<string>();
    for (let frame = 0; frame < 45; frame += 1) {
      seen.add(body.ownerDocument.activeElement?.tagName ?? "");
      await new Promise((resolve) => view?.requestAnimationFrame(resolve));
    }
    return [...seen];
  });

// A touch phone: no fine pointer, no hover (QA 18 L5).
test.use({ hasTouch: devices["Pixel 7"].hasTouch, isMobile: devices["Pixel 7"].isMobile });

test("a touch screen shows no keyboard hints on its buttons (QA 18 L5)", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await loginViaApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  const hasFinePointer = await page
    .locator("body")
    .evaluate((body) => body.ownerDocument.defaultView?.matchMedia("(pointer: fine)").matches);
  expect(hasFinePointer).toBe(false);
  await formByHand(page).click();
  await expect(taskForm(page)).toBeVisible();
  await expect(page.getByText(/Ctrl\+Enter|⌘↵|Escape/u)).toHaveCount(0);
  await expect(page.locator("[aria-keyshortcuts]")).toHaveCount(0);
});

test("a touch screen's sheets put no text field in focus, so no keyboard covers them (fix round 5 V4)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ height: 844, width: 390 });
  await loginViaApi(page);
  await page.goto("/");
  const title = "Touch focus";
  await addTask(page, title);
  const opens: readonly (readonly [string, () => Promise<void>])[] = [
    [
      "Edit task",
      async () => {
        await nowTasks(page).getByText(title).click();
        await page.getByRole("button", { exact: true, name: "Edit" }).click();
      },
    ],
    [
      "Log past activity",
      async () => {
        await page.goto("/day");
        await page.getByRole("button", { name: "Log past activity" }).click();
      },
    ],
  ];
  const surface = page.locator('[data-pace-surface="sheet"]');
  for (const [sheet, open] of opens) {
    await open();
    await expect(surface, sheet).toBeVisible();
    const focused = await focusedOverFrames(page);
    expect({ focused, sheet }).toEqual({ focused: expect.not.arrayContaining(["INPUT"]), sheet });
    expect(focused).not.toContain("TEXTAREA");
    await page.keyboard.press("Escape");
    await expect(surface).toHaveCount(0);
  }
});

test("a wide touch screen's Task picker keeps its search closed until tapped (fix round 5 V4)", async ({
  page,
}) => {
  // A tablet in a browser: wide enough for the computer's layout, still no keyboard.
  await page.setViewportSize({ height: 800, width: 1280 });
  await loginViaApi(page);
  await page.goto("/");
  await page
    .getByRole("region", { name: "Time" })
    .getByRole("button", { exact: true, name: "Task" })
    .click();
  await expect(page.locator('[data-pace-surface="sheet"]')).toBeVisible();
  const focused = await focusedOverFrames(page);
  expect(focused).not.toContain("INPUT");
  expect(focused).not.toContain("TEXTAREA");
});
