import type { Page } from "@playwright/test";

export const API_URL = "http://localhost:8787";
/**
The ids the e2e Worker whitelists (playwright.config.ts). The UI login test uses the default;
every API-login test takes its own id so parallel tests never share account state.
*/
export const DEV_TELEGRAM_ID = "1919230638";

/** Same key as apps/web/src/platform/local-session.ts. */
const SESSION_KEY = "pace.session";

/** Mints a session through the dev login route (ENVIRONMENT=test in wrangler dev). */
export const createDevSession = async (
  telegramId = DEV_TELEGRAM_ID,
): Promise<{ readonly token: string; readonly userId: string }> => {
  const response = await fetch(`${API_URL}/api/auth/dev`, {
    body: JSON.stringify({ telegramId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`dev login failed: ${String(response.status)} ${await response.text()}`);
  }
  const session = (await response.json()) as { token: string; user: { id: string } };
  return { token: session.token, userId: session.user.id };
};

/**
Seeds the bearer token before any page script runs, so the shell starts signed in and the
test skips the login UI. Call before the first `page.goto`.
*/
export const loginViaApi = async (page: Page, telegramId = DEV_TELEGRAM_ID): Promise<void> => {
  const { token } = await createDevSession(telegramId);
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: SESSION_KEY, value: token },
  );
};
