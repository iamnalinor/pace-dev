import type { Page, Request } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { createDevSession, freshTelegramId, loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

/**
The bell, the notification feed and Settings' notification section in the web build. The pool
is answered in the browser: nothing the e2e Worker runs makes a notification on demand (sign-ins
are not wired yet; digests, events and "still going?" follow the clock). The account turns every
kind on for the web, so the feed shows each of them. With `E2E_SHOT_DIR` set, the screens are
saved there in light English and dark Russian, at phone and desktop width, for review.
*/

const SHOT_DIR = process.env["E2E_SHOT_DIR"];

const MINUTE = 60_000;

const at = (minutesAgo: number): string => new Date(Date.now() - minutesAgo * MINUTE).toISOString();

type Pool = { items: Record<string, unknown>[] };

/** A pool with one of each kind; the "still going?" one open, an event attended earlier. */
const poolOf = (): Pool => ({
  items: [
    {
      createdAt: at(4),
      id: "n-login",
      kind: "login",

      payload: {
        city: "Berlin",
        country: "Germany",
        ip: "203.0.113.7",
        kind: "web",
        name: "Firefox on Windows",
        sessionId: "s-1",
      },
      readAt: null,
      resolution: null,
      resolvedAt: null,
    },
    {
      createdAt: at(20),
      id: "n-overrun",
      kind: "activity_overrun",
      payload: {
        activityId: "a-1",
        askedAt: at(20),
        expectMinutes: 45,
        label: "Linear algebra problem set",
        startAt: at(110),
      },
      readAt: null,
      resolution: null,
      resolvedAt: null,
    },
    {
      createdAt: at(180),
      id: "n-event",
      kind: "event_start",
      payload: {
        end: at(90),
        eventKey: `${at(180)}@Seminar`,
        start: at(180),
        title: "Seminar on numerical methods",
      },
      readAt: at(170),
      resolution: "attended",
      resolvedAt: at(178),
    },
    {
      createdAt: at(26 * 60),
      id: "n-digest",
      kind: "deadline_digest",
      payload: {
        slot: at(26 * 60),
        tasks: [
          { dueAt: at(-6 * 60), dueTz: null, taskId: "t-1", title: "Problem set 4" },
          { dueAt: at(-20 * 60), dueTz: null, taskId: "t-2", title: "Lab report: pendulum" },
        ],
      },
      readAt: at(25 * 60),
      resolution: null,
      resolvedAt: null,
    },
  ],
});

const DELIVERIES = {
  "n-overrun": [
    {
      at: at(20),
      device: "Pixel 8",
      dismissedAt: null,
      method: "fcm",
      reason: null,
      result: "sent",
    },
  ],
  "n-event": [
    {
      at: at(180),
      device: "Telegram",
      dismissedAt: at(178),
      method: "telegram",
      reason: null,
      result: "sent",
    },
  ],
};

/**
Answers the pool's endpoints in the browser; an answer resolves the item it names. The sign-in's
session ("s-1", Firefox on Windows) is in the account's list, so the feed offers Not me for it (a
notice whose session already ended says so instead).
*/
const servePool = async (page: Page): Promise<Pool> => {
  const pool = poolOf();
  await page.route(
    (url) => url.pathname === "/api/sessions",
    async (route) => {
      const listed = (await (await route.fetch()).json()) as { sessions: unknown[] };
      const firefox = {
        city: "Berlin",
        country: "DE",
        createdAt: Date.parse(at(4)),
        current: false,
        id: "s-1",
        ip: "203.0.113.7",
        kind: "browser",
        lastDataAt: null,
        lastSeenAt: Date.parse(at(4)),
        name: "Firefox on Windows",
      };
      await route.fulfill({ json: { sessions: [...listed.sessions, firefox] } });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/notifications",
    async (route) => {
      await route.fulfill({ json: { deliveries: DELIVERIES, items: pool.items, more: false } });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/notifications/read",
    async (route) => {
      for (const item of pool.items) {
        item["readAt"] ??= new Date().toISOString();
      }
      await route.fulfill({ json: { ok: true } });
    },
  );
  await page.route(/\/api\/notifications\/([^/]+)\/resolve$/u, async (route) => {
    const id = /notifications\/([^/]+)\/resolve/u.exec(route.request().url())?.[1];
    const { resolution } = route.request().postDataJSON() as { readonly resolution: string };
    const item = pool.items.find((entry) => entry["id"] === id);
    if (item === undefined) {
      await route.fulfill({ json: { code: "notification/not-found", message: "No" }, status: 404 });
      return;
    }
    Object.assign(item, { resolution, resolvedAt: new Date().toISOString() });
    await route.fulfill({ json: { notification: item } });
  });
  return pool;
};

const isRead = (request: Request): boolean =>
  request.method() === "POST" && request.url().endsWith("/api/notifications/read");

/** Whether the page asks to mark something read again within two seconds. */
const isReadAgain = async (page: Page): Promise<boolean> => {
  try {
    await page.waitForRequest(isRead, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
};

/** Every kind on for the web, in `language`. */
const settle = async (token: string, language: "en" | "ru"): Promise<void> => {
  const pushed = await pushAsClient(token, [
    {
      deviceId: "e2e-seed",
      id: ulid(Date.now() - 60 * MINUTE),
      occurredAt: new Date(Date.now() - 60 * MINUTE).toISOString(),
      payload: {
        language,
        notificationChannels: {
          activity_overrun: { web: true },
          deadline_digest: { web: true },
          event_start: { web: true },
          login: { web: true },
        },
      },
      precision: "exact",
      recordedAt: new Date().toISOString(),
      source: "web",
      type: "settings.updated",
    },
  ]);
  expect(pushed.ok).toBe(true);
};

test("the bell counts what is unread, the feed answers and reads well", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  const { token } = await loginViaApi(page);
  await settle(token, "en");
  await servePool(page);
  await page.goto("/");
  const bell = page.getByRole("button", { name: "Notifications, 2 unread" });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page).toHaveURL(/\/notifications$/u);
  await expect(page.getByText("Signed in from Firefox on Windows")).toBeVisible();
  await expect(page.getByText("Still doing Linear algebra problem set?")).toBeVisible();
  await expect(page.getByText("✓ Attending")).toBeVisible();
  await expect(page.getByText(/^Delivered to Pixel 8 via Google · /u)).toBeVisible();
  await expect(page.getByText(/^Taken back from Telegram · /u)).toBeVisible();
  // Opening the feed read it: the bell has nothing unread any more.
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Yes, still" }).click();
  await expect(page.getByText("✓ Still going")).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes, still" })).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByText("Where each kind of notification goes.")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Sign-ins: Web" })).toBeChecked();
  await expectNoA11yViolations(page);
});

