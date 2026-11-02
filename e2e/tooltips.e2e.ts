import type { Locator, Page } from "@playwright/test";

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
M7: the task header's Edit, Pause, Cancel or skip, Delete and Close had none).
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
    expect.arrayContaining([expect.stringContaining("Изменить детали")]),
  );
});

/**
Done at another time, or the task cancelled or skipped, is reachable without a gesture nobody is
told about (QA round 19 M2): Done says what its long press does on hover, and a button beside it
opens the same sheet, whose other outcomes are buttons.
*/
test("Done tells of its other times on hover, and a button beside it opens them", async ({
  page,
}) => {
  const { token } = await loginViaApi(page);
  const seeded = await seedLivedIn(token);
  await page.goto(`/task/${seeded.openTaskId}`);
  const done = page.getByRole("button", { exact: true, name: /^Готово/u });
  await expect(done).toBeVisible();
  await done.hover();
  await expect(page.getByRole("tooltip").filter({ hasText: "Долгое нажатие" })).toBeVisible();
  await page.mouse.move(0, 0);
  const other = page.getByRole("button", { name: "Другое время или итог…" });
  // An icon button: it names itself on hover too.
  expect(await hasTooltipOnHover(page, other)).toBe(true);
  await other.click();
  await expect(page.getByText("Когда это было сделано?")).toBeVisible();
  for (const outcome of ["Отменена", "Пропущена"]) {
    await expect(
      page
        .locator('[data-pace-surface="sheet"]')
        .getByRole("button", { exact: true, name: outcome }),
    ).toBeVisible();
  }
});
