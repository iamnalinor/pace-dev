import type { Page } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

const SIZES = [
  { height: 844, name: "phone", width: 390 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

/** A word of its own per run, so a reused server or a parallel copy never shows the same line. */
const unique = (): string => crypto.randomUUID().slice(0, 6);

const add = async (page: Page, text: string): Promise<void> => {
  const line = page.getByRole("textbox", { name: "New task" });
  await line.fill(text);
  await line.press("Enter");
  await expect(line).toHaveValue("");
};

for (const size of SIZES) {
  test.describe(`${size.name} (${String(size.width)}px)`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("checks a task off and brings it back from History", async ({ page }) => {
      await loginViaApi(page);
      await page.goto("/");
      const title = `water the plants ${size.name} ${unique()}`;
      await add(page, title);
      const board = page.getByRole("list", { name: "Tasks" });
      await board.getByRole("checkbox", { name: `Mark ${title} done` }).click();
      await expect(board.getByText(title)).toHaveCount(0);
      // No toast: the change is in History, undone from there.
      await page.goto("/history");
      // The newest change is the close; the undo is stored once its correction is listed, and
      // navigating sooner can reload the page before the write.
      await expect(page.getByText(`Task closed · ${title}`)).toBeVisible();
      await page.getByRole("button", { name: "Undo" }).first().click();
      await expect(page.getByText("Correction: revoked")).toBeVisible();
      await page.goto("/");
      await expect(page.getByRole("list", { name: "Tasks" }).getByText(title)).toBeVisible();
    });

    test("sends a line to Inbox and sorts it there", async ({ page }) => {
      await loginViaApi(page);
      await page.goto("/");
      const text = `ask about the ${size.name} invoice ${unique()}`;
      const line = page.getByRole("textbox", { name: "New task" });
      await line.fill(text);
      await page.getByRole("button", { name: "To Inbox" }).click();
      // The line clears once the capture is stored: navigating sooner can reload before the write.
      await expect(line).toHaveValue("");
      await page.goto("/inbox");
      await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
      const card = page.getByRole("listitem").filter({ hasText: text });
      await expect(card).toBeVisible();
      await expectNoA11yViolations(page);
      await card.getByRole("button", { name: "Accept" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: text })).toHaveCount(0);
    });

    test("history, settings and an unknown page explain themselves", async ({ page }) => {
      await loginViaApi(page);
      await page.goto("/history");
      await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
      await expectNoA11yViolations(page);
      await page.goto("/settings");
      await expect(page.getByText(/^Account: /u)).toBeVisible();
      await page.goto("/no-such-page");
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await expect(page.getByText("There is nothing at /no-such-page.")).toBeVisible();
      await expectNoA11yViolations(page);
    });
  });
}
