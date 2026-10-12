import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

// The Worker runs with LLM_PROVIDER=fake: the "assistant" reads every line as one task titled
// with the line itself, so the journey is deterministic and never leaves the machine.
test("the assistant reads a line, the task is added, the decision is logged", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially("разобрать почту");
  // Enter: the assistant reads it, and the card unfolds into the form in place.
  await line.press("Enter");
  await expect(page.getByText(/Read by the assistant\./u)).toBeVisible();
  await expectNoA11yViolations(page);
  await page
    .getByRole("form", { name: "Check before adding" })
    .getByRole("button", { name: /^Create/u })
    .click();
  await expect(line).toHaveValue("");
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText("разобрать почту"),
  ).toBeVisible();

  await page.goto("/decisions");
  await expect(page.getByRole("heading", { name: "Notification log" })).toBeVisible();
  await expect(page.getByText("parse.create_task")).toBeVisible();
  await expectNoA11yViolations(page);
});
