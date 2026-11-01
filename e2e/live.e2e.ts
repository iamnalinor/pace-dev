import type { Page } from "@playwright/test";

import { nowTasks } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import { createDevSession, freshTelegramId, resetAccount } from "./support/login.ts";
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
  await page.getByRole("button", { name: "Approve" }).click();
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
