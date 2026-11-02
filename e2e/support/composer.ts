import type { Locator, Page } from "@playwright/test";

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
Whether every box that clips `element` shows all of it, unscrolled: a card that is still unfolding
clips its foot, and clicking there makes the browser scroll the clipping box to reveal it, which
the box undoes as it grows, so the click lands beside the button (bug class 5).
*/
const isUnclipped = async (locator: Locator): Promise<boolean> =>
  await locator.evaluate((element) => {
    const own = element.getBoundingClientRect();
    for (let box = element.parentElement; box !== null; box = box.parentElement) {
      const style = globalThis.getComputedStyle(box);
      if (style.overflow !== "hidden" && style.overflowY !== "hidden") {
        continue;
      }
      const clip = box.getBoundingClientRect();
      if (box.scrollTop !== 0 || own.top < clip.top - 0.5 || own.bottom > clip.bottom + 0.5) {
        return false;
      }
    }
    return true;
  });

/** Presses the assistant's Approve once a person could see all of it (its card has unfolded). */
export const approve = async (scope: Locator | Page): Promise<void> => {
  const button = scope.getByRole("button", { name: "Approve" });
  await expect(button).toBeVisible();
  await expect.poll(async () => await isUnclipped(button)).toBe(true);
  await button.click();
};

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
  await approve(page);
  await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible();
  await page.goto("/");
};
