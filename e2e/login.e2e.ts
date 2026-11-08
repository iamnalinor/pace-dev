import type { Request } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import {
  API_URL,
  DEV_TELEGRAM_ID,
  freshTelegramId,
  loginViaApi,
  resetAccount,
} from "./support/login.ts";
import { outboxSent } from "./support/outbox.ts";
import { pushAsClient, seedLivedIn, ulid } from "./support/seed.ts";
import { documentGround, rgb } from "./support/theme-colors.ts";

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

test("after Log out the network goes quiet: no request names the session, nothing is refused, a reload explains nothing (QA round 22 R22-02)", async ({
  page,
}) => {
  const { token } = await loginViaApi(page);
  // A lived-in account (calendar, notifications, a running activity), read in English.
  await seedLivedIn(token);
  const at = new Date().toISOString();
  const english = await pushAsClient(token, [
    {
      deviceId: "e2e-seed",
      id: ulid(Date.now()),
      occurredAt: at,
      payload: { language: "en" },
      precision: "exact",
      recordedAt: at,
      source: "web",
      type: "settings.updated",
    },
  ]);
  expect(english.ok).toBe(true);
  // Everything is recorded with the wall-clock time it was seen; the press is stamped on the page
  // itself (same machine, same clock), so a poll that went out just before it is never counted.
  const asked: { readonly at: number; readonly request: Request; readonly path: string }[] = [];
  const refused: { readonly at: number; readonly what: string }[] = [];
  const errors: { readonly at: number; readonly text: string }[] = [];
  const sockets: number[] = [];
  const pending = new Set<unknown>();
  page.on("request", (request) => {
    pending.add(request);
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/")) {
      // Stamped as it leaves: `timing()` stays empty for a request that never got an answer.
      asked.push({ at: Date.now(), path: pathname, request });
    }
  });
  page.on("requestfinished", (request) => {
    pending.delete(request);
  });
  page.on("requestfailed", (request) => {
    pending.delete(request);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      refused.push({ at: Date.now(), what: `${String(response.status())} ${response.url()}` });
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push({ at: Date.now(), text: message.text() });
    }
  });
  page.on("websocket", () => {
    sockets.push(Date.now());
  });
  // Now and Day mounted first: their calendar reads, the sync loop and the socket all run.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Day" }).click();
  await expect(page.getByRole("heading", { name: "Day" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings" })
    .click();
  // The start has had its answers (sync, calendar, notifications) and the socket is open.
  await expect.poll(() => pending.size).toBe(0);
  expect(sockets.length).toBeGreaterThan(0);
  const logOut = page.getByRole("button", { name: "Sign out" });
  await logOut.evaluate((button) => {
    button.addEventListener(
      "pointerdown",
      () => {
        document.documentElement.dataset["pressedAt"] = String(Date.now());
      },
      { capture: true, once: true },
    );
  });
  await logOut.click();
  await expect(page).toHaveURL(/\/login$/u);
  // Long enough for a socket close, a retry or a screen's refetch to show itself.
  // eslint-disable-next-line playwright/no-wait-for-timeout, sonarjs/no-fixed-wait-in-tests -- a quiet network is the absence of requests over a window; no DOM condition marks it
  await page.waitForTimeout(2000);
  const pressedAt = Number(
    await page.evaluate(() => globalThis.document.documentElement.dataset["pressedAt"]),
  );
  expect(pressedAt).toBeGreaterThan(0);
  const after = asked
    // The browser's own start time once answered; the stamp for one never answered (it then
    // counts as the sign-out's: the check fails closed).
    .filter(
      ({ at, request }) =>
        (request.timing().startTime > 0 ? request.timing().startTime : at) >= pressedAt,
    )
    .map(({ path, request }) => ({
      auth: request.headers()["authorization"] ?? null,
      method: request.method(),
      path,
    }));
  expect(after.filter((request) => request.auth !== null)).toEqual([
    { auth: `Bearer ${token}`, method: "POST", path: "/api/auth/logout" },
  ]);
  // Only the public server check may follow, and it names no one.
  expect(after.filter((request) => request.path !== "/api/instance").map((r) => r.path)).toEqual([
    "/api/auth/logout",
  ]);
  // No socket opens again with the ended session.
  expect(sockets.filter((at) => at >= pressedAt)).toEqual([]);
  expect(refused.filter(({ at }) => at >= pressedAt).map(({ what }) => what)).toEqual([]);
  expect(errors.filter(({ at }) => at >= pressedAt).map(({ text }) => text)).toEqual([]);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to Pace" })).toBeVisible();
  await expect(page.getByText(/You were signed out/u)).toHaveCount(0);
  expect(refused.filter(({ at }) => at >= pressedAt).map(({ what }) => what)).toEqual([]);
  expect(errors.filter(({ at }) => at >= pressedAt).map(({ text }) => text)).toEqual([]);
});

test("a slow log-out answer leaves the login form as the person is filling it in (PR A re-review N1, bug class 75)", async ({
  page,
}) => {
  const telegramId = freshTelegramId();
  await loginViaApi(page, telegramId);
  // The server's answer to the log-out is held, as on a slow phone or a busy Durable Object.
  let isReleased = false;
  await page.route("**/api/auth/logout", async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
    isReleased = true;
    await route.continue();
  });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  // The start's own write (the time zone) sent, so Log out has nothing to ask about.
  await outboxSent(page);
  const answered = page.waitForResponse("**/api/auth/logout");
  await page.getByRole("button", { exact: true, name: "Sign out" }).click();
  // Signed out on the device at once: the login screen is there before the server answers.
  await expect(page).toHaveURL(/\/login$/u);
  const field = page.getByLabel("Telegram id");
  await field.fill(telegramId);
  expect(isReleased).toBe(false);
  await answered;
  // A follow-up that runs once the answer is in shows itself within a few frames.
  // eslint-disable-next-line playwright/no-wait-for-timeout, sonarjs/no-fixed-wait-in-tests -- the bug is a remount after the answer; no DOM condition marks that it did not happen
  await page.waitForTimeout(500);
  await expect(field).toHaveValue(telegramId);
  await expect(page.getByRole("button", { name: "Sign in as dev" })).toBeEnabled();
  await page.getByRole("button", { name: "Sign in as dev" }).click();
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
});

