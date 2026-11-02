import type { Browser, Page } from "@playwright/test";

import { approve, nowTasks } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import { API_URL, createDevSession, freshTelegramId, resetAccount } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

/** Same key as apps/app/src/platform/secure-session.ts. */
const SESSION_KEY = "pace.session";

/** The HTTP sync routes: blocked, a change can only travel over the live socket. */
const SYNC_ROUTES = "**/api/sync/{push,pull}";

/** A task the account already has, so a device that shows it has finished its first sync. */
const seedTask = async (token: string, title: string): Promise<void> => {
  const now = Date.now();
  const pushed = await pushAsClient(token, [
    {
      deviceId: "e2e-seed",
      id: ulid(now),
      occurredAt: new Date(now).toISOString(),
      payload: { presetId: "personal", taskId: ulid(now + 1), title },
      precision: "exact",
      recordedAt: new Date(now).toISOString(),
      source: "web",
      type: "task.created",
    },
  ]);
  expect(pushed.ok).toBe(true);
};

/** Adds a task from Now's line and approves it, staying on the page (no reload). */
const addTaskHere = async (page: Page, title: string): Promise<void> => {
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially(title);
  await line.press("Enter");
  await expect(page.getByText(/^The assistant will create /u)).toBeVisible();
  await approve(page);
  await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible();
};

test("a task added on one device shows on another within a second and a half, over the socket alone", async ({
  browser,
}) => {
  const telegramId = freshTelegramId();
  await resetAccount(telegramId);
  const { token } = await createDevSession(telegramId);
  const seed = `seeded ${crypto.randomUUID().slice(0, 6)}`;
  await seedTask(token, seed);
  const signIn = async (): Promise<{ readonly page: Page; readonly frames: string[] }> => {
    const session = await createDevSession(telegramId);
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    await context.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: SESSION_KEY, value: session.token },
    );
    const page = await context.newPage();
    // What the live socket hears, from its first message on.
    const frames: string[] = [];
    page.on("websocket", (socket) => {
      socket.on("framereceived", ({ payload }) => {
        frames.push(String(payload));
      });
    });
    await page.goto("/");
    await expect(nowTasks(page).getByText(seed)).toBeVisible();
    return { frames, page };
  };
  const laptop = await signIn();
  const phone = await signIn();
  // Both sockets speak pace.v2: the server said hello in the browser (wrangler dev).
  for (const device of [laptop, phone]) {
    await expect
      .poll(() => device.frames.some((frame) => frame.includes('"type":"hello"')))
      .toBe(true);
  }
  for (const { page } of [laptop, phone]) {
    await page.route(SYNC_ROUTES, async (route) => {
      await route.abort();
    });
  }
  const title = `buy stamps ${crypto.randomUUID().slice(0, 6)}`;
  await addTaskHere(laptop.page, title);
  await expect(nowTasks(phone.page).getByText(title)).toBeVisible({ timeout: 1500 });
  // It reached the server, not only the laptop's own log: back on HTTP after a reload, it stays.
  await laptop.page.unroute(SYNC_ROUTES);
  await laptop.page.reload();
  await expect(nowTasks(laptop.page).getByText(title)).toBeVisible();
  await laptop.page.context().close();
  await phone.page.context().close();
});

