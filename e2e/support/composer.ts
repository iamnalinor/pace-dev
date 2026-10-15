import type { Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

/** The task form, wherever it shows (the line's card on a phone, Now's right pane on a computer). */
export const taskForm = (page: Page) =>
  page.getByRole("form", { name: /^(?:New task|Suggested by the assistant)$/u });

/**
The line's +, which opens the form by hand (on a computer the sidebar's New task, which does the
same, comes first).
*/
export const formByHand = (page: Page) =>
  page.getByRole("button", { exact: true, name: "New task" }).last();

/**
Adds a task the way a person does: the line typed key by key (a fill reads as a paste), Enter
unfolds the form with the (fake) assistant's reading, a second Enter in the title adds it.
*/
export const addTask = async (page: Page, text: string): Promise<void> => {
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially(text);
  await line.press("Enter");
  const title = taskForm(page).getByRole("textbox", { exact: true, name: "Title" });
  // The cursor is already in the title: the second Enter is just a key, nothing to click.
  await expect(title).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(line).toHaveValue("");
};
