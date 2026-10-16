import type { Page } from "@playwright/test";

import { addTask, formByHand, taskForm } from "./support/composer.ts";
import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

const LINES = [
  "синк по дашборду завтра 15:00 1ч https://example.com/dashboards",
  "срочно позвонить в банк",
  "read the RFC on Friday 30m #Reading",
  "renew the passport someday",
];

/** Screenshots for the design pass land here when SCREENSHOTS_DIR is set. */
const shoot = async (page: Page, name: string): Promise<void> => {
  const dir = process.env["SCREENSHOTS_DIR"];
  if (dir !== undefined) {
    await page.screenshot({ fullPage: true, path: `${dir}/${name}.png` });
  }
};

for (const [width, height, size] of [
  [390, 844, "phone"],
  [1440, 900, "desktop"],
] as const) {
  for (const theme of ["dark", "light"] as const) {
    test(`composer adds lines and fills the form (${size}, ${theme})`, async ({ page }) => {
      await loginViaApi(page);
      await page.addInitScript((value) => {
        localStorage.setItem("pace.theme", value);
      }, theme);
      await page.setViewportSize({ height, width });
      await page.goto("/");
      const line = page.getByRole("textbox", { name: "New task" });
      await line.pressSequentially(LINES[0] ?? "");
      await formByHand(page).click();
      const form = page.getByRole("form", { name: "New task" });
      // On a computer the form opens in the right pane and the line stays in the list.
      await expect(line).toBeVisible({ visible: size === "desktop" });
      await expect(form.getByRole("radio", { exact: true, name: "Work" })).toBeChecked();
      await expect(form.getByRole("textbox", { name: "Link" })).toHaveValue(
        "https://example.com/dashboards",
      );
      await shoot(page, `composer-${size}-${theme}`);
      await expectNoA11yViolations(page);
      await form.getByRole("button", { name: /^Create/u }).click();
      // Saving clears the line: type the next one only after that, or the clearing eats it.
      await expect(line).toHaveValue("");
      for (const text of LINES.slice(1)) {
        await addTask(page, text);
      }
      const board = page.getByRole("list", { name: "Tasks" });
      await expect(board.getByText("синк по дашборду")).toBeVisible();
      await expect(board.getByText("срочно позвонить в банк")).toBeVisible();
      await shoot(page, `now-${size}-${theme}`);
      await expectNoA11yViolations(page);

      await board.getByRole("link", { name: /синк по дашборду/u }).click();
      await expect(page.getByRole("heading", { name: /синк по дашборду/u })).toBeVisible();
      await shoot(page, `task-${size}-${theme}`);
      await expectNoA11yViolations(page);
    });
  }
}

test("a pasted message shows actions and is written only on Approve", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const message = "№№ 290, 292, 293 — решить методом выделения линейных множителей";
  // A fill is a paste: the assistant reads it at once and shows a reviewable action.
  await page.getByRole("textbox", { name: "New task" }).fill(message);
  await expect(page.getByText(`The assistant will create “${message}”`)).toBeVisible();
  await expect(page.getByRole("list", { name: "Tasks" }).getByText(message)).toHaveCount(0);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Tasks" }).getByText(message)).toBeVisible();
});

test("a title typed into the empty form is added on Enter", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const line = page.getByRole("textbox", { name: "New task" });
  await expect(line).toBeVisible();
  // N opens the empty form, the cursor in its title.
  await page.keyboard.press("n");
  const form = taskForm(page);
  await expect(form).toHaveAccessibleName("New task");
  const title = form.getByRole("textbox", { exact: true, name: "Title" });
  await expect(title).toBeFocused();
  await page.keyboard.type("Pay the rent");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("list", { name: "Tasks" }).getByText("Pay the rent")).toBeVisible();
  await expect(page.getByText("Type something first.")).toHaveCount(0);
});

/**
Samples, frame by frame, where the form sits inside the card's clipping box while the card
unfolds: the browser must not scroll the box to reveal the focused title, which would slide
the header (and the top of Create) out of the card and back.
*/
const sampleUnfolding = async (page: Page): Promise<readonly { top: number; scroll: number }[]> =>
  await page.evaluate(
    async () =>
      await new Promise<readonly { top: number; scroll: number }[]>((resolve) => {
        const samples: { top: number; scroll: number }[] = [];
        let end = Infinity;
        const frame = (now: number): void => {
          const form = globalThis.document.querySelector('[role="form"]');
          // The nearest ancestor that clips: the box whose height grows.
          let clip = form?.parentElement ?? null;
          while (clip !== null && globalThis.getComputedStyle(clip).overflow !== "hidden") {
            clip = clip.parentElement;
          }
          if (form !== null && clip !== null) {
            end = Math.min(end, now + 600);
            samples.push({
              scroll: clip.scrollTop,
              top: form.getBoundingClientRect().top - clip.getBoundingClientRect().top,
            });
          }
          if (now < end) {
            globalThis.requestAnimationFrame(frame);
          } else {
            resolve(samples);
          }
        };
        globalThis.requestAnimationFrame(frame);
      }),
  );

