import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

type Modifier = "Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift";

/**
Clicks and reads what the page did with the click's default action: "followed" (left to the
browser: a Ctrl/⌘-click opens a new tab) or "prevented" (the app handled it). Read once the click
has been dispatched: react-native-web stops its propagation, so no later listener sees it.
Whether a tab then opens is the browser's part, and CI's headless shell does not always open one
for a Ctrl-click, even on a bare `<a href>` (about 1 in 50, no app code on the page).
*/
const clickReadingDefault = async (
  page: Page,
  link: Locator,
  modifiers: readonly Modifier[],
): Promise<string> => {
  // A handle on a box holding the promise (a promise itself would be awaited before the click),
  // so it lives in the page without a global of its own.
  const answer = await page.evaluateHandle(() => ({
    click: new Promise<string>((resolve) => {
      globalThis.addEventListener(
        "click",
        (event) => {
          setTimeout(() => {
            resolve(event.defaultPrevented ? "prevented" : "followed");
          }, 0);
        },
        { capture: true, once: true },
      );
    }),
  }));
  await link.click({ modifiers: [...modifiers] });
  return await answer.evaluate(async (box) => await box.click);
};

/** Closes every tab but `page` once it has loaded, and says which address each one had opened. */
const closeOtherTabs = async (page: Page): Promise<readonly string[]> => {
  const others = page
    .context()
    .pages()
    .filter((tab) => tab !== page);
  const paths: string[] = [];
  for (const tab of others) {
    await tab.waitForLoadState();
    paths.push(new URL(tab.url()).pathname);
    await tab.close();
  }
  return paths;
};

/**
The kit's Link is a real `<a href>` (spec §4.1.1, §7; F-WEB-03): a plain click navigates in place,
a Ctrl/⌘-click is left to the browser (a new tab) and this one stays where it was. The sidebar's
destinations are kit Links.
*/
test("a sidebar link is an anchor: a click navigates in place, Ctrl/⌘-click opens a new tab", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await loginViaApi(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const week = nav.getByRole("link", { name: "Week" });
  await expect(week).toHaveAttribute("href", "/week");
  await expect(week).toHaveJSProperty("tagName", "A");

  // Ctrl/⌘-click: the app leaves the click to the browser (its default, a new tab) and stays.
  expect(await clickReadingDefault(page, week, ["ControlOrMeta"])).toBe("followed");
  expect(new URL(page.url()).pathname).toBe("/");
  const openedTabs = await closeOtherTabs(page);
  expect(openedTabs.filter((path) => path !== "/week")).toEqual([]);

  // A plain click: the app takes it over and navigates in place, so the browser does not.
  expect(await clickReadingDefault(page, week, [])).toBe("prevented");
  await expect(page).toHaveURL(/\/week$/u);
});