test("this session's own sign-in notice is read here: the bell clears, the feed asks once (QA round 15 H1)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  const telegramId = freshTelegramId();
  const { token } = await loginViaApi(page, telegramId);
  await settle(token, "en");
  // Another device signs in too: its notice is the one unread here; this session's own never is.
  await createDevSession(telegramId);
  const reads: unknown[] = [];
  page.on("request", (request) => {
    if (isRead(request)) {
      reads.push(request.postDataJSON());
    }
  });
  await page.goto("/");
  const bell = page.getByRole("button", { name: "Notifications, 1 unread" });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page.getByText("Signed in from Dev login")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  await expect.poll(() => reads.length).toBe(1);
  // A storm showed here as ~70 reads a second: a second read would come within moments.
  expect(await isReadAgain(page)).toBe(false);
  expect(reads).toHaveLength(1);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
});

for (const size of [
  { height: 844, name: "phone", width: 390 },
  { height: 900, name: "desktop", width: 1440 },
] as const) {
  test(`an answer keeps focus in the feed, ${size.name} (QA round 16 M1, bug class 5)`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: size.height, width: size.width });
    const { token } = await loginViaApi(page);
    await settle(token, "en");
    await servePool(page);
    await page.goto("/notifications");
    // By keyboard: Not me asks first, focus on Cancel; Escape cancels and gives focus back
    // (QA round 15 L11). Then End session: the answered button is replaced by its status, which
    // takes the focus.
    const notMe = page.getByRole("button", { name: "Not me — end this session" });
    await notMe.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(notMe).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "End session" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(":focus")).toHaveText("Session ended");
    // By mouse the same, and the next answer's status takes it in turn.
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.locator(":focus")).toHaveText("Stopped");
    await expectNoA11yViolations(page);
  });
}

test("a switch takes keyboard focus visibly and is a 24 px target", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await loginViaApi(page);
  await page.goto("/settings");
  const toggle = page.getByRole("switch").first();
  await expect(toggle).toBeVisible();
  // The control people see is the switch's box, which the input fills.
  const box = await toggle.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
  await toggle.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();
  const outline = await toggle.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});

const SIZES = [
  { height: 844, name: "phone", width: 390 },
  { height: 800, name: "desktop", width: 1280 },
] as const;

/** The two looks reviewed: light English and dark Russian, with what each says. */
const LOOKS = [
  {
    bell: "Notifications, 2 unread",
    hint: "Where each kind of notification goes.",
    language: "en",
    name: "light-en",
    scheme: "light",
  },
  {
    bell: "Уведомления, непрочитанных: 2",
    hint: "Куда приходит каждый вид уведомлений.",
    language: "ru",
    name: "dark-ru",
    scheme: "dark",
  },
] as const;

for (const size of SIZES) {
  for (const look of LOOKS) {
    test(`the bell, the feed and Settings: ${look.name} ${size.name}`, async ({ page }, info) => {
      const shot = async (name: string) => {
        await page.waitForFunction(() =>
          document.getAnimations().every((animation) => animation.playState !== "running"),
        );
        const file = `${look.name}-${size.name}-${name}.png`;
        await page.screenshot({
          path: SHOT_DIR === undefined ? info.outputPath(file) : `${SHOT_DIR}/${file}`,
        });
      };
      await page.setViewportSize({ height: size.height, width: size.width });
      await page.emulateMedia({ colorScheme: look.scheme });
      const { token } = await loginViaApi(page);
      await settle(token, look.language);
      await servePool(page);
      await page.goto("/");
      await expect(page.getByRole("button", { name: look.bell })).toBeVisible();
      await shot("bell");
      await page.goto("/notifications");
      await expect(page.getByText(/Firefox on Windows/u)).toBeVisible();
      await shot("feed");
      await expectNoA11yViolations(page);
      await page.goto("/settings");
      await page.getByText(look.hint).scrollIntoViewIfNeeded();
      await shot("settings");
      // Each channel's name fits its column on one line ("Приложение" once broke mid-word).
      const headers = page.getByRole("columnheader");
      await expect(headers).toHaveCount(3);
      const columns = await headers.all();
      for (const header of columns) {
        expect((await header.boundingBox())?.height).toBeLessThan(24);
      }
      await expectNoA11yViolations(page);
    });
  }
}
