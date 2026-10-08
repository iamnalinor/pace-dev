import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

test("dev login → Now → tabs → Russian → logout", async ({ page }) => {
  await page.goto("/login");
  await expectNoA11yViolations(page);

  await page.getByLabel("Telegram id").fill("1919230638");
  await page.getByRole("button", { name: "Sign in as dev" }).click();
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/u);
  await expectNoA11yViolations(page);

  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("tab", { name: "Day" }).click();
  await expect(page.getByRole("heading", { name: "Day" })).toBeVisible();
  await expect(nav.getByRole("tab", { name: "Day" })).toHaveAttribute("aria-selected", "true");
  await nav.getByRole("tab", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await nav.getByRole("tab", { name: "Now" }).click();

  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("radio", { name: "Русский" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();

  // The language is an account setting: it survives a reload (IndexedDB) and the sync round trip.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  // Logout drops the local copy of the log, the language with it: the card is in English again.
  await expect(page.getByRole("heading", { name: "Sign in to Pace" })).toBeVisible();
});

test("the theme choice is kept per device and paints the page", async ({ page }) => {
  await loginViaApi(page, "1001");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings");
  // The heading's ink follows the theme (dark text on light, light text on dark).
  const background = async (): Promise<string> =>
    await page
      .getByRole("heading", { level: 1, name: "Settings" })
      .evaluate((heading) => getComputedStyle(heading).color);
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
  const light = await background();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
  expect(await background()).toBe(light);
  await page.getByRole("radio", { name: "System" }).click();
  await expect.poll(background).not.toBe(light);
});

test("the App Link landing offers to open the app", async ({ page }) => {
  await page.goto("/app/auth?token=abc123");
  await expect(page.getByRole("button", { name: "Open in Pace" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("/oauth/authorize exists as the API's redirect target", async ({ page }) => {
  await page.goto("/oauth/authorize?client_id=x");
  await expect(page.getByRole("heading", { name: "Connecting an app" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("not a valid connection request");
});