test("a Sign out with no network ends the session on the server once it is back, then goes quiet (R22-02)", async ({
  context,
  page,
}) => {
  const { token } = await loginViaApi(page);
  const logouts: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/logout") {
      logouts.push(request.headers()["authorization"] ?? "");
    }
  });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await outboxSent(page);
  await context.setOffline(true);
  await page.getByRole("button", { exact: true, name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  // The server did not hear it: the session is still alive there.
  const me = async (): Promise<number> =>
    (await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })).status;
  expect(await me()).toBe(200);
  // Back online: the kept log-out goes again, with the ended token and nothing else.
  await context.setOffline(false);
  await expect.poll(me).toBe(401);
  const sent = logouts.length;
  expect(logouts.every((header) => header === `Bearer ${token}`)).toBe(true);
  // Settled: no request repeats for that token (another reload starts nothing either).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to Pace" })).toBeVisible();
  // eslint-disable-next-line playwright/no-wait-for-timeout, sonarjs/no-fixed-wait-in-tests -- a quiet network is the absence of requests over a window; no DOM condition marks it
  await page.waitForTimeout(1500);
  expect(logouts).toHaveLength(sent);
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
  await expect.poll(pageColors).toMatchObject({ body: rgb(documentGround("light", false)) });
  // Both theme colours (the system's dark and light) now say the app's light, none the dark one.
  expect((await pageColors()).themeColors).not.toContain(documentGround("dark", false));
  await page.reload();
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
  expect(await background()).toBe(light);
  expect((await pageColors()).body).toBe(rgb(documentGround("light", false)));
  await page.getByRole("radio", { name: "System" }).click();
  await expect.poll(background).not.toBe(light);
  // System, reloaded on a dark system: the page follows the system again, from the first paint on.
  await page.reload();
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
  expect(await background()).not.toBe(light);
  expect((await pageColors()).body).toBe(rgb(documentGround("dark", false)));
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
  const tabs = page.getByRole("navigation", { name: "Main" }).getByRole("link");
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
  await expect(page.getByRole("button", { name: "Refresh page" })).toHaveCount(0);
  // Nothing of the app around it: no navigation, no Change server, one way out.
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByText(/Change/u)).toHaveCount(0);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("heading", { name: "Sign in to Pace" })).toBeVisible();
});

test("a page older than its server offers Refresh, and a refresh with a fitting server goes on (QA 17 L1)", async ({
  page,
}) => {
  const instance = { isTooNew: true };
  await page.route("**/api/instance", async (route) => {
    // Refresh reloads the page: a read of the instance still on its way then belongs to a page
    // that is gone, and its response is disposed under the handler (a run of fix round 2). The
    // reloaded page asks again, and that read is the one the test judges.
    try {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        json: instance.isTooNew ? { ...body, minClientProtocol: 99, protocol: 99 } : body,
        response,
      });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("disposed"))) {
        throw error;
      }
    }
  });
  await loginViaApi(page);
  await page.goto("/");
  await expect(page.getByText("Refresh it to load the new one.", { exact: false })).toBeVisible();
  await expectNoA11yViolations(page);
  instance.isTooNew = false;
  await page.getByRole("button", { name: "Refresh page" }).click();
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
});
