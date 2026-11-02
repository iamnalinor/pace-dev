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

test("the sidebar shows who is signed in, readable in full (QA 17 M6)", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const who = nav.getByLabel(/^Signed in as /u);
  await expect(who).toBeVisible();
  const name = who.getByText(/\S/u).last();
  // Not cut: the text fits its box (it was 23 px wide, "D…").
  const isFits = await name.evaluate((node) => node.scrollWidth <= node.clientWidth);
  expect(isFits).toBe(true);
  expect((await name.boundingBox())?.width ?? 0).toBeGreaterThan(20);
});
