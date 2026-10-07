import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

test("a visitor is sent to the login card", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole("heading", { name: "Sign in to Pace" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("a signed-in session lands on Now", async ({ page }) => {
  await loginViaApi(page, "1002");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  await expectNoA11yViolations(page);
});
