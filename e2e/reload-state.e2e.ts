import type { Page } from "@playwright/test";

import { addTask, nowTasks, settledLine } from "./support/composer.ts";
import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { repeatsAfterSettle, settle, watchScreen } from "./support/screen-checks.ts";

/**
Feedback round 5, items 6–8: every open screen is a link (a reload opens the same task, day and
filter), what is typed survives a reload, and a link in a task's description opens without
starting to edit it.
*/

const DESKTOP = { height: 900, width: 1440 } as const;
const PHONE = { height: 844, width: 390 } as const;

/** The task's header, wherever it is open (the pane on a computer, its own screen on a phone). */
const taskHeader = (page: Page, title: string) =>
  page.getByRole("heading", { exact: true, name: title });

test("a reload on a computer reopens the task open beside the list; closing it takes it off the address", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await loginViaApi(page);
  await page.goto("/");
  await addTask(page, "Read the paper on caching");
  await expect(taskHeader(page, "Read the paper on caching")).toBeVisible();
  await expect(page).toHaveURL(/[?&]task=/u);
  const address = page.url();
  await page.reload();
  await expect(taskHeader(page, "Read the paper on caching")).toBeVisible();
  expect(page.url()).toBe(address);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { exact: true, name: "Close" }).first().click();
  await expect(taskHeader(page, "Read the paper on caching")).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]task=/u);
});

test("an unknown task in the address leaves the pane closed and the page quiet", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await loginViaApi(page);
  const watch = watchScreen(page);
  await page.goto("/?task=01NOSUCHTASK0000000000000");
  await settledLine(page);
  expect(await settle(page)).toEqual([]);
  await expect(page.getByRole("button", { exact: true, name: "Edit" })).toHaveCount(0);
  // Settled, nothing goes out twice and nothing names the missing task (bug-lessons 1).
  const settledAt = watch.now();
  expect(await repeatsAfterSettle(watch, settledAt)).toEqual([]);
  // The address itself names it (the page's own load); no request to the server does.
  expect(
    watch.sentSince(0).filter((key) => key.includes("/api/") && key.includes("NOSUCHTASK")),
  ).toEqual([]);
  expect(watch.faults()).toEqual([]);
  expect(page.url()).toContain("task=01NOSUCHTASK0000000000000");
  watch.stop();
});

test("a reload on a phone keeps the open task", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await loginViaApi(page);
  await page.goto("/");
  await addTask(page, "Phone task to reload");
  await page.getByText("Phone task to reload").first().click();
  await expect(page).toHaveURL(/\/task\//u);
  await expect(taskHeader(page, "Phone task to reload")).toBeVisible();
  await page.reload();
  await expect(taskHeader(page, "Phone task to reload")).toBeVisible();
});

test("a reload keeps the day in the address; Today takes it off", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await loginViaApi(page);
  await page.goto("/day");
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/[?&]date=\d{4}-\d{2}-\d{2}/u);
  const today = page.getByRole("button", { name: "Today" });
  await expect(today).toBeVisible();
  const address = page.url();
  await page.reload();
  await expect(today).toBeVisible();
  expect(page.url()).toBe(address);
  await today.click();
  await expect(page).not.toHaveURL(/[?&]date=/u);
});

test("a half-typed line survives a reload and goes once it is emptied", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await loginViaApi(page);
  await page.goto("/");
  const line = await settledLine(page);
  await line.pressSequentially("call the dentist about");
  await page.reload();
  await expect(await settledLine(page)).toHaveValue("call the dentist about");
  await (await settledLine(page)).fill("");
  await page.reload();
  await expect(await settledLine(page)).toHaveValue("");
});

