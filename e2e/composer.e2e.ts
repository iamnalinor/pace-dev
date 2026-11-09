import type { Page } from "@playwright/test";

import {
  addTask,
  approve,
  formByHand,
  nowTasks,
  settledLine,
  taskForm,
} from "./support/composer.ts";
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
      // A whole journey (four tasks, three screenshots, three accessibility scans): about 20 s on a
      // computer's window under four parallel workers, past half of the default limit; it timed out
      // there with nothing failing (round 6 flake, no app wait behind it).
      test.setTimeout(60_000);
      await loginViaApi(page);
      await page.addInitScript((value) => {
        localStorage.setItem("pace.theme", value);
      }, theme);
      await page.setViewportSize({ height, width });
      await page.goto("/");
      const line = await settledLine(page);
      await line.pressSequentially(LINES[0] ?? "");
      await expect(line).toHaveValue(LINES[0] ?? "");
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
      const board = nowTasks(page);
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
  await expect(nowTasks(page).getByText(message)).toHaveCount(0);
  await expectNoA11yViolations(page);
  await approve(page);
  await page.goto("/");
  await expect(nowTasks(page).getByText(message)).toBeVisible();
});

for (const [width, height, size] of [
  [390, 844, "phone"],
  [1440, 900, "desktop"],
] as const) {
  test(`a share to the installed web app lands in the focused line on Now at / (${size}, QA 17 M3, QA 18 L2)`, async ({
    page,
  }) => {
    // The manifest's share_target opens /add with the shared title, text and link in the query.
    await page.setViewportSize({ height, width });
    await loginViaApi(page);
    await page.goto(
      "/add?title=Article&text=https%3A%2F%2Fexample.com%2Fa%20a%20look%20at%20this&url=https%3A%2F%2Fexample.com%2Fa",
    );
    const line = page.getByRole("textbox", { name: "New task" });
    await expect(line).toHaveValue("Article https://example.com/a a look at this");
    // Taken once: the address drops the share, so a reload (or a return to the window) does not
    // fill the line from it again and a second Enter cannot add it twice (review m11). It is Now
    // at "/" (QA 18 L2): a reload opens Now, not an empty New task form.
    await expect.poll(() => page.url()).toBe(new URL("/", page.url()).href);
    await expect(line).toHaveValue("Article https://example.com/a a look at this");
    // The Enter a person presses next goes into the line (QA 18 L2: focus was on the page).
    await expect(line).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/^The assistant will create /u)).toBeVisible();
    // A reload finds no share left to fill in, and no form open.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("form", { name: "New task" })).toHaveCount(0);
    const values = await page
      .locator("input, textarea")
      .evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));
    expect(values.filter((value) => value.includes("look at this"))).toEqual([]);
  });
}

test("a blank share lands on Now at / with the line focused, like the others (QA 19 L4)", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await loginViaApi(page);
  await page.goto("/add?text=%20%20%20");
  const line = page.getByRole("textbox", { name: "New task" });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expect(line).toBeFocused();
  await expect(line).toHaveValue("");
  await expect(page.getByRole("form", { name: "New task" })).toHaveCount(0);
});

/** A bare /add (the manifest's New task shortcut) puts the cursor in the form's field (QA21 M2, R23-12). */
for (const [width, height, size] of [
  [390, 844, "phone"],
  [1440, 900, "computer"],
] as const) {
  test(`a direct load of /add focuses the New task form's title on a ${size}`, async ({ page }) => {
    await page.setViewportSize({ height, width });
    await loginViaApi(page);
    await page.goto("/add");
    await expect(taskForm(page)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Title" })).toBeFocused();
  });
}

/** Goes to `path` inside the page, as the router does (no new page). */
const goInPage = async (page: Page, path: string): Promise<void> => {
  await page.evaluate((to) => {
    globalThis.history.pushState(null, "", to);
    globalThis.dispatchEvent(new Event("popstate"));
  }, path);
};

test.describe("a share over a half-typed line (QA 20 M3, round 6 M3)", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto("/");
    const line = page.getByRole("textbox", { name: "New task" });
    await line.fill("half typed");
    await expect(line).toHaveValue("half typed");
  });

  test("arriving in the page goes on a new line after it", async ({ page }) => {
    await goInPage(page, "/add?text=Shared%20over%20typing");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("textbox", { name: "New task" })).toHaveValue(
      "half typed\nShared over typing",
    );
  });

  test("arriving as a new page of the tab goes on a new line after it", async ({ page }) => {
    await page.goto("/add?text=Shared%20over%20typing");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("textbox", { name: "New task" })).toHaveValue(
      "half typed\nShared over typing",
    );
  });

  test("a blank one leaves it as it was", async ({ page }) => {
    await goInPage(page, "/add?text=%20");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("textbox", { name: "New task" })).toHaveValue("half typed");
  });
});

