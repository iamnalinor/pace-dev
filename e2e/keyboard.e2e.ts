import type { Locator } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";

/**
The keyboard on controls the browser does not draw itself (bug-lessons class 113): react-native-web
presses a pressable on Enter and, for a switch, radio or checkbox, ignored Space; and the page's
one focus ring must reach every focusable, a range slider among them.
*/

/** The colour the `focus` role resolves to where `control` is, as a computed colour. */
const focusColor = async (control: Locator): Promise<string> =>
  await control.evaluate((element) => {
    const probe = element.ownerDocument.createElement("div");
    probe.style.color = "var(--pace-focus)";
    element.append(probe);
    const { color } = getComputedStyle(probe);
    probe.remove();
    return color;
  });

const ringOf = async (control: Locator): Promise<{ color: string; style: string; width: string }> =>
  await control.evaluate((element) => {
    const { outlineColor, outlineStyle, outlineWidth } = getComputedStyle(element);
    return { color: outlineColor, style: outlineStyle, width: outlineWidth };
  });

test("Space presses a switch and a chip, which react-native-web leaves to Enter", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await loginViaApi(page);
  await page.goto("/settings");
  const night = page.getByRole("switch", { name: "Show night hours" });
  await expect(night).toBeVisible();
  await expect(night).not.toBeChecked();
  await night.focus();
  await page.keyboard.press("Space");
  await expect(night).toBeChecked();
  await page.keyboard.press("Space");
  await expect(night).not.toBeChecked();

  const dark = page.getByRole("radio", { name: "Dark" });
  await dark.focus();
  await page.keyboard.press("Space");
  await expect(dark).toBeChecked();
});

test("the keyboard ring is the focus role on a switch and on the range slider", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  const { token } = await loginViaApi(page);
  const { repeatingTaskId } = await seedLivedIn(token);

  await page.goto("/settings");
  const toggle = page.getByRole("switch").first();
  await toggle.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();
  expect(await ringOf(toggle)).toEqual({
    color: await focusColor(toggle),
    style: "solid",
    width: "2px",
  });

  // The open task has subtasks; a task without them shows the slider.
  await page.goto(`/task/${repeatingTaskId}`);
  const slider = page.locator("[data-pace-slider]");
  await expect(slider).toBeVisible();
  await slider.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(slider).toBeFocused();
  // An input holds no children: the colour is read from its parent.
  expect(await ringOf(slider)).toEqual({
    color: await focusColor(slider.locator("xpath=..")),
    style: "solid",
    width: "2px",
  });
});

test("Space opens a tab of the phone's bar, as Enter does", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await loginViaApi(page);
  await page.goto("/");
  const day = page.getByRole("tab", { name: "Day" });
  await expect(day).toBeVisible();
  await day.focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/\/day$/);
  await expect(day).toHaveAttribute("aria-selected", "true");
});
