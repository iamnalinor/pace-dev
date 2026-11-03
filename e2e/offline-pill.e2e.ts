import type { Page } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
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
    const line = page.getByRole("status").filter({ hasText: "You are offline" });
    const retries: (null | { readonly height: number; readonly width: number })[] = [];
    // Now (the bell, New task) and a task (Back, its actions).
    for (const path of ["/", `/task/${openTaskId}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await context.setOffline(true);
      await expect(line).toBeVisible();
      const header = await coveredHeaderControls(page);
      expect(header.count).toBeGreaterThan(0);
      expect(header.covered).toEqual([]);
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