// Only the phone unfolds the card: a computer opens the form in the right pane.
for (const [width, height, size] of [[390, 844, "phone"]] as const) {
  test(`the form unfolds without sliding out of the card (${size})`, async ({ page }) => {
    await loginViaApi(page);
    await page.setViewportSize({ height, width });
    await page.goto("/");
    const line = page.getByRole("textbox", { name: "New task" });
    await line.pressSequentially("Pay the rent");
    const sampling = sampleUnfolding(page);
    await formByHand(page).click();
    const samples = await sampling;
    // The card grew over several frames, and the form stayed inside it throughout.
    expect(samples.length).toBeGreaterThan(5);
    expect(Math.min(...samples.map((sample) => sample.top))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples.map((sample) => sample.scroll))).toBe(0);
  });
}

test("on a computer the form opens in the right pane and closing it brings the task back", async ({
  page,
}) => {
  await loginViaApi(page);
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await addTask(page, "Water the plants");
  await page.getByRole("list", { name: "Tasks" }).getByText("Water the plants").click();
  const details = page.getByRole("button", { name: "Edit details" });
  await expect(details).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "New task" }).click();
  const form = page.getByRole("form", { name: "New task" });
  await expect(form.getByRole("textbox", { exact: true, name: "Title" })).toBeFocused();
  await expect(details).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "New task" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
  await expect(details).toBeVisible();
});

/**
Samples, frame by frame for a while, where the form's title and the line sit as the right pane
swaps the task for the form: the title must land in the pane and stay there, the line must not
move (a swap that reflows the list or scrolls the page shows here).
*/
const samplePaneSwap = async (
  page: Page,
): Promise<readonly { title: DOMRect | null; line: DOMRect | null; scrollY: number }[]> =>
  await page.evaluate(
    async () =>
      await new Promise<
        readonly { title: DOMRect | null; line: DOMRect | null; scrollY: number }[]
      >((resolve) => {
        const samples: { title: DOMRect | null; line: DOMRect | null; scrollY: number }[] = [];
        const start = performance.now();
        const frame = (now: number): void => {
          const title = globalThis.document.querySelector('[role="form"] [role="heading"]');
          const line = globalThis.document.querySelector('textarea[aria-label="New task"]');
          samples.push({
            line: line?.getBoundingClientRect() ?? null,
            scrollY: globalThis.scrollY,
            title: title?.getBoundingClientRect() ?? null,
          });
          if (now - start < 700) {
            globalThis.requestAnimationFrame(frame);
          } else {
            resolve(samples);
          }
        };
        globalThis.requestAnimationFrame(frame);
      }),
  );

test("on a computer the form swaps into the pane in place: its title inside the pane, the list still", async ({
  page,
}) => {
  await loginViaApi(page);
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await addTask(page, "Water the plants");
  await page.getByRole("list", { name: "Tasks" }).getByText("Water the plants").click();
  await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible();
  const list = await page.getByRole("list", { name: "Tasks" }).boundingBox();
  const sampling = samplePaneSwap(page);
  await page.getByRole("navigation").getByRole("button", { name: "New task" }).click();
  const samples = await sampling;
  const titles = samples.flatMap((sample) => (sample.title === null ? [] : [sample.title]));
  const lines = samples.flatMap((sample) => (sample.line === null ? [] : [sample.line]));
  expect(titles.length).toBeGreaterThan(5);
  // The pane starts where the list's column ends.
  const paneLeft = (list?.x ?? 0) + (list?.width ?? 0);
  expect(Math.min(...titles.map((title) => title.left))).toBeGreaterThanOrEqual(paneLeft);
  expect(Math.max(...titles.map((title) => title.right))).toBeLessThanOrEqual(1280);
  expect(Math.min(...titles.map((title) => title.top))).toBeGreaterThanOrEqual(0);
  expect(new Set(titles.map((title) => Math.round(title.top))).size).toBe(1);
  expect(new Set(lines.map((line) => Math.round(line.top))).size).toBe(1);
  expect(Math.max(...samples.map((sample) => sample.scrollY))).toBe(0);
});
