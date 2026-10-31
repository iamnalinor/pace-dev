import { nowTasks } from "./support/composer.ts";
import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

// The Worker runs with LLM_PROVIDER=fake: the "assistant" reads every line as one task titled
// with the line itself, so the journey is deterministic and never leaves the machine.
test("the assistant reads a line, the task is added, the decision is logged", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially("разобрать почту");
  // Enter: the assistant shows a reviewable action; the task is not written yet.
  await line.press("Enter");
  await expect(page.getByText("The assistant will create “разобрать почту”")).toBeVisible();
  await expect(nowTasks(page).getByText("разобрать почту")).toHaveCount(0);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(line).toHaveValue("");
  await page.goto("/");
  await expect(nowTasks(page).getByText("разобрать почту")).toBeVisible();

  await page.goto("/decisions");
  await expect(page.getByRole("heading", { name: "Assistant log" })).toBeVisible();
  await expect(page.getByText("parse.task.create")).toBeVisible();
  await expectNoA11yViolations(page);
});
