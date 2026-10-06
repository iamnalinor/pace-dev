import {
  expect,
  expectNoA11yViolations,
  newCredentials,
  signIn,
  signUp,
  test,
} from "./support/fixtures.ts";

test("a guest is sent to sign-in and returned to the requested page afterwards", async ({
  page,
}) => {
  const user = newCredentials("Guest");
  await signUp(page, user);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // The client redirect to /sign-in can abort this navigation before "load".
  await page.goto("/?from=bookmark", { waitUntil: "commit" });
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await signIn(page, user);

  await expect(page).toHaveURL(/\/\?from=bookmark$/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("the session survives a reload (HttpOnly cookie through the proxy)", async ({ page }) => {
  const user = newCredentials("Reload");
  await signUp(page, user);

  await page.reload();

  await expect(page.getByRole("navigation").getByText(user.name, { exact: true })).toBeVisible();
});

test("wrong password shows an error and keeps the user on sign-in", async ({ page }) => {
  const user = newCredentials("Wrong");
  await signUp(page, user);
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, { ...user, password: "not the password" });

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("auth pages are accessible", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("signing out returns to sign-in", async ({ page }) => {
  const user = newCredentials("Leaver");
  await signUp(page, user);

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, user);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("switching accounts never shows the previous user's data", async ({ page }) => {
  const first = newCredentials("First");
  const second = newCredentials("Second");
  await signUp(page, first);
  await expect(page.getByRole("navigation").getByText(first.name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await signUp(page, second);

  await expect(page.getByRole("navigation").getByText(second.name, { exact: true })).toBeVisible();
  await expect(page.getByText(first.name, { exact: true })).toHaveCount(0);
});