test("a task added in one tab shows in a second tab of the same profile, and that tab calls nothing (QA 17 M1)", async ({
  browser,
}) => {
  // One profile: one IndexedDB copy, one device id. The server tells no socket of the device that
  // wrote, and the second tab's pull would find the shared cursor already moved: only the tabs'
  // own channel can tell it.
  const telegramId = freshTelegramId();
  await resetAccount(telegramId);
  const { token } = await createDevSession(telegramId);
  const seed = `seeded ${crypto.randomUUID().slice(0, 6)}`;
  await seedTask(token, seed);
  const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: SESSION_KEY, value: token },
  );
  const first = await context.newPage();
  await first.goto("/");
  await expect(nowTasks(first).getByText(seed)).toBeVisible();
  const second = await context.newPage();
  // Every sync call and socket request the second tab makes, counted once it has settled.
  const calls: string[] = [];
  const sent: string[] = [];
  const heard: string[] = [];
  second.on("request", (request) => {
    if (request.url().includes("/api/sync")) {
      calls.push(request.url());
    }
  });
  second.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      sent.push(String(payload));
    });
    socket.on("framereceived", ({ payload }) => {
      heard.push(String(payload));
    });
  });
  await second.goto("/");
  await expect(nowTasks(second).getByText(seed)).toBeVisible();
  // Settled: its socket is up (the server said hello) and its start's syncs are done.
  await expect.poll(() => heard.some((frame) => frame.includes('"type":"hello"'))).toBe(true);
  await second.waitForTimeout(1500);
  calls.length = 0;
  sent.length = 0;
  const title = `buy stamps ${crypto.randomUUID().slice(0, 6)}`;
  await addTaskHere(first, title);
  await expect(nowTasks(second).getByText(title)).toBeVisible({ timeout: 2000 });
  // The steady state: the second tab stays quiet (nothing pulled again for the same change).
  await second.waitForTimeout(3000);
  expect(calls).toEqual([]);
  expect(sent.filter((frame) => frame !== "ping")).toEqual([]);
  await context.close();
});

/**
Two tabs of one browser profile signed into one session, as a sign-in leaves it (the first load
of each tab only): the first on Now, the second on Settings.
*/
const twoTabsSignedIn = async (browser: Browser) => {
  const telegramId = freshTelegramId();
  await resetAccount(telegramId);
  const { token } = await createDevSession(telegramId);
  const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  await context.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem("seeded") !== null) {
        return;
      }

      sessionStorage.setItem("seeded", "1");
      localStorage.setItem(key, value);
    },
    { key: SESSION_KEY, value: token },
  );
  const first = await context.newPage();
  await first.goto("/");
  await expect(first.getByRole("heading", { name: "Now" })).toBeVisible();
  const second = await context.newPage();
  await second.goto("/settings");
  await expect(second.getByRole("button", { name: "Log out" })).toBeVisible();
  return { context, first, second, telegramId };
};

const ANOTHER_TAB = "You signed out in another tab.";
const ANOTHER_DEVICE = /ended on another device/u;

test('a log-out in another tab of the same browser says so, not "another device" (QA 18 L3)', async ({
  browser,
}) => {
  const { context, first, second } = await twoTabsSignedIn(browser);
  await second.getByRole("button", { name: "Log out" }).click();
  await expect(second).toHaveURL(/\/login$/u);
  await expect(first).toHaveURL(/\/login$/u, { timeout: 15_000 });
  await expect(first.getByRole("status").filter({ hasText: ANOTHER_TAB })).toBeVisible();
  await expect(first.getByText(/another device/u)).toHaveCount(0);
  await context.close();
});

/** Another device of the account ends the browser's one session from its own list. */
const endBrowserSessionElsewhere = async (telegramId: string): Promise<void> => {
  const { token: elsewhere } = await createDevSession(telegramId);
  const headers = { Authorization: `Bearer ${elsewhere}` };
  const listed = await fetch(`${API_URL}/api/sessions`, { headers });
  const { sessions } = (await listed.json()) as {
    readonly sessions: readonly { readonly current: boolean; readonly id: string }[];
  };
  const browserSessions = sessions.filter((session) => !session.current);
  expect(browserSessions).toHaveLength(1);
  for (const session of browserSessions) {
    const ended = await fetch(`${API_URL}/api/sessions/${encodeURIComponent(session.id)}`, {
      headers,
      method: "DELETE",
    });
    expect(ended.ok).toBe(true);
  }
};

