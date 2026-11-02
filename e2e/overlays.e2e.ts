import type { Page } from "@playwright/test";

import { addTask, formByHand, nowTasks, taskForm } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import { CLIPPING_ANCESTOR, controlsUnder, expectStaysInside } from "./support/geometry.ts";
import { loginViaApi } from "./support/login.ts";

/** The main screens and the tabs, sidebar links or rows of More that reach each (no reload). */
const PHONE_SCREENS: readonly (readonly [string, readonly string[]])[] = [
  ["Now", ["Now"]],
  ["Day", ["Day"]],
  ["Inbox", ["Inbox"]],
  ["More", ["More"]],
  ["Week", ["More", "Week"]],
  ["Settings", ["More", "Settings"]],
];

const DESKTOP_SCREENS: readonly (readonly [string, readonly string[]])[] = [
  ["Now", ["Now"]],
  ["Day", ["Day"]],
  ["Inbox", ["Inbox"]],
  ["Week", ["Week"]],
  ["Settings", ["Settings"]],
];

const SIZES = [
  { height: 844, name: "phone", screens: PHONE_SCREENS, width: 390 },
  { height: 900, name: "desktop", screens: DESKTOP_SCREENS, width: 1280 },
] as const;

const tap = async (page: Page, name: string): Promise<void> => {
  await page
    .getByRole("tab", { exact: true, name })
    .or(page.getByRole("link", { exact: true, name }))
    .first()
    .click();
};

/** Deletes a fresh task on Now: "Deleted: …" stays up as a toast, with Undo, for some seconds. */
const raiseToast = async (page: Page, title: string): Promise<void> => {
  await page.goto("/");
  await addTask(page, title);
  await nowTasks(page).getByText(title).click();
  await page.getByRole("button", { name: "Delete the task" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
};

const SHEET = '[data-pace-surface="sheet"]';

for (const size of SIZES) {
  test.describe(`overlays and motion, ${size.name}`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("a toast covers no control on any main screen (bug class 6)", async ({ page }) => {
      test.setTimeout(180_000);
      await loginViaApi(page);
      const covered: string[] = [];
      for (const [index, [screen, steps]] of size.screens.entries()) {
        await raiseToast(page, `Toast ${String(index)}`);
        for (const step of steps) {
          await tap(page, step);
        }
        await expect(page.getByRole("alert")).toBeVisible();
        const under = await controlsUnder(page, '[role="alert"]');
        covered.push(...under.map((control) => `${screen}: ${control}`));
      }
      expect(covered).toEqual([]);
    });

    test("a sheet opens with its title and buttons inside it (bug class 5)", async ({ page }) => {
      await loginViaApi(page);
      await page.goto("/");
      await addTask(page, `Sheet ${size.name}`);
      await nowTasks(page).getByText(`Sheet ${size.name}`).click();
      const edit = page.getByRole("button", { name: "Edit details" });
      // Its title and its foot (the buttons), at a phone's slide and a computer's dialog alike.
      for (const child of ['[role="heading"]', "> :last-child"]) {
        await expectStaysInside(page, {
          child: `${SHEET} ${child}`,
          container: SHEET,
          during: async () => {
            await edit.click();
          },
        });
        await page.keyboard.press("Escape");
        await expect(page.locator(SHEET)).toHaveCount(0);
      }
    });
  });
}

test.describe("motion and overlays at one width", () => {
  test("the composer's form unfolds inside its card on a phone (bug class 5)", async ({ page }) => {
    await loginViaApi(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    await page.getByRole("textbox", { name: "New task" }).pressSequentially("Pay the rent");
    // The card grows to reveal the form: the form's foot is hidden on purpose meanwhile.
    await expectStaysInside(page, {
      child: '[role="form"]',
      container: CLIPPING_ANCESTOR,
      during: async () => {
        await formByHand(page).click();
      },
      sides: ["top", "left", "right"],
    });
    await expect(taskForm(page)).toBeVisible();
  });

  test("the assistant's preview unfolds without the card scrolling under the finger (fix round 2 of QA 18)", async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");
    const line = page.getByRole("textbox", { name: "New task" });
    await line.pressSequentially("Pay the rent");
    // A slow phone, where the unfold lags the content it reveals (seen in the full run's load).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    // Every frame of the unfold: how far any box around the line has been scrolled. The card
    // clips while it grows, and a box that clips must never scroll: Approve would move away
    // from the finger and back (the press lands, the release misses).
    const sampled = page.evaluate(
      async (span) =>
        await new Promise<number>((resolve) => {
          const field = globalThis.document.querySelector('[aria-label="New task"]');
          const started = performance.now();
          let most = 0;
          const frame = (): void => {
            for (let box = field?.parentElement ?? null; box !== null; box = box.parentElement) {
              most = Math.max(most, box.scrollTop);
            }
            if (performance.now() - started < span) {
              globalThis.requestAnimationFrame(frame);
            } else {
              resolve(most);
            }
          };
          globalThis.requestAnimationFrame(frame);
        }),
      1500,
    );
    await line.press("Enter");
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(await sampled).toBe(0);
  });

  test("the greyed Calendar button's tooltip covers no other control (bug class 6)", async ({
    page,
  }) => {
    // A pointer to hover with: a computer.
    await loginViaApi(page);
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto("/");
    await page.getByRole("button", { exact: true, name: "Calendar" }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    // Over the typed field above the bar, only while the pointer rests on Calendar: a hover
    // explanation sits on its control by design (class 6's rule), never over the bar's buttons.
    const covered = await controlsUnder(page, '[role="tooltip"]', [
      "Calendar",
      "What are you doing?",
    ]);
    expect(covered).toEqual([]);
  });
});