test("a title typed into the empty form is added on Enter", async ({ page }) => {
  await loginViaApi(page);
  await page.goto("/");
  const line = page.getByRole("textbox", { name: "New task" });
  await expect(line).toBeVisible();
  // Alt+N opens the empty form, the cursor in its title (a modifier always: F-A11Y-03).
  await page.keyboard.press("Alt+n");
  const form = taskForm(page);
  await expect(form).toHaveAccessibleName("New task");
  const title = form.getByRole("textbox", { exact: true, name: "Title" });
  await expect(title).toBeFocused();
  await page.keyboard.type("Pay the rent");
  await page.keyboard.press("Enter");
  await expect(nowTasks(page).getByText("Pay the rent")).toBeVisible();
  await expect(page.getByText("Type something first.")).toHaveCount(0);
});

test("an empty form asked to create says the title is missing, by the keys and by Create (QA round 24 R24-06)", async ({
  page,
}) => {
  await loginViaApi(page);
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "New task" })).toBeVisible();
  await page.keyboard.press("Alt+n");
  const form = taskForm(page);
  const title = form.getByRole("textbox", { exact: true, name: "Title" });
  await expect(title).toBeFocused();
  await expect(form.getByText("Give the task a title.")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(form.getByRole("alert")).toHaveText("Give the task a title.");
  await expect(title).toBeFocused();
  await form.getByRole("button", { exact: true, name: /^Create/u }).click();
  await expect(title).toBeFocused();
  await expect(form.getByRole("alert")).toHaveText("Give the task a title.");
  await title.fill("Pay the rent");
  await expect(form.getByText("Give the task a title.")).toHaveCount(0);
});

test("the form's close drops its draft: New task opens an empty form again (QA 14 L6)", async ({
  page,
}) => {
  await loginViaApi(page);
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "New task" })).toBeVisible();
  await formByHand(page).click();
  const form = taskForm(page);
  const title = form.getByRole("textbox", { exact: true, name: "Title" });
  await title.fill("Leftover");
  await form.getByRole("radio", { name: "Every day" }).click();
  await expect(form.getByRole("radio", { name: "Every day" })).toBeChecked();
  await form.getByRole("button", { name: "Close" }).click();
  await expect(form).toHaveCount(0);
  await formByHand(page).click();
  await expect(title).toHaveValue("");
  await expect(form.getByRole("radio", { name: "Does not repeat" })).toBeChecked();
  await expect(form.getByRole("button", { name: /^Create/u })).toBeDisabled();
});

/**
Samples, frame by frame, where the form sits inside the card while the card unfolds, and how far
the screen's scroller has moved: the browser must not scroll to reveal the focused title, which
would slide the header (and the top of Create) away and back. The card itself no longer scrolls
or clips, so the scroller measured is the nearest ancestor that scrolls.
*/
const sampleUnfolding = async (page: Page): Promise<readonly { top: number; scroll: number }[]> =>
  await page.evaluate(
    async () =>
      await new Promise<readonly { top: number; scroll: number }[]>((resolve) => {
        const samples: { top: number; scroll: number }[] = [];
        let end = Infinity;
        const frame = (now: number): void => {
          const form = globalThis.document.querySelector('[role="form"]');
          // The card that changes shape (it no longer clips: it takes the form's height at once).
          const clip = globalThis.document.querySelector('[data-testid="composer-card"]');
          let scroller = clip?.parentElement ?? null;
          while (
            scroller !== null &&
            !/auto|scroll/u.test(globalThis.getComputedStyle(scroller).overflowY)
          ) {
            scroller = scroller.parentElement;
          }
          if (form !== null && clip !== null) {
            end = Math.min(end, now + 600);
            samples.push({
              scroll: scroller?.scrollTop ?? globalThis.scrollY,
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
    // Sampled over several frames, and the form stayed inside the card throughout.
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
  await nowTasks(page).getByText("Water the plants").click();
  const details = page.getByRole("button", { exact: true, name: "Edit" });
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
  await nowTasks(page).getByText("Water the plants").click();
  await expect(page.getByRole("button", { exact: true, name: "Edit" })).toBeVisible();
  const list = await nowTasks(page).boundingBox();
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
