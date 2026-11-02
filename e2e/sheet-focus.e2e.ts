import type { Page } from "@playwright/test";

import { addTask, nowTasks } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

// A phone's sheet has no cross (the dim and the system's back close it); a dialog has one.
const SIZES = [
  { closeStops: 0, height: 844, name: "phone", width: 390 },
  { closeStops: 1, height: 900, name: "desktop", width: 1280 },
] as const;

const SURFACE = '[data-pace-surface="sheet"]';

/** Where the keyboard is: inside the open sheet or not, and the focused element's name. */
const focus = async (page: Page) =>
  await page.locator(SURFACE).evaluate((surface) => {
    const active = surface.ownerDocument.activeElement;
    return {
      isInSheet: active !== null && surface.contains(active),
      name: active?.getAttribute("aria-label") ?? active?.getAttribute("placeholder") ?? "",
    };
  });

/** The Close stops Tab reaches in the open dialog (the dim is not one; the cross may be). */
const closeTabStops = async (page: Page): Promise<number> =>
  await page
    .locator('[role="dialog"] [aria-label="Close"]')
    .evaluateAll(
      (elements) => elements.filter((element) => (element as HTMLElement).tabIndex >= 0).length,
    );

/** Moves focus from where it is in the sheet onto the dim, as a screen reader does; whether it stays. */
const isDimKeptFromSheet = async (page: Page): Promise<boolean> =>
  await page.locator('[aria-modal="true"] [aria-label="Close"][tabindex="-1"]').evaluate((dim) => {
    (dim as HTMLElement).focus();
    return dim.ownerDocument.activeElement === dim;
  });

const timeBar = (page: Page) => page.getByRole("region", { name: "Time" });

for (const size of SIZES) {
  test.describe(`a sheet takes the keyboard to its first field, ${size.name} (QA 18 M1)`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("Edit task, the time bar's pickers and Log past activity", async ({ page }) => {
      test.setTimeout(90_000);
      await loginViaApi(page);
      await page.goto("/");
      const title = `Focus ${size.name}`;
      await addTask(page, title);

      // The pickers first: on a phone, Edit task is on the task's own screen, away from the bar.
      const opens: readonly (readonly [string, () => Promise<void>, null | string])[] = [
        [
          "Calendar",
          async () => {
            await timeBar(page).getByRole("button", { exact: true, name: "Calendar" }).click();
          },
          null,
        ],
        [
          "Task",
          async () => {
            await timeBar(page).getByRole("button", { exact: true, name: "Task" }).click();
          },
          null,
        ],
        [
          "Chores",
          async () => {
            await timeBar(page).getByRole("button", { exact: true, name: "Chores" }).click();
          },
          null,
        ],
        [
          "Rest",
          async () => {
            await timeBar(page).getByRole("button", { exact: true, name: "Rest" }).click();
          },
          null,
        ],
        [
          "Edit task",
          async () => {
            await nowTasks(page).getByText(title).click();
            await page.getByRole("button", { name: "Edit details" }).click();
          },
          "Title",
        ],
        [
          "Log past activity",
          async () => {
            await page.goto("/day");
            await page.getByRole("button", { name: "Log past activity" }).click();
          },
          "What",
        ],
      ];
      const seen: { sheet: string; name: string; closeStops: number }[] = [];
      const wrapped: { sheet: string; isInSheet: boolean }[] = [];
      const kept: { sheet: string; isOnDim: boolean }[] = [];
      for (const [sheet, open] of opens) {
        await open();
        await expect(page.locator(SURFACE)).toBeVisible();
        // The modal moves focus after it mounts: given a moment.
        await expect.poll(async () => (await focus(page)).isInSheet, { message: sheet }).toBe(true);
        seen.push({ closeStops: await closeTabStops(page), name: (await focus(page)).name, sheet });
        // Shift+Tab wraps inside the sheet, never onto the full-screen dim (QA 19 L1).
        await page.keyboard.press("Shift+Tab");
        wrapped.push({ isInSheet: (await focus(page)).isInSheet, sheet });
        // A screen reader moving on from the sheet onto the dim keeps it there, never thrown to
        // the page (round 6 M4).
        kept.push({ isOnDim: await isDimKeptFromSheet(page), sheet });
        await page.keyboard.press("Escape");
        await expect(page.locator(SURFACE)).toHaveCount(0);
      }
      // On the sheet's first field where it has one, never on a Close; no second Close stop.
      expect(seen).toEqual(
        opens.map(([sheet, , field]) => ({
          closeStops: size.closeStops,
          name: field ?? expect.not.stringMatching(/^Close$/u),
          sheet,
        })),
      );
      expect(wrapped).toEqual(opens.map(([sheet]) => ({ isInSheet: true, sheet })));
      expect(kept).toEqual(opens.map(([sheet]) => ({ isOnDim: true, sheet })));
    });
  });
}
