import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

test("a visitor is sent to the login card", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("heading", { name: "Sign in to Pace" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("a signed-in session lands on Now", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("New task puts the cursor in the composer", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New task" }).click();
  await expect(page).toHaveURL(/\/add$/u);
  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
});
