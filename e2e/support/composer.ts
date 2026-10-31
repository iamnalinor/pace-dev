import type { Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

/** The task form, wherever it shows (the line's card on a phone, Now's right pane on a computer). */
export const taskForm = (page: Page) => page.getByRole("form", { name: "New task" });

/**
The line's +, which opens the form by hand (on a computer the sidebar's New task, which does the
same, comes first).
*/
export const formByHand = (page: Page) =>
  page.getByRole("button", { exact: true, name: "New task" }).last();

/**
Now's task rows: one list while the tasks are all dated or all undated, else the two groups
"With a deadline" and "No deadline".
*/
export const nowTasks = (page: Page) =>
  page.getByRole("list", { name: /^(?:Tasks|With a deadline|No deadline)$/u });

/**
Adds a task the way a person does: type, review the assistant's action, then approve it.
Approval opens the new task (full screen on a phone, so the line is gone; in the pane on a
computer, where the line empties), so return to Now for callers that add several tasks.
*/
export const addTask = async (page: Page, text: string): Promise<void> => {
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially(text);
  await line.press("Enter");
  await expect(page.getByText(/^The assistant will create /u)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible();
  await page.goto("/");
};
