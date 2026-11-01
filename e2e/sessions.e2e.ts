import type { Locator } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { API_URL, loginViaApi } from "./support/login.ts";

/** Screenshots for review land here when set (the run's output folder otherwise). */
const SHOT_DIR = process.env["E2E_SHOT_DIR"];

/** Where a shown element sits; it must be on screen. */
const boxOf = async (
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("not on screen");
  }
  return box;
};

const SIZES = [
  { height: 844, name: "phone", width: 390 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

for (const size of SIZES) {
  test.describe(`Settings → Devices and sessions (${size.name})`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("lists this browser, connects a computer and disconnects it", async ({ page }, info) => {
      await loginViaApi(page);
      await page.goto("/settings");
      const section = page.getByRole("group", { name: "Devices and sessions" });
      await expect(section.getByText("This device")).toBeVisible();
      await expectNoA11yViolations(page);

      // By keyboard (QA round 15 M2): the name is focused with its suggestion selected, the button
      // shows Enter, and Enter in the field creates the token.
      await section.getByRole("button", { name: "Add a computer" }).click();
      const name = page.getByRole("textbox", { name: "Name" });
      await expect(name).toBeFocused();
      await expect(page.getByRole("button", { name: "Create the token" })).toHaveAttribute(
        "aria-keyshortcuts",
        "Enter",
      );
      await page.keyboard.type("Linux Mint");
      await expect(name).toHaveValue("Linux Mint");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("device-setup-token")).not.toBeEmpty();
      // The commands name the local API, the server this build talks to.
      await page.getByRole("radio", { name: "Linux" }).click();
      await expect(page.getByText(/^curl .*pace_agent\.py install /u)).toContainText(
        `--api ${API_URL}`,
      );
      await expectNoA11yViolations(page);
      await page.getByRole("button", { name: "Done" }).click();

      // The same list shows the new computer, which has sent nothing yet.
      const computer = section.getByRole("group", { name: "Linux Mint" });
      await expect(computer.getByText("Nothing sent yet")).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path:
          SHOT_DIR === undefined
            ? info.outputPath(`settings-${size.name}.png`)
            : `${SHOT_DIR}/settings-${size.name}.png`,
      });
      // By keyboard, focus stays in the row (bug class 5): onto Cancel inside the confirm, which
      // is named by its question, and back onto Disconnect when cancelled.
      await computer.getByRole("button", { name: "Disconnect" }).focus();
      await page.keyboard.press("Enter");
      const confirm = computer.getByRole("group", {
        name: "Disconnect this computer? Its token stops working at once.",
      });
      await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(computer.getByRole("button", { name: "Disconnect" })).toBeFocused();

      await computer.getByRole("button", { name: "Disconnect" }).click();
      await expect(confirm.getByRole("status")).toHaveText(
        "Disconnect this computer? Its token stops working at once.",
      );
      // One order on every width (QA round 15 M3): the question, then Cancel and the action on
      // one line under it, Cancel first.
      const question = await boxOf(confirm.getByRole("status"));
      const cancel = await boxOf(confirm.getByRole("button", { name: "Cancel" }));
      const action = await boxOf(confirm.getByRole("button", { name: "Disconnect" }));
      expect(cancel.y).toBeGreaterThanOrEqual(question.y + question.height);
      expect(Math.abs(cancel.y - action.y)).toBeLessThan(2);
      expect(cancel.x + cancel.width).toBeLessThanOrEqual(action.x);
      await expectNoA11yViolations(page);
      await confirm.getByRole("button", { name: "Disconnect" }).click();
      await expect(computer).toHaveCount(0);
      // The row took its focus with it: it moves on to the control after the list (bug class 5).
      await expect(section.getByRole("button", { name: "Add a computer" })).toBeFocused();
      await page.reload();
      await expect(section.getByText("This device")).toBeVisible();
      await expect(section.getByRole("group", { name: "Linux Mint" })).toHaveCount(0);
    });

    test("shows the local server's MCP URL under Connect an AI app", async ({ page }) => {
      await loginViaApi(page);
      await page.goto("/settings");
      await page.getByRole("button", { name: "Connect an AI app" }).click();
      await expect(page.getByText(`${API_URL}/mcp`, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Copy the URL" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "ChatGPT" })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test("no longer has a Devices screen", async ({ page }) => {
      await loginViaApi(page);
      await page.goto("/devices");
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    });
  });
}
