import type { Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

/**
Adds a task the way a person does: the line typed key by key (a fill reads as a paste), Enter
unfolds the form with the (fake) assistant's reading, a second Enter in the title adds it.
*/
export const addTask = async (page: Page, text: string): Promise<void> => {
  const line = page.getByRole("textbox", { name: "New task" });
  await line.pressSequentially(text);
  await line.press("Enter");
  const title = page.getByRole("form", { name: "Check before adding" }).getByRole("textbox", {
    exact: true,
    name: "Title",
  });
  await expect(title).toBeVisible();
  await title.press("Enter");
  await expect(line).toHaveValue("");
};