test("a link in a task's description opens in a new tab without starting to edit; its words still edit", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.context().route("https://example.com/**", async (route) => {
    await route.fulfill({ body: "<title>Notes</title>", contentType: "text/html" });
  });
  await loginViaApi(page);
  await page.goto("/");
  await addTask(page, "Task with notes");
  await page.getByRole("button", { name: "Add description" }).click();
  const field = page.getByRole("textbox", { name: "Description" });
  await field.fill(
    "Notes at https://example.com/notes/a-very-long-path-that-must-wrap-inside-the-pane-without-overflowing and more",
  );
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  // The address in the text, shown once (R24-08: no link row above the facts repeats it).
  const link = page.getByRole("link", {
    exact: true,
    name: "https://example.com/notes/a-very-long-path-that-must-wrap-inside-the-pane-without-overflowing",
  });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/u);
  // The long address wraps inside the pane: it ends before the pane's right edge.
  const pane = page.getByLabel("Details");
  const linkRight = await link.evaluate((element) => element.getBoundingClientRect().right);
  const paneRight = await pane.evaluate((element) => element.getBoundingClientRect().right);
  expect(linkRight).toBeLessThanOrEqual(paneRight + 0.5);
  await expectNoA11yViolations(page);
  const popup = page.waitForEvent("popup");
  await link.click();
  await (await popup).close();
  await expect(page.getByRole("textbox", { name: "Description" })).toHaveCount(0);
  await page.getByText(/and more$/u).click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole("textbox", { name: "Description" })).toBeVisible();
});

test.describe("Back and forward follow the screen (feedback 5 item 6, QA round 24 R24-02)", () => {
  test("a task opened beside the list: Back closes it, Forward opens it again, a second task is a step of its own", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaApi(page);
    await page.goto("/");
    await addTask(page, "First of two");
    await addTask(page, "Second of two");
    await page.getByRole("button", { exact: true, name: "Close" }).first().click();
    await expect(taskHeader(page, "Second of two")).toHaveCount(0);
    const list = page.url();

    await nowTasks(page)
      .getByRole("link", { name: /^First of two/u })
      .click();
    await expect(taskHeader(page, "First of two")).toBeVisible();
    await nowTasks(page)
      .getByRole("link", { name: /^Second of two/u })
      .click();
    await expect(taskHeader(page, "Second of two")).toBeVisible();

    await page.goBack();
    await expect(taskHeader(page, "First of two")).toBeVisible();
    await page.goBack();
    await expect(taskHeader(page, "First of two")).toHaveCount(0);
    await expect(page).toHaveURL(list);
    await expect(await settledLine(page)).toBeVisible();
    await page.goForward();
    await expect(taskHeader(page, "First of two")).toBeVisible();
    await expect(page).toHaveURL(/[?&]task=/u);
  });

  test("Day: two days back, then Back twice returns to today", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaApi(page);
    await page.goto("/day");
    const today = page.getByRole("button", { name: "Today" });
    const previous = page.getByRole("button", { name: "Previous day" });
    await expect(previous).toBeVisible();
    await expect(today).toHaveCount(0);
    await previous.click();
    await expect(page).toHaveURL(/[?&]date=\d{4}-\d{2}-\d{2}/u);
    const yesterday = page.url();
    await previous.click();
    await expect(page).not.toHaveURL(yesterday);
    await page.goBack();
    await expect(page).toHaveURL(yesterday);
    await expect(today).toBeVisible();
    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]date=/u);
    await expect(today).toHaveCount(0);
    await expect(page).toHaveURL(/\/day$/u);
  });

  test("Day: a block open on yesterday is not left open over today after Back (review I1)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaApi(page);
    await page.goto("/day");
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page).toHaveURL(/[?&]date=/u);
    await page.getByRole("button", { name: "Log past activity" }).click();
    const details = page.getByRole("region", { name: "Details" });
    await details.getByLabel("What", { exact: true }).fill("Yesterday's block");
    await details.getByRole("button", { exact: true, name: "Save" }).click();
    await page.getByRole("button", { name: /Yesterday's block/u }).click();
    await expect(details.getByLabel("What", { exact: true })).toHaveValue("Yesterday's block");
    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]date=/u);
    await expect(page.getByRole("button", { name: "Today" })).toHaveCount(0);
    await expect(details).toHaveCount(0);
  });

  test("Week (in More's stack): another week is a step; Back and Forward move between them", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaApi(page);
    await page.goto("/week");
    const previous = page.getByRole("button", { name: "Previous week" });
    await previous.click();
    await expect(page).toHaveURL(/[?&]week=\d{4}-\d{2}-\d{2}/u);
    const earlier = page.url();
    await page.goBack();
    await expect(page).toHaveURL(/\/week$/u);
    await expect(previous).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(earlier);
  });
});
