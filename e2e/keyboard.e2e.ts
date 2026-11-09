import type { Locator } from "@playwright/test";

import { addTask, nowTasks } from "./support/composer.ts";
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
  // A switch's ring is on the drawn track (the kit's small visual), not on its 44 px target.
  const visual = toggle.locator("[data-pace-visual]");
  expect(await ringOf(visual)).toEqual({
    color: await focusColor(visual),
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

/**
The phone web's bar is a `nav` of links (spec §4.2.27, F-A11Y-11): Enter follows one, as for any
link, and the current one says `aria-current="page"`. (It was a tablist, where Space had to open a
tab too: Android keeps that role for TalkBack.)
*/
test("Enter opens a destination of the phone's bar, which then says it is the current page", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await loginViaApi(page);
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Main" });
  const day = bar.getByRole("link", { exact: true, name: "Day" });
  await expect(day).toBeVisible();
  await expect(day).toHaveAttribute("href", "/day");
  await day.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/day$/);
  await expect(day).toHaveAttribute("aria-current", "page");
  await expect(bar.getByRole("link", { exact: true, name: "Now" })).not.toHaveAttribute(
    "aria-current",
  );
});

test("Escape closes Now's task pane and gives the focus back to its row; an edit in the pane takes the first Escape (QA round 24 R24-01)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await loginViaApi(page);
  await page.goto("/");
  await addTask(page, "Pack the cables");
  const header = page.getByRole("heading", { exact: true, name: "Pack the cables" });
  await page.getByRole("button", { exact: true, name: "Close" }).first().click();
  await expect(header).toHaveCount(0);
  const row = nowTasks(page).getByRole("link", { name: /^Pack the cables/u });

  await row.click();
  await expect(header).toBeVisible();
  await expect(page).toHaveURL(/[?&]task=/u);
  await page.keyboard.press("Escape");
  await expect(header).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]task=/u);
  await expect(row).toBeFocused();

  // The description edited in place owns the first Escape: the edit goes, the pane stays.
  await row.click();
  await page.getByRole("button", { exact: true, name: "Add description" }).click();
  const field = page.getByRole("textbox", { exact: true, name: "Description" });
  await expect(field).toBeFocused();
  await field.pressSequentially("draft");
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(header).toBeVisible();
  await expect(page).toHaveURL(/[?&]task=/u);
  await page.keyboard.press("Escape");
  await expect(header).toHaveCount(0);
});
