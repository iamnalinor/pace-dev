import type { Locator, Page } from "@playwright/test";

import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { API_URL, loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

type Size = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** How a person gets to Week at this size. */
  readonly openWeek: (page: Page) => Promise<void>;
  /** Where a picked event's details show: the pane beside the grid, or the sheet. */
  readonly details: (page: Page) => Locator;
  /** Puts the details away so the header is free again (a phone's sheet covers it). */
  readonly leaveDetails: (page: Page) => Promise<void>;
};

const SIZES: readonly Size[] = [
  {
    details: (page) => page.locator("body"),
    height: 844,
    leaveDetails: async (page) => {
      await page
        .getByRole("button", { name: "Close" })
        .first()
        .click({ position: { x: 5, y: 5 } });
    },
    name: "phone",
    // A phone keeps Week behind More.
    openWeek: async (page) => {
      await page.goto("/more");
      await page.getByRole("link", { name: "Week" }).click();
    },
    width: 390,
  },
  {
    details: (page) => page.getByRole("region", { name: "Details" }),
    height: 800,
    leaveDetails: async () => {
      // The pane stays beside the grid.
    },
    name: "desktop",
    openWeek: async (page) => {
      await page.goto("/week");
    },
    width: 1280,
  },
];

/** Screenshots for review land here when set (the run's output folder otherwise). */
const SHOT_DIR = process.env["E2E_SHOT_DIR"];

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

const shoot = async (page: Page, name: string, outputPath: (name: string) => string) => {
  await page.screenshot({
    path: SHOT_DIR === undefined ? outputPath(`${name}.png`) : `${SHOT_DIR}/${name}.png`,
  });
};

/** Today's 00:00 in UTC, the seeded account's zone. */
const todayMidnight = (): number => {
  const today = new Date();
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
};

/** Monday 00:00 UTC of the week before this one: a week that is whole whatever the hour now. */
const lastMonday = (): number => todayMidnight() - (((new Date().getUTCDay() + 6) % 7) + 7) * DAY;

const post = async (token: string, path: string, body: unknown): Promise<void> => {
  const response = await fetch(`${API_URL}${path}`, {
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    method: "POST",
  });
  expect(response.ok).toBe(true);
};

/**
An account in UTC with two blocks on last week's Wednesday (09:00–10:00 and 12:00–13:00, a gap
between them) and a seminar from the phone's calendar that afternoon, with all its details.
*/
const seedWeek = async (token: string): Promise<{ readonly wednesday: number }> => {
  const wednesday = lastMonday() + 2 * DAY;
  const block = (from: number, to: number, label: string) => ({
    deviceId: "e2e-seed",
    id: ulid(wednesday + from * HOUR),
    occurredAt: new Date(wednesday + to * HOUR).toISOString(),
    payload: {
      activityId: ulid(wednesday + from * HOUR + 1),
      category: "study",
      endAt: new Date(wednesday + to * HOUR).toISOString(),
      label,
      startAt: new Date(wednesday + from * HOUR).toISOString(),
    },
    precision: "exact",
    recordedAt: new Date().toISOString(),
    source: "web",
    type: "activity.logged",
  });
  const pushed = await pushAsClient(token, [
    {
      deviceId: "e2e-seed",
      id: ulid(wednesday - DAY),
      occurredAt: new Date(wednesday - DAY).toISOString(),
      payload: { language: "en", timezone: "UTC" },
      precision: "exact",
      recordedAt: new Date().toISOString(),
      source: "web",
      type: "settings.updated",
    },
    block(9, 10, "Lecture notes"),
    block(12, 13, "Problem set"),
  ]);
  expect(pushed.ok).toBe(true);
  expect(((await pushed.json()) as { rejected: readonly unknown[] }).rejected).toEqual([]);
  await post(token, "/api/calendar/sync", {
    deviceId: "e2e-phone",
    events: [
      {
        attendeeCount: 12,
        calendarName: "University",
        endAt: new Date(wednesday + 16 * HOUR).toISOString(),
        id: "ev-seminar",
        location: "Room 214",
        notes: "Bring the problem set.\nSlides: https://example.org/slides",
        organizer: "Prof. Ivanova",
        series: null,
        startAt: new Date(wednesday + 14.5 * HOUR).toISOString(),
        title: "Seminar",
        url: "https://meet.google.com/abc-defg-hij",
      },
    ],
    from: new Date(lastMonday()).toISOString(),
    to: new Date(lastMonday() + 14 * DAY).toISOString(),
  });
  return { wednesday };
};

