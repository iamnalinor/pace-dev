import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";

test("home page renders and is accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pace" })).toBeVisible();
  await expectNoA11yViolations(page);
});
