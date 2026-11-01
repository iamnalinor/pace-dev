import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { DEV_TELEGRAM_ID, loginViaApi, resetAccount } from "./support/login.ts";

test("dev login → Now → tabs → Russian → logout", async ({ page }) => {
  await resetAccount(DEV_TELEGRAM_ID);
  await page.goto("/login");
  await expectNoA11yViolations(page);

  await page.getByLabel("Telegram id").fill(DEV_TELEGRAM_ID);
  await page.getByRole("button", { name: "Sign in as dev" }).click();
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/u);
  await expectNoA11yViolations(page);

  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Day" }).click();
  await expect(page.getByRole("heading", { name: "Day" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Day" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await nav.getByRole("link", { name: "Now" }).click();

  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  // Settings sits beside the sidebar like any other destination.
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
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
  await loginViaApi(page);
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
  // The page behind the app and the browser's colour follow the app's Light on a dark system,
  // from before the app has loaded (QA 17 L9).
  const pageColors = async () => ({
    body: await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor),
    themeColors: await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((metas) => metas.map((meta) => meta.getAttribute("content"))),
  });
  await expect.poll(pageColors).toMatchObject({ body: "rgb(244, 245, 247)" });
  // Both theme colours (the system's dark and light) now say the app's light, none the dark one.
  expect((await pageColors()).themeColors).not.toContain("#0b0b0c");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
  expect(await background()).toBe(light);
  expect((await pageColors()).body).toBe("rgb(244, 245, 247)");
  await page.getByRole("radio", { name: "System" }).click();
  await expect.poll(background).not.toBe(light);
});

test("the App Link landing offers to open the app", async ({ page }) => {
  await page.goto("/app/auth?token=abc123");
  await expect(page.getByRole("button", { name: "Open in Pace" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test.describe("the bot's Return to Pace on a phone", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/141" });

  test("lands on a page that opens the app, or the site", async ({ page }) => {
    await page.goto("/app/login");
    await expect(page.getByRole("heading", { name: "Back to Pace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Pace" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Use Pace in the browser" })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test("on a computer the bot's Return to Pace leads on to the site", async ({ page }) => {
  await page.goto("/app/login");
  await expect(page.getByRole("heading", { name: "Back to Pace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Use Pace in the browser" })).toBeHidden();
  await page.getByRole("button", { name: "Open Pace" }).click();
  await expect(page).toHaveURL(/\/login/u);
  await expectNoA11yViolations(page);
});

test("/oauth/authorize exists as the API's redirect target", async ({ page }) => {
  await page.goto("/oauth/authorize?client_id=x");
  await expect(page.getByRole("heading", { name: "Connecting an app" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("not a valid connection request");
});

test("a desktop's sidebar keeps the owner's order, Week after Day", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await loginViaApi(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText([
    "Now",
    "Day",
    "Week",
    "Inbox",
    "Projects",
    "Insights",
    "History",
    "Settings",
  ]);
  await nav.getByRole("link", { name: "Week" }).click();
  await expect(page).toHaveURL(/\/week$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Week" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");
});

test("a phone has Now, Day, Inbox and More; More leads to Week and the rest and back", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await loginViaApi(page);
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "Main" }).getByRole("tab");
  await expect(tabs).toHaveText(["Now", "Day", "Inbox", "More"]);
  await tabs.getByText("More").click();
  await expect(page.getByRole("heading", { level: 1, name: "More" })).toBeVisible();
  for (const name of ["Week", "Projects", "Insights", "History", "Settings"]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await expectNoA11yViolations(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "More" })).toBeVisible();
});

test("a signed-out deep link to a signed-in screen lands on the login screen", async ({ page }) => {
  for (const path of ["/settings", "/projects", "/insights", "/history", "/week"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/u);
    await expect(page.getByRole("heading", { name: "Sign in to Pace" })).toBeVisible();
  }
});

test("a server older than the app holds a signed-in person at the versions screen, with only Log out", async ({
  page,
}) => {
  // A server from before /api/instance answers it 404: older than this app supports.
  await page.route("**/api/instance", async (route) => {
    await route.fulfill({ json: { code: "not-found", message: "Not found" }, status: 404 });
  });
  await loginViaApi(page);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Server and app versions don't match" }),
  ).toBeVisible();
  // The web has no other server to sign in on: its owner updates it (QA 17 L1).
  await expect(page.getByText("Ask whoever runs it to update it.", { exact: false })).toBeVisible();
  await expect(page.getByText(/sign in on another/u)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(0);
  // Nothing of the app around it: no navigation, no Change server, one way out.
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByText(/Change/u)).toHaveCount(0);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("heading", { name: "Sign in to Pace" })).toBeVisible();
});

test("a page older than its server offers Refresh, and a refresh with a fitting server goes on (QA 17 L1)", async ({
  page,
}) => {
  const instance = { isTooNew: true };
  await page.route("**/api/instance", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      json: instance.isTooNew ? { ...body, minClientProtocol: 99, protocol: 99 } : body,
      response,
    });
  });
  await loginViaApi(page);
  await page.goto("/");
  await expect(page.getByText("Refresh it to load the new one.", { exact: false })).toBeVisible();
  await expectNoA11yViolations(page);
  instance.isTooNew = false;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
});
