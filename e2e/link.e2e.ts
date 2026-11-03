import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

/**
The kit's Link is a real `<a href>` (spec §4.1.1, §7; F-WEB-03): a plain click navigates in place,
a Ctrl/⌘-click opens the address in a new tab and leaves this one where it was. The sidebar's
destinations are kit Links.
*/
test("a sidebar link is an anchor: a click navigates in place, Ctrl/⌘-click opens a new tab", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await loginViaApi(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const week = nav.getByRole("link", { name: "Week" });
  await expect(week).toHaveAttribute("href", "/week");
  await expect(week).toHaveJSProperty("tagName", "A");

  const opened = context.waitForEvent("page");
  await week.click({ modifiers: ["ControlOrMeta"] });
  const tab = await opened;
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toBe("/week");
  expect(new URL(page.url()).pathname).toBe("/");
  await tab.close();

  await week.click();
  await expect(page).toHaveURL(/\/week$/u);
  // In place: no tab was opened by the plain click.
  expect(context.pages()).toHaveLength(1);
});