/** Whether the grid scrolls up and down (it should not, with room for an hour of 18px). */
const isGridScrolling = async (page: Page): Promise<boolean> =>
  await page
    .getByTestId("week-scroller")
    .evaluate((element) => element.scrollHeight > element.clientHeight + 1);

for (const size of SIZES) {
  test.describe(`Week and Day, ${size.name} (${String(size.width)}px)`, () => {
    test.use({ viewport: { height: size.height, width: size.width } });

    test("Week fits the screen, shows the night hours on request, and an event's details", async ({
      page,
    }, info) => {
      const { token } = await loginViaApi(page);
      await seedWeek(token);
      await size.openWeek(page);
      await expect(page.getByRole("heading", { level: 1, name: "Week" })).toBeVisible();
      const back = page.getByRole("button", { name: "Back to today" });
      await expect(back).toHaveCount(0);
      expect(await isGridScrolling(page)).toBe(false);

      await page.getByRole("button", { name: "Previous week" }).click();
      await expect(back).toBeVisible();
      const seminar = page.getByRole("button", { name: "From the calendar: Seminar" });
      await seminar.click();
      const details = size.details(page);
      await expect(details.getByText("Room 214")).toBeVisible();
      await expect(details.getByRole("button", { name: "Join the call" })).toBeVisible();
      await expect(details.getByText("12 people invited")).toBeVisible();
      await expect(details.getByRole("link", { name: "https://example.org/slides" })).toBeVisible();
      await expect(seminar).toHaveAttribute("aria-current", "true");
      await shoot(page, `week-event-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);
      await size.leaveDetails(page);

      const night = page.getByRole("switch", { name: "Night hours" });
      await expect(night).not.toBeChecked();
      await expect(page.getByText("00", { exact: true })).toHaveCount(0);
      await night.click();
      await expect(night).toBeChecked();
      await expect(page.getByText("00", { exact: true })).toBeVisible();
      expect(await isGridScrolling(page)).toBe(false);
      await shoot(page, `week-night-${size.name}`, (name) => info.outputPath(name));

      await back.click();
      await expect(back).toHaveCount(0);
    });

    test("Day lists blocks and gaps as one timeline, and comes back to today", async ({
      page,
    }, info) => {
      const { token } = await loginViaApi(page);
      const { wednesday } = await seedWeek(token);
      // The first sync replaces the device zone with the account's UTC zone. Navigating while
      // that happens can reinterpret the previous day's instant as a different calendar date.
      await page.goto("/settings");
      await expect(page.getByText("Account: UTC")).toBeVisible();
      await page.goto("/day");
      const back = page.getByRole("button", { name: "Back to today" });
      await expect(back).toHaveCount(0);
      // Back to last week's Wednesday, one day at a time.
      const days = Math.round((todayMidnight() - wednesday) / DAY);
      for (let step = 0; step < days; step += 1) {
        await page.getByRole("button", { name: "Previous day" }).click();
      }
      await expect(page.getByText("Lecture notes")).toBeVisible();
      const gap = page.getByRole("button", { name: /10:00 – 12:00.*2h not logged/u });
      await expect(gap).toBeVisible();
      await expect(gap.getByText("Log", { exact: true })).toBeVisible();
      // A hairline between every two rows and none above the first (the web drops class names
      // on animated views, so this is checked where it is drawn).
      const borders = await page
        .getByTestId("day-entry")
        .evaluateAll((rows) => rows.map((row) => getComputedStyle(row).borderTopWidth));
      expect(borders.length).toBeGreaterThan(2);
      expect(borders[0]).toBe("0px");
      expect(borders.slice(1).filter((width) => width === "0px")).toEqual([]);
      await shoot(page, `day-gaps-${size.name}`, (name) => info.outputPath(name));
      await expectNoA11yViolations(page);
      await gap.click();
      await expect(page.getByRole("textbox", { name: "From" })).toHaveValue("10:00");
      await page
        .getByRole("button", { name: "Close" })
        .first()
        .click({ position: { x: 5, y: 5 } });
      await back.click();
      await expect(back).toHaveCount(0);
    });
  });
}