/** The tab goes to the background as the browser hides it: its socket rests, its poll goes on. */
const hide = async (tab: Page): Promise<void> => {
  await tab.evaluate(() => {
    Object.defineProperties(document, {
      visibilityState: { configurable: true, get: () => "hidden" },
      hidden: { configurable: true, get: () => true },
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

/** What the profile's local copy holds: its events and whether it knows its server store. */
const localCopy = async (tab: Page) =>
  await tab.evaluate(
    async () =>
      await new Promise<{ readonly events: number; readonly hasStoreId: boolean }>(
        (resolve, reject) => {
          const opened = indexedDB.open("pace");
          opened.addEventListener("error", () => {
            reject(new Error("no local copy"));
          });
          opened.addEventListener("success", () => {
            const read = opened.result.transaction(["events", "meta"], "readonly");
            const events = read.objectStore("events").count();
            const storeId = read.objectStore("meta").get("storeId");
            read.addEventListener("complete", () => {
              resolve({ events: events.result, hasStoreId: storeId.result !== undefined });
              opened.result.close();
            });
          });
        },
      ),
  );

/** The poll of a hidden tab (30 s) and a margin. */
const HIDDEN_POLL_MS = 45_000;

test("a hidden tab signs out when its session is ended from another device (round 6 M6)", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { context, first, second, telegramId } = await twoTabsSignedIn(browser);
  // Hidden before the end: no socket to hear it close, only its poll's 401 (b8d9259).
  await hide(first);
  await endBrowserSessionElsewhere(telegramId);
  await expect(second).toHaveURL(/\/login$/u, { timeout: 15_000 });
  await expect(first).toHaveURL(/\/login$/u, { timeout: HIDDEN_POLL_MS });
  await expect(first.getByRole("status").filter({ hasText: ANOTHER_DEVICE })).toBeVisible();
  await context.close();
});

test("a stale tab's late 401 leaves the session another tab signed in with since, and the shared copy (round 6 I1)", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { context, first, second, telegramId } = await twoTabsSignedIn(browser);
  await hide(first);
  // The person logs out in the second tab and signs in again there, before the hidden tab hears.
  await second.getByRole("button", { name: "Log out" }).click();
  await expect(second).toHaveURL(/\/login$/u);
  await second.getByLabel("Telegram id").fill(telegramId);
  await second.getByRole("button", { name: "Sign in as dev" }).click();
  await expect(second.getByRole("heading", { name: "Now" })).toBeVisible();
  await addTaskHere(second, `post the letter ${crypto.randomUUID().slice(0, 6)}`);
  const signedIn = await second.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  expect(signedIn).not.toBeNull();
  const before = await localCopy(second);
  expect(before.hasStoreId).toBe(true);
  // The hidden tab's poll gets its 401 for the old session and signs out.
  await expect(first).toHaveURL(/\/login$/u, { timeout: HIDDEN_POLL_MS });
  await first.waitForTimeout(1000);
  expect(await second.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBe(signedIn);
  expect(await localCopy(second)).toEqual(before);
  // The tab signed in since stays signed in across a reload.
  await second.reload();
  await expect(second.getByRole("heading", { name: "Now" })).toBeVisible();
  await context.close();
});

test('a session ended from another device says "another device" in every open tab (fix round 5 V1)', async ({
  browser,
}) => {
  const { context, first, second, telegramId } = await twoTabsSignedIn(browser);
  await endBrowserSessionElsewhere(telegramId);
  for (const tab of [first, second]) {
    await expect(tab).toHaveURL(/\/login$/u, { timeout: 15_000 });
    await expect(tab.getByRole("status").filter({ hasText: ANOTHER_DEVICE })).toBeVisible();
    await expect(tab.getByText(ANOTHER_TAB)).toHaveCount(0);
  }
  // The steady state: signed out, neither tab keeps knocking with the dead session.
  const refused: string[] = [];
  for (const tab of [first, second]) {
    tab.on("response", (response) => {
      if (response.status() === 401) {
        refused.push(response.url());
      }
    });
  }
  await first.waitForTimeout(3000);
  expect(refused).toEqual([]);
  await context.close();
});
