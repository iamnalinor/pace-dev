import type { Page, Request } from "@playwright/test";

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

  // Ended elsewhere (Settings on another device, an expiry) after the page read it.
  const out = await fetch(`${API_URL}/api/auth/logout`, {
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });
  expect(out.ok).toBe(true);
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

  await expect(page).toHaveURL(`/oauth/authorize?${query}`);
  await expect(page.getByText(`Signed in as Dev ${telegramId}`)).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect.poll(callback.url).toContain("code=");
});
