import type { Locator, Page } from "@playwright/test";

import { addTask, nowTasks } from "./support/composer.ts";
import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { controlsUnder } from "./support/geometry.ts";
import { loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

/** A thumb's target on a phone (QA round 18 L6). */
const TARGET_PX = 44;

/** How far down the page the header's controls sit (its row, under any safe area). */
const HEADER_PX = 120;

/**
The named controls of the header row (buttons and links whose box starts near the top) that a
press at their centre does not reach: the offline pill floats over the page and must cover
none of them (round 7 review 3). Answers how many were looked at, so the check never passes on
an empty header.
*/
const coveredHeaderControls = async (
  page: Page,
): Promise<{ readonly count: number; readonly covered: readonly string[] }> =>
  await page.evaluate((headerPx) => {
    const controls = [
      ...globalThis.document.querySelectorAll<HTMLElement>(
        '[role="button"], [role="link"], a, button',
      ),
    ].filter((control) => {
      const box = control.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.top < headerPx && box.bottom > 0;
    });
    const covered = controls.filter((control) => {
      const box = control.getBoundingClientRect();
      const hit = globalThis.document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return hit === null || !control.contains(hit);
    });
    return {
      count: controls.length,
      covered: covered.map((control) => control.getAttribute("aria-label") ?? control.textContent),
    };
  }, HEADER_PX);

/** One open task in an English account; answers its id. */
const seedTask = async (token: string): Promise<string> => {
  const now = Date.now();
  const taskId = ulid(now + 1);
  const pushed = await pushAsClient(token, [
    {
      deviceId: "e2e-seed",
      id: ulid(now),
      occurredAt: new Date(now).toISOString(),
      payload: { presetId: "personal", taskId, title: "Post the letter" },
      precision: "exact",
      recordedAt: new Date(now).toISOString(),
      source: "web",
      type: "task.created",
    },
  ]);
  expect(pushed.ok).toBe(true);
  return taskId;
};

for (const [width, height] of [
  [390, 844],
  [1440, 900],
] as const) {
  test(`the offline pill covers no header control and its Retry is a full target at ${String(width)} (round 7 review 3)`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ height, width });
    const { token } = await loginViaApi(page);
    const openTaskId = await seedTask(token);
    const line = page.getByRole("status").filter({ hasText: "Offline · changes will sync" });
    const retries: (null | { readonly height: number; readonly width: number })[] = [];
    // Now (the bell, New task) and a task (Back, its actions).
    for (const path of ["/", `/task/${openTaskId}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible();
      // Judged once the screen has settled: no first-sync cover or grey rows still drawing over
      // its own controls (bug class 20), which the pill check would read as covered by the pill.
      await expect(
        page.getByRole("progressbar", { name: /^(?:Syncing your data|Loading your data…)$/u }),
      ).toHaveCount(0);
      await context.setOffline(true);
      await expect(line).toBeVisible();
      // Polled: going offline redraws Now's line (its assistant button), and a control caught
      // mid-redraw reads as covered. The pill does not move, so a pill that covers a control
      // keeps covering it and still fails here.
      await expect
        .poll(async () => await coveredHeaderControls(page), { timeout: 5000 })
        .toEqual(expect.objectContaining({ covered: [] }));
      expect((await coveredHeaderControls(page)).count).toBeGreaterThan(0);
      await expectNoA11yViolations(page);
      retries.push(await line.getByRole("button", { name: "Try again" }).boundingBox());
      await context.setOffline(false);
      await expect(line).toHaveCount(0);
    }
    // Retry's own box takes the press: react-native-web ignores `hitSlop`.
    for (const retry of retries) {
      expect(retry?.width ?? 0).toBeGreaterThanOrEqual(TARGET_PX);
      expect(retry?.height ?? 0).toBeGreaterThanOrEqual(TARGET_PX);
    }
  });
}

/** The pill's height at two lines of footnote text: a third line is QA round 21 L9 again. */
const TWO_LINES_PX = 56;

/** A Russian account, the longest copy, as the person on a phone reads it. */
const toRussian = async (token: string): Promise<void> => {
  const now = Date.now();
  const pushed = await pushAsClient(token, [
    {
      deviceId: "e2e-seed",
      id: ulid(now),
      occurredAt: new Date(now).toISOString(),
      payload: { language: "ru", timezone: "Europe/Moscow" },
      precision: "exact",
      recordedAt: new Date(now).toISOString(),
      source: "web",
      type: "settings.updated",
    },
  ]);
  expect(pushed.ok).toBe(true);
};

test.describe("in Russian at 390 (QA round 21 L9, design pass M8)", () => {
  // The device's language too: the not-loaded pill speaks before the account's is known.
  test.use({ locale: "ru-RU", viewport: { height: 844, width: 390 } });

  test("the offline pill keeps to two lines beside Try again", async ({ context, page }) => {
    const { token } = await loginViaApi(page);
    await seedTask(token);
    await toRussian(token);
    const pill = page.getByTestId("sync-strip");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Сейчас" })).toBeVisible();
    await context.setOffline(true);
    await expect(pill.getByRole("button", { name: "Попробовать снова" })).toBeVisible();
    expect((await pill.boundingBox())?.height ?? 0).toBeLessThanOrEqual(TWO_LINES_PX);
  });

  test("the not-loaded pill keeps to two lines beside Try again", async ({ page }) => {
    const { token } = await loginViaApi(page);
    await seedTask(token);
    await toRussian(token);
    // A failing deploy: the first pull is refused and the socket answers no better.
    await page.routeWebSocket(/\/api\/sync\/live/u, async (socket) => {
      await socket.close();
    });
    await page.route("**/api/sync/pull**", async (route) => {
      await route.fulfill({ body: '{"code":"internal"}', status: 500 });
    });
    const pill = page.getByTestId("sync-strip");
    await page.goto("/");
    await expect(pill.getByRole("button", { name: "Попробовать снова" })).toBeVisible({
      timeout: 20_000,
    });
    expect((await pill.boundingBox())?.height ?? 0).toBeLessThanOrEqual(TWO_LINES_PX);
  });
});

/** Whether two boxes share any area (a pixel of rounding aside). */
const isOverlapping = (
  a: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  b: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean =>
  a.x < b.x + b.width - 1 &&
  b.x < a.x + a.width - 1 &&
  a.y < b.y + b.height - 1 &&
  b.y < a.y + a.height - 1;

/** Whether a press at the centre of the pill's button named `name` reaches it (nothing lies over it). */
const isPillButtonPressable = async (page: Page, name: string): Promise<boolean> =>
  await page.evaluate((buttonName) => {
    const button = [
      ...globalThis.document.querySelectorAll<HTMLElement>(
        '[data-testid="sync-strip"] [role="button"]',
      ),
    ].find((each) => each.textContent.trim() === buttonName);
    if (button === undefined) {
      return false;
    }
    const box = button.getBoundingClientRect();
    const hit = globalThis.document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return hit !== null && button.contains(hit);
  }, name);

/** A locator's box, which must be on screen. */
const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("not on screen");
  }
  return box;
};

for (const [width, height] of [
  [390, 844],
  [1440, 900],
] as const) {
  test(`offline with a toast: the toast stacks above the pill, its Retry still pressable at ${String(width)} (review #6)`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ height, width });
    await loginViaApi(page);
    await page.goto("/");
    await addTask(page, `Stacked ${String(width)}`);
    await context.setOffline(true);
    const pill = page.getByTestId("sync-strip");
    await expect(pill).toBeVisible();
    // Deleting a task says so in a toast (with Undo), offline as online.
    await nowTasks(page)
      .getByText(`Stacked ${String(width)}`)
      .click();
    await page.getByRole("button", { name: "Delete the task" }).click();
    const toast = page.getByTestId("toast-card");
    await expect(toast).toBeVisible();
    await page.waitForFunction(() =>
      globalThis.document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    const [pillBox, toastBox] = [await boxOf(pill), await boxOf(toast)];
    expect(isOverlapping(pillBox, toastBox)).toBe(false);
    // Stacked: the toast above the pill, not beside or under it.
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(pillBox.y);
    expect(await isPillButtonPressable(page, "Try again")).toBe(true);
    await context.setOffline(false);
  });
}

test("at 1440 the pill floats inside the content column, clear of the sidebar and the time bar (R23-13a)", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await loginViaApi(page);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Time" })).toBeVisible();
  await context.setOffline(true);
  const pill = page.getByTestId("sync-strip");
  await expect(pill).toBeVisible();
  const [pillBox, contentBox] = [await boxOf(pill), await boxOf(page.getByTestId("shell-content"))];
  // Wholly in the content region: it no longer straddles the sidebar's edge.
  expect(pillBox.x).toBeGreaterThanOrEqual(contentBox.x);
  expect(pillBox.x + pillBox.width).toBeLessThanOrEqual(contentBox.x + contentBox.width);
  // Over none of the time bar's controls (or any other).
  expect(await controlsUnder(page, '[data-testid="sync-strip"]')).toEqual([]);
  await context.setOffline(false);
});
