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

test("New task opens the empty form with the cursor in its title", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/day");
  await page.getByRole("navigation").getByRole("button", { name: "New task" }).click();
  await expect(page).toHaveURL(/\/$/u);
  const form = page.getByRole("form", { name: "New task" });
  await expect(form.getByRole("textbox", { exact: true, name: "Title" })).toBeFocused();
});

test("Settings says who is signed in; the sidebar shows no name (owner 2026-11-08)", async ({
  page,
}) => {
  await loginViaApi(page);
  await page.goto("/settings");
  await expect(page.getByText(/^Signed in as \S/u)).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByLabel(/^Signed in as /u)).toHaveCount(0);
});
