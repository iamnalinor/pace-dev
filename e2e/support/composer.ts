import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures.ts";
import { clickWhenSettled } from "./geometry.ts";

/** The task form, wherever it shows (the line's card on a phone, Now's right pane on a computer). */
export const taskForm = (page: Page) => page.getByRole("form", { name: "New task" });

/**
The line's +, which opens the form by hand (on a computer the sidebar's New task, which does the
same, comes first).
*/
export const formByHand = (page: Page) =>
  page.getByRole("button", { exact: true, name: "New task" }).last();

/**
Now's task rows: one list; a hairline separates the tasks with a deadline from those without.
*/
export const nowTasks = (page: Page) => page.getByRole("list", { exact: true, name: "Tasks" });

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
  // Unfolded, it may still be scrolling into place: the press waits for its box to hold still.
  await clickWhenSettled(button);
};

/**
Adds a task the way a person does: type, review the assistant's action, then approve it.
Approval opens the new task (full screen on a phone, so the line is gone; in the pane on a
computer, where the line empties), so return to Now for callers that add several tasks.
*/
export const addTask = async (page: Page, text: string): Promise<void> => {
  const line = await settledLine(page);
  await line.pressSequentially(text);
  await expect(line).toHaveValue(text);
  await line.press("Enter");
  await expect(page.getByText(/^The assistant will create /u)).toBeVisible();
  await approve(page);
  await expect(page.getByRole("button", { exact: true, name: "Edit" })).toBeVisible();
  // On a computer the line stays beside the task and empties: no reload needed (each one costs
  // a whole start, which under parallel load pushed a journey past its time limit).
  if (await line.isVisible()) {
    await expect(line).toHaveValue("");
    return;
  }
  await page.goto("/");
};

/**
Now's line once the screen has settled: no first-sync cover or grey rows left, so what is typed
next is not typed into a screen still drawing itself (bug class 20).
*/
export const settledLine = async (page: Page): Promise<Locator> => {
  const line = page.getByRole("textbox", { name: "New task" });
  await expect(line).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: /^(?:Syncing your data|Loading your data…)$/u }),
  ).toHaveCount(0);
  await expect(line).toBeEditable();
  return line;
};
