import type { Locator, Page } from "@playwright/test";

import { ru } from "./support/catalog.ts";
import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { type LivedIn, seedLivedIn } from "./support/seed.ts";

test.use({ viewport: { height: 900, width: 1440 } });

/** The main desktop screens of the lived-in account. */
const screensOf = (seeded: LivedIn): readonly string[] => [
  "/",
  `/task/${seeded.openTaskId}`,
  "/day",
  "/week",
  "/history",
  "/projects",
  `/project/${seeded.algebraId}`,
  "/settings",
  "/notifications",
  "/inbox",
  "/insights",
  "/decisions",
  "/presets",
];

/**
The buttons on the page that show no name of their own (an icon, digits at most): a mouse user
learns what they do only from a tooltip. A switch or a check sits beside the words that name it.
*/
const iconOnlyButtons = async (page: Page): Promise<readonly Locator[]> => {
  const buttons = await page.locator('[role="button"]:visible, button:visible').all();
  const found: Locator[] = [];
  for (const button of buttons) {
    const text = (await button.innerText()).trim();
    const name = (await button.getAttribute("aria-label")) ?? "";
    if (name !== "" && !/\p{L}/u.test(text)) {
      found.push(button);
    }
  }
  return found;
};

/** Whether hovering the button brings a tooltip up. */
const hasTooltipOnHover = async (page: Page, button: Locator): Promise<boolean> => {
  await button.hover();
  try {
    await page.getByRole("tooltip").first().waitFor({ state: "visible", timeout: 1500 });
    return true;
  } catch {
    return false;
  } finally {
    await page.mouse.move(0, 0);
  }
};

/** The names of the icon-only buttons of one screen, each with whether it showed a tooltip. */
const sweepScreen = async (
  page: Page,
  url: string,
): Promise<readonly { readonly name: string; readonly isShown: boolean }[]> => {
  await page.goto(url);
  await expect(page.getByRole("navigation", { name: "Основное" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  const results: { readonly name: string; readonly isShown: boolean }[] = [];
  const buttons = await iconOnlyButtons(page);
  for (const button of buttons) {
    const name = (await button.getAttribute("aria-label")) ?? "";
    results.push({ isShown: await hasTooltipOnHover(page, button), name: `${url}: "${name}"` });
  }
  return results;
};

/**
Every icon-only button on the main desktop screens names itself in a tooltip on hover (QA round 17
M7: the task header’s icon buttons had none).
*/
test("every icon-only button on a computer shows its name on hover", async ({ page }) => {
  test.setTimeout(180_000);
  const { token } = await loginViaApi(page);
  const urls = screensOf(await seedLivedIn(token));
  const results: { readonly name: string; readonly isShown: boolean }[] = [];
  for (const url of urls) {
    results.push(...(await sweepScreen(page, url)));
  }
  expect(results.filter((result) => !result.isShown).map((result) => result.name)).toEqual([]);
  // The sweep met the task header's actions (it would pass on a page where it found none).
  expect(results.map((result) => result.name)).toEqual(
    expect.arrayContaining([expect.stringContaining("Ещё действия")]),
  );
});

/**
Done at another time, or the task cancelled or skipped, is reachable without a gesture nobody is
told about (QA round 19 M2): Done says what it does on hover, and a button under it, named in
words on a computer, opens the same sheet with its outcomes in one choice (QA round 20 L3, L6).
*/
test("Done tells of its other times on hover, and a button under it opens them", async ({
  page,
}) => {
  const { token } = await loginViaApi(page);
  const seeded = await seedLivedIn(token);
  await page.goto(`/task/${seeded.openTaskId}`);
  // Done is the footer's primary for every open task (feedback 5: no "Submit N" any more).
  const done = page.getByRole("button", { name: /^Готово/u });
  await expect(done).toBeVisible();
  await done.hover();
  // What Done does; the way to another time is the button under it (QA 20 L3).
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Закрывает задачу сейчас." }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  const other = page.getByRole("button", { name: "Другое время или итог…" });
  // It says what it is in words, under Focus and Done (design review B1).
  await expect(other).toHaveText("Другое время или итог…");
  await other.click();
  await expect(page.locator('[data-pace-surface="sheet"]')).toBeVisible();
  // The outcome is one choice in sight (QA 20 L6).
  for (const outcome of ["Отменена", "Пропущена"]) {
    await expect(
      page
        .locator('[data-pace-surface="sheet"]')
        .getByRole("radio", { exact: true, name: outcome }),
    ).toBeVisible();
  }
});

/** Gives `control` the keyboard's focus (a tooltip shows for it at once, not for a click's). */
const focusByKeyboard = async (page: Page, control: Locator): Promise<void> => {
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(control).toBeFocused();
};

/**
Escape at a shown tooltip takes only the tooltip away (review of the fix wave 293b78c..9039ae6,
I1): the pane's Escape shortcut and react-native-web's Modal (it closes on the keyup) heard the
same Escape and closed the pane or the sheet with it. The next Escape closes the container.
*/
test.describe("Escape at a tooltip inside a container", () => {
  test.use({ viewport: { height: 900, width: 1280 } });

  test("a sheet's cross: the first Escape takes the tooltip, the second the sheet", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    const seeded = await seedLivedIn(token);
    await page.goto(`/task/${seeded.openTaskId}`);
    await page.getByRole("button", { name: ru["task.doneOther"] }).click();
    const sheet = page.locator('[data-pace-surface="sheet"]');
    await expect(sheet).toBeVisible();
    await focusByKeyboard(page, sheet.getByRole("button", { name: ru["common.close"] }));
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });

  test("an inspector pane's cross: the first Escape takes the tooltip, the second the pane", async ({
    page,
  }) => {
    // The lived-in account speaks Russian, as the names below.
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
    await page.goto("/day");
    await page.getByRole("button", { name: ru["day.logPast"] }).click();
    const pane = page.getByRole("region", { name: ru["day.details"] });
    await expect(pane).toBeVisible();
    await focusByKeyboard(page, pane.getByRole("button", { name: ru["common.close"] }));
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(pane).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
  });
});
