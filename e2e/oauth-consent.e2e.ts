import type { Locator, Page, Request } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { API_URL, freshTelegramId, loginViaApi, resetAccount } from "./support/login.ts";

/**
Owner bug 2026-11-03 (task A9, bug-lessons class 119): connecting Claude from a browser where the
person is signed in asked for the Telegram widget, which a network may block. Every earlier test
signed in with the dev id on the consent page, so the real identity step never ran. These walk the
journey as a person meets it: a real authorization request of a registered client, the browser's
own session, and the app's sign-in for a signed-out browser.
*/

/** A loopback callback, as MCP clients on a laptop use; answered here, never reached. */
const REDIRECT_URI = "http://localhost:6274/oauth/callback";

const base64UrlOf = (bytes: ArrayBuffer): string => Buffer.from(bytes).toString("base64url");

/** Registers a public PKCE client and builds the query `GET /authorize` passes to the page. */
const authorizationQuery = async (): Promise<string> => {
  const registered = await fetch(`${API_URL}/oauth/register`, {
    body: JSON.stringify({
      client_name: "Claude",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [REDIRECT_URI],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(registered.status).toBe(201);
  const { client_id: clientId } = (await registered.json()) as { client_id: string };
  const verifier = base64UrlOf(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const challenge = base64UrlOf(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return new URLSearchParams({
    client_id: clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: REDIRECT_URI,
    resource: `${API_URL}/mcp`,
    response_type: "code",
    scope: "tasks:read time:read",
    state: "s-e2e",
  }).toString();
};

/** Answers the client's callback, and records where the browser was sent. */
const catchCallback = async (page: Page): Promise<{ readonly url: () => null | string }> => {
  let reached: null | string = null;
  await page.route(`${REDIRECT_URI}**`, async (route) => {
    reached = route.request().url();
    await route.fulfill({ body: "client callback", contentType: "text/plain" });
  });
  return { url: () => reached };
};

const completeRequests = (page: Page): Request[] => {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/oauth/complete")) {
      sent.push(request);
    }
  });
  return sent;
};

test("signed in, the consent page allows with the browser's session and shows no widget", async ({
  page,
}) => {
  const telegramId = freshTelegramId();
  await loginViaApi(page, telegramId);
  const callback = await catchCallback(page);
  const sent = completeRequests(page);
  await page.goto(`/oauth/authorize?${await authorizationQuery()}`);

  await expect(page.getByRole("heading", { name: "Connecting an app" })).toBeVisible();
  await expect(page.getByText(`Signed in as Dev ${telegramId}`)).toBeVisible();
  await expect(page.getByTestId("telegram-widget")).toHaveCount(0);
  await expect(page.getByText("Sign in with Telegram to continue")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue as dev" })).toHaveCount(0);
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Allow" }).click();
  await expect.poll(callback.url).toContain("code=");
  expect(new URL(callback.url() ?? "").searchParams.get("state")).toBe("s-e2e");
  expect(sent).toHaveLength(1);
  expect(sent[0]?.headers()["authorization"]).toMatch(/^Bearer /u);
  expect(sent[0]?.postDataJSON()).not.toHaveProperty("devTelegramId");
  expect(sent[0]?.postDataJSON()).not.toHaveProperty("telegram");
});

test("a session revoked while the page is open falls back to signing in, then the network goes quiet", async ({
  page,
}) => {
  const { token } = await loginViaApi(page);
  const callback = await catchCallback(page);
  const sent = completeRequests(page);
  await page.goto(`/oauth/authorize?${await authorizationQuery()}`);
  await expect(page.getByText(/^Signed in as /u)).toBeVisible();

  // Ended elsewhere (Settings on another device, an expiry) just as Allow goes out: the server
  // ends it before it reads the Allow. (Ended any earlier, the live socket's close signs the page
  // out first, which lands on the same fallback.)
  await page.route("**/api/oauth/complete", async (route) => {
    const out = await fetch(`${API_URL}/api/auth/logout`, {
      headers: { Authorization: `Bearer ${token}` },
      method: "POST",
    });
    expect(out.ok).toBe(true);
    await route.continue();
  });
  await page.getByRole("button", { name: "Allow" }).click();

  await expect(page.getByRole("alert")).toContainText("Your Pace session has ended");
  await expect(page.getByText("Sign in with Telegram to continue")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to Pace first" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Allow" })).toBeDisabled();
  // Steady state: one Allow, nothing repeated, no redirect to the client.
  // eslint-disable-next-line playwright/no-wait-for-timeout, sonarjs/no-fixed-wait-in-tests -- the bug class is a request repeated after the refusal; no DOM condition marks that none follows
  await page.waitForTimeout(1500);
  expect(sent).toHaveLength(1);
  expect(callback.url()).toBeNull();
});

test("a session revoked before the page opens offers signing in, not a stale name", async ({
  page,
}) => {
  const { token } = await loginViaApi(page);
  const out = await fetch(`${API_URL}/api/auth/logout`, {
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });
  expect(out.ok).toBe(true);
  const sent = completeRequests(page);
  await page.goto(`/oauth/authorize?${await authorizationQuery()}`);
  await expect(page.getByText("Sign in with Telegram to continue")).toBeVisible();
  await expect(page.getByText(/^Signed in as /u)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Allow" })).toBeDisabled();
  expect(sent).toHaveLength(0);
});

test("signed out, the app's own sign-in comes back to the consent page with the request intact", async ({
  page,
}) => {
  const telegramId = freshTelegramId();
  await resetAccount(telegramId);
  const callback = await catchCallback(page);
  const query = await authorizationQuery();
  await page.goto(`/oauth/authorize?${query}`);
  await expect(page.getByText("Sign in with Telegram to continue")).toBeVisible();
  await expect(page.getByText("Can't see the Telegram button?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Allow" })).toBeDisabled();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Sign in to Pace first" }).click();
  await expect(page).toHaveURL(/\/login\?next=/u);
  await page.getByLabel("Telegram id").fill(telegramId);
  await page.getByRole("button", { name: "Sign in as dev" }).click();

  // The router writes the query back in its own spelling (a space as %20, not +): the same request.
  await expect(page).toHaveURL(/\/oauth\/authorize\?/u);
  const back = new URL(page.url()).searchParams;
  expect([...back]).toEqual([...new URLSearchParams(query)]);
  await expect(page.getByText(`Signed in as Dev ${telegramId}`)).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect.poll(callback.url).toContain("code=");
});

/** Telegram's script, stubbed: it puts an oversized frame where the button goes (a block page). */
const oversizedTelegramFrame = async (page: Page): Promise<void> => {
  await page.route("https://telegram.org/js/telegram-widget.js*", async (route) => {
    await route.fulfill({
      body: `(() => {
        const frame = document.createElement("iframe");
        frame.src = "https://oauth.telegram.org/embed/blocked";
        frame.width = "600";
        frame.height = "300";
        frame.style.border = "none";
        document.currentScript.after(frame);
      })();`,
      contentType: "application/javascript",
    });
  });
  await page.route("https://oauth.telegram.org/**", async (route) => {
    await route.fulfill({
      body: "<h1>Доступ к ресурсу заблокирован</h1><p>Сервис для звонков ограничен.</p>",
      contentType: "text/html; charset=utf-8",
    });
  });
};

type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Where a locator is drawn; a missing box fails the test. */
const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("not on the page");
  }
  return box;
};

const areOverlapping = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("a frame the widget loads stays in its own box: inside the card, clear of the way out (A9 review I2, class 121)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await oversizedTelegramFrame(page);
  await page.goto(`/oauth/authorize?${await authorizationQuery()}`);
  const frame = page.getByTestId("telegram-widget").locator("iframe");
  await expect(frame).toBeVisible();
  const question = page.getByText("Can't see the Telegram button?");
  const signIn = page.getByRole("button", { name: "Sign in to Pace first" });
  await signIn.scrollIntoViewIfNeeded();
  const [frameBox, cardBox, questionBox, signInBox] = await Promise.all([
    boxOf(frame),
    boxOf(page.getByTestId("consent-card")),
    boxOf(question),
    boxOf(signIn),
  ]);
  expect(frameBox.x).toBeGreaterThanOrEqual(cardBox.x);
  expect(frameBox.x + frameBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  expect(areOverlapping(frameBox, questionBox)).toBe(false);
  expect(areOverlapping(frameBox, signInBox)).toBe(false);
  // The way out still takes the click (nothing drawn over it).
  await signIn.click();
  await expect(page).toHaveURL(/\/login\?next=/u);
});
