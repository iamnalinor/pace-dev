import { devices } from "@playwright/test";

import { formByHand, taskForm } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

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
