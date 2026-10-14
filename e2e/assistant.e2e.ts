import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

// The Worker runs with LLM_PROVIDER=fake: the "assistant" reads every line as one task titled
// with the line itself, so the journey is deterministic and never leaves the machine.
test("the assistant reads a line, the task is added, the decision is logged", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially("разобрать почту");
  // Enter: the assistant reads it into the form, which says so.
  await line.press("Enter");
  const form = page.getByRole("form", { name: "Suggested by the assistant" });
  await expect(form).toBeVisible();
  await expectNoA11yViolations(page);
  await form.getByRole("button", { name: /^Create/u }).click();
  await expect(line).toHaveValue("");
  await expect(
    page.getByRole("list", { name: "Tasks" }).getByText("разобрать почту"),
  ).toBeVisible();

  await page.goto("/decisions");
  await expect(page.getByRole("heading", { name: "Notification log" })).toBeVisible();
  await expect(page.getByText("parse.task.create")).toBeVisible();
  await expectNoA11yViolations(page);
});
