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
  // The log says in words what became of the message, quotes it, and opens the task it created.
  const row = page.getByRole("button", { name: "Created task “разобрать почту”" });
  await expect(row).toBeVisible();
  await expect(row.getByText("You wrote: “разобрать почту”")).toBeVisible();
  await expect(row.getByText("You approved it")).toBeVisible();
  await expect(page.getByText("parse.task.create")).toHaveCount(0);
  await expect(page.getByText(/fake|compatible/u)).toHaveCount(0);
  await expectNoA11yViolations(page);
  await row.click();
  await expect(page).toHaveURL(/\/task\//u);
});

// `#ask <title>`: the fake model asks when (Today / Tomorrow) and whether it is for work or
// home, and on an answer asks only what the answer did not quote.
test("an assistant question is answered with one click, by keyboard too", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially("#ask Съездить в банк");
  await line.press("Enter");
  const when = page.getByRole("group", { name: "By when does this need to be done?" });
  const tomorrow = when.getByRole("button", { name: "Tomorrow" });
  await expect(tomorrow).toBeVisible();
  await expect(page.getByText("Is this for work or home?")).toBeVisible();
  await expect(
    page.getByText(
      "Approve keeps what is shown. To refine it, tap an answer or type one in the field below.",
    ),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  // Each option is a 44px target that the keyboard reaches and presses.
  expect((await tomorrow.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await tomorrow.focus();
  await page.keyboard.press("Enter");
  // The answer stays in view instead of the question; the open one is still asked.
  await expect(when).toHaveCount(0);
  await expect(
    page.getByLabel("Answered: By when does this need to be done? — Tomorrow"),
  ).toBeVisible();
  await expect(page.getByText("Is this for work or home?")).toBeVisible();
  await expect(page.getByText("The assistant will create “Съездить в банк”")).toBeVisible();
  await expect(nowTasks(page).getByText("Съездить в банк")).toHaveCount(0);
  // Approved after the answer: the log shows the conversation as one row with one outcome.
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(line).toHaveValue("");
  await page.goto("/decisions");
  const row = page.getByRole("button", { name: /Created task “Съездить в банк”/u });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("You wrote: “#ask Съездить в банк”")).toBeVisible();
  await expect(
    row.getByText("You answered “By when does this need to be done?”: Tomorrow"),
  ).toBeVisible();
  await expect(row.getByText("You approved it")).toBeVisible();
});

// QA round 13 L2: Escape with the caret in the line closes the card and keeps the text.
test("Escape in the line closes the assistant's card and keeps the text", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially("#ask Съездить в банк");
  await line.press("Enter");
  await expect(page.getByText("The assistant will create “Съездить в банк”")).toBeVisible();
  await line.focus();
  await line.press("Escape");
  await expect(page.getByText("The assistant will create “Съездить в банк”")).toHaveCount(0);
  await expect(line).toHaveValue("#ask Съездить в банк");
});

// QA round 13 M2: a pasted message is read at once; Enter while it is read sends nothing more.
test("a pasted message about a task goes to the assistant once", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const parses: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/parse")) {
      parses.push(request.postData() ?? "");
    }
  });
  const line = page.getByRole("textbox", { name: "New task" });
  await line.fill("rename task Gamma to Delta");
  await line.press("Enter");
  // No task Gamma: the assistant says it found nothing, rather than asking to try again.
  await expect(page.getByText(/^The assistant found nothing to do with this\./u)).toBeVisible();
  // Both requests (when there were two) left before the answer that is shown came back.
  expect(parses).toHaveLength(1);
});

// QA round 13 M4: in the time bar `#ask` asks how long, and an answer sets the length.
test("the time bar's assistant asks how long, answered with one click", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "What are you doing?" });
  await field.fill("#ask Bar question");
  await field.press("Enter");
  const length = page.getByRole("group", { name: "How long will it take?" });
  await length.getByRole("button", { name: "1h" }).click();
  await expect(page.getByLabel("Answered: How long will it take? — 1h")).toBeVisible();
  await expect(page.getByText("Expect: ~1h")).toBeVisible();
  await expect(page.getByText("The assistant could not read this. Try again.")).toHaveCount(0);
});
