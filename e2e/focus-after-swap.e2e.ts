import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";

/** Whether keyboard focus fell to the page (`body`, or nothing): the class this file guards. */
const isFocusLost = async (page: Page): Promise<boolean> =>
  await page.evaluate(() => {
    const { activeElement, body } = globalThis.document;
    return activeElement === null || activeElement === body;
  });

test.describe("focus stays at a sensible neighbour when its control goes (QA PR55-1-10, R27-09)", () => {
  test.use({ viewport: { height: 900, width: 1440 } });

  test("a row checked off from the keyboard gives focus to the row that takes its place", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
    await page.goto("/");
    const checks = page.getByRole("checkbox");
    await expect(checks.nth(1)).toBeVisible();
    const next = await checks.nth(1).getAttribute("aria-label");
    await checks.first().focus();
    await page.keyboard.press("Enter");
    // The row dissolves, then leaves: focus is on the next row's check, never the page.
    await expect(page.getByRole("checkbox", { name: next ?? "" })).toBeFocused({ timeout: 5000 });
    expect(await isFocusLost(page)).toBe(false);
  });

  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 844, width: 390 },
  ]) {
    test(`Week's «Edit in Day», then Escape: focus on the block's row, not the page (${String(viewport.width)})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const { token } = await loginViaApi(page);
      await seedLivedIn(token);
      await page.goto("/week");
      await page
        .getByRole("button", { name: /Пошёл в ЦСС/u })
        .first()
        .click();
      await page.getByRole("button", { name: "Изменить в Дне" }).first().click();
      await expect(page).toHaveURL(/\/day/u);
      await expect(page.getByRole("textbox", { name: "Что" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("textbox", { name: "Что" })).toHaveCount(0);
      await expect.poll(async () => await isFocusLost(page), { timeout: 3000 }).toBe(false);
      await expect(page.getByRole("button", { name: /Пошёл в ЦСС/u }).first()).toBeFocused();
    });
  }
});
