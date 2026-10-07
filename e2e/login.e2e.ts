import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

test("dev login → Now → tabs → Russian → logout", async ({ page }) => {
  await page.goto("/login");
  await expectNoA11yViolations(page);

  await page.getByLabel("Telegram id").fill("1919230638");
  await page.getByRole("button", { name: "Sign in as dev" }).click();
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expectNoA11yViolations(page);

  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Day" }).click();
  await expect(page.getByRole("heading", { name: "Day" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Day" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await nav.getByRole("link", { name: "Now" }).click();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("radio", { name: "Русский" }).click();
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основное" })).toBeVisible();

  // The language is an account setting: it survives a reload (IndexedDB) and the sync round trip.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/);
  // Logout keeps the local log (same person, same device), so the card stays in Russian.
  await expect(page.getByRole("heading", { name: "Вход в Pace" })).toBeVisible();
});

test("the theme choice is applied to <html> and kept per device", async ({ page }) => {
  await loginViaApi(page, "1001");
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});

test("the App Link landing hands the token to the Android intent", async ({ page }) => {
  await page.goto("/app/auth?token=abc123");
  const open = page.getByRole("link", { name: "Open in Pace" });
  await expect(open).toHaveAttribute(
    "href",
    "intent://pace.nalinor.dev/app/auth?token=abc123#Intent;scheme=https;package=dev.nalinor.pace;end",
  );
  await expectNoA11yViolations(page);
});

test("/oauth/authorize exists as the API's redirect target", async ({ page }) => {
  await page.goto("/oauth/authorize?client_id=x");
  await expect(page.getByRole("heading", { name: "Connecting an app" })).toBeVisible();
});
