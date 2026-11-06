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
told about (QA round 19 M2): Done says what it does on hover, and a button beside it, named in
words on a computer, opens the same sheet with its outcomes in one choice (QA round 20 L3, L6).
*/
test("Done tells of its other times on hover, and a button beside it opens them", async ({
  page,
}) => {
  const { token } = await loginViaApi(page);
  const seeded = await seedLivedIn(token);
  await page.goto(`/task/${seeded.openTaskId}`);
  // Done, or "Submit …" for a task handed in by its subtasks: the footer's primary either way.
  const done = page.getByRole("button", { name: /^(?:Готово|Сдать)/u });
  await expect(done).toBeVisible();
  await done.hover();
  // What Done does; the way to another time is the button beside it (QA 20 L3).
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Закрывает задачу сейчас." }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  const other = page.getByRole("button", { name: "Другое время или итог…" });
  // On a computer's window it says what it is in words.
  await expect(other).toHaveText("Другое время…");
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
