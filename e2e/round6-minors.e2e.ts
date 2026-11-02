import type { Page } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";

/** The accessible name of what has keyboard focus. */
const focusedName = async (page: Page): Promise<string> =>
  await page.evaluate(() => globalThis.document.activeElement?.getAttribute("aria-label") ?? "");

test.describe("on a computer", () => {
  test.use({ viewport: { height: 900, width: 1440 } });

  test("the date picker is one tab stop that opens on today and moves with the arrows (QA 19 L5)", async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.goto("/day");
    await page.getByRole("button", { name: "Pick a day" }).click();
    // The day shown (today) is the picked one, and focus starts on it, not on "Previous month".
    await expect
      .poll(async () => await page.evaluate(() => globalThis.document.activeElement?.ariaSelected))
      .toBe("true");
    const today = await focusedName(page);
    expect(today).toMatch(/day, /u);
    // Left a day, then one Tab leaves the grid: the days are a single stop.
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => await focusedName(page)).not.toBe(today);
    const yesterday = await focusedName(page);
    await page.keyboard.press("Tab");
    expect(await focusedName(page)).not.toMatch(/day, /u);
    await page.keyboard.press("Shift+Tab");
    expect(await focusedName(page)).toBe(yesterday);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Pick a day" })).toBeFocused({ timeout: 5000 });
    await expectNoA11yViolations(page);
  });

  test("a task's tab is named by its title, the new preset form by what it is (QA 18 L8, L4)", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    const { algebraId, openTaskId } = await seedLivedIn(token);
    // The seeded account reads Russian; a person's own words are never translated.
    await page.goto(`/task/${openTaskId}`);
    await expect(page).toHaveTitle("ДЗ по алгебре: №№ 290, 292 · Pace");
    await page.goto(`/project/${algebraId}`);
    await expect(page).toHaveTitle("Алгебра · Pace");
    // Opened the way a person does, from Presets' "Start from".
    await page.goto("/presets");
    await page.getByRole("button", { exact: true, name: "Домашка" }).click();
    await expect(page).toHaveURL(/\/presets\/new\?from=hw$/u);
    await expect(page).toHaveTitle("Новый пресет · Pace");
    // Nothing to type an id into; the cursor is in Name.
    await expect(page.getByRole("textbox", { name: "Идентификатор" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Название" })).toBeFocused();
  });
});
