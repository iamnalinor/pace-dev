import { type Page, test } from "@playwright/test";

export const API_URL = "http://localhost:8787";
/** The id the UI login test types (the dev form's default). */
export const DEV_TELEGRAM_ID = "1919230638";
/** The account the README screenshots are seeded on. */
export const README_TELEGRAM_ID = "1010";

/** Same key as apps/app/src/platform/secure-session.ts (localStorage on the web build). */
const SESSION_KEY = "pace.session";

/**
The block of ids the e2e Worker whitelists for tests (playwright.config.ts): a hundred per
worker, so every test gets an account of its own.
*/
export const TEST_ID_BASE = 3000;
export const TEST_IDS_PER_WORKER = 100;
export const TEST_WORKERS = 4;

const counter = { next: 0 };

/** An account no other test touches: the worker's block, the next id in it. */
export const freshTelegramId = (): string => {
  const index = counter.next % TEST_IDS_PER_WORKER;
  counter.next += 1;
  return String(TEST_ID_BASE + test.info().parallelIndex * TEST_IDS_PER_WORKER + index);
};

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

/** Deletes the account behind an id, so a reused server or an earlier run leaves nothing behind. */
export const resetAccount = async (telegramId: string): Promise<void> => {
  const { token } = await createDevSession(telegramId);
  const response = await fetch(`${API_URL}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`account reset failed: ${String(response.status)}`);
  }
};

/**
Starts the test on an empty account of its own, signed in before any page script runs (the
login UI is skipped). Call before the first `page.goto`. Answers the session's token, for
seeding the account through the API.
*/
export const loginViaApi = async (
  page: Page,
  telegramId = freshTelegramId(),
): Promise<{ readonly token: string }> => {
  await resetAccount(telegramId);
  const { token } = await createDevSession(telegramId);
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: SESSION_KEY, value: token },
  );
  return { token };
};
