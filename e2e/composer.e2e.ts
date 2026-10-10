import type { Page } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

const LINES = [
  "синк по дашборду завтра 15:00 1ч https://example.com/dashboards",
  "срочно позвонить в банк",
  "read the RFC on Friday 30m #Reading",
  "renew the passport someday",
];

/** Typed key by key (a fill reads as a paste, which the assistant reads into the form). */
const addLine = async (page: Page, text: string): Promise<void> => {
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially(text);
  await line.press("Enter");
  await expect(line).toHaveValue("");
};

/** Screenshots for the design pass land here when SCREENSHOTS_DIR is set. */
const shoot = async (page: Page, name: string): Promise<void> => {
  const dir = process.env["SCREENSHOTS_DIR"];
  if (dir !== undefined) {
    await page.screenshot({ fullPage: true, path: `${dir}/${name}.png` });
  }
};

for (const [width, height, size] of [
  [390, 844, "phone"],
  [1440, 900, "desktop"],
] as const) {
  for (const theme of ["dark", "light"] as const) {
    test(`composer adds lines and fills the form (${size}, ${theme})`, async ({ page }) => {
      await loginViaApi(page);
      await page.addInitScript((value) => {
        localStorage.setItem("pace.theme", value);
      }, theme);
      await page.setViewportSize({ height, width });
      await page.goto("/");
      const line = page.getByRole("textbox", { name: "New task" });
      await line.pressSequentially(LINES[0] ?? "");
      await page.getByRole("button", { name: "Fill in by hand" }).click();
      const form = page.getByRole("form", { name: "New task" });
      await expect(form.getByRole("radio", { exact: true, name: "Work" })).toBeChecked();
      await expect(form.getByRole("textbox", { name: "Link" })).toHaveValue(
        "https://example.com/dashboards",
      );
      await shoot(page, `composer-${size}-${theme}`);
      await expectNoA11yViolations(page);
      await form.getByRole("button", { name: "Create" }).click();
      // Saving clears the line: type the next one only after that, or the clearing eats it.
      await expect(line).toHaveValue("");
      for (const text of LINES.slice(1)) {
        await addLine(page, text);
      }
      const board = page.getByRole("list", { name: "Tasks" });
      await expect(board.getByText("синк по дашборду")).toBeVisible();
      await expect(board.getByText("позвонить в банк")).toBeVisible();
      await shoot(page, `now-${size}-${theme}`);
      await expectNoA11yViolations(page);

      await board.getByRole("link", { name: /синк по дашборду/u }).click();
      await expect(page.getByRole("heading", { name: /синк по дашборду/u })).toBeVisible();
      await shoot(page, `task-${size}-${theme}`);
      await expectNoA11yViolations(page);
    });
  }
}

test("a pasted message opens the form and is written only on Create", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const message = "№№ 290, 292, 293 — решить методом выделения линейных множителей";
  // A fill is a paste: the (fake) assistant reads it at once and the form opens.
  await page.getByRole("textbox", { name: "New task" }).fill(message);
  const form = page.getByRole("form", { name: "New task" });
  await expect(form.getByRole("textbox", { name: "Title" })).toHaveValue(message);
  await expect(page.getByRole("list", { name: "Tasks" }).getByText(message)).toHaveCount(0);
  await expectNoA11yViolations(page);
  await form.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("list", { name: "Tasks" }).getByText(message)).toBeVisible();
});
